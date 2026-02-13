// ══════════════════════════════════════════════════════════
// COMPARE PAGE — Side-by-side shoe comparison table
// ══════════════════════════════════════════════════════════
//
// Route: /compare?shoes=scarpa-drago,la-sportiva-solution
// Max 4 shoes. URL-shareable.
//
// Features:
//   - Side-by-side specs table with winner highlighting
//   - Mini radar chart per shoe
//   - Radar overlay toggle (all on one chart)
//   - "Add shoe" slot if < 10 selected
//   - Responsive: horizontal scroll on mobile
// ══════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { T } from "./tokens.js";

// ── Radar chart as inline SVG ──
const RADAR_AXES = [
  { key: "precision", label: "Precision" },
  { key: "comfort",   label: "Comfort" },
  { key: "edging",    label: "Edging" },
  { key: "smearing",  label: "Smearing" },
  { key: "crack",     label: "Crack" },
  { key: "durability", label: "Durability" },
];

// Derive a 0-1 score for each radar axis from shoe attributes
function shoeToRadarScores(shoe) {
  const downMap = { aggressive: 1, moderate: 0.6, slight: 0.35, flat: 0.15 };
  const feelMap = { stiff: 0.2, moderate: 0.5, "moderately stiff": 0.4, "moderately soft": 0.65, soft: 0.85 };
  const asymMap = { strong: 1, moderate: 0.6, slight: 0.3, neutral: 0.1 };

  const downScore = downMap[(shoe.downturn || "").toLowerCase()] || 0.5;
  const feelScore = feelMap[(shoe.feel || "").toLowerCase()] || 0.5;
  const asymScore = asymMap[(shoe.asymmetry || "").toLowerCase()] || 0.5;

  // Rubber thickness → durability signal
  const thickness = shoe.rubber_thickness_mm || 4;
  const durScore = Math.min(1, thickness / 5);

  return {
    precision: Math.min(1, (downScore * 0.5 + asymScore * 0.5)),
    comfort:   Math.min(1, (1 - downScore) * 0.5 + (1 - asymScore) * 0.3 + feelScore * 0.2),
    edging:    Math.min(1, (1 - feelScore) * 0.4 + asymScore * 0.3 + downScore * 0.3),
    smearing:  Math.min(1, feelScore * 0.6 + (1 - asymScore) * 0.2 + 0.2),
    crack:     Math.min(1, (1 - downScore) * 0.4 + (1 - asymScore) * 0.3 + (shoe.closure === "lace" ? 0.3 : 0.15)),
    durability: Math.min(1, durScore * 0.6 + (1 - feelScore) * 0.4),
  };
}

function RadarSVG({ scores, color = T.accent, size = 120, showLabels = true }) {
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const n = RADAR_AXES.length;
  const labelR = size * 0.48;

  const pointsForScores = (s) =>
    RADAR_AXES.map((ax, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const val = s[ax.key] || 0;
      return [cx + Math.cos(angle) * r * val, cy + Math.sin(angle) * r * val];
    });

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid */}
      {gridLevels.map((lv) => (
        <polygon
          key={lv}
          points={RADAR_AXES.map((_, i) => {
            const a = (Math.PI * 2 * i) / n - Math.PI / 2;
            return `${cx + Math.cos(a) * r * lv},${cy + Math.sin(a) * r * lv}`;
          }).join(" ")}
          fill="none"
          stroke={T.border}
          strokeWidth="0.5"
        />
      ))}
      {/* Axes */}
      {RADAR_AXES.map((_, i) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={cx + Math.cos(a) * r}
            y2={cy + Math.sin(a) * r}
            stroke={T.border}
            strokeWidth="0.5"
          />
        );
      })}
      {/* Data polygon */}
      <polygon
        points={pointsForScores(scores).map(([x, y]) => `${x},${y}`).join(" ")}
        fill={color}
        fillOpacity="0.15"
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Data dots */}
      {pointsForScores(scores).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill={color} />
      ))}
      {/* Labels */}
      {showLabels && RADAR_AXES.map((ax, i) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        const lx = cx + Math.cos(a) * labelR;
        const ly = cy + Math.sin(a) * labelR;
        return (
          <text
            key={ax.key}
            x={lx} y={ly}
            textAnchor="middle"
            dominantBaseline="central"
            fill={T.muted}
            fontSize="7"
            fontWeight="600"
            fontFamily={T.font}
          >
            {ax.label}
          </text>
        );
      })}
    </svg>
  );
}

