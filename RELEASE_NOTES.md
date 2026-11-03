# v1.6.5 — Household ring layout refinement

- Enlarged the household two-ring chart in the main dashboard and compact Lovelace card.
- Moved phase and device-coverage legends into two legible, responsive groups beneath the graph, rather than shrinking the chart to fit alongside them.
- Matched the subtle segment glow to each corresponding phase or coverage color.
- Kept the original four-column dashboard, measurement calculations, battery/solar configuration, and phase-learning engine unchanged.

---

# v1.6.4 — Release update indicator

- Automatically check published GitHub releases, including pre-releases, when the Phase Mapper frontend opens and every three hours while it stays open.
- Keep the green learning-status dot separate from the installed-version indicator: green means no newer published release, red means a newer release exists and neutral means unverified.
- Add **Check now** to the Info tab, bypassing the refresh interval; clicking the version opens the newer GitHub release page when one is available.
- GitHub API failures and missing release data never falsely claim the installation is up to date. The phase-learning logic and stored evidence are unchanged.

---

# v1.6.3 — Lovelace layouts, household power rings and optional battery SoC

- Added a **Compact** Lovelace card with L1/L2/L3 and Household total, including live phase loads, grid current headroom, unknown load estimates and expandable mapped devices. The previous list remains available as **Detailed** in the visual card editor.
- Added a restrained dual-ring Household total graph to both the compact card and main dashboard. Outer ring = share of load on L1/L2/L3; inner ring = mapped, unknown and not-yet-mapped coverage. Ring segments have subtle glow.
- Added optional battery SoC sensor selectors for each configured battery power source. Show known percentages alongside battery power. **No battery? No solar?** The corresponding power lines are omitted from the card and Mapping overview.
- The percentage selectors do not influence the phase-correlation engine or battery/solar compensation; changing SoC alone does not invalidate learned evidence.
- Keeps the original four-column Mapping layout and Home Assistant iOS scroll-stability behavior. No migration or learning reset is intended.
- This release is a beta; backup your Home Assistant configuration and test the dashboard and card with real sensors.

---

# v1.6.2 — iOS dashboard flicker and scroll stability

- Fix the Home Assistant iOS Companion app repeatedly jumping or flickering while scrolling: automatic refreshes now update existing text, values, colors and meter bars **without replacing the entire dashboard DOM**.
- Preserve native `<details>` open states, keyboard focus, touch scrolling and event handlers during live refresh.
- Detect newly added or moved devices; allow a structural refresh after the page has been idle for 8 seconds, while restoring Home Assistant's scroll container position. A manual **Refresh** remains available.
- Avoid restarting the same refresh timer after every backend poll. Keep all v1.6.1 learning, queue recovery, watchdogs, persistence, device appearance and settings logic unchanged.
- Frontend and backend versions now both report 1.6.2 to avoid mixed-install diagnostics.

**Installation:** Back up Home Assistant first; copy `custom_components/ha_auto_device_phase_mapping` from the ZIP into `/config/custom_components/`, replacing the existing integration folder. Restart Home Assistant and fully reopen the iOS app so the new JavaScript loads. Do not delete `/config/.storage` or remove the HA integration.

**Verification:** The dashboard should continue updating while you scroll, without returning to the top. The learning diagnostics should show frontend 1.6.2 and backend 1.6.2. The change has offline test coverage but still requires real iOS testing.

# v1.6.1 — Automatic orphan-queue recovery, task timeouts and backend/frontend version verification

- **Fix observed queue stalls:** After a v1.6.0 dashboard reported 28 queued transitions, 0 active workers, and 0 completed evaluations, add a device-queue watchdog on both the 1-second P1 sampling cycle and the 15-second maintenance cycle. A pending FIFO with no owner is restarted automatically, even when no further device state events arrive.
- **Rescue interrupted work:** Track the single in-flight transition separately from queued transitions. A completed or unexpectedly cancelled worker returns an unfinished event to the front of the FIFO. A worker with no completed progress for 45 seconds is cancelled and retried. Ownership identity guards prevent late callbacks from interfering with replacement tasks. Each matching electrical edge / persisted slow vote is de-duplicated before being credited again.
- **Bounded retry/backoff:** Worker start errors and evaluation timeouts retain events and back off repeated failures. Failed task creation closes its coroutine. Watchdog exceptions cannot suppress the phase-history sampling loop. Queues wait until corrected history is valid rather than discarding their contents on a short outage; events expire when no longer represented in the 30-minute retained history.
- **Reduce excessive queue growth:** Increase FIFO capacity to 256 transitions per device, combine consecutive same-direction staged sensor changes occurring within 12 seconds, but keep ON/OFF changes separate. Queue overflow is still measured accurately if a hard cap is reached.
- **Expose mixed-version installs:** v1.6.0 dashboard with backend diagnostic export identifying `1.5.11` was observed. Learning Diagnostics now displays `backend v1.6.1 / frontend v1.6.1` and warns when different. The UI's own version number alone cannot confirm backend Python has reloaded.
- **More diagnostic counters:** Include orphan recoveries, stalled-worker restarts, unfinished-step retries, queued updates combined, start failures, timed-out evaluations, and in-flight evaluation counts. The unchanged saving/renaming behavior from v1.5.10 is preserved.
- **Regression tests:** Stress queued fast changes, test orphan queue without a worker, stalled worker cancellation, task-creation failure/retry, worker cancellation before completion, staged updates preserving opposite edges, and independence between devices. All tests are synthetic and include no household measurement data.

