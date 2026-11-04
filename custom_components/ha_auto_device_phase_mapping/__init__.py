"""HA_auto_device_phase_mapping: passive phase discovery for Home Assistant."""

from __future__ import annotations

import logging
import hashlib
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, FRONTEND_PATH, PANEL_PATH, PLATFORMS, VERSION
from .engine import PhaseEngine

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register read-only and admin-only WebSocket commands once."""
    hass.data.setdefault(DOMAIN, {})
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_diagnostics)
    websocket_api.async_register_command(hass, ws_set)
    return True


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Set up a single engine, summary sensor and two frontend presentations."""
    data = hass.data.setdefault(DOMAIN, {})
    engine = PhaseEngine(hass)
    await engine.start()
    data[entry.entry_id] = engine

    try:
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
        if not data.get("_frontend_registered"):
            js_file = Path(__file__).parent / "frontend" / "phase-mapper.js"
            if not data.get("_static_registered"):
                await hass.http.async_register_static_paths(
                    [StaticPathConfig(FRONTEND_PATH, str(js_file), cache_headers=False),
                     StaticPathConfig("/ha_auto_device_phase_mapping_static/brand", str(Path(__file__).parent / "brand"), cache_headers=False)]
                )
                data["_static_registered"] = True
            # Content-hashed URLs also bust caches for locally rebuilt same-version ZIPs.
            frontend_url = f"{FRONTEND_PATH}?v={VERSION}&build={hashlib.sha256(js_file.read_bytes()).hexdigest()[:12]}"
            data["_frontend_url"] = frontend_url
            frontend.add_extra_js_url(hass, frontend_url)
            await panel_custom.async_register_panel(
                hass,
                webcomponent_name="phase-mapper-panel",
                frontend_url_path=PANEL_PATH,
                module_url=frontend_url,
                sidebar_title="Phase Mapper",
                sidebar_icon="mdi:transmission-tower",
                require_admin=False,
                trust_external=True,
                config={},
            )
            data["_frontend_registered"] = True
    except Exception:
        _LOGGER.exception("Failed to set up HA_auto_device_phase_mapping")
        engine.stop()
        await engine.save()
        data.pop(entry.entry_id, None)
        await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
        return False
    return True


async def async_unload_entry(hass: HomeAssistant, entry) -> bool:
    """Stop learning and unhook UI, retaining learning on disk."""
    data = hass.data.get(DOMAIN, {})
    engine = data.get(entry.entry_id)
    if engine is None:
        return True
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    engine.stop()
    await engine.save()
    data.pop(entry.entry_id, None)
    if data.pop("_frontend_registered", False):
        frontend.remove_extra_js_url(hass, data.pop("_frontend_url", f"{FRONTEND_PATH}?v={VERSION}"))
        frontend.async_remove_panel(hass, PANEL_PATH)
    return True


@callback
def get_engine(hass: HomeAssistant) -> PhaseEngine | None:
    """Locate the single engine."""
    for candidate in hass.data.get(DOMAIN, {}).values():
        if isinstance(candidate, PhaseEngine):
            return candidate
    return None


@websocket_api.websocket_command({vol.Required("type"): "ha_auto_device_phase_mapping/get"})
@callback
def ws_get(hass, connection, msg) -> None:
    """Return current mapping state to HA clients."""
    engine = get_engine(hass)
    if engine is None:
        connection.send_error(msg["id"], "not_ready", "Phase Mapper is not ready")
        return
    connection.send_result(msg["id"], engine.export())


@websocket_api.websocket_command({vol.Required("type"): "ha_auto_device_phase_mapping/diagnostics"})
@websocket_api.require_admin
@callback
def ws_diagnostics(hass, connection, msg) -> None:
    """Admin-only, on-demand data export. Never uploaded automatically."""
    engine = get_engine(hass)
    if engine is None:
        connection.send_error(msg["id"], "not_ready", "Phase Mapper is not ready")
        return
    connection.send_result(msg["id"], engine.diagnostics_export())


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_auto_device_phase_mapping/set",
        vol.Optional("phase_sensors"): {
            vol.Required("L1"): str,
            vol.Required("L2"): str,
            vol.Required("L3"): str,
        },
        vol.Optional("excluded"): [str],
        vol.Optional("battery_sensors"): {vol.Required("L1"): str, vol.Required("L2"): str, vol.Required("L3"): str},
        vol.Optional("solar_sensor"): str,
        vol.Optional("battery_sources"): {vol.Required(p): [dict] for p in ("L1", "L2", "L3")},
        vol.Optional("solar_sources"): {vol.Required(p): [dict] for p in ("L1", "L2", "L3", "TOTAL")},
        vol.Optional("solar_phase_estimation"): {
            vol.Required("enabled"): bool,
            vol.Required("currents"): {vol.Required(p): str for p in ("L1", "L2", "L3")},
            vol.Required("voltages"): {vol.Required(p): str for p in ("L1", "L2", "L3")},
        },
        vol.Optional("grid_current_sensors"): {vol.Required(p): str for p in ("L1", "L2", "L3")},
        vol.Optional("grid_voltage_sensors"): {vol.Required(p): str for p in ("L1", "L2", "L3")},
        vol.Optional("phase_current_limits_a"): {vol.Required(p): vol.Coerce(float) for p in ("L1", "L2", "L3")},
        vol.Optional("manual_assignments"): {str: str},
        vol.Optional("manual_devices"): [dict],
        vol.Optional("timing_overrides"): {str: str},
        vol.Optional("display_names"): {str: str},
        vol.Optional("display_icons"): {str: str},
        vol.Optional("dashboard_refresh_seconds"): vol.In([1,2,5,10,30]),
        vol.Optional("battery_discharge_positive"): bool,
        vol.Optional("solar_production_positive"): bool,
        vol.Optional("learning_enabled"): bool,
        vol.Optional("minimum_change_w"): vol.All(int, vol.Range(min=30, max=2000)),
        vol.Optional("reset"): bool,
        vol.Optional("reset_device"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set(hass, connection, msg) -> None:
    """Allow only administrators to alter sensor choices or exclusions."""
    engine = get_engine(hass)
    if engine is None:
        connection.send_error(msg["id"], "not_ready", "Phase Mapper is not ready")
        return
    changes = {key: value for key, value in msg.items() if key not in ("id", "type")}
    try:
        await engine.update_settings(changes)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_settings", str(err))
        return
    # update_settings awaits .storage persistence before returning. Confirm
    # that the requested write was committed; don't make clients guess based
    # on JSON key order when comparing large display name/icon dictionaries.
    response = engine.export()
    response["save_ack"] = {"committed": True, "fields": sorted(changes)}
    connection.send_result(msg["id"], response)
