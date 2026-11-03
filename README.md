# HA Auto Device Phase Mapping

Home Assistant custom integration that passively estimates L1/L2/L3 device assignments by correlating power-sensor changes with HomeWizard P1 phase measurements. Includes a sidebar dashboard and optional Lovelace card.

## v1.6.2 — iOS dashboard stability

Automatic dashboard updates no longer rebuild all dashboard HTML every refresh. Values, progress, and headroom are patched in place. Device-list structure changes are deferred while the user is scrolling, and the external Home Assistant scroll container is preserved for the occasional full rebuild. The native `details` open state and existing handlers are retained. The learning engine and settings are identical to v1.6.1.

To install, back up Home Assistant, replace `custom_components/ha_auto_device_phase_mapping` from the ZIP, restart HA, then fully restart the iOS Companion app. Verify frontend/backend **v1.6.2** under Learning Diagnostics. Do not delete the integration or `.storage` directory.

## v1.6.1 — Self-healing learning workers and reliable version diagnostics

This release addresses real observations of **queued device transitions with zero active workers**. The learning engine checks worker and queue health on **every 1-second corrected P1 history tick** and independently on the **15-second maintenance interval**. A queue with no running worker restarts automatically; a worker making no progress for 45 seconds is cancelled, its unfinished transition is returned to the front of its queue and it is retried after a bounded backoff. Recovered transitions still use their original timestamps and cannot count the same electrical step twice.

- **Worker ownership and completion tracking:** One in-flight event per device is tracked explicitly, even if the Home Assistant task is cancelled before running or unexpectedly exits. Recovery uses task-identity checks so callbacks from old cancelled workers cannot clear a newer replacement.
- **More resilient queue:** FIFO remains bounded to 256 events per sensor, rather than silently losing reports after only a few bursts. Sequential same-direction updates within 12 seconds (such as 3 → 664 → 1421 W) may be combined into one pulse, while opposite ON/OFF changes stay distinct. A full buffer still logs an overflow instead of pretending the old event was evaluated.
- **Independent recovery paths:** The 1-second sampling watchdog and 15-second maintenance watchdog can independently restart stranded queues. Unexpected watchdog errors are logged and never interrupt corrected-power sampling. Repeated task failures are rate-limited rather than causing endless immediate retry loops.
- **Truthful diagnostics:** New counters expose orphan-queue recoveries, stalled workers, interrupted-step retries, timeouts and merged staged updates. Learning Diagnostics explicitly compares **frontend build version and running backend version**. If they disagree, restart Home Assistant and hard-refresh; a dashboard showing v1.6.0 while the JSON export reports engine v1.5.11 is a mixed-version installation, not a valid test of the new backend.
- **Safe migration:** No changes to storage schema, saving/renaming logic, confidence scoring or source configuration. Existing names, icons, mapped devices, tentative slow votes and accepted evidence persist. Restart clears *in-memory* pending queues but does not clear saved learning data.

**Install carefully:** Back up `/config/.storage`, replace the complete integration folder, **restart Home Assistant** (a dashboard refresh alone does not replace Python code), hard-refresh the dashboard, and check that **both versions say v1.6.1** in Learning Diagnostics. Wait for new transitions before comparing since-restart counters.

## Previous release: v1.6.0 — Queued learning and staged coffee pulses

v1.6.0 introduced per-device queue workers and fast power pulse aggregation. This update hardens that lifecycle and adds independent recovery; high-power and 5-second sensors retain the existing -12/+7 second matching window.

## v1.5.11 — Faster, lag-tolerant learning for 5-second devices