**Install:** Back up Home Assistant and `.storage`. Replace the entire `custom_components/ha_auto_device_phase_mapping` directory, restart **Home Assistant itself**, hard-refresh the browser and verify backend and frontend both report **v1.6.1**. Old accepted evidence remains, while in-memory queues and since-restart diagnostics start fresh. GitHub publishing remains manual.

---

# v1.6.0 — Per-device queue workers and complete fast heating pulses

- Replaced chained pending evaluations with one owning worker per power sensor. It serializes queued transitions and retains their original report timestamps.
- Added fast heating-pulse aggregation so an appliance reporting a staggered 3 → 664 → 1421 W rise can be compared against a full P1 phase step. Competing phases and duplicate electrical matches are rejected.
- Added queue and worker counters including evaluations completed, active worker count, oldest worker age and queued changes. Real installations subsequently exposed a possible orphan-queue failure, addressed by the independent watchdog in v1.6.1.
- No storage migration and no modifications to saving or manual device appearance.

---

# v1.5.11 — Fast-device timeline matching (5-second coffee-maker / Zigbee sensors)

- **Both directions of time:** replace the rigid 4-second fast-sensor snapshot comparison with per-event historical correlation spanning -12 to +7 seconds around a reported power change. This compensates for P1 measurement lead or lag and 5-second device reporting latency. Each candidate electrical edge is evaluated using medians taken before and after that edge, across all three corrected phases at the same timestamps.
- **Fix false slow classification:** v1.5.10 took the maximum of sensor *reporting interval* and the time between distinct power changes, so a coffee maker unused for an hour could wrongly be treated as a slow sensor despite fresh readings every 5 seconds. Use actual Home Assistant reporting cadence when available, falling back to change cadence only when necessary. Manual Fast/Slow overrides remain authoritative.
- **More headroom for busy reporters:** raise the bounded queue from 8 to 24 power changes per sensor; this still expires old events and prevents unbounded memory use.
- **Queued events stay on the fast path:** v1.5.10 diverted fast transitions delayed in the per-device queue into the slow matcher and lost fast accepted evidence. v1.5.11 uses the *original* timestamp of each queued transition and evaluates it once sufficient P1 history exists. Later coffee heating pulses do not invalidate earlier ones.
- **Short heater pulses:** use both narrow and wider median windows to recognize heating pulses as short as 5–8 seconds; require matching signed device/phase watt changes and a clearly winning phase. Repeated near-identical candidate timestamps are treated as one step, and genuinely competing phase changes or multiple ambiguous steps are rejected.
- **Independent accepted observations:** unique fast matches are recorded directly (not merely tentative slow votes); an electrical edge is credited at most once to the same device even when multiple HA updates refer to it. Repeated separate ON/OFF pulses can converge quickly. Diagnostic counters explain successful matches, failed timeline matches and duplicates.
- **Preservation and safety:** no manual settings, save logic, mapping confidence formula, slow-learning rules or `.storage` schema changed. Existing mapped devices and accepted observations survive upgrades. Correlations remain estimates and are not suitable for protective electrical decisions.

**Install:** Back up Home Assistant including `.storage`; replace only `custom_components/ha_auto_device_phase_mapping`, restart Home Assistant and hard-refresh the dashboard. Confirm v1.5.11. The local release does not automatically push to GitHub.

---

# v1.5.10 — Faster bed-heater learning, accurate save feedback and calmer mapped tiles

