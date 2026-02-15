import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fmt, ensureArray } from "./utils/format.js";
import useIsMobile from "./useIsMobile.js";
import HeartButton from "./HeartButton.jsx";
import { sortItems, SortDropdownGeneric, SORT_OPTIONS_GENERIC } from "./sorting.jsx";
import CompareCheckbox from "./CompareCheckbox.jsx";
import { useWL } from "./WishlistContext.jsx";
import { useCompare } from "./CompareContext.jsx";

// ─── SVG icons for action bar ───
const HeartSVG = ({ filled, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);
const CompareSVG = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const CheckSVG = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
import RopeScatterChart from "./RopeScatterChart.jsx";

/** Image with graceful fallback on 404 */
function Img({ src, alt, style, fallback }) {
  const [err, setErr] = useState(false);
  if (!src || err) return fallback || null;
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} style={style} />;
}

// ═══ SCORING FUNCTIONS ═══

const ORD = {
  handling_feel: ["stiff", "moderate", "supple", "very_supple"],
};

const PROX = {
  skill_level: ["beginner", "intermediate", "advanced", "expert"],
  durability_rating: ["low", "moderate", "high", "very_high"],
  dry_treatment: ["none", "sheath_only", "core_and_sheath", "full_impregnation"],
  recycled_materials: ["none", "partial", "full"],
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

function sContains(userVal, arr) {
  if (!arr || !arr.length) return 0;
  return arr.includes(userVal) ? 1 : 0;
}

function score(ropes, filters) {
  const active = Object.entries(filters).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v) && !v.length) return false;
    if (typeof v === "object" && !Array.isArray(v) && v.min == null && v.max == null) return false;
    return true;
  });
  if (!active.length)
    return ropes.map((r) => ({ rope_data: r, match_score: -1 })).sort(() => Math.random() - 0.5);
  return ropes
    .map((rope) => {
      let tot = 0;
      let cnt = 0;
      for (const [k, val] of active) {
        let s = 0;
        if (k === "available_lengths_m" && typeof val === "number") {
          s = sContains(val, rope[k]);
        } else if (PROX[k] && Array.isArray(val)) {
          const sv = Array.isArray(rope[k]) ? rope[k] : [rope[k]];
          s = sProx(val, sv, PROX[k]);
        } else if (ORD[k] && typeof val === "string") {
          s = sOrd(val, rope[k], ORD[k]);
        } else if (Array.isArray(val) && val.length) {
          s = sSet(val, rope[k]);
        } else if (typeof val === "object" && !Array.isArray(val)) {
          s = sRng(val.min ?? 0, val.max ?? Infinity, rope[k]);
        } else if (typeof val === "boolean") {
          s = rope[k] === val ? 1 : 0;
        }
        tot += s;
        cnt++;
      }
      return { rope_data: rope, match_score: cnt ? Math.round((tot / cnt) * 100) : -1 };
    })
    .sort((a, b) =>
      b.match_score !== a.match_score ? b.match_score - a.match_score : Math.random() - 0.5
    );
}

// ═══ FILTER GROUP DEFINITIONS ═══

const USE_CASES_DYNAMIC = [
  "gym", "sport_single_pitch", "sport_multi_pitch", "trad",
  "alpine", "big_wall", "top_rope", "ice_mixed", "redpoint", "projecting",
];
const USE_CASES_STATIC = [
  "rappelling", "hauling", "fixed_line", "top_rope_static",
  "canyoning", "rope_access",
];