// ── Overlay: all shoes on one radar ──
const SHOE_COLORS = ["#E8734A", "#4A9CE8", "#4AE89C", "#E8D44A"];

function RadarOverlaySVG({ shoesList, size = 260 }) {
  const cx = size / 2, cy = size / 2, r = size * 0.35;
  const n = RADAR_AXES.length;
  const labelR = size * 0.45;
  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid */}
      {gridLevels.map((lv) => (
        <polygon
          key={lv}
          points={RADAR_AXES.map((_, i) => {
            const a = (Math.PI * 2 * i) / n - Math.PI / 2;
            return `${cx + Math.cos(a) * r * lv},${cy + Math.sin(a) * r * lv}`;
          }).join(" ")}
          fill="none" stroke={T.border} strokeWidth="0.5"
        />
      ))}
      {/* Axes */}
      {RADAR_AXES.map((_, i) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke={T.border} strokeWidth="0.5" />;
      })}
      {/* Data polygons */}
      {shoesList.map(({ scores }, idx) => {
        const pts = RADAR_AXES.map((ax, i) => {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          const val = scores[ax.key] || 0;
          return `${cx + Math.cos(a) * r * val},${cy + Math.sin(a) * r * val}`;
        }).join(" ");
        const c = SHOE_COLORS[idx % SHOE_COLORS.length];
        return (
          <polygon key={idx} points={pts} fill={c} fillOpacity="0.1" stroke={c} strokeWidth="1.5" />
        );
      })}
      {/* Labels */}
      {RADAR_AXES.map((ax, i) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        return (
          <text key={ax.key} x={cx + Math.cos(a) * labelR} y={cy + Math.sin(a) * labelR}
            textAnchor="middle" dominantBaseline="central" fill={T.muted} fontSize="9" fontWeight="600" fontFamily={T.font}>
            {ax.label}
          </text>
        );
      })}
    </svg>
  );
}

