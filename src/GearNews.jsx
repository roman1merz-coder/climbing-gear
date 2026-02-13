import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { T } from "./tokens.js";

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return m;
}

/* ═══════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function Badge({ children, color = T.accent }) {
  return <span style={{ fontSize: "10px", fontWeight: 700, color, background: `${color}18`, padding: "3px 10px", borderRadius: "6px", letterSpacing: "0.5px", textTransform: "uppercase" }}>{children}</span>;
}
function Prose({ children }) {
  return <div style={{ fontSize: "14px", color: "#c0c4ce", lineHeight: 1.8, margin: "20px 0" }}>{children}</div>;
}
function KeyInsight({ children, color = T.accent }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, background: `${color}08`, borderRadius: "0 8px 8px 0", padding: "14px 16px", margin: "20px 0" }}>
      <div style={{ fontSize: "13px", color: T.text, lineHeight: 1.7 }}>{children}</div>
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
function ChartBox({ title, subtitle, children, style }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "24px", ...style }}>
      {title && <div style={{ fontSize: "15px", fontWeight: 700, color: T.text, marginBottom: subtitle ? "4px" : "16px" }}>{title}</div>}
      {subtitle && <div style={{ fontSize: "12px", color: T.muted, marginBottom: "16px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}
function SpecRow({ label, value, highlight }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}22` }}>
      <span style={{ fontSize: "13px", color: T.muted }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 700, color: highlight ? T.accent : T.text }}>{value}</span>
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════════
   ARTICLE 1: World's Lightest Single Rope
   ═══════════════════════════════════════════════════════════════ */
const ROPE_COMPARISON = [
  { name: "Edelweiss Spirit ARC 8.8", gm: 45, dia: 8.8, falls: 5, triple: false, eco: false },
  { name: "Fixe Pedraforca 8.8", gm: 46, dia: 8.8, falls: 5, triple: false, eco: false },
  { name: "Petzl Tango 8.5", gm: 47, dia: 8.5, falls: 10, triple: false, eco: false },
  { name: "Beal Opera 8.5", gm: 48, dia: 8.5, falls: 5, triple: false, eco: false },
  { name: "Mammut Alpine Sender 8.7", gm: 48, dia: 8.7, falls: 5, triple: false, eco: false },
  { name: "Black Diamond 8.5 Dry", gm: 48, dia: 8.5, falls: 12, triple: false, eco: false },
  { name: "Edelrid Siskin Eco Dry 8.6", gm: 48, dia: 8.6, falls: 5, triple: true, eco: true },
  { name: "Ocun Peak 8.5", gm: 48, dia: 8.5, falls: 6, triple: false, eco: false },
  { name: "Tendon Master 8.6", gm: 50, dia: 8.6, falls: 5, triple: false, eco: false },
  { name: "Beal Cobra II 8.6", gm: 50, dia: 8.6, falls: 7, triple: false, eco: false },
];

function RopeWeightChart({ isMobile }) {
  const W = isMobile ? 340 : 660, H = 340;
  const padL = isMobile ? 130 : 180, padR = 60, padT = 10;
  const barH = 26, gap = 6;
  const maxG = 52;
  const minG = 43;

  return (
    <ChartBox title="Weight per Meter: The Sub-50g Club" subtitle="Every rope at or below 50g/m in our 141-rope database">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {ROPE_COMPARISON.map((r, i) => {
          const yPos = padT + i * (barH + gap);
          const barW = ((r.gm - minG) / (maxG - minG)) * (W - padL - padR);
          const isSiskin = r.name.includes("Siskin");
          const color = isSiskin ? T.accent : r.gm <= 48 ? T.blue : T.muted;
          return (
            <g key={r.name}>
              <text x={padL - 8} y={yPos + barH / 2 + 4} fill={isSiskin ? T.accent : T.text} fontSize={isMobile ? "9" : "11"} fontWeight={isSiskin ? "800" : "500"} textAnchor="end">{r.name}</text>
              <rect x={padL} y={yPos} width={Math.max(barW, 4)} height={barH} rx="4" fill={color} opacity={isSiskin ? 1 : 0.6} />
              {isSiskin && <rect x={padL} y={yPos} width={Math.max(barW, 4)} height={barH} rx="4" fill="none" stroke={T.accent} strokeWidth="2" />}
              <text x={padL + Math.max(barW, 4) + 6} y={yPos + barH / 2 + 4} fill={color} fontSize="11" fontWeight="700">{r.gm}g/m</text>
              {r.triple && <text x={padL + Math.max(barW, 4) + 48} y={yPos + barH / 2 + 3} fill={T.green} fontSize="8" fontWeight="700">TRIPLE</text>}
              {r.eco && <text x={padL + Math.max(barW, 4) + 88} y={yPos + barH / 2 + 3} fill={T.green} fontSize="8" fontWeight="700">ECO</text>}
            </g>
          );
        })}
      </svg>
    </ChartBox>
  );
}
/* ═══════════════════════════════════════════════════════════════
   ARTICLE 2: La Sportiva Indoor Revolution
   ═══════════════════════════════════════════════════════════════ */