function getGroups(activeTypes) {
  const staticOnly = activeTypes.length === 1 && activeTypes[0] === "static";
  const dynamicOnly = activeTypes.length > 0 && !activeTypes.includes("static");
  const mixed = activeTypes.length === 0 || (activeTypes.includes("static") && activeTypes.length > 1);

  let useCases = [...USE_CASES_DYNAMIC, ...USE_CASES_STATIC];
  if (staticOnly) useCases = USE_CASES_STATIC;
  else if (dynamicOnly) useCases = USE_CASES_DYNAMIC;

  const groups = [
    {
      id: "climbing", label: "Your Climbing", icon: "🧗",
      filters: [
        { key: "best_use_cases", label: "Discipline", type: "multi", options: useCases },
        { key: "skill_level", label: "Skill Level", type: "multi", options: ["beginner", "intermediate", "advanced", "expert"] },
      ],
    },
    {
      id: "specs", label: "Rope Specs", icon: "📏",
      filters: [
        { key: "diameter_mm", label: "Diameter (mm)", type: "range", min: 7.0, max: 13.0, step: 0.1 },
        { key: "weight_per_meter_g", label: "Weight (g/m)", type: "range", min: 34, max: 100, step: 1 },
        ...(!staticOnly ? [
          { key: "uiaa_falls", label: "UIAA Falls", type: "range", min: 5, max: 20, step: 1 },
          { key: "impact_force_kn", label: "Impact Force (kN)", type: "range", min: 5.0, max: 10.0, step: 0.1 },
        ] : []),
        ...(staticOnly || mixed ? [
          { key: "breaking_strength_kn", label: "Break Strength (kN)", type: "range", min: 15, max: 40, step: 1 },
        ] : []),
      ],
    },
    {
      id: "features", label: "Features & Treatment", icon: "🛡️",
      filters: [
        { key: "dry_treatment", label: "Dry Treatment", type: "multi", options: ["none", "sheath_only", "core_and_sheath", "full_impregnation"] },
        { key: "uiaa_water_repellent", label: "UIAA Water Repellent", type: "bool" },
        { key: "aramid_protection", label: "Aramid Protection", type: "bool" },
        ...(!staticOnly ? [{ key: "triple_rated", label: "Triple Rated", type: "bool" }] : []),
        { key: "middle_mark", label: "Middle Mark", type: "multi", options: ["none", "ink_mark", "bi_pattern"] },
      ],
    },
    {
      id: "handling", label: "Handling & Compat", icon: "🎯",
      filters: [
        { key: "handling_feel", label: "Handling", type: "single", options: ["stiff", "moderate", "supple", "very_supple"] },
        { key: "durability_rating", label: "Durability", type: "multi", options: ["low", "moderate", "high", "very_high"] },
        { key: "compatible_device_types", label: "Device Type", type: "multi", options: ["tube", "assisted_braking", "auto_tube"] },
        { key: "available_lengths_m", label: "Length", type: "length", options: [40, 50, 60, 70, 80, 100, 200] },
      ],
    },
    {
      id: "eco", label: "Sustainability & Price", icon: "🌱",
      filters: [
        { key: "bluesign", label: "Bluesign", type: "bool" },
        { key: "recycled_materials", label: "Recycled Materials", type: "multi", options: ["none", "partial", "full"] },
        { key: "pfc_free", label: "PFC-Free", type: "bool" },
        { key: "price_per_meter_eur_min", label: "Price (€/m)", type: "range", min: 1.0, max: 5.0, step: 0.1 },
      ],
    },
  ];
  return groups;
}

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

function TypePill({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "6px",
        padding: "8px 14px", borderRadius: "8px",
        border: active ? "1.5px solid #22d3ee" : "1.5px solid #3a3f47",
        background: active ? "rgba(34,211,238,0.08)" : "transparent",
        color: active ? "#22d3ee" : "#9ca3af",
        fontSize: "12px", fontWeight: 500, cursor: "pointer",
        fontFamily: "'DM Sans',sans-serif", transition: "all .2s",
      }}
    >
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: "14px", width: "20px", textAlign: "center" }}>
        {icon}
      </span>
      {label}
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

function LengthPicker({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {options.map((o) => (
        <Chip key={o} label={`${o}m`} active={value === o} onClick={() => onChange(value === o ? null : o)} />
      ))}
    </div>
  );
}

function Range({ min, max, value, onChange, unit = "", suffix = false, step = 1 }) {
  const lo = value?.min ?? min;
  const hi = value?.max ?? max;
  const f = (v) => (suffix ? `${v}${unit}` : `${unit}${v}`);
  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: "#E8734A", fontFamily: "'DM Mono',monospace" }}>{f(lo)}</span>
        <span style={{ fontSize: "12px", color: "#E8734A", fontFamily: "'DM Mono',monospace" }}>{f(hi)}</span>
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

// ═══ ROPE SVG GENERATOR ═══

function RopeSVG({ color1, color2, diameter, ropeType }) {
  const w = 280, h = 64;
  const thickness = Math.max(3, diameter * 0.6);

  if (ropeType === "half" || ropeType === "twin") {
    const gap = ropeType === "twin" ? 4 : 8;
    const amp = 6, freq = 0.04;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%" }}>
        {[0, 1].map((si) => {
          const yOff = h / 2 + (si === 0 ? -gap : gap);
          const c = si === 0 ? color1 : color2;
          const phase = si * Math.PI;
          const points = [];
          for (let x = 0; x <= w; x += 2) {
            points.push(`${x},${yOff + Math.sin(x * freq + phase) * amp}`);
          }
          return <polyline key={si} points={points.join(" ")} fill="none" stroke={c} strokeWidth={thickness * 0.8} strokeLinecap="round" opacity={0.8} />;
        })}
      </svg>
    );
  }

  // Single or static
  const amp = ropeType === "static" ? 3 : 8;
  const freq = ropeType === "static" ? 0.02 : 0.035;
  const points1 = [], points2 = [];
  for (let x = 0; x <= w; x += 2) {
    points1.push(`${x},${h / 2 + Math.sin(x * freq) * amp}`);
    points2.push(`${x},${h / 2 + Math.sin(x * freq + 0.5) * (amp - 1.5)}`);
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%" }}>
      <polyline points={points1.join(" ")} fill="none" stroke={color1} strokeWidth={thickness} strokeLinecap="round" opacity={0.85} />
      <polyline points={points2.join(" ")} fill="none" stroke={color2} strokeWidth={thickness * 0.4} strokeLinecap="round" opacity={0.5} />
    </svg>
  );
}

