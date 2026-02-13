import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fmt, ensureArray } from "./utils/format.js";
import useIsMobile from "./useIsMobile.js";
import HeartButton from "./HeartButton.jsx";
import { sortItems, SortDropdownGeneric } from "./sorting.jsx";
import CompareCheckbox from "./CompareCheckbox.jsx";
import CrashpadScatterChart from "./CrashpadScatterChart.jsx";

// ═══ SCORING FUNCTIONS ═══

const ORD = {
  approach_suitability: ["roadside", "moderate", "long"],
  foam_firmness: ["soft", "moderate", "firm"],
  carry_comfort: ["basic", "good", "excellent"],
  gear_storage: ["none", "minimal", "moderate", "generous"],
};

const PROX = {
  impact_protection: ["low", "moderate", "high", "very_high"],
  durability: ["low", "moderate", "high"],
};

function sOrd(uv, sv, sc) {
  if (!sv) return 0;
  const a = sc.indexOf(uv);
  const b = sc.indexOf(sv);
  if (a < 0 || b < 0) return 0;
  const d = Math.abs(a - b);
  return d === 0 ? 1 : d === 1 ? 0.5 : 0;
}

function sProx(uvs, svs, sc) {
  if (!svs?.length || !uvs?.length) return 0;
  const v = Array.isArray(svs) ? svs : [svs];
  let t = 0;
  for (const u of uvs) {
    const ui = sc.indexOf(u);
    if (ui < 0) continue;
    let b = 99;
    for (const s of v) {
      const si = sc.indexOf(s);
      if (si >= 0) b = Math.min(b, Math.abs(ui - si));
    }
    if (b === 0) t += 1;
    else if (b === 1) t += 0.5;
    else if (b === 2) t += 0.25;
  }
  return t / uvs.length;
}

function sSet(uvs, svs) {
  if (!svs) return 0;
  const v = Array.isArray(svs) ? svs : [svs];
  if (!v.length) return 0;
  return uvs.filter((u) => v.includes(u)).length / uvs.length;
}

function sRng(mn, mx, v) {
  if (v == null) return 0;
  if (v >= mn && v <= mx) return 1;
  const sp = mx - mn || 1;
  const g = sp * 0.1;
  const d = v < mn ? mn - v : v - mx;
  return d <= g ? 0.5 : 0;
}

function score(pads, filters) {
  const active = Object.entries(filters).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v) && !v.length) return false;
    if (typeof v === "object" && !Array.isArray(v) && v.min == null && v.max == null) return false;
    return true;
  });
  if (!active.length)
    return pads.map((p) => ({ pad_data: p, match_score: -1 })).sort(() => Math.random() - 0.5);
  return pads
    .map((rawPad) => {
      // Add computed fields
      const pad = { ...rawPad, landing_area_m2: (rawPad.length_open_cm * rawPad.width_open_cm) / 10000 };
      let tot = 0;
      let cnt = 0;
      for (const [k, val] of active) {
        let s = 0;
        if (PROX[k] && Array.isArray(val)) {
          const sv = Array.isArray(pad[k]) ? pad[k] : [pad[k]];
          s = sProx(val, sv, PROX[k]);
        } else if (ORD[k] && typeof val === "string") {
          s = sOrd(val, pad[k], ORD[k]);
        } else if (Array.isArray(val) && val.length) {
          s = sSet(val, pad[k]);
        } else if (typeof val === "object" && !Array.isArray(val)) {
          s = sRng(val.min ?? 0, val.max ?? Infinity, pad[k]);
        } else if (typeof val === "boolean") {
          s = pad[k] === val ? 1 : 0;
        }
        tot += s;
        cnt++;
      }
      return { pad_data: rawPad, match_score: cnt ? Math.round((tot / cnt) * 100) : -1 };
    })
    .sort((a, b) =>
      b.match_score !== a.match_score ? b.match_score - a.match_score : Math.random() - 0.5
    );
}

// ═══ FILTER GROUP DEFINITIONS ═══

const FILTER_GROUPS = [
  {
    id: "climbing", label: "Your Climbing", icon: "🧗",
    filters: [
      { key: "best_use", label: "What You'll Climb", type: "multi", options: ["lowball", "midrange", "highball", "traverse"] },
      { key: "approach_suitability", label: "Approach", type: "single", options: ["roadside", "moderate", "long"] },
    ],
  },
  {
    id: "specs", label: "Pad Specs", icon: "📐",
    filters: [
      { key: "fold_style", label: "Fold Style", type: "multi", options: ["taco", "hinge", "hybrid", "tri_fold", "baffled", "inflatable"] },
      { key: "landing_area_m2", label: "Landing Area (m²)", type: "range", min: 0.1, max: 2.5, step: 0.05 },
      { key: "thickness_cm", label: "Thickness (cm)", type: "range", min: 1, max: 15, step: 0.5 },
      { key: "weight_kg", label: "Weight (kg)", type: "range", min: 0.3, max: 12, step: 0.1 },
      { key: "current_price_eur", label: "Price (€)", type: "range", min: 20, max: 550, step: 10 },
    ],
  },
  {
    id: "protection", label: "Protection & Foam", icon: "🛡️",
    filters: [
      { key: "impact_protection", label: "Impact Protection", type: "multi", options: ["low", "moderate", "high", "very_high"] },
      { key: "foam_firmness", label: "Foam Firmness", type: "single", options: ["soft", "moderate", "firm"] },
      { key: "durability", label: "Durability", type: "multi", options: ["low", "moderate", "high"] },
      { key: "has_hinge_protection", label: "Hinge Protection", type: "bool" },
    ],
  },
  {
    id: "carry", label: "Carry System", icon: "🎒",
    filters: [
      { key: "carry_comfort", label: "Carry Comfort", type: "single", options: ["basic", "good", "excellent"] },
      { key: "gear_storage", label: "Gear Storage", type: "single", options: ["none", "minimal", "moderate", "generous"] },
    ],
  },
  {
    id: "features", label: "Features", icon: "✨",
    filters: [
      { key: "waist_belt", label: "Waist Belt", type: "bool" },
      { key: "shoe_wipe", label: "Shoe Wipe", type: "bool" },
      { key: "couch_mode", label: "Couch Mode", type: "bool" },
    ],
  },
  {
    id: "eco", label: "Sustainability", icon: "🌱",
    filters: [
      { key: "hic_certified", label: "HIC Certified", type: "bool" },
      { key: "bluesign", label: "Bluesign", type: "bool" },
      { key: "recycled_materials", label: "Recycled Materials", type: "multi", options: ["none", "partial", "full"] },
    ],
  },
];

