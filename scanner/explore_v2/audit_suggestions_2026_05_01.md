# V2 audit — improvement suggestions for Roman's review

Generated 2026-05-01. Based on `audit_last20_2026_05_01.md` (last 20 scans
through new V2 pipeline with seeded-random V2 inputs per scan).

**No code changes implemented yet — this is the suggestion list for your
review.**

Issues sorted by severity. "Affected scans" cites the audit row numbers.

---

## P0 — text correctness bugs (clearly wrong, fix asap)

### S1. Article "an" before consonant in §3 P2
**Affects:** scans 1, 2, 3, 4, 7, 8, 11, 13, 15, 16, 17, 18, 19, 20 (most §3
outputs).
**Bug:** code always emits "an {aggressiveness}" — produces "an balanced",
"an comfort", "an moderate". Only "an aggressive" is grammatically right.
**Examples:**
- Scan 1: "and an balanced fit"
- Scan 3: "and an comfort fit"
- Scan 6: "and an moderate fit"
**Fix:** add an article guard in §3 P2 — "an" only before vowel sounds
(`aggressive` starts with vowel; the others don't).

### S2. Subject-verb agreement: "toes feels" should be "toes feel"
**Affects:** scans 4, 6, 16, 19 (anywhere minority-toes sentences emit).
**Bug:** my dispatcher template uses singular verb on plural noun:
`"Your {brand}'s {dim} feels {rating} while ..."` — for `dim="toes"` this
yields "toes feels".
**Fix:** verb-by-dim mapping in `_dispatch_dim` minority branch:
- heel/forefoot → "feels"
- toes → "feel"

### S3. Cascade D fires "sized typically" when user is OVER-downsized
**Affects:** scan 14 (Tenaya Tatanka 2.5 sizes down vs typical 1.5 = over).
**Bug:** `_cascade_toes_roomy` cascade D fires when no upstream branch
matched. But for toes-roomy, cascade C only fires when UNDER-downsized
(going smaller could tighten). When user is OVER-downsized, no cascade C
candidate exists, so D fires — but D says "sized typically for {brand}",
which is false.
**Same pattern likely affects:** `_cascade_heel_empty.D` (over-downsized
+ heel empty), `_cascade_heel_tight.D` (under-downsized + heel tight),
`_cascade_ff_tight.D` / `_cascade_ff_loose.D`.
**Fix:** D should branch on actual sizing status. When sizing is
actually "typical" → current wording. When sizing is "over" but cascade
C wasn't applicable (because over-downsizing wouldn't help) → reword to
"You're more aggressively downsized than typical for {brand}, but that
shouldn't drive this specific issue. In the recommendations we aim for
{direction}." Similarly for under-when-over-doesn't-help.

### S4. Aggregate sentence drops the dimension noun
**Affects:** scans 6, 12.
**Bug:** `_aggregate_heel_empty` fallback wording:
`"...your {clean_width(user_hw) or 'heel'} needs cups narrower..."`.
For user_hw="normal" → "your normal needs cups narrower" (missing word
"heel"). For user_hw="wide heel" → strips to "wide" → "your wide needs
cups narrower".
**Examples:**
- Scan 6: "your normal needs cups narrower than these models offer."
- Scan 12: "your wide needs cups narrower than these models offer."
**Fix:** always append the dimension noun:
`f"your {_clean_width(user_hw)} heel needs cups narrower..."`.
Same for forefoot aggregates.

