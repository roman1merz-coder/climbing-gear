---
name: scanner-v2-test-case
description: Generate a fresh sandbox test case for the climbing-gear scanner V2 pipeline and review the rendered output for quality issues. Use when the user says "create a test case", "test a new scan", "test the scanner", "v2 test case", "scanner test", or wants to evaluate V2 output quality on a new scan.
---

# Scanner V2 Test Case

A two-step workflow for the V2 sandbox at `scanner/explore_v2/`. Generates one new test case, then reviews it.

Single test case per invocation. Sandbox-only (never touches production code or DB).

---

## Step 1 — Create the test case

### 1.1 Pick a scan (random)

Query Supabase `foot_scan_fits` for `pipeline_stage='complete'` rows. Filter to scans that have:
- All foot ratios non-null (forefoot_width_ratio, heel_width_ratio, instep_height_ratio, heel_depth_ratio, arch_length_ratio)
- A non-empty `shoes` array with at least one shoe whose `fit` dict has any of `heel/toes/forefoot` set

Then:
- **Skip duplicates** — list every scan_id already present in `scanner/explore_v2/test_cases_*/case_*.html` and `scanner/explore_v2/test_cases_*/test_*.html`. Don't repeat.
- **Skip corrupt side overlays** — fetch `<scan_id>-side_overlay.png` from Supabase storage. Quick test: load with PIL, check the foot mask isn't pathological. Rough heuristic: amber-fill aspect ratio (height/width of foot bounding box) should be < 0.55. Higher = leg likely captured. Skip and pick again.
- Pick uniformly at random from the remaining pool.

### 1.2 Pick V2 inputs (random)

```
discipline      ∈ {boulder, sport, trad_multipitch}     uniform random
environment     ∈ {indoor, outdoor, both}                uniform random
rock            ∈ {granite, limestone, sandstone, mixed} uniform random IF environment == "outdoor", else None
aggressiveness  ∈ {comfort, balanced, moderate, aggressive}  uniform random
```

### 1.3 Run the renderer

```bash
cd scanner/explore_v2
SUPABASE_SECRET_KEY="..." SUPABASE_SERVICE_KEY="..." \
  python3 render_v2_review_static.py \
    <scan_id> <discipline> <environment> <rock_or_-> <aggressiveness> \
    test_cases_<YYYY-MM-DD>/test_<N>_<descriptor>.html
```

Where `<descriptor>` = a short slug from the scan profile (e.g. `roman_wide_aggressive`, `egyptian_long_arch`).

### 1.4 Capture supporting artifacts

Run the helper:
```bash
python3 skill/scanner-v2-test-case/run_review.py \
    <scan_id> <discipline> <environment> <rock_or_-> <aggressiveness> \
    test_cases_<YYYY-MM-DD>/test_<N>_<descriptor>
```

It writes:
- `test_<N>_<descriptor>.scoring.json` — full per-pick score breakdowns (R5)
- `test_<N>_<descriptor>.checks.json` — machine-readable findings from the deterministic checks (R2-R4, R6-R8)

---

## Step 2 — Review the rendered HTML

For each section, walk through the checks below. Tag findings as **CRITICAL** (must fix before users see it), **WARNING** (degrades quality), or **NOTE** (improvement opportunity).

### §1 Your Foot Shape

- **Slider ↔ prose alignment (R6)**: every 5-tier slider label (very low / low / mid / high / very high) on the page must agree with how §1 prose describes that dim. E.g., if slider says "very wide forefoot" the prose can't say "normal forefoot".
- **Completeness**: every dim that is NOT mid (per the slider) must be mentioned somewhere in §1 (P1 or P2). Missing = WARNING.
- **No contradictions** within §1 P1 vs P2.

### §2 What Your Current Shoe Fit Tells Us

- **Sizing intro**: names every shoe that's in the user's collection AND gives its sizing-vs-brand-typical label.
- **Disclosure section** (artifact-filtered ratings): each blanked rating gets a sentence; the cause attribution makes sense:
  - "sizing" cause → shoe is sized away from brand typical AND feedback direction matches (relaxed → loose feedback; aggressive → tight feedback)
  - "sit_above" cause → shoe cup is ≥2 ranks narrower than user dim AND feedback is loose-direction
- **Cascade conclusions** don't contradict the user's scan. CRITICAL examples:
  - Recommends "narrower heel cups" when user has wide heel scan
  - Recommends "wider lasts" when user has narrow forefoot scan

### §3 What to Look For

- **Target dims** match §1 + filtered §2 — slider says wide forefoot → target says "wide forefoot width"
- **Use-case derivations** match the prefs:
  - boulder/outdoor/sandstone aggressive → soft-leaning balanced-stiffness, aggressive downturn, moderate-strong asymmetry
  - trad_multipitch/comfort → very stiff, flat profile, lace-up, ankle protection if outdoor
- **Closure prefs** sensible for discipline (lace for trad, velcro/slipper for boulder)

### Recommendations (12 picks)

Open `<descriptor>.checks.json` for the deterministic checks:

- **R3 tier composition** — exactly 3 baseline / 3 softer / 3 stiffer / 3 budget; brand cap 1/tier and 3/global; no_edge cap 1/tier; budget = top-30-baseline → cheapest-3-by-price-at-size
- **R4 baseline foot-shape gate** — all 3 baseline picks have shoe `width` matching `target_fw` AND shoe `heel_volume` matching `target_hv`
- **R2 recommended size_eu** — for each pick, expected = `round_half_eu(street_size − brand_typical_downsize ± aggressiveness_offset)`. Flag if mismatch >0.5 EU or not snapped to half-EU
- **R5 score breakdowns** — flag any baseline pick where any single axis ≤ −15 (signals a dimension is being ignored)
- **R7 price coverage** — flag if >50% of picks have no price (likely the recommended_size is off-grid)
- **R8 repetition** — flag any tradeoff sentence that appears verbatim >3 times across the 12 picks

Then walk through each pick by hand:
- **Description (P1)** is accurate (build, downturn, asymmetry words match DB)
- **Tradeoff (P3)** correctly describes the deltas vs target

---

## Output deliverables

Save under `scanner/explore_v2/test_cases_<YYYY-MM-DD>/`:

- `test_<N>_<descriptor>.html` — the rendered case (O1)
- `test_<N>_<descriptor>.review.md` — markdown report. One section per check above; each finding tagged CRITICAL/WARNING/NOTE (O2)
- `test_<N>_<descriptor>.scoring.json` — full score breakdowns (O3)
- `test_<N>_<descriptor>.checks.json` — machine-readable check results (helper output)
- `BACKLOG.md` in the date folder — append issues found this round; before adding, dedupe against earlier entries (O4)

Hand the file paths back to the user.

---

## Hard rules

- **Sandbox-only** — write only inside `scanner/explore_v2/test_cases_*/`. Never touch production files (`foot_measure.py`, `scan_worker.py`, `scan.html`, `scan_recommender.py`, etc.). Never modify the DB.
- **No fabrication when reviewing** — verify any shoe spec claim against the `shoes` table before calling it wrong.
- **No auto-commit** — never `git add`, `commit`, or `push`. Hand the artifacts back to the user; they decide what to commit.

---

## Helper script

`skill/scanner-v2-test-case/run_review.py` runs all the deterministic checks and writes the JSON. See that file for the implementation. Re-run it any time to refresh `checks.json` for an existing test case.

## Defaults

One test case per invocation. If the user asks for a batch ("create 5 test cases", "test 10 scans"), loop the workflow that many times — each loop picks a different scan and writes its own artifacts.
