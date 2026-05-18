# Test 2 Review — scan-2026-04-08T21-04-30 · sport / both / – / balanced

**Profile:** male, street 44.5, **Egyptian** toes (0.4 conf, low), normal HVA, **very wide** forefoot (0.456, top of distribution), normal heel width, **very high** instep (0.347), shallow heel, **very short** arch (0.674).

**Shoes:** 1 — **Mad Rock Drone 2 LV EU 44.5** (at street size = typical for Mad Rock), heel=empty, toes=squeezed, forefoot=perfect.

Automated checks: 1 WARNING (R7).

---

## §1 Your Foot Shape

> You have an Egyptian toe form with very wide forefoot and a medium-width heel. A mixed profile; forefoot and heel require different fits.
>
> Beyond the obvious: Your arch is rather short, meaning your toes are relatively long. Especially when considering aggressive shoes look for sufficient height in the toe box to let your toes curl up. Additionally your instep is rather high, so an adjustable closure is preferable to actually get into the shoe. Ideally double velcro or laces, you may struggle getting into slippers if adequately downsized.

**NOTE — prose says "rather short" / "rather high" but the sliders say "very low" / "very high".** The T4 generic wording doesn't escalate when the user is at the *very* end of the distribution. For a user at the 95th percentile instep or 5th percentile arch, "rather high" / "rather short" understates the impact. Same applies to forefoot — slider "very high" matches §1 "very wide" closely enough; arch and instep are the more obvious flatten.

**OK** otherwise — all non-mid dims (Egyptian, very wide forefoot, short arch, high instep) covered; HVA "none" correctly omitted; heel width "mid" correctly omitted from "Beyond the obvious" (mentioned only as part of P1's profile summary).

---

## §2 What Your Current Shoe Fit Tells Us

> Your Mad Rock Drone 2 LV (EU 44.5, at street size) is typical for Mad Rock, typical half a size down.
>
> Your Mad Rock Drone 2 LV's toe shape matches your Egyptian foot, but your wide forefoot in this narrow last is likely causing the squeeze. Look for wider lasts.

**OK — both empty heel and perfect forefoot were silently filtered by Rule B/C** as expected:
- empty heel + narrow cup + normal heel scan: Rule B (loose-direction in cup narrower than user, diff=1)
- perfect forefoot + narrow cup + very wide forefoot scan: Rule C (perfect at ≥2-rank cup mismatch)

After filtering only toes=squeezed survives → cascade fires the width-mismatch diagnosis.

**OK — toes cascade correctly identifies width as the cause** ("wide forefoot in this narrow last is likely causing the squeeze") even though Egyptian toe form matches. The updated cascade-with-width logic working as intended.

**NOTE — §2 abrupt without disclosure when everything is silently filtered.** Same B3 backlog item from test_1 — single-shoe users where most ratings get filtered by Rule B/C and only one cascade survives produces a thin §2.

---

## §3 What to Look For

> Based on your scan and current shoe fit, we target shoes with Egyptian toe form, wide forefoot width, and normal heel width.

**OK — target_fw = wide.** Rule C filter correctly excluded the Drone 2 LV's "perfect forefoot" vote (perfect in narrow cup for very-wide user is implausible). Only scan vote remained → wide. **B1 fix working.**

> Given your preference for sport climbing both indoors and outdoors and a balanced fit, we prioritize balanced-stiffness velcros or lace-ups with slight downturn and moderate asymmetry (shifted higher to match your Egyptian toe shape).

**OK** — sport/both/balanced → center stiffness 0.50 (balanced), slight downturn, moderate asym (Egyptian + no hallux bumps slight → moderate per V2 asym derivation rules).

> Note: data on shoe heel depth is unfortunately not widely available...

**NOTE** — this paragraph fires whenever target_hv doesn't match scan heel depth perfectly. User has shallow heel (0.034) → "mid" in 5-tier. Not really an issue for this user, but the paragraph fires anyway when there's any depth signal at all. Slightly hand-wavy.

---

## Recommendations (12 picks)

**OK — baseline tier (R4)** all 3 picks have **wide forefoot + medium heel** matching target (Ocun Ozone HV, Evolv V6, Tenaya Araí). Multi-form picks (Egyptian/Roman, Egyptian/Greek/Roman) acceptable since user is Egyptian (matches).

**NOTE — 4 picks (#6, #7, #11, #12) are medium-fit** instead of wide. These leak into softer/stiffer/budget tiers because the use-case match makes up for the −8 forefoot penalty. Same shape as test 2's leakage in the prior round; baseline tier stays clean per the new d=1 penalty.

**NOTE — #11 Scarpa Arpia V** is Greek (vs user Egyptian) → -3 neutral mismatch. With toe_confidence=0.4 (low), -3 may be too soft to keep Greek shoes out. Same as test 1's B2 backlog item.

**WARNING — R7: 3/12 picks have prices.** Common for EU 43-45 men's range with niche brands.

**OK — R3 tier composition** clean.
**OK — R5 score breakdowns** no axis ≤ −15.
**OK — R8 repetition** no tradeoff sentence repeats >3 times.

---

## Summary

Overall a **clean test case**. The B1 fix (Rule C perfect-in-mismatched-cup) is working — user gets wide-forefoot recommendations correctly. The §2 narrative is succinct and the toes-squeezed cascade properly identifies width as the cause.

### New items for backlog

None — all findings duplicate existing backlog entries:
- B3 (§2 abrupt closing) — already logged
- (toe-conf penalty) — B2 — already logged
- (T4 wording doesn't escalate to "very") — NEW NOTE, adding to backlog as B5

### B5 — §1 T4 wording flattens "very" tiers into "rather"

**Surfaced in:** test_2 (instep "very high" on slider → "rather high" in §1 P2; arch "very low" on slider → "rather short" in §1 P2).

T4 sentences (`Additionally your instep is rather high...`, `Your arch is rather short...`) don't escalate for users at the extreme ends. A user at the 95th percentile gets the same prose as one at the 65th. Proposal: for `very high` / `very low` 5-tier labels, use "particularly high" / "noticeably short" or similar to convey the extreme.