// ── Spec row helpers ──
const fmtPrice = (v) => v ? `\u20AC${Number(v) % 1 === 0 ? Number(v) : Number(v).toFixed(2)}` : "\u2014";
const fmtPct = (shoe) => {
  if (!shoe.price_uvp_eur || !shoe.current_price_eur) return "\u2014";
  const pct = ((shoe.price_uvp_eur - shoe.current_price_eur) / shoe.price_uvp_eur * 100);
  return pct > 0 ? `-${pct.toFixed(0)}%` : "\u2014";
};
const fmtWeight = (v) => v ? `${v}g` : "\u2014";
const fmtMm = (v) => v ? `${v}mm` : "\u2014";
const cap = (s) => {
  if (!s) return "\u2014";
  if (Array.isArray(s)) return s.map(v => cap(v)).join(", ");
  const str = String(s);
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// Winner logic: for a given row, which shoe index has the "best" value?
function findWinner(shoes, getter, mode = "min") {
  const vals = shoes.map((s) => getter(s));
  const numVals = vals.map((v) => (typeof v === "number" && !isNaN(v) ? v : null));
  if (numVals.every((v) => v === null)) return -1;
  const filtered = numVals.filter((v) => v !== null);
  if (filtered.length < 2) return -1;
  const target = mode === "min" ? Math.min(...filtered) : Math.max(...filtered);
  return numVals.indexOf(target);
}

// ── Spec sections definition ──
function getSpecSections(shoes) {
  return [
    {
      title: "PERFORMANCE",
      rows: [
        { label: "Downturn",  values: shoes.map((s) => cap(s.downturn)) },
        { label: "Asymmetry", values: shoes.map((s) => cap(s.asymmetry)) },
        { label: "Closure",   values: shoes.map((s) => cap(s.closure)) },
        { label: "Feel",      values: shoes.map((s) => cap(s.feel)) },
        {
          label: "Weight",
          values: shoes.map((s) => fmtWeight(s.weight_g)),
          winnerIdx: findWinner(shoes, (s) => s.weight_g || Infinity, "min"),
        },
      ],
    },
    {
      title: "RUBBER",
      rows: [
        { label: "Compound",  values: shoes.map((s) => s.rubber_compound || "\u2014") },
        {
          label: "Thickness",
          values: shoes.map((s) => fmtMm(s.rubber_thickness_mm)),
          winnerIdx: findWinner(shoes, (s) => s.rubber_thickness_mm || 0, "max"),
        },
        { label: "Hardness",  values: shoes.map((s) => cap(s.rubber_hardness)) },
      ],
    },
    {
      title: "FIT",
      rows: [
        { label: "Toe form",  values: shoes.map((s) => cap(s.toe_form)) },
        { label: "Width",     values: shoes.map((s) => cap(s.width)) },
        { label: "Volume",    values: shoes.map((s) => cap(s.volume)) },
        { label: "Stretch",   values: shoes.map((s) => s.stretch_expectation || "\u2014") },
      ],
    },
    {
      title: "PRICE",
      rows: [
        { label: "Current", values: shoes.map((s) => fmtPrice(s.current_price_eur)),
          winnerIdx: findWinner(shoes, (s) => s.current_price_eur || Infinity, "min") },
        { label: "MSRP",    values: shoes.map((s) => fmtPrice(s.price_uvp_eur)) },
        { label: "Discount", values: shoes.map((s) => fmtPct(s)),
          winnerIdx: findWinner(shoes, (s) => {
            if (!s.price_uvp_eur || !s.current_price_eur) return 0;
            return (s.price_uvp_eur - s.current_price_eur) / s.price_uvp_eur;
          }, "max") },
      ],
    },
  ];
}

// ═══ STYLES ═══
const S = {
  page: { minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text },
  header: {
    padding: "20px 32px", borderBottom: `1px solid ${T.border}`,
    background: T.bg,
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  back: { display: "inline-flex", alignItems: "center", gap: "8px", color: T.text, textDecoration: "none", fontWeight: 600, fontSize: "14px" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    padding: "16px 14px", textAlign: "center", verticalAlign: "top",
    borderBottom: `1px solid ${T.border}`, minWidth: "160px",
  },
  sectionHeader: {
    padding: "10px 14px", fontSize: "10px", fontWeight: 700,
    letterSpacing: "1px", textTransform: "uppercase", color: T.muted,
    background: "rgba(37,42,53,0.3)", borderBottom: `1px solid ${T.border}`,
  },
  td: {
    padding: "10px 14px", textAlign: "center", fontSize: "13px",
    borderBottom: `1px solid rgba(37,42,53,0.5)`, color: T.text,
  },
  label: {
    padding: "10px 14px", textAlign: "left", fontSize: "12px",
    fontWeight: 600, color: T.muted, borderBottom: `1px solid rgba(37,42,53,0.5)`,
    whiteSpace: "nowrap", width: "100px",
  },
  winner: { color: T.accent, fontWeight: 700 },
};

// ═══ MAIN COMPONENT ═══
export default function Compare({ shoes = [] }) {
  const [searchParams] = useSearchParams();
  const [showOverlay, setShowOverlay] = useState(false);

  const slugs = (searchParams.get("shoes") || "").split(",").filter(Boolean);
  const selectedShoes = slugs
    .map((slug) => shoes.find((s) => s.slug === slug))
    .filter(Boolean);

  if (selectedShoes.length < 2) {
    return (
      <div style={S.page}>
        <header style={S.header}>
          <Link to="/shoes" style={S.back}>{"\u2190"} Search</Link>
        </header>
        <div style={{ padding: "80px 32px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>{"\u2696\uFE0F"}</div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
            Select at least 2 shoes to compare
          </h2>
          <p style={{ fontSize: "14px", color: T.muted, marginBottom: "24px" }}>
            Use the compare checkbox on shoe cards to select shoes, then come back here.
          </p>
          <Link to="/shoes" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>
            {"\u2190"} Browse shoes
          </Link>
        </div>
      </div>
    );
  }

  const specSections = getSpecSections(selectedShoes);
  const radarData = selectedShoes.map((s, i) => ({
    shoe: s,
    scores: shoeToRadarScores(s),
    color: SHOE_COLORS[i % SHOE_COLORS.length],
  }));

  return (
    <div style={S.page}>
      {/* Header */}
      <header style={S.header}>
        <Link to="/shoes" style={S.back}>{"\u2190"} Search</Link>
        <span style={{ fontSize: "13px", fontWeight: 600, color: T.muted }}>
          Compare ({selectedShoes.length} shoes)
        </span>
      </header>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 20px 80px" }}>

        {/* Radar overlay toggle */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
          <button
            onClick={() => setShowOverlay(!showOverlay)}
            style={{
              background: showOverlay ? T.accentSoft || "rgba(232,115,74,0.12)" : "transparent",
              border: `1px solid ${showOverlay ? T.accent : T.border}`,
              borderRadius: "8px", padding: "7px 14px", cursor: "pointer",
              color: showOverlay ? T.accent : T.muted, fontSize: "12px",
              fontWeight: 600, fontFamily: T.font,
            }}
          >
            {showOverlay ? "Hide" : "Show"} radar overlay
          </button>
        </div>

        {/* Radar overlay chart */}
        {showOverlay && (
          <div style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: "14px",
            padding: "24px", marginBottom: "24px", textAlign: "center",
          }}>
            <RadarOverlaySVG shoesList={radarData} size={280} />
            {/* Legend */}
            <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "12px", flexWrap: "wrap" }}>
              {radarData.map(({ shoe, color }) => (
                <div key={shoe.slug} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: "11px", fontWeight: 600, color: T.text }}>
                    {shoe.brand} {shoe.model}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main comparison table */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: "14px",
          overflow: "auto",
        }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: "100px" }} />
                {selectedShoes.map((shoe, idx) => (
                  <th key={shoe.slug} style={S.th}>
                    {shoe.image_url && (
                      <img
                        src={shoe.image_url}
                        alt={shoe.model}
                        style={{ width: "80px", height: "60px", objectFit: "contain", marginBottom: "8px",
                          background: "#f5f5f5", borderRadius: "8px", padding: "4px" }}
                      />
                    )}
                    <div style={{ fontSize: "11px", fontWeight: 600, color: T.muted, marginBottom: "2px" }}>
                      {shoe.brand}
                    </div>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: T.text, marginBottom: "6px" }}>
                      {shoe.model}
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: T.accent, fontFamily: T.mono || "monospace" }}>
                      {fmtPrice(shoe.current_price_eur)}
                    </div>
                    {/* Individual radar */}
                    <div style={{ marginTop: "12px", display: "flex", justifyContent: "center" }}>
                      <RadarSVG
                        scores={radarData[idx].scores}
                        color={SHOE_COLORS[idx % SHOE_COLORS.length]}
                        size={110}
                        showLabels={false}
                      />
                    </div>
                  </th>
                ))}
                {selectedShoes.length < 10 && (
                  <th style={{ ...S.th, minWidth: "120px" }}>
                    <Link to="/shoes" style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
                      color: T.muted, textDecoration: "none", padding: "20px 0",
                    }}>
                      <div style={{
                        width: "48px", height: "48px", borderRadius: "50%",
                        border: `2px dashed ${T.border}`, display: "flex",
                        alignItems: "center", justifyContent: "center", fontSize: "20px",
                      }}>
                        +
                      </div>
                      <span style={{ fontSize: "11px", fontWeight: 600 }}>Add shoe</span>
                    </Link>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {specSections.map((section) => (
                <>
                  {/* Section header */}
                  <tr key={`sec-${section.title}`}>
                    <td colSpan={selectedShoes.length + 1 + (selectedShoes.length < 10 ? 1 : 0)} style={S.sectionHeader}>
                      {section.title}
                    </td>
                  </tr>
                  {/* Rows */}
                  {section.rows.map((row) => (
                    <tr key={row.label}>
                      <td style={S.label}>{row.label}</td>
                      {row.values.map((val, idx) => (
                        <td
                          key={idx}
                          style={{
                            ...S.td,
                            ...(row.winnerIdx === idx ? S.winner : {}),
                          }}
                        >
                          {val}
                          {row.winnerIdx === idx && (
                            <span style={{ marginLeft: "4px", fontSize: "10px" }}>{"\u2605"}</span>
                          )}
                        </td>
                      ))}
                      {selectedShoes.length < 10 && <td style={S.td} />}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Share URL hint */}
        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <p style={{ fontSize: "12px", color: T.muted }}>
            {"\uD83D\uDD17"} This comparison is URL-shareable. Copy the address bar to share it with friends.
          </p>
        </div>
      </div>
    </div>
  );
}