- **Independent same-direction learning:** Slow 60–120-second Zigbee plugs can now be provisionally mapped when at least three high-quality (>=85%) electrical correlations support the same phase, even if all observed transitions are OFF/falling or all are ON/rising. Evidence must come from distinct events at least five minutes apart and span at least ten minutes. Conflicting strong evidence from another phase vetoes the shortcut. The existing two-direction confirmation method remains available.
- **Existing evidence is re-evaluated immediately on startup:** Saved tentative matches are retained and promoted exactly once when they qualify; a device need not be switched again after the upgrade. Each credit has a persisted promotion identifier, avoiding duplicates on subsequent Home Assistant restarts. A confirmed one-direction mapping displays a **red confidence dot (capped at 64%)** until independent opposite-direction evidence is accepted. A future conflicting phase can still change the inferred mapping.
- **Real-data regression:** With the anonymized logic applied to the user's latest saved example, Bed heating left (three strong L3 falling events) and right (three strong and one weak L3 falling event) both qualify for provisional L3. The weaker right-side event is NOT promoted. The user's actual saved household file is not included in the release.
- **Fix false settings failure:** Home Assistant's WebSocket library adds a message `id` to the outbound request. The v1.5.9 confirmation checker incorrectly interpreted that transport identifier as a Phase Mapper setting and displayed `Home Assistant did not confirm these changed settings: id`, even when naming or appliance edits were saved. The checker now ignores both `type` and `id` when validating acknowledged settings; real rejected settings still show an error. Regression tests simulate a mutated WebSocket request.
- **Updated phase tiles:** Device names in the Mapped devices panels are muted grey, exactly matching secondary labels such as P1 grid power. Device MDI icons keep their respective phase colors (L1 blue, L2 orange, L3 purple, Household teal). Mapped-device inset cards have a slightly darker, less saturated background than the outer phase gradient. Section headings, power bars and green/orange/red confidence dots remain phase-coded/meaningful as before.
- **Preservation:** No `.storage` schema change, no learning reset, no change to source sensor, PV or battery compensation setup. All manual appliances, names/icons, previous mappings and evidence remain intact. Automatic mappings are estimates, not electrical-safety measurements.

**Install:** Back up Home Assistant, including `.storage`. Replace `custom_components/ha_auto_device_phase_mapping` with this release, restart Home Assistant and hard-refresh the frontend (Ctrl+F5); verify v1.5.10. Confirm the bed heaters' new provisional mappings and test renaming/deleting one manual appliance. No GitHub push is performed by this ZIP.

---

# v1.5.9 — Restore reliable saving of manual appliances, names, and icons

- **Confirmed save regression:** Previous versions compared whole nested settings dictionaries using `JSON.stringify`. Home Assistant can return equivalent dictionaries with a different key order. The frontend then falsely concluded that unchanged P1 sensor selections, battery compensation, solar compensation, or phase settings had changed. As a result, saving a manual-device deletion or a name/icon update could submit an unrelated, invalid or unavailable measurement source and block the entire write.
- **Fix both comparisons:** Changed-field PATCH construction and response verification now use recursive structural equality, insensitive to dictionary key order. Exclusion lists are compared as sorted collections. This keeps unrelated measurement sources out of manual-device and display edits.
- **Explicit backend commit acknowledgment:** After validation and an awaited `.storage` write, the Home Assistant WebSocket response contains `save_ack.committed` and a list of committed fields. The frontend accepts this authoritative confirmation. Older backend versions still use structural value comparison as a fallback.
- **Better error diagnosis:** If a backend running older code fails to confirm a write, the UI now names the differing settings fields and reports the server version. Failed edits remain pending and can be retried; no false success message.
- **Regression coverage:** Reproduces the coffee-maker deletion, sequential sensor rename and icon update, automatic dictionary-key reordering, backend persistence from a representative 35-name/120-exclusion settings fixture, a failed confirmation, and a subsequent successful retry. The fixture is synthetic: it contains no user data.
- No phase-learning algorithm changes, no `.storage` schema migration, no resets to evidence or device assignments. Prior v1.5.8 nighttime SolarEdge fallback remains intact.

**Install:** Back up Home Assistant including `.storage`; overwrite `custom_components/ha_auto_device_phase_mapping`; restart Home Assistant and hard-refresh browser (Ctrl+F5). Verify the UI displays `v1.5.9`. Delete a test manual appliance or rename an existing device and wait until **All changes saved**. Reload the page to confirm the change persisted. Never delete the learning data file. No GitHub push is performed automatically.

---

# v1.5.8 — Fix phase dropdown save corruption and restore safe overnight learning

- Fix invalid `phase_sensors.undefined` writes triggered by bubbling Delete/Automatic/Manual dropdown events in phase-group containers. Only L1/L2/L3 Settings P1 selectors change the P1 measurement configuration. UI patches also filter invalid phase keys before saving.
- Keep unsuccessful changes visibly unsaved, show a Retry button, and show a saved confirmation only after the backend acknowledges all updated fields. Regression coverage reproduces deleting a manual Coffee machine followed by renaming a mapped sensor, plus server rejection/retry.
- **SolarEdge at night:** the inverter may keep a stale zero reading for >30 minutes after dark. Formerly the generic 12-second freshness rule stopped the learning engine from collecting any usable corrected phase history even though panels produced 0 W. Now one stale zero-valued solar power source may be treated as 0 W **only when** `sun.sun` says `below_horizon` with elevation <= −3 degrees. No fallback is permitted for daytime or twilight, missing sun data, missing/unknown/unavailable solar sensors, stale nonzero readings, battery sources or P1 grid sensors.
- Learning Diagnostics and on-demand diagnostics JSON indicate whether the nighttime solar fallback is active. Actual performance of the bed heating still needs measurement in the installed Home Assistant; the previously uploaded storage file predates the latest overnight cycles.
- Python and JS regression checks added; existing learning evidence, slow votes, phase mappings, aliases and icons stay intact. No storage migration, no remote GitHub push.