// ═══ UI PRIMITIVES ═══

function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: "20px",
        border: active ? "1.5px solid #E8734A" : "1.5px solid #3a3f47",
        background: active ? "rgba(232,115,74,0.15)" : "transparent",
        color: active ? "#E8734A" : "#9ca3af",
        fontSize: "12px", fontFamily: "'DM Sans',sans-serif",
        fontWeight: active ? 600 : 400, cursor: "pointer",
        transition: "all .2s", textTransform: "capitalize", whiteSpace: "nowrap",
      }}
    >
      {String(label).replace(/_/g, " ")}
    </button>
  );
}

function Single({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {options.map((o) => (
        <Chip key={o} label={o} active={value === o} onClick={() => onChange(value === o ? null : o)} />
      ))}
    </div>
  );
}

function Multi({ options, value = [], onChange }) {
  const t = (o) => {
    const n = value.includes(o) ? value.filter((v) => v !== o) : [...value, o];
    onChange(n.length ? n : []);
  };
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {options.map((o) => (
        <Chip key={o} label={o} active={value.includes(o)} onClick={() => t(o)} />
      ))}
    </div>
  );
}

function Range({ min, max, value, onChange, step = 1 }) {
  const lo = value?.min ?? min;
  const hi = value?.max ?? max;
  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: "#E8734A", fontFamily: "'DM Mono',monospace" }}>{lo}</span>
        <span style={{ fontSize: "12px", color: "#E8734A", fontFamily: "'DM Mono',monospace" }}>{hi}</span>
      </div>
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <input type="range" min={min} max={max} step={step} value={lo}
          onChange={(e) => onChange({ min: +e.target.value, max: hi })}
          style={{ flex: 1, accentColor: "#E8734A" }} />
        <input type="range" min={min} max={max} step={step} value={hi}
          onChange={(e) => onChange({ min: lo, max: +e.target.value })}
          style={{ flex: 1, accentColor: "#E8734A" }} />
      </div>
    </div>
  );
}

function Bool({ label, value, onChange }) {
  return (
    <button
      onClick={() => onChange(value === true ? null : true)}
      style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "8px 14px", borderRadius: "20px",
        border: value ? "1.5px solid #E8734A" : "1.5px solid #3a3f47",
        background: value ? "rgba(232,115,74,0.15)" : "transparent",
        color: value ? "#E8734A" : "#9ca3af",
        fontSize: "12px", fontFamily: "'DM Sans',sans-serif",
        cursor: "pointer", transition: "all .2s",
      }}
    >
      <span style={{ fontSize: "14px" }}>{value ? "✓" : "◯"}</span> {label}
    </button>
  );
}

function Badge({ score: s }) {
  if (s == null || s < 0) return null;
  const c = s >= 80 ? "#22c55e" : s >= 50 ? "#E8734A" : "#ef4444";
  const bg = s >= 80 ? "rgba(34,197,94,.12)" : s >= 50 ? "rgba(232,115,74,.12)" : "rgba(239,68,68,.12)";
  return (
    <div style={{
      position: "absolute", top: "10px", right: "36px", zIndex: 3,
      padding: "3px 10px", borderRadius: "12px",
      background: bg, border: `1.5px solid ${c}33`,
      backdropFilter: "blur(8px)",
    }}>
      <span style={{ fontSize: "12px", fontWeight: 700, color: c, fontFamily: "'DM Mono',monospace" }}>
        {s}%
      </span>
    </div>
  );
}

// ═══ SIZE CATEGORY BADGE ═══

const SIZE_COLORS = {
  sit_start: { bg: "rgba(234,179,8,.12)", color: "#eab308", border: "rgba(234,179,8,.25)" },
  slider: { bg: "rgba(168,85,247,.12)", color: "#a855f7", border: "rgba(168,85,247,.25)" },
  small: { bg: "rgba(34,211,238,.12)", color: "#22d3ee", border: "rgba(34,211,238,.25)" },
  medium: { bg: "rgba(96,165,250,.12)", color: "#60a5fa", border: "rgba(96,165,250,.25)" },
  large: { bg: "rgba(34,197,94,.12)", color: "#22c55e", border: "rgba(34,197,94,.25)" },
  oversized: { bg: "rgba(239,68,68,.12)", color: "#ef4444", border: "rgba(239,68,68,.25)" },
};

