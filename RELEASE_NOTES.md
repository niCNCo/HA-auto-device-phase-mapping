# Version 1.4.4 — Live power and resilient solar display

- Corrected live breakdown continues showing raw grid and available compensation even when a source is unavailable.
- When total SolarEdge power is near zero, no V×I phase estimates are required. When active generation is present but the V×I measurements are stale, the UI displays an explicitly labeled equal-thirds *fallback*. **Learning is paused for fallback samples**, and old sample history is cleared, preventing incorrect cross-gap correlations.
- Battery power now reads **Battery charging**, **Battery discharging**, or **Battery idle** using the configured power sign. Magnitudes are displayed positively while the cleaned-load arithmetic remains unchanged.
- Every configured battery source is shown at the top of its assigned phase devices, with live wattage, direction, and native More info. Battery sources are excluded from appliance percentages and from mapping candidates.
- Live readings now appear below *each* battery/solar selector.
- User-configurable dashboard refresh: 1, 2 (default), 5, 10 or 30 seconds. Learning cadence stays independent. Settings controls are not replaced on background fetches.
- Retains the existing `.storage` database, learned assignments and settings.

### Important
Fallback solar power is an **estimate** and must never train the automatic mapper. No load control is performed. Tested by static and standalone tests, not yet validated in a live Home Assistant environment.

# v1.4.3 — Live readings in Settings

- Displays the actual Home Assistant sensor value, signed units, and age below each configured P1 power, grid current, grid voltage, battery, solar, and SolarEdge inverter V/I selector.
- Shows unavailable/unknown/not selected states. Readouts update from Home Assistant state pushes without rerendering sensor dropdowns or resetting the exclusion-list scroll.
- Selecting a different sensor updates its adjacent reading immediately; clicking a reading opens the native More info dialog.
- A reading older than 12 seconds is highlighted amber as a diagnostic only; no validation or learning behavior was changed.
- No changes to measurement corrections, persistence, manual assignments or learning algorithm.

Install via Samba by copying `custom_components/ha_auto_device_phase_mapping` over the existing folder, restarting Home Assistant, and pressing Ctrl+F5 in the browser. Preserve `.storage` and take a backup before upgrading.