// ═══ ROPE TYPE BADGE ═══

const TYPE_STYLES = {
  single: { bg: "rgba(96,165,250,.12)", color: "#60a5fa", border: "rgba(96,165,250,.25)" },
  half: { bg: "rgba(167,139,250,.12)", color: "#a78bfa", border: "rgba(167,139,250,.25)" },
  twin: { bg: "rgba(34,211,238,.12)", color: "#22d3ee", border: "rgba(34,211,238,.25)" },
  static: { bg: "rgba(234,179,8,.12)", color: "#eab308", border: "rgba(234,179,8,.25)" },
};

function TypeBadge({ type, tripleRated }) {
  const s = TYPE_STYLES[type] || TYPE_STYLES.single;
  return (
    <span style={{
      position: "absolute", top: "10px", left: "10px", zIndex: 3,
      padding: "3px 8px", borderRadius: "6px",
      fontSize: "10px", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase",
      fontFamily: "'JetBrains Mono','DM Mono',monospace",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      backdropFilter: "blur(8px)",
    }}>
      {type}{tripleRated ? " ③" : ""}
    </span>
  );
}

// ═══ TAG HELPER ═══

function SmallTag({ children, variant = "default" }) {
  const styles = {
    default: { bg: "#252830", color: "#9ca3af", border: "#2a2f38" },
    eco: { bg: "rgba(34,197,94,.08)", color: "#22c55e", border: "rgba(34,197,94,.2)" },
    dry: { bg: "rgba(96,165,250,.08)", color: "#60a5fa", border: "rgba(96,165,250,.2)" },
    tech: { bg: "rgba(167,139,250,.08)", color: "#a78bfa", border: "rgba(167,139,250,.2)" },
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

// ═══ COMPACT ROPE CARD (mobile 2-per-row) ═══

function CompactRopeCard({ result, onClick, priceData = {} }) {
  const d = result.rope_data;
  const s = result.match_score;
  const hasDiscount = d.price_uvp_per_meter_eur && d.price_per_meter_eur_min && d.price_per_meter_eur_min < d.price_uvp_per_meter_eur;
  const discountPct = hasDiscount ? Math.round(((d.price_uvp_per_meter_eur - d.price_per_meter_eur_min) / d.price_uvp_per_meter_eur) * 100) : 0;
  const rPrices = priceData[d.slug] || [];
  const bestUrl = (rPrices.find(p => p.inStock && p.price > 0) || rPrices[0])?.url;
  const buyUrl = bestUrl && bestUrl !== "#" ? bestUrl : null;

  const { toggle: toggleWL, has: hasWL } = useWL();
  const saved = hasWL("rope", d.slug);
  const { toggleCompare, isInCompare, isFull } = useCompare();
  const compared = isInCompare("ropes", d.slug);
  const compareFull = !compared && isFull("ropes");

  return (
    <div style={{
      background: "#1c1f26", borderRadius: "12px", overflow: "hidden",
      border: "1px solid #2a2f38", cursor: "pointer", position: "relative",
    }}>
      {/* Visual header: product image or SVG fallback */}
      <div onClick={onClick} style={{
        height: "90px", position: "relative", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#fff",
      }}>
        {/* Type badge top-left */}
        <span style={{
          position: "absolute", top: "8px", left: "8px", zIndex: 3,
          padding: "2px 6px", borderRadius: "6px",
          fontSize: "8px", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase",
          fontFamily: "'JetBrains Mono','DM Mono',monospace",
          background: TYPE_STYLES[d.rope_type]?.bg || "rgba(96,165,250,.12)",
          color: TYPE_STYLES[d.rope_type]?.color || "#60a5fa",
          border: `1px solid ${TYPE_STYLES[d.rope_type]?.border || "rgba(96,165,250,.25)"}`,
          backdropFilter: "blur(4px)",
        }}>
          {d.rope_type}
        </span>
        {/* Match overlay top-right */}
        {s >= 0 && (
          <span style={{
            position: "absolute", top: "8px", right: "8px", zIndex: 3,
            padding: "3px 8px", borderRadius: "8px",
            background: s >= 80 ? "rgba(34,197,94,.85)" : s >= 50 ? "rgba(232,115,74,.85)" : "rgba(239,68,68,.85)",
            color: "#fff", fontFamily: "'DM Mono',monospace",
            fontSize: "11px", fontWeight: 700, lineHeight: 1.2,
          }}>{s}%</span>
        )}
        <Img
          src={d.image_url}
          alt={`${d.brand} ${d.model}`}
          style={{ maxWidth: "85%", maxHeight: "85%", objectFit: "contain" }}
          fallback={<RopeSVG color1={d.rope_color_1 || "#888"} color2={d.rope_color_2 || "#666"} diameter={d.diameter_mm} ropeType={d.rope_type} />}
        />
      </div>
      {/* Content — v3c layout */}
      <div onClick={onClick} style={{ padding: "10px" }}>
        {/* Row 1: brand + price/m */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "3px", height: "10px", borderRadius: "2px", background: TYPE_STYLES[d.rope_type]?.color || "#60a5fa" }} />
            <span style={{ fontSize: "9px", color: "#6b7280", fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" }}>{d.brand}</span>
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#E8734A", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
            €{d.price_per_meter_eur_min?.toFixed(2)}<span style={{ fontSize: "9px", color: "#6b7280", fontWeight: 400 }}>/m</span>
          </span>
        </div>
        {/* Row 2: model + RRP/discount */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "6px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#f0f0f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, lineHeight: 1.2 }}>
            {d.model}
          </span>
          {hasDiscount && (
            <div style={{ display: "flex", alignItems: "baseline", gap: "3px", flexShrink: 0 }}>
              <span style={{ fontSize: "10px", color: "#6b7280", textDecoration: "line-through", fontFamily: "'DM Mono',monospace" }}>€{d.price_uvp_per_meter_eur?.toFixed(2)}</span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#22c55e", fontFamily: "'DM Mono',monospace" }}>-{discountPct}%</span>
            </div>
          )}
        </div>
        {/* Row 3: specs */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center", marginTop: "4px", fontSize: "10px", color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>
          <span>{d.diameter_mm}mm</span>
          <span style={{ color: "#3a3f47" }}>·</span>
          <span>{d.weight_per_meter_g}g/m</span>
        </div>
      </div>
      {/* ═══ ACTION BAR — Save & Compare ═══ */}
      <div style={{ display: "flex", borderTop: "1px solid #252a35" }}>
        <button
          onClick={(e) => { e.stopPropagation(); toggleWL("rope", d.slug); }}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: "6px", padding: "10px 6px",
            background: "none", border: "none", borderRight: "1px solid #252a35",
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            fontSize: "11px", fontWeight: 600,
            color: saved ? "#ef4444" : "#717889",
            transition: "all .15s",
          }}
        >
          <HeartSVG filled={saved} size={15} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); if (!compareFull) toggleCompare("ropes", d.slug); }}
          title={compareFull ? "Max 10 in comparison" : compared ? "Remove from comparison" : "Add to comparison"}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: "6px", padding: "10px 6px",
            background: compared ? "rgba(232,115,74,0.06)" : "none",
            border: "none", cursor: compareFull ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans',sans-serif",
            fontSize: "11px", fontWeight: 600,
            color: compared ? "#E8734A" : "#717889",
            opacity: compareFull ? 0.4 : 1,
            transition: "all .15s",
          }}
        >
          <CompareSVG size={15} />
          {compared && <CheckSVG size={11} />}
        </button>
      </div>
    </div>
  );
}