function SizeBadge({ size }) {
  const s = SIZE_COLORS[size] || SIZE_COLORS.medium;
  return (
    <span style={{
      position: "absolute", top: "10px", left: "10px", zIndex: 3,
      padding: "3px 8px", borderRadius: "6px",
      fontSize: "10px", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase",
      fontFamily: "'JetBrains Mono','DM Mono',monospace",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      backdropFilter: "blur(8px)",
    }}>
      {String(size).replace(/_/g, " ")}
    </span>
  );
}

// ═══ CRASHPAD SVG ═══

function CrashpadSVG({ pad }) {
  const w = 280, h = 100;
  const lenRatio = Math.min(pad.length_open_cm || 110, 180) / 180;
  const widRatio = Math.min(pad.width_open_cm || 95, 130) / 130;
  const padW = 60 + lenRatio * 160;
  const padH = 30 + widRatio * 40;
  const x = (w - padW) / 2;
  const y = (h - padH) / 2;
  const rx = pad.fold_style === "taco" ? 12 : pad.fold_style === "hinge" ? 4 : 8;

  const sizeColor = SIZE_COLORS[pad.pad_size_category]?.color || "#60a5fa";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id={`pad-bg-${pad.slug}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={sizeColor} stopOpacity="0.15" />
          <stop offset="100%" stopColor={sizeColor} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Pad body */}
      <rect x={x} y={y} width={padW} height={padH} rx={rx}
        fill={`url(#pad-bg-${pad.slug})`} stroke={sizeColor} strokeWidth="1.5" strokeOpacity="0.35" />
      {/* Fold line */}
      {pad.fold_style === "taco" && (
        <line x1={w / 2} y1={y + 4} x2={w / 2} y2={y + padH - 4}
          stroke={sizeColor} strokeWidth="1" strokeDasharray="4,3" strokeOpacity="0.3" />
      )}
      {pad.fold_style === "hinge" && (
        <line x1={w / 2} y1={y} x2={w / 2} y2={y + padH}
          stroke={sizeColor} strokeWidth="2" strokeOpacity="0.4" />
      )}
      {pad.fold_style === "tri_fold" && (
        <>
          <line x1={x + padW / 3} y1={y + 2} x2={x + padW / 3} y2={y + padH - 2}
            stroke={sizeColor} strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.3" />
          <line x1={x + (padW * 2) / 3} y1={y + 2} x2={x + (padW * 2) / 3} y2={y + padH - 2}
            stroke={sizeColor} strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.3" />
        </>
      )}
      {/* Foam layers indicator */}
      {pad.foam_layers && Array.from({ length: Math.min(pad.foam_layers, 4) }).map((_, i) => (
        <rect key={i}
          x={x + 6} y={y + padH - 8 - i * 4}
          width={12} height={3} rx={1}
          fill={sizeColor} opacity={0.2 + i * 0.1} />
      ))}
      {/* Thickness indicator */}
      <text x={x + padW - 8} y={y + padH / 2 + 4} textAnchor="end"
        fill={sizeColor} fontSize="10" fontFamily="'DM Mono',monospace" opacity="0.5">
        {pad.thickness_cm}cm
      </text>
    </svg>
  );
}

// ═══ SMALL TAG ═══

function SmallTag({ children, variant = "default" }) {
  const styles = {
    default: { bg: "#252830", color: "#9ca3af", border: "#2a2f38" },
    eco: { bg: "rgba(34,197,94,.08)", color: "#22c55e", border: "rgba(34,197,94,.2)" },
    feature: { bg: "rgba(96,165,250,.08)", color: "#60a5fa", border: "rgba(96,165,250,.2)" },
    protection: { bg: "rgba(232,115,74,.08)", color: "#E8734A", border: "rgba(232,115,74,.2)" },
    carry: { bg: "rgba(167,139,250,.08)", color: "#a78bfa", border: "rgba(167,139,250,.2)" },
  };
  const s = styles[variant] || styles.default;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: "10px", fontSize: "10px", fontWeight: 500,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

// ═══ COMPACT CRASHPAD CARD (mobile 2-per-row) ═══

function CompactCrashpadCard({ result, onClick }) {
  const d = result.pad_data;
  const s = result.match_score;
  const hasDiscount = d.price_uvp_eur && d.current_price_eur && d.current_price_eur < d.price_uvp_eur;
  const discountPct = hasDiscount ? Math.round(((d.price_uvp_eur - d.current_price_eur) / d.price_uvp_eur) * 100) : 0;
  const sizeColor = SIZE_COLORS[d.pad_size_category]?.color || "#60a5fa";

  return (
    <div onClick={onClick} style={{
      background: "#1c1f26", borderRadius: "12px", overflow: "hidden",
      border: "1px solid #2a2f38", cursor: "pointer", position: "relative",
    }}>
      {/* Visual header */}
      <div style={{
        height: "110px", position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
        background: d.image_url ? "#14171c" : "transparent",
      }}>
        {d.image_url ? (
          <img src={d.image_url} alt={d.model} loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "contain", padding: "4px" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, rgba(30,32,40,.8), rgba(20,23,28,.9))" }}>
            <CrashpadSVG pad={d} />
          </div>
        )}
        {/* Size badge */}
        <span style={{
          position: "absolute", top: "6px", left: "6px", zIndex: 3,
          padding: "2px 6px", borderRadius: "4px",
          fontSize: "8px", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase",
          fontFamily: "'JetBrains Mono','DM Mono',monospace",
          background: SIZE_COLORS[d.pad_size_category]?.bg || "rgba(96,165,250,.12)",
          color: sizeColor,
          border: `1px solid ${SIZE_COLORS[d.pad_size_category]?.border || "rgba(96,165,250,.25)"}`,
          backdropFilter: "blur(4px)",
        }}>
          {String(d.pad_size_category).replace(/_/g, " ")}
        </span>
        {/* Match badge */}
        {s >= 0 && (
          <div style={{
            position: "absolute", top: "6px", right: "30px", zIndex: 3,
            padding: "2px 6px", borderRadius: "8px",
            background: s >= 80 ? "rgba(34,197,94,.12)" : s >= 50 ? "rgba(232,115,74,.12)" : "rgba(239,68,68,.12)",
            border: `1px solid ${s >= 80 ? "rgba(34,197,94,.25)" : s >= 50 ? "rgba(232,115,74,.25)" : "rgba(239,68,68,.25)"}`,
            backdropFilter: "blur(4px)",
          }}>
            <span style={{ fontSize: "10px", fontWeight: 700, fontFamily: "'DM Mono',monospace",
              color: s >= 80 ? "#22c55e" : s >= 50 ? "#E8734A" : "#ef4444" }}>{s}%</span>
          </div>
        )}
        <HeartButton type="crashpad" slug={d.slug} style={{
          position: "absolute", bottom: "6px", right: "6px", zIndex: 4, fontSize: "14px",
        }} />
      </div>
      {/* Content */}
      <div style={{ padding: "10px" }}>
        <div style={{ fontSize: "9px", color: "#6b7280", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "2px" }}>
          {d.brand}
        </div>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#f0f0f0", lineHeight: 1.2, marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {d.model}
        </div>
        <div style={{ fontSize: "10px", color: "#9ca3af", fontFamily: "'DM Mono',monospace", marginBottom: "6px" }}>
          {((d.length_open_cm * d.width_open_cm) / 10000).toFixed(2)}m² · {d.thickness_cm}cm · {d.weight_kg}kg
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, fontFamily: "'DM Mono',monospace", color: "#E8734A" }}>
            €{d.current_price_eur}
          </span>
        </div>
        {hasDiscount && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "10px", color: "#6b7280", textDecoration: "line-through", fontFamily: "'DM Mono',monospace" }}>
              €{d.price_uvp_eur}
            </span>
            <span style={{ fontSize: "10px", fontWeight: 600, color: "#22c55e" }}>-{discountPct}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ CRASHPAD CARD ═══

