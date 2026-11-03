# Troubleshooting and learning tips

[← README](../README.md) · [User guide](USER_GUIDE.md)

## Device remains in “Still learning”

Before changing settings, check whether the device **actually produces detectable power transitions** and whether the meter is sending **signed per-phase watts** for L1/L2/L3. A steady device with no significant power change may take much longer to learn. The default minimum change is **50 W** in the current code. A 5–20 W appliance may never generate a large enough step on its own.

Check that the device's own sensor is included, not `unavailable`, and not a duplicate/aggregate meter. Check the **actual reporting cadence**, not just how frequently the real appliance changes power. Review whether PV, batteries or simultaneous appliances could mask the event. Look for accepted evidence in the Mapping view and diagnostics before manually assigning a phase.

## Help a low-power or slow device learn faster

**A temporary, distinctive load can help** when you want to identify the phase of a **plug-in energy-monitoring socket**, particularly one normally supplying a low-power device. A hairdryer is a possible load, but only when the smart plug/socket and electrical installation are suitable for its full rated power.

### Practical example: test the *same* monitored socket

1. **Confirm the equipment is suitable.** Check the energy-monitoring plug's actual W/A rating, the outlet/circuit and hairdryer power. Never exceed the lowest-rated component. Do not use damaged plugs, adapters, extension leads or questionable connections. Keep the hairdryer clear of water and flammable materials; never leave it running unattended.
2. **Use the exact monitored socket you want to map.** Unplug the low-power appliance and connect the test load to that *same* smart plug. Do **not** move the smart plug to another outlet — you would then be learning a different circuit.
3. **Choose an identifiable, moderate operating level**, within every device rating. A test step well above the configured 50 W floor is easier to distinguish, but more power is **not always better**, especially with circuit loading and other appliances already operating.
4. **Switch ON**, leave the power stable long enough to be reported by both the plug and P1, then **switch OFF** long enough to observe the lower level. Repeat a few times **only as permitted by the hairdryer manufacturer's operating instructions** and while monitoring plug temperature and electrical loading. Avoid unnecessary rapid cycling.
5. Watch for accepted evidence and a stable phase in Mapping. If nothing changes, check the plug's real sensor refresh, P1 history and diagnostics; don't assume that more switching will solve it.
6. Remove the test load and reconnect the original appliance. The plug should remain on the same socket and mapped phase. Remember that the learned phase belongs to the **monitored electrical point**, not permanently to a portable appliance when moved elsewhere.

### How long should the ON/OFF steps last?

| Actual sensor reporting interval | Suggested starting hold time **for each ON and OFF state** |
| --- | --- |
| About 1–2 seconds | 10–15 seconds |
| About 5 seconds | 20–30 seconds |
| About 10 seconds | 40–60 seconds |
| Around 60 seconds | At least 2–3 minutes; often better to use natural operation or another method |

These are **practical starting points, not guaranteed learning times**. They assume a reasonably responsive P1 signal and few overlapping load changes. Some sensors report *on change*, sleep, smooth readings or delay state publication; even longer holds may be necessary. A hairdryer might not be appropriate for sustained multi-minute testing; use another safe load or natural operation instead.

**Important limitations:** This method is for *plug-in sockets with energy monitoring*. Do not use a hairdryer or improvised load to test fixed heaters, distribution boards, EV charging circuits or equipment not rated for it. Do not switch high-load appliances rapidly, bypass protective devices, or open electrical panels. If the phase relationship matters for safety or circuit work, use an electrician and appropriate test instruments.

## Confidence is green, but mapped phase seems wrong

Check sensor sources and whether per-phase P1 data are real signed watts. Confirm no accidental use of SolarEdge inverter phase data as grid data. Exclude aggregate readings and duplicates; avoid correlating multiple sensors that measure the same load. If you relocate a plug to a different circuit, its old learned phase may no longer be valid; reset that device's learning evidence before re-learning.

## Lots of queued transitions — is the engine stuck?

Not necessarily. **Queued transitions** is a total since restart, not the active queue length. In Learning Diagnostics, also check **Waiting in transition queues**, pending work, evaluations completed, and errors. A cumulative value such as 327 with zero waiting is not a backlog. If current pending grows and never clears, export diagnostics and check logs/worker recovery counters.

## Delayed steps not found / fast timeline no match

Not every device change has a clean matching P1 step. Concurrent devices, battery or solar movement, different reporting clocks, low step magnitude, and noisy baselines are common causes. Check timing mode and source sign before lowering global thresholds. Resist forcing confidence up from weak evidence.

## iOS Home Assistant dashboard scroll or flicker

Version 1.6.2 changes how the dashboard refreshes its contents to reduce scroll jumps. Check both frontend and backend version numbers, restart Home Assistant after installing new Python files, and fully close/reopen the iOS Companion app to clear cached frontend resources. If the page still jumps, include device/iOS/app versions and a short reproduction sequence in a GitHub issue.

## Unknown power seems surprisingly large or negative

The household residual is calculated from different measurement sources which may update at different times. Check the configuration of battery/solar compensation, whether signs are inverted, and whether a three-phase/aggregate device is counted twice. Don't interpret a single screenshot as a calibrated energy audit.

## Where to report issues

Use [GitHub Issues](https://github.com/niCNCo/HA-auto-device-phase-mapping/issues). Include the version, what you expected, what happened and concise logs. Before uploading diagnostics publicly, inspect them for entity IDs, device names, IP addresses and household usage information.
