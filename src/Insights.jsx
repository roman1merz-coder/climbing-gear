import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import ROPE_SEED from "./rope_seed_data.json";

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return m;
}

/* ═══════════════════════════════════════════════════════════════
   DATA — embedded from seed file analysis of 333 shoes,
   141 ropes (106 single), 19 belay devices.
   Crashpad data from curated analysis (DB table pending).
   ═══════════════════════════════════════════════════════════════ */
// Article 1+6: Crashpad scatter data (name, area m², €/m², foam layers, fold style, price, weight)
const PAD_SCATTER = [
  {n:"Petzl Alto",a:1.18,e:211,f:3,s:"taco",p:249,w:6.2},{n:"BD Mondo",a:1.85,e:206,f:2,s:"hinge",p:380,w:9.3},
  {n:"Ocun Dominator FTS",a:1.54,e:194,f:3,s:"hinge",p:298,w:7.8},{n:"Metolius Session II",a:1.11,e:162,f:2,s:"hinge",p:180,w:4.1},
  {n:"Organic Full Pad",a:1.11,e:252,f:3,s:"hybrid",p:280,w:5.0},{n:"Moon Saturn",a:1.92,e:189,f:3,s:"taco",p:362,w:9.0},
  {n:"Mad Rock R3",a:1.06,e:211,f:7,s:"baffled",p:225,w:5.4},{n:"Snap Guts",a:1.2,e:196,f:3,s:"taco",p:235,w:5.8},
  {n:"Petzl Cirro",a:1.75,e:223,f:3,s:"taco",p:389,w:8.4},{n:"Metolius Shortstop",a:0.53,e:85,f:2,s:"hinge",p:45,w:1.5},
  {n:"Mammut Crashiano",a:1.2,e:200,f:2,s:"hinge",p:240,w:5.5},{n:"Asana VersaPad",a:2.11,e:67,f:1,s:"hinge",p:140,w:2.3},
  {n:"Snap Air Shock",a:1.8,e:178,f:0,s:"inflatable",p:320,w:4.0},{n:"Moon Warrior",a:1.3,e:222,f:3,s:"taco",p:289,w:6.3},
  {n:"BD Impact",a:1.21,e:215,f:2,s:"hinge",p:260,w:5.9},{n:"BD Circuit",a:1.68,e:202,f:2,s:"hinge",p:339,w:8.3},
  {n:"BD Drop Zone",a:1.03,e:175,f:2,s:"hinge",p:180,w:4.5},{n:"Metolius Recon",a:1.11,e:198,f:3,s:"hinge",p:220,w:4.9},
  {n:"Metolius Magnum",a:1.63,e:172,f:3,s:"hinge",p:280,w:6.8},{n:"Organic Simple",a:0.81,e:258,f:3,s:"taco",p:210,w:3.2},
  {n:"Organic Big Pad",a:1.63,e:240,f:3,s:"taco",p:390,w:8.0},{n:"Mad Rock Mad Pad",a:1.04,e:169,f:3,s:"hinge",p:175,w:4.5},
  {n:"Mad Rock Duo",a:1.5,e:199,f:5,s:"hinge",p:299,w:7.5},{n:"Petzl Nimbo",a:0.8,e:249,f:3,s:"taco",p:199,w:3.5},
  {n:"Mammut Slam",a:1.5,e:207,f:2,s:"hinge",p:310,w:6.9},{n:"Edelrid Mantle III",a:1.25,e:204,f:3,s:"hinge",p:255,w:5.9},
  {n:"Edelrid Crux III",a:1.6,e:200,f:3,s:"hinge",p:320,w:7.5},{n:"Edelrid Sit Start",a:0.44,e:118,f:2,s:"hinge",p:52,w:1.1},
  {n:"Beal Air Light",a:1.3,e:169,f:2,s:"taco",p:219,w:4.2},{n:"Beal Double Air",a:1.65,e:181,f:3,s:"taco",p:299,w:6.1},
  {n:"Flashed Rambler",a:1.16,e:54,f:1,s:"hinge",p:62,w:2.5},{n:"Mad Rock Triplet",a:1.23,e:45,f:1,s:"hinge",p:55,w:2.8},
  {n:"Organic Blubber",a:2.23,e:62,f:1,s:"hinge",p:139,w:3.5},{n:"Snap Wrap Original",a:1.8,e:64,f:1,s:"taco",p:115,w:3.2},
  {n:"Send 4x4 Pro",a:1.49,e:335,f:4,s:"hinge",p:499,w:7.5},{n:"Send 4x4 Highball",a:1.49,e:402,f:4,s:"hinge",p:599,w:8.2},
  {n:"ZIGZAG Double",a:0.74,e:362,f:5,s:"hinge",p:269,w:3.8},{n:"ZIGZAG Triple",a:1.12,e:340,f:5,s:"hinge",p:379,w:5.5},
  {n:"BD Erratic",a:1.24,e:321,f:3,s:"hinge",p:399,w:6.5},{n:"Mammut Sender",a:1.2,e:208,f:3,s:"hinge",p:250,w:5.5},
  {n:"Kinetik Newton 4",a:1.2,e:233,f:3,s:"taco",p:279,w:5.8},{n:"Escape Zone Plus",a:1.3,e:192,f:3,s:"hinge",p:249,w:5.6},
  {n:"La Sportiva Laspo",a:1.2,e:225,f:3,s:"taco",p:270,w:5.9},{n:"La Sportiva Maipo",a:1.44,e:208,f:3,s:"taco",p:300,w:6.5},
  {n:"Kailas Inflatable",a:1.2,e:208,f:0,s:"inflatable",p:249,w:2.3},
];
// Fold style aggregation
const FOLD_DATA = [
  { style: "Hinge", n: 64, avgPrice: 219, avgArea: 1.20, avgWeight: 4.9, avgEurM2: 178 },
  { style: "Taco", n: 28, avgPrice: 271, avgArea: 1.29, avgWeight: 5.8, avgEurM2: 218 },
  { style: "Tri-fold", n: 6, avgPrice: 296, avgArea: 1.66, avgWeight: 7.0, avgEurM2: 176 },
  { style: "Hybrid", n: 2, avgPrice: 324, avgArea: 1.60, avgWeight: 6.7, avgEurM2: 214 },
  { style: "Inflatable", n: 2, avgPrice: 284, avgArea: 1.50, avgWeight: 3.2, avgEurM2: 193 },
];