- **Fast device correlation now searches time both ways**: for each detected device change, the engine searches battery/PV-corrected L1/L2/L3 measurements from **12 seconds before** to **7 seconds after** its Home Assistant report, comparing short median plateaus on all three phases at the **same** electrical instant. This recognizes a coffee-maker heating pulse that reaches the P1 meter before the entity publishes its new wattage, or slightly afterward.
- **Correct Automatic timing mode**: a sensor reporting every 5 seconds is fast even if the coffee machine's power changes only once per hour. The engine now prioritizes actual Home Assistant reporting cadence over the interval between physical power transitions when a measured cadence is available.
- **Queued fast transitions stay fast**: their original report timestamps are retained and each is analyzed against past samples, even when the coffee maker has already switched again. Do not require the latest sensor reading to remain at an older level when testing an older event.
- **High-power & short pulses**: two overlapping short median-window sizes accommodate brief 5–8-second coffee-maker heater pulses as well as steadier loads. Unique phase correlation can immediately create accepted evidence; it does not have to wait for three slow tentative votes. Competing phase changes and ambiguous repeated edges are rejected.
- **Larger bounded fast queue**: up to 24 queued changes per sensor, accommodating busy 1–5-second reporters without dropping useful pulses during the 12-second collection interval.
- **Prevent duplicate confidence inflation**: a repeated 5-second HA report cannot earn evidence twice from the same electrical edge. Real separate ON/OFF transitions can accumulate confidence rapidly.
- **Improved per-device diagnostics**: recent result messages report the matched phase, device and P1 watt changes, and the time offset. `fast_timeline_no_match` and `fast_timeline_duplicate` explicitly identify the reason for no new observation.
- **Unchanged**: the saving fixes from v1.5.10, slow Zigbee/airco matching, manual appliances, custom names, icons, mapped tiles, and existing learning persistence. No reset necessary.

## Previous release: v1.5.10

- Delayed Zigbee bed heaters can now earn a **provisional** L1/L2/L3 mapping from three very clear, independent same-direction (ON-only or OFF-only) historical correlations. Saved evidence is reevaluated on restart; no prior evidence is erased. Provisional mappings show a red confidence dot until stronger bidirectional evidence is observed.
- Fix false `id` save errors after renaming, deleting or creating appliances: Home Assistant's WebSocket message identifier is no longer treated as a setting requiring confirmation.
- Keep **mapped device names** in muted grey, **icons** in their respective phase colors, and make the Mapped devices inset background subtly darker than each phase gradient.

Existing learning data, appliance names, icons, battery/solar/P1 configuration, and manual assignments are preserved. Back up `.storage` before upgrading and refresh the browser after restarting Home Assistant.

## Previous release: v1.5.9 — Settings persistence correction

Manual appliance deletion, device display-name edits, and icon edits now save without accidentally resending untouched phase/battery/solar settings. The frontend compares nested settings structurally rather than depending on dictionary key order. The server explicitly confirms persisted updates after storage completes. If verification fails, the UI reports which setting differs and preserves the draft for retry. All learning evidence and device metadata survive an upgrade. See `RELEASE_NOTES.md` for details.

## v1.5.8: Device editing save fix + after-dark slow-learning recovery

- **Fixed manual appliance deletion blocking subsequent edits:** a broad frontend `change` listener was treating events from phase-panel device dropdowns as updates to Settings → P1 power selectors. Choosing **Delete** accidentally generated an illegal `phase_sensors.undefined: "__delete__"` field, and the Home Assistant WebSocket rejected the entire save. Only actual P1 sensor dropdowns can now modify `phase_sensors`.
- **Renames and icons save again:** per-device display settings and manual-device changes use the same confirmed partial-settings save. The frontend does not show a completed-success message until Home Assistant acknowledges the changed values. On failure, edits remain pending, a visible error appears, and **Retry saving** is available.
- **Nighttime learning fix for stale SolarEdge 0 W:** some solar integrations stop reporting an unchanged 0 W value after sunset; the previous hard 12-second freshness check wiped the corrected phase-power learning history once per second, making overnight ON/OFF cycles unlearnable. The engine now accepts a stale 0 W solar reading **only** if Home Assistant `sun.sun` reports `below_horizon` and solar elevation is at least 3° below the horizon. Fresh P1 and battery sensor data is still mandatory. Daytime, twilight, unavailable and nonzero solar values never receive this fallback. It applies to solar sources only, not P1 or batteries.
- **Learning Diagnostics** now indicates when the special nighttime 0 W fallback is active, and the JSON export includes a matching flag. This provides a testable explanation for overnight stalls, but we still need a new real export to verify the Bed heating left's specific past events.
- **Preservation:** existing learned observations, provisional votes, manual appliance inventory, custom names/icons, phase assignments, exclusions, and save format remain unchanged. No reset is needed. Incorrect/uncertain phase predictions remain possible; this integration is not electrical-safety equipment.

