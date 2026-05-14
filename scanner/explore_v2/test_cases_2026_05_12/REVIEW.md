# V2 Sandbox — 5 Test Cases, Per-Scan Review (2026-05-12)

5 fresh production scans, **not in the existing sample set**, run through the full V2 pipeline with random V2 preferences. Below: what each output looks like, and what's broken in each. **No fixes implemented — review only.**

---

## Test 1 — `scan-2026-04-09T08-08-58` · boulder / outdoor / sandstone / aggressive

**Scan profile:** male, street 42, Roman toe (0.4 conf), **pronounced HVA** (0.398), forefoot 0.367 (production "normal", at hi boundary; V2 5-tier "wide"), heel 0.231 (medium), high instep 0.282, normal heel depth, normal arch.
**Shoes:** 1 — La Sportiva Mythos EU 42 (street size, very relaxed for La Sportiva); fit: heel perfect, toes roomy, forefoot perfect.

**What the output says now:**
- §1: "wide forefoot and a medium-width heel"
- §3: "normal forefoot width, and normal heel width"
- §2: only the artifact-disclosure sentence, then sizing intro, then nothing else
- 12 recommendations, several Egyptian-toe-form shoes with the "Egyptian toe box tapers steeply down" tradeoff repeated

**Issues to address:**

1. **§1 forefoot "wide" vs §3 target "normal" — dimension classifier disconnect.** §1 prose runs through the V2 5-tier classifier; §3 target uses the production 3-tier `*_class` columns and `target_resolver`'s POP_FOREFOOT_HI=0.367. At forefoot=0.367 the two systems disagree. Same root cause as the case-3 heel-depth disconnect — needs resolution at the **target resolver** layer: target should be derived from V2 5-tier so it stays in sync with the slider and §1 prose.

2. **Single-shoe fully-filtered users get a useless §2.** With only one shoe whose feedback was discounted, §2 has no actionable content — the user sees the disclosure sentence and nothing else. Should explicitly close the section: "With only one heavily oversized shoe and no other fit signals, we rely entirely on your scan + preferences for these recommendations."

3. **Egyptian-toe shoes recommended for a Roman foot.** 7 of 12 picks have Egyptian toe form with the same canned "tapers steeply down" tradeoff sentence. Two problems: (a) recommendation engine should down-rank toe-form mismatches more aggressively given user is Roman with low confidence (0.4); (b) the tradeoff sentence is identical across 7 picks — feels like fluff and reduces user trust. Either filter harder, or vary the wording (or drop it when the same warning fires across many picks).

4. **Recommendation #1 (Unparallel Leopard II) shows no price.** Means no vendor in stock at user's EU 44. With aggressive prefs, EU 44 might not be the right rec size. Consider price-fallback to neighbor sizes (±0.5 EU) before declaring "no price".

---

## Test 2 — `scan-2026-05-11T08-59-37` · sport / outdoor / limestone / moderate

**Scan profile:** male, street 41, Roman toe, normal HVA (0.247), **forefoot 0.384 (very wide)**, **heel 0.266 (very wide)**, normal instep, normal heel depth, normal arch.
**Shoes:** 2 — Scarpa Instinct VSR EU 41 (relaxed for Scarpa, filtered) + La Sportiva Mandala EU 39 (typical for La Sportiva); both heel=empty + toes=squeezed.

**What the output says now:**
- §1: "very wide forefoot and heel. Throughout a wide profile."
- §2: VSR empty heel filtered (good); but "Your La Sportiva Mandala's heel feels empty... should fit based on heel width and depth, you're sized typically for La Sportiva. **In the recommendations we aim for even narrower heel cups.**"
- §3 target: "Roman toe form, **wide forefoot width**, and **normal heel width**"

**Issues to address:**

1. **§3 says "normal heel width" for a user with very-wide-heel scan.** The Mandala "empty heel" feedback (real signal, sized typical for brand) drags the target from wide → normal. But the scan strongly says very wide. **The principled fix**: when scan is at an extreme (rank 0 or 2) AND post-filter feedback contradicts that direction without majority support, the scan should win. Right now the artifact filter only catches sizing-explained ratings; it doesn't catch the broader "feedback contradicts strong scan" case.

2. **§2 cascade says "even narrower heel cups"** for a user with **very wide** heel. Direct contradiction. Even if we trust the empty feedback, recommending NARROWER cups for someone at the 80th-percentile heel width is dangerous — the shoe will be even tighter and more painful. The cascade narrative should at minimum acknowledge the scan: "your Mandala's empty heel is unusual given your wide heel — your scan suggests this brand's last is geometrically off rather than too wide for you, so we look for differently-shaped wide cups instead."

