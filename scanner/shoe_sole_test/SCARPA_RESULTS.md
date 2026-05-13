# Scarpa sole-measurement results (40 shoes)

Generated 2026-05-13 by `shoe_sole_measure.py` + `scarpa_sole_test.py`.
All metrics in pixels on the canonical-orientation silhouette (toe at top,
heel at bottom, long axis vertical). Length-normalised ratios in the last
columns are scale-invariant. See `sole_metrics_scarpa.csv` for the raw data.

## Pipeline summary

40 of 40 shoes processed with no failures. All 40 ended up in canonical
orientation (positive `toe_drift_px`, all `asym_height_px` negative) so the
measurement basis is consistent across the cohort.

## Cross-check vs shoes table (Supabase `shoes`)

53 Scarpa rows live in the `shoes` table.

- **39 of 40 measured shoes have a DB row** (full overlap on the production list).
- **1 measured shoe has no DB row:** `scarpa-instinct-vsr-womens` — image
  asset slot F exists but the SKU is not in the shoes table. Either add it
  or skip its measurement from production use.
- **14 DB Scarpa shoes have no sole shot we can measure:**
  - 13 have no image assets at all in `dist/images/shoes/`: blackbird,
    drago-kid, force-v-kids, furia-s, instinct-sr, maestro-alpine,
    maestro-mens, maestro-mid-eco, maestro-womens, quantix-sf,
    vapor-v-womens, velocity-mens, velocity-womens.
  - 1 has photos A-E but no F (no top-down sole): `force-v-womens`.

## Quick rankings

Length-normalised, so size/zoom doesn't matter.

### Highest forefoot/length (widest forefoot relative to length)

| Slug | ff/L |
| --- | ---: |
| boostic | 0.397 |
| furia-air | 0.396 |
| mago | 0.395 |
| instinct-vs-mens | 0.392 |
| instinct-womens | 0.386 |

### Highest heel/length (widest heel)

| Slug | heel/L |
| ---: | ---: |
| reflex-mens | 0.293 |
| drago-xt | 0.293 |
| veloce | 0.289 |
| mago | 0.288 |
| instinct-vsr-mens | 0.288 |

### Toe form (low = Egyptian apex, high = Roman apex)

Lowest (most Egyptian / pointed-big-toe shoes):

| Slug | toe_form/L |
| --- | ---: |
| chimera | 0.077 |
| boostic | 0.086 |
| instinct-vs-mens | 0.092 |
| furia-air | 0.097 |
| drago-xt | 0.098 |

Highest (most Roman / centered apex):

| Slug | toe_form/L |
| --- | ---: |
| force-v | 0.147 |
| origin-mens | 0.147 |
| origin-womens | 0.147 |
| instinct-s | 0.145 |
| veloce-womens | 0.143 |

### Asymmetry-height (absolute, big = strongly asymmetric last)

| Slug | \|asym_h/L\| |
| --- | ---: |
| drago-xt | 0.068 |
| chimera | 0.067 |
| instinct-vsr-mens | 0.055 |
| drago | 0.053 |
| boostic-r, instinct-lace, origin-vs, origin-vs-womens | 0.050 |

## Notes

- `toe_form_px` = distance from `toe_cx` (top-band midline average) to the
  ball edge on the side that `toe_cx` leans toward. Egyptian feet hug that
  outer edge (small toe_form); Roman feet sit central (large toe_form).
- `asym_height_px` = `ff_cx` - `axis_x_at_ff`, where the axis is the line
  from heel widest centroid to toe tip centroid. All 40 Scarpa came out
  negative, meaning every measured slug has its forefoot centroid on the
  same side relative to the heel-toe axis. This is expected for product
  photos shot from a consistent side and is camera-side dependent (not a
  real biological signal).
- Pure heel cup / sole stiffness / downturn are not measurable from this
  top-down view; those come from the side-view module (paused).
