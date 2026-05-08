"""V2 sandbox: target_asym + target_downturn derivation.

Locked design 2026-04-24:
  target_dt   = aggressiveness → downturn rank   (no foot-shape adjustment)
  target_asym = aggressiveness → asym rank
                + foot-shape × HVA delta (single rule, no toe-confidence gate)

Adjustment matrix for asym:
  Egyptian + no HVA   → +1   (any toe confidence)
  Egyptian + HVA      → −1
  Greek/Roman + no HVA → 0
  Greek/Roman + HVA   → −1

Will be folded into benchmark/target_resolver.py once sandbox-validated.
"""

ASYM_LABELS     = {0: "none", 1: "slight", 2: "moderate", 3: "strong"}
DOWNTURN_LABELS = {0: "flat", 1: "slight", 2: "moderate", 3: "aggressive"}

AGGRESSIVENESS_TO_ASYM = {
    "comfort":    0,
    "balanced":   1,
    "moderate":   2,
    "aggressive": 3,
}
AGGRESSIVENESS_TO_DOWNTURN = {
    "comfort":    0,
    "balanced":   1,
    "moderate":   2,
    "aggressive": 3,
}

# Mild HVA threshold (matches feedback_hva_thresholds memory)
HVA_HAS = 0.25


def resolve_target_downturn(aggressiveness):
    """Pure aggressiveness lookup (no foot-shape adjustment)."""
    rank = AGGRESSIVENESS_TO_DOWNTURN.get(aggressiveness, 1)
    return {
        "target_dt":     rank,
        "target_dt_lbl": DOWNTURN_LABELS[rank],
    }


def resolve_target_asym(aggressiveness, toe_shape, hva_offset_ratio):
    """Two-layer derivation: aggressiveness baseline + foot-shape delta."""
    baseline = AGGRESSIVENESS_TO_ASYM.get(aggressiveness, 1)
    has_hallux = (hva_offset_ratio is not None) and (hva_offset_ratio >= HVA_HAS)
    toe = (toe_shape or "").lower()

    if has_hallux:
        delta  = -1
        reason = f"HVA {hva_offset_ratio:.2f} ≥ {HVA_HAS}"
    elif toe == "egyptian":
        delta  = +1
        reason = "Egyptian + no HVA"
    else:
        delta  = 0
        reason = f"{toe or 'unknown'} + no HVA"

    target = max(0, min(3, baseline + delta))
    return {
        "target_asym":     target,
        "target_asym_lbl": ASYM_LABELS[target],
        "baseline_rank":   baseline,
        "baseline_lbl":    ASYM_LABELS[baseline],
        "delta":           delta,
        "reason":          reason,
        "has_hallux":      has_hallux,
        "toe_shape":       toe,
    }