**Install:** Back up Home Assistant including `.storage`, replace `custom_components/ha_auto_device_phase_mapping`, restart, hard-refresh the browser (Ctrl+F5), and confirm v1.5.8. After sunset, open Learning Diagnostics to check whether corrected history is ready and, if Bed heating left is still stuck, download fresh JSON diagnostics after normal ON/OFF cycles.

---

# v1.5.7 — Autosave regression fix and individual learning reset

- Settings autosave is now **partial/PATCH-style**: changing a device name, icon, mode, manual phase, or exclusion no longer resends and revalidates every unchanged P1/battery/solar source. In particular, a temporarily unavailable SolarEdge or battery sensor can no longer block unrelated edits.
- Phase assignments and exclusions use the same single autosave queue as other dashboard changes. The backend response must confirm updated fields before displaying saved; stale GET responses are ignored if a save completed meanwhile. Unsaved edits are retained after network or validation errors.
- The Home Assistant `.storage` file now uses an ordered async save lock to prevent overlapping periodic and user settings writes from finishing out of order.
- The **Settings → Recognized Power Sensors → Automatic / Slow / Fast** dropdown includes **Reset learning…**. Confirm in the warning popup to clear only that power sensor's accepted phase evidence, statistical observations, tentative slow votes, load clues, pending evaluations and inferred mapping. If a manual override existed for that sensor, it is also cleared so the power socket can relearn a new physical phase.
- **Preserved:** all other sensors, manual appliance inventory, custom names/icons, exclusions, sensor timing overrides, dashboard layout, and current device wattage baseline. Resetting one sensor is persisted before Home Assistant acknowledges success. Source sensors cannot be reset through this control.
- No modifications to the statistical phase learning criteria introduced in v1.5.5. No `.storage` deletion or migration required.

**Install:** Back up HA including `.storage`, replace `custom_components/ha_auto_device_phase_mapping`, restart Home Assistant, hard-refresh the browser (Ctrl+F5), confirm v1.5.7. Release is not pushed to GitHub automatically.

---

# v1.5.6 — Polished phase dashboard, aligned household breakdown, and foldable Settings

- Phase L1/L2/L3/Household tiles use modest tinted background gradients and rounded interior section panels. Section titles, device names, and device icons follow the corresponding **phase accent only** (blue / orange / purple / teal). Manual appliances use the same visual styling. The separate red/orange/green **evidence confidence dots** are not recolored.
- Household **Not yet mapped** appears above Unknown devices in the row where the phase tiles show current/headroom. Unknown devices stays below, aligned with L1/L2/L3 Unknown sections. The two categories preserve the v1.5.5 calculation and percentage denominators; no extra physical sensor measurement is implied.
- All four lower Mapping accordions use quiet grey/slate colors rather than electrical phase colors. They have consistent inner padding, icon/title/description placement and margins. Still Learning device names/icons are brighter turquoise, matching the integration logo; the rest of their learning evidence stays muted.
- Settings are easier to scan: eight independently collapsible sections (P1 sources, phase headroom, battery, solar, SolarEdge estimation, refresh, learning, recognized sensors), with phase-tinted sensor cards and controls. Open/closed preferences are stored in the user's current browser localStorage and restored on dashboard navigation; sensor configuration and learning evidence remain in Home Assistant storage.
- **No backend or learning-engine changes.** The 50 W threshold, statistical matching, saved observations, provisional hints, confidence dots and JSON export from v1.5.5 are unchanged. This upgrade should not require resetting any settings, excluded devices, or learning evidence.

**Install:** Back up Home Assistant including `.storage`, overwrite `custom_components/ha_auto_device_phase_mapping`, restart, and force-refresh the browser (Ctrl + F5). Confirm the header shows v1.5.6. Do not delete `/config/.storage/ha_auto_device_phase_mapping.learning`. Release is not published to GitHub automatically.

---

# v1.5.5 — Faster, more practical mapping with statistical averages