### S5. S1.1.c follow-up + Cascade C duplicate
**Affects:** scan 20 (and any case with relaxed sizing + heel empty).
**Bug:** S1.1.c (V1 wording — "Downsizing further toward the typical
range could tighten the heel cup and reduce the empty feel.") fires AS
PART OF the sizing intro. Then cascade C fires the SAME diagnosis from a
different angle.
**Example scan 20:**
- Para 1 ends with: "...Downsizing further toward the typical range
  could tighten the heel cup and reduce the empty feel."
- Para 2: "Comparing your La Sportiva Skwama to your foot profile, it
  should fit. You only downsized 1.5 sizes down vs the usual 2.5 sizes
  down for La Sportiva, so going down further could tighten the heel
  and reduce the empty feel."
**Fix:** drop S1.1.c entirely (already flagged in v3 Excel notes).
Cascade C owns sizing diagnosis.

### S6. Cascade C wording when user upsized vs street size
**Affects:** scan 2 (user wears EU 44.5, street 43 — actually upsized).
**Bug:** Cascade C reads: "You only downsized 1.5 sizes above street
size vs the usual at street size for Evolv". The string "downsized 1.5
sizes above" is logically broken — you can't "downsize" by going above
street.
**Fix:** detect when raw downsize ≤ 0 and use different phrasing in
cascade C:
- `"You're sized at/above street size for {brand}; the typical
  downsize for this brand is {typical_label}, so going down further
  could tighten the heel..."`

### S7. "the typical downsize is about at street size" in S1.1.b
**Affects:** scan 2 (Evolv has typical_downsize_mid = 0).
**Bug:** when typical_downsize is 0, `_downsize_label_raw(0)` returns
"at street size", and the sentence reads "the typical downsize is
about at street size" — grammatically bad.
**Fix:** when typical is 0, use a different template:
- `"For {brand}, where the typical fit is at street size, this is a
  {label} fit."`

---

## P1 — wording consistency / clarity (medium severity)

### S8. Soft-class promotion creates display↔prose mismatch
**Affects:** scans 2, 7, 14, 17 (any borderline measurement).
**Issue:** when `forefoot_width_ratio = 0.362` (within 0.005 of hi=0.367),
soft-class promotes `forefoot_width_class` from "normal" → "wide" in §1
prose. But the foot view MetricBar still shows the raw value sitting in
the "mid" band → user sees "normal" on the slider but "wide forefoot"
in the text.
**Examples:**
- Scan 2: forefoot 0.362 (raw=normal) → §1 says "wide forefoot"
- Scan 7: forefoot 0.347 (raw=normal) → §1 says "narrow forefoot"
- Scan 14: arch 0.713 (raw=normal) → §1 says "Your arch is rather short"
**Three options for your review:**
- **(a)** tighten tolerance (drop to 0.002) so fewer borderline cases
  promote. Loses Roman's actual long-arch case (0.733 vs 0.734).
- **(b)** keep promotion in prose but ALSO adjust the live MetricBar to
  show the promoted band when value is within tolerance.
- **(c)** add a hedge in the prose: "...borderline narrow forefoot
  (ratio 0.347, just at the boundary)" so the user understands.

### S9. "balanced stiffness {closure}" reads awkward
**Affects:** scans 1, 4, 7, 8, 11, 16, 17, 19, 20.
**Issue:** for the middle stiffness bin (0.40–0.60), output is "balanced
stiffness" → in prose: "balanced stiffness double-velcros or lace-ups".
The two-word adjective is grammatically OK but reads clunky.
**Possible rewrites:**
- **(a)** drop "stiffness" word in prose (use "balanced" alone) →
  ambiguous but smoother
- **(b)** hyphenate: "balanced-stiffness double-velcros"
- **(c)** restructure sentence: "we prioritize double-velcros or
  lace-ups in a balanced stiffness range, with..."

### S10. "while your other shoes fit" misleading when others have other issues
**Affects:** scan 18 (5 shoes; one has forefoot tight + others have
heel loose).
**Issue:** minority sentence says "Your La Sportiva Mantra's forefoot
feels tight while your other shoes fit." But the OTHER shoes have heel
problems on a different dim, so saying they "fit" is misleading.
**Fix:** narrow the claim to the specific dim:
`"Your {Brand} {Model}'s forefoot feels tight while the others fit on
the forefoot."`

### S11. Possessive on names ending in apostrophe-s
**Affects:** scan 4 ("La Sportiva Tarantulace Women's").
**Bug:** the dispatcher uses `f"Your {name}'s {dim} ..."` → for a name
ending with `'s`, this yields `"Tarantulace Women's's toes feel ..."`.
**Fix:** detect names ending in `'s` and either:
- use just trailing apostrophe: `"Tarantulace Women's' toes feel ..."`
  (technically correct but reads weird)
- restructure: `"Your Tarantulace Women's has roomy toes"` (cleaner)

### S12. Multiple identical mismatch sentences for the same toe-form mismatch
**Affects:** scan 19 (3 different shoes all squeezed for roman-toe-form
mismatch — emits 3 separate sentences saying the same thing).
**Issue:** repetitive prose. Each sentence:
- "Your La Sportiva Finale's toes feel squeezed while your other shoes
  fit. Your La Sportiva Finale is built on an egyptian toe form while
  you have roman toes. The mismatch is the most likely cause; look for
  shoes with a roman-compatible toe box."
**Fix:** when ≥2 minority shoes share the same cascade outcome (e.g.
all toe-form mismatch with same shoe form), consolidate:
- "Your La Sportiva Finale, La Sportiva Solution, and Scarpa Instinct
  VSR all show squeezed toes because none are built on a roman-compatible
  toe form. Look for shoes built for roman toes."

### S13. Toe form labels in cascade A use lowercase
**Affects:** scans 8, 15, 19 (anywhere toe-form mismatch fires).
**Issue:** "Your X is built on a greek toe form while you have roman
toes." — the toe shape names should be capitalized for consistency with
§1 ("Egyptian"/"Greek"/"Roman").
**Fix:** capitalize: "...built on a Greek toe form while you have Roman
toes."

---

## P2 — coverage gaps and edge cases

### S14. Heel rating "loose" not handled by dispatcher
**Affects:** scan 18 (4 of 5 shoes have heel="loose" — never fires
because dispatcher only handles {empty, tight}).
**Issue:** Pre-existing data has "loose" as a heel rating, but my
cascade dispatcher only handles empty/tight. Loose-heel issues silently
ignored.
**Fix:** decide canonical heel ratings — either:
- (a) treat "loose" as alias for "empty" (UI uses both interchangeably)
- (b) fix UI to never emit "loose" heel
- (c) add third cascade for "loose" heel = mild empty

### S15. N=0 shoes case (scan 17)
**Affects:** scan 17 (uploaded scan but didn't add any current shoes).
**Issue:** §2 returns []. The current rendered output shows nothing for
§2.
**Fix:** add §2 message for N=0:
`"You didn't add any current shoes. We'll lean on the scan alone for
the recommendation; pull a §1 caveat through."`

### S16. Per-shoe sentences could share a sizing prefix
**Affects:** scan 19 (3 shoes named in 4 separate sentences — sizing
context mentioned multiple times).
**Issue:** each minority cascade restates "Your {brand} {model}'s"
prefix even when 3 shoes from the same brand are involved.
**Fix:** when ≥2 minority shoes are same brand AND same cascade
outcome, group:
- "Your La Sportiva Finale and Solution both feel squeezed because
  neither is built on a roman-compatible toe form."

---

## P3 — minor polish

### S17. P2 of §3: "with a balanced stiffness" instead of "in a balanced stiffness"
**Issue:** my P2 template uses "with {downturn} and {asymmetry}" — the
"with" is the connector. If I switch stiffness placement (per S9
restructure), the connector word should make sense for both.

### S18. Consistent capitalization of toe shape names everywhere
**Affects:** §2 cascade output uses lowercase "egyptian/greek/roman" in
some sentences.
**Fix:** sweep all interp_*_v2.py user-facing strings to capitalize toe
shape labels.

### S19. Cascade C / D wording: "should fit" repeated across cases
**Issue:** "Comparing your X to your foot profile, it should fit" appears
in many cascade outcomes. While intentional, when MULTIPLE cascade Cs
fire across multiple shoes, it gets repetitive.
**Possible fix:** once cascade C language used, subsequent shoes can
omit the prefix:
- First: "Comparing your {Brand} {Model} to your foot profile, it
  should fit. You only..."
- Second: "Same situation for your {Brand} {Model} ({size_eu})."

### S20. Long P3 caveat block can stack 2-3 clauses
**Affects:** scan 1 has soft_mask + tier_closing back-to-back in one P3
paragraph.
**Issue:** clauses run together without separation. Reads ok but
visually dense.
**Possible fix:** when P3 has multiple clauses, render as separate
paragraphs (each on its own line) instead of concatenating into one.

---

## Summary

**Scans without major issues:** 5, 9, 10, 13 (Roman's case), 16.
The cascade + 3-paragraph structure works correctly for these.

**Scans with multiple issues:** 1 (article + soft-mask), 2 (multiple
sizing wording bugs), 4 (subject-verb + possessive), 18 (loose-heel
ignored + minority misleading + multi-shoe brand grouping), 19 (multiple
toe-form mismatch repetition + lowercase toe shapes).

**Worst categories by frequency:** S1 (article "an", ~14 scans), S2
(subject-verb "toes feels", 4 scans), S8 (soft-class display mismatch,
~4 scans).

---

## Suggested fix order (when you say go)

1. **Trivial typography fixes (1 hour total):** S1, S2, S4, S13, S18
   — pure string template fixes, no logic changes.
2. **Cascade D wording branch (S3, S6) + S1.1.c drop (S5) + S7
   typical=0 wording:** maybe 2 hours, requires careful testing.
3. **Soft-class display↔prose mismatch (S8):** decide one of the three
   options first; implementation depends on choice.
4. **Multi-shoe consolidation (S12, S16):** ~3 hours, more involved
   logic.
5. **Edge cases (S10, S11, S14, S15):** smaller priority.
6. **Polish (S9, S17, S19, S20):** lowest priority unless wording
   really bothers you.

Mark the suggestions with ✓ or ✗ (or counter-proposals) and I'll
implement the approved set.
