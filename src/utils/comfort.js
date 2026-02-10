// ═══ Comfort & Performance Scoring ═══

/** Feel → sensitivity score (0–1). Soft = high sensitivity */
export const FEEL_SCORE_MAP = {
  stiff: 0.1,
  "stiff-moderate": 0.3,
  moderate: 0.5,
  "moderate-soft": 0.7,
  soft: 0.9,
};

/** Rubber hardness → 0-1 value. Soft = high (0.9), hard = low (0.1) */
export function _hardnessVal(shoe) {
  const h = Array.isArray(shoe.rubber_hardness) ? shoe.rubber_hardness[0] : shoe.rubber_hardness;
  return ({ soft: 0.9, medium: 0.5, hard: 0.1 })[h] || 0.5;
}

/** Smearing ability: soft rubber + soft feel + aggressive downturn */
export function computeSmearing(shoe) {
  const rubberW = _hardnessVal(shoe);                           // soft rubber = better smear
  const feelW = FEEL_SCORE_MAP[shoe.feel] || 0.5;               // soft feel = better smear
  const dtW = ({ aggressive: 0.7, moderate: 0.5, flat: 0.3 })[shoe.downturn] || 0.5;
  const gripBonus = (shoe.rubber_type || "").toLowerCase().includes("grip") ? 0.1 : 0;
  return Math.min(1, rubberW * 0.40 + feelW * 0.30 + dtW * 0.20 + gripBonus + 0.05);
}

/** Edging ability: hard rubber + stiff feel + moderate downturn + thick rubber */
export function computeEdging(shoe) {
  const hardness = 1 - _hardnessVal(shoe);                      // hard rubber = better edge
  const stiffness = 1 - (FEEL_SCORE_MAP[shoe.feel] || 0.5);     // stiff = better edge
  const dtW = ({ flat: 0.5, moderate: 0.8, aggressive: 0.5 })[shoe.downturn] || 0.5;
  const thickW = shoe.rubber_thickness_mm ? Math.min(1, (shoe.rubber_thickness_mm - 2) / 3) : 0.5;
  const edgeBonus = (shoe.rubber_type || "").toLowerCase().includes("edge") ? 0.1 : 0;
  return Math.min(1, hardness * 0.30 + stiffness * 0.25 + dtW * 0.20 + thickW * 0.15 + edgeBonus + 0.05);
}

/** Pocket ability: aggressive downturn + strong asymmetry + soft feel */
export function computePockets(shoe) {
  const dtW = ({ aggressive: 0.9, moderate: 0.5, flat: 0.15 })[shoe.downturn] || 0.5;
  const asymW = ({ strong: 0.9, slight: 0.5, none: 0.15 })[shoe.asymmetry] || 0.5;
  const feelW = FEEL_SCORE_MAP[shoe.feel] || 0.5;
  return Math.min(1, dtW * 0.40 + asymW * 0.35 + feelW * 0.20 + 0.05);
}

/** Hooking ability: full toe patch + full heel rubber + rubber coverage */
export function computeHooks(shoe) {
  const toeW = ({ full: 0.9, medium: 0.5, none: 0.1 })[shoe.toe_patch] || 0.5;
  const heelW = ({ full: 0.9, partial: 0.5, none: 0.1 })[shoe.heel_rubber_coverage] || 0.5;
  const rubberW = _hardnessVal(shoe) * 0.6;                     // soft = better friction for hooks
  return Math.min(1, toeW * 0.35 + heelW * 0.35 + rubberW * 0.25 + 0.05);
}

/** Overall comfort score 0–1 */
export function getComfortScore(shoe) {
  // Flat + stiff + full midsole + wide = more comfortable
  const dtW = ({ flat: 0.9, moderate: 0.5, aggressive: 0.15 })[shoe.downturn] || 0.5;
  const asymW = ({ none: 0.9, slight: 0.5, strong: 0.15 })[shoe.asymmetry] || 0.5;
  const volW = ({ high: 0.85, standard: 0.6, low: 0.3 })[shoe.volume] || 0.5;
  const midW = ({ full: 0.85, partial: 0.5, none: 0.2 })[shoe.midsole] || 0.5;
  const breakW = ({ minimal: 0.8, moderate: 0.5, extended: 0.2 })[shoe.break_in_period] || 0.5;
  return Math.min(1, dtW * 0.25 + asymW * 0.20 + volW * 0.20 + midW * 0.20 + breakW * 0.15);
}

/** Comfort label from score */
export function getComfortLabel(shoe) {
  const s = getComfortScore(shoe);
  if (s >= 0.75) return "Excellent";
  if (s >= 0.55) return "Good";
  if (s >= 0.35) return "Moderate";
  return "Performance-focused";
}
