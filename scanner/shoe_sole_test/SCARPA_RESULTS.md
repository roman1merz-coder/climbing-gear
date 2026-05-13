# Scarpa sole-measurement results (40 shoes)

Generated 2026-05-13 by `shoe_sole_measure.py` + `scarpa_sole_test.py`.

## Pipeline

1. **Segment** with LAB-distance from corner-sampled background, fallback
   ladder `[25, 17, 10]` that re-runs at progressively lower thresholds if
   the largest connected component covers less than 85 percent of total
   foreground (catches white-midfoot Veloce-L shoes whose silhouette would
   otherwise split across the midfoot).
2. **Rotate** the long axis to vertical via `cv2.minAreaRect` on the
   foreground point cloud. (PCA was tried first but disagreed with
   minAreaRect by 2-4 degrees on asymmetric lasts, which shifted
   asym_height by 30-70 px.)
3. **Ensure toe at top** by comparing max row width in upper vs lower
   half and flipping vertically if the lower half is wider.
4. **Canonicalise apex side** by horizontally flipping if the toe apex
   lands to the left of the forefoot midline, so all 40 shoes share one
   sign convention for asym_height_px and toe_drift_px.
5. **Measure** length, ff/heel width (heel restricted to bottom 30
   percent), toe_cx (averaged per-row midline over top 0.5 percent of
   length, min 2 rows), toe_form, asym_height.

40 of 40 shoes processed cleanly. All 40 share canonical orientation
(apex on the right, asym_height negative).

## Cross-check vs shoes table (Supabase `shoes`)

53 Scarpa rows in `shoes`:

- 39 of 40 measured shoes have a DB row.
- 1 measured shoe has no DB row: `scarpa-instinct-vsr-womens` (image
  asset exists, no SKU in DB).
- 14 DB Scarpa shoes have no sole shot we can measure:
  - 13 have no images at all in `dist/images/shoes/`: blackbird,
    drago-kid, force-v-kids, furia-s, instinct-sr, maestro-alpine,
    maestro-mens, maestro-mid-eco, maestro-womens, quantix-sf,
    vapor-v-womens, velocity-mens, velocity-womens.
  - 1 has photos A-E but no F (no top-down sole): `force-v-womens`.

## Quick rankings

Length-normalised; scale-invariant.

### Most Egyptian apex (low toe_form/L)

| Slug | toe_form/L |
| --- | ---: |
| boostic | 0.088 |
| chimera | 0.091 |
| boostic-r | 0.096 |
| furia-air | 0.096 |
| booster | 0.099 |
| instinct-vsr-lv | 0.100 |

### Most Roman apex (high toe_form/L)

| Slug | toe_form/L |
| --- | ---: |
| origin-vs | 0.145 |
| origin-vs-womens | 0.145 |
| origin-mens | 0.143 |
| origin-womens | 0.143 |
| veloce | 0.139 |
| veloce-l-womens | 0.132 |

### Widest forefoot/length

| Slug | ff/L |
| --- | ---: |
| furia-air | 0.405 |
| mago | 0.404 |
| boostic | 0.402 |
| instinct-vs-mens | 0.400 |
| instinct-womens | 0.391 |
| veloce-womens | 0.389 |

### Widest heel/length

| Slug | heel/L |
| --- | ---: |
| reflex-mens | 0.298 |
| drago-xt | 0.290 |
| instinct-womens | 0.288 |
| boostic | 0.287 |
| furia-air | 0.287 |
| drago | 0.285 |

### Most asymmetric last (\|asym_h\|/L)

| Slug | \|asym_h\|/L |
| --- | ---: |
| drago-xt | 0.060 |
| drago | 0.051 |
| chimera | 0.049 |
| instinct-lace | 0.048 |
| boostic-r | 0.045 |
| instinct-vsr-mens | 0.045 |

## Honest caveats

- The lost prior session's working code was rebuilt from `make_xlsx_all.py`
  + memory notes + the summary text. The rebuild matches the documented
  intent (LAB-distance segmentation, minAreaRect rotation, bottom-30
  percent heel band, per-row-midline toe_cx) but is not bit-identical -
  in particular, the L-R canonicalisation step in stage 4 was added
  because minAreaRect by itself left 2 shoes (origin-vs, origin-vs-womens)
  mirrored opposite the cohort; we have no way to verify how the original
  handled L-R direction.
- For the 14 shoes in the prior session's cohort, the absolute numbers
  will differ slightly from whatever was produced before. Qualitative
  rankings should be the same (Chimera Egyptian, Force-V Roman, etc.).
- `toe_form_px` uses the ball edge on whichever side the apex leans
  toward. After step 4 that is always the right edge in canonical
  orientation.
- `asym_height_px` is the most rotation-sensitive metric; small angle
  errors propagate into ~30-70 px offsets. Trust the rank order more
  than the magnitudes.