3. **§2 cascade misattributes cause: "should fit based on heel width and depth, sized typically for La Sportiva".** Telling the user "this should fit but doesn't" is a non-explanation. Better: present the disagreement explicitly and pick a side — either trust the scan (recommend wide, explain Mandala's specific cup is geometrically off for the user) or trust the feedback (recommend narrow, but warn that this contradicts the scan).

4. **All 12 recommendations have wide forefoot but most have medium heel cup** — matches the (wrong) target. With a corrected target_hv = wide, the rec mix would change.

---

## Test 3 — `scan-2026-04-17T10-22-40` · trad_multipitch / outdoor / granite / comfort

**Scan profile:** male, street 43, **Egyptian** (0.9 conf), normal HVA, wide forefoot (0.391), wide heel (0.252), low instep, **deep heel** (0.048), **short arch** (0.687).
**Shoes:** 2 — La Sportiva Skwama EU 41 (typical down from 43 = -2 → "typical for La Sportiva at -2.25 typical"), Tenaya Mastia EU 40.5 (-2.5 vs typical -1.5 → "rather aggressive"); both **all-perfect** fit.

**What the output says now:**
- §1: comprehensive — Egyptian + wide forefoot + wide heel + short arch + low instep + deep heel all mentioned
- §2: sizing intro mentions only **Tenaya Mastia** (most-deviating). No fit-feedback paragraphs (everything perfect → cascade emits nothing).
- §3: target Egyptian / wide forefoot / wide heel — clean, matches §1
- 12 recommendations, mostly lace-up flat-profile slight-asymmetry — matches comfort/trad target

**Issues to address:**

1. **§2 sizing intro names only the most-deviating shoe.** Skwama (the other shoe) goes unnamed even though it informed the diagnosis. With only 2 shoes the intro should mention both — currently it picks the "interesting" one and silently drops the other.

2. **All-perfect shoes produce zero §2 content** beyond the sizing intro. Should explicitly close: "Both your current shoes fit well, so the recommendations are extrapolated from your scan plus your stated preferences." Otherwise the user wonders if §2 is broken.

3. **Several recommendations use Roman/Greek toe-form lasts** for an Egyptian-toe user with high confidence (0.9). The system flags it as a tradeoff but the picks shouldn't be in the top 12 in the first place when there are good Egyptian alternatives. Pre-filter or hard-downrank toe-form mismatches.

4. **Comfort users get "slightly more asymmetric than we target" tradeoff** — for someone optimizing for comfort, asymmetry matters more than the "slightly" suggests. The wording understates the impact for this preference cohort.

---

## Test 4 — `scan-2026-05-12T10-43-23` · boulder / both / balanced

**Scan profile:** male, street 45, Roman toe, normal HVA, normal forefoot (0.356), **very wide heel** (0.278, above vh_hi 0.255), high instep (0.287), **deep heel** (0.122 — extreme), normal arch.
**Shoes:** 3 — all Scarpa (Drago, Vapor S, Boostic R), all EU 44 (-1 from street, "typical" for Scarpa typical -1.25); all-perfect everywhere.

**What the output says now:**
- §1: "Roman toe form with medium-width forefoot and a very wide heel. A mixed profile..." — accurate
- §2: "You wear your Scarpa shoes in sizes EU 44, one size down... typical fit." Then nothing else.
- §3: "Roman toe form, **normal forefoot width**, and **normal heel width**"

**Issues to address:**

1. **§3 target "normal heel width" for a user whose scan says VERY WIDE.** Same root cause as test 2 — but here the feedback is all PERFECT (no contradiction). The math: scan_hv rank 2 with conf high + 3 perfect votes at the shoes' actual rank (medium cups). Avg pulled from 2 → ~1.4 → rounds to 1 (medium). **Even unanimous-perfect feedback drags the target away from a strong scan.** The semantically-correct inference: "Your wide heel happens to fit perfectly in these specific medium cups (good for this user), but for new picks we should target wider cups that match the scan more precisely so the user has more options that fit." Currently the system collapses to "medium" and may recommend shoes that fit the user's heel less well than what the scan suggests.

2. **§2 collapses 3 individual shoes to "Your Scarpa shoes"** — the user can't see which specific model informed the diagnosis. With 3 shoes there's no fit variation to discuss, but the names should still appear: "Your Scarpa Drago, Vapor S, and Boostic R all fit you well at EU 44 (one size down from street 45 — typical for Scarpa)."

3. **High-instep + slipper warning works correctly** (Cobra rec gets the "slipper closure leaves no adjustability" tradeoff). Good.

4. **Heel depth class = "deep heel"** (0.122 — way above hi=0.041) but `_t4_clause` only mentions deep-heel guidance ("a deeper, more sculpted heel cup fits naturally"). For 0.122 (3× the threshold), a stronger "look specifically for deep-cup heel pockets, narrow-cup shoes will leave the back of your heel hanging" would be more useful. Current wording is generic.

---

## Test 5 — `scan-2026-05-07T21-11-52` · sport / indoor / moderate

**Scan profile:** male, street 42, Egyptian (0.9 conf), normal HVA, normal forefoot, normal heel width, normal instep, **deep heel** (0.053), normal arch.
**Shoes:** 4 — Scarpa Drago XT EU 41.5 (rather relaxed) heel/toes loose + ff tight; Scarpa Veloce L EU 40 (rather aggressive) heel/toes loose; Scarpa Generator EU 40 (rather aggressive) heel loose + ff tight; Evolv Shaman EU 42 (street, typical Evolv) toes tight only.

**What the output says now:**
- §1: "Egyptian toe form with medium-width forefoot and heel... medium profile" + deep-heel mention
- §2: **3 separate disclosure sentences in a row** for the artifact-filtered ratings, then sizing intro, then "In 2 of your 4 shoes (Veloce L, Generator), heel feels empty... we aim for narrower heel cups in the recommendations."
- §3 target: "Egyptian toe form, normal forefoot width, **narrow heel width**"

**Issues to address:**

1. **§2 disclosure section is verbose and repetitive.** Three sentences, all "is consistent with its sizing — at X in Scarpa where typical downsize is 1.5 sizes — so we set it aside as a sizing artifact". Should consolidate per shoe: "Your Scarpa Drago XT's loose heel and loose toes are consistent with its rather-relaxed sizing (set aside as artifacts). Your Scarpa Generator's tight forefoot is consistent with its rather-aggressive sizing (also set aside)." One sentence per shoe instead of one per (shoe, dim).

2. **The "loose heel" cascade fires for Veloce L and Generator after they survived the artifact filter** — but they're rather aggressive sizings. Aggressive downsize should make heel tighter, not looser. So "loose heel in an aggressive shoe" is anomalous — and the artifact filter only catches the directionally-aligned cases (loose+oversized, tight+undersized). It MISSES the directionally-opposite anomaly (loose in undersized → almost certainly a real cup-too-wide signal). The cascade then recommends "narrower heel cups". For a normal-heel + deep-heel user, this might be wrong — they need DEEPER cups, not necessarily narrower (deep heel = projects backward, not narrow side-to-side).

3. **Heel "narrow" target conflicts with deep-heel scan.** The user has DEEP heel (0.053, extreme). Recommending narrow-cup shoes (typical "duck foot" picks like Evolv Zenist, Butora Gomi, La Sportiva Solution) won't accommodate the heel projecting backward. Need a separate axis for cup depth — currently conflated with cup width via the v1 shallow-heel vote. (Already tracked in `project_heel_cup_geometry_future.md` as the long-term fix.)

4. **Shaman tight toes → cascade says "feel squeezed"** — there's an implicit tight→squeezed mapping somewhere I haven't traced. Looks correct but worth verifying it's intentional and applied consistently.

5. **All 12 recommendations are "narrow heel cup" Egyptian shoes** — they all match the (questionable) narrow-heel target. With a corrected target (medium-width + deep cup) the mix would be very different.

---

## Cross-scan themes

These show up in 3+ scans and are worth fixing once with general logic:

**T1. Scan-vs-target dimension disconnects.** Tests 1, 2, 4 all show §1 (5-tier prose) saying one thing about a foot dimension and §3 (target) saying another. Already fixed for §1 prose-vs-slider — needs the same alignment for §3 target. Concretely: `target_resolver` should accept the V2 5-tier classifier outputs (or the underlying ratios) so target labels share the same boundaries as the slider.

**T2. Scan dominance for extreme dimensions when feedback is non-corroborating.** Tests 2 and 4 show that even non-contradictory feedback (just empty in test 2, just perfect in test 4) can drag target away from a strong scan signal. The current artifact filter only handles directionally-aligned sizing artifacts; need a broader rule: when scan is rank 0 or 2 with high confidence, feedback can refine within ±1 but cannot reverse direction without overwhelming counter-evidence.

**T3. Conflated heel "volume" axis.** Tests 4 and 5 show users whose heel is DEEP (anteroposterior) being given heel-width recommendations as if depth and width were the same. The single-axis heel_volume target collapses two real shape dimensions. Long-term: separate `heel_cup_shallow_compatible` axis on shoes, scored independently.

**T4. Toe-form mismatch picks.** Tests 1, 3, 4 all surface multiple recommendations whose toe-form contradicts the user's scan toe shape. With the same generic tradeoff sentence repeated 5–7 times across picks, user trust erodes. Either pre-filter toe-form mismatches harder, or vary the tradeoff wording per pick.

**T5. §2 narrative gaps when there's nothing "interesting" to report.** Tests 1 (single-shoe artifact-only), 3 (all-perfect), and 4 (all-Scarpa-perfect) end §2 abruptly with no closing. Should always add a one-line summary closing — either "no usable feedback signal", "all shoes fit well", or "feedback aligns with scan", as appropriate.

---

## Files

The 5 rendered HTML cases live in `scanner/explore_v2/test_cases_2026_05_12/`:

| File | Scan | Profile shorthand |
|------|------|-------------------|
| test_1_pronounced_hva.html | scan-2026-04-09T08-08-58 | Roman / pronounced HVA / 1 shoe |
| test_2_wide_everything.html | scan-2026-05-11T08-59-37 | Roman / very wide everything / 2 shoes |
| test_3_egyptian_wide.html | scan-2026-04-17T10-22-40 | Egyptian / wide / 2 perfect shoes |
| test_4_roman_deep_high.html | scan-2026-05-12T10-43-23 | Roman / very wide heel / deep heel / 3 perfect Scarpa |
| test_5_egyptian_4shoes.html | scan-2026-05-07T21-11-52 | Egyptian / 4 mixed-sizing shoes |
