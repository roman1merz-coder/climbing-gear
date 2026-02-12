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
  {
    title: "FEATURES",
    rows: [
      { label: "Dry Treatment", get: (r) => r.dry_treatment_name || fmt(r.dry_treatment) },
      { label: "Middle Mark", get: (r) => fmt(r.middle_mark) },
      { label: "Handling", get: (r) => fmt(r.handling_feel) },
      { label: "Aramid", get: (r) => r.aramid_protection ? "Yes" : "No" },
      { label: "Triple Rated", get: (r) => r.triple_rated ? "Yes" : "No" },
    ],
  },
  {
    title: "ECO & PRICE",
    rows: [
      { label: "Bluesign", get: (r) => r.bluesign ? "Yes" : "No" },
      { label: "Recycled", get: (r) => fmt(r.recycled_materials) },
      { label: "Price/m", get: (r) => r.price_per_meter_eur_min ? `€${r.price_per_meter_eur_min.toFixed(2)}` : "—", winner: "min", num: (r) => r.price_per_meter_eur_min },
      { label: "MSRP/m", get: (r) => r.price_uvp_per_meter_eur ? `€${r.price_uvp_per_meter_eur.toFixed(2)}` : "—" },
      { label: "Discount", get: (r) => fmtPct(r.price_per_meter_eur_min, r.price_uvp_per_meter_eur) },
    ],
  },
];

const BELAY_SECTIONS = [
  {
    title: "SPECS",
    rows: [
      { label: "Type", get: (b) => fmt(b.device_type) },
      { label: "Weight", get: (b) => b.weight_g ? `${b.weight_g}g` : "—", winner: "min", num: (b) => b.weight_g },
      { label: "Rope Range", get: (b) => `${b.rope_diameter_min_mm}–${b.rope_diameter_max_mm}mm` },
      { label: "Rope Slots", get: (b) => b.rope_slots || "—" },
      { label: "Rope Types", get: (b) => Array.isArray(b.compatible_rope_types) ? b.compatible_rope_types.map(fmt).join(", ") : "—" },
    ],
  },
  {
    title: "FEATURES",
    rows: [
      { label: "Guide Mode", get: (b) => b.guide_mode ? "Yes" : "No" },
      { label: "Anti-Panic", get: (b) => b.anti_panic ? "Yes" : "No" },
      { label: "Lead/TR Switch", get: (b) => b.lead_top_switch ? "Yes" : "No" },
      { label: "Lowering", get: (b) => fmt(b.lowering_type) },
      { label: "Single Rappel", get: (b) => b.rappel_single_strand ? "Yes" : "No" },
      { label: "Double Rappel", get: (b) => b.rappel_double_strand ? "Yes" : "No" },
    ],
  },
  {
    title: "PRICE",
    rows: [
      { label: "Current", get: (b) => fmtPrice(b.price_eur_min), winner: "min", num: (b) => b.price_eur_min },
      { label: "MSRP", get: (b) => fmtPrice(b.price_uvp_eur) },
      { label: "Discount", get: (b) => fmtPct(b.price_eur_min, b.price_uvp_eur) },
    ],
  },
];

const CRASHPAD_SECTIONS = [
  {
    title: "SPECS",
    rows: [
      { label: "Size", get: (p) => fmt(p.pad_size_category) },
      { label: "Dimensions", get: (p) => `${p.length_open_cm}×${p.width_open_cm} cm` },
      { label: "Thickness", get: (p) => p.thickness_cm ? `${p.thickness_cm} cm` : "—", winner: "max", num: (p) => p.thickness_cm },
      { label: "Weight", get: (p) => p.weight_kg ? `${p.weight_kg} kg` : "—", winner: "min", num: (p) => p.weight_kg },
      { label: "Fold Style", get: (p) => fmt(p.fold_style) },
      { label: "Area", get: (p) => `${((p.length_open_cm * p.width_open_cm) / 10000).toFixed(2)} m²`, winner: "max", num: (p) => (p.length_open_cm * p.width_open_cm) / 10000 },
    ],
  },
  {
    title: "PROTECTION",
    rows: [
      { label: "Impact", get: (p) => fmt(p.impact_protection) },
      { label: "Foam Firmness", get: (p) => fmt(p.foam_firmness) },
      { label: "Foam Layers", get: (p) => p.foam_layers || "—" },
      { label: "Hinge Prot.", get: (p) => p.has_hinge_protection ? "Yes" : "No" },
      { label: "HIC Certified", get: (p) => p.hic_certified ? "Yes" : "No" },
    ],
  },
  {
    title: "CARRY & FEATURES",
    rows: [
      { label: "Carry Comfort", get: (p) => fmt(p.carry_comfort) },
      { label: "Gear Storage", get: (p) => fmt(p.gear_storage) },
      { label: "Waist Belt", get: (p) => p.waist_belt ? "Yes" : "No" },
      { label: "Shoe Wipe", get: (p) => p.shoe_wipe ? "Yes" : "No" },
      { label: "Couch Mode", get: (p) => p.couch_mode ? "Yes" : "No" },
    ],
  },
  {
    title: "PRICE",
    rows: [
      { label: "Current", get: (p) => fmtPrice(p.current_price_eur), winner: "min", num: (p) => p.current_price_eur },
      { label: "MSRP", get: (p) => fmtPrice(p.price_uvp_eur) },
      { label: "Discount", get: (p) => fmtPct(p.current_price_eur, p.price_uvp_eur) },
    ],
  },
];

