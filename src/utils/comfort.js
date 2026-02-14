// ═══ Comfort & Performance Scoring ═══
// These formulas match the analysis scatter plot (shoe-scatter.html).
// All 10 axes use compound scores with multiple inputs for continuous distribution.
// Percentile normalization maps raw scores to 0→1 rank across the full shoe set.

/** Feel → softness score (0–1). Soft = high */
export const FEEL_SCORE_MAP = {
  soft: 0.85,
  "moderate-soft": 0.70,
  moderate: 0.50,
  "stiff-moderate": 0.30,
  stiff: 0.15,
};

/** Feel → stiffness score (0–1). Stiff = high */
const FEEL_STIFF_MAP = {
  stiff: 0.85,
  "stiff-moderate": 0.70,
  moderate: 0.50,
  "moderate-soft": 0.30,
  soft: 0.15,
};

const MID_MAP = { full: 0.9, partial: 0.45, none: 0.1 };

// ═══ STRUCTURAL STIFFNESS ═══
// Derived entirely from physical construction — no subjective `feel` input.
// Midsole 40% + Rand 25% + Rubber thickness 15% + Closure 10% + Upper 10%
const RAND_MAP = { tensioned: 0.85, standard: 0.55, split: 0.35, relaxed: 0.15 };
const STIFF_CLOSURE_MAP = { lace: 0.80, velcro: 0.50, slipper: 0.25 };
const UPPER_MAP = { synthetic: 0.70, microfiber: 0.60, microsuede: 0.45, leather: 0.30 };

export function computeStiffness(shoe) {
  const mid = MID_MAP[shoe.midsole] || 0.5;
  const rand = RAND_MAP[shoe.rand] || 0.5;
  const thick = rubberThick(shoe);
  const cl = STIFF_CLOSURE_MAP[shoe.closure] || 0.5;
  const upper = UPPER_MAP[shoe.upper_material] || 0.5;
  return mid * 0.40 + rand * 0.25 + thick * 0.15 + cl * 0.10 + upper * 0.10;
}

/** Rubber hardness → softness (0-1). Soft = high (0.70), hard = low (0.30).
 *  Compressed range [0.30–0.70] prevents extreme gaps in edging/smearing. */
export function _hardnessVal(shoe) {
  const h = Array.isArray(shoe.rubber_hardness) ? shoe.rubber_hardness[0] : shoe.rubber_hardness;
  return ({ soft: 0.70, medium: 0.50, hard: 0.30 })[h] || 0.5;
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

/** Manual edging overrides for shoes where real-world performance diverges from formula.
 *  Value is added to the raw edging score before clamping to 0–1. */
const EDGING_OVERRIDES = {
  "la-sportiva-ondra-comp": 0.15,  // edges surprisingly well despite soft feel
};

/** Edging: geometric mean of SHAPE × STIFFNESS — need both for top scores.
 *  Uses structural stiffness (from computeStiffness) instead of subjective feel.
 *  Stiffness-dominant (60%): rigid platform is essential for micro-edging.
 *  Downturn-dominant shape (80%): downturn matters more than asymmetry for edging. */
export function computeEdging(shoe) {
  const hardR = 1 - _hardnessVal(shoe);
  const cl = shoe.closure || "";

  const stiffness = computeStiffness(shoe);
  const edgeDown = ({ flat: 0.15, moderate: 0.70, aggressive: 0.85 })[shoe.downturn] || 0.5;
  const asymE = ({ none: 0.15, slight: 0.55, strong: 0.90 })[shoe.asymmetry] || 0.5;
  const edgeCl = ({ lace: 0.80, velcro: 0.55, slipper: 0.30 })[cl] || 0.5;
  const edgeShape = edgeDown * 0.80 + asymE * 0.20;
  const edgeCore = Math.pow(edgeShape, 0.40) * Math.pow(stiffness, 0.60);
  const override = EDGING_OVERRIDES[shoe.slug] || 0;
  return Math.min(1, edgeCore * 0.85 + edgeCl * 0.10 + hardR * 0.05 + override);
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

// ═══ PERCENTILE NORMALIZATION ═══
// Converts raw scores to percentile ranks (0→1) using rank order with tie averaging.
// Kids shoes are excluded from the ranking pool.
// Returns: Map<slug, { edging, smearing, pockets, hooks, comfort, sensitivity, support }>

const RAW_FNS = [
  ["edging", computeEdging],
  ["smearing", computeSmearing],
  ["pockets", computePockets],
  ["hooks", computeHooks],
  ["comfort", getComfortScore],
  ["sensitivity", computeSensitivity],
  ["support", computeSupport],
];

let _cachedShoes = null;
let _cachedMap = null;

/** Build a slug→percentiles lookup from the full shoe array.
 *  Results are cached — only recomputes when the shoe array reference changes. */
export function buildPercentileMap(shoes) {
  if (shoes === _cachedShoes && _cachedMap) return _cachedMap;
  _cachedShoes = shoes;

  const adults = shoes.filter(s => !s.kids_friendly);
  const map = {}; // slug → { edging, smearing, ... }

  for (const [key, fn] of RAW_FNS) {
    // Compute raw scores for adults
    const pairs = adults.map(s => ({ slug: s.slug, v: fn(s) }));
    pairs.sort((a, b) => a.v - b.v);
    const n = pairs.length;
    // Rank with tie averaging
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n && pairs[j].v === pairs[i].v) j++;
      const pct = n > 1 ? ((i + j - 1) / 2) / (n - 1) : 0.5;
      for (let k = i; k < j; k++) {
        if (!map[pairs[k].slug]) map[pairs[k].slug] = {};
        map[pairs[k].slug][key] = pct;
      }
      i = j;
    }
  }

  _cachedMap = map;
  return map;
}

/** Get percentile scores for a single shoe (convenience wrapper).
 *  Returns { edging, smearing, pockets, hooks, comfort, sensitivity, support } */
export function getPercentileScores(shoe, allShoes) {
  const map = buildPercentileMap(allShoes);
  return map[shoe.slug] || {
    edging: computeEdging(shoe),
    smearing: computeSmearing(shoe),
    pockets: computePockets(shoe),
    hooks: computeHooks(shoe),
    comfort: getComfortScore(shoe),
    sensitivity: computeSensitivity(shoe),
    support: computeSupport(shoe),
  };
}