- **50 W factory threshold:** new installs default to a 50 W change; existing installations at the former 100 W factory value migrate once to 50 W. After that, users can deliberately change the threshold and it will be preserved through subsequent restarts.
- **Time-averaged slow-sensor learning:** compares changes in 24-second averaged, battery/PV-corrected phase consumption between successive device reports. Tests several *consistent* reporting offsets rather than insisting on one exact instantaneous electrical edge. Requires at least two independent opposite-direction changes favoring the same phase and rejects competing phases with comparable evidence. Distinct statistical steps are credited once.
- **Faster accepted-evidence confidence:** previous formula rewarded a correct phase too slowly, even after five consistent Peblar results. The new formula reaches useful confidence after a few strong agreements, but still scales down for contradictory L1/L2/L3 evidence. Two separate strong opposite-direction accepted matches can be enough for lower-power devices; usual 3+ observations still work. Multi-kW loads require caution about repeated one-direction events.
- **Existing evidence retained and re-scored:** old `results`, `slow_votes`, `level_hints`, custom names/icons, assignments and other stored user settings are preserved. Devices with already consistent high-quality accepted evidence may become mapped shortly after upgrading, even without a new observation. Some of those faster mappings may be less certain; the dashboard makes this visible rather than claiming perfection.
- **Mapping-confidence dots:** small red (less than 70%), orange (70–89%), or green (90%+) dots after automatically mapped names. These are heuristic evidence-strength indicators, **not statistical probabilities or safety certification**. Manual assignments do not claim automatic-learning certainty.
- **Household total:** splits the previous grey residual into **Unknown devices** (remaining unmeasured load) and **Not yet mapped** (sensors not assigned a phase), displayed side-by-side with two grey 6 px bars. Both percentage shares refer to cleaned Household total. Unmapped sensor readings are capped to the household residual to prevent more than 100% displayed; overlapping sensors and reporting delays can still affect estimates. Phase L1/L2/L3 residuals remain unchanged. The section stays vertically aligned with those three phase panels.
- **On-demand diagnostics JSON export:** expand Learning diagnostics and click Export. Includes the last ~10 minutes of sampled corrected phase powers, recent per-device reported wattages, saved observations, tentative votes and since-restart rejection counters. Only transmitted to the requesting Home Assistant administrator, with no external upload. Downloaded JSON includes household usage timestamps and entity IDs; review before sharing.
- **No automatic external control:** phase mapping remains observational. Wrong automatic assignments can occur, particularly with overlapping sensors or concurrent appliances; do **not** use inferred phases to make electrical-safety decisions or automate protection limits without independent verification.

**Install:** Make a full Home Assistant backup including `.storage`, copy the integration over the existing installation, restart, and hard-refresh browser (`Ctrl + F5`). Existing learning file `/config/.storage/ha_auto_device_phase_mapping.learning` must NOT be deleted. GitHub tag `v1.5.5` when publishing.

---

# v1.5.4 — Better delayed-sensor learning and persistent Still Learning view

- **60-second Zigbee plugs (100–120 W):** recognizes clear standby-to-ON and ON-to-standby edges as small as 60% of the configured 100 W change threshold (minimum 55 W; valid only for a near-zero to 70–220 W transition). This is intentionally not a blanket lowering of the sensor noise threshold.
- **Delayed phase correlation:** compares multi-second medians on all three corrected phase-power histories at exactly the same candidate electrical timestamps, avoiding mismatches when Home Assistant reports a value 60–120 seconds after the P1 meter saw it. Competing phases and ambiguous repeated steps are rejected; source compensation and history readiness checks remain unchanged.
- **Slow vote progression:** distinct, coherent ON **and** OFF retrospective matches are now each credited once when enough corroborating matches have accumulated; older implementations only credited the newest observation after meeting the threshold. A saved bounded ledger prevents replay after restarting Home Assistant. Provisional feasibility hints alone still never train phase mappings.
- **High-power devices:** small concurrent changes no longer automatically veto a distinctive multi-kW step. If a large phase step was seen before the reporting sensor, the engine checks a short historical window. At least two separate, strongly matched **opposite-direction** 1,500+ W events on the same phase, with no substantial competing-phase evidence, can confirm a phase before the usual slow confidence ramp. Device/entity *names* are never used as evidence.
- **Learning diagnostics:** additional counters for historical step matches, missed delayed steps, duplicate steps and high-power confirmation.
- **Still Learning panel:** its expanded/collapsed state is retained in the current browser's local storage, so it is restored after leaving the dashboard and returning (the other mapped Show/Hide preference is unchanged).
- **Safe upgrade:** no changed source-configuration defaults, no storage schema reset, no changes to existing accepted scores or manual assignments. Adds optional bounded metadata fields to existing per-device result records; older result records remain valid.

**Important:** Automatic phase predictions remain estimates, never evidence for electrical safety or wiring modifications. Fast and delayed matching require valid corrected P1/battery/solar measurements. Home Assistant field testing is still required.

**Install:** Back up Home Assistant (including `.storage`), replace `custom_components/ha_auto_device_phase_mapping`, restart Home Assistant, and use Ctrl+F5 to reload the frontend. GitHub tag `v1.5.4` when publishing.

---

# v1.5.3 — Compact controls and readable mapped-device lists

