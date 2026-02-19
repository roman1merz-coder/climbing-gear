import { useState, useMemo } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { fmt, ensureArray } from "./utils/format.js";
import useIsMobile from "./useIsMobile.js";
import { sortShoes, SortDropdown, SORT_OPTIONS } from "./sorting.jsx";
import { fairShuffle } from "./randomizer.js";
import CompareCheckbox from "./CompareCheckbox.jsx";
import HeartButton from "./HeartButton.jsx";
import { useWL } from "./WishlistContext.jsx";
import { useCompare } from "./CompareContext.jsx";
import { ScoringDisclaimer } from "./Methodology.jsx";
import ShoeScatterChart from "./ShoeScatterChart.jsx";
import usePageMeta from "./usePageMeta.js";

// ═══ SCORING FUNCTIONS ═══

const ORD = {
  toe_form: ["egyptian", "roman", "greek"],
  forefoot_volume: ["low", "standard", "high"],
  width: ["narrow", "medium", "wide"],
  heel_volume: ["narrow", "medium", "wide"],
  feel: ["stiff", "stiff-moderate", "moderate", "moderate-soft", "soft"],
  asymmetry: ["none", "slight", "strong"],
  downturn: ["flat", "moderate", "aggressive"],
};

const PROX = {
  skill_level: ["beginner", "hobby", "intermediate", "advanced", "elite"],
  best_wall_angles: ["slab", "vertical", "overhang", "roof"],
  durability: ["low", "moderate", "high"],
  rubber_hardness: ["soft", "medium", "hard"],
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

/** Map detailed upper_material descriptions to base category for filtering */
function upperBase(mat) {
  if (!mat) return mat;
  const m = mat.toLowerCase();
  if (m === "leather" || m === "microfiber" || m === "synthetic" || m === "microsuede") return m;
  if (m.includes("leather")) return "leather";
  if (m.includes("microsuede")) return "microsuede";
  if (m.includes("microfiber") || m.includes("lorica") || m.includes("washtex")) return "microfiber";
  return "synthetic";
}

function sRng(mn, mx, v) {
  if (v == null) return 0;
  if (v >= mn && v <= mx) return 1;
  const sp = mx - mn || 1;
  const g = sp * 0.1;
  const d = v < mn ? mn - v : v - mx;
  return d <= g ? 0.5 : 0;
}

function score(shoes, filters) {
  const active = Object.entries(filters).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v) && !v.length) return false;
    if (typeof v === "object" && !Array.isArray(v) && v.min == null && v.max == null)
      return false;
    return true;
  });
  if (!active.length)
    return shoes.map((s) => ({ shoe_data: s, match_score: -1 }));
  return shoes
    .map((shoe) => {
      let tot = 0;
      let cnt = 0;
      for (const [k, val] of active) {
        let s = 0;
        if (k === "my_size" && typeof val === "string") {
          const r = shoe.size_range;
          if (r) {
            const [lo, hi] = r.split("-").map(Number);
            s = parseFloat(val) >= lo && parseFloat(val) <= hi ? 1 : 0;
          }
        } else if (PROX[k] && Array.isArray(val)) {
          s = sProx(val, shoe[k], PROX[k]);
        } else if (ORD[k] && typeof val === "string") {
          s = sOrd(val, shoe[k], ORD[k]);
        } else if (Array.isArray(val) && val.length) {
          s = sSet(val, k === "upper_material" ? upperBase(shoe[k]) : shoe[k]);
        } else if (typeof val === "object" && !Array.isArray(val)) {
          s = sRng(val.min ?? 0, val.max ?? Infinity, shoe[k]);
        } else if (typeof val === "boolean") {
          s = shoe[k] === val ? 1 : 0;
        }
        tot += s;
        cnt++;
      }
      return { shoe_data: shoe, match_score: cnt ? Math.round((tot / cnt) * 100) : -1 };
    })
    .sort((a, b) =>
      b.match_score !== a.match_score ? b.match_score - a.match_score : 0
    );
}

// ═══ FILTER GROUPS ═══