## v1.5.7: Reliable settings persistence and per-device learning reset

- **Fix dashboard edits not being saved:** settings autosave now sends only the fields you actually changed. Previously renaming a device or adjusting its icon could resend every P1, battery and solar selection. If an unchanged source was temporarily unavailable, the server could reject the entire unrelated edit. This release avoids that revalidation.
- **One ordered autosave queue:** manual phase assignment, Automatic phase restoration, and Exclude now use the same autosave path as device names/icons, manual appliances, timing, and Settings. Changes are confirmed against the server's response; failed saves keep the draft for retry. Old, overlapping dashboard refresh responses cannot roll back a successfully saved change.
- **Safe on-disk writes:** storage checkpoints are serialized, so an older periodic checkpoint cannot finish writing after a newer settings save and restore an obsolete file.
- **Reset one sensor only:** in **Settings → Recognized Power Sensors**, choose **Reset learning…** below Automatic / Slow / Fast. A warning dialog must be confirmed. The selected sensor's accepted observations, confidence, learned phase, slow matches, hints, queued transitions, diagnostics and any manual phase override are cleared, then its blank evidence is immediately persisted. Its name, MDI icon, timing mode, exclusion and current power reading are preserved; all other devices and learned mappings remain intact.
- **Reset all** remains available as a separate Settings action; neither reset action requires re-validating unrelated unavailable battery/solar sources.
- No changes to the v1.5.5 power-correlation model, learning thresholds, PV/battery corrections or storage filename. **Back up Home Assistant `.storage` before installing.**

## v1.5.6: Restrained phase-themed dashboard and cleaner Settings

- The four phase/household tiles use **subtle color-tinted backgrounds** and compact rounded inner sections. L1 is blue, L2 amber, L3 purple, and Household total teal. Device names and Home Assistant icons follow **their own phase color** consistently. The distinct red/orange/green dots still indicate automatic-mapping evidence strength rather than device identity.
- **Unknown devices** and **Mapped devices** are now visually separated by softly tinted inset panels; live mapped-device progress bars remain phase-colored. The phase tiles are less saturated than the experimental neon mockups.
- **Household total / Not yet mapped** occupies the space opposite L1/L2/L3 grid-current headroom. Household **Unknown devices** is directly below and vertically aligns with the three phase Unknown devices sections. These are the same residual estimates as before; only their placement changed.
- The four lower Mapping tools (**Mapped devices** evidence, **Still learning**, **Add appliance**, **Learning diagnostics**) have unified neutral slate styling, consistent spacing, actual Home Assistant icons, and subdued gradients. These utility sections deliberately **do not inherit phase colors**. Device names/icons *inside* the expanded Still learning list use the turquoise of the Phase Mapper logo for readability.
- Settings sections are now independently **collapsible**, remembering their expanded/collapsed state in the current browser. The existing configured P1/battery/solar selections, headroom sensors, and SolarEdge settings are unchanged. Within each Settings group, sensor fields have gently phase-tinted backgrounds and borders that make the L1/L2/L3/TOTAL columns easier to scan. Collapsing a section does not change or save a sensor setting.
- This is a **frontend-only redesign**: the v1.5.5 learning algorithm, Home Assistant storage format, assigned phases, diagnostics export, automatic mapping confidence thresholds, and manual device data remain unchanged.

## v1.5.5: Faster statistical mapping, 50 W changes and confidence indicator

Automatic phase assignment now combines crisp ON/OFF transitions with time-averaged changes for slowly reporting Zigbee sockets and airco devices. The default change threshold is 50 W. Strong, agreeing evidence maps devices sooner while conflicting phase changes continue to reduce confidence. The three colored dots beside automatically mapped names mean red (<70%), orange (70–89%), green (90%+); they indicate relative evidence strength, not a calibrated probability.

Household total separates its unknown-load estimate into **Unknown devices** (not covered by HA power sensors) and **Not yet mapped** (included power sensors still learning). Both show watts, household percentage, and grey bars side by side; overlapping sensors can affect this display-only estimate. Open **Learning diagnostics → Export learning diagnostics** to download recent corrected phase and device readings in a JSON file for investigating failed or delayed matches. This file includes entity names and usage timestamps.

