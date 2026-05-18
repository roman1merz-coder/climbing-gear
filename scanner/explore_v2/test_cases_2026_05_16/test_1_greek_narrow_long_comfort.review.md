# Test 1 Review — scan-2026-04-11T21-17-57 · sport / indoor / – / comfort

**Profile:** female, street 40, **Greek** toes (0.9 conf), **mild HVA**, **very narrow** forefoot (0.329, 5th percentile), normal heel width, **very low** instep, mid heel depth, **very long** arch.

**Shoes:** 1 — **Simond Rock+ EU 41** (1 size above street, very relaxed for Simond), heel=empty, toes/forefoot=perfect.

Automated checks: 1 WARNING (R7).

---

## §1 Your Foot Shape

> You have a Greek toe form with very narrow forefoot and a medium-width heel. A mixed profile; forefoot and heel require different fits.
>
> Beyond the obvious: Given your Greek toes, rather avoid very pointy shoes. These might squeeze your toe tips, even if the width of the shoe fits you. Given your long arch, the ball of your foot may be pushed into the toe box. A squeezed forefoot may be caused by this instead of actual shoe width, so look for rather short toe boxes. Additionally your instep is rather low, so an adjustable closure is preferable to avoid dead space. Ideally double velcro or laces, rather avoid pure slippers. Your big toe drifts slightly inwards (could be a mild hallux valgus), hence we recommend a slightly wider and not too asymmetric shape.

**OK** — slider ↔ prose alignment is clean. All non-mid dims (Greek, very narrow forefoot, very low instep, very long arch, mild HVA) covered in P1 or P2.

---

## §2 What Your Current Shoe Fit Tells Us

> You wear your Simond Rock+ in EU 41, which is actually 1.0 sizes above your street size of 40. That is very relaxed for Simond, where the typical downsize is about one size down.
>
> Your Simond Rock+'s empty heel is most likely a sizing issue — the very relaxed downsize creates an empty heel.

**NOTE** — §2 is very short (2 sentences) because the only shoe is oversized and its empty-heel feedback was correctly filtered as sizing artifact. The remaining toe/forefoot are "perfect", so the cascade has nothing to say. Worth adding a closing sentence like *"With only one heavily oversized shoe and no remaining cup-fit signals, the recommendations below rely entirely on your scan and stated preferences."*

---

## §3 What to Look For

> Based on your scan and current shoe fit, we target shoes with Greek toe form, **normal forefoot width**, and normal heel width.

**CRITICAL — target_fw says "normal" but the user's scan is at the 5th percentile (very narrow).**

The user's `forefoot_width_ratio = 0.329` is below V2 lo=0.343 → scan rank 0 (narrow). The Simond Rock+ is wide-cup with `forefoot=perfect` feedback → vote at rank 2 (wide). Aggregation: (scan rank 0 × ~3 weight + shoe rank 2 × 1 weight) / 4 = 0.5 → rounds up to 1 (medium/"normal"). Same failure mode as test 2's heel: **a strong extreme scan diluted by a single non-corroborating feedback signal**.

For a 1-shoe user whose only signal is "perfect in a wide shoe", we should probably trust the scan and ignore the perfect-in-mismatched-cup feedback (it's directionally suspicious — wide cup on narrow foot shouldn't feel perfect either).

> Given your preference for sport climbing indoors and a comfort fit, we prioritize balanced-stiffness velcros or lace-ups with flat profile and no asymmetry.

**OK** — sport indoor centers stiffness ~0.40 (balanced). Comfort → flat / no asymmetry. Mild HVA target_asym=none (which is "no asymmetry") matches.

---

## Recommendations

**CRITICAL — all 12 picks are "medium fit throughout" or wider.** Zero narrow-forefoot shoes despite user being at the 5th percentile. #11 Five Ten Kirigami is **wide** forefoot — even wider than the (incorrect) normal target.

Direct consequence of the bad target_fw above. Until the scan-dominance issue is fixed, this user is being steered toward shoes that don't match her foot.

**WARNING — 5 of 12 picks are Egyptian toe form** for a Greek user with toe_confidence=0.9. Picks #3 #6 #11 carry the "Egyptian toe box tapers to where the big toe should be longest, so your longer second toe presses into the seam" tradeoff. The current −3 penalty for neutral mismatch (greek vs egyptian/roman) is too soft for high-confidence Greek scans.

**WARNING — R7: only 3/12 picks have prices** (EU 40-42 has thin vendor coverage for many of these picks).

**OK — tier composition (R3)** clean — 3 baseline / 3 softer / 3 stiffer / 3 budget; brand cap respected; no_edge cap respected.

**OK — baseline foot-shape gate (R4)** technically passes — all 3 baseline picks have medium fit, matching the (wrong) target. Highlights the limitation of R4: it gates against the resolved target, not against the user's scan.

**OK — score breakdowns (R5)** no axis ≤ −15 in baseline picks.

**OK — tradeoff repetition (R8)** no sentence repeats >3 times verbatim, though several share the same template (the Egyptian-tapers-second-toe sentence and the Roman-flat-front sentence each appear twice).

---

## Issues for the backlog

1. **CRITICAL — scan dominance for extreme dims in single-shoe or low-shoe-count users.** Same root cause as test 2's wide-heel target diluted to medium. Need a rule: when scan is at rank 0 or 2 with high confidence AND feedback comes from ≤1 shoe AND that shoe is directionally non-corroborating (perfect-in-wider-cup, or perfect-in-narrower-cup), scan wins.

2. **WARNING — neutral toe-form mismatch (greek vs roman/egyptian) penalty too soft for high-confidence scans.** −3 lets 5/12 Egyptian shoes leak into Greek user's recs. Either scale the penalty by confidence (when scan is confident, penalize harder) or just bump it to −5/−6.

3. **NOTE — §2 closing for "no usable feedback" cases.** When the sizing-artifact filter blanks the only cup-fit signal, append a one-line "rely entirely on scan" sentence so §2 doesn't end abruptly.

4. **NOTE — price coverage <50% on this size range.** EU 40-42 vendor coverage is thin; might benefit from neighbor-size fallback for price display (±0.5 EU).
