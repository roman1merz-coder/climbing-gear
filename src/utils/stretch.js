import { computeStiffness } from "./comfort.js";

/**
 * Stretch expectation algorithm — derives expected stretch from shoe properties.
 *
 * Factors (in order of influence):
 *   1. Upper material (dominant): leather stretches a lot, synthetic almost none
 *   2. Rand construction: relaxed allows stretch, tensioned constrains it
 *   3. Closure type: lace-ups stretch more, velcro constrains
 *   4. Break-in period: longer break-in = more stretch potential
 *   5. Downturn: flat shoes stretch more, aggressive less
 *   6. Structural stiffness: flexible shoes deform more under load
 *
 * Returns { score, category, label, description } where score is 0–1 and
 * category is one of: none, minimal, quarter_size, half_size, full_size.
 *
 * Source: cross-tab analysis of 340 shoes (Feb 2026), validated at 89.5%
 * within-one-step agreement with expert-assigned values.
 */

const MATERIAL_SCORES  = { synthetic: 0.12, microfiber: 0.22, leather: 0.65 };
const RAND_MOD         = { relaxed: 0.12, tensioned: -0.05, split: -0.05 };
const CLOSURE_MOD      = { lace: 0.08, slipper: 0.03, velcro: -0.03 };
const BREAKIN_MOD      = { extended: 0.15, moderate: 0.05, minimal: 0 };
const DOWNTURN_MOD     = { flat: 0.05, slight: 0.025, moderate: 0, aggressive: -0.05 };

const LABELS = {
  none:         "None",
  minimal:      "Minimal",
  quarter_size: "\u00BC Size",
  half_size:    "\u00BD Size",
  full_size:    "Full Size",
};

const DESCS = {
  none:         "No stretch expected \u2014 stays true to initial fit",
  minimal:      "Won\u2019t stretch much \u2014 size for day-one comfort",
  quarter_size: "Stretches slightly \u2014 size down \u00BC for a snug fit",
  half_size:    "Noticeable stretch \u2014 size down \u00BD for performance fit",
  full_size:    "Significant stretch \u2014 size down a full size",
};

// Progress bar position (0–1)
const BAR_POS = { none: 0, minimal: 0.2, quarter_size: 0.4, half_size: 0.6, full_size: 0.8 };

/**
 * @param {Object} shoe - shoe object with upper_material, rand, closure, break_in_period, downturn, midsole
 * @returns {{ score: number, category: string, label: string, description: string, barPos: number }}
 */
export function calcStretch(shoe) {
  let score = MATERIAL_SCORES[shoe.upper_material] ?? 0.15;
  score += RAND_MOD[shoe.rand]             ?? 0;
  score += CLOSURE_MOD[shoe.closure]       ?? 0;
  score += BREAKIN_MOD[shoe.break_in_period] ?? 0;
  score += DOWNTURN_MOD[shoe.downturn]     ?? 0;
  // Stiffness modifier: flexible shoes stretch more, stiff shoes resist
  // Maps ~0.15 (soft) → +0.11 to ~0.85 (stiff) → -0.06
  score += 0.15 - computeStiffness(shoe) * 0.25;

  let category;
  if      (score < 0.08) category = "none";
  else if (score < 0.28) category = "minimal";
  else if (score < 0.48) category = "quarter_size";
  else if (score < 0.68) category = "half_size";
  else                   category = "full_size";

  return {
    score: Math.round(score * 1000) / 1000,
    category,
    label: LABELS[category],
    description: DESCS[category],
    barPos: BAR_POS[category],
  };
}
