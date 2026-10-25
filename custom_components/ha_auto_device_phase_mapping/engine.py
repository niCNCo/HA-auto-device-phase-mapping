"""Passive power-transition engine, with no device-control API calls."""

from __future__ import annotations

import asyncio
from collections import deque
from copy import deepcopy
from datetime import timedelta
import logging
import math
import time

from homeassistant.core import callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DEFAULT_SETTINGS, PHASES, VERSION, default_settings
from .correlation import classify, corrected_phase_power, estimated_phase_solar_watts, solar_allocation_decision

_LOGGER = logging.getLogger(__name__)


def valid_power(state):
    """Accept finite, real power sensors in W, not energy/current/forecasts."""
    if state is None or state.domain != "sensor":
        return None
    if (state.attributes.get("unit_of_measurement") != "W"
            or state.attributes.get("device_class") != "power"):
        return None
    try:
        number = float(state.state)
    except (ValueError, TypeError):
        return None
    return number if math.isfinite(number) else None


class PhaseEngine:
    """Learns likely phases only when a clean device-vs-P1 transition is observed."""

    def __init__(self, hass):
        self.hass = hass
        self.settings = default_settings()
        self.results: dict = {}
        self.candidates: dict = {}
        self.snapshots: dict = {}
        self.history = {phase: deque(maxlen=100) for phase in PHASES}
        self.pending: dict = {}
        self.recent_changes = deque(maxlen=200)
        self.last_observation = None
        self._display_breakdown = None
        self._solar_estimation_status = "disabled"
        self.ready = False
        # Storage format version unchanged for seamless migration from 1.0.0.
        self._store = Store(hass, 1, "ha_auto_device_phase_mapping.learning")
        self._listeners = []
        self._unsubs = []
        self._dirty = False
        self._last_save = time.monotonic()
        self._periodic_count = 0

    async def start(self):
        data = await self._store.async_load() or {}
        settings = data.get("settings", {})
        if isinstance(settings, dict):
            self.settings.update({k: v for k, v in settings.items() if k in DEFAULT_SETTINGS})
        source = self.settings.get("phase_sensors") or {}
        self.settings["phase_sensors"] = {p: str(source.get(p, "")) for p in PHASES}
        for key in ("grid_current_sensors", "grid_voltage_sensors"):
            values = self.settings.get(key) or {}
            self.settings[key] = {p: str(values.get(p) or "") for p in PHASES}
        try:
            interval = int(self.settings.get("dashboard_refresh_seconds", 2))
        except (TypeError, ValueError):
            interval = 2
        self.settings["dashboard_refresh_seconds"] = interval if interval in (1, 2, 5, 10, 30) else 2
        limits = self.settings.get("phase_current_limits_a") or {}
        self.settings["phase_current_limits_a"] = {
            p: float(limits.get(p, 25) or 25) for p in PHASES
        }
        battery = self.settings.get("battery_sensors") or {}
        self.settings["battery_sensors"] = {p: str(battery.get(p, "")) for p in PHASES}
        self.settings["solar_sensor"] = str(self.settings.get("solar_sensor") or "")
        # Old versions stored one battery per phase and one total solar sensor.
        # Migration preserves the equivalent source and signed power contribution.
        raw_bat = self.settings.get("battery_sources") or {}
        self.settings["battery_sources"] = {
            phase: self._normalize_sources(raw_bat.get(phase), self.settings["battery_discharge_positive"])
            or ([{"entity_id": self.settings["battery_sensors"][phase], "positive": self.settings["battery_discharge_positive"]}]
                if self.settings["battery_sensors"][phase] else [])
            for phase in PHASES
        }
        raw_solar = self.settings.get("solar_sources") or {}
        self.settings["solar_sources"] = {
            phase: self._normalize_sources(raw_solar.get(phase), self.settings["solar_production_positive"])
            or ([{"entity_id": self.settings["solar_sensor"], "positive": self.settings["solar_production_positive"]}]
                if phase == "TOTAL" and self.settings["solar_sensor"] else [])
            for phase in (*PHASES, "TOTAL")
        }
        # Store only configuration, never derived inverter readings. An older
        # installation defaults to the original equal split until opted in.
        self.settings["solar_phase_estimation"] = self._normalize_solar_estimation(
            self.settings.get("solar_phase_estimation"))
        # After migration, legacy fields are cleared to prevent duplicate source
        # insertion on the next restart; the new lists are authoritative.
        self.settings["battery_sensors"] = {p: "" for p in PHASES}
        self.settings["solar_sensor"] = ""
        overrides = self.settings.get("manual_assignments") or {}
        self.settings["manual_assignments"] = {
            entity_id: phase for entity_id, phase in overrides.items()
            if isinstance(entity_id, str) and phase in (*PHASES, "3-phase")
        }
        excluded = self.settings.get("excluded") or []
        self.settings["excluded"] = sorted({x for x in excluded if isinstance(x, str)})
        self.settings["minimum_change_w"] = min(2000, max(30, int(self.settings.get("minimum_change_w", 100))))
        self.results = data.get("results", {}) if isinstance(data.get("results"), dict) else {}
        self._refresh_candidates()
        self._seed_snapshots()
        self._unsubs.append(self.hass.bus.async_listen("state_changed", self._on_state))
        self._unsubs.append(async_track_time_interval(self.hass, self._tick, timedelta(seconds=1)))
        self._unsubs.append(async_track_time_interval(self.hass, self._periodic, timedelta(seconds=15)))
        self.ready = True
        self._notify()

    def stop(self):
        for unsubscribe in self._unsubs:
            unsubscribe()
        self._unsubs.clear()
        self._cancel_pending()
        self.ready = False

    async def save(self):
        await self._store.async_save({"settings": self.settings, "results": self.results})
        self._dirty = False
        self._last_save = time.monotonic()

    def register_summary(self, listener):
        self._listeners.append(listener)

        @callback
        def unsubscribe():
            if listener in self._listeners:
                self._listeners.remove(listener)

        return unsubscribe

    @callback
    def _notify(self):
        for listener in self._listeners:
            listener()

    def _refresh_candidates(self):
        source_ids = self._source_ids()
        candidates = {}
        for state in self.hass.states.async_all("sensor"):
            if (valid_power(state) is None or state.entity_id in source_ids
                    or state.entity_id.startswith(("sensor.automatic_ha_auto_device_phase_mapping_",
                                                    "sensor.ha_auto_device_phase_mapping_"))):
                continue
            candidates[state.entity_id] = {
                "entity_id": state.entity_id,
                "name": state.name,
            }
        if set(self.candidates) != set(candidates):
            self._dirty = True
        self.candidates = candidates

    def _seed_snapshots(self):
        now = time.monotonic()
        for state in self.hass.states.async_all("sensor"):
            value = valid_power(state)
            if value is not None:
                self.snapshots[state.entity_id] = (value, now)

    @callback
    def _on_state(self, event):
        entity_id = event.data.get("entity_id", "")
        if not entity_id.startswith("sensor."):
            return
        state = event.data.get("new_state")
        value = valid_power(state)
        if value is None:
            return
        now = time.monotonic()
        previous = self.snapshots.get(entity_id)
        self.snapshots[entity_id] = (value, now)
        if entity_id in self._source_ids():
            # Phase history is sampled atomically in _tick after applying all
            # corrections; never mix raw P1 values with corrected samples.
            return
        if entity_id not in self.candidates:
            self.candidates[entity_id] = {"entity_id": entity_id, "name": state.name}
        if (not previous or entity_id in self.settings["excluded"]
                or not self.settings["learning_enabled"]
                or not all(self.settings["phase_sensors"].values())):
            return
        before_value, before_time = previous
        change = value - before_value
        if abs(change) < self.settings["minimum_change_w"] or now - before_time < 0.08:
            return
        self.recent_changes.append((now, entity_id))
        if entity_id in self.pending:
            return
        baseline = {}
        for phase in PHASES:
            samples = [(stamp, watts) for stamp, watts in self.history[phase]
                       if now - 4.0 <= stamp <= now - 0.25]
            if not samples:
                return
            baseline[phase] = samples[-1][1]
        self.pending[entity_id] = self.hass.async_create_task(
            self._evaluate(entity_id, change, baseline, now, before_value)
        )

    async def _evaluate(self, entity_id, change, baseline, started, before_value):
        try:
            await asyncio.sleep(self.settings["window_seconds"])
            if entity_id in self.settings["excluded"] or not self.settings["learning_enabled"]:
                return
            now = time.monotonic()
            if any(
                other_id != entity_id and started - 1.0 <= stamp <= now
                for stamp, other_id in self.recent_changes
            ):
                # Other measured loads switched during the observation window.
                return
            # A device that switched back before window end is ambiguous.
            current = self.snapshots.get(entity_id)
            if current is None or abs(current[0] - (before_value + change)) > max(30, abs(change) * 0.25):
                return
            end = {}
            for phase in PHASES:
                samples = [(stamp, watts) for stamp, watts in self.history[phase]
                           if stamp >= started + 0.6]
                if not samples or now - samples[-1][0] > 3.0:
                    return
                end[phase] = samples[-1][1]
            observed = {p: end[p] - baseline[p] for p in PHASES}
            match = classify(change, observed, self.settings["tolerance_ratio"])
            if match is None:
                return
            phase, weight = match
            result = self.results.setdefault(
                entity_id,
                {"entity_id": entity_id, "scores": {p: 0.0 for p in (*PHASES, "3-phase")}, "events": 0},
            )
            scores = result.setdefault("scores", {p: 0.0 for p in (*PHASES, "3-phase")})
            scores[phase] = round(scores.get(phase, 0) + weight, 3)
            result["events"] = result.get("events", 0) + 1
            result["last_seen"] = dt_util.utcnow().isoformat()
            total = sum(scores.values())
            best = max((*PHASES, "3-phase"), key=lambda p: scores.get(p, 0))
            evidence = scores[best]
            # Heuristic evidence indicator; NOT a calibrated probability.
            result["confidence"] = round(100 * evidence / total * (1 - math.exp(-evidence / 4)), 1) if total else 0
            result["phase"] = best if result["events"] >= 3 and result["confidence"] >= 60 else "Unknown"
            self.last_observation = result["last_seen"]
            self._dirty = True
            self._notify()
        except asyncio.CancelledError:
            raise
        except Exception:
            _LOGGER.exception("Error correlating phase event for %s", entity_id)
        finally:
            self.pending.pop(entity_id, None)

    @staticmethod
    def _normalize_sources(items, default_positive=True):
        result = []
        for item in items if isinstance(items, list) else []:
            if isinstance(item, dict) and isinstance(item.get("entity_id"), str) and item["entity_id"]:
                result.append({"entity_id": item["entity_id"], "positive": bool(item.get("positive", default_positive))})
        return result

    @staticmethod
    def _normalize_solar_estimation(value):
        value = value if isinstance(value, dict) else {}
        return {
            "enabled": value.get("enabled") is True,
            "currents": {p: str((value.get("currents") or {}).get(p) or "") for p in PHASES},
            "voltages": {p: str((value.get("voltages") or {}).get(p) or "") for p in PHASES},
        }

    def _fresh_measurement(self, entity_id, utc_now, device_class, unit):
        if not entity_id:
            return None
        state = self.hass.states.get(entity_id)
        if (state is None or state.domain != "sensor"
                or state.attributes.get("device_class") != device_class
                or state.attributes.get("unit_of_measurement") != unit):
            return None
        try:
            value = float(state.state)
        except (ValueError, TypeError):
            return None
        # Signed P1 current is valid: negative values mean net grid export.
        # Voltage must remain nonnegative, while current headroom uses magnitude.
        if not math.isfinite(value) or (device_class != "current" and value < 0):
            return None
        reported = getattr(state, "last_reported", state.last_updated)
        if (utc_now - reported).total_seconds() > 12:
            return None
        return value

    def _valid_measurement_source(self, entity_id, device_class, unit):
        """Validate sensor identity/metadata, not its live age or numeric state.

        Settings must remain selectable when a valid HA sensor is temporarily
        unknown, unavailable, unchanged, or slow to report. Freshness is
        checked separately by _fresh_measurement when displaying live values.
        """
        state = self.hass.states.get(entity_id)
        return (state is not None and state.domain == "sensor"
                and state.attributes.get("device_class") == device_class
                and state.attributes.get("unit_of_measurement") == unit)

    def _solar_phase_shares(self, utc_now):
        """Estimate AC real-power shares via normalized apparent-power weights.

        The inverter's actual three-phase AC power fixes the total. V*I only
        supplies phase proportions; unequal phase power factors are unknown.
        """
        settings = self.settings["solar_phase_estimation"]
        if not settings["enabled"]:
            return {p: 1 / 3 for p in PHASES}
        apparent = {}
        for phase in PHASES:
            current = self._fresh_measurement(settings["currents"][phase], utc_now, "current", "A")
            voltage = self._fresh_measurement(settings["voltages"][phase], utc_now, "voltage", "V")
            if current is None or voltage is None or voltage < 100:
                return None
            apparent[phase] = voltage * current
        total = sum(apparent.values())
        if total < 1.0:
            return None
        return {phase: apparent[phase] / total for phase in PHASES}

    def _source_ids(self):
        estimate = self.settings["solar_phase_estimation"]
        return (set(self.settings["phase_sensors"].values())
                | {item["entity_id"] for group in ("battery_sources", "solar_sources")
                   for items in self.settings[group].values() for item in items}
                | set(estimate["currents"].values()) | set(estimate["voltages"].values())
                | set(self.settings["grid_current_sensors"].values())
                | set(self.settings["grid_voltage_sensors"].values())) - {""}

    def _fresh_watts(self, entity_id, utc_now):
        if not entity_id:
            return None
        state = self.hass.states.get(entity_id)
        value = valid_power(state)
        if value is None:
            return None
        # `last_reported` is updated even when the numerical value stays constant.
        # HA versions without last_reported fall back to last_updated.
        if (utc_now - getattr(state, "last_reported", state.last_updated)).total_seconds() > 12:
            return None
        return value

    async def _tick(self, _now):
        """Expose available grid and corrected values independently.

        Solar V*I fallback is for display ONLY when an active inverter's phase
        readings are unavailable. Never train the phase classifier on a fallback.
        """
        now = time.monotonic()
        utc_now = dt_util.utcnow()
        grid = {p: self._fresh_watts(entity_id, utc_now)
                for p, entity_id in self.settings["phase_sensors"].items()}
        # A stale P1 value is still useful to inspect but is not valid input
        # for compensated load or the learning engine.
        grid_display = {p: (grid[p] if grid[p] is not None else valid_power(
            self.hass.states.get(self.settings["phase_sensors"][p]))) for p in PHASES}

        def source_sum(items):
            total = 0.0
            for source in items:
                watts = self._fresh_watts(source["entity_id"], utc_now)
                if watts is None:
                    return None
                total += watts * (1 if source["positive"] else -1)
            return total

        batteries = {p: source_sum(self.settings["battery_sources"][p]) for p in PHASES}
        solar_direct = {p: source_sum(self.settings["solar_sources"][p]) for p in PHASES}
        solar_total = source_sum(self.settings["solar_sources"]["TOTAL"])
        total_configured = bool(self.settings["solar_sources"]["TOTAL"])
        estimation_enabled = bool(total_configured and self.settings["solar_phase_estimation"]["enabled"])
        # Do not sample inverter V*I when production is near zero; inverter
        # current sensors can remain unchanged for hours overnight.
        estimate = (self._solar_phase_shares(utc_now)
                    if estimation_enabled and solar_total is not None and abs(solar_total) > 10
                    else None)
        shares, self._solar_estimation_status, safe_for_learning = solar_allocation_decision(
            solar_total, estimation_enabled, estimate)
        solar_by_phase = (estimated_phase_solar_watts(solar_total, shares)
                          if solar_total is not None else None)
        if solar_by_phase is None:
            safe_for_learning = False

        breakdown = {}
        for phase in PHASES:
            solar = (solar_direct[phase] + solar_by_phase[phase]
                     if solar_direct[phase] is not None and solar_by_phase is not None
                     else None)
            cleaned = (grid[phase] + batteries[phase] + solar
                       if grid[phase] is not None and batteries[phase] is not None and solar is not None
                       else None)
            breakdown[phase] = {
                "grid": grid_display[phase], "battery": batteries[phase],
                "solar": solar, "cleaned": cleaned,
                "solar_share_percent": round(shares[phase] * 100, 1),
            }
            if cleaned is None:
                safe_for_learning = False
        self._display_breakdown = breakdown
        if not safe_for_learning:
            # Never append guessed/corrupted samples to learning history.
            # Ensure future transitions cannot compare pre-gap to post-gap data.
            self.history = {p: deque(maxlen=100) for p in PHASES}
            return
        for phase in PHASES:
            self.history[phase].append((now, breakdown[phase]["cleaned"]))

    async def _periodic(self, _now):
        self._periodic_count += 1
        if self._periodic_count % 4 == 0:
            self._refresh_candidates()
        self._notify()
        if self._dirty and time.monotonic() - self._last_save >= 60:
            await self.save()

    def export(self):
        """Small JSON payload consumed by panel and card."""
        self._refresh_candidates()
        excluded = set(self.settings["excluded"])
        rows = []
        for entity_id, item in self.candidates.items():
            evidence = self.results.get(entity_id, {})
            manual = self.settings["manual_assignments"].get(entity_id)
            rows.append({
                "manual": bool(manual),
                "entity_id": entity_id,
                "name": item["name"],
                "phase": manual or evidence.get("phase", "Unknown"),
                "confidence": evidence.get("confidence", 0),
                "events": evidence.get("events", 0),
                "scores": evidence.get("scores", {}),
                "last_seen": evidence.get("last_seen"),
                "excluded": entity_id in excluded,
                "power_w": self.snapshots.get(entity_id, (None,))[0],
            })
        rows.sort(key=lambda r: (r["excluded"], r["phase"] == "Unknown", -r["confidence"], r["name"].casefold()))
        phase_power = {}
        for phase, entity_id in self.settings["phase_sensors"].items():
            phase_power[phase] = self.snapshots.get(entity_id, (None,))[0]
        corrected = {phase: (self._display_breakdown or {}).get(phase, {}).get("cleaned") for phase in PHASES}
        now = dt_util.utcnow()
        headroom = {}
        for phase in PHASES:
            current_id = self.settings["grid_current_sensors"][phase]
            voltage_id = self.settings["grid_voltage_sensors"][phase]
            current = self._fresh_measurement(current_id, now, "current", "A")
            voltage = self._fresh_measurement(voltage_id, now, "voltage", "V")
            limit = self.settings["phase_current_limits_a"][phase]
            headroom[phase] = {
                "current": current,
                "voltage": voltage,
                "limit": limit,
                "remaining": max(0.0, limit - abs(current)) if current is not None else None,
                "utilization": round(100.0 * abs(current) / limit, 1) if current is not None else None,
            }
        return {
            "grid_headroom": headroom,
            "corrected_power": corrected,
            "power_breakdown": deepcopy(self._display_breakdown),
            "solar_estimation_status": self._solar_estimation_status,
            "version": VERSION,
            "ready": self.ready,
            "settings": deepcopy(self.settings),
            "devices": rows,
            "phase_power": phase_power,
            "last_observation": self.last_observation,
        }

    async def update_settings(self, payload):
        new_settings = deepcopy(self.settings)
        reset = bool(payload.get("reset"))
        if "phase_sensors" in payload:
            sources = payload["phase_sensors"]
            if set(sources) != set(PHASES):
                raise ValueError("L1, L2 and L3 must be provided")
            selected = [s for s in sources.values() if s]
            if len(selected) != len(set(selected)):
                raise ValueError("Select a different power sensor for each phase")
            for entity_id in selected:
                if valid_power(self.hass.states.get(entity_id)) is None:
                    raise ValueError(f"Not a valid live W power sensor: {entity_id}")
            new_settings["phase_sensors"] = sources
            if sources != self.settings["phase_sensors"]:
                # Phase meanings changed, so evidence would no longer be valid.
                reset = True
        for key, cls, unit in (("grid_current_sensors", "current", "A"),
                               ("grid_voltage_sensors", "voltage", "V")):
            if key in payload:
                sources = payload[key]
                if not isinstance(sources, dict) or set(sources) != set(PHASES):
                    raise ValueError(f"{key} requires L1/L2/L3")
                for entity in sources.values():
                    if entity and not self._valid_measurement_source(entity, cls, unit):
                        raise ValueError(f"Invalid {unit} sensor or unit: {entity}. Select a sensor with device class {cls} and unit {unit}.")
                new_settings[key] = dict(sources)
        if "phase_current_limits_a" in payload:
            limits = payload["phase_current_limits_a"]
            if not isinstance(limits, dict) or set(limits) != set(PHASES):
                raise ValueError("Phase current limits require L1/L2/L3")
            for value in limits.values():
                if type(value) not in (int, float) or not math.isfinite(value) or not 1 <= value <= 125:
                    raise ValueError("Phase current limits must be between 1 and 125 A")
            new_settings["phase_current_limits_a"] = {p: float(limits[p]) for p in PHASES}
        if "battery_sources" in payload or "solar_sources" in payload:
            all_new = {}
            for key, groups in (("battery_sources", PHASES), ("solar_sources", (*PHASES, "TOTAL"))):
                sources = payload.get(key, new_settings[key])
                if not isinstance(sources, dict) or set(sources) != set(groups):
                    raise ValueError(f"Invalid {key} phase groups")
                normalized = {}
                for phase in groups:
                    group = sources[phase]
                    if not isinstance(group, list) or len(group) > 25:
                        raise ValueError(f"Invalid source list for {phase}")
                    if any(not isinstance(item, dict) or type(item.get("positive")) is not bool
                           or not isinstance(item.get("entity_id"), str) for item in group):
                        raise ValueError("Sources must have an entity_id and a boolean positive setting")
                    normalized[phase] = self._normalize_sources(group)
                    for item in normalized[phase]:
                        if valid_power(self.hass.states.get(item["entity_id"])) is None:
                            raise ValueError(f"Not a valid W power sensor: {item['entity_id']}")
                        if item["entity_id"] in all_new:
                            raise ValueError(f"Duplicate compensation source: {item['entity_id']}")
                        all_new[item["entity_id"]] = key
                new_settings[key] = normalized
                if normalized != self.settings[key]:
                    reset = True
            # Legacy fields must not accidentally re-add sources after an upgrade.
            new_settings["battery_sensors"] = {p: "" for p in PHASES}
            new_settings["solar_sensor"] = ""
        if "solar_phase_estimation" in payload:
            new_est = self._normalize_solar_estimation(payload["solar_phase_estimation"])
            if new_est["enabled"]:
                selected = list(new_est["currents"].values()) + list(new_est["voltages"].values())
                if not all(selected) or len(selected) != len(set(selected)):
                    raise ValueError("Choose six different SolarEdge phase current and voltage sensors")
                for phase in PHASES:
                    for kind, device_class, unit in (("currents", "current", "A"), ("voltages", "voltage", "V")):
                        entity_id = new_est[kind][phase]
                        if not self._valid_measurement_source(entity_id, device_class, unit):
                            raise ValueError(f"SolarEdge {phase} {kind} is not a {unit} sensor: {entity_id}")
            if new_est != self.settings["solar_phase_estimation"]:
                reset = True
            new_settings["solar_phase_estimation"] = new_est
        if "manual_assignments" in payload:
            overrides = payload["manual_assignments"]
            if (not isinstance(overrides, dict) or len(overrides) > 5000
                    or any(not isinstance(k, str) or not k.startswith("sensor.")
                           or v not in (*PHASES, "3-phase") for k, v in overrides.items())):
                raise ValueError("Invalid manual phase assignments")
            new_settings["manual_assignments"] = dict(overrides)
        if "battery_sensors" in payload:
            battery = payload["battery_sensors"]
            if set(battery) != set(PHASES):
                raise ValueError("Battery sensors must specify L1, L2 and L3")
            selected = [v for v in battery.values() if v]
            if len(selected) != len(set(selected)):
                raise ValueError("Battery correction sensors must be distinct")
            for entity_id in selected:
                if valid_power(self.hass.states.get(entity_id)) is None:
                    raise ValueError(f"Not a valid live W battery sensor: {entity_id}")
            new_settings["battery_sensors"] = battery
            if battery != self.settings["battery_sensors"]:
                reset = True
        if "solar_sensor" in payload:
            solar_id = payload["solar_sensor"]
            if solar_id and valid_power(self.hass.states.get(solar_id)) is None:
                raise ValueError(f"Not a valid live W solar sensor: {solar_id}")
            new_settings["solar_sensor"] = solar_id
            if solar_id != self.settings["solar_sensor"]:
                reset = True
        for key in ("battery_discharge_positive", "solar_production_positive"):
            if key in payload:
                new_settings[key] = payload[key]
                if payload[key] != self.settings[key]:
                    reset = True
        all_sources = ([x for x in new_settings["phase_sensors"].values() if x]
                       + [x for x in new_settings["battery_sensors"].values() if x]
                       + ([new_settings["solar_sensor"]] if new_settings["solar_sensor"] else [])
                       + [item["entity_id"] for group in ("battery_sources", "solar_sources")
                          for items in new_settings[group].values() for item in items])
        if new_settings["solar_phase_estimation"]["enabled"]:
            est = new_settings["solar_phase_estimation"]
            auxiliaries = list(est["currents"].values()) + list(est["voltages"].values())
            if any(entity in all_sources for entity in auxiliaries):
                raise ValueError("Solar phase current/voltage sources cannot also be selected as power sources")
        grid_aux = [entity for key in ("grid_current_sensors", "grid_voltage_sensors")
                    for entity in new_settings[key].values() if entity]
        if len(grid_aux) != len(set(grid_aux)):
            raise ValueError("Grid current/voltage sensors must be distinct")
        if len(all_sources) != len(set(all_sources)):
            raise ValueError("Each measurement source must be a distinct entity")
        if "excluded" in payload:
            values = payload["excluded"]
            if len(values) > 5000 or any(not item.startswith("sensor.") for item in values):
                raise ValueError("Exclusions must be sensor entity IDs")
            new_settings["excluded"] = sorted(set(values))
        if "dashboard_refresh_seconds" in payload:
            value = payload["dashboard_refresh_seconds"]
            if type(value) is not int or value not in (1, 2, 5, 10, 30):
                raise ValueError("Dashboard refresh must be 1, 2, 5, 10 or 30 seconds")
            new_settings["dashboard_refresh_seconds"] = value
        for key in ("learning_enabled", "minimum_change_w"):
            if key in payload:
                new_settings[key] = payload[key]
        # Only phase/compensation model changes can invalidate sampled history.
        # Current/voltage/limits, exclusions and learning options must not clear it.
        measurement_changed = any(
            new_settings[key] != self.settings[key] for key in (
                "phase_sensors", "battery_sensors", "solar_sensor",
                "battery_discharge_positive", "solar_production_positive",
                "battery_sources", "solar_sources", "solar_phase_estimation"
            )
        )
        self.settings = new_settings
        if reset:
            # Keep previous evidence in a recoverable archive in the same storage file.
            archive = self.settings.setdefault("evidence_archive", [])
            archive.append({"time": dt_util.utcnow().isoformat(), "results": deepcopy(self.results)})
            self.settings["evidence_archive"] = archive[-5:]
            self.results = {}
        if measurement_changed:
            self._cancel_pending()
            self.history = {p: deque(maxlen=100) for p in PHASES}
            self._display_breakdown = None
            self._solar_estimation_status = "disabled"
        for entity_id in self._source_ids():
            self.candidates.pop(entity_id, None)
        self._refresh_candidates()
        await self.save()
        self._notify()

    def _cancel_pending(self):
        for task in list(self.pending.values()):
            task.cancel()
        self.pending.clear()
