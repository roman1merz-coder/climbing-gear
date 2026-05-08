# V2 audit — real bugs (S14, S15) requiring your call

Generated 2026-05-02. Wording fixes (S9, S11, S12, S13, S17, S18, S20) applied
in same pass; S10 was already addressed in the cascade dispatcher; S16 and S19
deferred as low-impact polish.

These two are NOT wording. They are gaps in the pipeline that silently
swallow real fit signal. I need a decision on canonicalization before
fixing, because each option changes downstream behavior.

---

## S14 — Heel rating "loose" silently ignored by dispatcher

**The bug.** `_DIM_DISPATCH["heel"]` only knows two non-perfect ratings:
`empty` (positive) and `tight` (negative). Some scans have shoes with
`heel == "loose"` in their `fit` JSON. When that happens, the dispatcher
sees no `pos_shoes` and no `neg_shoes` and emits NOTHING for heel. The
user reads no heel sentence at all even though their data shows a loose
heel in 4 of 5 shoes.

**Impact (audit data).** Scan 18 has 4 of 5 shoes with `heel == "loose"`
and produces no §2 heel paragraph. Across the last 20 scans:
- 1 scan with heel="loose" in the dominant pattern (Scan 18, 4/5 shoes)
- 0 scans where loose was a minority rating

So this is rare in the current data, but every "loose" reading is
information being thrown away.

**Where "loose" comes from.** It's in the legacy frontend rating set —
the Section 2 frontend (in scan.html) lets users tag heel as
`empty / loose / perfect / tight`. Older scans have it; newer scans
likely too if the UI still exposes it.

**Three options for your call:**

**(a) Treat "loose" as alias for "empty".**
Map at the dispatcher level: when reading a shoe's heel rating, normalize
`loose` → `empty`. The cascades already handle empty fully. Consequence:
the user's "loose" feedback gets the same diagnosis paths as empty, even
though "loose" might mean a milder version. We lose a level of detail but
zero rule duplication.

**(b) Stop the UI from emitting "loose".**
Make heel a 3-state choice (`empty / perfect / tight`) in the frontend
and normalize legacy data on read. Cleanest end state, but requires a UI
change AND a one-time backfill on `foot_scan_fits.shoes` JSON. Higher
effort, but eliminates the ambiguity at the source.

**(c) Add a third cascade for "loose" = mild empty.**
Wire `loose` as its own positive rating with its own cascade and aggregate
sentences ("your heel slides slightly", "consider a half-step
narrower cup"). Most accurate to user intent. Adds ~80 lines of cascade
and aggregate code mirroring the empty branch. Maintenance overhead long
term; meaningful if "loose" is a real distinct signal you want to surface.

**My recommendation:** (a). The signal is rare in the current data, and
"empty vs loose" is a distinction users likely don't draw cleanly when
self-rating. Mapping `loose → empty` recovers 100% of the lost cascades
with 1 line of code and zero duplication. If the distinction starts to
matter (you see meaningful disagreement between cases tagged "loose" vs
"empty"), promote to (c) later.

**If you pick (a) or (c), tell me and I implement immediately. (b) needs
a frontend change too, so I'd queue it separately.**

---

## S15 — N=0 shoes case returns empty §2

**The bug.** When the user uploads a scan without entering any current
shoes (legitimate use case: never owned climbing shoes), `generate_shoe_fit`
returns `[]`. The frontend renders no §2 section at all, which looks
broken — a heading with nothing under it, or the section disappears
entirely depending on the renderer.

**Impact (audit data).** Scan 17 in last-20 has zero shoes. There's
likely a steady trickle of new climbers who land here.

**The right behavior is informational, not diagnostic.** §2's purpose is
to read fit signal from existing shoes. With no shoes, there's no fit
signal — but that's a fact worth stating, not a hole. Two ways to fill:

**(a) Single transparency paragraph.**
> "You did not add any current climbing shoes to your scan. Without that
> reference, we lean on your foot scan alone and the recommendations
> below assume a typical brand-typical downsize for your street size."

**(b) Single paragraph + pull a §1 anatomy hook.**
> "You did not add any current climbing shoes to your scan, so the
> recommendations rely on your foot scan alone. Your {dominant anatomy
> insight from §1, e.g. 'wide forefoot and Egyptian toe shape'} are the
> primary signals we use; expect the picks below to lean toward shoes
> known to suit that profile."

(b) is more useful but requires reaching into §1 from §2. Cross-paragraph
coupling is a small architecture taste call.

**My recommendation:** (a). Keep §2 self-contained. The §1 hook in (b)
is informative but the §3 "What to Look For" already states the fit
target explicitly, so the user gets that signal anyway. (a) just owns
the explanation that this section is light because the user didn't
provide input — sets correct expectations without adding cross-section
dependency.

**If you pick (a), I add ~5 lines to `generate_shoe_fit`. (b) needs a
helper to extract the §1 dominant insight, ~20 lines.**

---

## Summary of decisions needed

| # | Bug | Pick |
|---|---|---|
| S14 | Heel "loose" ignored | (a) alias to empty / (b) UI fix / (c) own cascade |
| S15 | N=0 shoes returns empty §2 | (a) self-contained / (b) §1 hook |

Both are blocking the next audit pass — the wording fixes won't show up
on Scan 17 (N=0) at all and will be incomplete on Scan 18 (heel loose).
Mark your picks and I'll implement.