Existing users with the previous factory-set 100 W minimum automatically move to 50 W only once; user changes made afterward persist. No saved learning observations, mappings or display customizations are deleted.

## v1.5.4: Improved slow sensor correlation and faster high-power confirmation

- Better matching for Zigbee power plugs updating around every 60 seconds, including 100–120 W low-power heating devices; ON/OFF edges near standby can pass a limited adaptive threshold instead of being dropped at exactly 100 W.
- Delayed reports can be matched to isolated corrected P1 electrical steps using concurrent L1/L2/L3 median plateaus, with competing-phase rejection and distinct ON/OFF evidence. Corroborated saved slow votes are credited once without being replayed after a restart.
- Clear multi-kilowatt loads such as a single-phase EV charger can confirm a phase sooner after two strong, separate ON/OFF measurements that agree on the same phase; one sustained ON load or phase load-feasibility hint cannot establish a mapping.
- **Still Learning** now remembers expanded/collapsed state across dashboard navigation in this browser.
- No manual remapping required and existing learning history, custom names/icons and settings remain intact.

## v1.5.3: Compact mapped appliances and reliable narrow-screen layout

- The **Automatic / Manual** selectors are less prominent and consistently sized. Device names wrap at words for up to two lines and never cascade vertically letter-by-letter.
- Unknown device headings have the same primary text color as Mapped devices, while estimated watts/percentages and their bars stay grey. All consumption bars use a fixed height, radius and layout.
- The Mapped devices section displays **either** individual device rows (expanded) **or** one combined phase/household total with a colored contribution bar (collapsed), never both. All four panels share the toggle state.
- Learning, persistence, custom names, custom icons, battery/solar compensation and settings are untouched.

## v1.5.2: Phase-matched bars, unmetered residuals and household totals

- Manual appliances share the same flat styling as live mapped devices. Their room is shown beneath the name where other devices display wattage; their phase selector reads **Manual** until opened and provides the move and delete actions.
- Monitored mapped appliances show measured watts and phase share **on one line**, followed by a progress bar in the corresponding phase color: L1 blue, L2 amber and L3 purple.
- A grey **Unknown devices** residual row is shown for each phase and for Household total, with calculated watts, percent share and a grey bar. This estimates **positive cleaned household load minus known mapped sensor power** and is not a separately measured sensor. When individual corrected values are negative due to short-lived measurement mismatch, their contribution to the residual is floored at zero. Missing corrected data is shown as unavailable.
- The Household total panel now displays the **count of all mapped appliances** (including manual appliances with no power sensor), **combined measured mapped power** (excluding unmetered manual appliances), and unknown residual. Three-phase sensor power is split one third per phase for residual estimates, and counted only once in the household sensor total; this is only a balanced-load estimate.
- Household total's mapped section is vertically aligned with the mapped sections in L1/L2/L3.
- The name/icon editor and manual appliance creator offer icon search suggestions rendered with actual Home Assistant icon components and descriptions; arbitrary valid `mdi:...` names remain accepted.
- The automatic learning algorithm, existing phase evidence, sensor polling and `.storage` schema are unchanged.

## v1.4.10: Delay-aware ON/OFF learning and provisional phase hints

The automatic learner now queues additional changes while a prior evaluation for the same sensor is running, instead of recording `already_pending` and losing those changes. The queue is bounded and never feeds obsolete events into a current-time comparison. This avoids extra false correlations.

For slow sensors (LG airco and other cloud integrations), the engine now compares multiple ON and OFF reports against lagged **cleaned phase consumption** for the preceding 30 minutes. Where a simple step is not visible, it evaluates stable phase-power plateaus and repeated ON/OFF profiles across candidate offsets. It requires consistent ON and OFF evidence and competing-phase rejection; one lucky historical match cannot trigger an automatic phase assignment. The best fitting lag is only an alignment estimate, not the sensor's actual reporting delay.