// ═══ ROPE CARD ═══

function RopeCard({ result, onClick, selectedLength, onLengthSelect, priceData = {} }) {
  const d = result.rope_data;
  const s = result.match_score;
  const isDynamic = d.rope_type !== "static";
  const selLen = selectedLength;
  const rPrices = priceData[d.slug] || [];
  const bestUrl = (rPrices.find(p => p.inStock && p.price > 0) || rPrices[0])?.url;
  const buyUrl = bestUrl && bestUrl !== "#" ? bestUrl : null;

  const { toggle: toggleWL, has: hasWL } = useWL();
  const saved = hasWL("rope", d.slug);
  const { toggleCompare, isInCompare, isFull } = useCompare();
  const compared = isInCompare("ropes", d.slug);
  const compareFull = !compared && isFull("ropes");

  return (
    <div
      style={{
        background: "#1c1f26", borderRadius: "16px", overflow: "hidden",
        border: "1px solid #2a2f38", transition: "all .3s",
        position: "relative", cursor: "pointer",
      }}
      onMouseOver={(e) => { e.currentTarget.style.border = "1px solid #E8734A"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseOut={(e) => { e.currentTarget.style.border = "1px solid #2a2f38"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Visual header: product image or rope SVG fallback */}
      <div onClick={onClick} style={{
        height: "140px", position: "relative", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#fff",
      }}>
        <TypeBadge type={d.rope_type} tripleRated={d.triple_rated} />
        <Badge score={s} />
        <Img
          src={d.image_url}
          alt={`${d.brand} ${d.model}`}
          style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }}
          fallback={<RopeSVG color1={d.rope_color_1 || "#888"} color2={d.rope_color_2 || "#666"} diameter={d.diameter_mm} ropeType={d.rope_type} />}
        />
      </div>

      <div onClick={onClick} style={{ padding: "16px" }}>
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
            ⌀ <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 500, fontSize: "12px", color: "#f0f0f0" }}>{d.diameter_mm}mm</span>
          </span>
          <span style={{ fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 500, fontSize: "12px", color: "#f0f0f0" }}>{d.weight_per_meter_g}</span> g/m
          </span>
          {isDynamic && d.uiaa_falls && (
            <span style={{ fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 500, fontSize: "12px", color: "#f0f0f0" }}>{d.uiaa_falls}</span> falls
            </span>
          )}
          {isDynamic && d.impact_force_kn && (
            <span style={{ fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 500, fontSize: "12px", color: "#f0f0f0" }}>{d.impact_force_kn}</span> kN
            </span>
          )}
          {!isDynamic && d.breaking_strength_kn && (
            <span style={{ fontSize: "11px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 500, fontSize: "12px", color: "#f0f0f0" }}>{d.breaking_strength_kn}</span> kN break
            </span>
          )}
        </div>

        {/* Feature tags */}
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" }}>
          {d.dry_treatment !== "none" && d.dry_treatment_name && <SmallTag variant="dry">{d.dry_treatment_name}</SmallTag>}
          {d.uiaa_water_repellent && <SmallTag variant="dry">UIAA WR</SmallTag>}
          {d.core_construction !== "standard" && <SmallTag variant="tech">{d.core_construction}</SmallTag>}
          {d.aramid_protection && <SmallTag variant="tech">Aramid</SmallTag>}
          {d.middle_mark === "bi_pattern" && <SmallTag variant="tech">Bi-pattern</SmallTag>}
          {d.bluesign && <SmallTag variant="eco">Bluesign</SmallTag>}
          {d.recycled_materials !== "none" && <SmallTag variant="eco">{fmt(d.recycled_materials)} recycled</SmallTag>}
          {d.pfc_free && <SmallTag variant="eco">PFC-free</SmallTag>}
        </div>

        {/* Length pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
          <span style={{ fontSize: "10px", color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".5px" }}>Lengths</span>
          {ensureArray(d.available_lengths_m).map((l) => (
            <button
              key={l}
              onClick={(e) => { e.stopPropagation(); onLengthSelect(d.id || d.slug, l); }}
              style={{
                padding: "3px 8px", borderRadius: "6px",
                fontSize: "11px", fontFamily: "'DM Mono',monospace",
                background: selLen === l ? "rgba(232,115,74,0.15)" : "#252830",
                color: selLen === l ? "#E8734A" : "#9ca3af",
                border: selLen === l ? "1px solid #E8734A" : "1px solid #2a2f38",
                cursor: "pointer", transition: "all .15s", fontWeight: selLen === l ? 600 : 400,
              }}
            >
              {l}m
            </button>
          ))}
        </div>

        {/* Price row */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid #2a2f38" }}>
          <div>
            {selLen ? (
              <>
                <span style={{ fontSize: "18px", fontWeight: 700, fontFamily: "'DM Mono',monospace", color: "#E8734A" }}>
                  €{(d.price_per_meter_eur_min * selLen).toFixed(0)}
                </span>
                <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "4px" }}>(€{d.price_per_meter_eur_min}/m)</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: "18px", fontWeight: 700, fontFamily: "'DM Mono',monospace", color: "#E8734A" }}>
                  €{d.price_per_meter_eur_min?.toFixed(2)}
                </span>
                <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "2px" }}>/m</span>
              </>
            )}
            {buyUrl && (
              <span
                onClick={e => { e.preventDefault(); e.stopPropagation(); window.open(buyUrl, "_blank"); }}
                style={{ fontSize: "11px", color: "#E8734A", fontWeight: 600, cursor: "pointer", marginLeft: "6px", whiteSpace: "nowrap" }}
              >→ Buy</span>
            )}
          </div>
          <div>
            {d.price_uvp_per_meter_eur > d.price_per_meter_eur_min && (
              <>
                <span style={{ fontSize: "12px", color: "#6b7280", textDecoration: "line-through", fontFamily: "'DM Mono',monospace" }}>
                  {selLen ? `€${(d.price_uvp_per_meter_eur * selLen).toFixed(0)}` : `€${d.price_uvp_per_meter_eur?.toFixed(2)}/m`}
                </span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#22c55e", marginLeft: "6px" }}>
                  -{Math.round(((d.price_uvp_per_meter_eur - d.price_per_meter_eur_min) / d.price_uvp_per_meter_eur) * 100)}%
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      {/* ═══ ACTION BAR — Save & Compare ═══ */}
      <div style={{ display: "flex", borderTop: "1px solid #252a35" }}>
        <button
          onClick={(e) => { e.stopPropagation(); toggleWL("rope", d.slug); }}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: "6px", padding: "12px 8px",
            background: "none", border: "none", borderRight: "1px solid #252a35",
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            fontSize: "12px", fontWeight: 600,
            color: saved ? "#ef4444" : "#717889",
            transition: "all .15s",
          }}
          onMouseOver={e => { if (!saved) e.currentTarget.style.color = "#e8e9ec"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
          onMouseOut={e => { e.currentTarget.style.color = saved ? "#ef4444" : "#717889"; e.currentTarget.style.background = "none"; }}
        >
          <HeartSVG filled={saved} size={16} />
          {saved ? "Saved" : "Save"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); if (!compareFull) toggleCompare("ropes", d.slug); }}
          title={compareFull ? "Max 10 in comparison" : compared ? "Remove from comparison" : "Add to comparison"}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: "6px", padding: "12px 8px",
            background: compared ? "rgba(232,115,74,0.06)" : "none",
            border: "none", cursor: compareFull ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans',sans-serif",
            fontSize: "12px", fontWeight: 600,
            color: compared ? "#E8734A" : "#717889",
            opacity: compareFull ? 0.4 : 1,
            transition: "all .15s",
          }}
          onMouseOver={e => { if (!compared && !compareFull) { e.currentTarget.style.color = "#e8e9ec"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; } }}
          onMouseOut={e => { e.currentTarget.style.color = compared ? "#E8734A" : "#717889"; e.currentTarget.style.background = compared ? "rgba(232,115,74,0.06)" : "none"; }}
        >
          <CompareSVG size={16} />
          {compared && <CheckSVG size={12} />}
          {compared ? "Added" : "Compare"}
        </button>
      </div>
    </div>
  );
}