const GROUPS = [
  {
    id: "basics",
    label: "Your Climbing",
    icon: "🧗",
    filters: [
      {
        key: "skill_level",
        label: "Level",
        type: "multi",
        options: ["beginner", "hobby", "intermediate", "advanced", "elite"],
      },
      {
        key: "use_cases",
        label: "Discipline",
        type: "multi",
        options: ["boulder", "sport", "trad_multipitch", "speed"],
      },
      {
        key: "best_rock_types",
        label: "Rock Type",
        type: "multi",
        options: ["limestone", "granite", "sandstone", "indoor"],
      },
      {
        key: "best_wall_angles",
        label: "Wall Angle",
        type: "multi",
        options: ["slab", "vertical", "overhang", "roof"],
      },
      {
        key: "best_foothold_types",
        label: "Footholds",
        type: "multi",
        options: ["smear", "edge", "pocket", "crack", "volume"],
      },
    ],
  },
  {
    id: "foot",
    label: "Your Foot",
    icon: "🦶",
    filters: [
      {
        key: "gender",
        label: "Gender",
        type: "multi",
        options: ["mens", "womens", "unisex"],
      },
      {
        key: "toe_form",
        label: "Toe Shape",
        type: "single",
        options: ["egyptian", "roman", "greek"],
      },
      { key: "forefoot_volume", label: "Forefoot Volume", type: "single", options: ["low", "standard", "high"] },
      {
        key: "width",
        label: "Forefoot Width",
        type: "single",
        options: ["narrow", "medium", "wide"],
      },
      {
        key: "heel_volume",
        label: "Heel Volume",
        type: "single",
        options: ["narrow", "medium", "wide"],
      },
    ],
  },
  {
    id: "shoe",
    label: "Shoe Type",
    icon: "👟",
    filters: [
      {
        key: "closure",
        label: "Closure",
        type: "multi",
        options: ["lace", "velcro", "slipper"],
      },
      {
        key: "downturn",
        label: "Downturn",
        type: "single",
        options: ["flat", "moderate", "aggressive"],
      },
      {
        key: "asymmetry",
        label: "Asymmetry",
        type: "single",
        options: ["none", "slight", "strong"],
      },
      {
        key: "feel",
        label: "Feel",
        type: "single",
        options: ["stiff", "stiff-moderate", "moderate", "moderate-soft", "soft"],
      },
      {
        key: "upper_material",
        label: "Upper",
        type: "multi",
        options: ["leather", "microfiber", "synthetic"],
      },
      { key: "weight_g", label: "Weight (g)", type: "range", min: 300, max: 700 },
      { key: "vegan", label: "Vegan", type: "bool" },
      { key: "resoleable", label: "Resoleable", type: "bool" },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: "🔬",
    filters: [
      {
        key: "durability",
        label: "Durability",
        type: "multi",
        options: ["low", "moderate", "high"],
      },
      {
        key: "rubber_hardness",
        label: "Rubber Hardness",
        type: "multi",
        options: ["soft", "medium", "hard"],
      },
      {
        key: "rubber_thickness_mm",
        label: "Thickness (mm)",
        type: "range",
        min: 2,
        max: 5,
        step: 0.5,
      },
      {
        key: "toe_patch",
        label: "Toe Patch",
        type: "multi",
        options: ["none", "medium", "full"],
      },
      {
        key: "heel_rubber_coverage",
        label: "Heel Rubber",
        type: "multi",
        options: ["none", "partial", "full"],
      },
      {
        key: "midsole",
        label: "Midsole",
        type: "multi",
        options: ["none", "partial", "full"],
      },
    ],
  },
  {
    id: "price",
    label: "Price",
    icon: "💰",
    filters: [
      { key: "current_price_eur", label: "Price (€)", type: "range", min: 50, max: 220 },
      {
        key: "my_size",
        label: "My Size (EU)",
        type: "single",
        options: [
          "33",
          "34",
          "35",
          "36",
          "37",
          "38",
          "39",
          "40",
          "41",
          "42",
          "43",
          "44",
          "45",
          "46",
          "47",
          "48",
          "49",
          "50",
        ],
      },
    ],
  },
];

// ═══ UI PRIMITIVES ═══

function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: "20px",
        border: active ? "1.5px solid #c98a42" : "1.5px solid #354840",
        background: active ? "rgba(201,138,66,0.15)" : "transparent",
        color: active ? "#c98a42" : "#8a8373",
        fontSize: "12px",
        fontFamily: "'DM Sans',sans-serif",
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        transition: "all .2s",
        textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {label.replace(/_/g, " ")}
    </button>
  );
}