A device may show **Likely L1**, **Likely L2**, or **Likely L3** in Still Learning after at least two independent supporting preliminary clues. Load-feasibility hints come from clear OFF→ON transitions when only one cleaned phase has enough measured load to support the device's reported power. These weak hints are shown separately from **confirmed evidence**, and **never by themselves map a device**. Devices with weak hints stay in Still Learning until accepted observations meet the stricter mapping threshold. Clues are stored in `.storage`, bounded, and expire after 14 days. Previous accepted observations, existing saved tentative votes, manual mappings and exclusions are preserved during upgrade.

Learning diagnostics shows queued transitions and accepted/saved vs tentative counts. Both the full dashboard and the compact card use the same engine data; no new settings are necessary.

## v1.4.9: Tentative slow-sensor evidence survives restarts

- Historical-matching **tentative votes** are stored in the same Home Assistant `.storage/ha_auto_device_phase_mapping.learning` file as accepted phase evidence. The file now contains `slow_votes` in addition to the existing `settings` and `results` keys. Old installations load normally if that optional key is absent.
- Each tentative vote stores the candidate phase, up/down direction, quality, and a **real timestamp**. This is important because Python monotonic timestamps cannot be reused after a reboot. Each device retains at most 12 recent votes; votes expire after 14 days.
- A match is **not automatically accepted** because it survived a reboot. The same repeated-event, opposing-direction and unique-timing safeguards still apply. Rejected transitions and invalid source measurements never create phase assignments.
- The dashboard shows **Saved tentative slow matches** on relevant devices and **Total accepted observations (saved)** in Learning diagnostics. **Checks since restart** and rejection counters intentionally restart from zero. The measured sensor refresh interval and the last 30 minutes of corrected-power history also restart and must be observed again.
- Tentative votes are flushed on normal Home Assistant shutdown and alongside ordinary learning data; periodic checkpoints run when there are unsaved changes. A sudden power interruption can still lose the latest uncheckpointed seconds.
- **Reset learning** or changing the P1/battery/solar correction model clears tentative votes too, to avoid mixing incompatible evidence. An explicit reset archives the previous votes alongside its accepted evidence. Pure UI settings or normal software upgrades do **not** clear them.
- Upgrading from v1.4.8 preserves accepted observations but cannot recover tentative votes from before v1.4.9, because prior versions never stored them.

## v1.5.0 dashboard and device appearance

The three mapped phase appliance lists now sit directly beneath the corresponding L1/L2/L3 power summaries. They show only the device name/icon, live measured power where available, phase contribution and manual-assignment control. Battery sources are **not** duplicated as appliances, but continue to contribute to the phase and household energy figures. Three-phase appliances sit under Household total.

Expand **Mapped devices** beneath the phase tiles to inspect the full evidence, report refresh timings and diagnostics for already mapped power sensors. Expand **Still learning** to see all unmapped power sensors without a second scroll bar. Both sections start collapsed and remember their state while navigating tabs. Expand **Add appliance** or **Learning diagnostics** when needed.

Use the pencil beside **any** sensor or manual appliance to customize its display name and Home Assistant Material Design icon (`mdi:...`), with icon suggestions in the editing dialog. This does not edit the actual HA entity. Manual appliances also support optional room names, an initial icon picker, and confirmed deletion from the phase dropdown. Manual appliances remain informational and have no power readings.

Click the installed version in the header, or visit **Info → Version and repository**, to open the GitHub repository after a confirmation dialog. The Info page checks the latest published release using the public GitHub API when available (six-hour cache). **Private repositories or repositories without releases show “Not verified”;** no GitHub token is requested, stored, or transmitted. This is a release comparison, not a latest-commit comparison.

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

## v1.4.5 live display

Use Settings → Dashboard refresh to choose 1/2/5/10/30-second updates (default 2). Battery and solar source selectors include signed live readings. Battery sources remain excluded from learning and are shown in the phase summary, not in mapped appliance lists. SolarEdge V×I phase share estimation falls back to equal-thirds for display when unavailable; automatic learning pauses until reliable shares resume.

## v1.4.6: interval-aware learning and manual appliances

