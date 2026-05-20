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

### B6 — Baseline tier needs hard foot-shape gate (CRITICAL, recurring x3)

**Surfaced in:** test_3 (heel d=1/d=1, forefoot d=2 across 3 picks), test_4 (3/3 picks heel d=1 — medium/medium when target is medium/wide).

Same shape as the long-discussed "baseline gate" issue from sample-set test 2 round. Option 1 (steepen d=1/d=2 penalty) was implemented in 2026-05-15 commit but is insufficient when use-case axes (stiffness+ankle+downturn+closure+instep_extreme = ~+60-70 typical for comfort/trad) overwhelm a −8 heel-vol miss.

In test_4 specifically: candidate pool for medium-fw + wide-cup + comfort/trad may be genuinely sparse. Baseline should detect this and either (a) drop to fewer picks + "no exact baseline match found" note, or (b) keep the picks but disclose the cup-volume mismatch upfront.

Proposed Option 2: in `assemble_tiers`, hard-filter baseline pool:
- **Strict pass:** both forefoot_width AND heel_volume at d=0
- **Fallback (when strict pool < 3):** at least one axis at d=0 AND no axis at d=2
- **Disclosure:** if strict pool was empty, surface a "no exact baseline match" note in §3 so the user knows the baseline picks are compromises

Softer / stiffer / budget tiers stay permissive — they explicitly host alternatives.

### B5 — §1 T4 wording flattens "very" tiers into "rather" (recurring x3)

**Surfaced in:** test_2, test_3, test_4 (instep "very high" on slider → "rather high" in §1 P2; arch "very low" → "rather short").

T4 sentences (`Additionally your instep is rather high...`, `Your arch is rather short...`) don't escalate for users at the extreme ends. A user at the 95th percentile gets the same prose as one at the 65th. Proposal: for `very high` / `very low` 5-tier labels, use "particularly high" / "noticeably short" or similar to convey the extreme.

### B7 — §2 cascade forefoot prose contradicts resolved target (CRITICAL)

**Surfaced in:** test_4 (2 Ocun shoes "tight forefoot" + 2 Scarpa shoes "squeezed toes only" → resolver keeps fw=medium because Scarpa votes correctly identify length-only squeeze; cascade still emits "aim for slightly wider forefoots" because 2 of 4 felt tight).

The §2 forefoot cascade is counting tight-forefoot shoes and promising a wider target, but the target resolver is correctly weighting Scarpa's "length-only" signal and keeping fw=medium. §3 then reads "normal forefoot width", contradicting the §2 promise.

Two fixes:
- **Cascade-side:** check the resolved target before emitting "we aim for wider". If resolver kept medium, soften to "we may aim for slightly wider if the data converges" or drop the directional clause entirely.
- **Resolver-side:** weight tight-in-medium-cup more heavily so target_fw actually moves to wide.