function CrashpadCard({ result, onClick }) {
  const d = result.pad_data;
  const s = result.match_score;
  const area = ((d.length_open_cm * d.width_open_cm) / 10000).toFixed(2);

  return (
    <div
      onClick={onClick}
      style={{
        background: "#1c1f26", borderRadius: "16px", overflow: "hidden",
        border: "1px solid #2a2f38", transition: "all .3s",
        position: "relative", cursor: "pointer",
      }}
      onMouseOver={(e) => { e.currentTarget.style.border = "1px solid #E8734A"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseOut={(e) => { e.currentTarget.style.border = "1px solid #2a2f38"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Visual header with product image */}
      <div style={{
        height: "200px", position: "relative", overflow: "hidden",
        background: d.image_url ? "#14171c" : "transparent",
      }}>
        {d.image_url ? (
          <img src={d.image_url} alt={d.model} loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "contain", padding: "6px" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, rgba(30,32,40,.8), rgba(20,23,28,.9))" }}>
            <CrashpadSVG pad={d} />
          </div>
        )}
        <SizeBadge size={d.pad_size_category} />
        <Badge score={s} />
        <HeartButton type="crashpad" slug={d.slug} style={{
          position: "absolute", top: "10px", right: "10px", zIndex: 4,
        }} />
      </div>

      <div style={{ padding: "16px" }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
          <span style={{
            fontSize: "10px", color: "#6b7280", fontWeight: 600,
            letterSpacing: "1.5px", textTransform: "uppercase",
            fontFamily: "'DM Sans',sans-serif",
          }}>
            {d.brand}
          </span>
        </div>

        {/* Model */}
        <div style={{
          fontSize: "16px", fontWeight: 700, color: "#f0f0f0",
          fontFamily: "'DM Sans',sans-serif", marginBottom: "10px", lineHeight: 1.3,
        }}>
          {d.model}
        </div>

        {/* Specs row */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
          <span style={{ fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 500, fontSize: "12px", color: "#f0f0f0" }}>{d.length_open_cm}×{d.width_open_cm}</span> cm
          </span>
          <span style={{ fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 500, fontSize: "12px", color: "#f0f0f0" }}>{d.thickness_cm}</span> cm thick
          </span>
          <span style={{ fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 500, fontSize: "12px", color: "#f0f0f0" }}>{d.weight_kg}</span> kg
          </span>
          <span style={{ fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 500, fontSize: "12px", color: "#f0f0f0" }}>{area}</span> m²
          </span>
        </div>

        {/* Feature tags */}
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" }}>
          <SmallTag variant="default">{fmt(d.fold_style)}</SmallTag>
          <SmallTag variant="protection">{fmt(d.impact_protection)} impact</SmallTag>
          {d.carry_comfort === "excellent" && <SmallTag variant="carry">Excellent carry</SmallTag>}
          {d.waist_belt && <SmallTag variant="feature">Waist belt</SmallTag>}
          {d.couch_mode && <SmallTag variant="feature">Couch mode</SmallTag>}
          {d.shoe_wipe && <SmallTag variant="feature">Shoe wipe</SmallTag>}
          {d.has_hinge_protection && <SmallTag variant="protection">Hinge prot.</SmallTag>}
          {d.hic_certified && <SmallTag variant="eco">HIC</SmallTag>}
          {d.bluesign && <SmallTag variant="eco">Bluesign</SmallTag>}
          {d.recycled_materials !== "none" && <SmallTag variant="eco">{fmt(d.recycled_materials)} recycled</SmallTag>}
        </div>

        {/* Use cases */}
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "12px" }}>
          {ensureArray(d.best_use).map((u) => (
            <span key={u} style={{
              padding: "2px 8px", borderRadius: "8px",
              fontSize: "10px", fontWeight: 500,
              background: "rgba(232,115,74,.08)", color: "#E8734A",
              border: "1px solid rgba(232,115,74,.2)",
              textTransform: "capitalize",
            }}>
              {fmt(u)}
            </span>
          ))}
        </div>

        {/* Price row */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid #2a2f38" }}>
          <div>
            <span style={{ fontSize: "18px", fontWeight: 700, fontFamily: "'DM Mono',monospace", color: "#E8734A" }}>
              €{d.current_price_eur}
            </span>
          </div>
          <div>
            {d.price_uvp_eur > d.current_price_eur && (
              <>
                <span style={{ fontSize: "12px", color: "#6b7280", textDecoration: "line-through", fontFamily: "'DM Mono',monospace" }}>
                  €{d.price_uvp_eur}
                </span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#22c55e", marginLeft: "6px" }}>
                  -{Math.round(((d.price_uvp_eur - d.current_price_eur) / d.price_uvp_eur) * 100)}%
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ SIZE CATEGORY PILLS ═══

const SIZE_CATEGORIES = [
  { key: "sit_start", label: "Sit Start", icon: "◻" },
  { key: "slider", label: "Slider", icon: "▬" },
  { key: "small", label: "Small", icon: "◽" },
  { key: "medium", label: "Medium", icon: "◻" },
  { key: "large", label: "Large", icon: "⬜" },
  { key: "oversized", label: "Oversized", icon: "⬛" },
];

function SizePill({ cat, active, onClick }) {
  const sc = SIZE_COLORS[cat.key] || SIZE_COLORS.medium;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "6px",
        padding: "8px 14px", borderRadius: "8px",
        border: active ? `1.5px solid ${sc.color}` : "1.5px solid #3a3f47",
        background: active ? sc.bg : "transparent",
        color: active ? sc.color : "#9ca3af",
        fontSize: "12px", fontWeight: 500, cursor: "pointer",
        fontFamily: "'DM Sans',sans-serif", transition: "all .2s",
      }}
    >
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: "14px", width: "20px", textAlign: "center" }}>
        {cat.icon}
      </span>
      {cat.label}
    </button>
  );
}

// ═══ MAIN APP ═══

// ═══ SESSION PERSISTENCE (survives back-navigation) ═══
const STORAGE_KEY = "cg_crashpad_filters";
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

export default function CrashpadApp({ crashpads = [], src = "local" }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const viewFromUrl = searchParams.get("view");
  const [view, setView] = useState(viewFromUrl === "chart" ? "chart" : "cards");
  const _s = loadSession();
  const [filters, setFilters] = useState(_s.filters || {});
  const [activeSizes, setActiveSizes] = useState(_s.activeSizes || []);
  const [openGroup, setOpenGroup] = useState(_s.openGroup || "climbing");
  const [query, setQuery] = useState(_s.query || "");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [sortKey, setSortKey] = useState(_s.sortKey || "best_match");

  // Persist filter state to sessionStorage on every change
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ filters, activeSizes, openGroup, query, sortKey }));
  }, [filters, activeSizes, openGroup, query, sortKey]);

  const set = (k, v) => {
    setFilters((p) => {
      const n = { ...p };
      if (v == null || (Array.isArray(v) && !v.length)) delete n[k];
      else n[k] = v;
      return n;
    });
  };

  // Hard filter: size category
  const sizeFiltered = useMemo(() => {
    if (!activeSizes.length) return crashpads;
    return crashpads.filter((p) => activeSizes.includes(p.pad_size_category));
  }, [crashpads, activeSizes]);

  // Search
  const searchFiltered = useMemo(() => {
    if (!query.trim()) return sizeFiltered;
    const q = query.toLowerCase().trim();
    return sizeFiltered.filter((p) =>
      p.brand?.toLowerCase().includes(q) ||
      p.model?.toLowerCase().includes(q) ||
      p.slug?.includes(q)
    );
  }, [sizeFiltered, query]);

  // Score
  const results = useMemo(() => score(searchFiltered, filters), [searchFiltered, filters]);

  const displayResults = useMemo(() => {
    if (sortKey === "best_match") return results;
    if (sortKey === "landing_area") {
      return [...results].sort((a, b) => {
        const aA = (a.pad_data.length_open_cm || 0) * (a.pad_data.width_open_cm || 0);
        const bA = (b.pad_data.length_open_cm || 0) * (b.pad_data.width_open_cm || 0);
        return bA - aA;
      });
    }
    if (sortKey === "weight_asc") {
      return [...results].sort((a, b) => (a.pad_data.weight_kg || Infinity) - (b.pad_data.weight_kg || Infinity));
    }
    const items = results.map(r => r.pad_data);
    const sorted = sortItems(items, sortKey, {
      getPrice: i => i.current_price_eur,
      getUvp: i => i.price_uvp_eur,
    });
    return sorted.map(s => results.find(r => r.pad_data.slug === s.slug) || { pad_data: s, match_score: -1 });
  }, [results, sortKey]);

  const ac = Object.entries(filters).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v) && !v.length) return false;
    if (typeof v === "object" && !Array.isArray(v) && v.min == null && v.max == null) return false;
    return true;
  }).length;

  const toggleSize = (sz) => {
    setActiveSizes((prev) => prev.includes(sz) ? prev.filter((x) => x !== sz) : [...prev, sz]);
  };

  return (
    <div style={{ background: "#0e1015", minHeight: "100vh", color: "#f0f0f0" }}>
      {/* Sub-header */}
      <header style={{
        position: "sticky", top: isMobile ? "44px" : "50px", zIndex: 100,
        display: "flex", alignItems: "center", gap: isMobile ? "8px" : "16px",
        flexWrap: isMobile ? "wrap" : "nowrap",
        padding: isMobile ? "8px 12px" : "0 24px",
        minHeight: isMobile ? undefined : "50px",
        background: "rgba(14,16,21,.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1e2028",
      }}>
        {isMobile && (
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            style={{
              padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 500,
              color: ac > 0 ? "#E8734A" : "#6b7280",
              cursor: "pointer", border: `1px solid ${ac > 0 ? "#E8734A" : "#3a3f47"}`,
              background: ac > 0 ? "rgba(232,115,74,0.1)" : "transparent",
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            ☰ Filters{ac > 0 ? ` (${ac})` : ""}
          </button>
        )}

        <div style={{ flex: 1, maxWidth: isMobile ? undefined : "400px", position: "relative", width: isMobile ? "100%" : undefined, order: isMobile ? 10 : undefined }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#6b7280", fontSize: "14px", pointerEvents: "none" }}>⌕</span>
          <input
            type="text"
            placeholder="Search crashpads…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%", padding: "8px 16px 8px 36px",
              borderRadius: "8px", border: "1px solid #1e2028",
              background: "#151820", color: "#f0f0f0",
              fontFamily: "'DM Sans',sans-serif", fontSize: "13px", outline: "none",
            }}
          />
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", gap: "2px", background: "#1a1d24", borderRadius: "6px", padding: "2px" }}>
          {[
            { key: "cards", icon: "▦", label: "Cards" },
            { key: "chart", icon: "⊙", label: "Chart" },
          ].map(v => (
            <button key={v.key} onClick={() => { setView(v.key); setSearchParams(v.key === "chart" ? { view: "chart" } : {}); }} style={{
              padding: "4px 10px", borderRadius: "4px", border: "none", cursor: "pointer",
              background: view === v.key ? "rgba(232,115,74,0.15)" : "transparent",
              color: view === v.key ? "#E8734A" : "#6b7280",
              fontSize: "11px", fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
              display: "flex", alignItems: "center", gap: "4px",
            }}>
              <span style={{ fontSize: "13px" }}>{v.icon}</span>
              {!isMobile && v.label}
            </button>
          ))}
        </div>

        <span style={{ fontSize: "11px", color: "#6b7280", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
          {results.length} pad{results.length !== 1 ? "s" : ""}
        </span>

        {(ac > 0 || activeSizes.length > 0) && (
          <button
            onClick={() => { setFilters({}); setQuery(""); setActiveSizes([]); }}
            style={{
              padding: "6px 16px", borderRadius: "20px",
              border: "1px solid #3a3f47", background: "transparent",
              color: "#9ca3af", fontSize: "12px", cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
            }}
          >
            Clear all
          </button>
        )}
      </header>

      {/* Mobile filter overlay */}
      {isMobile && showMobileFilters && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
          background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)",
        }} onClick={() => setShowMobileFilters(false)}>
          <div
            style={{
              position: "absolute", top: 0, right: 0, bottom: 0,
              width: "85vw", maxWidth: "340px", background: "#14171c",
              overflowY: "auto", borderLeft: "1px solid #1e2028",
              animation: "slideInRight .25s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1e2028" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#f0f0f0" }}>Filters</span>
              <button
                onClick={() => setShowMobileFilters(false)}
                style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "22px", cursor: "pointer", padding: "4px" }}
              >×</button>
            </div>

            {/* Size category */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e2028" }}>
              <div style={{
                fontSize: "10px", fontWeight: 700, color: "#60a5fa",
                letterSpacing: "1.5px", textTransform: "uppercase",
                marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#60a5fa" }} />
                Pad Size
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {SIZE_CATEGORIES.map((cat) => (
                  <SizePill key={cat.key} cat={cat} active={activeSizes.includes(cat.key)} onClick={() => toggleSize(cat.key)} />
                ))}
              </div>
            </div>

            {/* Filter groups */}
            {FILTER_GROUPS.map((g) => (
              <div key={g.id} style={{ borderBottom: "1px solid #1e2028" }}>
                <button
                  onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}
                  style={{
                    width: "100%", padding: "14px 20px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "transparent", border: "none", color: "#f0f0f0",
                    cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "16px" }}>{g.icon}</span>
                    <span style={{ fontSize: "14px", fontWeight: 600 }}>{g.label}</span>
                    {g.filters.some(
                      (f) => filters[f.key] != null && (!Array.isArray(filters[f.key]) || filters[f.key].length > 0)
                    ) && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#E8734A" }} />}
                  </span>
                  <span style={{ color: "#6b7280", fontSize: "18px", transition: "transform .2s", transform: openGroup === g.id ? "rotate(180deg)" : "rotate(0)" }}>‹</span>
                </button>
                {openGroup === g.id && (
                  <div style={{ padding: "0 20px 16px" }}>
                    {g.filters.map((f) => (
                      <div key={f.key} style={{ marginBottom: "16px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af", letterSpacing: ".5px", marginBottom: "8px", textTransform: "uppercase" }}>{f.label}</div>
                        {f.type === "single" && <Single options={f.options} value={filters[f.key] ?? null} onChange={(v) => set(f.key, v)} />}
                        {f.type === "multi" && <Multi options={f.options} value={filters[f.key] ?? []} onChange={(v) => set(f.key, v)} />}
                        {f.type === "range" && <Range min={f.min} max={f.max} step={f.step || 1} value={filters[f.key]} onChange={(v) => set(f.key, v)} />}
                        {f.type === "bool" && <Bool label={f.label} value={filters[f.key] ?? null} onChange={(v) => set(f.key, v)} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Apply button */}
            <div style={{ padding: "16px 20px" }}>
              <button
                onClick={() => setShowMobileFilters(false)}
                style={{
                  width: "100%", padding: "12px", borderRadius: "10px",
                  background: "#E8734A", color: "#fff", border: "none",
                  fontSize: "14px", fontWeight: 600, cursor: "pointer",
                }}
              >
                Show {results.length} pad{results.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", minHeight: "calc(100vh - 65px)" }}>
        {/* Sidebar — desktop only */}
        {!isMobile && (
          <aside style={{
            width: "320px", minWidth: "320px",
            borderRight: "1px solid #1e2028",
            overflowY: "auto", height: "calc(100vh - 65px)",
            position: "sticky", top: "65px",
          }}>
            <div style={{ padding: "20px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", letterSpacing: "2px", textTransform: "uppercase" }}>
                Find Your Pad
              </span>
            </div>

            {/* Hard filter: Size Category */}
            <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #1e2028" }}>
              <div style={{
                fontSize: "10px", fontWeight: 700, color: "#60a5fa",
                letterSpacing: "1.5px", textTransform: "uppercase",
                marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#60a5fa" }} />
                Pad Size
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {SIZE_CATEGORIES.map((cat) => (
                  <SizePill key={cat.key} cat={cat} active={activeSizes.includes(cat.key)} onClick={() => toggleSize(cat.key)} />
                ))}
              </div>
            </div>

            {/* Soft filter groups */}
            {FILTER_GROUPS.map((g) => (
              <div key={g.id} style={{ borderBottom: "1px solid #1e2028" }}>
                <button
                  onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}
                  style={{
                    width: "100%", padding: "14px 20px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "transparent", border: "none", color: "#f0f0f0",
                    cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "16px" }}>{g.icon}</span>
                    <span style={{ fontSize: "14px", fontWeight: 600 }}>{g.label}</span>
                    {g.filters.some(
                      (f) => filters[f.key] != null && (!Array.isArray(filters[f.key]) || filters[f.key].length > 0)
                    ) && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#E8734A" }} />}
                  </span>
                  <span style={{ color: "#6b7280", fontSize: "18px", transition: "transform .2s", transform: openGroup === g.id ? "rotate(180deg)" : "rotate(0)" }}>
                    ‹
                  </span>
                </button>
                {openGroup === g.id && (
                  <div style={{ padding: "0 20px 16px" }}>
                    {g.filters.map((f) => (
                      <div key={f.key} style={{ marginBottom: "16px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af", letterSpacing: ".5px", marginBottom: "8px", textTransform: "uppercase" }}>
                          {f.label}
                        </div>
                        {f.type === "single" && <Single options={f.options} value={filters[f.key] ?? null} onChange={(v) => set(f.key, v)} />}
                        {f.type === "multi" && <Multi options={f.options} value={filters[f.key] ?? []} onChange={(v) => set(f.key, v)} />}
                        {f.type === "range" && <Range min={f.min} max={f.max} step={f.step || 1} value={filters[f.key]} onChange={(v) => set(f.key, v)} />}
                        {f.type === "bool" && <Bool label={f.label} value={filters[f.key] ?? null} onChange={(v) => set(f.key, v)} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Legend */}
            <div style={{ padding: "20px", marginTop: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", letterSpacing: "1px", marginBottom: "12px", textTransform: "uppercase" }}>
                Match Score
              </div>
              {[
                { c: "#22c55e", l: "80–100%", d: "Great match" },
                { c: "#E8734A", l: "50–79%", d: "Partial" },
                { c: "#ef4444", l: "0–49%", d: "Weak" },
              ].map((x) => (
                <div key={x.l} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: x.c }} />
                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>{x.l} — {x.d}</span>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Results */}
        <main style={{ flex: 1, padding: isMobile ? "16px 12px" : "24px 28px", overflowY: "auto" }}>
          {/* Active tags */}
          {(ac > 0 || activeSizes.length > 0 || query) && (
            <div style={{
              display: "flex", gap: "8px", flexWrap: isMobile ? "nowrap" : "wrap",
              overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: "touch",
              marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid #1e2028",
            }}>
              {activeSizes.map((sz) => {
                const sc = SIZE_COLORS[sz] || SIZE_COLORS.medium;
                return (
                  <span key={sz} style={{
                    display: "flex", alignItems: "center", gap: "6px", padding: "4px 12px",
                    borderRadius: "16px", fontSize: "11px", whiteSpace: "nowrap",
                    background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color,
                  }}>
                    <span style={{ color: "#6b7280" }}>size:</span> {fmt(sz)}
                    <button onClick={() => toggleSize(sz)} style={{ background: "none", border: "none", color: sc.color, cursor: "pointer", fontSize: "14px", padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                );
              })}
              {query && (
                <span style={{
                  display: "flex", alignItems: "center", gap: "6px", padding: "4px 12px",
                  borderRadius: "16px", fontSize: "11px", whiteSpace: "nowrap",
                  background: "rgba(96,165,250,.1)", border: "1px solid rgba(96,165,250,.3)", color: "#60a5fa",
                }}>
                  <span style={{ color: "#9ca3af" }}>search:</span> "{query}"
                  <button onClick={() => setQuery("")} style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontSize: "14px", padding: 0, lineHeight: 1 }}>×</button>
                </span>
              )}
              {Object.entries(filters).map(([k, v]) => {
                const d = Array.isArray(v)
                  ? v.map(fmt).join(", ")
                  : typeof v === "object"
                    ? `${v.min ?? ""}–${v.max ?? ""}`
                    : typeof v === "boolean"
                      ? "Yes"
                      : fmt(String(v));
                return (
                  <span key={k} style={{
                    display: "flex", alignItems: "center", gap: "6px", padding: "4px 12px",
                    borderRadius: "16px", fontSize: "11px", whiteSpace: "nowrap",
                    background: "rgba(232,115,74,.1)", border: "1px solid rgba(232,115,74,.3)", color: "#E8734A",
                  }}>
                    <span style={{ color: "#9ca3af" }}>{fmt(k)}:</span>
                    <span style={{ textTransform: "capitalize" }}>{String(d).replace(/_/g, " ")}</span>
                    <button onClick={() => set(k, null)} style={{ background: "none", border: "none", color: "#E8734A", cursor: "pointer", fontSize: "14px", padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                );
              })}
            </div>
          )}

          {view === "chart" ? (
            <CrashpadScatterChart isMobile={isMobile} />
          ) : (
            <>
              {/* Result count + sort */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? "10px" : "16px" }}>
                <span style={{ fontSize: isMobile ? "12px" : "13px", color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>
                  {displayResults.length} pad{displayResults.length !== 1 ? "s" : ""}{ac > 0 ? ` · ${ac} filter${ac > 1 ? "s" : ""}` : ""}
                </span>
                <SortDropdownGeneric value={sortKey} onChange={setSortKey} options={[
                  { key: "best_match", label: "Best Match" },
                  { key: "price_asc", label: "Price: Low → High" },
                  { key: "price_desc", label: "Price: High → Low" },
                  { key: "discount", label: "Biggest Discount" },
                  { key: "landing_area", label: "Landing Area" },
                  { key: "weight_asc", label: "Weight: Lightest" },
                  { key: "brand_az", label: "Brand A–Z" },
                ]} />
              </div>

              {/* Grid */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(auto-fill, minmax(160px, 1fr))" : "repeat(auto-fill, minmax(300px, 1fr))", gap: isMobile ? "10px" : "20px" }}>
                {displayResults.map((r, i) => (
                  <div key={r.pad_data?.slug || i} style={{ animation: `fadeUp .4s ease ${i * 40}ms both`, position: "relative" }}>
                    <CompareCheckbox type="crashpads" slug={r.pad_data.slug} compact={isMobile} />
                    {isMobile ? (
                      <CompactCrashpadCard
                        result={r}
                        onClick={() => { navigate(`/crashpad/${r.pad_data.slug}`); window.scrollTo(0, 0); }}
                      />
                    ) : (
                      <CrashpadCard
                        result={r}
                        onClick={() => { navigate(`/crashpad/${r.pad_data.slug}`); window.scrollTo(0, 0); }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {!displayResults.length && (
                <div style={{ textAlign: "center", padding: isMobile ? "40px 0" : "80px 0", color: "#6b7280" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>🛏️</div>
                  <div style={{ fontSize: "16px", marginBottom: "8px" }}>No crashpads match{query ? ` "${query}"` : ""}</div>
                  <div style={{ fontSize: "13px" }}>Try {query ? "a different search term or " : ""}adjusting your filters</div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
