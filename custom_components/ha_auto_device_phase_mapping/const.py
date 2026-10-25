"""Constants for the passive HA_auto_device_phase_mapping integration."""

from copy import deepcopy

DOMAIN = "ha_auto_device_phase_mapping"
VERSION = "1.4.4"
PLATFORMS = ["sensor"]
PHASES = ("L1", "L2", "L3")
FRONTEND_PATH = "/ha_auto_device_phase_mapping_static/phase-mapper.js"
PANEL_PATH = "ha-auto-device-phase-mapping"

DEFAULT_SETTINGS = {
    "phase_sensors": {"L1": "", "L2": "", "L3": ""},
    "excluded": [],
    "grid_current_sensors": {"L1": "", "L2": "", "L3": ""},
    "grid_voltage_sensors": {"L1": "", "L2": "", "L3": ""},
    "phase_current_limits_a": {"L1": 25.0, "L2": 25.0, "L3": 25.0},
    "battery_sensors": {"L1": "", "L2": "", "L3": ""},
    "battery_discharge_positive": True,
    "battery_sources": {"L1": [], "L2": [], "L3": []},
    "solar_sources": {"L1": [], "L2": [], "L3": [], "TOTAL": []},
    "solar_phase_estimation": {"enabled": False, "currents": {"L1": "", "L2": "", "L3": ""}, "voltages": {"L1": "", "L2": "", "L3": ""}},
    "manual_assignments": {},
    "evidence_archive": [],
    "solar_sensor": "",
    "solar_production_positive": True,
    "minimum_change_w": 100,
    "tolerance_ratio": 0.30,
    "window_seconds": 4.0,
    "learning_enabled": True,
    "dashboard_refresh_seconds": 2,
}


def default_settings():
    """Return independent settings for a new installation."""
    return deepcopy(DEFAULT_SETTINGS)
