# Test-case Backlog — 2026-05-16

Issues found in this round of skill-driven test cases. Severity-tagged.

## RESOLVED

### B1 — Scan dominance for extreme dims (FIXED 2026-05-16)

~~Surfaced in test_1 (very-narrow forefoot scan → target_fw resolves to "normal" because the single shoe's perfect-in-wide-cup vote dilutes the scan).~~

Resolved by Rule C in `target_resolver_v2._scrub_sizing_artifacts`: perfect rating in cup ≥2 ranks off from user's scan dim → blanked. Test_2 (2026-05-16) verifies fix — Drone 2 LV's perfect-in-narrow-cup forefoot was silently filtered, target_fw correctly resolved to wide.

## WARNING

### B2 — Neutral toe-form mismatch penalty too soft for high-confidence scans

**Surfaced in:** test_1 (Greek user, conf 0.9, gets 5/12 Egyptian shoes in recs).

Current scoring: greek↔egyptian/roman mismatch = −3 (unscaled). Match = +10. So the foot-shape advantage for a non-matching shoe (width/heel) easily overrides the toe-form penalty.

Proposed: scale the mismatch penalty by confidence (high confidence = harder penalty). E.g. −3 × (1 + 2·conf) → −9 at conf=1.0, −3 at conf=0.0. Or simpler: bump the unscaled penalty to −6 (matching opposite-form −6).

## NOTE

### B3 — §2 closing sentence for "no usable feedback" cases

**Surfaced in:** test_1 (single-shoe user, only signal filtered → §2 has 2 sentences total).

Add a closing one-liner when the cascade ends up empty: *"With only one heavily oversized shoe and no remaining cup-fit signals, the recommendations rely entirely on your scan and stated preferences."* — also applies to all-perfect-feedback users (sample case 4).

### B4 — Price coverage thin on small EU sizes

**Surfaced in:** test_1 (3/12 picks have prices, EU 40-42 range). Also test_2 (3/12 picks, EU 43-45 men's range).

Many shoes have no vendor in stock at the user's recommended size. Worth considering ±0.5 EU fallback for price display.

### B5 — §1 T4 wording flattens "very" tiers into "rather"

**Surfaced in:** test_2 (instep "very high" on slider → "rather high" in §1 P2; arch "very low" on slider → "rather short" in §1 P2).

T4 sentences (`Additionally your instep is rather high...`, `Your arch is rather short...`) don't escalate for users at the extreme ends. A user at the 95th percentile gets the same prose as one at the 65th. Proposal: for `very high` / `very low` 5-tier labels, use "particularly high" / "noticeably short" or similar to convey the extreme.