// ═══ MAIN APP ═══

// ═══ SESSION PERSISTENCE ═══
const ROPE_STORAGE_KEY = "cg_rope_filters";
function loadRopeSession() {
  try { return JSON.parse(sessionStorage.getItem(ROPE_STORAGE_KEY)) || {}; }
  catch { return {}; }
}

export default function RopeApp({ ropes = [], src = "local", priceData = {} }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const viewFromUrl = searchParams.get("view");
  const [view, setView] = useState(viewFromUrl === "chart" ? "chart" : "cards"); // "cards" | "chart"
  const _s = loadRopeSession();
  const [filters, setFilters] = useState(_s.filters || {});
  const [activeTypes, setActiveTypes] = useState(_s.activeTypes || []);
  const [openGroup, setOpenGroup] = useState(_s.openGroup || "climbing");
  const [query, setQuery] = useState(_s.query || "");
  const [selectedLengths, setSelectedLengths] = useState({});
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMobileSort, setShowMobileSort] = useState(false);
  const [sortKey, setSortKey] = useState(_s.sortKey || "best_match");

  useEffect(() => {
    sessionStorage.setItem(ROPE_STORAGE_KEY, JSON.stringify({ filters, activeTypes, openGroup, query, sortKey }));
  }, [filters, activeTypes, openGroup, query, sortKey]);

  const set = (k, v) => {
    setFilters((p) => {
      const n = { ...p };
      if (v == null || (Array.isArray(v) && !v.length)) delete n[k];
      else n[k] = v;
      return n;
    });
  };

  // Hard filter: rope type
  const typeFiltered = useMemo(() => {
    if (!activeTypes.length) return ropes;
    return ropes.filter((r) => activeTypes.includes(r.rope_type));
  }, [ropes, activeTypes]);

  // Search
  const searchFiltered = useMemo(() => {
    if (!query.trim()) return typeFiltered;
    const q = query.toLowerCase().trim();
    return typeFiltered.filter((r) =>
      r.brand?.toLowerCase().includes(q) ||
      r.model?.toLowerCase().includes(q) ||
      r.slug?.includes(q)
    );
  }, [typeFiltered, query]);

  // Score
  const results = useMemo(() => score(searchFiltered, filters), [searchFiltered, filters]);

  const displayResults = useMemo(() => {
    if (sortKey === "best_match") return results;
    const items = results.map(r => r.rope_data);
    const sorted = sortItems(items, sortKey, {
      getPrice: i => i.price_per_meter_eur_min,
      getUvp: i => i.price_uvp_per_meter_eur,
    });
    return sorted.map(s => results.find(r => r.rope_data.slug === s.slug) || { rope_data: s, match_score: -1 });
  }, [results, sortKey]);

  const GROUPS = useMemo(() => getGroups(activeTypes), [activeTypes]);

  const ac = Object.entries(filters).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v) && !v.length) return false;
    if (typeof v === "object" && !Array.isArray(v) && v.min == null && v.max == null) return false;
    return true;
  }).length;

  const toggleType = (t) => {
    setActiveTypes((prev) => {
      const n = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      return n;
    });
    // Reset use cases when type changes
    set("best_use_cases", null);
  };

  const handleLengthSelect = (ropeId, len) => {
    setSelectedLengths((prev) => ({
      ...prev,
      [ropeId]: prev[ropeId] === len ? null : len,
    }));
  };

  return (
    <div style={{ background: "#0e1015", minHeight: "100vh", color: "#f0f0f0" }}>
      {/* Sub-header: search + filters */}
      <header style={{
        position: "sticky", top: isMobile ? "44px" : "50px", zIndex: 100,
        display: isMobile ? "block" : "flex", alignItems: "center", gap: "16px",
        flexWrap: "nowrap",
        padding: isMobile ? undefined : "0 24px",
        minHeight: isMobile ? undefined : "50px",
        background: "rgba(14,16,21,.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1e2028",
      }}>
        {isMobile ? (
          <>
            {/* Mobile Row 1: Filters + Sort icon + Search */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center", padding: "8px 12px 0" }}>
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                style={{
                  height: "34px", padding: "0 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                  color: ac > 0 ? "#E8734A" : "#9ca3af",
                  cursor: "pointer", border: `1px solid ${ac > 0 ? "#E8734A" : "#2a2f38"}`,
                  background: ac > 0 ? "rgba(232,115,74,0.08)" : "#1a1d24",
                  fontFamily: "'DM Sans',sans-serif",
                  display: "flex", alignItems: "center", gap: "6px",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/></svg>
                Filters{ac > 0 ? ` (${ac})` : ""}
              </button>
              {view === "cards" && (
                <button
                  onClick={() => setShowMobileSort(true)}
                  style={{
                    height: "34px", padding: "0 10px", borderRadius: "8px",
                    border: "1px solid #2a2f38", background: "#1a1d24",
                    color: "#9ca3af", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "4px",
                    fontFamily: "'DM Sans',sans-serif", fontSize: "11px", fontWeight: 600,
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M3 12h12M3 18h6"/>
                  </svg>
                  {(SORT_OPTIONS_GENERIC.find(o => o.key === sortKey)?.label || "Sort").split(":")[0].replace("Biggest ", "").replace("Newest ", "New")}
                </button>
              )}
              <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
                <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#6b7280", fontSize: "14px", pointerEvents: "none" }}>⌕</span>
                <input
                  type="text"
                  placeholder="Search…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{
                    width: "100%", height: "34px", padding: "0 12px 0 32px",
                    borderRadius: "8px", border: "1px solid #2a2f38",
                    background: "#1a1d24", color: "#f0f0f0",
                    fontFamily: "'DM Sans',sans-serif", fontSize: "13px", outline: "none",
                  }}
                />
              </div>
            </div>
            {/* Mobile Row 2: Count + Clear | View toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>
                  {results.length} rope{results.length !== 1 ? "s" : ""}
                </span>
                {(ac > 0 || activeTypes.length > 0) && (
                  <button
                    onClick={() => { setFilters({}); setQuery(""); setActiveTypes([]); setSelectedLengths({}); }}
                    style={{
                      padding: "2px 8px", borderRadius: "10px", border: "1px solid #3a3f47",
                      background: "transparent", color: "#9ca3af", fontSize: "10px",
                      cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: "2px", background: "#1a1d24", borderRadius: "6px", padding: "2px" }}>
                {[
                  { key: "cards", icon: "▦" },
                  { key: "chart", icon: "⊙" },
                ].map(v => (
                  <button key={v.key} onClick={() => { setView(v.key); setSearchParams(v.key === "chart" ? { view: "chart" } : {}); }} style={{
                    padding: "4px 8px", borderRadius: "4px", border: "none", cursor: "pointer",
                    background: view === v.key ? "rgba(232,115,74,0.15)" : "transparent",
                    color: view === v.key ? "#E8734A" : "#6b7280",
                    fontSize: "12px", fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                  }}>
                    {v.icon}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1, maxWidth: "400px", position: "relative" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#6b7280", fontSize: "14px", pointerEvents: "none" }}>⌕</span>
              <input
                type="text"
                placeholder="Search ropes…"
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
                  {v.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: "11px", color: "#6b7280", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>
              {results.length} ropes
            </span>
            {(ac > 0 || activeTypes.length > 0) && (
              <button
                onClick={() => { setFilters({}); setQuery(""); setActiveTypes([]); setSelectedLengths({}); }}
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
          </>
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

            {/* Rope Type */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e2028" }}>
              <div style={{
                fontSize: "10px", fontWeight: 700, color: "#22d3ee",
                letterSpacing: "1.5px", textTransform: "uppercase",
                marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22d3ee" }} />
                Rope Type
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[
                  { type: "single", icon: "①", label: "Single" },
                  { type: "half", icon: "½", label: "Half" },
                  { type: "twin", icon: "∞", label: "Twin" },
                  { type: "static", icon: "▬", label: "Static" },
                ].map((t) => (
                  <TypePill key={t.type} icon={t.icon} label={t.label} active={activeTypes.includes(t.type)} onClick={() => toggleType(t.type)} />
                ))}
              </div>
            </div>

            {/* Filter groups */}
            {GROUPS.map((g) => (
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
                        {f.type === "length" && <LengthPicker options={f.options} value={filters[f.key] ?? null} onChange={(v) => set(f.key, v)} />}
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
                Show {results.length} rope{results.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile sort bottom sheet */}
      {isMobile && showMobileSort && (
        <>
          <div
            onClick={() => setShowMobileSort(false)}
            style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.5)" }}
          />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 201,
            background: "#1c1f26", borderRadius: "16px 16px 0 0",
            padding: "12px 0 calc(env(safe-area-inset-bottom, 16px) + 8px)",
            boxShadow: "0 -4px 24px rgba(0,0,0,.4)",
          }}>
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#3a3f47", margin: "0 auto 12px" }} />
            <div style={{ padding: "0 20px 8px", fontSize: "13px", fontWeight: 700, color: "#f0f0f0" }}>Sort by</div>
            {SORT_OPTIONS_GENERIC.map(o => (
              <button
                key={o.key}
                onClick={() => { setSortKey(o.key); setShowMobileSort(false); }}
                style={{
                  width: "100%", padding: "14px 20px", background: "none", border: "none",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  color: sortKey === o.key ? "#E8734A" : "#d1d5db", fontSize: "14px", fontWeight: sortKey === o.key ? 700 : 400,
                }}
              >
                {o.label}
                {sortKey === o.key && <span style={{ color: "#E8734A", fontSize: "16px" }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", minHeight: "calc(100vh - 65px)" }}>
        {/* Sidebar — desktop only, hidden in chart view */}
        {!isMobile && view !== "chart" && (
          <aside style={{
            width: "320px", minWidth: "320px",
            borderRight: "1px solid #1e2028",
            overflowY: "auto", height: "calc(100vh - 65px)",
            position: "sticky", top: "65px",
          }}>
            <div style={{ padding: "20px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", letterSpacing: "2px", textTransform: "uppercase" }}>
                Find Your Rope
              </span>
            </div>

            {/* Hard filter: Rope Type */}
            <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #1e2028" }}>
              <div style={{
                fontSize: "10px", fontWeight: 700, color: "#22d3ee",
                letterSpacing: "1.5px", textTransform: "uppercase",
                marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22d3ee" }} />
                Rope Type
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[
                  { type: "single", icon: "①", label: "Single" },
                  { type: "half", icon: "½", label: "Half" },
                  { type: "twin", icon: "∞", label: "Twin" },
                  { type: "static", icon: "▬", label: "Static" },
                ].map((t) => (
                  <TypePill
                    key={t.type}
                    icon={t.icon}
                    label={t.label}
                    active={activeTypes.includes(t.type)}
                    onClick={() => toggleType(t.type)}
                  />
                ))}
              </div>
            </div>

            {/* Soft filter groups */}
            {GROUPS.map((g) => (
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
                        {f.type === "length" && <LengthPicker options={f.options} value={filters[f.key] ?? null} onChange={(v) => set(f.key, v)} />}
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
          {(ac > 0 || activeTypes.length > 0 || query) && (
            <div style={{
              display: "flex", gap: "8px", flexWrap: isMobile ? "nowrap" : "wrap",
              overflowX: isMobile ? "auto" : undefined, WebkitOverflowScrolling: "touch",
              marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid #1e2028",
            }}>
              {activeTypes.map((t) => (
                <span key={t} style={{
                  display: "flex", alignItems: "center", gap: "6px", padding: "4px 12px",
                  borderRadius: "16px", fontSize: "11px", whiteSpace: "nowrap",
                  background: "rgba(34,211,238,.08)", border: "1px solid rgba(34,211,238,.25)", color: "#22d3ee",
                }}>
                  <span style={{ color: "#6b7280" }}>type:</span> {fmt(t)}
                  <button onClick={() => toggleType(t)} style={{ background: "none", border: "none", color: "#22d3ee", cursor: "pointer", fontSize: "14px", padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
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
                      : typeof v === "number"
                        ? v + "m"
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
            <RopeScatterChart isMobile={isMobile} />
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? "10px" : "16px" }}>
                <span style={{ fontSize: isMobile ? "12px" : "13px", color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>
                  {displayResults.length} rope{displayResults.length !== 1 ? "s" : ""}{ac > 0 ? ` · ${ac} filter${ac > 1 ? "s" : ""}` : ""}
                </span>
                <SortDropdownGeneric value={sortKey} onChange={setSortKey} />
              </div>

              {/* Grid */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(auto-fill, minmax(160px, 1fr))" : "repeat(auto-fill, minmax(300px, 1fr))", gap: isMobile ? "10px" : "20px" }}>
                {displayResults.map((r, i) => (
                  <div key={r.rope_data?.id || r.rope_data?.slug || i} style={{ animation: `fadeUp .4s ease ${i * 40}ms both`, position: "relative" }}>
                    {isMobile ? (
                      <CompactRopeCard
                        result={r}
                        onClick={() => { navigate(`/rope/${r.rope_data.slug}`); window.scrollTo(0, 0); }}
                        priceData={priceData}
                      />
                    ) : (
                      <RopeCard
                        result={r}
                        onClick={() => { navigate(`/rope/${r.rope_data.slug}`); window.scrollTo(0, 0); }}
                        selectedLength={selectedLengths[r.rope_data.id || r.rope_data.slug]}
                        onLengthSelect={handleLengthSelect}
                        priceData={priceData}
                      />
                    )}
                  </div>
                ))}
              </div>

              {!displayResults.length && (
                <div style={{ textAlign: "center", padding: isMobile ? "40px 0" : "80px 0", color: "#6b7280" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>🪢</div>
                  <div style={{ fontSize: "16px", marginBottom: "8px" }}>No ropes match{query ? ` "${query}"` : ""}</div>
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
