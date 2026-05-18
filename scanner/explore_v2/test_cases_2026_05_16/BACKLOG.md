# Test-case Backlog — 2026-05-16

Issues found in this round of skill-driven test cases. Severity-tagged.

## CRITICAL

### B1 — Scan dominance for extreme dims when feedback is thin or non-corroborating

**Surfaced in:** test_1 (very-narrow forefoot scan → target_fw resolves to "normal" because the single shoe's perfect-in-wide-cup vote dilutes the scan).

Same failure mode as test 2 (sample set) where very-wide heel was diluted to medium by the Mandala empty-heel vote.

Current artifact filters catch sizing-explained ratings and directionally-impossible loose-direction ratings. **They don't catch "perfect" feedback in directionally-mismatched cups** (perfect in cup-too-wide for narrow foot, or perfect in cup-too-narrow for wide foot).

Proposed rule: when scan rank is 0 or 2 with high confidence AND total non-suppressed feedback weight is low (1-2 shoes), the scan vote weight should be multiplied (say x3) so it dominates.

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

**Surfaced in:** test_1 (3/12 picks have prices, EU 40-42 range).

Many shoes have no vendor in stock at EU 40-42 for women. Worth considering ±0.5 EU fallback for price display.