- Mapped phase assignment selectors (**Automatic** / **Manual**) have the same understated 86 × 28 px style, smaller text and a softer border, preserving keyboard access and all choices.
- Device names wrap naturally at spaces for up to two lines; long names truncate with an ellipsis instead of breaking letter-by-letter. At extremely narrow tile widths (250 px or less), assignment controls move below the row to reserve space for device names.
- Corrected progress bars for mapped and unknown devices use one fixed 6 px height and 4 px radius. The grey unknown residual bar retains its grey fill and horizontal alignment with mapped-device bars, including at narrow tile widths.
- **Unknown devices** section titles match the white **Mapped devices** titles. Residual wattage, percentage and bars remain secondary grey.
- **Mapped devices expanded:** show individual device rows only, without a duplicate combined watts/percentage/bar summary. **Collapsed:** show the combined monitored watts/percentage and a phase-colored bar. The synchronized toggle still controls all four tiles and remembers the selected state in local browser storage.
- No change to the learning engine, phase assignment thresholds, sensors, stored evidence, aliases, icons, battery or solar compensation, or Home Assistant `.storage` schema.

**Install:** Back up Home Assistant including `.storage`, copy `custom_components/ha_auto_device_phase_mapping` over the existing integration, restart Home Assistant and hard-refresh the browser (Ctrl+F5). GitHub tag `v1.5.3`.

---

# v1.5.2 — Streamlined mapped-device summaries and native icon picker

- Unknown devices appears immediately above Mapped devices in all four phase/household tiles. Its title and power values use Home Assistant's secondary text color; the icon is removed.
- Grey unknown bars and color-coded mapped bars have the same height, width, and horizontal alignment; they reserve a uniform space for the phase assignment dropdown.
- Manual and automatic assignment dropdowns have the same dimensions.
- Mapped devices have a synchronized Show/Hide control on all four tiles. The aggregate power, percent and phase-colored bar remain visible whether the detailed rows are shown or hidden. The preference is kept in browser local storage.
- L1/L2/L3 totals include one-third of monitored three-phase devices for display only; household totals include each monitored mapped sensor once. Unmonitored manual devices count toward mapped-device totals but contribute no estimated watts.
- Home Assistant's built-in `ha-icon-picker` is used when the frontend exposes it; it searches Home Assistant's full currently supported MDI catalog, shows icons and matches aliases. A smaller editable fallback remains available when the native picker is not loaded.
- Phase learning, persistence, and WS settings are unchanged.

## Installation

Copy `custom_components/ha_auto_device_phase_mapping` to the existing HA integration folder, preserving `/config/.storage/ha_auto_device_phase_mapping.learning`; restart Home Assistant and hard-refresh the browser.

---

# v1.5.2 — Mapped-device presentation and estimated unknown loads

- Manual appliance rows now look like mapped sensor rows, with the room shown in place of watts. The phase selector shows “Manual” at rest and offers the phase moves and delete action when opened.
- Compact mapped sensor rows display watts and phase share on a single line with a phase-colored consumption bar (L1 blue, L2 amber, L3 purple). The bars show live sensor contribution, not confidence scores.
- Each phase and Household total show a grey Unknown devices row and bar: `max(0, cleaned load − mapped sensor watts)` by phase. Excluded and still-learning power sensors are not subtracted. Unmetered manually entered devices count toward mapped-device totals but contribute no watts. Where a mapped 3-phase power sensor exists, one-third is provisionally allocated to each phase for residual calculation; this assumption is not a confirmed phase split.
- The household panel counts **all** mapped appliances, sums the available monitored-device power once each, and vertically aligns the mapped section with the L1–L3 mapped sections. Residuals are estimated from asynchronously refreshed Home Assistant entities and P1 values; measurement noise, changing loads, missing values and overlapping aggregate sensors may affect accuracy.
- MDI icon suggestions now show actual `<ha-icon>` glyphs alongside descriptive labels in a searchable custom picker, for both manual adding and device editing.
- No reset or migration: learning, battery and solar compensation, manually mapped sensors, saved evidence, manual appliances and existing display customizations are preserved. Learning code was not changed.

**Install:** Back up Home Assistant including `.storage`, copy `custom_components/ha_auto_device_phase_mapping` over the current installation, restart Home Assistant and hard-refresh the browser (Ctrl+F5). GitHub tag `v1.5.2`.

# Release notes

## v1.5.0 — Simplified mapped-device dashboard and editable icons