- Automatically measures the observed **interval between changed power readings**. Fast power sensors retain the original near-real-time correlation; sensors with repeated intervals above ~25 seconds are evaluated against historical corrected phase measurements.
- For a 5–10 minute polling sensor, the actual electrical event might occur anywhere between reported updates. The historical matcher searches that reporting interval, up to 10 minutes, using stable multi-sample phase steps and rejects ambiguous competing matches. It requires multiple consistent events in both directions before recording slow learning evidence. Do not interpret evidence as a calibrated probability.
- **Settings → Sensor reporting timing** includes optional per-entity Automatic / Fast / Slow overrides; leave Automatic unless troubleshooting unusual sensors. Report cadence and tentative historical matches appear in learning diagnostics. The history buffer is 30 minutes when corrected measurements remain valid; stale compensation still pauses learning.
- **Mapping → Add appliance without a Home Assistant power sensor** creates a named, optional-room entry assigned to L1, L2, L3 or three-phase. You can move or delete it, and it persists through restarts. Manual inventory items have no live power, cannot be used as measured consumption, and are not part of automatic learning.

## v1.4.7: Consolidated sensor management and responsive dashboard

- Reorganized the panel header: branded logo, Mapping/Settings/Info navigation, and three compact colored counters, all in one row across phone, tablet and desktop. The full panel keeps its sidebar-menu button.
- Replaced separate timing and exclusion sections with **Recognized Power Sensors**. Search by name/entity ID; enter comma-separated naming tags to filter matching names; bulk exclude or restore with confirmation, or use each row's Exclude/Restore button and Automatic/Fast/Slow selector.
- Settings show a **measured Home Assistant refresh interval** in seconds when available. It uses `last_reported` where supported, and starts with `— s` until enough new reports are seen after Home Assistant restarts. It does not claim to measure physical device latency. The historical learning algorithm's change cadence remains separate.
- Mapped sensor devices can be renamed using the pencil control; the Home Assistant entity/friendly name stays unchanged, and clicking the name still opens More info. As of v1.5.0, Still Learning devices also have display-name and icon editing.
- Still Learning has its own instant name/entity search field. Mapped device detail rows now indent secondary information.
- Solar values are yellow, battery discharge values green, battery charging orange, and idle values neutral. The Household Total phase badge uses blue **L1**, white **+**, amber **L2**, white **+**, violet **L3**.
- Drag-and-drop requires actual mouse pointer input; touchscreen interactions use the phase selector. No electrical control operations are added.

**Migration:** all learning evidence, manual assignments, exclusions, compensation sources and existing timing overrides remain in Home Assistant's `.storage` file. The new optional display-name mapping is stored alongside the existing settings; no learning reset is needed.

## v1.4.8: Reliable manual entries and header refinements

- Manual devices without HA sensors can be added repeatedly, immediately moved between L1/L2/L3 and three-phase, renamed, or deleted (with confirmation). The page renders current, unsaved edits while autosave sends them to the backend. A failed save remains visible, and the draft is retained.
- Rename batteries using the larger pencil next to a system-assigned battery's name. This only affects Phase Mapper; Home Assistant's entity remains unchanged and the row opens native More info.
- The full dashboard now uses a flat, full-width top bar with the logo, left-aligned tabs, neutral grey Detected/Excluded cards and a green Mapped card on the right. Controls are responsive down to a 320px viewport.
- General mapping search, Show excluded, manual appliance entry and diagnostics appear after the phase lists; the independent Still Learning filter stays next to its list.
- Main phase tiles display **Sum of loads** instead of Cleaned household load, with solar and battery discharge in matching softer green, charging in orange, and a white household L1 + L2 + L3 badge.

**Data preservation:** The storage key remains `ha_auto_device_phase_mapping.learning` under `.storage`. This update does not delete manual devices, evidence, phase overrides, exclusions, or compensation sources. Take a backup anyway before upgrading.

## v1.5.2 dashboard controls

Unknown devices are displayed first, with estimated residual watts and percentage in secondary grey, aligned to mapped appliance bars. Mapped devices across L1, L2, L3, and Household total use a synchronized Show/Hide toggle. The aggregate mapped watts/percent always remain visible, and the view preference is stored in that browser. Native HA MDI icon search is used when `ha-icon-picker` is already registered by the HA frontend, with a typed/fallback picker otherwise.