My read: resolver is right (length-only squeeze shouldn't push width); cascade is the place to soften.

### B8 — Grammar: "Look for a Egyptian-compatible" should be "an" (FIXED 2026-05-18)

~~Surfaced in test_4 cascade emitter.~~ Fixed: `_group_toes_squeezed` + `_group_toes_roomy` branch A now compute the article from the first letter of the toe label. Verified in test_4 re-render ("Look for an Egyptian-compatible toe box").

### B10 — §2 disclosure doesn't consolidate same-shoe same-cause sentences

**Surfaced in:** test_6 (La Sportiva Skwama Vegan — empty heel, roomy toes, loose forefoot all resolve to the "sizing" reason, producing 3 near-identical sentences).

The disclosure grouping in `render_v2_review_static.py` keys on `(dim, rating, reason)`, so same-shoe same-reason rows across different dims never merge. When one shoe is uniformly loose (or tight) due to sizing, the user gets 3 copies of the same sentence varying only in the dim noun.

Proposed: when multiple discounted ratings share `(shoe, reason)`, consolidate to one sentence listing the dims: "Your X's empty heel, roomy toes, and loose forefoot are most likely a sizing problem, at {label} sizing for {brand}, the shoe naturally runs loose."

### B11 — Toe-form mismatch P3 sentence repeats verbatim across picks

**Surfaced in:** test_6 (Roman user, 4 of 12 picks Egyptian-toed → the "Egyptian toe box tapers steeply down..." P3 sentence repeats 4×, triggers R8).

The opposite-form consequence is identical for every shoe of the same toe form, so the per-shoe P3 sentence cannot be meaningfully varied. Consider stating the toe-form mismatch once at case level (or in §3) rather than on every mismatched card. Secondary observation: 4/12 opposite-form picks is high — the −6 penalty is soft enough that Egyptian shoes rank into every tier including baseline. Not relitigating the penalty (`feedback_v2_toe_form_scoring`), just noting the effect.

### B12 — Budget tier collapses to 0 picks when nothing is priced (CRITICAL)

**Surfaced in:** test_7 (street 47.5, very narrow forefoot — all 9 picks have `best_price_at_size = None`, budget tier produces 0 picks, page renders 9 recommendations instead of 12).

The budget tier is built purely from at-size vendor price data (top-30-baseline → cheapest-3-by-price-at-size). When no candidate has an at-size price, the tier is empty and the page silently drops a tier. This is B4 taken to its failure point — for large feet at narrow recommended sizes there is no priced inventory at all.

Proposed: either (a) fall back to `price_uvp_eur` (manufacturer list price) when no at-size vendor price exists, so the budget tier can still rank, or (b) omit the budget tier explicitly with a one-line §3 note ("no budget options in stock at your size right now") instead of a silent gap.

### B13 — §3 heel-depth disclaimer fires only for shallow heels, not deep

**Surfaced in:** test_9 (deep-heel user — §1 says "a deeper, more sculpted heel cup fits naturally" but §3 has no heel-depth-data caveat).

`_SHALLOW_HEEL_CLAUSE` in `interp_what_to_look_for_v2.py` (line 351) triggers only on `("very shallow", "shallow heel")`. The clause content is a general "shoe heel-depth data is not widely available" disclaimer — it applies equally to deep-heel users, who are also given heel-depth advice the recommender cannot filter on. Fix: extend the trigger to include `("very deep heel", "deep heel")`. May also want to rename the constant since it is no longer shallow-specific.

### B15 — Heel width vs heel depth must stay separate (Roman decision 2026-05-18, FUTURE)

**Surfaced in:** test_11 (§1 "medium-width heel" → §3 "narrow heel width"). `votes_hv` mixes a `scan_heel_depth` vote into the heel-WIDTH target.

**Roman 2026-05-18 decision:** heel width and heel depth are independent fit parameters and must always be kept separate — a wide-but-shallow heel and a narrow-but-deep heel can have the same volume yet fit completely differently. We currently only have data on heel **width**.

**Future-session work** (not done now): either (a) move the model to an explicit heel-*volume* axis, or (b) capture separate heel-width and heel-depth data — (b) is fundamentally better. As part of that, `scan_heel_depth` should stop voting the heel-width target. Left as-is in the resolver for now per Roman's "future sessions" call; §3 keeps "narrow heel width".

### B14 — Forefoot target diluted by shoe votes (RESOLVED 2026-05-18 — transparency added)

**Surfaced in:** test_11 (§1 "very wide" forefoot, scan conf 1.00 → §3 "normal forefoot width").

Roman 2026-05-18: the resolved value is **fine** — three shoes report a perfect forefoot fit in medium-width lasts, so trusting the shoe feedback over the scan is correct. The issue was transparency, not the number. Resolved by restoring the adjustment footnote in `_build_p1` (`interp_what_to_look_for_v2.py`): when `target_fw` differs from the scan's `meas_fw`, §3 now reads "normal forefoot width (adjusted from wide scan result based on your current shoe fit)". Verified in test_11.

### B16 — §1 heel-depth sentence doesn't escalate for the "very" tiers

**Surfaced in:** test_13 (heel_depth 0.057 → "very deep heel" on V2 5-tier, but §1 says only "Your deep heel projects further back than most").

The B5 escalation (2026-05-18) added "particularly" wording for the very-tiers of arch and instep in `_t4_clause`, but the heel-depth T4 sentences (T4.7 deep / T4.8 shallow) were left unchanged. A very-deep / very-shallow heel reads identically to a plain deep / shallow one. Extend the B5 escalation to the heel-depth axis.

### B17 — Double possessive for model names ending in "'s"

**Surfaced in:** test_13 ("Your Scarpa Instinct VS Women's's empty heel...").

`_possessive` appends `'s` unconditionally. A model name already ending in `s` or `'s` (e.g. "Instinct VS Women's") gets a second `'s` → "Women's's". For names ending in `s`/`'s`, use a bare trailing apostrophe ("Women's'") or reword.

### B9 — Heel-depth 5-tier boundary is razor-thin

**Surfaced in:** test_5 (heel_depth 0.029 → "medium") vs test_3 (0.028 → "shallow heel") vs test_4 (0.027 → "shallow heel").

A one-thousandth change in `heel_depth_ratio` flips the shallow/medium tier. heel_depth values cluster tightly in the 0.027-0.030 range, so segmentation noise could routinely flip users between tiers, which then flips whether §1 mentions a shallow heel and whether §3 fires the heel-depth note. Worth checking whether the 5-tier bin boundary lands in a dense part of the distribution, and whether measurement repeatability is finer than the bin width.

## FIXED 2026-05-18

### B7 — §2 cascade fall-through "we aim for X" conclusion (RESOLVED 2026-05-18)

Roman decision 2026-05-18: the fall-through "In the recommendations we aim for X" conclusion is KEPT — when the cascade can't pin a cause, the user still reported the felt fit, and offering variants in that direction is a sensible response, not a contradiction. BUT it is SUPPRESSED when the user's relevant scan dimension is a "very" extreme (very narrow / very wide) — you cannot sensibly steer a very-wide or very-narrow foot toward a different cup size.

Implemented via `_aim_suppressed(profile, ratio_key)` in `interp_shoe_fit_v2.py` (`_classify_5tier` label starts with "very "). Applied to all six fall-through branches and their six group-renderer defaults: `_cascade_heel_empty` D, `_cascade_heel_tight` D, `_cascade_toes_roomy` D, `_cascade_ff_loose` C, `_cascade_ff_tight` D, `_cascade_toes_squeezed` E (heel branches keyed on `heel_width_ratio`, the rest on `forefoot_width_ratio`). The earlier B7 removal of the conclusion from ff_tight / toes_squeezed was REVERTED — they now carry the conclusion again, gated the same way. Group defaults all use the "even though" connector. Verified: test_12 (very wide heel → conclusion suppressed), test_4 (medium forefoot → conclusion present).

### B5 — "very" tier escalation (FIXED)

`_t4_clause` now escalates "rather" to "particularly" for very-tier 5-tier labels (very high/low instep, very short/long arch). Verified in test_5 ("particularly long arch").