function Single({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {options.map((o) => (
        <Chip
          key={o}
          label={o}
          active={value === o}
          onClick={() => onChange(value === o ? null : o)}
        />
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
        <Chip
          key={o}
          label={o}
          active={value.includes(o)}
          onClick={() => t(o)}
        />
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
        <span style={{ fontSize: "12px", color: "#c98a42", fontFamily: "'DM Mono',monospace" }}>
          {f(lo)}
        </span>
        <span style={{ fontSize: "12px", color: "#c98a42", fontFamily: "'DM Mono',monospace" }}>
          {f(hi)}
        </span>
      </div>
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onChange({ min: +e.target.value, max: hi })}
          style={{ flex: 1, accentColor: "#c98a42" }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onChange({ min: lo, max: +e.target.value })}
          style={{ flex: 1, accentColor: "#c98a42" }}
        />
      </div>
    </div>
  );
}

function Bool({ label, value, onChange }) {
  return (
    <button
      onClick={() => onChange(value === true ? null : true)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 14px",
        borderRadius: "20px",
        border: value ? "1.5px solid #c98a42" : "1.5px solid #354840",
        background: value ? "rgba(201,138,66,0.15)" : "transparent",
        color: value ? "#c98a42" : "#8a8373",
        fontSize: "12px",
        fontFamily: "'DM Sans',sans-serif",
        cursor: "pointer",
        transition: "all .2s",
      }}
    >
      <span style={{ fontSize: "14px" }}>{value ? "✓" : "◯"}</span> {label}
    </button>
  );
}

function MatchOverlay({ score: s }) {
  if (s == null || s < 0) return null;
  const bg = s >= 80 ? "rgba(34,197,94,.85)" : s >= 50 ? "rgba(201,138,66,.85)" : "rgba(239,68,68,.85)";
  return (
    <span
      style={{
        position: "absolute", top: "8px", right: "8px",
        padding: "3px 8px", borderRadius: "8px",
        background: bg, color: "#fff",
        fontFamily: "'DM Mono',monospace",
        fontSize: "11px", fontWeight: 700, lineHeight: 1.2,
        zIndex: 2,
      }}
    >
      {s}%
    </span>
  );
}

const BC = {
  Scarpa: "#c2392a",
  "La Sportiva": "#f5b800",
  Unparallel: "#3b82f6",
  "Mad Rock": "#8b5cf6",
};

const BI = {
  Scarpa:
    "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=400&h=400&fit=crop",
  "La Sportiva":
    "https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=400&h=400&fit=crop",
  Unparallel:
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=400&fit=crop",
  "Mad Rock":
    "https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=400&h=400&fit=crop",
};

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

function Card({ shoe, onClick, priceData, compact }) {
  const d = shoe.shoe_data;
  const s = shoe.match_score;
  const livePrices = (priceData?.[d.slug] || []).filter(p => p.inStock && p.price > 0).map(p => p.price);
  const liveBestPrice = livePrices.length > 0 ? Math.min(...livePrices) : null;
  const effectivePrice = liveBestPrice || d.current_price_eur;
  const disc =
    d.price_uvp_eur && effectivePrice
      ? Math.round(((d.price_uvp_eur - effectivePrice) / d.price_uvp_eur) * 100)
      : 0;
  const img =
    d.image_url ||
    BI[d.brand] ||
    "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=400&fit=crop";

  // Wishlist & compare hooks
  const { toggle: toggleWL, has: hasWL } = useWL();
  const saved = hasWL("shoe", d.slug);
  const { toggleCompare, isInCompare, isFull } = useCompare();
  const compared = isInCompare("shoes", d.slug);
  const compareFull = !compared && isFull("shoes");

  return (
    <div
      style={{
        background: "#1c1f26",
        borderRadius: "16px",
        overflow: "hidden",
        border: "1px solid #d5cdbf",
        transition: "all .3s",
        position: "relative",
        cursor: "pointer",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.border = "1px solid #c98a42";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.border = "1px solid #d5cdbf";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        onClick={onClick}
        style={{
          aspectRatio: "4/3",
          background: "#f5f5f5",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <img
          src={img}
          alt={d.model || "Climbing shoe"}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            padding: compact ? "8px" : "12px",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, transparent 60%, #1c1f26)",
            pointerEvents: "none",
          }}
        />
        <MatchOverlay score={s} />
        {d.gender && d.gender !== "unisex" && !compact && (
          <div
            style={{
              position: "absolute",
              bottom: "12px",
              left: "12px",
              background: "rgba(201,138,66,.85)",
              color: "#fff",
              padding: "2px 8px",
              borderRadius: "8px",
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "capitalize",
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            {d.gender}
          </div>
        )}
      </div>
      <div onClick={onClick} style={{ padding: compact ? "10px" : "16px" }}>
        {/* Row 1: brand left, current price right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "4px",
                height: compact ? "10px" : "12px",
                borderRadius: "2px",
                background: BC[d.brand] || "#6b7280",
              }}
            />
            <span
              style={{
                fontSize: compact ? "9px" : "10px",
                color: "#6b7280",
                fontWeight: 600,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              {d.brand}
            </span>
          </div>
          {effectivePrice ? (
            <span
              style={{
                fontSize: compact ? "14px" : "16px",
                fontWeight: 700,
                color: "#c98a42",
                fontFamily: "'DM Mono',monospace",
                flexShrink: 0,
              }}
            >
              €{Number(effectivePrice) % 1 === 0 ? Number(effectivePrice) : Number(effectivePrice).toFixed(2)}
            </span>
          ) : (
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", fontStyle: "italic" }}>
              Check retailers
            </span>
          )}
        </div>
        {/* Row 2: model left, strikethrough RRP + green discount right */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <span
            style={{
              fontSize: compact ? "14px" : "17px",
              fontWeight: 700,
              color: "#2c3227",
              fontFamily: "'DM Sans',sans-serif",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {d.model}
          </span>
          {effectivePrice && effectivePrice < d.price_uvp_eur && (
            <div style={{ display: "flex", alignItems: "baseline", gap: "3px", flexShrink: 0 }}>
              <span
                style={{
                  fontSize: "10px",
                  color: "#6b7280",
                  textDecoration: "line-through",
                  fontFamily: "'DM Mono',monospace",
                }}
              >
                €{d.price_uvp_eur}
              </span>
              {disc > 0 && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#22c55e",
                    fontFamily: "'DM Mono',monospace",
                  }}
                >
                  -{disc}%
                </span>
              )}
            </div>
          )}
        </div>
        {/* Desktop-only: tags + skill levels */}
        {!compact && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "8px" }}>
            {[d.closure, d.downturn, d.feel]
              .filter(Boolean)
              .map((t) => (
                <span
                  key={t}
                  style={{
                    padding: "3px 10px",
                    borderRadius: "12px",
                    background: "#252830",
                    color: "#8a8373",
                    fontSize: "10px",
                    fontFamily: "'DM Sans',sans-serif",
                    textTransform: "capitalize",
                  }}
                >
                  {String(t).replace(/-/g, " ")}
                </span>
              ))}
            {(d.skill_level || []).map((l) => (
              <span
                key={l}
                style={{
                  padding: "2px 8px",
                  borderRadius: "8px",
                  fontSize: "9px",
                  fontWeight: 600,
                  background: "rgba(201,138,66,.1)",
                  color: "#c98a42",
                  textTransform: "capitalize",
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
      {/* ═══ ACTION BAR — Save & Compare ═══ */}
      <div style={{ display: "flex", borderTop: "1px solid #d5cdbf" }}>
        <button
          onClick={(e) => { e.stopPropagation(); toggleWL("shoe", d.slug); }}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: "6px", padding: compact ? "10px 6px" : "12px 8px",
            background: "none", border: "none", borderRight: "1px solid #d5cdbf",
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            fontSize: compact ? "11px" : "12px", fontWeight: 600,
            color: saved ? "#ef4444" : "#717889",
            transition: "all .15s",
          }}
          onMouseOver={e => { if (!saved) e.currentTarget.style.color = "#e8e9ec"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
          onMouseOut={e => { e.currentTarget.style.color = saved ? "#ef4444" : "#717889"; e.currentTarget.style.background = "none"; }}
        >
          <HeartSVG filled={saved} size={compact ? 15 : 16} />
          {!compact && (saved ? "Saved" : "Save")}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); if (!compareFull) toggleCompare("shoes", d.slug); }}
          title={compareFull ? "Max 10 in comparison" : compared ? "Remove from comparison" : "Add to comparison"}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: "6px", padding: compact ? "10px 6px" : "12px 8px",
            background: compared ? "rgba(201,138,66,0.06)" : "none",
            border: "none", cursor: compareFull ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans',sans-serif",
            fontSize: compact ? "11px" : "12px", fontWeight: 600,
            color: compared ? "#c98a42" : "#717889",
            opacity: compareFull ? 0.4 : 1,
            transition: "all .15s",
          }}
          onMouseOver={e => { if (!compared && !compareFull) { e.currentTarget.style.color = "#e8e9ec"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; } }}
          onMouseOut={e => { e.currentTarget.style.color = compared ? "#c98a42" : "#717889"; e.currentTarget.style.background = compared ? "rgba(201,138,66,0.06)" : "none"; }}
        >
          <CompareSVG size={compact ? 15 : 16} />
          {compared && <CheckSVG size={compact ? 11 : 12} />}
          {!compact && (compared ? "Added" : "Compare")}
        </button>
      </div>
    </div>
  );
}

// ═══ MAIN APP ═══

// Stable session ID — created once per page load, not per render
const SESSION_ID = String(Date.now());

export default function ClimbingGearApp({ shoes = [], src = "local", priceData = {}, filters: extFilters, setFilters: extSetFilters, query: extQuery, setQuery: extSetQuery }) {
  usePageMeta("Climbing Shoes — Compare 340+ Models", "Find the perfect climbing shoe. Compare specs, prices, and performance scores across 340+ models from La Sportiva, Scarpa, Evolv, and more.");
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewFromUrl = searchParams.get("view");
  const [view, setView] = useState(viewFromUrl === "chart" ? "chart" : "cards");
  const filters = extFilters || {};
  const setFilters = extSetFilters || (() => {});
  const query = extQuery || "";
  const setQuery = extSetQuery || (() => {});
  const [openGroup, setOpenGroup] = useState("basics");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMobileSort, setShowMobileSort] = useState(false);
  const [sortKey, setSortKey] = useState("best_match");

  // ── Weighted text relevance scoring ──
  // Returns { shoe, relevance (0-100) } for each shoe, or null if no match.
  // Field weights: model name >> brand >> use_cases/closure/feel >> description
  const searchScored = useMemo(() => {
    if (!query.trim()) return null; // null = no search active
    const q = query.toLowerCase().trim();
    const terms = q.split(/\s+/);

    return shoes
      .map((s) => {
        const model = (s.model || "").toLowerCase();
        const brand = (s.brand || "").toLowerCase();
        const desc = (s.description || "").toLowerCase();
        const meta = [
          ...(ensureArray(s.use_cases).map((v) => fmt(v).toLowerCase())),
          ...(ensureArray(s.skill_level).map((v) => fmt(v).toLowerCase())),
          ...(ensureArray(s.best_rock_types).map((v) => fmt(v).toLowerCase())),
          ...(ensureArray(s.best_foothold_types).map((v) => fmt(v).toLowerCase())),
          (s.closure || "").toLowerCase(),
          (s.downturn || "").toLowerCase(),
          (s.feel || "").replace(/-/g, " ").toLowerCase(),
          (s.upper_material || "").toLowerCase(),
          (s.rubber_type || "").toLowerCase(),
          (s.rubber_compound || "").toLowerCase(),
        ].join(" ");

        let totalRel = 0;
        let allMatch = true;

        for (const term of terms) {
          let best = 0;
          // Model name (highest value)
          if (model === q) best = Math.max(best, 50); // exact full model match
          else if (model.split(/\s+/).some((w) => w === term))
            best = Math.max(best, 30); // word match in model
          else if (model.includes(term)) best = Math.max(best, 20); // substring in model

          // Brand
          if (brand === term) best = Math.max(best, 25); // exact brand match
          else if (brand.includes(term)) best = Math.max(best, 15); // substring in brand

          // Meta fields (use cases, closure, feel, etc.)
          if (meta.includes(term)) best = Math.max(best, 10);
          else if (meta.split(/\s+/).some((w) => w === term)) best = Math.max(best, 8);

          // Description (lowest value)
          if (desc.includes(term)) best = Math.max(best, 3);

          if (best === 0) {
            allMatch = false;
            break;
          }
          totalRel += best;
        }

        if (!allMatch) return null;
        // Normalise: max possible per term is 50, scale to 0-100
        const relevance = Math.min(100, Math.round((totalRel / (terms.length * 50)) * 100));
        return { shoe: s, relevance };
      })
      .filter(Boolean);
  }, [shoes, query]);

  // When search is active, pre-filter to matched shoes; otherwise pass all
  const filtered = searchScored ? searchScored.map((r) => r.shoe) : shoes;
  // Build a relevance lookup for blending
  const relevanceMap = useMemo(() => {
    if (!searchScored) return null;
    const m = new Map();
    searchScored.forEach((r) => m.set(r.shoe.slug, r.relevance));
    return m;
  }, [searchScored]);

  const results = useMemo(() => {
    const scored = score(filtered, filters);
    if (!relevanceMap) return scored; // no search active, use filter score as-is
    // Blend: if filters active, 40% text + 60% filter; if no filters, 100% text
    const hasFilters = Object.entries(filters).some(
      ([, v]) =>
        v != null &&
        (!Array.isArray(v) || v.length > 0) &&
        (typeof v !== "object" || Array.isArray(v) || v.min != null || v.max != null)
    );
    return scored
      .map((r) => {
        const textRel = relevanceMap.get(r.shoe_data.slug) || 0;
        const filterScore = r.match_score >= 0 ? r.match_score : 0;
        const blended = hasFilters ? Math.round(textRel * 0.4 + filterScore * 0.6) : textRel;
        return { ...r, match_score: blended };
      })
      .sort((a, b) =>
        b.match_score !== a.match_score ? b.match_score - a.match_score : 0
      );
  }, [filtered, filters, relevanceMap]);

  // Apply sorting or fair shuffle on top of the scored results
  const displayResults = useMemo(() => {
    const hasActiveFilters = Object.keys(filters).length > 0;
    const hasSearch = !!query.trim();

    // If user has active search or filters, respect the match-score ordering
    // Unless they explicitly pick a sort option other than "best_match"
    if (sortKey === "best_match" && (hasActiveFilters || hasSearch)) {
      // Keep the match-score ordering, but apply fair shuffle to ties
      const shoeData = results.map(r => r.shoe_data);
      const shuffled = fairShuffle(shoeData, filters, query, SESSION_ID);
      // Re-attach scores and stable-sort by score (ties get fair shuffle order)
      const shuffleIdx = new Map(shuffled.map((s, i) => [s.slug, i]));
      return [...results].sort((a, b) => {
        if (b.match_score !== a.match_score) return b.match_score - a.match_score;
        return (shuffleIdx.get(a.shoe_data.slug) || 0) - (shuffleIdx.get(b.shoe_data.slug) || 0);
      });
    }

    if (sortKey === "best_match" && !hasActiveFilters && !hasSearch) {
      // No filters, no search — use sort-based "Best Match" + fair shuffle for ties
      const shoeData = results.map(r => r.shoe_data);
      const sorted = sortShoes(shoeData, "best_match", priceData);
      const shuffled = fairShuffle(sorted, filters, query, SESSION_ID);
      return shuffled.map(s => results.find(r => r.shoe_data.slug === s.slug) || { shoe_data: s, match_score: -1 });
    }

    // Explicit sort option chosen
    const shoeData = results.map(r => r.shoe_data);
    const sorted = sortShoes(shoeData, sortKey, priceData);
    return sorted.map(s => results.find(r => r.shoe_data.slug === s.slug) || { shoe_data: s, match_score: -1 });
  }, [results, sortKey, filters, query, priceData]);

  const set = (k, v) =>
    setFilters((p) => {
      const n = { ...p };
      if (v == null || (Array.isArray(v) && !v.length)) delete n[k];
      else n[k] = v;
      return n;
    });

  const ac = Object.keys(filters).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#13151a",
        fontFamily: "'DM Sans',sans-serif",
        color: "#2c3227",
      }}
    >
      {/* Sub-header: search + filters */}
      <header
        style={{
          padding: isMobile ? "0" : "0 24px",
          minHeight: isMobile ? undefined : "50px",
          borderBottom: "1px solid #1e2028",
          display: isMobile ? "block" : "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "nowrap",
          position: "sticky",
          top: isMobile ? "44px" : "50px",
          background: "rgba(245,240,232,0.95)",
          backdropFilter: "blur(12px)",
          zIndex: 100,
        }}
      >
        {isMobile ? (
          <>
            {/* Mobile Row 1: Filters + Sort icon + Search */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center", padding: "8px 12px 0" }}>
              <button
                onClick={() => setShowMobileFilters(true)}
                style={{
                  height: "34px", padding: "0 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                  color: ac > 0 ? "#c98a42" : "#8a8373",
                  cursor: "pointer", border: `1px solid ${ac > 0 ? "#c98a42" : "#d5cdbf"}`,
                  background: ac > 0 ? "rgba(201,138,66,0.08)" : "#ffffff",
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
                    border: "1px solid #d5cdbf", background: "#ffffff",
                    color: "#8a8373", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "4px",
                    fontFamily: "'DM Sans',sans-serif", fontSize: "11px", fontWeight: 600,
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M3 12h12M3 18h6"/>
                  </svg>
                  {(SORT_OPTIONS.find(o => o.key === sortKey)?.label || "Sort").split(":")[0].replace("Biggest ", "").replace("Newest ", "New")}
                </button>
              )}
              <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
                <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#6b7280", fontSize: "14px", pointerEvents: "none" }}>⌕</span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  style={{
                    width: "100%", height: "34px", padding: "0 12px 0 32px",
                    borderRadius: "8px", border: "1px solid #d5cdbf",
                    background: "#ffffff", color: "#2c3227",
                    fontFamily: "'DM Sans',sans-serif", fontSize: "13px", outline: "none",
                  }}
                />
              </div>
            </div>
            {/* Mobile Row 2: Count + Clear | View toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>
                  {displayResults.length} shoe{displayResults.length !== 1 ? "s" : ""}
                </span>
                {(ac > 0 || query) && (
                  <button
                    onClick={() => { setFilters({}); setQuery(""); }}
                    style={{
                      padding: "2px 8px", borderRadius: "10px", border: "1px solid #354840",
                      background: "transparent", color: "#8a8373", fontSize: "10px",
                      cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: "2px", background: "#ffffff", borderRadius: "6px", padding: "2px" }}>
                {[
                  { key: "cards", icon: "▦" },
                  { key: "chart", icon: "⊙" },
                ].map(v => (
                  <button key={v.key} onClick={() => { setView(v.key); setSearchParams(v.key === "chart" ? { view: "chart" } : {}); }} style={{
                    padding: "4px 8px", borderRadius: "4px", border: "none", cursor: "pointer",
                    background: view === v.key ? "rgba(201,138,66,0.15)" : "transparent",
                    color: view === v.key ? "#c98a42" : "#6b7280",
                    fontSize: "12px", fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                  }}>
                    {v.icon}
                  </button>
                ))}
              </div>
              <button
                onClick={() => navigate("/find")}
                title="Guided search — answer 6 questions, get matched"
                style={{
                  height: "28px", padding: "0 8px", borderRadius: "6px", border: "1px solid #c98a42",
                  background: "rgba(201,138,66,0.10)", color: "#c98a42", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px",
                  fontFamily: "'DM Sans',sans-serif", fontSize: "11px", fontWeight: 600,
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>
                  <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
                </svg>
                Guided
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1, maxWidth: "400px", position: "relative" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#6b7280", fontSize: "14px", pointerEvents: "none" }}>⌕</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search shoes…"
                style={{
                  width: "100%", padding: "8px 16px 8px 36px",
                  borderRadius: "8px", border: "1px solid #1e2028",
                  background: "#151820", color: "#2c3227",
                  fontFamily: "'DM Sans',sans-serif", fontSize: "13px", outline: "none",
                }}
              />
            </div>
            {/* View toggle */}
            <div style={{ display: "flex", gap: "2px", background: "#ffffff", borderRadius: "6px", padding: "2px" }}>
              {[
                { key: "cards", icon: "▦", label: "Cards" },
                { key: "chart", icon: "⊙", label: "Chart" },
              ].map(v => (
                <button key={v.key} onClick={() => { setView(v.key); setSearchParams(v.key === "chart" ? { view: "chart" } : {}); }} style={{
                  padding: "4px 10px", borderRadius: "4px", border: "none", cursor: "pointer",
                  background: view === v.key ? "rgba(201,138,66,0.15)" : "transparent",
                  color: view === v.key ? "#c98a42" : "#6b7280",
                  fontSize: "11px", fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                  display: "flex", alignItems: "center", gap: "4px",
                }}>
                  <span style={{ fontSize: "13px" }}>{v.icon}</span>
                  {v.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => navigate("/find")}
              title="Guided search — answer 6 questions, get matched"
              style={{
                height: "32px", padding: "0 12px", borderRadius: "8px", border: "1px solid #c98a42",
                background: "rgba(201,138,66,0.10)", color: "#c98a42", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "5px",
                fontFamily: "'DM Sans',sans-serif", fontSize: "12px", fontWeight: 600,
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>
                <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
              </svg>
              Guided search
            </button>

            <span style={{ fontSize: "13px", color: "#6b7280", whiteSpace: "nowrap" }}>
              {displayResults.length} shoe{displayResults.length !== 1 ? "s" : ""}
              {ac > 0 && ` · ${ac} filter${ac > 1 ? "s" : ""}`}
            </span>
            {(ac > 0 || query) && (
              <button
                onClick={() => { setFilters({}); setQuery(""); }}
                style={{
                  padding: "6px 16px", borderRadius: "20px", border: "1px solid #354840",
                  background: "transparent", color: "#8a8373", fontSize: "12px",
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
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
          position: "fixed", inset: 0, zIndex: 200, background: "#13151a",
          overflowY: "auto", padding: "0 0 80px",
        }}>
          <div style={{
            padding: "16px", borderBottom: "1px solid #1e2028",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            position: "sticky", top: 0, background: "rgba(19,21,26,.95)", backdropFilter: "blur(12px)", zIndex: 1,
          }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "#2c3227" }}>Filters</span>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              {ac > 0 && (
                <button onClick={() => setFilters({})} style={{
                  padding: "6px 14px", borderRadius: "16px", border: "1px solid #354840",
                  background: "transparent", color: "#8a8373", fontSize: "12px", cursor: "pointer",
                }}>Clear all</button>
              )}
              <button onClick={() => setShowMobileFilters(false)} style={{
                padding: "8px 18px", borderRadius: "20px", border: "none",
                background: "#c98a42", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer",
              }}>Show {displayResults.length} shoes</button>
            </div>
          </div>
          {GROUPS.map((g) => (
            <div key={g.id} style={{ borderBottom: "1px solid #1e2028" }}>
              <button
                onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}
                style={{
                  width: "100%", padding: "14px 20px", display: "flex", alignItems: "center",
                  justifyContent: "space-between", background: "transparent", border: "none",
                  color: "#2c3227", cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "16px" }}>{g.icon}</span>
                  <span style={{ fontSize: "14px", fontWeight: 600 }}>{g.label}</span>
                  {g.filters.some(f => filters[f.key] != null && (!Array.isArray(filters[f.key]) || filters[f.key].length > 0)) && (
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#c98a42" }} />
                  )}
                </span>
                <span style={{ color: "#6b7280", fontSize: "18px", transition: "transform .2s", transform: openGroup === g.id ? "rotate(180deg)" : "rotate(0)" }}>‹</span>
              </button>
              {openGroup === g.id && (
                <div style={{ padding: "0 20px 16px" }}>
                  {g.filters.map((f) => (
                    <div key={f.key} style={{ marginBottom: "16px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#8a8373", letterSpacing: "0.5px", marginBottom: "8px", textTransform: "uppercase" }}>{f.label}</div>
                      {f.type === "single" && <Single options={f.options} value={filters[f.key] ?? null} onChange={(v) => set(f.key, v)} />}
                      {f.type === "multi" && <Multi options={f.options} value={filters[f.key] ?? []} onChange={(v) => set(f.key, v)} />}
                      {f.type === "range" && <Range min={f.min} max={f.max} step={f.step || 1} value={filters[f.key]} onChange={(v) => set(f.key, v)} unit={f.key.includes("price") ? "€" : ""} />}
                      {f.type === "bool" && <Bool label={f.label} value={filters[f.key] ?? null} onChange={(v) => set(f.key, v)} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
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
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "#354840", margin: "0 auto 12px" }} />
            <div style={{ padding: "0 20px 8px", fontSize: "13px", fontWeight: 700, color: "#2c3227" }}>Sort by</div>
            {SORT_OPTIONS.map(o => (
              <button
                key={o.key}
                onClick={() => { setSortKey(o.key); setShowMobileSort(false); }}
                style={{
                  width: "100%", padding: "14px 20px", background: "none", border: "none",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                  color: sortKey === o.key ? "#c98a42" : "#d1d5db", fontSize: "14px", fontWeight: sortKey === o.key ? 700 : 400,
                }}
              >
                {o.label}
                {sortKey === o.key && <span style={{ color: "#c98a42", fontSize: "16px" }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", minHeight: "calc(100vh - 65px)" }}>
        {/* Sidebar — desktop only, hidden in chart view */}
        {!isMobile && view !== "chart" && <aside
          style={{
            width: "320px",
            minWidth: "320px",
            borderRight: "1px solid #1e2028",
            padding: "20px 0",
            overflowY: "auto",
            height: "calc(100vh - 65px)",
            position: "sticky",
            top: "65px",
          }}
        >
          <div
            style={{
              padding: "0 20px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#6b7280",
                letterSpacing: "2px",
                textTransform: "uppercase",
              }}
            >
              Find Your Shoe
            </span>
            {ac > 0 && (
              <button
                onClick={() => setFilters({})}
                style={{
                  padding: "4px 12px",
                  borderRadius: "12px",
                  border: "1px solid #354840",
                  background: "transparent",
                  color: "#8a8373",
                  fontSize: "11px",
                  cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                  transition: "all .2s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "#c98a42";
                  e.currentTarget.style.color = "#c98a42";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "#354840";
                  e.currentTarget.style.color = "#8a8373";
                }}
              >
                Clear all
              </button>
            )}
          </div>

          {GROUPS.map((g) => (
            <div key={g.id} style={{ borderBottom: "1px solid #1e2028" }}>
              <button
                onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "transparent",
                  border: "none",
                  color: "#2c3227",
                  cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "16px" }}>{g.icon}</span>
                  <span style={{ fontSize: "14px", fontWeight: 600 }}>{g.label}</span>
                  {g.filters.some(
                    (f) =>
                      filters[f.key] != null &&
                      (!Array.isArray(filters[f.key]) || filters[f.key].length > 0)
                  ) && (
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#c98a42",
                      }}
                    />
                  )}
                </span>
                <span
                  style={{
                    color: "#6b7280",
                    fontSize: "18px",
                    transition: "transform .2s",
                    transform: openGroup === g.id ? "rotate(180deg)" : "rotate(0)",
                  }}
                >
                  ‹
                </span>
              </button>
              {openGroup === g.id && (
                <div style={{ padding: "0 20px 16px" }}>
                  {g.filters.map((f) => (
                    <div key={f.key} style={{ marginBottom: "16px" }}>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#8a8373",
                          letterSpacing: "0.5px",
                          marginBottom: "8px",
                          textTransform: "uppercase",
                        }}
                      >
                        {f.label}
                      </div>
                      {f.type === "single" && (
                        <Single
                          options={f.options}
                          value={filters[f.key] ?? null}
                          onChange={(v) => set(f.key, v)}
                        />
                      )}
                      {f.type === "multi" && (
                        <Multi
                          options={f.options}
                          value={filters[f.key] ?? []}
                          onChange={(v) => set(f.key, v)}
                        />
                      )}
                      {f.type === "range" && (
                        <Range
                          min={f.min}
                          max={f.max}
                          step={f.step || 1}
                          value={filters[f.key]}
                          onChange={(v) => set(f.key, v)}
                          unit={f.key.includes("price") ? "€" : ""}
                        />
                      )}
                      {f.type === "bool" && (
                        <Bool
                          label={f.label}
                          value={filters[f.key] ?? null}
                          onChange={(v) => set(f.key, v)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div style={{ padding: "20px", marginTop: "8px" }}>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#6b7280",
                letterSpacing: "1px",
                marginBottom: "12px",
                textTransform: "uppercase",
              }}
            >
              Match Score
            </div>
            {[
              { c: "#22c55e", l: "80–100%", d: "Great fit" },
              { c: "#c98a42", l: "50–79%", d: "Partial" },
              { c: "#ef4444", l: "0–49%", d: "Weak" },
            ].map((x) => (
              <div
                key={x.l}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "6px",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: x.c,
                  }}
                />
                <span style={{ fontSize: "11px", color: "#8a8373" }}>
                  {x.l} – {x.d}
                </span>
              </div>
            ))}
          </div>
        </aside>}

        {/* Results */}
        <main style={{ flex: 1, padding: isMobile ? "16px 12px" : "24px 28px", overflowY: "auto" }}>
          {(ac > 0 || query) && (
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                marginBottom: "20px",
                paddingBottom: "16px",
                borderBottom: "1px solid #1e2028",
              }}
            >
              {query && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 12px",
                    borderRadius: "16px",
                    background: "rgba(96,165,250,.1)",
                    border: "1px solid rgba(96,165,250,.3)",
                    fontSize: "11px",
                    color: "#60a5fa",
                  }}
                >
                  <span style={{ color: "#8a8373" }}>search:</span> "{query}"
                  <button
                    onClick={() => setQuery("")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#60a5fa",
                      cursor: "pointer",
                      fontSize: "14px",
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </span>
              )}
              {Object.entries(filters).map(([k, v]) => {
                const d = Array.isArray(v)
                  ? v.join(", ")
                  : typeof v === "object"
                    ? `${v.min ?? ""}–${v.max ?? ""}`
                    : typeof v === "boolean"
                      ? "Yes"
                      : v;
                return (
                  <span
                    key={k}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 12px",
                      borderRadius: "16px",
                      background: "rgba(201,138,66,.1)",
                      border: "1px solid rgba(201,138,66,.3)",
                      fontSize: "11px",
                      color: "#c98a42",
                    }}
                  >
                    <span style={{ color: "#8a8373" }}>{k.replace(/_/g, " ")}:</span>{" "}
                    <span style={{ textTransform: "capitalize" }}>
                      {String(d).replace(/_/g, " ")}
                    </span>
                    <button
                      onClick={() => set(k, null)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#c98a42",
                        cursor: "pointer",
                        fontSize: "14px",
                        padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Sort controls — desktop only (mobile sort is in header) */}
          {view === "cards" && !isMobile && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "16px" }}>
            <SortDropdown value={sortKey} onChange={setSortKey} />
          </div>
          )}

          {view === "chart" ? (
            <>
              <ScoringDisclaimer category="shoes" />
              <ShoeScatterChart shoes={shoes} isMobile={isMobile} />
            </>
          ) : (
            <>
              <ScoringDisclaimer category="shoes" />

              <div
                key={`grid-${shoes.length}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "repeat(auto-fill, minmax(160px, 1fr))" : "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: isMobile ? "10px" : "20px",
                }}
              >
                {displayResults.map((shoe, i) => (
                  <div
                    key={shoe.shoe_data?.slug || i}
                    style={{
                      animation: `fadeUp .4s ease ${Math.min(i * 40, 600)}ms both`,
                      position: "relative",
                    }}
                  >
                    <Card
                      shoe={shoe}
                      onClick={() => { navigate(`/shoe/${shoe.shoe_data.slug}`); window.scrollTo(0, 0); }}
                      priceData={priceData}
                      compact={isMobile}
                    />
                  </div>
                ))}
              </div>

              {!displayResults.length && (
                <div style={{ textAlign: "center", padding: "80px 0", color: "#6b7280" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>🧗</div>
                  <div style={{ fontSize: "16px", marginBottom: "8px" }}>
                    No shoes match{query ? ` "${query}"` : ""}
                  </div>
                  <div style={{ fontSize: "13px" }}>
                    Try {query ? "a different search term or " : ""}adjusting your filters
                  </div>
                </div>
              )}
            </>
          )}
        </main>

      </div>

      {/* Legal disclaimer */}
      <div style={{ padding: isMobile ? "20px 16px" : "24px 32px", borderTop: "1px solid #d5cdbf", background: "#f5f0e8" }}>
        <p style={{ fontSize: "11px", color: "#717889", lineHeight: 1.7, fontFamily: "'DM Sans',sans-serif", margin: 0, maxWidth: "800px" }}>
          <strong style={{ color: "#717889", fontWeight: 600 }}>Disclaimer:</strong>{" "}
          Prices, availability, and product data are provided for informational purposes only and may change without notice.
          This site contains affiliate links {"\u2014"} if you purchase through these links, we may earn a commission at no extra cost to you.
          Always verify pricing and details with the retailer before purchasing.
        </p>
      </div>

      {/* Footer */}
      <footer style={{
        padding: isMobile ? "16px" : "24px 32px", borderTop: "1px solid #d5cdbf",
        display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "8px" : 0,
        justifyContent: "space-between", alignItems: isMobile ? "center" : "center",
        fontSize: "12px", color: "#717889", fontFamily: "'DM Sans',sans-serif",
      }}>
        <span>&copy; {new Date().getFullYear()} climbing-gear.com</span>
        <div style={{ display: "flex", gap: "20px" }}>
          <Link to="/about" style={{ color: "#717889", textDecoration: "none" }}>About</Link>
          <Link to="/impressum" style={{ color: "#717889", textDecoration: "none" }}>Impressum</Link>
          <Link to="/privacy" style={{ color: "#717889", textDecoration: "none" }}>Datenschutz</Link>
        </div>
      </footer>
    </div>
  );
}
