// ══════════════════════════════════════════════════════════
// GENERIC COMPARE PAGE — Side-by-side comparison for any gear type
// ══════════════════════════════════════════════════════════

import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { T } from "./tokens.js";
import { fmt } from "./utils/format.js";

const fmtPrice = (v) => v ? `€${Number(v) % 1 === 0 ? Number(v) : Number(v).toFixed(2)}` : "—";
const fmtPct = (price, uvp) => {
  if (!uvp || !price || price >= uvp) return "—";
  return `-${Math.round(((uvp - price) / uvp) * 100)}%`;
};

// ── Spec section configs per type ──

const ROPE_SECTIONS = [
  {
    title: "SPECS",
    rows: [
      { label: "Type", get: (r) => fmt(r.rope_type) },
      { label: "Diameter", get: (r) => r.diameter_mm ? `${r.diameter_mm}mm` : "—", winner: "min", num: (r) => r.diameter_mm },
      { label: "Weight", get: (r) => r.weight_per_meter_g ? `${r.weight_per_meter_g} g/m` : "—", winner: "min", num: (r) => r.weight_per_meter_g },
      { label: "UIAA Falls", get: (r) => r.uiaa_falls || "—", winner: "max", num: (r) => r.uiaa_falls },
      { label: "Impact Force", get: (r) => r.impact_force_kn ? `${r.impact_force_kn} kN` : "—", winner: "min", num: (r) => r.impact_force_kn },
      { label: "Break Strength", get: (r) => r.breaking_strength_kn ? `${r.breaking_strength_kn} kN` : "—", winner: "max", num: (r) => r.breaking_strength_kn },
    ],
  },
];

export default function CompareGeneric({ items = [], type = "ropes" }) {
  return <div>Compare Generic Component</div>;
}