const LS_INDOOR_LINE = [
  { name: "HyperEZ", price: 119, target: "Beginner / Indoor", status: "Fall 2026", key: "SenseGrip midsole, high-volume last, dual-crossed straps" },
  { name: "HyperEZ Rental", price: null, target: "Gym Rental Fleet", status: "Fall 2026", key: "Rental-optimized durability, quick sizing" },
  { name: "TX Setter", price: 169, target: "Route Setters", status: "Fall 2026", key: "Resoleable, approach-shoe cushioning, climbing sensitivity" },
  { name: "TX1", price: 159, target: "Approach / Scouting", status: "Fall 2026", key: "Lightweight, fast missions, easy climbs" },
];

function IndoorLineTable({ isMobile }) {
  return (
    <ChartBox title="La Sportiva Fall 2026 Indoor Line" subtitle="Four new shoes targeting the growing indoor climbing market">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {["Model", "Price", "Target", "Status", "Key Feature"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LS_INDOOR_LINE.map(s => (
              <tr key={s.name} style={{ borderBottom: `1px solid ${T.border}33` }}>
                <td style={{ padding: "10px", fontWeight: 700, color: T.text }}>{s.name}</td>
                <td style={{ padding: "10px", color: s.price ? T.accent : T.muted, fontWeight: 700 }}>{s.price ? `$${s.price}` : "TBA"}</td>
                <td style={{ padding: "10px", color: T.muted }}>{s.target}</td>
                <td style={{ padding: "10px" }}><Badge color={T.yellow}>{s.status}</Badge></td>
                <td style={{ padding: "10px", color: T.muted, fontSize: "12px" }}>{s.key}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartBox>
  );
}

/* ─── La Sportiva price position chart ─── */
const LS_BEGINNER_LANDSCAPE = [
  { name: "Scarpa Origin", price: 89, brand: "Scarpa" },
  { name: "La Sportiva Tarantula", price: 85, brand: "La Sportiva" },
  { name: "Evolv Defy", price: 89, brand: "Evolv" },
  { name: "BD Momentum", price: 99, brand: "Black Diamond" },
  { name: "Butora Endeavor", price: 99, brand: "Butora" },
  { name: "La Sportiva Oxygym", price: 99, brand: "La Sportiva" },
  { name: "Unparallel Engage", price: 109, brand: "Unparallel" },
  { name: "HyperEZ (new)", price: 119, brand: "La Sportiva", isNew: true },
  { name: "Scarpa Velocity", price: 129, brand: "Scarpa" },
  { name: "TX Setter (new)", price: 169, brand: "La Sportiva", isNew: true },
];

function BeginnerPriceChart({ isMobile }) {
  const W = isMobile ? 340 : 600, H = 340;
  const padL = isMobile ? 120 : 150, padR = 50, padT = 10;
  const barH = 26, gap = 6;
  const maxP = 180;

  return (
    <ChartBox title="Where Do They Fit?" subtitle="Price positioning among beginner / indoor shoes">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {LS_BEGINNER_LANDSCAPE.map((s, i) => {
          const yPos = padT + i * (barH + gap);
          const barW = (s.price / maxP) * (W - padL - padR);
          const color = s.isNew ? T.accent : s.brand === "La Sportiva" ? T.yellow : T.muted;
          return (
            <g key={s.name}>
              <text x={padL - 8} y={yPos + barH / 2 + 4} fill={s.isNew ? T.accent : T.text} fontSize={isMobile ? "9" : "11"} fontWeight={s.isNew ? "800" : "500"} textAnchor="end">{s.name}</text>
              <rect x={padL} y={yPos} width={barW} height={barH} rx="4" fill={color} opacity={s.isNew ? 1 : 0.5} />
              {s.isNew && <rect x={padL} y={yPos} width={barW} height={barH} rx="4" fill="none" stroke={T.accent} strokeWidth="2" strokeDasharray="4,3" />}
              <text x={padL + barW + 6} y={yPos + barH / 2 + 4} fill={color} fontSize="11" fontWeight="700">${s.price}</text>
            </g>
          );
        })}
      </svg>
    </ChartBox>
  );
}
/* ═══════════════════════════════════════════════════════════════
   ARTICLE 3: Asana G5 BIG Pad
   ═══════════════════════════════════════════════════════════════ */
const PAD_COMPARISON = [
  { name: "Organic Big Tri", area: 2.62, weight: 10.0, price: 469, denier: 1050, foam: 3, thickness: 10 },
  { name: "Asana VersaPad Pro", area: 2.40, weight: 2.7, price: 185, denier: 600, foam: 2, thickness: 5 },
  { name: "Evolv Home Pad", area: 2.23, weight: 10.0, price: 275, denier: 900, foam: 3, thickness: 10 },
  { name: "Asana SuperHero", area: 2.05, weight: 10.0, price: 399, denier: 1000, foam: 3, thickness: 13 },
  { name: "Mad Rock Triple", area: 2.05, weight: 9.5, price: 319, denier: 1680, foam: 3, thickness: 8 },
  { name: "BD Mondo", area: 1.85, weight: 9.3, price: 380, denier: 900, foam: 2, thickness: 10 },
  { name: "Asana G5 BIG", area: 1.48, weight: 6.8, price: 425, denier: 1680, foam: 2, thickness: 13, isNew: true },
  { name: "Petzl Cirro", area: 1.75, weight: 8.4, price: 389, denier: 900, foam: 3, thickness: 10 },
];

function PadComparisonChart({ isMobile }) {
  const W = isMobile ? 340 : 660, H = isMobile ? 300 : 320;
  const pad = { top: 30, right: 30, bottom: 45, left: 55 };
  const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;

  const xMin = 1.2, xMax = 2.8, yMin = 100, yMax = 500;
  const x = v => pad.left + ((v - xMin) / (xMax - xMin)) * cw;
  const y = v => pad.top + ch - ((v - yMin) / (yMax - yMin)) * ch;

  const [hovered, setHovered] = useState(null);

  return (
    <ChartBox title="Price vs Landing Area: Premium Pad Showdown" subtitle="How the Asana G5 BIG stacks up against the biggest pads in our database">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {/* Grid */}
        {[200, 300, 400, 500].map(v => v <= yMax && (
          <g key={v}>
            <line x1={pad.left} y1={y(v)} x2={W - pad.right} y2={y(v)} stroke={T.border} strokeDasharray="3,3" />
            <text x={pad.left - 8} y={y(v) + 4} fill={T.muted} fontSize="10" textAnchor="end">{"\u20AC"}{v}</text>
          </g>
        ))}
        {[1.5, 2.0, 2.5].map(v => (
          <g key={v}>
            <line x1={x(v)} y1={pad.top} x2={x(v)} y2={H - pad.bottom} stroke={T.border} strokeDasharray="3,3" />
            <text x={x(v)} y={H - pad.bottom + 18} fill={T.muted} fontSize="10" textAnchor="middle">{v}m{"\u00B2"}</text>
          </g>
        ))}
        <text x={W / 2} y={H - 4} fill={T.muted} fontSize="11" textAnchor="middle" fontWeight="600">Landing Area</text>
        {/* Dots */}
        {PAD_COMPARISON.map((d, i) => {
          const cx = x(Math.min(xMax, Math.max(xMin, d.area)));
          const cy = y(Math.min(yMax, Math.max(yMin, d.price)));
          const r = Math.max(6, Math.min(14, d.thickness));
          const color = d.isNew ? T.accent : T.blue;
          return (
            <g key={d.name} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
              <circle cx={cx} cy={cy} r={hovered === i ? r + 3 : r} fill={color} opacity={hovered === i || d.isNew ? 1 : 0.6} stroke={hovered === i || d.isNew ? "#fff" : "none"} strokeWidth="2" />
              {(hovered === i || d.isNew) && (
                <text x={cx} y={cy - r - 6} fill={color} fontSize="10" fontWeight="700" textAnchor="middle">{d.name}</text>
              )}
              {hovered === i && (
                <g>
                  <rect x={cx + r + 8} y={cy - 24} width="160" height="42" rx="6" fill={T.surface} stroke={T.border} />
                  <text x={cx + r + 16} y={cy - 8} fill={T.text} fontSize="10" fontWeight="600">{d.area}m{"\u00B2"} {"\u00B7"} {"\u20AC"}{d.price} {"\u00B7"} {d.weight}kg</text>
                  <text x={cx + r + 16} y={cy + 6} fill={T.muted} fontSize="9">{d.denier}D {"\u00B7"} {d.foam} foam {"\u00B7"} {d.thickness}cm thick</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </ChartBox>
  );
}
/* ═══════════════════════════════════════════════════════════════
   ARTICLE 4: Inflatable Pads
   ═══════════════════════════════════════════════════════════════ */
const INFLATABLE_DATA = [
  { name: "Sick Sequence", weight: 2.4, area: 1.12, price: 240, thickness: 15, pack: "14\u00D78\u00D77in", inflate: "60s", material: "TPU + ripstop", inDB: false },
  { name: "Kailas V17", weight: 5.0, area: 2.04, price: 249, thickness: 15, pack: "75\u00D748\u00D733cm", inflate: "~2min", material: "TPU + Vibram sole", inDB: true },
  { name: "Snap Air Shock 1", weight: 4.0, area: 1.80, price: 320, thickness: 15, pack: "70\u00D725cm", inflate: "<3min", material: "TPU + recycled 600D", inDB: true },
];

const FOAM_EQUIVALENT = [
  { name: "Metolius Session II", weight: 4.1, area: 1.11, price: 180, type: "foam" },
  { name: "BD Drop Zone", weight: 4.5, area: 1.03, price: 180, type: "foam" },
  { name: "Petzl Alto", weight: 6.2, area: 1.18, price: 249, type: "foam" },
  { name: "Sick Sequence", weight: 2.4, area: 1.12, price: 240, type: "inflatable" },
  { name: "Snap Air Shock 1", weight: 4.0, area: 1.80, price: 320, type: "inflatable" },
  { name: "Kailas V17", weight: 5.0, area: 2.04, price: 249, type: "inflatable" },
];

function InflatableVsFoam({ isMobile }) {
  const W = isMobile ? 340 : 600, H = 260;
  const padL = isMobile ? 110 : 140, padR = 50, padT = 20, padB = 30;
  const barH = 28, gap = 8;

  return (
    <ChartBox title="Weight Showdown: Inflatable vs Foam" subtitle="Comparing similar-area pads by weight — lighter is better">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {FOAM_EQUIVALENT.map((d, i) => {
          const yPos = padT + i * (barH + gap);
          const barW = (d.weight / 7) * (W - padL - padR);
          const isInflatable = d.type === "inflatable";
          const color = isInflatable ? T.accent : T.blue;
          return (
            <g key={d.name}>
              <text x={padL - 8} y={yPos + barH / 2 + 4} fill={isInflatable ? T.accent : T.text} fontSize={isMobile ? "9" : "11"} fontWeight={isInflatable ? "700" : "500"} textAnchor="end">{d.name}</text>
              <rect x={padL} y={yPos} width={barW} height={barH} rx="4" fill={color} opacity={isInflatable ? 0.9 : 0.5} />
              <text x={padL + barW + 6} y={yPos + barH / 2 + 1} fill={color} fontSize="11" fontWeight="700" dominantBaseline="middle">{d.weight}kg</text>
              <text x={padL + barW + 46} y={yPos + barH / 2 + 1} fill={T.muted} fontSize="9" dominantBaseline="middle">{d.area}m{"\u00B2"} {"\u00B7"} {"\u20AC"}{d.price}</text>
            </g>
          );
        })}
        {/* Legend */}
        <circle cx={padL} cy={H - 6} r="4" fill={T.accent} />
        <text x={padL + 8} y={H - 2} fill={T.muted} fontSize="10">Inflatable</text>
        <circle cx={padL + 80} cy={H - 6} r="4" fill={T.blue} />
        <text x={padL + 88} y={H - 2} fill={T.muted} fontSize="10">Foam</text>
      </svg>
    </ChartBox>
  );
}

function InflatableSpecTable({ isMobile }) {
  return (
    <ChartBox title="Inflatable Pad Specs Compared" subtitle="The three inflatable pads on the market — head to head">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {["", "Sick Sequence", "Kailas V17", "Snap Air Shock 1"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: h ? "center" : "left", color: T.muted, fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Weight", "2.4 kg", "5.0 kg", "4.0 kg"],
              ["Landing Area", "1.12 m\u00B2", "2.04 m\u00B2", "1.80 m\u00B2"],
              ["Thickness", "15 cm", "15 cm", "15 cm"],
              ["Packed Size", "14\u00D78\u00D77\"", "75\u00D748\u00D733cm", "70\u00D725cm"],
              ["Inflate Time", "60 sec", "~2 min", "<3 min"],
              ["Price", "$240", "\u20AC249", "\u20AC320"],
              ["Material", "TPU + ripstop", "TPU + Vibram", "TPU + rec. 600D"],
              ["In Our DB", "No", "Yes", "Yes"],
            ].map(([label, ...vals]) => (
              <tr key={label} style={{ borderBottom: `1px solid ${T.border}33` }}>
                <td style={{ padding: "8px 10px", color: T.muted, fontWeight: 600, fontSize: "12px" }}>{label}</td>
                {vals.map((v, j) => {
                  const isBest = (label === "Weight" && j === 0) || (label === "Landing Area" && j === 1) || (label === "Inflate Time" && j === 0) || (label === "Price" && j === 0);
                  return <td key={j} style={{ padding: "8px 10px", textAlign: "center", color: isBest ? T.green : T.text, fontWeight: isBest ? 700 : 400 }}>{v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartBox>
  );
}
/* ═══════════════════════════════════════════════════════════════
   MAIN GEAR NEWS PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function GearNews() {
  const isMobile = useIsMobile();
  const maxW = "820px";
  const section = {
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: "16px",
    padding: isMobile ? "24px 16px" : "40px 36px", marginBottom: "32px",
  };

  return (
    <div style={{ fontFamily: T.font, color: T.text, minHeight: "100vh", padding: isMobile ? "20px 12px 60px" : "40px 24px 80px" }}>
      <div style={{ maxWidth: maxW, margin: "0 auto" }}>

        {/* Page Header */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <Badge color={T.blue}>Gear News</Badge>
          <h1 style={{ fontSize: isMobile ? "28px" : "36px", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.2, margin: "12px 0", color: T.text }}>
            What's New in Climbing Gear
          </h1>
          <p style={{ fontSize: "15px", color: T.muted, lineHeight: 1.6, maxWidth: "540px", margin: "0 auto" }}>
            Record-breaking announcements, upcoming releases, and emerging technologies — cross-referenced with our database of 572 products.
          </p>
        </div>

        {/* ═══ ARTICLE 1: Siskin — World's Lightest Single Rope ═══ */}
        <section style={section}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span style={{ fontSize: "28px" }}>{"\uD83E\uDDF5"}</span>
            <Badge color={T.green}>Record Breaker</Badge>
            <Badge color={T.blue}>In Our Database</Badge>
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: T.text, letterSpacing: "-0.5px", lineHeight: 1.3, margin: "0 0 6px" }}>
            The World's Lightest Single Rope: 48g/m
          </h2>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.6, margin: "0 0 20px" }}>
            The Edelrid Siskin Eco Dry 8.6mm hits the same weight class as half ropes — but carries a single-rope certification.
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Weight" value="48g/m" sub="Tied lightest in DB" color={T.green} />
            <StatCard label="Diameter" value="8.6mm" sub="Triple certified" color={T.blue} />
            <StatCard label="UIAA Falls" value="5" sub="Single / 18 half / 25+ twin" color={T.accent} />
            <StatCard label="70m Weight" value="3.36kg" sub="vs 4.34kg for a 9.8mm" color={T.yellow} />
          </div>

          <RopeWeightChart isMobile={isMobile} />

          <Prose>
            At 48g/m, the Siskin Eco Dry ties with the Beal Opera 8.5, Mammut Alpine Sender 8.7, Black Diamond 8.5 Dry, and Ocun Peak 8.5 for the lightest ropes in our database. But the Siskin is the only one that carries <strong>triple certification</strong> (single + half + twin) — meaning a single rope replaces three use cases.
          </Prose>

          <KeyInsight color={T.green}>
            <strong>The weight savings are real:</strong> On a 70m rope, the Siskin weighs 3.36kg — a full kilogram lighter than a typical 9.8mm (4.34kg). That's the weight of a water bottle you're not carrying on every pitch. For multi-pitch alpinists, this adds up across a 20-pitch day.
          </KeyInsight>

          <Prose>
            The trade-off? At 5 UIAA falls (single cert), durability is modest. The Black Diamond 8.5 Dry manages 12 falls at the same weight. And at roughly {"\u20AC"}275–360 depending on length, the Siskin commands a premium. But with PFC-free Eco Dry treatment and less than 2% water absorption, Edelrid's sustainability credentials are unmatched in this weight class.
          </Prose>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "16px", marginTop: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: T.accent, marginBottom: "8px" }}>Key Specs</div>
            <SpecRow label="Diameter" value="8.6mm" />
            <SpecRow label="Weight" value="48 g/m" highlight />
            <SpecRow label="UIAA Falls (single)" value="5" />
            <SpecRow label="UIAA Falls (half)" value="18" />
            <SpecRow label="Impact Force" value="8.5 kN (single)" />
            <SpecRow label="Static Elongation" value="5.3%" />
            <SpecRow label="Dynamic Elongation" value="34%" />
            <SpecRow label="Core Proportion" value="62%" />
            <SpecRow label="Dry Treatment" value="Eco Dry (PFC-free)" highlight />
            <SpecRow label="Certification" value="Single + Half + Twin" highlight />
          </div>
        </section>
        {/* ═══ ARTICLE 2: La Sportiva Indoor Revolution ═══ */}
        <section style={section}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span style={{ fontSize: "28px" }}>{"\uD83D\uDC5F"}</span>
            <Badge color={T.yellow}>Coming Fall 2026</Badge>
            <Badge color={T.red}>Not In Our Database</Badge>
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: T.text, letterSpacing: "-0.5px", lineHeight: 1.3, margin: "0 0 6px" }}>
            La Sportiva's Indoor Revolution: 4 New Shoes
          </h2>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.6, margin: "0 0 20px" }}>
            The brand synonymous with outdoor performance is betting big on the gym. The HyperEZ, TX Setter, and TX1 arrive Fall 2026.
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="HyperEZ" value="$119" sub="Indoor beginner shoe" color={T.accent} />
            <StatCard label="TX Setter" value="$169" sub="Route setter shoe" color={T.blue} />
            <StatCard label="Key Tech" value="SenseGrip" sub="From Ondra Comp trickle-down" color={T.green} />
          </div>

          <IndoorLineTable isMobile={isMobile} />

          <Prose>
            La Sportiva has long dominated outdoor climbing shoe performance with icons like the Solution, Skwama, and Theory. But the indoor climbing market — now the primary entry point for new climbers — was served by just a handful of models like the Tarantula ($85) and Oxygym ($99), neither designed from scratch for the gym.
          </Prose>

          <Prose>
            The <strong>HyperEZ</strong> changes that. At $119, it sits above the Tarantula but below aggressive performance shoes. The headline feature is <strong>SenseGrip</strong> — La Sportiva's patented midsole technology originally developed for Adam Ondra's competition shoe, now trickling down to beginners. A high-volume last with dual-crossed straps (inspired by the Katana) and an EVA heel wedge prioritize comfort for climbers still building foot strength.
          </Prose>

          <BeginnerPriceChart isMobile={isMobile} />

          <KeyInsight color={T.yellow}>
            <strong>The Gap La Sportiva is Filling:</strong> Between the $85 Tarantula and $159+ performance shoes, there was nothing from La Sportiva purpose-built for indoor progression. The HyperEZ at $119 targets exactly this gap — gym climbers moving beyond rentals but not yet ready for aggressive lasts.
          </KeyInsight>

          <Prose>
            The <strong>TX Setter</strong> ($169) is perhaps the more groundbreaking product. Route setters — the people who design the climbs you send — have historically cobbled together approach shoes and worn-out climbing shoes for their grueling 8-hour gym shifts. La Sportiva collaborated with professional setters to create the first shoe designed specifically for them: resoleable construction, approach-shoe cushioning, climbing-shoe sensitivity. It's a tiny market by volume, but it signals La Sportiva's commitment to the gym ecosystem.
          </Prose>

          <KeyInsight color={T.blue}>
            <strong>What's Missing:</strong> La Sportiva hasn't published weight, exact rubber compound, or sole thickness for the new shoes. We expect full spec sheets closer to the Fall 2026 launch. We'll add them to our database as soon as specs drop.
          </KeyInsight>
        </section>
        {/* ═══ ARTICLE 3: Asana G5 BIG Pad ═══ */}
        <section style={section}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span style={{ fontSize: "28px" }}>{"\uD83D\uDECF\uFE0F"}</span>
            <Badge color={T.purple}>Hidden Gem</Badge>
            <Badge color={T.blue}>In Our Database</Badge>
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: T.text, letterSpacing: "-0.5px", lineHeight: 1.3, margin: "0 0 6px" }}>
            The Crashpad Nobody Knows: Asana G5 BIG
          </h2>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.6, margin: "0 0 20px" }}>
            Made in the USA with 1680D ballistic nylon and a cult following. At $425, the Asana G5 BIG is the premium pad that mainstream brands don't want you to find.
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Landing Area" value={"1.48m\u00B2"} sub={"57\u00D740\" open"} color={T.accent} />
            <StatCard label="Thickness" value="13cm" sub="5 inches of dual-density foam" color={T.blue} />
            <StatCard label="Shell" value="1680D" sub="Ballistic nylon (toughest in DB)" color={T.green} />
            <StatCard label="Weight" value="6.8kg" sub="15 lbs with deluxe carry" color={T.yellow} />
          </div>

          <PadComparisonChart isMobile={isMobile} />

          <Prose>
            In a market dominated by European brands like Petzl, Black Diamond, and Edelrid, Asana is a Boulder, Colorado company that builds pads the way bouldering lifers want them built. The G5 BIG's 1680D ballistic nylon shell is the toughest in our entire 103-pad database — matching Mad Rock's Triple Mad Pad and outclassing the 900D fabric used by BD and Petzl.
          </Prose>

          <KeyInsight color={T.purple}>
            <strong>The Denier Advantage:</strong> Shell durability matters more than most climbers realize. Rough granite approaches, desert sandstone, and sharp forest debris chew through 600D fabric in a season. At 1680D, the Asana G5 is built for multi-year abuse. For context: BD Mondo uses 900D, Petzl Cirro uses 900D, and budget pads like the Asana VersaPad use 600D.
          </KeyInsight>

          <Prose>
            At $425 ({"\u20AC"}~395), the G5 BIG isn't cheap. But it sits at a fascinating price-performance point: 5 inches (13cm) of dual-density foam — thicker than the BD Mondo (10cm) and matching Asana's own SuperHero. The carry system includes contoured padded shoulder straps, a sternum strap, cushioned hipbelt, and load lifters. Four high-visibility yellow handles make repositioning easy.
          </Prose>

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "16px", marginTop: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: T.accent, marginBottom: "8px" }}>How It Compares</div>
            <SpecRow label="vs BD Mondo" value={"Mondo: 1.85m\u00B2, 9.3kg, 900D, 10cm, \u20AC380"} />
            <SpecRow label="vs Petzl Cirro" value={"Cirro: 1.75m\u00B2, 8.4kg, 900D, 10cm, \u20AC389"} />
            <SpecRow label="vs Mad Rock Triple" value={"Triple: 2.05m\u00B2, 9.5kg, 1680D, 8cm, \u20AC319"} />
            <SpecRow label="G5 BIG" value={"1.48m\u00B2, 6.8kg, 1680D, 13cm, $425"} highlight />
          </div>

          <KeyInsight>
            <strong>Bottom Line:</strong> The G5 BIG isn't the biggest pad — it prioritizes thickness and durability over raw landing area. If you want maximum m{"\u00B2"}, look at the Organic Big Tri (2.62m{"\u00B2"}) or Asana's own VersaPad Pro (2.40m{"\u00B2"}). But if you want the most protective foam stack under a near-indestructible shell, the G5 BIG is hard to beat.
          </KeyInsight>
        </section>
        {/* ═══ ARTICLE 4: Inflatable Pads ═══ */}
        <section style={section}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span style={{ fontSize: "28px" }}>{"\uD83C\uDF88"}</span>
            <Badge color={T.accent}>Emerging Category</Badge>
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: T.text, letterSpacing: "-0.5px", lineHeight: 1.3, margin: "0 0 6px" }}>
            Inflatable Crashpads: Gimmick or Game-Changer?
          </h2>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.6, margin: "0 0 20px" }}>
            Three brands are betting that air can replace foam. We compared every inflatable pad against traditional crashpads in our database.
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Lightest" value="2.4kg" sub="Sick Sequence" color={T.green} />
            <StatCard label="Biggest" value={"2.04m\u00B2"} sub="Kailas V17" color={T.blue} />
            <StatCard label="All Thickness" value="15cm" sub="Thicker than any foam pad" color={T.accent} />
            <StatCard label="Avg Price" value={"\u20AC270"} sub="Premium but portable" color={T.yellow} />
          </div>

          <InflatableSpecTable isMobile={isMobile} />

          <Prose>
            The idea is simple: replace heavy, bulky foam with air. A Sick Sequence pad weighs 2.4kg and packs into a daypack. A comparable foam pad like the Metolius Session II weighs 4.1kg and takes up your entire pack. For bike-approach bouldering, backcountry missions, or travel climbing, the weight savings are transformative.
          </Prose>

          <InflatableVsFoam isMobile={isMobile} />

          <KeyInsight color={T.green}>
            <strong>The Sick Sequence advantage:</strong> At 2.4kg, it's the lightest "real" crashpad in existence — lighter than sit-start pads like the Edelrid Sit Start II (1.1kg but only 0.44m{"\u00B2"}) when you compare weight-per-landing-area. At 2.14 kg/m{"\u00B2"}, the Sick Sequence delivers the best weight-to-coverage ratio of any pad in or outside our database.
          </KeyInsight>

          <Prose>
            But the physics are different. Foam absorbs energy by compressing — it's a one-way transaction. Air redistributes pressure across the entire chamber. In practice, this means inflatable pads can feel "bouncier" on heel strikes compared to the dead-stop absorption of dense foam. Most reviewers recommend them as a complement to foam pads rather than a full replacement.
          </Prose>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px", margin: "20px 0" }}>
            <div style={{ background: T.card, border: `1px solid ${T.green}30`, borderRadius: T.radiusSm, padding: "16px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: T.green, marginBottom: "8px" }}>{"\u2705"} Where Inflatables Shine</div>
              <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.7 }}>
                Bike-to-boulder approaches. Travel and fly-in bouldering trips. Backcountry sessions where foam pads can't be carried. Supplementing existing foam pads for wider coverage. Adjustable firmness via air pressure.
              </div>
            </div>
            <div style={{ background: T.card, border: `1px solid ${T.red}30`, borderRadius: T.radiusSm, padding: "16px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: T.red, marginBottom: "8px" }}>{"\u26A0\uFE0F"} Where Foam Still Wins</div>
              <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.7 }}>
                Highball bouldering with serious fall consequences. Sharp terrain with puncture risk. Cold weather (air pressure drops). Quick repositioning during sessions. No inflation time needed — just unfold and climb.
              </div>
            </div>
          </div>

          <KeyInsight color={T.accent}>
            <strong>Our Take:</strong> Inflatable pads aren't a gimmick — they're a legitimate new category solving real access problems. But they're not ready to replace your daily driver foam pad for crag sessions. The sweet spot is owning one of each: a foam pad for your home crag and an inflatable for everything else. At {"\u20AC"}240–320, that's a meaningful investment, but for serious boulderers who travel, the math works.
          </KeyInsight>
        </section>
        {/* ═══ FOOTER CTA ═══ */}
        <div style={{
          textAlign: "center", padding: "40px 24px",
          background: `linear-gradient(135deg, ${T.blueSoft}, ${T.greenSoft})`,
          borderRadius: "16px", border: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color: T.text, marginBottom: "8px" }}>Explore the Full Database</div>
          <p style={{ fontSize: "14px", color: T.muted, marginBottom: "20px", lineHeight: 1.6 }}>
            Every product mentioned here is searchable, filterable, and comparable in our gear selectors.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { label: "Ropes", to: "/ropes", icon: "\uD83E\uDDF5" },
              { label: "Shoes", to: "/shoes", icon: "\uD83D\uDC5F" },
              { label: "Crashpads", to: "/crashpads", icon: "\uD83D\uDECF\uFE0F" },
              { label: "Insights", to: "/insights", icon: "\uD83D\uDCCA" },
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

        {/* Sources */}
        <div style={{ marginTop: "32px", padding: "20px", background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Sources</div>
          <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.9 }}>
            {[
              ["Edelrid Siskin Eco Dry", "https://edelrid.com/us-en/sport/ropes/siskin-eco-dry-8-6mm"],
              ["GearJunkie Siskin Review", "https://gearjunkie.com/climbing/edelrid-siskin-8-6-eco-dry-climbing-rope-review"],
              ["La Sportiva Fall 2026 Launch", "https://outdoorindustry.org/press-release/la-sportiva-introduces-new-indoor-climbing-line-in-fall-2026-footwear-launch/"],
              ["Asana G5 BIG Pad", "https://asanaclimbing.com/products/g5-pad"],
              ["Sick Sequence Crash Pad", "https://sicksequence.com/products/ultra-portable-crash-pad"],
              ["Snap Air Shock 1", "https://snapclimbing.com/en/air-shock-1/"],
              ["Kailas Inflatable Pad", "https://kailasgear.com/products/inflatable-bouldering-rock-crash-pad"],
            ].map(([label, url]) => (
              <div key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: T.blue, textDecoration: "none" }}>{label}</a>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}