- **Phase tiles:** the mapped appliance list for L1, L2, L3 now appears directly beneath its matching electrical summary tile; three-phase appliances appear beneath Household total. Compact appliance rows show an editable name/icon, power and contribution if measured, and the phase assignment selector. Existing phase/solar/battery correction is unchanged.
- **Batteries:** battery devices no longer duplicate themselves in mapped appliance lists. Their charging/discharging power continues to be included and labeled in each phase summary (and in total). Battery sources remain excluded from automatic mapping candidates.
- **Mapped devices:** a separate collapsible **Mapped devices** section beneath the phase tiles displays full saved evidence, timings, diagnostic reasons and device-specific phase controls for mapped power sensors.
- **Still learning:** collapsible (collapsed initially) with device count always shown; when expanded the entire list is visible, with no internal capped-height scrolling. Each unmapped device can now be renamed and assigned an icon without making a manual phase assignment.
- **Standard Home Assistant icons:** supports mdi: icons for all power-sensor devices, whether mapped or still learning, and for manual appliances; create/edit forms include searchable icon suggestions plus direct entry of any standard mdi: name. Aliases/icons are display-only and never change HA entities or power calculations. New `display_icons` and optional manual-device `icon` settings are backward compatible.
- **Manual appliances:** omit the non-measured watts line and place **Delete device…** inside the phase selector instead of adding a separate button. Deletion requires confirmation; the pencil dialog edits name, room and icon.
- **Version information:** installed version in the navigation bar opens a confirmation dialog for the GitHub repository. The Info tab shows installed version, repository and latest published GitHub release if the public GitHub API allows a lookup. A private repository, API error or no published release produces a neutral **Not verified** status, never a misleading green "latest" claim. Checks are cached for six hours while the panel is open.
- **Learning safety:** v1.4.10 correlation algorithms, confirmation thresholds, saved evidence and phase correction remain unchanged. Stored settings and learning evidence survive upgrade. No new control capability is introduced.

**Upgrade:** Back up the whole HA configuration including `.storage`, replace only `custom_components/ha_auto_device_phase_mapping` with the new ZIP contents, restart Home Assistant and force refresh browser (Ctrl+F5). Do **not** delete `.storage/ha_auto_device_phase_mapping.learning`. Release tag `v1.5.0`.

**Verification:** Tests cover Python storage normalization, frontend UI rendering, and browser interaction using standalone mock HA data. Live Home Assistant validation is still required, and private GitHub release checking cannot be verified anonymously.


## v1.4.10 — Better automatic learning from delayed appliances

This release targets devices such as LG air conditioners whose cloud power sensors may report several minutes after the actual electrical change. It does **not** control appliances or alter battery/solar compensation.

- **No silently lost events:** when an earlier evaluation for a sensor is pending, later changes are placed in a bounded FIFO (8 per sensor), evaluated afterward, and counted separately in diagnostics. Any queue overflow is reported. Queued events outside the retained history are rejected rather than matched against unrelated new readings.
- **Historical ON/OFF matching:** slow sensors retain up to 30 minutes of device reports, separate from the existing 30-minute corrected L1/L2/L3 phase history. The matcher compares repeated high and low power states against earlier phase measurements across possible 0–600-second offsets. It requires multiple ON/OFF changes, corroborating nearby time offsets, a uniquely matching phase and low competing-phase changes. A matching offset is **not** a measured reporting delay.
- **Stronger slow-sensor transitions:** when no unambiguous short historical step exists, compare stable beginning/end phase power plateaus. Do not accept overlapping or noisy matches simply by widening the general tolerance.
- **Preliminary phase hints:** a consistently larger cleaned load on just one phase during repeated OFF→ON readings can offer a weak *Likely L1/L2/L3* hint. Hints can also incorporate tentative slow ON/OFF votes. **These are not accepted observations, do not increase confirmed confidence, and never automatically place a device on a phase.** They are hidden when they contradict stronger accepted evidence.
- **Persistence:** preliminary load hints are saved alongside previously persistent slow votes, settings and accepted results in the existing `.storage/ha_auto_device_phase_mapping.learning` file. Hints are bounded and expire after 14 days. No migration or learning reset is required.
- **Diagnostics:** separately shows queued changes, matched delayed ON/OFF profiles, and saved load-feasibility hints. The app labels preliminary phase hints as unconfirmed. Duplicate historical steps cannot add multiple votes.
- Existing manual mappings, exclusions, per-phase compensation, dashboard/card UI and current-limit readouts remain intact.

**Important limitations:** A high appliance reading and high L1 household load at one moment are not proof of physical wiring. Lagged reporting, other loads, and approximate PV distribution can produce misleading coincidences. The integration requires repeated evidence before an automatic assignment. This release is tested against simulated data and requires validation on a live Home Assistant installation.

**Upgrade:** Back up Home Assistant including `.storage`, overwrite `custom_components/ha_auto_device_phase_mapping` via Samba, restart Home Assistant and press Ctrl+F5. Learning results and previously saved tentative votes should be preserved. Tag: `v1.4.10`.

## v1.4.9 — Persist slow-sensor learning candidates across restarts

