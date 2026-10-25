"""Pure phase-correlation calculations; safe to unit test without HA installed."""

from __future__ import annotations

PHASES = ("L1", "L2", "L3")


def classify(change: float, observed: dict[str, float], tolerance_ratio: float = 0.30):
    """Return (phase, quality) for an unambiguous step, or None.

    `change` is the individual device's *signed* watt transition; `observed`
    contains the three signed P1 phase power transitions over the same window.
    Quality is only a heuristic evidence weight, not a probability.
    """
    power = abs(change)
    if power < 30 or any(phase not in observed for phase in PHASES):
        return None

    # A device's total power can be evenly distributed across three phases.
    # Require strong changes with good balance, not just a small residual.
    triple_limit = max(60.0, power * 0.13)
    triple_residual = max(abs(observed[p] - change / 3) for p in PHASES)
    if power >= 450 and triple_residual <= triple_limit:
        quality = max(0.10, 1 - triple_residual / (triple_limit + 1))
        return "3-phase", round(quality, 3)

    errors = {phase: abs(observed[phase] - change) for phase in PHASES}
    best = min(PHASES, key=lambda phase: errors[phase])
    allowed_error = max(65.0, power * tolerance_ratio)
    if errors[best] > allowed_error:
        return None

    # Independent changes on other P1 phases point to concurrent appliances.
    if any(abs(observed[p]) > max(95.0, power * 0.35) for p in PHASES if p != best):
        return None

    next_error = min(errors[p] for p in PHASES if p != best)
    if next_error - errors[best] < max(60.0, power * 0.25):
        return None

    quality = max(0.10, 1 - errors[best] / (allowed_error + 1))
    return best, round(quality, 3)


def corrected_phase_power(grid, batteries, solar, *, battery_discharge_positive=True,
                          solar_production_positive=True):
    """Estimate underlying household consumption changes on each phase.

    Grid: import positive / export negative. Battery: discharge positive by
    default, charging negative. PV: generated watts positive by default.
    SolarEdge 3-phase generation is assumed balanced (total divided by 3).
    For non-balanced solar installations, omit the PV sensor rather than
    correcting with an unsupported phase distribution.
    """
    solar_watts = solar if solar_production_positive else -solar
    battery_sign = 1 if battery_discharge_positive else -1
    return {p: grid[p] + solar_watts / 3 + battery_sign * batteries[p]
            for p in PHASES}


def estimated_phase_solar_watts(total_ac_watts: float, apparent_per_phase: dict[str, float]):
    """Allocate real inverter AC total proportionally to per-phase V*A.

    The calculation is an estimate assuming similar phase power factors; it
    does not assert that volt-amperes are real watts. Returns None if invalid.
    """
    from math import isfinite
    if not isfinite(total_ac_watts) or any(p not in apparent_per_phase for p in PHASES):
        return None
    values = [apparent_per_phase[p] for p in PHASES]
    if any(not isfinite(v) or v < 0 for v in values):
        return None
    total_apparent = sum(values)
    if total_apparent < 1.0:
        return None
    watts = {p: total_ac_watts * apparent_per_phase[p] / total_apparent for p in PHASES}
    # Guarantee that exact total is preserved, avoiding floating-point drift.
    watts["L3"] = total_ac_watts - watts["L1"] - watts["L2"]
    return watts


def solar_allocation_decision(total_power, estimation_enabled, estimated_shares):
    """Return (phase weights, mode, safe_to_learn) for total inverter output.

    A display-only equal-split fallback must never be allowed to train phase mapping.
    """
    from math import isfinite
    equal = {p: 1 / 3 for p in PHASES}
    if total_power is None or not isfinite(total_power):
        return equal, "solar_source_unavailable", False
    if not estimation_enabled:
        return equal, "equal_split", True
    if abs(total_power) <= 10:
        return equal, "zero_generation", True
    if estimated_shares is None or any(p not in estimated_shares for p in PHASES):
        return equal, "fallback_equal", False
    if any(not isfinite(estimated_shares[p]) or estimated_shares[p] < 0 for p in PHASES):
        return equal, "fallback_equal", False
    total = sum(estimated_shares.values())
    if total <= 0:
        return equal, "fallback_equal", False
    return {p: estimated_shares[p] / total for p in PHASES}, "estimated", True
