"""Passive power-transition engine, with no device-control API calls."""

from __future__ import annotations

import asyncio
from bisect import bisect_left
from collections import deque, Counter
from copy import deepcopy
from datetime import timedelta
import re
import logging
import math
import time

from homeassistant.core import callback
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DEFAULT_SETTINGS, PHASES, VERSION, default_settings
from .correlation import classify, corrected_phase_power, estimated_phase_solar_watts, solar_allocation_decision

_LOGGER = logging.getLogger(__name__)

# Bounded persistence of tentative delayed-sensor matches. Real Unix timestamps
# are essential: time.monotonic() values are not meaningful after a reboot.
SLOW_VOTE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60
SLOW_VOTE_MAX_DEVICES = 500
SLOW_VOTE_MAX_PER_DEVICE = 12
LEVEL_HINT_MAX_PER_DEVICE = 12
PENDING_TRANSITIONS_MAX_PER_DEVICE = 256
WORKER_STALL_SECONDS = 45
# Display-only icons: standard Home Assistant Material Design Icon names.
MDI_ICON_PATTERN = re.compile(r"^mdi:[a-z0-9][a-z0-9-]{0,79}$")


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
        self.history = {phase: deque(maxlen=1800) for phase in PHASES}
        self.pending: dict = {}  # One owning worker task per power sensor.
        self.pending_since = {}  # Monotonic worker-start time; diagnostic only.
        self.pending_last_progress = {}  # Updated on each completed evaluation.
        self._worker_inflight = {}  # Owning worker current uncompleted transition.
        self._worker_recoveries = Counter()  # Backoff and diagnostics for failed devices.
        self._worker_recovery_due = {}  # Throttle retries after repeated worker failures.
        # A sensor can report another power change before its previous evaluation
        # has completed. Keep a bounded FIFO instead of silently losing that event.
        self.queued_transitions = {}
        # Recent device readings, independent of accepted phase evidence.
        # Slow/polled sensors may reflect a state from minutes earlier.
        self.device_reports = {}
        self.sensor_cadence = {}  # intervals between changing values (used by learning)
        # Separate, factual HA report cadence. No guessing from sensor value changes.
        # Ephemeral by design: show unavailable until new reports arrive after restart.
        self.sensor_report_seen = {}
        self.sensor_refresh_intervals = {}
        self._report_monitor_since = dt_util.utcnow().timestamp()
        self.slow_votes = {}  # tentative, persisted separately from accepted phase evidence
        self.level_hints = {}  # weak load-feasibility hints; NEVER train the classifier
        self.recent_changes = deque(maxlen=200)
        self.last_observation = None
        # Since-restart diagnostics remain ephemeral; accepted and tentative
        # learning evidence are persisted independently.
        self.diagnostics = Counter()
        self.device_diagnostics = {}
        self.history_status = {"ready": False, "reason": "Waiting for first valid samples", "samples": {p: 0 for p in PHASES}}
        self._last_unready_reason = None
        self._display_breakdown = None
        self._solar_estimation_status = "disabled"
        self._night_solar_fallback_active = False
        self.ready = False
        # Storage format version unchanged for seamless migration from 1.0.0.
        self._store = Store(hass, 1, "ha_auto_device_phase_mapping.learning")
        self._listeners = []
        self._unsubs = []
        self._dirty = False
        self._last_save = time.monotonic()
        self._save_lock = asyncio.Lock()  # Keep periodic checkpoints and UI edits ordered.
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
        self.settings["manual_devices"] = self._normalize_manual_devices(self.settings.get("manual_devices"))
        aliases = self.settings.get("display_names") or {}
        self.settings["display_names"] = {
            key: value.strip() for key, value in aliases.items()
            if isinstance(key, str) and key.startswith("sensor.")
            and isinstance(value, str) and 0 < len(value.strip()) <= 100
        } if isinstance(aliases, dict) else {}
        raw_icons = self.settings.get("display_icons") or {}
        self.settings["display_icons"] = {
            key: icon for key, icon in raw_icons.items()
            if isinstance(key, str) and key.startswith("sensor.")
            and isinstance(icon, str) and MDI_ICON_PATTERN.fullmatch(icon)
        } if isinstance(raw_icons, dict) else {}
        modes = self.settings.get("timing_overrides") or {}
        self.settings["timing_overrides"] = {k: v for k, v in modes.items()
                                             if isinstance(k, str) and k.startswith("sensor.")
                                             and v in ("fast", "slow")}
        overrides = self.settings.get("manual_assignments") or {}
        self.settings["manual_assignments"] = {
            entity_id: phase for entity_id, phase in overrides.items()
            if isinstance(entity_id, str) and phase in (*PHASES, "3-phase")
        }
        excluded = self.settings.get("excluded") or []
        self.settings["excluded"] = sorted({x for x in excluded if isinstance(x, str)})
        self.settings["minimum_change_w"] = min(2000, max(30, int(self.settings.get("minimum_change_w", 100))))
        self.results = data.get("results", {}) if isinstance(data.get("results"), dict) else {}
        self.slow_votes = self._deserialize_slow_votes(data.get("slow_votes"))
        self.level_hints = self._deserialize_level_hints(data.get("level_hints"))
        # One-time upgrade of the former 100 W factory threshold. Once migrated,
        # a user's deliberate 100 W selection will remain untouched on restart.
        if not self.settings.get("learning_155_migrated", False):
            if self.settings["minimum_change_w"] == 100:
                self.settings["minimum_change_w"] = 50
            self.settings["learning_155_migrated"] = True
            self._dirty = True
        for result in self.results.values():
            if isinstance(result, dict) and result.get("events"):
                self._recalculate_result(result)
        # Immediately re-evaluate saved tentative matches under the new
        # one-direction rule. Users should not need to switch a slow Zigbee
        # appliance another dozen times just because they upgraded Home Assistant.
        self._promote_saved_one_direction_votes()
        self._refresh_candidates()
        self._seed_snapshots()
        self._unsubs.append(self.hass.bus.async_listen("state_changed", self._on_state))
        self._unsubs.append(async_track_time_interval(self.hass, self._tick, timedelta(seconds=1)))
        self._unsubs.append(async_track_time_interval(self.hass, self._periodic, timedelta(seconds=15)))
        # Clean core restart: flush tentative matches even if the next periodic
        # checkpoint has not yet occurred. Config-entry unload also calls save().
        self._unsubs.append(self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, self._on_hass_stopping))
        self.ready = True
        self._notify()

    def stop(self):
        for unsubscribe in self._unsubs:
            unsubscribe()
        self._unsubs.clear()
        self._cancel_pending()
        self.ready = False

    async def _on_hass_stopping(self, _event):
        """Flush accumulated tentative matches on a normal HA restart."""
        await self.save()

    @staticmethod
    def _deserialize_slow_votes(saved, now_epoch=None):
        """Restore only recent, well-formed votes; old stores have no votes.

        Each vote is (phase, direction, Unix timestamp, quality). Never restore
        monotonic timestamps, which become invalid when Home Assistant restarts.
        """
        now_epoch = time.time() if now_epoch is None else now_epoch
        restored = {}
        if not isinstance(saved, dict):
            return restored
        for entity_id, items in list(saved.items())[:SLOW_VOTE_MAX_DEVICES]:
            if not isinstance(entity_id, str) or not entity_id.startswith("sensor.") or not isinstance(items, list):
                continue
            valid = deque(maxlen=SLOW_VOTE_MAX_PER_DEVICE)
            for item in items[-SLOW_VOTE_MAX_PER_DEVICE:]:
                if not isinstance(item, dict):
                    continue
                phase, direction = item.get("phase"), item.get("direction")
                timestamp, weight = item.get("timestamp"), item.get("weight")
                if (phase not in PHASES or type(direction) is not int or direction not in (-1, 1)
                        or type(timestamp) not in (int, float) or type(weight) not in (int, float)):
                    continue
                if (not math.isfinite(timestamp) or not math.isfinite(weight)
                        or not now_epoch - SLOW_VOTE_MAX_AGE_SECONDS <= timestamp <= now_epoch + 30
                        or not 0.1 <= weight <= 1.0):
                    continue
                valid.append((phase, direction, float(timestamp), float(weight)))
            if valid:
                restored[entity_id] = valid
        return restored

    def _serialize_slow_votes(self):
        """Serialize bounded, recent tentative matches alongside learned scores."""
        now = time.time()
        serialized = {}
        for entity_id, votes in list(self.slow_votes.items())[:SLOW_VOTE_MAX_DEVICES]:
            retained = [v for v in votes if now - SLOW_VOTE_MAX_AGE_SECONDS <= v[2] <= now + 30]
            if retained:
                serialized[entity_id] = [
                    {"phase": phase, "direction": direction, "timestamp": stamp, "weight": quality}
                    for phase, direction, stamp, quality in retained[-SLOW_VOTE_MAX_PER_DEVICE:]
                ]
        return serialized

    @staticmethod
    def _deserialize_level_hints(saved, now_epoch=None):
        """Load recent provisional phase hints; old storage has none."""
        now_epoch = time.time() if now_epoch is None else now_epoch
        restored = {}
        if not isinstance(saved, dict):
            return restored
        for entity_id, items in list(saved.items())[:SLOW_VOTE_MAX_DEVICES]:
            if not isinstance(entity_id, str) or not entity_id.startswith("sensor.") or not isinstance(items, list):
                continue
            valid = deque(maxlen=LEVEL_HINT_MAX_PER_DEVICE)
            for item in items[-LEVEL_HINT_MAX_PER_DEVICE:]:
                if not isinstance(item, dict):
                    continue
                phase, timestamp = item.get("phase"), item.get("timestamp")
                if (phase not in PHASES or type(timestamp) not in (int, float)
                        or not math.isfinite(timestamp)
                        or not now_epoch - SLOW_VOTE_MAX_AGE_SECONDS <= timestamp <= now_epoch + 30):
                    continue
                valid.append((phase, float(timestamp)))
            if valid:
                restored[entity_id] = valid
        return restored

    def _serialize_level_hints(self):
        now = time.time()
        return {
            eid: [{"phase": phase, "timestamp": stamp}
                  for phase, stamp in list(votes)[-LEVEL_HINT_MAX_PER_DEVICE:]
                  if now - SLOW_VOTE_MAX_AGE_SECONDS <= stamp <= now + 30]
            for eid, votes in list(self.level_hints.items())[:SLOW_VOTE_MAX_DEVICES]
            if any(now - SLOW_VOTE_MAX_AGE_SECONDS <= stamp <= now + 30 for _, stamp in votes)
        }

    def _record_level_hint(self, entity_id, phase, timestamp=None):
        """Keep independently timed, weak clues; these can NEVER be accepted observations."""
        timestamp = time.time() if timestamp is None else timestamp
        hints = self.level_hints.setdefault(entity_id, deque(maxlen=LEVEL_HINT_MAX_PER_DEVICE))
        # One long compressor run must not manufacture many independent clues.
        if hints and timestamp - hints[-1][1] < 75:
            return False
        hints.append((phase, timestamp))
        self._dirty = True
        self._diag("load_feasibility_hint", entity_id, f"Cleaned load supports {phase}; not proof")
        return True

    def _consider_level_hint(self, entity_id, device_watts, previous_watts=None):
        """Check whether *one* physical phase can carry a reported ON load.

        This is deliberately tentative. Asynchronously polled devices can be
        stale: an apparently matching instantaneous load is NOT a real phase
        correlation. Only repeated, well-separated clues are displayed.
        """
        if device_watts < max(400, self.settings["minimum_change_w"] * 3):
            return
        # Prefer distinct OFF -> ON cycles, not two fluctuations during a
        # single compressor run. This clue is still never accepted evidence.
        if previous_watts is not None and previous_watts > max(200, device_watts * .35):
            return
        if not self.history_status["ready"]:
            return
        now = time.monotonic()
        medians = {}
        for phase in PHASES:
            recent = [watts for stamp, watts in self.history[phase] if now - 12 <= stamp <= now]
            if len(recent) < 5:
                return
            sorted_values = sorted(recent)
            medians[phase] = sorted_values[len(sorted_values) // 2]
        can_support = [p for p in PHASES if medians[p] >= device_watts * .85]
        if len(can_support) != 1:
            return
        best = can_support[0]
        if any(medians[p] > device_watts * .55 for p in PHASES if p != best):
            return
        self._record_level_hint(entity_id, best)

    def _phase_hint(self, entity_id):
        """Expose repeatable, unconfirmed hints without altering phase assignment."""
        votes = list(self.slow_votes.get(entity_id, ()))
        levels = list(self.level_hints.get(entity_id, ()))
        all_phases = [phase for phase, *_ in votes] + [phase for phase, _ in levels]
        if len(all_phases) < 2:
            return None
        counts = Counter(all_phases)
        best, count = counts.most_common(1)[0]
        if count < 2 or count / len(all_phases) < .80:
            return None
        # At least two genuinely distinct historical events or independently
        # timed ON-load hints. No single sample may certify an electrical phase.
        event_times = [stamp for phase, _, stamp, _ in votes if phase == best]
        event_times += [stamp for phase, stamp in levels if phase == best]
        if len(set(int(stamp / 60) for stamp in event_times)) < 2:
            return None
        # Never show a provisional hint contradicting multiple already
        # accepted observations. Retain those observations unmodified.
        evidence = self.results.get(entity_id, {})
        if isinstance(evidence, dict) and evidence.get("events", 0) >= 2:
            scores = evidence.get("scores") or {}
            strongest = max((*PHASES, "3-phase"), key=lambda p: scores.get(p, 0))
            if strongest != best and scores.get(strongest, 0) > scores.get(best, 0):
                return None
        return {"phase": best, "clues": count, "step_matches": sum(v[0] == best for v in votes),
                "load_hints": sum(v[0] == best for v in levels),
                "confirmed": False}

    def _prune_slow_votes(self):
        """Expire aged candidate evidence while Home Assistant remains online."""
        now_epoch = time.time()
        changed = False
        for entity_id, votes in list(self.slow_votes.items()):
            recent = [v for v in votes if now_epoch - SLOW_VOTE_MAX_AGE_SECONDS <= v[2] <= now_epoch + 30]
            if len(recent) == len(votes):
                continue
            changed = True
            if recent:
                self.slow_votes[entity_id] = deque(recent, maxlen=SLOW_VOTE_MAX_PER_DEVICE)
            else:
                self.slow_votes.pop(entity_id, None)
        for entity_id, hints in list(self.level_hints.items()):
            recent = [v for v in hints if now_epoch - SLOW_VOTE_MAX_AGE_SECONDS <= v[1] <= now_epoch + 30]
            if len(recent) != len(hints):
                changed = True
                if recent:
                    self.level_hints[entity_id] = deque(recent, maxlen=LEVEL_HINT_MAX_PER_DEVICE)
                else:
                    self.level_hints.pop(entity_id, None)
        if changed:
            self._dirty = True
        return changed

    def _record_slow_vote(self, entity_id, phase, direction, monotonic_stamp, quality):
        """Save a tentative match using a timestamp that survives HA restarts."""
        # The recorded electrical transition may have preceded this evaluation.
        # Convert its monotonic sample timestamp into a real UTC epoch timestamp.
        now_epoch = time.time()
        timestamp = now_epoch - max(0.0, time.monotonic() - monotonic_stamp)
        votes = self.slow_votes.setdefault(entity_id, deque(maxlen=SLOW_VOTE_MAX_PER_DEVICE))
        current = [v for v in votes if now_epoch - SLOW_VOTE_MAX_AGE_SECONDS <= v[2] <= now_epoch + 30]
        if len(current) != len(votes):
            votes.clear()
            votes.extend(current)
        if any(v[0] == phase and v[1] == direction and abs(v[2] - timestamp) < 25 for v in votes):
            self._diag("slow_duplicate_step", entity_id, "Already counted this electrical transition")
            return None  # The same electrical step must not count twice.
        votes.append((phase, direction, timestamp, quality))
        self._dirty = True  # periodic checkpoint and normal shutdown both persist
        self._notify()
        return votes

    async def save(self):
        # Serialize periodic checkpoints and user settings writes. Without a
        # lock, an older slow storage operation can finish AFTER a newer one,
        # restoring obsolete names and mappings on the next HA restart.
        if not hasattr(self, "_save_lock"):
            self._save_lock = asyncio.Lock()
        async with self._save_lock:
            # Snapshot inside the lock, never before waiting for an earlier
            # save. Preserve changes observed during the storage await.
            payload = {"settings": deepcopy(self.settings), "results": deepcopy(self.results),
                       "slow_votes": self._serialize_slow_votes(),
                       "level_hints": self._serialize_level_hints()}
            self._dirty = False
            try:
                await self._store.async_save(payload)
            except Exception:
                self._dirty = True
                raise
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
        # A mapped power sensor must remain listed when Zigbee or another source
        # reports unavailable/unknown. Sensor metadata usually survives those
        # states, but also restore persisted phase assignments if the HA state
        # entity temporarily disappears altogether.
        remembered = {
            entity_id for entity_id, evidence in self.results.items()
            if isinstance(evidence, dict) and evidence.get("phase") in (*PHASES, "3-phase")
        }
        remembered.update(self.settings.get("manual_assignments", {}))
        for state in self.hass.states.async_all("sensor"):
            entity_id = state.entity_id
            if (entity_id in source_ids
                    or entity_id.startswith(("sensor.automatic_ha_auto_device_phase_mapping_",
                                             "sensor.ha_auto_device_phase_mapping_"))):
                continue
            if valid_power(state) is None and entity_id not in remembered:
                continue
            candidates[entity_id] = {"entity_id": entity_id, "name": state.name}
        for entity_id in remembered:
            if entity_id.startswith("sensor.") and entity_id not in source_ids and entity_id not in candidates:
                previous = self.candidates.get(entity_id, {})
                candidates[entity_id] = {
                    "entity_id": entity_id,
                    "name": previous.get("name") or entity_id.removeprefix("sensor.").replace("_", " ").title(),
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

    def _diag(self, reason, entity_id=None, detail=None):
        """Count actual learning attempts/rejections; no persistent-data mutation."""
        self.diagnostics[reason] += 1
        if entity_id:
            item = self.device_diagnostics.setdefault(entity_id, {"counts": Counter(), "last_reason": None, "last_detail": None})
            item["counts"][reason] += 1
            item["last_reason"] = reason
            item["last_detail"] = detail

    @callback
    def _on_state(self, event):
        entity_id = event.data.get("entity_id", "")
        if not entity_id.startswith("sensor."):
            return
        state = event.data.get("new_state")
        value = valid_power(state)
        if value is None:
            # Never reuse an old wattage after a device goes offline, or
            # interpret recovery as a genuine ON/OFF transition for learning.
            if entity_id not in self._source_ids():
                self.snapshots.pop(entity_id, None)
            return
        now = time.monotonic()
        previous = self.snapshots.get(entity_id)
        self.snapshots[entity_id] = (value, now)
        if previous and abs(value - previous[0]) > 0.5 and entity_id not in self._source_ids():
            intervals = self.sensor_cadence.setdefault(entity_id, deque(maxlen=12))
            if now - previous[1] >= 0.25:
                intervals.append(now - previous[1])
        if entity_id in self._source_ids():
            # Phase history is sampled atomically in _tick after applying all
            # corrections; never mix raw P1 values with corrected samples.
            return
        if entity_id not in self.candidates:
            self.candidates[entity_id] = {"entity_id": entity_id, "name": state.name}
        # Store a bounded 30-minute history of actual reported device levels.
        # This allows matching repeated ON/OFF states with an unknown lag.
        reports = self.device_reports.setdefault(entity_id, deque(maxlen=100))
        if not reports or now - reports[-1][0] >= 8 or abs(value - reports[-1][1]) >= 50:
            reports.append((now, value))
        while reports and now - reports[0][0] > 1800:
            reports.popleft()
        if (not previous or entity_id in self.settings["excluded"]
                or not self.settings["learning_enabled"]
                or not all(self.settings["phase_sensors"].values())):
            return
        before_value, before_time = previous
        change = value - before_value
        # Default 50 W change floor for low-power Zigbee heaters and variable
        # appliances. Retain a guarded below-threshold ON/OFF option.
        min_change = self.settings["minimum_change_w"]
        low_power_edge = (min_change <= 100 and
                          min(abs(value), abs(before_value)) <= 20 and
                          45 <= max(abs(value), abs(before_value)) <= 220 and
                          abs(change) >= max(40, min_change * .80))
        if abs(change) < min_change and not low_power_edge:
            return
        self._diag("transitions_detected", entity_id, f"{change:+.0f} W")
        if now - before_time < 0.08:
            self._diag("too_rapid", entity_id)
            return
        self.recent_changes.append((now, entity_id, change))
        # A device may report delayed/averaged power. A high load on only one
        # cleaned phase is a weak hint, never an automatic assignment.
        self._consider_level_hint(entity_id, value, before_value)
        transition = (change, now, before_time, before_value)
        owner = self.pending.get(entity_id)
        if owner is not None and getattr(owner, 'done', lambda: False)():
            # Completed task whose callback has not yet run: treat this as
            # worker recovery, not as a reason to keep queueing forever.
            self._worker_finished(entity_id, owner)
            owner = self.pending.get(entity_id)
        if owner is not None:
            self._queue_transition(entity_id, transition)
            return
        # Repair any abandoned FIFO first, preserving the chronological order.
        if self.queued_transitions.get(entity_id):
            self._queue_transition(entity_id, transition)
            self._drain_next(entity_id)
        else:
            if not self._start_transition(entity_id, transition):
                self._queue_transition(entity_id, transition)

    def _queue_transition(self, entity_id, transition, *, front=False):
        """Bounded FIFO. Preserve ON/OFF edges when compressing staged reports."""
        queue = self.queued_transitions.setdefault(
            entity_id, deque(maxlen=PENDING_TRANSITIONS_MAX_PER_DEVICE))
        if front:
            # Reinsert an interrupted in-flight event before the later reports.
            if queue and queue[0] == transition:
                return
            if len(queue) == queue.maxlen:
                queue.pop()  # Preserve the older, interrupted correlation first.
                self._diag('queue_full', entity_id, 'Newest queued event displaced during recovery')
            queue.appendleft(transition)
            self._diag('worker_transition_requeued', entity_id)
            return
        if queue:
            old_change, old_at, old_prev, old_value = queue[-1]
            change, at, prev, before_value = transition
            # A coffee maker may report 3 -> 664 -> 1421 W within seconds.
            # Merge those queued intermediate updates into the complete rise.
            # Never combine opposite directions or distinct ON/OFF cycles.
            if (change * old_change > 0 and 0 <= at - old_at <= 12
                    and 0 <= at - old_prev <= 15):
                queue[-1] = (old_change + change, at, old_prev, old_value)
                self._diag('queued_steps_combined', entity_id,
                           'Combined consecutive same-direction device reports')
                return
        if len(queue) >= queue.maxlen:
            queue.popleft()
            self._diag('queue_full', entity_id, 'Oldest unevaluated transition displaced')
        queue.append(transition)
        self._diag('queued_transition', entity_id, 'Waiting for device worker')

    def _transition_is_slow(self, entity_id):
        """Choose timing from measured REPORT cadence, not inactivity gaps."""
        intervals = self.sensor_cadence.get(entity_id) or ()
        measured = self.sensor_refresh_intervals.get(entity_id, ())
        mode = self.settings["timing_overrides"].get(entity_id, "auto")
        changed_interval = sorted(intervals)[len(intervals)//2] if len(intervals) >= 2 else 0
        refresh_interval = sorted(measured)[len(measured)//2] if len(measured) >= 2 else 0
        effective_interval = refresh_interval if len(measured) >= 2 else changed_interval
        return mode == "slow" or (mode == "auto" and effective_interval >= 25)

    def _start_transition(self, entity_id, transition, queued=False):
        """Give one worker exclusive ownership, independent of HA task timing."""
        if (not self.settings['learning_enabled'] or entity_id in self.settings['excluded']
                or not self.history_status.get('ready')):
            return False
        if time.monotonic() - transition[1] > 1790:
            self._diag('queue_expired', entity_id)
            return False
        if entity_id in self.pending:
            return False
        self._worker_inflight[entity_id] = transition
        # async_create_task may eagerly start the coroutine. The worker first
        # yields, so the ownership record is present before any evaluation.
        coroutine = self._run_transition_worker(entity_id, transition)
        try:
            task = self.hass.async_create_task(coroutine)
        except Exception:
            coroutine.close()
            self._worker_inflight.pop(entity_id, None)
            self._worker_recoveries[entity_id] += 1
            self._worker_recovery_due[entity_id] = time.monotonic() + min(30, 2 * self._worker_recoveries[entity_id])
            self._diag('worker_start_error', entity_id)
            _LOGGER.exception('Could not create phase learning worker for %s', entity_id)
            return False
        self.pending[entity_id] = task
        self.pending_since[entity_id] = time.monotonic()
        self.pending_last_progress[entity_id] = time.monotonic()
        if callable(getattr(task, 'add_done_callback', None)):
            task.add_done_callback(lambda finished, eid=entity_id: self._worker_finished(eid, finished))
        return True

    def _worker_finished(self, entity_id, task):
        """Task completion backstop, including cancellation before first run."""
        if self.pending.get(entity_id) is not task:
            return
        # If task stopped before completing its in-flight evaluation, keep it
        # as the oldest queued event. Replayed evidence is de-duplicated by
        # the electrical edge and the persisted slow-vote timestamp.
        inflight = self._worker_inflight.pop(entity_id, None)
        self.pending.pop(entity_id, None)
        self.pending_since.pop(entity_id, None)
        self.pending_last_progress.pop(entity_id, None)
        if inflight is not None:
            self._queue_transition(entity_id, inflight, front=True)
            self._diag('worker_unfinished_recovered', entity_id)
            # Repeated unexpectedly finished tasks must not cause an eager
            # callback/restart loop that monopolizes Home Assistant.
            self._worker_recoveries[entity_id] += 1
            self._worker_recovery_due[entity_id] = time.monotonic() + min(30, 2 * self._worker_recoveries[entity_id])
        if self.queued_transitions.get(entity_id):
            self._drain_next(entity_id)

    async def _run_transition_worker(self, entity_id, first):
        """Process a device's transitions serially; never orphan a FIFO."""
        await asyncio.sleep(0)  # Allow HA eager scheduling to register ownership.
        owner = asyncio.current_task()
        transition = first
        queued = False
        try:
            while transition is not None:
                self._worker_inflight[entity_id] = transition
                change, reported_at, previous_report, before_value = transition
                if (not self.settings['learning_enabled'] or entity_id in self.settings['excluded']):
                    self.queued_transitions.pop(entity_id, None)
                    self._worker_inflight.pop(entity_id, None)
                    break
                if not self.history_status.get('ready'):
                    self._diag('history_unavailable', entity_id)
                elif time.monotonic() - reported_at > 1790:
                    self._diag('queue_expired', entity_id)
                elif self._transition_is_slow(entity_id):
                    self._diag('evaluations_started', entity_id,
                               'Historical interval matching' + (' (queued)' if queued else ''))
                    await asyncio.wait_for(
                        self._evaluate_slow(entity_id, change, reported_at, previous_report),
                        timeout=WORKER_STALL_SECONDS - 5)
                else:
                    self._diag('evaluations_started', entity_id,
                               'Fast bidirectional timeline matching' + (' (queued)' if queued else ''))
                    await asyncio.wait_for(
                        self._evaluate_fast_timeline(entity_id, change, reported_at, before_value),
                        timeout=WORKER_STALL_SECONDS - 5)
                self._diag('evaluations_completed', entity_id)
                self._worker_recoveries.pop(entity_id, None)
                self._worker_recovery_due.pop(entity_id, None)
                self.pending_last_progress[entity_id] = time.monotonic()
                # Clear only after successful evaluation. A cancelled worker
                # retains this value so the next owner can retry that event.
                self._worker_inflight.pop(entity_id, None)
                queue = self.queued_transitions.get(entity_id)
                transition = queue.popleft() if queue else None
                if queue is not None and not queue:
                    self.queued_transitions.pop(entity_id, None)
                queued = True
        except asyncio.CancelledError:
            self._diag('worker_cancelled', entity_id)
            raise
        except asyncio.TimeoutError:
            self._diag('worker_timed_out', entity_id)
            self._worker_recoveries[entity_id] += 1
            self._worker_recovery_due[entity_id] = time.monotonic() + min(30, 2 * self._worker_recoveries[entity_id])
        except Exception:
            self._diag('worker_error', entity_id)
            self._worker_recoveries[entity_id] += 1
            self._worker_recovery_due[entity_id] = time.monotonic() + min(30, 2 * self._worker_recoveries[entity_id])
            _LOGGER.exception('Error processing learning queue for %s', entity_id)
        finally:
            # A watchdog or reset can replace ownership during a cancellation.
            if self.pending.get(entity_id) is owner:
                inflight = self._worker_inflight.pop(entity_id, None)
                self.pending.pop(entity_id, None)
                self.pending_since.pop(entity_id, None)
                self.pending_last_progress.pop(entity_id, None)
                if inflight is not None:
                    self._queue_transition(entity_id, inflight, front=True)
                if self.queued_transitions.get(entity_id):
                    self._drain_next(entity_id)

    def _drain_next(self, entity_id):
        """Start one worker for an orphaned FIFO without dropping valid events."""
        if not self.settings['learning_enabled'] or entity_id in self.settings['excluded']:
            self.queued_transitions.pop(entity_id, None)
            return
        if entity_id in self.pending or not self.history_status.get('ready'):
            return
        if time.monotonic() < self._worker_recovery_due.get(entity_id, 0):
            return
        queue = self.queued_transitions.get(entity_id)
        while queue:
            item = queue[0]
            if time.monotonic() - item[1] > 1790:
                queue.popleft()
                self._diag('queue_expired', entity_id)
                continue
            # Do not discard the event before knowing worker creation worked.
            if self._start_transition(entity_id, item, queued=True):
                queue.popleft()
                break
            self._worker_recovery_due[entity_id] = max(
                self._worker_recovery_due.get(entity_id, 0), time.monotonic() + 2)
            return
        if not queue:
            self.queued_transitions.pop(entity_id, None)

    def _watchdog_workers(self):
        """Independent, periodic recovery for orphaned or stalled device queues.

        Called by BOTH the 1-second corrected-history tick and the separate
        15-second maintenance timer, so inactivity never strands a queue.
        A failed task receives a bounded retry delay, not a busy-loop.
        """
        now = time.monotonic()
        for entity_id, task in list(self.pending.items()):
            if self.pending.get(entity_id) is not task:
                continue
            if getattr(task, 'done', lambda: False)():
                self._diag('watchdog_finished_task', entity_id)
                self._worker_finished(entity_id, task)
                continue
            last_progress = self.pending_last_progress.get(entity_id,
                             self.pending_since.get(entity_id, now))
            if now - last_progress <= WORKER_STALL_SECONDS:
                continue
            # Reschedule the unfinished event FIRST; guard the old worker's
            # late finally callback with the task-identity check.
            self._diag('watchdog_stalled_worker', entity_id,
                       f'No completed evaluation for {now-last_progress:.0f} seconds')
            inflight = self._worker_inflight.pop(entity_id, None)
            self.pending.pop(entity_id, None)
            self.pending_since.pop(entity_id, None)
            self.pending_last_progress.pop(entity_id, None)
            if inflight is not None:
                self._queue_transition(entity_id, inflight, front=True)
            task.cancel()
            self._worker_recoveries[entity_id] += 1
            # A short backoff is enough to stop repeated failures from
            # monopolizing the event loop while keeping auto recovery alive.
            self._worker_recovery_due[entity_id] = now + min(
                30, 2 * self._worker_recoveries[entity_id])
        for entity_id in list(self.queued_transitions):
            if entity_id in self.pending:
                continue
            if not self.queued_transitions.get(entity_id):
                self.queued_transitions.pop(entity_id, None)
                continue
            if not self.history_status.get('ready'):
                continue
            if now < self._worker_recovery_due.get(entity_id, 0):
                continue
            self._diag('watchdog_orphan_queue', entity_id,
                       'Queued events had no active learning worker')
            self._drain_next(entity_id)

    def _match_fast_timeline(self, change, reported_at, evaluated_at):
        """Correlate a fast (<25 s) device change against P1 BEFORE and AFTER its report.

        The corrected P1 edge can precede a 5-second HA sensor update or arrive
        a little later. Compare short, robust pre/post plateaus at common
        timestamps on all three phases. Never compare separate phase times,
        guess from load feasibility, or count the same electrical step twice.

        Returns (phase, quality, electrical_monotonic_time, phase_delta) or None.
        """
        if abs(change) < 30:
            return None
        # Broad enough for a sensor's five-second reporting cadence + P1 lag;
        # bounded to avoid matching unrelated household activity much later.
        first = reported_at - 12.0
        last = min(reported_at + 7.0, evaluated_at - 5.0)
        if last <= first:
            return None
        samples = {p: [(t, w) for t, w in self.history[p]
                       if first - 8 <= t <= last + 8] for p in PHASES}
        if any(len(samples[p]) < 8 for p in PHASES):
            return None
        stamps = {p: [t for t, _ in samples[p]] for p in PHASES}
        watts = {p: [w for _, w in samples[p]] for p in PHASES}

        def median_between(phase, low, high):
            lo = bisect_left(stamps[phase], low)
            hi = bisect_left(stamps[phase], high + 1e-6)
            chunk = sorted(watts[phase][lo:hi])
            return chunk[len(chunk) // 2] if len(chunk) >= 2 else None

        candidates = []
        # Prefer the shorter window for coffee-maker heating pulses that may
        # last only 5–8 seconds; wider windows help noisy, longer plateaus.
        plateaus = [(-3.5, -1.0, 1.0, 3.5), (-5.5, -2.0, 2.0, 5.5)]
        # Restrict candidate timestamps to real P1 sample times. A continuous
        # 1-second P1 stream yields ~20 candidates; no costly full-history scan.
        edges = [t for t in stamps['L1'] if first <= t <= last]
        for edge in edges:
            for before_start, before_end, after_start, after_end in plateaus:
                deltas = {}
                for phase in PHASES:
                    before = median_between(phase, edge + before_start, edge + before_end)
                    after = median_between(phase, edge + after_start, edge + after_end)
                    if before is None or after is None:
                        break
                    deltas[phase] = after - before
                if len(deltas) != len(PHASES):
                    continue
                classified = classify(change, deltas, self.settings.get('tolerance_ratio', .30))
                if classified is None:
                    continue
                phase, quality = classified
                if phase not in (*PHASES, '3-phase'):
                    continue
                phase_delta = (deltas[phase] if phase in PHASES
                               else sum(deltas.values()))
                # Magnitude agreement is critical: a nearby unrelated step
                # with the same direction should score below a true match.
                mismatch = abs(phase_delta - change) / max(abs(change), 75.0)
                if mismatch > .33:
                    continue
                # Strong correlations win; prefer smaller lag only as tie-breaker.
                closeness = max(0.0, 1.0 - abs(edge - reported_at) / 22.0)
                rank = quality * .83 + closeness * .17
                candidates.append((rank, quality, phase, edge, phase_delta))
        if not candidates:
            return None
        candidates.sort(reverse=True, key=lambda v: v[0])
        best = candidates[0]
        # Two different, nearly equally convincing electrical steps inside
        # one device-reporting window are ambiguous. Nearby sliding-window
        # detections of the same P1 step are NOT separate candidates.
        for other in candidates[1:]:
            if (other[0] >= best[0] - .07
                    and (other[2] != best[2] or abs(other[3] - best[3]) > 6)):
                return None
        _, quality, phase, edge, delta = best
        return phase, quality, edge, delta

    def _fast_episode_change(self, entity_id, change, reported_at, before_value):
        """Recognize one large heating pulse from staged fast sensor reports.

        A plug can publish 3 -> 664 -> 1421 W as two +661/+757 W events,
        while L1 correctly makes one +1450 W transition. Only try the NET
        rise after a known idle state; competing phase measurements must still
        confirm the result. The matcher deduplicates the electrical edge.
        """
        if before_value is None or not math.isfinite(before_value):
            return None
        if not (change > 200 and abs(before_value) <= 80):
            return None
        reports = self.device_reports.get(entity_id, ())
        highest = before_value + change
        for stamp, level in reports:
            if reported_at - .25 <= stamp <= reported_at + 10.0:
                highest = max(highest, level)
        net = highest - before_value
        if highest < 500 or net < 500 or net <= change * 1.20:
            return None
        return net

    def _fast_edge_seen(self, entity_id, phase, electrical_time):
        """Protect fast evidence against duplicate HA reports of the same P1 edge."""
        now_epoch = time.time()
        electrical_epoch = now_epoch - max(0.0, time.monotonic() - electrical_time)
        result = self.results.get(entity_id) or {}
        previous = result.get('accepted_edges') or []
        return any(isinstance(v, dict) and v.get('phase') == phase
                   and abs(float(v.get('time', 0)) - electrical_epoch) < 10
                   for v in previous)

    async def _evaluate_fast_timeline(self, entity_id, change, reported_at, before_value=None):
        """Await future P1 samples, then search both sides of a fast HA report.

        A queued report keeps its ORIGINAL timestamp. Do not reject a valid
        previous coffee heating pulse just because the appliance changed again
        before the evaluation ran; its P1 step remains in history.
        """
        try:
            # +7 s for a lagged P1 edge, and +5 s for its post-edge plateau.
            # An already-queued event generally has these samples immediately.
            remaining = reported_at + 12.0 - time.monotonic()
            if remaining > 0:
                await asyncio.sleep(remaining)
            if entity_id in self.settings['excluded'] or not self.settings['learning_enabled']:
                self._diag('excluded_or_paused', entity_id)
                return
            if not self.history_status.get('ready'):
                self._diag('history_unavailable', entity_id,
                           'Corrected P1 history unavailable for fast timeline')
                return
            match = self._match_fast_timeline(change, reported_at, time.monotonic())
            credited_change = change
            composite = self._fast_episode_change(entity_id, change, reported_at, before_value)
            if composite is not None:
                whole_pulse = self._match_fast_timeline(composite, reported_at, time.monotonic())
                if whole_pulse is not None:
                    if match is not None and match[0] != whole_pulse[0]:
                        # Conflicting phases, even when the composite is strong.
                        self._diag('fast_episode_ambiguous', entity_id,
                                   'Individual and complete heating changes prefer different phases')
                        return
                    # A partial device rise (e.g. +1088 W) might already match
                    # the full +1360 W P1 step at LOW quality. Use the complete
                    # 1384 W episode instead when it fits much better.
                    if match is None or whole_pulse[1] > match[1] + .08:
                        match = whole_pulse
                        credited_change = composite
                        self._diag('fast_episode_match', entity_id,
                                   f'Aggregated staged device rise {change:+.0f} W into {composite:+.0f} W')
            if match is None:
                self._diag('fast_timeline_no_match', entity_id,
                           f'No unambiguous P1 step within -12/+7 s of {change:+.0f} W report')
                return
            phase, quality, step_time, delta = match
            if self._fast_edge_seen(entity_id, phase, step_time):
                self._diag('fast_timeline_duplicate', entity_id,
                           f'{phase} electrical step already credited')
                return
            # Other HA sensors sometimes independently mirror the same load;
            # they are not grounds for rejecting an otherwise isolated phase
            # step. Competing PHASE changes are explicitly checked by classify.
            lag = reported_at - step_time
            self._diag('fast_timeline_match', entity_id,
                       f'{phase}: device {credited_change:+.0f} W, P1 {delta:+.0f} W; '
                       f'P1 edge {lag:+.1f} s before HA report (negative = after)')
            event_epoch = time.time() - max(0.0, time.monotonic() - step_time)
            self._accept_match(entity_id, phase, quality, credited_change,
                               'fast_timeline', event_time=event_epoch)
        except asyncio.CancelledError:
            raise
        except Exception:
            self._diag('error', entity_id)
            _LOGGER.exception('Error evaluating fast timeline for %s', entity_id)

    async def _evaluate(self, entity_id, change, baseline, started, before_value):
        try:
            await asyncio.sleep(self.settings["window_seconds"])
            if entity_id in self.settings["excluded"] or not self.settings["learning_enabled"]:
                self._diag("excluded_or_paused", entity_id)
                return
            now = time.monotonic()
            if any(
                item[1] != entity_id and started - 1.0 <= item[0] <= now
                # A tiny smart-plug fluctuation shouldn't veto a unique
                # multi-kW charging step on another phase. Small devices keep
                # the original strict overlap rule.
                and (abs(change) < 1500 or len(item) < 3
                     or abs(item[2]) > max(150, abs(change) * .12))
                for item in self.recent_changes
            ):
                self._diag("overlapping_changes", entity_id)
                return
            # A device that switched back before window end is ambiguous.
            current = self.snapshots.get(entity_id)
            if current is None or abs(current[0] - (before_value + change)) > max(30, abs(change) * 0.25):
                self._diag("unstable_device", entity_id)
                return
            end = {}
            for phase in PHASES:
                samples = [(stamp, watts) for stamp, watts in self.history[phase]
                           if stamp >= started + 0.6]
                if not samples or now - samples[-1][0] > 3.0:
                    self._diag("missing_end_sample", entity_id, f"No valid corrected-power sample for {phase} after transition")
                    return
                end[phase] = samples[-1][1]
            observed = {p: end[p] - baseline[p] for p in PHASES}
            match = classify(change, observed, self.settings["tolerance_ratio"])
            if match is None:
                # HA events may arrive 1-12 seconds AFTER the P1 has already
                # seen a fast, high-power step. A fixed baseline would miss
                # it completely. Use independently verified 3-phase history,
                # but require repeated opposite-direction matches before
                # treating retrospective matches as accepted evidence.
                old_step = (self._match_delayed_step(change, started - 12, now)
                            if abs(change) >= 700 and hasattr(self, '_match_delayed_step') else None)
                if old_step is not None:
                    _, phase, stamp, _, quality = old_step
                    votes = self._record_slow_vote(entity_id, phase, 1 if change > 0 else -1, stamp, quality)
                    if votes is not None:
                        self._diag("fast_lagged_step", entity_id, f"Strong {phase} {change:+.0f} W seen just before HA update")
                        if hasattr(self, '_promote_slow_votes'):
                            self._promote_slow_votes(entity_id, phase, votes, change)
                    return
                self._diag("poor_correlation", entity_id, f"Device {change:+.0f} W; phases " + ", ".join(f"{p} {observed[p]:+.0f} W" for p in PHASES))
                return
            phase, weight = match
            self._accept_match(entity_id, phase, weight, change, "fast")
        except asyncio.CancelledError:
            raise
        except Exception:
            self._diag("error", entity_id)
            _LOGGER.exception("Error correlating phase event for %s", entity_id)

    def _accept_match(self, entity_id, phase, weight, change, mode, event_time=None):
        """Only accepted correlations affect persisted phase confidence."""
        self._diag("accepted", entity_id, f"{mode} {phase}: {change:+.0f} W")
        result = self.results.setdefault(
            entity_id, {"entity_id": entity_id, "scores": {p: 0.0 for p in (*PHASES, "3-phase")}, "events": 0})
        scores = result.setdefault("scores", {p: 0.0 for p in (*PHASES, "3-phase")})
        scores[phase] = round(scores.get(phase, 0) + weight, 3)
        result["events"] = result.get("events", 0) + 1
        result["last_seen"] = dt_util.utcnow().isoformat()
        total = sum(scores.values())
        best = max((*PHASES, "3-phase"), key=lambda p: scores.get(p, 0))
        evidence = scores[best]
        # Strong agreeing measurements should converge within a few independent
        # events, not require dozens of device cycles. The phase-share factor
        # still penalizes contradictory accepted observations.
        result["confidence"] = round(100 * evidence / total * (1 - math.exp(-evidence / 1.55)), 1) if total else 0
        edge_time = time.time() if event_time is None else event_time
        accepted_edges = result.setdefault("accepted_edges", [])
        if not any(abs(edge_time - v.get("time", 0)) < 9 for v in accepted_edges if isinstance(v, dict)):
            accepted_edges.append({"phase": phase, "time": edge_time,
                                   "direction": 1 if change > 0 else -1,
                                   "weight": round(weight, 3), "power_w": abs(change)})
            result["accepted_edges"] = accepted_edges[-20:]
        # Two independent, opposite, high-power steps with strong *measured*
        # phase correlation are more informative than many weak 100 W events.
        # The rule uses neither device names nor simple phase feasibility.
        if ((abs(change) >= 1500 and weight >= .65)
                or (abs(change) >= 2500 and weight >= .35)) and phase in PHASES:
            signatures = result.setdefault("strong_power_steps", [])
            stamp = time.time() if event_time is None else event_time
            if not any(abs(stamp - v.get("time", 0)) < 8 for v in signatures if isinstance(v, dict)):
                signatures.append({"phase": phase, "direction": 1 if change > 0 else -1,
                                   "time": stamp, "weight": round(weight, 3), "power_w": abs(change)})
                result["strong_power_steps"] = sorted(signatures, key=lambda v: v["time"])[-12:]
        signatures = result.get("strong_power_steps", [])
        strong = [v for v in signatures if isinstance(v, dict) and v.get("phase") == best
                  and (v.get("weight", 0) >= .65 or
                       (v.get("power_w", 0) >= 2500 and v.get("weight", 0) >= .35))]
        strong_confirmed = (best in PHASES and len(strong) >= 2
                            and len({v["direction"] for v in strong}) == 2
                            and max(v["time"] for v in strong) - min(v["time"] for v in strong) >= 20
                            and scores[best] / total >= .90)
        if strong_confirmed:
            result["confidence"] = max(result["confidence"], 65.0)
            self._diag("high_power_confirmed", entity_id, f"Independent ON and OFF high-power steps support {best}")
        # Two clean opposite-direction events can establish a small appliance;
        # three accepted events can establish most appliances. A high-power
        # device with only same-direction edges still needs further evidence.
        best_edges = [v for v in result.get("accepted_edges", []) if v["phase"] == best]
        bidirectional = (len(best_edges) >= 2 and
                         {v["direction"] for v in best_edges} == {-1, 1} and
                         max(v["time"] for v in best_edges) - min(v["time"] for v in best_edges) >= 15)
        high_power_only_one_direction = (best_edges and any(v["power_w"] >= 1500 for v in best_edges)
                                         and not bidirectional)
        enough_events = (result["events"] >= 3 or (bidirectional and evidence >= 1.4))
        result["phase"] = best if ((enough_events and result["confidence"] >= 55
                                    and not high_power_only_one_direction)
                                    or strong_confirmed) else "Unknown"
        # A single-direction provisional mapping is deliberately shown red
        # (<70%), even if many identical OFF edges would make the raw score
        # numerically high. A newly accepted opposite edge can lift the cap.
        if result.get("one_direction_phase"):
            if best != result["one_direction_phase"] or bidirectional:
                result.pop("one_direction_phase", None)
            else:
                result["confidence"] = min(result["confidence"], 64.0)
        self.last_observation = result["last_seen"]
        self._dirty = True
        self._notify()

    @staticmethod
    def _recalculate_result(result):
        """Re-score existing persisted evidence using the faster 1.5.5 rule.

        Does not invent new observations or remove historical phase scores.
        """
        scores = result.get("scores") or {}
        total = sum(max(0.0, float(scores.get(p, 0) or 0)) for p in (*PHASES, "3-phase"))
        if total <= 0:
            return
        best = max((*PHASES, "3-phase"), key=lambda p: scores.get(p, 0))
        evidence = max(0.0, float(scores.get(best, 0) or 0))
        confidence = round(100 * evidence / total * (1 - math.exp(-evidence / 1.55)), 1)
        # Keep high-power verified assignments at their earned minimum.
        if result.get("phase") != "Unknown" and result.get("confidence", 0) >= 65:
            confidence = max(confidence, min(65.0, result["confidence"]))
        if result.get("one_direction_phase"):
            edges = [v for v in result.get("accepted_edges", [])
                     if isinstance(v, dict) and v.get("phase") == best]
            both_directions = {v.get("direction") for v in edges} == {-1, 1}
            if best != result["one_direction_phase"] or both_directions:
                result.pop("one_direction_phase", None)
            else:
                confidence = min(confidence, 64.0)
        result["confidence"] = confidence
        if result.get("events", 0) >= 3 and confidence >= 55:
            result["phase"] = best

    def _match_delayed_step(self, change, start, end):
        """Find ONE isolated signed step in corrected 1-second phase history.

        A 60-second Zigbee report is delayed but the actual electrical edge is
        usually crisp. Match multi-second medians on ALL phases at the SAME
        timestamp, reject competing phases and competing step timestamps.
        A single candidate is tentative and cannot assign a phase by itself.
        Returns (error, phase, step_time, actual_delta, quality) or None.
        """
        if abs(change) < 55 or end <= start:
            return None
        series = {p: [(t, w) for t, w in self.history[p]
                      if start - 18 <= t <= end + 18] for p in PHASES}
        if any(len(series[p]) < 20 for p in PHASES):
            return None
        # Use bisection over timestamps instead of rescanning 10 minutes of
        # history for every candidate. This executes in Home Assistant's main
        # event loop and must remain cheap even with many active sensors.
        stamps = {p: [t for t, _ in series[p]] for p in PHASES}
        watts = {p: [w for _, w in series[p]] for p in PHASES}
        def median_window(phase, low, high):
            lo = bisect_left(stamps[phase], low)
            hi = bisect_left(stamps[phase], high + 1e-6)
            values = sorted(watts[phase][lo:hi])
            return values[len(values) // 2] if len(values) >= 3 else None

        candidates = []
        candidate_times = [t for t, _ in series['L1'] if start <= t <= end]
        for t in candidate_times[::3]:
            deltas = {}
            for p in PHASES:
                before = median_window(p, t - 12, t - 4)
                after = median_window(p, t + 4, t + 12)
                if before is None or after is None:
                    break
                deltas[p] = after - before
            if len(deltas) != len(PHASES):
                continue
            ranked = sorted(PHASES, key=lambda p: abs(deltas[p] - change))
            best = ranked[0]
            difference = abs(change)
            error_w = abs(deltas[best] - change)
            if error_w > max(35, difference * .32):
                continue
            others = [p for p in PHASES if p != best]
            if any(abs(deltas[p]) > max(47, difference * .36) for p in others):
                continue
            # Other phases must not explain the same change nearly as well.
            if any(abs(deltas[p] - change) < max(58, difference * .60) for p in others):
                continue
            error = error_w / max(75, difference)
            quality = max(.55, min(.98, 1 - error * .8))
            candidates.append((error, best, t, deltas[best], quality))
        if not candidates:
            return None
        # A 10-second electrical step produces several nearby candidates;
        # count it exactly once. Two independent similar steps during one
        # delayed reporting interval are ambiguous and must not be guessed.
        clusters = []
        for item in sorted(candidates, key=lambda x: x[2]):
            if clusters and item[2] - clusters[-1][-1][2] <= 20:
                clusters[-1].append(item)
            else:
                clusters.append([item])
        ranked_clusters = sorted((min(c, key=lambda x: x[0]) for c in clusters), key=lambda x: x[0])
        if len(ranked_clusters) > 1 and ranked_clusters[1][0] <= ranked_clusters[0][0] + .18:
            return None
        return ranked_clusters[0]

    @staticmethod
    def _one_direction_votes(phase, votes):
        """Find independent, very clear same-direction delayed matches.

        Several 60-120s Zigbee plugs report the falling edge reliably but
        rarely report an isolated rising edge. A 14-day series of three
        *distinct* high-quality matches to one phase should not stay stuck
        merely because all edges have the same sign. Weak/competing phase
        votes never qualify. Returns only the high-quality candidates.
        """
        recent = [v for v in votes if v[0] == phase]
        if not votes or len(recent) / len(votes) < .80:
            return []
        strong = [v for v in recent if v[3] >= .85]
        if len(strong) < 3 or len({v[1] for v in recent}) != 1:
            return []
        # Different electrical events, not multiple polling updates matching
        # the same transition. A 5-minute bucket is intentionally generous to
        # 60/120-second devices. At least ten minutes of elapsed time overall.
        strong.sort(key=lambda v: v[2])
        separated = []
        for vote in strong:
            if not separated or vote[2] - separated[-1][2] >= 300:
                separated.append(vote)
        if len(separated) < 3 or separated[-1][2] - separated[0][2] < 600:
            return []
        # Do not promote when another phase has similarly persuasive evidence.
        if any(v[0] != phase and v[3] >= .70 for v in votes):
            return []
        return separated

    def _promote_saved_one_direction_votes(self):
        """Use retained tentative history on upgrade, without requiring new events."""
        if not self.settings.get("learning_enabled", True):
            return
        for entity_id, votes in list(self.slow_votes.items()):
            if entity_id in self.settings.get("excluded", ()) or entity_id in self.settings.get("manual_assignments", {}):
                continue
            phases = Counter(v[0] for v in votes)
            if not phases:
                continue
            phase = phases.most_common(1)[0][0]
            existing = self.results.get(entity_id, {})
            if existing.get("phase") not in (None, "Unknown", phase):
                continue
            if self._one_direction_votes(phase, list(votes)):
                self._promote_slow_votes(entity_id, phase, votes, 100)

    def _promote_slow_votes(self, entity_id, phase, votes, change, statistical=False):
        """Promote independent historical matches, including strong OFF-only series.

        Bi-directional correlations keep the original fast path. A provisional
        one-direction match needs >=3 very strong isolated steps and is capped
        at 64% confidence (red dot). Saved promotion IDs prevent replay after
        restarts; an opposite-direction observation can strengthen it later.
        """
        recent = [v for v in votes if v[0] == phase]
        directions = {v[1] for v in recent}
        unique = {int(v[2] / 25) for v in recent}
        coherence = len(recent) / len(votes) if votes else 0
        powerful = (abs(change) >= 1500 and len(recent) >= 2
                    and sum(v[3] >= (.70 if abs(change) >= 2500 else .80) for v in recent) >= 2)
        statistically_clear = (statistical and len(recent) >= 2 and
                               len(unique) >= 2 and directions == {-1, 1} and
                               min(v[3] for v in recent[-2:]) >= .70)
        need = 2 if (powerful or statistically_clear) else 3
        bidirectional = (len(recent) >= need and len(unique) >= need
                         and directions == {-1, 1} and coherence >= .80)
        same_direction = [] if bidirectional else self._one_direction_votes(phase, list(votes))
        if not bidirectional and not same_direction:
            return
        # Only the demonstrably strong same-direction subset is used; a
        # weak historical vote should never dilute a reliable correlation.
        eligible = recent if bidirectional else same_direction
        result = self.results.setdefault(entity_id, {"entity_id": entity_id,
            "scores": {p: 0.0 for p in (*PHASES, '3-phase')}, "events": 0})
        # Avoid backfilling evidence that contradicts an already-established
        # automatic mapping. Conflicting phases need future live correlations.
        if not bidirectional and result.get("phase", "Unknown") not in ("Unknown", phase):
            return
        promoted = list(result.get('slow_promoted_steps', []))
        known = set(promoted)
        count = 0
        for p, direction, stamp, quality in eligible:
            token = f"{p}:{direction}:{int(stamp / 10)}"
            if token in known:
                continue
            known.add(token)
            promoted.append(token)
            count += 1
            self._accept_match(entity_id, p, quality,
                               abs(change) if direction > 0 else -abs(change), 'slow', stamp)
        result['slow_promoted_steps'] = promoted[-48:]
        if same_direction:
            result["one_direction_phase"] = phase
            # The raw evidence must reach the normal mapping threshold;
            # several weak conflicting old observations can still veto it.
            self._recalculate_result(result)
            if count:
                self._diag("slow_one_direction_confirmed", entity_id,
                           f"{len(same_direction)} independently timed high-quality "
                           f"{'ON' if same_direction[0][1] > 0 else 'OFF'} edges support {phase}; provisional mapping")
        if count:
            self._dirty = True
            self._notify()

    def _match_slow_profile(self, entity_id):
        """Match repeated ON/OFF device reports to lagged, cleaned phase levels.

        LG/other cloud sensors may publish measurements minutes after physical
        activity. A single snapshot or a lucky step match is never enough:
        require repeated high and low reports, multiple ON/OFF cycles, stable
        corrected-power samples and a unique phase match at nearby lag values.
        """
        reports = list(self.device_reports.get(entity_id, ()))
        if len(reports) < 6 or not self.history_status["ready"]:
            return None
        vals = [w for _, w in reports]
        low, high = min(vals), max(vals)
        difference = high - low
        if difference < max(350, self.settings["minimum_change_w"] * 3):
            return None
        # Reject the intermediate HVAC compressor levels; use clear ON/OFF
        # plateaus and multiple switches, not an arbitrary continuous trend.
        classified = [(t, "on" if w >= low + .70 * difference else
                           "off" if w <= low + .20 * difference else "middle")
                      for t, w in reports]
        stable = [(t, label) for t, label in classified if label != "middle"]
        on_times = [t for t, label in stable if label == "on"]
        off_times = [t for t, label in stable if label == "off"]
        if len(on_times) < 2 or len(off_times) < 2 or len(stable) < 6:
            return None
        if sum(a[1] != b[1] for a, b in zip(stable, stable[1:])) < 2:
            return None
        # A poll 5-10 minutes late can be shifted by any offset in the
        # preceding 10 minutes; none of those offsets alone is evidence.
        series = {p: list(self.history[p]) for p in PHASES}
        stamps = {p: [t for t, _ in series[p]] for p in PHASES}
        if any(len(series[p]) < 30 for p in PHASES):
            return None

        def median_at(phase, target):
            times, samples = stamps[phase], series[phase]
            idx = bisect_left(times, target)
            block = [samples[i][1] for i in range(max(0,idx-5), min(len(samples),idx+6))
                     if abs(samples[i][0]-target) <= 8]
            if len(block) < 3:
                return None
            block.sort()
            return block[len(block)//2]

        matches = []
        for lag in range(0, 601, 30):
            deltas = {}
            for phase in PHASES:
                on = [median_at(phase,t-lag) for t in on_times]
                off = [median_at(phase,t-lag) for t in off_times]
                on = sorted(v for v in on if v is not None)
                off = sorted(v for v in off if v is not None)
                if len(on) < 2 or len(off) < 2:
                    break
                deltas[phase] = on[len(on)//2] - off[len(off)//2]
            if len(deltas) != len(PHASES):
                continue
            ranked = sorted(PHASES, key=lambda p: abs(deltas[p] - difference))
            best = ranked[0]
            error = abs(deltas[best] - difference) / max(100,difference)
            if (error <= .30
                    and all(abs(deltas[p]) < max(160,difference*.35) for p in PHASES if p != best)
                    and abs(deltas[ranked[1]]-difference) - abs(deltas[best]-difference) > difference*.25):
                matches.append((error,best,lag))
        if not matches:
            return None
        matches.sort()
        error,best,lag=matches[0]
        if any(phase != best and err <= error+.15 for err,phase,_ in matches):
            return None
        # Require corroborating offsets near the best time shift so one lone
        # lucky alignment among 21 offsets cannot produce a tentative vote.
        if not any(phase == best and 0 < abs(other_lag-lag) <= 60
                   for _,phase,other_lag in matches[1:]):
            return None
        return best, max(.25,min(.65,(1-error)*.65)), lag

    def _match_statistical_profile(self, entity_id):
        """Compare averaged phase *changes* across device reporting periods.

        Slow Zigbee/airco sensors do not report electrical step timestamps.
        For each candidate reporting lag, use one stable average near the
        previous device report and one near the current report. Require the
        SAME phase and lag to explain multiple independent device changes,
        including both an increase and a decrease. This is deliberately
        softer than requiring an exact isolated 1-second step, but it does
        not equate two coincidentally similar static average loads.

        Return (phase, [(direction, monotonic_stamp, quality), ...], lag)
        or None. Each report contributes at most one independent vote.
        """
        reports = list(self.device_reports.get(entity_id, ()))
        if len(reports) < 3:
            return None
        meaningful = [reports[0]]
        floor = max(45.0, min(65.0, self.settings.get("minimum_change_w", 50)))
        for stamp, watts in reports[1:]:
            if abs(watts - meaningful[-1][1]) >= floor and stamp - meaningful[-1][0] >= 20:
                meaningful.append((stamp, watts))
        if len(meaningful) < 3:
            return None
        meaningful = meaningful[-10:]
        series = {p: list(self.history[p]) for p in PHASES}
        if any(len(series[p]) < 40 for p in PHASES):
            return None
        timestamps = {p: [row[0] for row in series[p]] for p in PHASES}
        prefixes = {}
        for p in PHASES:
            total = 0.0
            prefix = [0.0]
            for _, watts in series[p]:
                total += watts
                prefix.append(total)
            prefixes[p] = prefix

        def average(p, center):
            stamps = timestamps[p]
            lo = bisect_left(stamps, center - 12)
            hi = bisect_left(stamps, center + 12)
            if hi - lo < 9:
                return None
            return (prefixes[p][hi] - prefixes[p][lo]) / (hi - lo)

        matches = []
        # A single lag for all events is the key safeguard against random
        # matches selected independently from a very long search interval.
        for lag in (0, 15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 420):
            phase_events = {p: [] for p in PHASES}
            for (t0, w0), (t1, w1) in zip(meaningful, meaningful[1:]):
                delta = w1 - w0
                if abs(delta) < floor or t1 - t0 < 20:
                    continue
                observed = {}
                for p in PHASES:
                    a = average(p, t0 - lag)
                    b = average(p, t1 - lag)
                    if a is None or b is None:
                        break
                    observed[p] = b - a
                if len(observed) != len(PHASES):
                    continue
                for p in PHASES:
                    error = abs(observed[p] - delta)
                    others = [x for x in PHASES if x != p]
                    # Favor an explanatory phase over merely feasible loads.
                    if (delta * observed[p] > 0
                            and error <= max(32.0, abs(delta) * .38)
                            and all(abs(observed[o] - delta) >= error + max(22, abs(delta) * .25)
                                    for o in others)):
                        quality = min(.96, max(.60, 1.0 - error / max(90, abs(delta)) * .65))
                        phase_events[p].append((1 if delta > 0 else -1, t1 - lag, quality))
            for p in PHASES:
                events = phase_events[p]
                if len(events) >= 2 and {v[0] for v in events} == {-1, 1}:
                    # Reward coverage and quality, but don't let a short lucky
                    # two-event pairing outrank a much stronger other phase.
                    grade = sum(v[2] for v in events) + .20 * len(events)
                    matches.append((grade, p, lag, events))
        if not matches:
            return None
        matches.sort(key=lambda x: (-x[0], x[2]))
        score, phase, lag, events = matches[0]
        if any(p != phase and other >= score * .84 for other, p, _, _ in matches[1:]):
            return None
        # Two opposite-direction averaged events are already useful; a
        # statistical vote is never fabricated for reports without movement.
        return phase, events, lag

    def _apply_statistical_profile(self, entity_id, change):
        match = self._match_statistical_profile(entity_id)
        if match is None:
            return False
        phase, events, lag = match
        added = False
        for direction, stamp, quality in events:
            votes = self._record_slow_vote(entity_id, phase, direction, stamp, quality)
            if votes is not None:
                added = True
        if not added:
            self._diag("statistical_already_counted", entity_id)
            return False
        self._diag("statistical_average_match", entity_id,
                   f"Repeated averaged ON/OFF changes support {phase}; reporting lag {lag}s")
        votes = self.slow_votes.get(entity_id, ())
        self._promote_slow_votes(entity_id, phase, votes, change, statistical=True)
        return True

    async def _evaluate_slow(self, entity_id, change, reported_at, previous_report):
        """Find strong historical steps within a slow sensor's reporting interval.

        Unlike a fast plug, slow/averaged sensor timing is uncertain. Several
        distinct, direction-consistent matches are mandatory before evidence is
        recorded, and competition from other phases vetoes a candidate.
        """
        try:
            if entity_id in self.settings["excluded"] or not self.settings["learning_enabled"]:
                return
            # Look back through the *last poll interval*, capped at 10 minutes.
            # Large aggregate differences are not automatically a step match.
            start = max(previous_report - 8, reported_at - 600)
            candidates = []
            # The old matcher used a fixed 100 W minimum per phase step,
            # which prevented reliable matching of many 100-120 W Zigbee
            # appliance reports. Use a stricter ALL-phase, isolated-step
            # matcher for these small delayed loads instead.
            if abs(change) <= 220 and hasattr(self, '_match_delayed_step'):
                small = self._match_delayed_step(change, start, reported_at)
                if small is not None:
                    error, phase, stamp, delta, quality = small
                    candidates = [(error, phase, stamp, delta)]
                else:
                    if getattr(self, "_apply_statistical_profile", None) and self._apply_statistical_profile(entity_id, change):
                        return
                    self._diag('slow_no_matching_step', entity_id, f'No unique clean small-load step for {change:+.0f} W')
                    return
            if not candidates:
                for phase in PHASES:
                    samples = [(t, w) for t, w in self.history[phase]
                               if start - 12 <= t <= reported_at]
                    if len(samples) < 14:
                        self._diag("slow_missing_history", entity_id)
                        return
                    # Sample ~5-second plateaus, rejecting noisy 1-second spikes.
                    for i in range(10, len(samples) - 5, 3):
                        t = samples[i][0]
                        if t < start or t > reported_at - 4:
                            continue
                        before = sorted(w for _, w in samples[max(0,i-10):i-4])
                        after = sorted(w for _, w in samples[i+3:i+6])
                        if len(before) < 3 or len(after) < 3:
                            continue
                        delta = after[len(after)//2] - before[len(before)//2]
                        # Slow sensors can average/under-report transitions. Require
                        # at least 60% magnitude, correct direction, and close size.
                        if delta * change <= 0 or abs(delta) < max(100, abs(change)*0.6):
                            continue
                        error = abs(delta-change)/max(abs(change),100)
                        if error <= 0.4:
                            candidates.append((error, phase, t, delta))
            if not candidates and abs(change) > 220:
                # A polled sensor may report an average rather than an exact
                # electrical step. Compare stable beginning/end plateaus of
                # its reporting interval, still checking other phases.
                net = {}
                for p in PHASES:
                    samples = [(t, w) for t, w in self.history[p]
                               if start - 12 <= t <= reported_at]
                    first = [w for t, w in samples if start - 10 <= t <= start + 8]
                    last = [w for t, w in samples if reported_at - 14 <= t <= reported_at]
                    if len(first) < 4 or len(last) < 4:
                        break
                    first, last = sorted(first), sorted(last)
                    net[p] = last[len(last)//2] - first[len(first)//2]
                if len(net) == len(PHASES):
                    best = min(PHASES, key=lambda p: abs(net[p] - change))
                    error = abs(net[best] - change) / max(100, abs(change))
                    others = [p for p in PHASES if p != best]
                    if (abs(change) >= 300 and error <= .32
                            and all(abs(net[p]) < max(130, abs(change) * .35) for p in others)
                            and all(abs(net[p] - change) > abs(change) * .45 for p in others)):
                        candidates.append((error, best, reported_at - 5, net[best]))
                        self._diag("slow_on_off_pattern", entity_id,
                                   f"Stable interval {best} {net[best]:+.0f} W / device {change:+.0f} W")
            if not candidates and abs(change) > 220:
                robust = self._match_delayed_step(change, start, reported_at) if hasattr(self, '_match_delayed_step') else None
                if robust is not None:
                    error, phase, stamp, delta, quality = robust
                    candidates.append((error, phase, stamp, delta))
                    self._diag('slow_isolated_step', entity_id, f'Isolated historical {phase} {delta:+.0f} W')
            if not candidates:
                profile = self._match_slow_profile(entity_id) if hasattr(self, "_match_slow_profile") else None
                if profile is not None:
                    phase, quality, lag = profile
                    # A profile vote corresponds to one newly reported device
                    # transition, not every phase-history sample we compared.
                    candidates.append((1-quality, phase, reported_at-3, change*quality))
                    self._diag("slow_profile_match", entity_id,
                               f"Repeated ON/OFF supports {phase}; aligned lag window {lag}s (not measured latency)")
            if not candidates:
                if getattr(self, "_apply_statistical_profile", None) and self._apply_statistical_profile(entity_id, change):
                    return
                self._diag("slow_no_matching_step", entity_id,
                           f"No reliable phase step for {change:+.0f} W in preceding interval")
                return
            candidates.sort(key=lambda x:x[0])
            error, phase, stamp, delta = candidates[0]
            # Reject ambiguous matches to another phase OR multiple similar
            # steps in the same interval; never manufacture confidence.
            competing = [x for x in candidates if abs(x[2]-stamp)>12 or x[1]!=phase]
            if any(x[1]!=phase and x[0] <= error+0.18 for x in competing):
                self._diag("slow_ambiguous", entity_id, "Similar changes on competing phases")
                return
            distinct = [x for x in candidates if x[1]==phase and abs(x[2]-stamp)>20
                        and x[0] <= error+0.12]
            if distinct:
                self._diag("slow_ambiguous", entity_id, "Several plausible steps on one phase")
                return
            votes = self._record_slow_vote(
                entity_id, phase, 1 if change > 0 else -1, stamp, max(.15, 1-error)
            )
            if votes is None:
                return
            self._diag("slow_candidate", entity_id,
                       f"Tentative {phase} ({'ON/rising' if change > 0 else 'OFF/falling'}); device {change:+.0f} W, phase {delta:+.0f} W")
            # Avoid repeated acceptance from a single one-direction event.
            recent=[v for v in votes if v[0]==phase]
            different_times=len({int(v[2]/25) for v in recent})
            directions={v[1] for v in recent}
            if hasattr(self, '_promote_slow_votes'):
                self._promote_slow_votes(entity_id, phase, votes, change)
            elif len(recent)>=3 and different_times>=3 and len(directions)==2 \
                    and len(recent)>=len(votes)*.8:
                self._accept_match(entity_id,phase,min(.6,sum(v[3] for v in recent)/len(recent)),change,"slow")
            if (getattr(self, "_apply_statistical_profile", None)
                    and getattr(self, "results", {}).get(entity_id, {}).get("phase", "Unknown") == "Unknown"):
                self._apply_statistical_profile(entity_id, change)
        except asyncio.CancelledError:
            raise
        except Exception:
            self._diag("error", entity_id)
            _LOGGER.exception("Error matching delayed phase transition for %s", entity_id)

    @staticmethod
    def _normalize_manual_devices(items):
        result=[]
        for item in items if isinstance(items,list) else []:
            if (isinstance(item,dict) and isinstance(item.get("id"),str)
                    and isinstance(item.get("name"),str)
                    and item.get("phase") in (*PHASES,"3-phase")):
                icon = item.get("icon", "mdi:power-plug")
                if (not isinstance(icon, str) or not icon.startswith("mdi:")
                        or not 1 <= len(icon[4:]) <= 80
                        or not icon[4:].replace("-", "").isascii()
                        or not icon[4:].replace("-", "").isalnum()):
                    icon = "mdi:power-plug"
                result.append({"id":item["id"],"name":item["name"],
                               "room":str(item.get("room") or ""),"phase":item["phase"],
                               "icon": icon})
        return result[:500]

    @staticmethod
    def _normalize_sources(items, default_positive=True):
        result = []
        for item in items if isinstance(items, list) else []:
            if isinstance(item, dict) and isinstance(item.get("entity_id"), str) and item["entity_id"]:
                result.append({"entity_id": item["entity_id"],
                               "positive": bool(item.get("positive", default_positive)),
                               **({"soc_entity_id": str(item.get("soc_entity_id") or "")}
                                  if "soc_entity_id" in item else {})})
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

    def _night_zero_solar_power(self, entity_id):
        """Use a stale zero-valued PV sensor ONLY during confirmed dark hours.

        SolarEdge integrations may stop sending unchanged 0 W values at night.
        Ordinary 12-second freshness checks would then erase ALL cleaned phase
        history every second and prevent learning of Zigbee plugs overnight.
        Never infer zero from an unavailable sensor, daytime or twilight.
        """
        sun = self.hass.states.get("sun.sun")
        state = self.hass.states.get(entity_id)
        if (sun is None or sun.state != "below_horizon"
                or state is None or valid_power(state) is None):
            return None
        try:
            elevation = float(sun.attributes.get("elevation"))
        except (TypeError, ValueError):
            return None
        if not math.isfinite(elevation) or elevation > -3.0:
            return None
        watts = valid_power(state)
        # A stale 10 W SolarEdge measurement must not be silently ignored.
        return 0.0 if abs(watts) <= 1.0 else None

    def _observe_sensor_reports(self):
        """Measure intervals between actual HA reports, including unchanged states.

        `last_reported` changes on each state report on supported HA versions;
        for older versions, `last_updated` is the best available proxy. This
        is a measurement of HA reporting cadence, NOT physical device latency.
        """
        for entity_id in self.candidates:
            state = self.hass.states.get(entity_id)
            if state is None:
                continue
            reported = getattr(state, "last_reported", None) or state.last_updated
            if reported is None:
                continue
            stamp = reported.timestamp()
            # Ignore old HA reports from before this engine started. Two new
            # reports are needed to measure a factual post-restart interval.
            if stamp < self._report_monitor_since:
                continue
            prev = self.sensor_report_seen.get(entity_id)
            if prev is None:
                self.sensor_report_seen[entity_id] = stamp
                continue
            if stamp <= prev:
                continue
            interval = stamp - prev
            self.sensor_report_seen[entity_id] = stamp
            if 0.2 <= interval <= 3600:
                self.sensor_refresh_intervals.setdefault(entity_id, deque(maxlen=12)).append(interval)

    async def _tick(self, _now):
        """Expose available grid and corrected values independently.

        Solar V*I fallback is for display ONLY when an active inverter's phase
        readings are unavailable. Never train the phase classifier on a fallback.
        """
        now = time.monotonic()
        utc_now = dt_util.utcnow()
        try:
            self._watchdog_workers()
        except Exception:
            self._diag("watchdog_error")
            _LOGGER.exception("Phase learning watchdog failed during P1 sample")
        self._observe_sensor_reports()
        grid = {p: self._fresh_watts(entity_id, utc_now)
                for p, entity_id in self.settings["phase_sensors"].items()}
        # A stale P1 value is still useful to inspect but is not valid input
        # for compensated load or the learning engine.
        grid_display = {p: (grid[p] if grid[p] is not None else valid_power(
            self.hass.states.get(self.settings["phase_sensors"][p]))) for p in PHASES}

        night_fallback_used = False

        def source_sum(items, *, solar=False):
            nonlocal night_fallback_used
            total = 0.0
            for source in items:
                watts = self._fresh_watts(source["entity_id"], utc_now)
                if watts is None and solar:
                    watts = self._night_zero_solar_power(source["entity_id"])
                    if watts is not None:
                        night_fallback_used = True
                if watts is None:
                    return None
                total += watts * (1 if source["positive"] else -1)
            return total

        batteries = {p: source_sum(self.settings["battery_sources"][p]) for p in PHASES}
        solar_direct = {p: source_sum(self.settings["solar_sources"][p], solar=True) for p in PHASES}
        solar_total = source_sum(self.settings["solar_sources"]["TOTAL"], solar=True)
        if night_fallback_used and not self._night_solar_fallback_active:
            self._diag("solar_night_zero_fallback", detail="Stale SolarEdge 0 W allowed after dark")
        self._night_solar_fallback_active = night_fallback_used
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
            missing = [f"{p}: " + ", ".join(k for k in ("grid", "battery", "solar") if breakdown[p][k] is None)
                       for p in PHASES if breakdown[p]["cleaned"] is None]
            reason = "; ".join(missing) if missing else f"Solar allocation: {self._solar_estimation_status}"
            self.history_status = {"ready": False, "reason": reason,
                                   "samples": {p: len(self.history[p]) for p in PHASES}}
            # Once per change of problem, not every second (avoid noisy counters).
            if reason != self._last_unready_reason:
                self._diag("history_interrupted")
                self._last_unready_reason = reason
            # Never append guessed/corrupted samples to learning history.
            # Ensure future transitions cannot compare pre-gap to post-gap data.
            self.history = {p: deque(maxlen=1800) for p in PHASES}
            return
        self._last_unready_reason = None
        for phase in PHASES:
            self.history[phase].append((now, breakdown[phase]["cleaned"]))
        self.history_status = {"ready": True, "reason": "Valid corrected-power samples", "samples": {p: len(self.history[p]) for p in PHASES}}

    async def _periodic(self, _now):
        try:
            self._watchdog_workers()
        except Exception:
            self._diag("watchdog_error")
            _LOGGER.exception("Phase learning watchdog failed during maintenance")
        self._prune_slow_votes()
        self._periodic_count += 1
        if self._periodic_count % 4 == 0:
            self._refresh_candidates()
        self._notify()
        if self._dirty and time.monotonic() - self._last_save >= 15:
            await self.save()

    def diagnostics_export(self):
        """Explicit, read-only export for investigating failed correlations.

        On-demand only: a normal dashboard refresh does not transport power
        history. Time stamps are Unix seconds so they can be compared across
        HA and device reports when diagnosing missing transition matches.
        """
        monotonic_now = time.monotonic()
        unix_now = time.time()
        def epoch(stamp):
            return round(unix_now - (monotonic_now - stamp), 2)
        return {
            "version": VERSION,
            "exported_at": dt_util.utcnow().isoformat(),
            "measurement_settings": {
                "phase_sensors": dict(self.settings.get("phase_sensors", {})),
                "minimum_change_w": self.settings.get("minimum_change_w"),
                "timing_overrides": dict(self.settings.get("timing_overrides", {})),
                "phase_estimation_status": self._solar_estimation_status,
                "night_solar_zero_fallback_active": self._night_solar_fallback_active,
            },
            "learning": {
                "results": deepcopy(self.results),
                "tentative_votes": self._serialize_slow_votes(),
                "load_hints": self._serialize_level_hints(),
                "diagnostics_by_device": deepcopy(self.device_diagnostics),
                "pending_work": {
                    entity_id: {
                        "age_seconds": round(max(0, monotonic_now - started), 1),
                        "since_last_evaluation_seconds": round(max(0, monotonic_now - self.pending_last_progress.get(entity_id, started)), 1),
                        "queue_depth": len(self.queued_transitions.get(entity_id, ())),
                        "task_done": bool(task.done()) if callable(getattr(task, 'done', None)) else None,
                        "has_inflight": entity_id in self._worker_inflight,
                    }
                    for entity_id, task in self.pending.items()
                    for started in [self.pending_since.get(entity_id, monotonic_now)]
                },
                "diagnostic_counts": dict(self.diagnostics),
                "orphan_queues": [eid for eid, q in self.queued_transitions.items() if q and eid not in self.pending],
                "recovery_backoff_seconds": {eid: round(max(0, due - monotonic_now), 1) for eid, due in self._worker_recovery_due.items()},
                "history_status": deepcopy(self.history_status),
            },
            "cleaned_phase_history": {
                p: [[epoch(stamp), round(w, 2)] for stamp, w in list(self.history[p])[-600::2]]
                for p in PHASES
            },
            "recent_device_reports": {
                entity_id: [[epoch(stamp), round(w, 2)] for stamp, w in list(reports)[-35:]]
                for entity_id, reports in list(self.device_reports.items())[-300:]
                if reports
            },
            "recent_device_changes": [
                [epoch(stamp), entity_id, round(change, 2)]
                for stamp, entity_id, change in self.recent_changes
            ],
        }

    def export(self):
        """Small JSON payload consumed by panel and card."""
        self._refresh_candidates()
        excluded = set(self.settings["excluded"])
        rows = []
        for entity_id, item in self.candidates.items():
            evidence = self.results.get(entity_id, {})
            manual = self.settings["manual_assignments"].get(entity_id)
            live_state = self.hass.states.get(entity_id)
            current_power = valid_power(live_state)
            offline = current_power is None
            rows.append({
                "manual": bool(manual),
                "entity_id": entity_id,
                "name": item["name"],
                "display_name": self.settings["display_names"].get(entity_id, ""),
                "display_icon": self.settings["display_icons"].get(entity_id, ""),
                "phase": manual or evidence.get("phase", "Unknown"),
                "confidence": evidence.get("confidence", 0),
                "events": evidence.get("events", 0),
                "scores": evidence.get("scores", {}),
                "last_seen": evidence.get("last_seen"),
                "excluded": entity_id in excluded,
                "power_w": None if offline else current_power,
                "offline": offline,
                # Existing change cadence remains available for learning diagnostics.
                "report_interval_seconds": round(sorted(self.sensor_cadence[entity_id])[len(self.sensor_cadence[entity_id])//2]) if self.sensor_cadence.get(entity_id) else None,
                "measured_refresh_seconds": round(sorted(self.sensor_refresh_intervals[entity_id])[len(self.sensor_refresh_intervals[entity_id])//2]) if self.sensor_refresh_intervals.get(entity_id) else None,
                "timing_mode": self.settings["timing_overrides"].get(entity_id,"auto"),
                "phase_hint": self._phase_hint(entity_id),
                "tentative_votes": len(self.slow_votes.get(entity_id, ())),
                "load_hints": len(self.level_hints.get(entity_id, ())),
                "tentative_phase": (Counter(v[0] for v in self.slow_votes[entity_id]).most_common(1)[0][0]
                                    if self.slow_votes.get(entity_id) else None),
                "diagnostics": {
                    "counts": dict(self.device_diagnostics.get(entity_id, {}).get("counts", {})),
                    "last_reason": self.device_diagnostics.get(entity_id, {}).get("last_reason"),
                    "last_detail": self.device_diagnostics.get(entity_id, {}).get("last_detail"),
                    "queue_depth": len(self.queued_transitions.get(entity_id, ())),
                    "has_inflight": entity_id in self._worker_inflight,
                    "pending_age_seconds": (round(max(0, time.monotonic()-self.pending_since[entity_id]), 1)
                                            if entity_id in self.pending_since else None),
                },
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
        lifetime_accepted = sum(
            int(result.get("events", 0)) for result in self.results.values()
            if isinstance(result, dict) and type(result.get("events", 0)) is int
            and result.get("events", 0) >= 0
        )
        return {
            "learning_diagnostics": {"counts": dict(self.diagnostics),
                                      "accepted_total": lifetime_accepted,
                                      "tentative_votes_saved": sum(len(v) for v in self.slow_votes.values()),
                                      "load_hints_saved": sum(len(v) for v in self.level_hints.values()),
                                      "queued_transitions": sum(len(q) for q in self.queued_transitions.values()),
                                      "active_workers": sum(not getattr(t, "done", lambda: False)() for t in self.pending.values()),
                                      "orphan_queues": sum(bool(q) and eid not in self.pending for eid, q in self.queued_transitions.items()),
                                      "inflight_evaluations": len(self._worker_inflight),
                                      "oldest_pending_seconds": (round(max(0, time.monotonic()-min(self.pending_since.values())), 1)
                                                                 if self.pending_since else 0),
                                      "tentative_devices": sum(bool(v) for v in self.slow_votes.values()),
                                      "history": deepcopy(self.history_status),
                                      "night_solar_zero_fallback_active": self._night_solar_fallback_active},
            "manual_devices": deepcopy(self.settings["manual_devices"]),
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
        reset_device = payload.get("reset_device")
        if reset_device is not None:
            if (not isinstance(reset_device, str) or not reset_device.startswith("sensor.")
                    or len(reset_device) > 255 or reset or reset_device in self._source_ids()):
                raise ValueError("Select a valid appliance power sensor for individual reset")
            # Do not allow the command to silently modify a different part of
            # the model in the same write. It must be an isolated transaction.
            if set(payload) != {"reset_device"}:
                raise ValueError("Reset one device separately from settings changes")
            self._refresh_candidates()
            if reset_device not in self.candidates and reset_device not in self.results \
                    and reset_device not in self.slow_votes and reset_device not in self.level_hints \
                    and reset_device not in self.settings.get("manual_assignments", {}):
                raise ValueError("Device not found in Phase Mapper")
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
        # Optional battery SoC selections are display-only. They must never
        # reset corrected history or phase-learning observations.
        if "battery_sources" in payload:
            groups = payload["battery_sources"]
            if isinstance(groups, dict):
                for sources in groups.values():
                    if isinstance(sources, list):
                        for item in sources:
                            if not isinstance(item, dict):
                                continue
                            soc = item.get("soc_entity_id", "")
                            if (not isinstance(soc, str) or len(soc) > 255
                                    or (soc and not soc.startswith("sensor."))):
                                raise ValueError("Battery SoC must be a sensor entity or blank")
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
                if key == "battery_sources":
                    without_soc = lambda groups: {
                        p: [(x["entity_id"], x["positive"]) for x in items]
                        for p, items in groups.items()
                    }
                    if without_soc(normalized) != without_soc(self.settings[key]):
                        reset = True
                elif normalized != self.settings[key]:
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
        if "manual_devices" in payload:
            items = payload["manual_devices"]
            if not isinstance(items,list) or len(items)>500:
                raise ValueError("Maximum 500 manual devices")
            normalized = self._normalize_manual_devices(items)
            if len(normalized)!=len(items) or len({x["id"] for x in normalized})!=len(normalized):
                raise ValueError("Invalid manual devices or duplicate IDs")
            if any(not x["name"].strip() or len(x["name"])>100 or len(x["room"])>80
                   or not x["id"].startswith("manual_") for x in normalized):
                raise ValueError("Invalid manual device name, room or identifier")
            if any("icon" in item and (not isinstance(item["icon"], str)
                        or not MDI_ICON_PATTERN.fullmatch(item["icon"])) for item in items):
                raise ValueError("Invalid manual device icon (use mdi:name)")
            new_settings["manual_devices"] = normalized
        if "display_names" in payload:
            values = payload["display_names"]
            if not isinstance(values, dict) or len(values) > 5000 or any(
                    not isinstance(key, str) or not key.startswith("sensor.")
                    or not isinstance(value, str) or len(value.strip()) > 100
                    for key, value in values.items()):
                raise ValueError("Invalid mapped-device display names")
            new_settings["display_names"] = {
                key: value.strip() for key, value in values.items() if value.strip()
            }
        if "display_icons" in payload:
            values = payload["display_icons"]
            if not isinstance(values, dict) or len(values) > 5000 or any(
                    not isinstance(key, str) or not key.startswith("sensor.")
                    or not isinstance(icon, str)
                    or not MDI_ICON_PATTERN.fullmatch(icon)
                    for key, icon in values.items()):
                raise ValueError("Invalid Home Assistant mdi: device icon")
            new_settings["display_icons"] = dict(values)
        if "timing_overrides" in payload:
            values=payload["timing_overrides"]
            if not isinstance(values,dict) or len(values)>5000 or any(
                    not isinstance(k,str) or not k.startswith("sensor.")
                    or v not in ("fast","slow") for k,v in values.items()):
                raise ValueError("Invalid timing overrides")
            new_settings["timing_overrides"] = dict(values)
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
                "solar_sources", "solar_phase_estimation"
            )
        )
        # The only battery change relevant to phase math is its power source/sign.
        battery_power_signature = lambda settings: {
            p: [(x["entity_id"], x["positive"]) for x in settings["battery_sources"][p]]
            for p in PHASES
        }
        if battery_power_signature(new_settings) != battery_power_signature(self.settings):
            measurement_changed = True
        self.settings = new_settings
        if reset_device is not None:
            # Remove only this entity's old phase evidence. Preserve every
            # other entity, all display aliases/icons, timing and exclusions.
            # A manually assigned phase is cleared too, allowing the socket
            # to be reused and learnt again without an overriding old phase.
            old_task = self.pending.pop(reset_device, None)
            self._worker_inflight.pop(reset_device, None)
            self._worker_recovery_due.pop(reset_device, None)
            self._worker_recoveries.pop(reset_device, None)
            getattr(self, 'pending_since', {}).pop(reset_device, None)
            getattr(self, 'pending_last_progress', {}).pop(reset_device, None)
            if old_task is not None:
                old_task.cancel()
            self.queued_transitions.pop(reset_device, None)
            self.results.pop(reset_device, None)
            self.slow_votes.pop(reset_device, None)
            self.level_hints.pop(reset_device, None)
            self.device_reports.pop(reset_device, None)
            self.sensor_cadence.pop(reset_device, None)
            self.sensor_report_seen.pop(reset_device, None)
            self.sensor_refresh_intervals.pop(reset_device, None)
            self.device_diagnostics.pop(reset_device, None)
            self.settings["manual_assignments"].pop(reset_device, None)
            self.recent_changes = deque(
                (item for item in self.recent_changes if item[1] != reset_device),
                maxlen=self.recent_changes.maxlen,
            )
            # last_observation is the last accepted timestamp, not a device
            # dictionary. Do not modify it while resetting another device.
            # Retain current wattage snapshot as a baseline: forgetting it
            # could fabricate a fresh OFF->ON transition on the next report.
            # Persist synchronously before the WebSocket reports success.
        if reset:
            # Keep previous evidence in a recoverable archive in the same storage file.
            archive = self.settings.setdefault("evidence_archive", [])
            archive.append({"time": dt_util.utcnow().isoformat(), "results": deepcopy(self.results),
                            "slow_votes": self._serialize_slow_votes(),
                            "level_hints": self._serialize_level_hints()})
            self.settings["evidence_archive"] = archive[-5:]
            self.results = {}
            self.slow_votes.clear()
            self.level_hints.clear()
        if measurement_changed:
            self._cancel_pending()
            # Old tentative matches refer to a different correction model.
            self.slow_votes.clear()
            self.level_hints.clear()
            self.history = {p: deque(maxlen=1800) for p in PHASES}
            self.device_reports.clear()
            self._display_breakdown = None
            self._solar_estimation_status = "disabled"
        for entity_id in self._source_ids():
            self.candidates.pop(entity_id, None)
        self._refresh_candidates()
        await self.save()
        self._notify()

    def _cancel_pending(self):
        self.queued_transitions.clear()
        for task in list(self.pending.values()):
            task.cancel()
        self.pending.clear()
        self.pending_since.clear()
        self.pending_last_progress.clear()
        self._worker_inflight.clear()
        self._worker_recovery_due.clear()
        self._worker_recoveries.clear()