- Persist tentative historical matches per sensor (phase, direction, real timestamp and quality) in the **existing** Home Assistant `.storage/ha_auto_device_phase_mapping.learning` file. Backward compatible with all earlier stored settings and accepted evidence.
- Restore recent valid tentative matches after restart; filter malformed, future-dated and older-than-14-day matches. Preserve at most 12 votes per sensor (up to 500 sensors).
- Keep the existing requirement for repeated, distinct, bidirectional evidence. Restored votes remain tentative and do not increment accepted observation counts until validated by subsequent matching transitions.
- Display per-device **Saved tentative slow matches** and distinguish **Checks since restart** from **Total accepted observations (saved)** in the Learning diagnostics.
- Flush changes on normal Home Assistant stop and periodically while running. Avoid losing votes when one arrives during an in-flight disk write.
- Keep the full 30-minute rolling corrected-power history capacity when a source momentarily becomes unavailable or correction settings change (previously those resets could reduce it to 100 seconds).
- Clear tentative votes on explicit learning reset or changed measurement sources, not on ordinary restarts or display-only settings updates.
- Existing fast/slow correlation logic, compensation, exclusions, manual devices, aliases and UI navigation are unchanged.

**Caveat:** Previous versions did not persist tentative matches, so old in-memory tentative votes cannot be recovered retroactively. The newly persisted matches start accumulating once v1.4.9 is installed. Cleaned-power history and rejection checks are deliberately session-scoped.

**Upgrade:** Back up Home Assistant (including `.storage`), overwrite only `custom_components/ha_auto_device_phase_mapping` through Samba, restart Home Assistant, and press Ctrl+F5 in the browser. GitHub release tag: `v1.4.9`.

## v1.4.8 — Manual inventory reliability and quieter dashboard

- Fixed manual appliance management: new entries appear immediately, multiple entries can be created, changing phase moves the item to the correct L1/L2/L3/three-phase list, and confirmed deletion removes the correct item. These changes autosave without being overwritten by the last-received backend snapshot.
- Manual appliance names and rooms remain editable through a more visible pencil control. Mapped battery sources can now have display-only Phase Mapper names; clicking their regular row still opens Home Assistant More info and the actual entity name is never modified.
- Manual add, rename, remap and delete operations remain visible while the save is pending. If saving fails, a visible error is shown and the local draft is retained for retry.
- Navigation is a full-width, flat sticky toolbar, aligned like OmniBattery: branded logo, tabs flush with the bottom underline and compact statistics on the right. Detected and Excluded counters are neutral grey; Mapped remains green.
- Moved the Mapping page's general search, Show excluded, Add appliance, and Learning diagnostics beneath the phase and Still Learning lists. Still Learning retains its own filter within the list.
- Renamed **Cleaned household load** to **Sum of loads** in all four power tiles (display label only).
- Solar generation and battery discharge values use the same green with medium font weight, charging uses orange, and the L1 + L2 + L3 household badge is white.
- Existing battery/solar compensation, phase-learning logic, sensor selections, exclusions, evidence and persistent storage format are unchanged.

**Verification:** 43 Python tests, all bundled JavaScript checks and a real Chromium test covering two additions, remap, edit, delete, battery rename, restart/reload, and 320/360/768/1440 px header layouts. Not yet run against the user's live Home Assistant installation.

**Upgrade:** Back up Home Assistant (including `.storage`), overwrite only `custom_components/ha_auto_device_phase_mapping` through Samba, restart Home Assistant, and press Ctrl+F5 in the browser.


## v1.4.7 — Responsive dashboard and sensor management

- Single-row responsive logo, navigation and live status counters; mapping power tiles now appear only on the Mapping tab.
- Recognized Power Sensors combines exclusion and timing controls with text search, customizable comma-separated naming filters, and confirmed bulk exclude/restore.
- Mapped-device display-name overrides with original HA More info behavior preserved.
- Display factual HA report cadence after startup as `Measured refresh: N s` (or `— s` before measured); slow learning remains independent.
- Still Learning name/entity search, cleaner indenting, color-coded battery and solar readings, color-coded household phase badge.
- Mouse-only drag-and-drop on hybrid devices; touch users keep dropdown assignment.
- Persistence format is backward compatible and no existing evidence is reset by upgrading.

# Version 1.4.5 — Live power and resilient solar display

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


## v1.4.5 — Learning diagnostics
- Adds overall transition/acceptance/rejection counters, history readiness, and per-device latest rejection reason.
- Counters are in-memory and start fresh after restart; persistent learning results are unchanged.
- Learning threshold, correlation rules, battery/solar compensation, and manual assignments are unchanged.

## v1.4.6 — Slow sensor learning and manual inventory

- Added historical phase-step matching for sensors whose power readings change at long intervals (including LG integration reports every 5–10 minutes).
- Detects sensor update cadence automatically, with optional Fast/Slow overrides. Requires multiple independent matching transitions in both directions and rejects ambiguous candidates before adding evidence.
- Added manually entered appliances without HA entities, with optional room, phase reassignment, deletion and persistent storage.
- Retains earlier measurements, excluded entities, manual overrides and learning scores in `.storage` on upgrade.
- Historical learner uses a longer in-memory buffer; invalid compensation and stale P1 samples still block learning. Real-world timing varies between integrations; use the Learning diagnostics counters to verify operation.