const SECTIONS_MAP = { ropes: ROPE_SECTIONS, belays: BELAY_SECTIONS, crashpads: CRASHPAD_SECTIONS };

const LABELS = {
  ropes: { plural: "ropes", singular: "rope", backPath: "/ropes", param: "ropes" },
  belays: { plural: "devices", singular: "device", backPath: "/belays", param: "belays" },
  crashpads: { plural: "pads", singular: "pad", backPath: "/crashpads", param: "crashpads" },
};

function findWinner(items, row) {
  if (!row.winner || !row.num) return -1;
  const nums = items.map((item) => {
    const n = row.num(item);
    return (typeof n === "number" && !isNaN(n)) ? n : null;
  });
  const valid = nums.filter((n) => n !== null);
  if (valid.length < 2) return -1;
  const target = row.winner === "min" ? Math.min(...valid) : Math.max(...valid);
  return nums.indexOf(target);
}

const S = {
  page: { minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text },
  header: { padding: "20px 32px", borderBottom: `1px solid ${T.border}`, background: T.bg, display: "flex", justifyContent: "space-between", alignItems: "center" },
  back: { display: "inline-flex", alignItems: "center", gap: "8px", color: T.text, textDecoration: "none", fontWeight: 600, fontSize: "14px" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { padding: "16px 14px", textAlign: "center", verticalAlign: "top", borderBottom: `1px solid ${T.border}`, minWidth: "140px" },
  sectionHeader: { padding: "10px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: T.muted, background: "rgba(37,42,53,0.3)", borderBottom: `1px solid ${T.border}` },
  td: { padding: "10px 14px", textAlign: "center", fontSize: "13px", borderBottom: "1px solid rgba(37,42,53,0.5)", color: T.text },
  label: { padding: "10px 14px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: T.muted, borderBottom: "1px solid rgba(37,42,53,0.5)", whiteSpace: "nowrap", width: "100px" },
  winner: { color: T.accent, fontWeight: 700 },
};

export default function CompareGeneric({ items = [], type = "ropes" }) {
  const [searchParams] = useSearchParams();
  const cfg = LABELS[type];
  const sections = SECTIONS_MAP[type] || [];

  const slugs = (searchParams.get(cfg.param) || "").split(",").filter(Boolean);
  const selectedItems = slugs.map((slug) => items.find((s) => s.slug === slug)).filter(Boolean);

  if (selectedItems.length < 2) {
    return (
      <div style={S.page}>
        <header style={S.header}>
          <Link to={cfg.backPath} style={S.back}>← Search</Link>
        </header>
        <div style={{ padding: "80px 32px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚖️</div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>Select at least 2 {cfg.plural} to compare</h2>
          <p style={{ fontSize: "14px", color: T.muted, marginBottom: "24px" }}>Use the compare checkbox on cards to select {cfg.plural}, then come back here.</p>
          <Link to={cfg.backPath} style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>← Browse {cfg.plural}</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <header style={S.header}>
        <Link to={cfg.backPath} style={S.back}>← Search</Link>
        <span style={{ fontSize: "13px", fontWeight: 600, color: T.muted }}>Compare ({selectedItems.length} {cfg.plural})</span>
      </header>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "14px", overflow: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: "100px" }} />
                {selectedItems.map((item) => (
                  <th key={item.slug} style={S.th}>
                    {item.image_url && (
                      <img src={item.image_url} alt={item.model}
                        style={{ width: "80px", height: "60px", objectFit: "contain", borderRadius: "6px", marginBottom: "6px" }} />
                    )}
                    <div style={{ fontSize: "11px", fontWeight: 600, color: T.muted, marginBottom: "2px" }}>{item.brand}</div>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: T.text, marginBottom: "6px" }}>{item.model}</div>
                  </th>
                ))}
                {selectedItems.length < 4 && (
                  <th style={{ ...S.th, minWidth: "120px" }}>
                    <Link to={cfg.backPath} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: T.muted, textDecoration: "none", padding: "20px 0" }}>
                      <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: `2px dashed ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>+</div>
                      <span style={{ fontSize: "11px", fontWeight: 600 }}>Add {cfg.singular}</span>
                    </Link>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <React.Fragment key={section.title}>
                  <tr>
                    <td colSpan={selectedItems.length + 1 + (selectedItems.length < 4 ? 1 : 0)} style={S.sectionHeader}>{section.title}</td>
                  </tr>
                  {section.rows.map((row) => {
                    const winnerIdx = findWinner(selectedItems, row);
                    return (
                      <tr key={row.label}>
                        <td style={S.label}>{row.label}</td>
                        {selectedItems.map((item, idx) => (
                          <td key={idx} style={{ ...S.td, ...(winnerIdx === idx ? S.winner : {}) }}>
                            {row.get(item)}
                            {winnerIdx === idx && <span style={{ marginLeft: "4px", fontSize: "10px" }}>★</span>}
                          </td>
                        ))}
                        {selectedItems.length < 4 && <td style={S.td} />}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <p style={{ fontSize: "12px", color: T.muted }}>🔗 This comparison is URL-shareable. Copy the address bar to share it with friends.</p>
        </div>
      </div>
    </div>
  );
}
