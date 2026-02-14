// ═══ Comfort & Performance Scoring ═══
// These formulas match the analysis scatter plot (shoe-scatter.html).
// All 10 axes use compound scores with multiple inputs for continuous distribution.
// On the website, these raw scores are used directly (no percentile normalization).

/** Feel → softness score (0–1). Soft = high */
export const FEEL_SCORE_MAP = {
  soft: 0.9,
  "moderate-soft": 0.7,
  moderate: 0.5,
  "stiff-moderate": 0.3,
  stiff: 0.1,
};

/** Feel → stiffness score (0–1). Stiff = high */
const FEEL_STIFF_MAP = {
  stiff: 0.95,
  "stiff-moderate": 0.75,
  moderate: 0.50,
  "moderate-soft": 0.25,
  soft: 0.05,
};

const MID_MAP = { full: 0.9, partial: 0.5, none: 0.1 };

/** Rubber hardness → softness (0-1). Soft = high (0.85), hard = low (0.15) */
export function _hardnessVal(shoe) {
  const h = Array.isArray(shoe.rubber_hardness) ? shoe.rubber_hardness[0] : shoe.rubber_hardness;
  return ({ soft: 0.85, medium: 0.5, hard: 0.15 })[h] || 0.5;
}

/** Rubber thickness → 0-1 (thick = high) */
function rubberThick(shoe) {
  return shoe.rubber_thickness_mm ? Math.min(1, Math.max(0, (shoe.rubber_thickness_mm - 2) / 3)) : 0.5;
}

// ═══ PERFORMANCE SCORES ═══

/** Smearing: conformability (rubber softness + feel) is dominant.
 *  Even aggressive shoes smear well if rubber is ultra-soft.
 *  Thick rubber helps MORE when soft (more deformable surface area). */
export function computeSmearing(shoe) {
  const softR = _hardnessVal(shoe);
  const feelSoft = FEEL_SCORE_MAP[shoe.feel] || 0.5;
  const thickR = rubberThick(shoe);

  const flatDown = ({ flat: 0.9, moderate: 0.5, aggressive: 0.15 })[shoe.downturn] || 0.5;
  const conformability = softR * 0.50 + feelSoft * 0.50;
  const smearAsym = ({ none: 0.90, slight: 0.55, strong: 0.30 })[shoe.asymmetry] || 0.55;
  const smearShape = flatDown * 0.60 + smearAsym * 0.40;
  const effectiveThick = thickR * (0.40 + softR * 0.60);
  return Math.min(1, conformability * 0.72 + smearShape * 0.08 + effectiveThick * 0.20);
}

/** Edging: geometric mean of SHAPE × STIFFNESS — need both for top scores.
 *  Stiffness-dominant (65% exponent): a soft aggressive shoe CANNOT edge well.
 *  Downturn-dominant shape (80%): downturn matters more than asymmetry for edging. */
export function computeEdging(shoe) {
  const softR = _hardnessVal(shoe);
  const hardR = 1 - softR;
  const feelStiff = FEEL_STIFF_MAP[shoe.feel] || 0.5;
  const thickR = rubberThick(shoe);
  const mid = MID_MAP[shoe.midsole] || 0.5;
  const cl = shoe.closure || "";

  const compoundStiff = feelStiff * 0.45 + hardR * 0.30 + thickR * 0.15 + mid * 0.10;
  const edgeDown = ({ flat: 0.15, moderate: 0.70, aggressive: 0.85 })[shoe.downturn] || 0.5;
  const asymE = ({ none: 0.15, slight: 0.55, strong: 0.90 })[shoe.asymmetry] || 0.5;
  const edgeCl = ({ lace: 0.80, velcro: 0.55, slipper: 0.30 })[cl] || 0.5;
  const edgeShape = edgeDown * 0.80 + asymE * 0.20;
  const edgeCore = Math.pow(edgeShape, 0.35) * Math.pow(compoundStiff, 0.65);
  return Math.min(1, edgeCore * 0.78 + edgeCl * 0.07 + hardR * 0.10 + thickR * 0.05);
}

/** Pocket ability: aggressive downturn + asymmetry + toe patch + stiffness + closure + hardness */
export function computePockets(shoe) {
  const hardR = 1 - _hardnessVal(shoe);
  const feelStiff = FEEL_STIFF_MAP[shoe.feel] || 0.5;
  const dt = ({ flat: 0.1, moderate: 0.5, aggressive: 0.9 })[shoe.downturn] || 0.5;
  const asymE = ({ none: 0.15, slight: 0.55, strong: 0.90 })[shoe.asymmetry] || 0.5;
  const tp = ({ none: 0.1, medium: 0.5, full: 0.9 })[shoe.toe_patch] || 0.5;
  const cl = shoe.closure || "";
  const pockCl = ({ slipper: 0.7, velcro: 0.5, lace: 0.3 })[cl] || 0.5;
  return Math.min(1, dt * 0.23 + asymE * 0.23 + tp * 0.18 + feelStiff * 0.14 + pockCl * 0.12 + hardR * 0.10);
}

