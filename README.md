# HA Auto Device Phase Mapping

Home Assistant custom integration that passively estimates L1/L2/L3 device assignments by correlating power-sensor changes with HomeWizard P1 phase measurements. Includes a sidebar dashboard and optional Lovelace card.

## Manual install via Samba

1. Back up Home Assistant first (including `.storage`).
2. Extract the release ZIP on your PC.
3. Copy `custom_components/ha_auto_device_phase_mapping` to `\\10.10.20.152\config\custom_components\ha_auto_device_phase_mapping` (or your Home Assistant share's equivalent path), overwriting files.
4. Restart Home Assistant completely; hard refresh the browser with Ctrl+F5.
5. If not already added, install **HA_auto_device_phase_mapping** from Settings > Devices & services > Add integration.
6. Open **Phase Mapper** in the sidebar; configure P1 L1/L2/L3 in Settings, plus optional battery and solar compensation sensors.
7. To show it in an existing dashboard, add manual card YAML:

```yaml
type: custom:phase-mapper-card
```

No extra JS resource is required on a standard supported frontend setup; the integration registers it.

## Setting up compensation

Add any number of battery AC power sensors to the phase they **physically connect to**; their commands may offset consumption on other phases, but the electrical injection remains local to that phase. Tick +W when that battery's power sensor is positive while discharging, uncheck otherwise.

Solar can be added individually to phase groups L1/L2/L3, or to the TOTAL group when an inverter only reports summed balanced three-phase AC generation. TOTAL production is equally allocated across L1/L2/L3; this is an approximation. Tick +W when its sensor reads positive for generation.

Do not select duplicate power sources (e.g. a per-phase sensor AND its aggregate) or an entity already used as a P1 grid source. Signed W power sensors only.

## v1.4.1 phase measurement and headroom

Optional SolarEdge phase allocation uses inverter AC Current A/B/C and AC Voltage AN/BN/CN to weight the measured total AC real power per phase. It assumes broadly comparable power factors. Equal 1/3 allocation remains default until switched on.

Choose individual P1 current sensors in A and phase voltage sensors in V and set each main current limit (default 25 A). The colored headroom bar is green below 70% utilization, amber from 70% to 90%, red from 90%. This uses actual P1 grid current and does not control electrical loads.

Changes in Settings save automatically; look for “All changes saved.” Reset learning has a double-confirmation dialog, while manual assignments, excluded sensors and measurement settings are preserved. Included devices are marked green in the exclusion manager; excluded devices and Restore controls are red.

## Mapping dashboard

- Click an individual device to open Home Assistant native More info.
- Drag it to L1/L2/L3 (or three-phase) for a persistent manual override. Alternatively choose a manual phase from its selector; select **Automatic** to return to the learned assignment.
- Device power and percentages are snapshots; percentages are suppressed when phase demand is missing, <=50 W, or a device appears to exceed the load (overlapping/duplicate sensors can cause misleading sums).
- Exclusions automatically hide excluded entities from the available exclusion list. Toggle **Show excluded** to restore them. A device may also be excluded from its mapping dropdown.
- Selected source sensors are not analyzed as device candidates.

## Learning preservation

Learning, exclusions, source choices and manual overrides are saved in `/config/.storage/ha_auto_device_phase_mapping.learning`, outside the integration code folder. Replacing the code and restarting preserves this file. If a measurement source or polarity is changed, active correlation evidence is cleared to avoid invalid mixes; a recoverable archive remains inside the same storage file (not yet restorable from the UI). Manual overrides and exclusion settings remain.

**Experimental.** No actual power devices are controlled by this integration. Its inferred phase wiring is not safety-grade.

## v1.4.2 current-direction support

Main connection current sensors may be signed: negative P1 current is grid export, not unavailable data. Headroom uses the magnitude `abs(current)` for all three phases and displays the original direction. This remains informational only.

## v1.4.3 live measurement labels
In **Settings**, every selected power, current, and voltage sensor now shows its live value, unit and last-update age directly below the selector. Click a live value for Home Assistant More info. A yellow age label warns that the entity has not reported in over 12 seconds; it does not mean the sensor is broken.

## v1.4.4 live display

Use Settings → Dashboard refresh to choose 1/2/5/10/30-second updates (default 2). Battery and solar source selectors include signed live readings. Battery rows are system-assigned to their configured phases and remain excluded from learning. SolarEdge V×I phase share estimation falls back to equal-thirds for display when unavailable; automatic learning pauses until reliable shares resume.