// Foam layers
const FOAM_DATA = [
  { layers: 1, n: 19, avgPrice: 122, avgEurM2: 117 },
  { layers: 2, n: 26, avgPrice: 207, avgEurM2: 176 },
  { layers: 3, n: 47, avgPrice: 283, avgEurM2: 206 },
  { layers: 4, n: 5, avgPrice: 435, avgEurM2: 304 },
  { layers: 5, n: 4, avgPrice: 274, avgEurM2: 292 },
];

// Article 4: Rubber compounds
const RUBBER_DATA = [
  { compound: "Vibram XS Grip 2", n: 68, avgPrice: 133, brands: "La Sportiva, Scarpa, Tenaya, +7" },
  { compound: "Vibram XS Edge", n: 41, avgPrice: 146, brands: "La Sportiva, Scarpa, Tenaya" },
  { compound: "Science Friction 3.0", n: 18, avgPrice: 120, brands: "Mad Rock" },
  { compound: "FriXion RS", n: 17, avgPrice: 90, brands: "La Sportiva" },
  { compound: "NEO Fuse", n: 16, avgPrice: 122, brands: "Black Diamond, Butora" },
  { compound: "Unparallel RH", n: 14, avgPrice: 127, brands: "Unparallel" },
  { compound: "TRAX SAS", n: 13, avgPrice: 167, brands: "Evolv" },
  { compound: "Unparallel RS", n: 12, avgPrice: 145, brands: "Unparallel" },
  { compound: "Stealth C4", n: 9, avgPrice: 127, brands: "Five Ten" },
  { compound: "Vibram Vision", n: 8, avgPrice: 84, brands: "Scarpa" },
  { compound: "TRAX HF", n: 8, avgPrice: 104, brands: "Evolv" },
];
/* ═══════════════════════════════════════════════════════════════
   SHARED CHART COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

const FOLD_COLORS = { taco: T.accent, hinge: T.blue, tri_fold: T.green, hybrid: T.purple, inflatable: T.yellow, baffled: "#94a3b8" };
const FOAM_COLORS = { 0: T.muted, 1: "#60a5fa", 2: T.green, 3: T.accent, 4: "#ef4444", 5: T.purple, 7: T.yellow };

function ChartContainer({ title, subtitle, children, style }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "24px", ...style }}>
      {title && <div style={{ fontSize: "15px", fontWeight: 700, color: T.text, marginBottom: subtitle ? "4px" : "16px" }}>{title}</div>}
      {subtitle && <div style={{ fontSize: "12px", color: T.muted, marginBottom: "16px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color = T.accent }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "16px", textAlign: "center", flex: "1 1 120px" }}>
      <div style={{ fontSize: "11px", color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 800, color, letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: T.muted, marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}
/* ─── Scatter Plot: €/m² vs Landing Area ─── */
function PadScatterPlot({ isMobile }) {
  const [hovered, setHovered] = useState(null);
  const [colorBy, setColorBy] = useState("fold"); // "fold" | "foam"
  const W = isMobile ? 340 : 700, H = isMobile ? 280 : 380;
  const pad = { top: 30, right: 20, bottom: 45, left: 55 };
  const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;

  const xMin = 0.3, xMax = 2.4, yMin = 30, yMax = 420;
  const x = v => pad.left + ((v - xMin) / (xMax - xMin)) * cw;
  const y = v => pad.top + ch - ((v - yMin) / (yMax - yMin)) * ch;

  const getColor = d => colorBy === "fold" ? (FOLD_COLORS[d.s] || T.muted) : (FOAM_COLORS[d.f] || T.muted);

  return (
    <ChartContainer title="€/m² vs Landing Area" subtitle={`${PAD_SCATTER.length} crashpads analyzed — color by ${colorBy === "fold" ? "fold style" : "foam layers"}`}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
        {["fold", "foam"].map(k => (
          <button key={k} onClick={() => setColorBy(k)} style={{
            padding: "4px 14px", fontSize: "12px", fontWeight: 600, borderRadius: "6px", border: "none", cursor: "pointer",
            background: colorBy === k ? T.accent : T.surface, color: colorBy === k ? "#fff" : T.muted,
          }}>{k === "fold" ? "By Fold Style" : "By Foam Layers"}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {/* Grid */}
        {[100, 200, 300, 400].map(v => v >= yMin && v <= yMax && (
          <g key={v}>
            <line x1={pad.left} y1={y(v)} x2={W - pad.right} y2={y(v)} stroke={T.border} strokeDasharray="3,3" />
            <text x={pad.left - 8} y={y(v) + 4} fill={T.muted} fontSize="10" textAnchor="end">€{v}</text>
          </g>
        ))}
        {[0.5, 1.0, 1.5, 2.0].map(v => (
          <g key={v}>
            <line x1={x(v)} y1={pad.top} x2={x(v)} y2={H - pad.bottom} stroke={T.border} strokeDasharray="3,3" />
            <text x={x(v)} y={H - pad.bottom + 18} fill={T.muted} fontSize="10" textAnchor="middle">{v}m²</text>
          </g>
        ))}
        {/* Axes labels */}
        <text x={W / 2} y={H - 4} fill={T.muted} fontSize="11" textAnchor="middle" fontWeight="600">Landing Area (m²)</text>
        <text x={14} y={H / 2} fill={T.muted} fontSize="11" textAnchor="middle" fontWeight="600" transform={`rotate(-90,14,${H / 2})`}>€ / m²</text>
        {/* Sweet spot zone */}
        <rect x={x(1.0)} y={y(220)} width={x(1.7) - x(1.0)} height={y(150) - y(220)} rx="6" fill={T.green} opacity="0.08" stroke={T.green} strokeWidth="1" strokeDasharray="4,4" />
        <text x={x(1.35)} y={y(225)} fill={T.green} fontSize="9" textAnchor="middle" fontWeight="600" opacity="0.7">Sweet Spot</text>
        {/* Dots */}
        {PAD_SCATTER.map((d, i) => {
          const cx = x(Math.max(xMin, Math.min(xMax, d.a)));
          const cy = y(Math.max(yMin, Math.min(yMax, d.e)));
          return (
            <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
              <circle cx={cx} cy={cy} r={hovered === i ? 7 : 5} fill={getColor(d)} opacity={hovered === i ? 1 : 0.8} stroke={hovered === i ? "#fff" : "none"} strokeWidth="2" />
              {hovered === i && (
                <g>
                  <rect x={cx + 10} y={cy - 34} width={Math.max(d.n.length * 6.5 + 20, 140)} height="48" rx="6" fill={T.surface} stroke={T.border} />
                  <text x={cx + 18} y={cy - 18} fill={T.text} fontSize="11" fontWeight="700">{d.n}</text>
                  <text x={cx + 18} y={cy - 3} fill={T.muted} fontSize="10">€{d.e}/m² · {d.a}m² · €{d.p} · {d.w}kg</text>
                  <text x={cx + 18} y={cy + 10} fill={getColor(d)} fontSize="9" fontWeight="600">{colorBy === "fold" ? d.s : `${d.f} foam layers`}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "8px", justifyContent: "center" }}>
        {colorBy === "fold"
          ? Object.entries(FOLD_COLORS).map(([k, c]) => (
              <span key={k} style={{ fontSize: "11px", color: T.muted, display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c, display: "inline-block" }} />{k}
              </span>
            ))
          : [1,2,3,4,5].map(l => (
              <span key={l} style={{ fontSize: "11px", color: T.muted, display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: FOAM_COLORS[l], display: "inline-block" }} />{l} layer{l > 1 ? "s" : ""}
              </span>
            ))
        }
      </div>
    </ChartContainer>
  );
}
/* ─── Bar Chart: Fold Style Comparison ─── */
function FoldStyleBars({ isMobile }) {
  const W = isMobile ? 340 : 600, H = 220;
  const pad = { left: 80, right: 20, top: 20, bottom: 30 };
  const barH = 28, gap = 8;
  const maxVal = 300;

  return (
    <ChartContainer title="The Fold-Style Tax" subtitle="Average €/m² by fold style — same foam, different folding, different price">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {FOLD_DATA.map((d, i) => {
          const yPos = pad.top + i * (barH + gap);
          const barW = (d.avgEurM2 / maxVal) * (W - pad.left - pad.right);
          const color = FOLD_COLORS[d.style.toLowerCase().replace("-", "_")] || T.muted;
          return (
            <g key={d.style}>
              <text x={pad.left - 8} y={yPos + barH / 2 + 4} fill={T.text} fontSize="12" fontWeight="600" textAnchor="end">{d.style}</text>
              <rect x={pad.left} y={yPos} width={barW} height={barH} rx="4" fill={color} opacity="0.85" />
              <text x={pad.left + barW + 8} y={yPos + barH / 2 + 4} fill={T.text} fontSize="12" fontWeight="700">€{d.avgEurM2}/m²</text>
              <text x={pad.left + barW + 75} y={yPos + barH / 2 + 4} fill={T.muted} fontSize="10">n={d.n} · {d.avgArea.toFixed(2)}m² · {d.avgWeight}kg</text>
            </g>
          );
        })}
      </svg>
    </ChartContainer>
  );
}

/* ─── Bar Chart: Foam Layers vs Price ─── */
function FoamLayerChart({ isMobile }) {
  const W = isMobile ? 340 : 500, H = 220;
  const pad = { left: 50, right: 30, top: 20, bottom: 40 };
  const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;
  const barW = Math.min(60, cw / FOAM_DATA.length - 12);

  return (
    <ChartContainer title="More Foam = More Money?" subtitle="Average price & €/m² by number of foam layers">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {FOAM_DATA.map((d, i) => {
          const cx = pad.left + (i + 0.5) * (cw / FOAM_DATA.length);
          const priceH = (d.avgPrice / 450) * ch;
          const eurH = (d.avgEurM2 / 450) * ch;
          return (
            <g key={d.layers}>
              {/* Price bar */}
              <rect x={cx - barW / 2 - 2} y={pad.top + ch - priceH} width={barW / 2 - 2} height={priceH} rx="3" fill={T.blue} opacity="0.7" />
              {/* €/m² bar */}
              <rect x={cx + 2} y={pad.top + ch - eurH} width={barW / 2 - 2} height={eurH} rx="3" fill={T.accent} opacity="0.7" />
              {/* Label */}
              <text x={cx} y={H - pad.bottom + 16} fill={T.text} fontSize="12" fontWeight="700" textAnchor="middle">{d.layers}L</text>
              <text x={cx} y={H - pad.bottom + 28} fill={T.muted} fontSize="9" textAnchor="middle">n={d.n}</text>
              {/* Values on top */}
              <text x={cx - barW / 4} y={pad.top + ch - priceH - 4} fill={T.blue} fontSize="9" fontWeight="600" textAnchor="middle">€{d.avgPrice}</text>
              <text x={cx + barW / 4} y={pad.top + ch - eurH - 4} fill={T.accent} fontSize="9" fontWeight="600" textAnchor="middle">€{d.avgEurM2}</text>
            </g>
          );
        })}
        {/* Legend */}
        <circle cx={W - 120} cy={10} r="4" fill={T.blue} />
        <text x={W - 112} y={14} fill={T.muted} fontSize="10">Avg Price</text>
        <circle cx={W - 50} cy={10} r="4" fill={T.accent} />
        <text x={W - 42} y={14} fill={T.muted} fontSize="10">€/m²</text>
      </svg>
    </ChartContainer>
  );
}
/* ─── Scatter Plot Detail View (Canvas) ─── */
const SINGLES = ROPE_SEED.filter(r => r.rope_type === "single" && r.diameter_mm && r.uiaa_falls && r.weight_per_meter_g)
  .map(r => ({ brand: r.brand, model: r.model, slug: r.slug, dia: r.diameter_mm, falls: r.uiaa_falls, gm: r.weight_per_meter_g, impact: r.impact_force_kn, dry: r.dry_treatment || "none", triple: !!r.triple_rated, sheath: r.sheath_percentage }));
const HALVES = ROPE_SEED.filter(r => r.rope_type === "half" && r.diameter_mm && r.weight_per_meter_g)
  .map(r => ({ brand: r.brand, model: r.model, slug: r.slug, dia: r.diameter_mm, falls: r.uiaa_falls, gm: r.weight_per_meter_g }));

// Polynomial curve data (pre-computed)
const CX=[7.5,7.6,7.7,7.8,7.9,8.0,8.1,8.2,8.3,8.4,8.5,8.6,8.7,8.8,8.9,9.0,9.1,9.2,9.3,9.4,9.5,9.6,9.7,9.8,9.9,10.0,10.1,10.2,10.3,10.4,10.5,10.6,10.7,10.8,10.9,11.0,11.1,11.2,11.3,11.4];
const CF=[2.585,2.949,3.288,3.601,3.892,4.163,4.415,4.651,4.872,5.082,5.281,5.472,5.657,5.838,6.018,6.197,6.379,6.565,6.757,6.958,7.169,7.393,7.631,7.886,8.16,8.454,8.771,9.114,9.483,9.881,10.311,10.773,11.271,11.806,12.38,12.996,13.655,14.36,15.113,15.915];
const CG=[41.154,41.905,42.67,43.449,44.243,45.05,45.872,46.707,47.557,48.421,49.3,50.192,51.098,52.019,52.954,53.903,54.866,55.843,56.835,57.84,58.86,59.894,60.942,62.004,63.08,64.171,65.275,66.394,67.527,68.674,69.835,71.01,72.2,73.404,74.621,75.853,77.099,78.36,79.634,80.923];
const SF=1.316, SG=1.660;

const BRAND_PAL=['#63b3ed','#ed64a6','#48bb78','#ecc94b','#ed8936','#9f7aea','#38b2ac','#fc8181','#f6ad55','#68d391','#d53f8c','#4fd1c5','#b794f4','#90cdf4','#feb2b2','#fbd38d'];
const BRAND_LIST=[...new Set(SINGLES.map(r=>r.brand))].sort();
const BRAND_COLOR=Object.fromEntries(BRAND_LIST.map((b,i)=>[b,BRAND_PAL[i%BRAND_PAL.length]]));

function RopeScatterChart({ isMobile }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const [metric, setMetric] = useState("falls"); // "falls" | "gm"
  const [showH, setShowH] = useState(false);
  const hovRef = useRef(null); // use ref to avoid re-render per mousemove

  const cfgs = {
    falls: { yField: "falls", yLabel: "UIAA Falls", yMin: 0, yMax: 18, yStep: 2, curveY: CF, std: SF, sub: "Cubic fit · R² = 0.575", color: T.accent },
    gm:    { yField: "gm",    yLabel: "Weight (g/m)", yMin: 40, yMax: 82, yStep: 5, curveY: CG, std: SG, sub: "Quadratic fit · R² = 0.919", color: T.blue },
  };
  const cfg = cfgs[metric];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width, H = isMobile ? 300 : 400;
    const PAD = { t: 20, r: 20, b: 44, l: 50 };
    canvas.width = W * 2; canvas.height = H * 2;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { yField, yMin, yMax, yStep, curveY, std } = cfg;
    const xMin = 7.3, xMax = 11.3;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    for (let x = 8; x <= 11; x += 0.5) { ctx.beginPath(); ctx.moveTo(sx(x), PAD.t); ctx.lineTo(sx(x), H - PAD.b); ctx.stroke(); }
    for (let y = yMin; y <= yMax; y += yStep) { ctx.beginPath(); ctx.moveTo(PAD.l, sy(y)); ctx.lineTo(W - PAD.r, sy(y)); ctx.stroke(); }
    // Ticks
    ctx.fillStyle = "#4a5568"; ctx.font = "10px system-ui"; ctx.textAlign = "center";
    for (let x = 8; x <= 11; x += 0.5) ctx.fillText(x.toFixed(1), sx(x), H - PAD.b + 14);
    ctx.textAlign = "right";
    for (let y = yMin; y <= yMax; y += yStep) ctx.fillText(y, PAD.l - 6, sy(y) + 3);
    ctx.fillStyle = "#64748b"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText("Diameter (mm)", W / 2, H - 6);
    ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(cfg.yLabel, 0, 0); ctx.restore();

    // ±2σ band
    ctx.beginPath();
    for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i] + 2 * std); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    for (let i = CX.length - 1; i >= 0; i--) ctx.lineTo(sx(CX[i]), sy(curveY[i] - 2 * std));
    ctx.closePath(); ctx.fillStyle = "rgba(99,179,237,.03)"; ctx.fill();
    // ±1σ band
    ctx.beginPath();
    for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i] + std); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    for (let i = CX.length - 1; i >= 0; i--) ctx.lineTo(sx(CX[i]), sy(curveY[i] - std));
    ctx.closePath(); ctx.fillStyle = "rgba(99,179,237,.07)"; ctx.fill();
    // Curve line
    ctx.strokeStyle = "rgba(99,179,237,.5)"; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i]); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();

    // Half ropes
    if (showH) {
      HALVES.filter(r => r.falls != null && r[yField] != null).forEach(r => {
        ctx.save(); ctx.translate(sx(r.dia), sy(r[yField])); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "rgba(237,100,166,.2)"; ctx.strokeStyle = "rgba(237,100,166,.4)"; ctx.lineWidth = 1;
        ctx.fillRect(-4, -4, 8, 8); ctx.strokeRect(-4, -4, 8, 8); ctx.restore();
      });
    }

    // Single rope dots
    const hovered = hovRef.current;
    SINGLES.forEach(r => {
      const px = sx(r.dia), py = sy(r[yField]);
      const isH = hovered === r;
      const hex = BRAND_COLOR[r.brand] || "#a0aec0";
      const [cr, cg, cb] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      ctx.beginPath(); ctx.arc(px, py, isH ? 6.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${isH ? 1 : 0.7})`; ctx.fill();
      ctx.strokeStyle = isH ? "#fff" : `rgba(${cr},${cg},${cb},0.3)`; ctx.lineWidth = isH ? 2 : 0.8; ctx.stroke();
    });
  }, [metric, showH, isMobile, cfg]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);

  const findClosest = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = rect.width, H = isMobile ? 300 : 400;
    const PAD = { t: 20, r: 20, b: 44, l: 50 };
    const xMin = 7.3, xMax = 11.3;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - cfg.yMin) / (cfg.yMax - cfg.yMin) * (H - PAD.t - PAD.b);
    let closest = null, best = Infinity;
    SINGLES.forEach(r => { const dx = sx(r.dia) - mx, dy = sy(r[cfg.yField]) - my, d = Math.sqrt(dx * dx + dy * dy); if (d < 20 && d < best) { closest = r; best = d; } });
    return closest;
  }, [isMobile, cfg]);

  const handleMove = useCallback((e) => {
    const r = findClosest(e);
    const prev = hovRef.current;
    if (r !== prev) { hovRef.current = r; draw(); }
    const tip = tipRef.current;
    if (r && tip) {
      const dry = (r.dry || "none").replace(/_/g, " ");
      tip.innerHTML = `<b style="color:${T.accent}">${r.brand} ${r.model}</b><br/>∅ ${r.dia}mm · ${r.gm}g/m · ${r.falls} falls<br/>Impact: ${r.impact}kN · Sheath: ${r.sheath}%<br/><span style="color:#64748b;font-size:11px">Dry: ${dry}${r.triple ? " · Triple rated" : ""}</span><br/><a href="/rope/${r.slug}" style="display:inline-block;margin-top:6px;padding:3px 10px;background:${T.accentSoft};color:${T.accent};border-radius:4px;font-size:11px;font-weight:600;text-decoration:none">View full specs →</a>`;
      tip.style.opacity = "1"; tip.style.pointerEvents = "auto";
      let tx = e.clientX + 14, ty = e.clientY - 10;
      if (tx + 280 > window.innerWidth) tx = e.clientX - 290;
      if (ty + 130 > window.innerHeight) ty = e.clientY - 130;
      tip.style.left = tx + "px"; tip.style.top = ty + "px";
    } else if (tip) { tip.style.opacity = "0"; tip.style.pointerEvents = "none"; }
  }, [findClosest, draw]);

  const handleLeave = useCallback(() => {
    // Small delay so user can move to the tooltip link
    setTimeout(() => {
      const tip = tipRef.current;
      if (tip && !tip.matches(":hover")) {
        hovRef.current = null; draw();
        tip.style.opacity = "0"; tip.style.pointerEvents = "none";
      }
    }, 150);
  }, [draw]);

  // Also dismiss tooltip when mouse leaves the tooltip itself
  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const onLeave = () => { hovRef.current = null; draw(); tip.style.opacity = "0"; tip.style.pointerEvents = "none"; };
    tip.addEventListener("mouseleave", onLeave);
    return () => tip.removeEventListener("mouseleave", onLeave);
  }, [draw]);

  // Intercept link clicks to use React Router
  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const onClick = (e) => {
      const a = e.target.closest("a");
      if (a && a.getAttribute("href")?.startsWith("/rope/")) { e.preventDefault(); navigate(a.getAttribute("href")); }
    };
    tip.addEventListener("click", onClick);
    return () => tip.removeEventListener("click", onClick);
  }, [navigate]);

  return (
    <ChartContainer title="Rope Diameter Deep Dive" subtitle={`106 single ropes · ${cfg.sub}`}>
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(cfgs).map(([k, c]) => (
          <button key={k} onClick={() => setMetric(k)} style={{
            padding: "5px 16px", fontSize: "12px", fontWeight: 600, borderRadius: "6px", border: "none", cursor: "pointer",
            background: metric === k ? c.color : T.surface, color: metric === k ? "#fff" : T.muted,
          }}>{c.yLabel}</button>
        ))}
        <label style={{ fontSize: "12px", color: T.muted, display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", marginLeft: "auto" }}>
          <input type="checkbox" checked={showH} onChange={e => setShowH(e.target.checked)} style={{ accentColor: T.accent, width: "14px", height: "14px" }} /> Half ropes
        </label>
      </div>
      <canvas ref={canvasRef} style={{ display: "block", cursor: "crosshair", width: "100%" }}
        onMouseMove={handleMove} onMouseLeave={handleLeave} />
      {/* Floating tooltip */}
      <div ref={tipRef} style={{
        position: "fixed", pointerEvents: "none", background: "rgba(15,17,25,.95)", border: "1px solid rgba(99,179,237,.35)",
        borderRadius: "8px", padding: "10px 14px", fontSize: "12px", lineHeight: 1.5, color: T.text,
        boxShadow: "0 8px 24px rgba(0,0,0,.6)", zIndex: 999, opacity: 0, transition: "opacity .1s", maxWidth: "280px",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>Shaded band = ±1σ / ±2σ · Hover a dot for specs · Trend line = single ropes only</span>
        {showH && <span style={{ fontSize: "10px", color: "#4a5568" }}>◇ = half ropes (55kg test)</span>}
      </div>
    </ChartContainer>
  );
}

/* ─── Horizontal Bar Chart: Rubber Compounds ─── */
function RubberCompoundChart({ isMobile }) {
  const W = isMobile ? 340 : 660, H = 380;
  const padL = isMobile ? 110 : 160, padR = 80, padT = 10, padB = 20;
  const barH = 26, gap = 6;
  const maxN = 70;

  const priceColors = (p) => p < 100 ? T.green : p < 130 ? T.blue : p < 150 ? T.accent : T.red;

  return (
    <ChartContainer title="Rubber Compound Market Share" subtitle="333 climbing shoes — which rubber dominates, and what does it cost?">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {RUBBER_DATA.map((d, i) => {
          const yPos = padT + i * (barH + gap);
          const barW = (d.n / maxN) * (W - padL - padR);
          const color = d.compound.includes("XS Grip") ? T.accent : d.compound.includes("XS Edge") ? "#ef4444" :
            d.compound.includes("Science") ? T.purple : d.compound.includes("TRAX") ? T.yellow :
            d.compound.includes("Stealth") ? T.green : d.compound.includes("Unparallel") ? T.blue : T.muted;
          return (
            <g key={d.compound}>
              <text x={padL - 8} y={yPos + barH / 2 + 4} fill={T.text} fontSize={isMobile ? "9" : "11"} fontWeight="600" textAnchor="end">{d.compound}</text>
              <rect x={padL} y={yPos} width={barW} height={barH} rx="4" fill={color} opacity="0.8" />
              <text x={padL + barW + 6} y={yPos + barH / 2 + 1} fill={T.text} fontSize="11" fontWeight="700" dominantBaseline="middle">{d.n}</text>
              {/* Price badge */}
              <rect x={padL + barW + 30} y={yPos + 3} width="42" height="20" rx="4" fill={priceColors(d.avgPrice)} opacity="0.15" />
              <text x={padL + barW + 51} y={yPos + barH / 2 + 1} fill={priceColors(d.avgPrice)} fontSize="10" fontWeight="700" textAnchor="middle" dominantBaseline="middle">€{d.avgPrice}</text>
            </g>
          );
        })}
      </svg>
    </ChartContainer>
  );
}

/* ─── Head-to-head: XS Grip vs XS Edge ─── */
function GripVsEdge({ isMobile }) {
  const data = [
    { label: "Shoes using it", grip: 68, edge: 41, unit: "", max: 80 },
    { label: "Avg shoe price", grip: 133, edge: 146, unit: "€", max: 180 },
    { label: "Brands using it", grip: 10, edge: 3, unit: "", max: 12 },
  ];

  return (
    <ChartContainer title="Head to Head: XS Grip 2 vs XS Edge" subtitle="The two most popular Vibram compounds go head-to-head">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {data.map(d => {
          const gripPct = (d.grip / d.max) * 100;
          const edgePct = (d.edge / d.max) * 100;
          return (
            <div key={d.label}>
              <div style={{ fontSize: "12px", color: T.muted, marginBottom: "6px", fontWeight: 600 }}>{d.label}</div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                    <span style={{ fontSize: "11px", color: T.accent, fontWeight: 700 }}>XS Grip 2</span>
                    <span style={{ fontSize: "13px", color: T.accent, fontWeight: 800 }}>{d.unit}{d.grip}</span>
                  </div>
                  <div style={{ height: "8px", background: T.surface, borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${gripPct}%`, height: "100%", background: T.accent, borderRadius: "4px" }} />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                    <span style={{ fontSize: "11px", color: T.red, fontWeight: 700 }}>XS Edge</span>
                    <span style={{ fontSize: "13px", color: T.red, fontWeight: 800 }}>{d.unit}{d.edge}</span>
                  </div>
                  <div style={{ height: "8px", background: T.surface, borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${edgePct}%`, height: "100%", background: T.red, borderRadius: "4px" }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: "16px", padding: "12px 14px", background: T.surface, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.7 }}>
          <strong style={{ color: T.accent }}>XS Grip 2</strong> dominates with 68 shoes across 10 brands — the industry's go-to all-rounder. 
          <strong style={{ color: T.red }}> XS Edge</strong> is the specialist pick: fewer shoes, higher average price (€146 vs €133), 
          and exclusive to just 3 brands (La Sportiva, Scarpa, Tenaya) — signaling a premium, performance-focused positioning.
        </div>
      </div>
    </ChartContainer>
  );
}
/* ═══════════════════════════════════════════════════════════════
   ARTICLE SECTIONS
   ═══════════════════════════════════════════════════════════════ */

function ArticleHeader({ number, title, subtitle, icon }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <span style={{ fontSize: "28px" }}>{icon}</span>
        <span style={{ fontSize: "11px", fontWeight: 700, color: T.accent, background: T.accentSoft, padding: "3px 10px", borderRadius: "6px", letterSpacing: "0.5px" }}>INSIGHT #{number}</span>
      </div>
      <h2 style={{ fontSize: "24px", fontWeight: 800, color: T.text, letterSpacing: "-0.5px", lineHeight: 1.3, margin: "0 0 6px" }}>{title}</h2>
      <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.6, margin: 0 }}>{subtitle}</p>
    </div>
  );
}

function Prose({ children }) {
  return <div style={{ fontSize: "14px", color: "#c0c4ce", lineHeight: 1.8, margin: "20px 0" }}>{children}</div>;
}

function KeyInsight({ children, color = T.accent }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: "16px", margin: "20px 0", background: `${color}08`, borderRadius: "0 8px 8px 0", padding: "14px 16px" }}>
      <div style={{ fontSize: "13px", color: T.text, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════════
   MAIN INSIGHTS PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function Insights() {
  const isMobile = useIsMobile();
  const maxW = "820px";

  const sectionStyle = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: "16px",
    padding: isMobile ? "24px 16px" : "40px 36px",
    marginBottom: "32px",
  };

  return (
    <div style={{ fontFamily: T.font, color: T.text, minHeight: "100vh", padding: isMobile ? "20px 12px 60px" : "40px 24px 80px" }}>
      <div style={{ maxWidth: maxW, margin: "0 auto" }}>

        {/* Page Header */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.accent, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>Data-Driven Insights</div>
          <h1 style={{ fontSize: isMobile ? "28px" : "36px", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.2, margin: "0 0 12px", color: T.text }}>
            What 380+ Products Reveal<br />About Climbing Gear
          </h1>
          <p style={{ fontSize: "15px", color: T.muted, lineHeight: 1.6, maxWidth: "520px", margin: "0 auto" }}>
            We analyzed every crashpad, rope, and shoe in our database. Here are three findings that might change how you shop.
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginTop: "20px" }}>
            <span style={{ fontSize: "11px", color: T.accent, background: T.accentSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>333 Shoes</span>
            <span style={{ fontSize: "11px", color: T.green, background: T.greenSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>141 Ropes</span>
            <span style={{ fontSize: "11px", color: T.blue, background: T.blueSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>19 Belay Devices</span>
          </div>
        </div>

        {/* ═══ ARTICLE 1: The €/m² Illusion ═══ */}
        <section style={sectionStyle}>
          <ArticleHeader
            number={1}
            icon="🧮"
            title="The €/m² Illusion: Why the Cheapest Crashpad Might Cost You the Most"
            subtitle="Price tags lie. Landing area per euro tells the real story — and fold style is the hidden variable nobody talks about."
          />

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Cheapest per m²" value="€45" sub="Mad Rock Triplet" color={T.green} />
            <StatCard label="Most Expensive per m²" value="€402" sub="Send 4x4 Pro Highball" color={T.red} />
            <StatCard label="9× Price Spread" value="9:1" sub="Same sport, same purpose" color={T.yellow} />
          </div>

          <Prose>
            When you walk into a climbing shop and see a €55 crashpad next to a €599 one, the price gap seems absurd. But zoom in on what you actually get per square meter of landing zone, and the picture shifts dramatically. The Mad Rock Triplet delivers protection at just €45/m² — but with a single foam layer and minimal carry features. The Send 4x4 Pro Highball commands €402/m² with 4-layer foam and professional-grade features.
          </Prose>

          <PadScatterPlot isMobile={isMobile} />

          <KeyInsight>
            <strong>The Sweet Spot:</strong> Pads between 1.0–1.7m² and €150–220/m² offer the best balance of protection, portability, and value. This zone contains 60%+ of all crashpads — for good reason.
          </KeyInsight>

          <Prose>
            But here's what most buyers miss: fold style is a hidden tax. Taco-fold pads average €218/m² — a 22% premium over hinge pads at €178/m². You're paying for the seamless landing surface, but the data shows hinge pads actually deliver more landing area per euro.
          </Prose>

          <FoldStyleBars isMobile={isMobile} />

          <KeyInsight color={T.blue}>
            <strong>Fold Style Tax:</strong> Taco pads cost 22% more per m² than hinge pads (€218 vs €178). Tri-folds break even on €/m² (€176) but give you 38% more landing area on average (1.66m² vs 1.20m²). If raw coverage matters most, tri-fold is the mathematically optimal choice.
          </KeyInsight>

          <FoamLayerChart isMobile={isMobile} />

          <Prose>
            Foam layers tell a clear story: each additional layer adds roughly €40–50 to the street price. The jump from 3 to 4 layers is the steepest — a 54% price increase for what amounts to marginal impact-absorption gains. For most boulderers on standard 3–4m problems, 2–3 foam layers are more than sufficient.
          </Prose>
        </section>
        {/* ═══ ARTICLE 2: The Rope Sweet Spot ═══ */}
        <section style={sectionStyle}>
          <ArticleHeader
            number={2}
            icon="🧵"
            title="The 9.5–9.8mm Sweet Spot: 106 Ropes Expose the Best Value Band"
            subtitle="106 single-certified ropes reveal a steady performance curve — and one diameter range where competition delivers the best deals."
          />

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Most Models" value="9.6–9.8" sub="31 ropes — fiercest competition" color={T.accent} />
            <StatCard label="Best Balance" value="8.0 falls" sub="62 g/m avg in sweet spot" color={T.blue} />
            <StatCard label="Gym Territory" value="≥11.0mm" sub="13.8 falls, 75 g/m — tanks" color={T.yellow} />
          </div>

          <Prose>
            Analyzing 106 single-certified ropes — excluding half and twin ropes that use a lighter 55kg test mass — reveals no dramatic "cliff" or threshold. Instead, durability climbs steadily with diameter: from 4.8 avg falls at ≤8.7mm up to 13.8 at ≥11.0mm. The real insight isn't where a threshold lies, but where the market concentrates — and that tells you where the best deals are.
          </Prose>

          <RopeScatterChart isMobile={isMobile} />

          <KeyInsight color={T.green}>
            <strong>The Sweet Spot (9.5–9.8mm):</strong> This band holds 31 of 106 ropes — nearly a third of the entire market. More models means fiercer price competition and more choice. Average durability here is 8.0 UIAA falls at 61.6 g/m — a solid all-round spec. Below 9.0mm you're in ultralight specialist territory (4.8–6.2 falls); above 10.0mm the weight penalty outpaces durability gains.
          </KeyInsight>

          <Prose>
            Toggle to "Weight" above and the steady climb is clear: from 48.5 g/m at ≤8.7mm to 75.5 g/m at ≥11.0mm. On a 70m rope, that's the difference between 3.4kg and 5.3kg — nearly 2kg extra in your pack. Meanwhile, the falls curve flattens above 9.5mm: going from 9.5mm to 10.0mm adds only 0.4 extra UIAA falls but 5 g/m more weight.
          </Prose>

          <KeyInsight>
            <strong>The Dry Treatment Signal:</strong> 100% of ropes below 9.0mm have dry treatment — these are alpine tools built for mountain weather. By 9.6–9.8mm, dry treatment drops to 65%. Above 10mm it's a coin flip. This clearly separates alpine ropes (thin, dry, light) from sport/gym ropes (thick, untreated, durable).
          </KeyInsight>
        </section>

        {/* ═══ ARTICLE 3: Vibram XS Grip vs XS Edge ═══ */}
        <section style={sectionStyle}>
          <ArticleHeader
            number={3}
            icon="👟"
            title="Vibram XS Grip 2 vs XS Edge: The €13 Question Nobody Asks"
            subtitle="Two compounds dominate 33% of all climbing shoes. Here's what the data says about choosing between them."
          />

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="XS Grip 2 Shoes" value="68" sub="21% of all shoes" color={T.accent} />
            <StatCard label="XS Edge Shoes" value="41" sub="13% of all shoes" color={T.red} />
            <StatCard label="Price Gap" value="€13" sub="XS Edge costs more" color={T.yellow} />
          </div>

          <RubberCompoundChart isMobile={isMobile} />

          <Prose>
            The climbing shoe rubber market has a clear king: Vibram XS Grip 2 appears on 68 shoes across 10 different brands — from La Sportiva's flagship solutions to budget-friendly Simond models. XS Edge, its edging-focused sibling, shows up on 41 shoes but tells a different story through its distribution.
          </Prose>

          <GripVsEdge isMobile={isMobile} />

          <KeyInsight color={T.red}>
            <strong>Brand Exclusivity:</strong> XS Edge is used by only 3 brands (La Sportiva, Scarpa, Tenaya) — all premium European manufacturers. XS Grip 2 appears across 10 brands spanning every price tier. This suggests XS Edge is a deliberate premium choice, while XS Grip 2 is the universal "safe bet."
          </KeyInsight>

          <Prose>
            The €13 average price difference (€133 vs €146) understates the real story. XS Edge shoes skew heavily toward performance and aggressive models — the shoes climbers buy second, not first. Meanwhile, XS Grip 2 spans everything from beginner-friendly all-rounders to comp-level downturned shoes. The compound choice isn't really about grip vs edge — it's about market positioning.
          </Prose>

          <KeyInsight color={T.purple}>
            <strong>The hidden third force:</strong> Look beyond Vibram and you'll find proprietary compounds carving out niches. Evolv's TRAX SAS (13 shoes, avg €167) commands the highest average price of any compound — suggesting brand-loyal buyers who aren't cross-shopping. Unparallel runs its own RH + RS compounds across 26 shoes, proving you don't need Vibram to compete.
          </KeyInsight>
        </section>
        {/* ═══ FOOTER CTA ═══ */}
        <div style={{
          textAlign: "center", padding: "40px 24px",
          background: `linear-gradient(135deg, ${T.accentSoft}, ${T.blueSoft})`,
          borderRadius: "16px", border: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color: T.text, marginBottom: "8px" }}>Ready to find your gear?</div>
          <p style={{ fontSize: "14px", color: T.muted, marginBottom: "20px", lineHeight: 1.6 }}>
            All insights are drawn from live product data. Explore the full database with filters, comparisons, and price tracking.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { label: "Browse Shoes", to: "/shoes", icon: "👟" },
              { label: "Browse Crashpads", to: "/crashpads", icon: "🛏️" },
              { label: "Browse Ropes", to: "/ropes", icon: "🧵" },
            ].map(l => (
              <Link key={l.to} to={l.to} style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "10px 20px", background: T.accent, color: "#fff",
                fontSize: "13px", fontWeight: 700, borderRadius: "8px",
                textDecoration: "none", transition: "transform 0.15s",
              }}
                onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"}
                onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}
              >
                {l.icon} {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Methodology */}
        <div style={{ marginTop: "32px", padding: "20px", background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Methodology</div>
          <p style={{ fontSize: "12px", color: T.muted, lineHeight: 1.7, margin: 0 }}>
            Data sourced from manufacturer specs and retailer listings across European markets. Prices reflect current street prices (or UVP where unavailable) as of early 2025. 
            €/m² calculated as current_price ÷ (length_open × width_open). Foam layer counts from manufacturer datasheets. Rubber compound data from official shoe specifications. 
            Rope analysis covers 106 single-certified ropes from seed database (EN 892, 80kg test mass). Half and twin ropes (35 total) use a lighter 55kg test mass and are excluded to avoid inflated fall counts. Sample sizes noted on each chart. Analysis by climbing-gear.com.
          </p>
        </div>

      </div>
    </div>
  );
}