/** Hooking ability: heel rubber + toe rubber + downturn + sensitivity + closure */
export function computeHooks(shoe) {
  const feelStiff = FEEL_STIFF_MAP[shoe.feel] || 0.5;
  const dt = ({ flat: 0.1, moderate: 0.5, aggressive: 0.9 })[shoe.downturn] || 0.5;
  const tp = ({ none: 0.1, medium: 0.5, full: 0.9 })[shoe.toe_patch] || 0.5;
  const heelR = ({ none: 0.1, partial: 0.5, full: 0.9 })[shoe.heel_rubber_coverage] || 0.5;
  const cl = shoe.closure || "";
  const hookSens = 1 - feelStiff;
  const hookCl = ({ slipper: 0.8, velcro: 0.5, lace: 0.3 })[cl] || 0.5;
  return Math.min(1, heelR * 0.30 + tp * 0.25 + dt * 0.20 + hookSens * 0.15 + hookCl * 0.10);
}

/** Sensitivity: how much rock feedback reaches your foot.
 *  Thin rubber matters more when rubber is soft (transmits texture). */
export function computeSensitivity(shoe) {
  const softR = _hardnessVal(shoe);
  const feelSoft = FEEL_SCORE_MAP[shoe.feel] || 0.5;
  const thickR = rubberThick(shoe);
  const thinR = 1 - thickR;
  const mid = MID_MAP[shoe.midsole] || 0.5;
  const weightVal = shoe.weight_g ? Math.min(1, Math.max(0, 1 - (shoe.weight_g - 200) / 690)) : 0.5;

  const effectiveThin = thinR * (0.50 + softR * 0.50);
  return Math.min(1, effectiveThin * 0.28 + (1 - mid) * 0.25 + feelSoft * 0.25 + softR * 0.10 + weightVal * 0.12);
}

/** Support: structural rigidity — stiff feel + hard rubber + thick rubber + full midsole + lace */
export function computeSupport(shoe) {
  const softR = _hardnessVal(shoe);
  const hardR = 1 - softR;
  const feelSoft = FEEL_SCORE_MAP[shoe.feel] || 0.5;
  const thickR = rubberThick(shoe);
  const mid = MID_MAP[shoe.midsole] || 0.5;
  const cl = shoe.closure || "";
  const laceSup = ({ lace: 0.8, velcro: 0.5, slipper: 0.2 })[cl] || 0.5;
  return Math.min(1, (1 - feelSoft) * 0.25 + hardR * 0.20 + thickR * 0.20 + mid * 0.20 + laceSup * 0.15);
}

/** Overall comfort score 0–1.
 *  Moderate downturn (0.55) — gentle curve is still wearable.
 *  Velcro raised (0.70) — convenience matters for comfort. */
export function getComfortScore(shoe) {
  const softComf = ({ soft: 0.95, "moderate-soft": 0.75, moderate: 0.50, "stiff-moderate": 0.25, stiff: 0.05 })[shoe.feel] || 0.5;
  const gentleDown = ({ flat: 1.0, moderate: 0.55, aggressive: 0.0 })[shoe.downturn] || 0.55;
  const gentleAsym = ({ none: 1.0, slight: 0.55, strong: 0.0 })[shoe.asymmetry] || 0.55;
  const comfMat = ({ leather: 0.90, microfiber: 0.50, synthetic: 0.20 })[shoe.upper_material] || 0.50;
  const cl = shoe.closure || "";
  const comfCl = ({ lace: 0.85, velcro: 0.70, slipper: 0.30 })[cl] || 0.55;
  const mid = MID_MAP[shoe.midsole] || 0.5;
  const midComf = ({ full: 0.70, partial: 0.50, none: 0.30 })[shoe.midsole] || 0.50;
  const weightVal = shoe.weight_g ? Math.min(1, Math.max(0, 1 - (shoe.weight_g - 200) / 690)) : 0.5;
  const thickR = rubberThick(shoe);
  return Math.min(1, softComf * 0.20 + gentleDown * 0.20 + gentleAsym * 0.16 + comfMat * 0.10 + weightVal * 0.08 + comfCl * 0.10 + midComf * 0.08 + thickR * 0.08);
}

/** Comfort label from score */
export function getComfortLabel(shoe) {
  const s = getComfortScore(shoe);
  if (s >= 0.75) return "Excellent";
  if (s >= 0.55) return "Good";
  if (s >= 0.35) return "Moderate";
  return "Performance-focused";
}
