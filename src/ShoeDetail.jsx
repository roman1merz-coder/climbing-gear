import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { T, BRAND_COLORS } from "./tokens.js";
import { fmt, cap, ensureArray } from "./utils/format.js";
import { calcStretch } from "./utils/stretch.js";
import { getComfortScore, getComfortLabel, _hardnessVal, computeSmearing, computeEdging, computePockets, computeHooks, computeSensitivity, computeSupport, getPercentileScores } from "./utils/comfort.js";
import useIsMobile from "./useIsMobile.js";
import HeartButton from "./HeartButton.jsx";
import usePageMeta from "./usePageMeta.js";
import useStructuredData, { buildShoeSchema } from "./useStructuredData.js";
import PriceAlertForm from "./PriceAlertForm.jsx";

// ═══ DETAIL PAGE COMPONENTS ═══

// ─── Tag ───
function Tag({ children, variant = "default", icon, small }) {
  const styles = {
    default: { bg: T.card, color: T.muted, border: T.border },
    accent: { bg: T.accentSoft, color: T.accent, border: "rgba(201,138,66,0.20)" },
    green: { bg: T.greenSoft, color: T.green, border: "rgba(52,211,153,0.20)" },
    red: { bg: T.redSoft, color: T.red, border: "rgba(239,68,68,0.20)" },
    yellow: { bg: T.yellowSoft, color: T.yellow, border: "rgba(251,191,36,0.20)" },
    blue: { bg: T.blueSoft, color: T.blue, border: "rgba(96,165,250,0.20)" },
    purple: { bg: T.purpleSoft, color: T.purple, border: "rgba(167,139,250,0.20)" },
  };
  const s = styles[variant] || styles.default;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: small ? "3px 8px" : "5px 12px", borderRadius: T.radiusXs,
      fontSize: small ? "10px" : "11px", fontWeight: 600, letterSpacing: "0.3px",
      textTransform: "capitalize", background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, fontFamily: T.font, whiteSpace: "nowrap",
    }}>
      {icon && <span style={{ fontSize: small ? "10px" : "12px" }}>{icon}</span>}
      {typeof children === "string" ? fmt(children) : children}
    </span>
  );
}

function SectionHeader({ icon, title, subtitle, action, compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: compact ? "12px" : "16px", marginTop: compact ? "24px" : "36px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "17px" }}>{icon}</span>
        <div>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: T.text, fontFamily: T.font, margin: 0, letterSpacing: "-0.3px" }}>{title}</h3>
          {subtitle && <p style={{ fontSize: "11px", color: T.muted, margin: "2px 0 0", fontFamily: T.font }}>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ─── Single Net (SVG spider chart) ───
function SpiderNet({ dims, values, size = 180, color = T.accent, softColor = T.accentSoft }) {
  const cx = size / 2, cy = size / 2, r = size * 0.34;
  const n = dims.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;
  const getPoint = (i, val) => {
    const angle = startAngle + i * angleStep;
    return { x: cx + r * val * Math.cos(angle), y: cy + r * val * Math.sin(angle) };
  };
  const rings = [0.33, 0.66, 1];
  const points = dims.map((_, i) => getPoint(i, values[i]));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
      {rings.map(rv => (
        <polygon key={rv} points={dims.map((_, i) => { const p = getPoint(i, rv); return `${p.x},${p.y}`; }).join(" ")}
          fill="none" stroke={T.border} strokeWidth="1" opacity={0.5} />
      ))}
      {dims.map((_, i) => {
        const p = getPoint(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={T.border} strokeWidth="1" opacity={0.3} />;
      })}
      <polygon points={path.replace(/[MLZ]/g, " ").trim()} fill={softColor} stroke={color} strokeWidth="2" opacity={0.85} />
      {dims.map((d, i) => {
        const p = getPoint(i, 1.22);
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: size > 200 ? "10px" : "9px", fontWeight: 600, fill: T.muted, fontFamily: T.font }}>
            {d}
          </text>
        );
      })}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={size > 200 ? 3.5 : 3} fill={color} stroke={T.bg} strokeWidth="1.5" />
      ))}
    </svg>
  );
}

// ─── Performance Radar (single 6-axis, percentile-normalized) ───
function PerformanceRadar({ shoe, allShoes }) {
  const dims = ["Edging", "Smearing", "Pockets", "Hooks", "Comfort", "Sensitivity"];
  const pct = getPercentileScores(shoe, allShoes);
  const values = [pct.edging, pct.smearing, pct.pockets, pct.hooks, pct.comfort, pct.sensitivity];

  return (
    <div style={{ background: T.card, borderRadius: T.radiusSm, padding: "16px", border: `1px solid ${T.border}`, textAlign: "center" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>Performance Profile</div>
      <SpiderNet dims={dims} values={values} size={280} color={T.accent} softColor={T.accentSoft} />
      <div style={{ fontSize: "9px", color: "#4a5568", marginTop: "4px" }}>Percentile rank vs {(allShoes || []).filter(s => !s.kids_friendly).length} shoes</div>
    </div>
  );
}

// ─── Spec Row ───
function SpecRow({ label, value, highlight, confidence }) {
  if (!value) return null;
  const display = Array.isArray(value) ? value.map(fmt).join(", ") : cap(value);
  const confColor = { high: T.green, medium: T.yellow, low: T.red };
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "11px 0", borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ fontSize: "13px", color: T.muted, fontFamily: T.font, display: "flex", alignItems: "center", gap: "6px" }}>
        {label}
        {confidence && (
          <span title={`Data confidence: ${confidence}`} style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: confColor[confidence] || T.muted, display: "inline-block",
          }} />
        )}
      </span>
      <span style={{
        fontSize: "13px", fontWeight: 600, fontFamily: T.font,
        color: highlight ? T.accent : T.text,
      }}>
        {display}
      </span>
    </div>
  );
}

// ─── Price History Mini Chart ───
function PriceChart({ data, width = 320, height = 100 }) {
  if (!data || !data.length) return null;
  const prices = data.map(d => d.price);
  const min = Math.min(...prices) - 5, max = Math.max(...prices) + 5;
  const pad = { l: 35, r: 10, t: 10, b: 22 };
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const pts = data.map((d, i) => ({
    x: pad.l + (i / (data.length - 1)) * w,
    y: pad.t + h - ((d.price - min) / (max - min)) * h,
    ...d,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = linePath + ` L${pts[pts.length-1].x},${pad.t + h} L${pts[0].x},${pad.t + h} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.accent} stopOpacity="0.25" />
          <stop offset="100%" stopColor={T.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[min, (min+max)/2, max].map((v, i) => {
        const y = pad.t + h - ((v - min) / (max - min)) * h;
        return <g key={i}>
          <line x1={pad.l} y1={y} x2={width - pad.r} y2={y} stroke={T.border} strokeWidth="1" strokeDasharray="3,3" />
          <text x={pad.l - 6} y={y + 3} textAnchor="end" style={{ fontSize: "9px", fill: T.muted, fontFamily: T.mono }}>{"\u20AC"}{Math.round(v)}</text>
        </g>;
      })}
      <path d={areaPath} fill="url(#priceGrad)" />
      <path d={linePath} fill="none" stroke={T.accent} strokeWidth="2" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={i === pts.length - 1 ? T.accent : T.card} stroke={T.accent} strokeWidth="1.5" />
      ))}
      {pts.map((p, i) => (
        <text key={`l${i}`} x={p.x} y={pad.t + h + 14} textAnchor="middle" style={{ fontSize: "9px", fill: T.muted, fontFamily: T.font }}>{p.month}</text>
      ))}
    </svg>
  );
}

// ─── Foot Shape Visual (real illustrations from SVG) ───
function FootShapeDiagram({ toe_form, forefoot_volume, width: w, heel_volume }) {
  const descs = {
    egyptian: "Big toe longest, toes descend diagonally",
    greek: "Second toe longest (Morton\u2019s toe)",
    roman: "First three toes roughly equal length",
  };
  const tf = toe_form || "egyptian";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
      <img
        src={`/images/foot-${tf}.png`}
        alt={`${tf} foot shape`}
        style={{ width: "90px", height: "auto", flexShrink: 0, filter: "brightness(0.95)" }}
      />
      <div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, fontFamily: T.font, textTransform: "capitalize", marginBottom: "6px" }}>
          {tf} foot shape
        </div>
        <div style={{ fontSize: "12px", color: T.muted, fontFamily: T.font, lineHeight: 1.6, marginBottom: "12px" }}>
          {descs[tf] || descs.egyptian}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <Tag small variant={w === "narrow" ? "accent" : "default"}>{w} width</Tag>
          <Tag small variant={forefoot_volume === "low" ? "accent" : "default"}>{forefoot_volume} forefoot vol.</Tag>
          <Tag small variant={heel_volume === "narrow" ? "blue" : heel_volume === "wide" ? "yellow" : "default"}>{heel_volume} heel vol.</Tag>
        </div>
      </div>
    </div>
  );
}

// ─── Brand-specific sizing offsets (EU) ───
const BRAND_SIZING = {
  "La Sportiva":  { min: -2.5, max: -1.5, note: "La Sportiva runs small \u2014 aggressive downsizing typical" },
  "Scarpa":       { min: -1.0, max: -0.5, note: "Scarpa runs slightly small \u2014 moderate downsize" },
  "Five Ten":     { min:  0.0, max:  0.5, note: "Five Ten runs true to size \u2014 street size works" },
  "Adidas Five Ten": { min: 0.0, max: 0.5, note: "Five Ten runs true to size \u2014 street size works" },
  "Evolv":        { min:  0.0, max:  0.5, note: "Evolv runs true to size \u2014 no downsize needed" },
  "Butora":       { min: -1.0, max: -0.5, note: "Butora runs close to true \u2014 modest downsize" },
  "Mad Rock":     { min: -0.5, max:  0.0, note: "Mad Rock runs true to size \u2014 optional light downsize" },
  "Ocun":         { min: -0.5, max:  0.0, note: "Oc\u00fan runs true to size \u2014 no downsize needed" },
  "Tenaya":       { min: -1.0, max: -0.5, note: "Tenaya runs snug \u2014 standard downsize" },
  "Boreal":       { min: -0.5, max:  0.0, note: "Boreal runs true to size" },
  "Red Chili":    { min: -0.5, max:  0.0, note: "Red Chili is designed true to size" },
  "Unparallel":   { min: -1.0, max: -0.5, note: "Unparallel runs small \u2014 moderate downsize" },
  "So iLL":       { min: -1.5, max:  0.0, note: "So iLL varies \u2014 check gender-specific sizing" },
  "Black Diamond":{ min: -0.5, max:  0.0, note: "Black Diamond runs close to true size" },
  "EB":           { min: -0.5, max:  0.0, note: "EB runs true to size \u2014 minimal downsize" },
  "Andrea Boldrini": { min: -0.5, max: 0.0, note: "Boldrini runs true to size" },
};
const DEFAULT_SIZING = { min: -1.5, max: -0.5, note: "Size down 0.5\u20131.5 EU from street shoe for performance fit." };

function getBrandSizing(brand) {
  if (!brand) return DEFAULT_SIZING;
  const b = brand.trim();
  if (BRAND_SIZING[b]) return BRAND_SIZING[b];
  // Fuzzy match: check if brand starts with any key
  for (const [key, val] of Object.entries(BRAND_SIZING)) {
    if (b.toLowerCase().startsWith(key.toLowerCase()) || key.toLowerCase().startsWith(b.toLowerCase())) return val;
  }
  return DEFAULT_SIZING;
}

// ─── Sizing Calculator ───
function SizingCalculator({ shoe, compact }) {
  const [streetSize, setStreetSize] = useState("");
  const sizing = getBrandSizing(shoe.brand);
  const sz = parseFloat(streetSize);
  const suggestion = streetSize && !isNaN(sz)
    ? `EU ${(sz + sizing.min).toFixed(1)} \u2013 ${(sz + sizing.max).toFixed(1)}`
    : null;
  return (
    <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>Quick Size Estimator</div>
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: "11px", color: T.muted, display: "block", marginBottom: "4px" }}>Your street shoe (EU)</label>
          <input type="number" value={streetSize} onChange={e => setStreetSize(e.target.value)}
            placeholder="e.g. 42" style={{
              width: "100%", padding: "10px 12px", borderRadius: T.radiusXs,
              border: `1px solid ${T.border}`, background: T.surface, color: T.text,
              fontSize: "14px", fontFamily: T.mono, outline: "none",
            }}
          />
        </div>
        <div style={{ fontSize: "20px", color: T.muted, paddingTop: "16px" }}>{"\u2192"}</div>
        <div style={{ flex: 1.5 }}>
          <label style={{ fontSize: "11px", color: T.muted, display: "block", marginBottom: "4px" }}>Recommended {shoe.brand || ""} size</label>
          <div style={{
            padding: "10px 12px", borderRadius: T.radiusXs, background: suggestion ? T.accentSoft : T.surface,
            border: `1px solid ${suggestion ? "rgba(201,138,66,0.25)" : T.border}`,
            fontSize: "14px", fontWeight: 700, fontFamily: T.mono, color: suggestion ? T.accent : T.muted,
            minHeight: "40px", display: "flex", alignItems: "center",
          }}>
            {suggestion || "Enter your size"}
          </div>
        </div>
      </div>
      <p style={{ fontSize: "11px", color: T.muted, marginTop: "10px", lineHeight: 1.5, fontStyle: "italic" }}>
        {shoe.sizing || sizing.note}
      </p>
    </div>
  );
}

// ─── Stretch Expectation (derived from shoe properties via algorithm) ───
function StretchExpectation({ shoe }) {
  const { label, description: desc, barPos: val } = calcStretch(shoe);

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "16px 20px" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Stretch Expectation</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: T.text }}>{label}</span>
        <span style={{ fontSize: "11px", color: T.muted }}>{desc}</span>
      </div>
      <div style={{ height: "6px", background: T.border, borderRadius: "3px", position: "relative", margin: "12px 0 8px" }}>
        <div style={{ height: "100%", borderRadius: "3px", position: "absolute", top: 0, left: 0, width: `${val * 100}%`, background: `linear-gradient(90deg, ${T.green}, ${T.yellow}, ${T.accent})` }} />
        <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: T.accent, border: `2px solid ${T.bg}`, position: "absolute", top: "-4px", left: `calc(${val * 100}% - 7px)`, boxShadow: "0 0 8px rgba(201,138,66,0.4)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: T.muted, fontFamily: T.mono }}>
        <span>None</span><span>Minimal</span><span>{"\u00BC"} size</span><span>{"\u00BD"} size</span><span>Full size</span>
      </div>
    </div>
  );
}

// ─── "Who is this for?" (max 2 cards) ───
function WhoIsThisFor({ shoe }) {
  const profiles = [];
  if (ensureArray(shoe.skill_level).includes("beginner") || ensureArray(shoe.skill_level).includes("hobby"))
    profiles.push({ icon: "\uD83C\uDF31", label: "Newer climbers", desc: "Comfortable enough for learning, supportive enough for progression" });
  if (ensureArray(shoe.skill_level).includes("intermediate"))
    profiles.push({ icon: "\uD83D\uDCC8", label: "Progressing climbers", desc: "Ready to push grades with more precision and power" });
  if (ensureArray(shoe.skill_level).includes("advanced"))
    profiles.push({ icon: "\uD83D\uDD25", label: "Strong climbers", desc: "Sending hard sport or steep boulders at a high level" });
  if (ensureArray(shoe.skill_level).includes("elite"))
    profiles.push({ icon: "\uD83C\uDFC6", label: "Competition / elite", desc: "Maximum performance for comp climbing and limit sends" });
  if (ensureArray(shoe.use_cases).includes("trad_multipitch"))
    profiles.push({ icon: "\u26F0\uFE0F", label: "Trad & multi-pitch", desc: "All-day comfort, crack protection, durable rubber" });
  if (shoe.width === "wide" || shoe.forefoot_volume === "high")
    profiles.push({ icon: "👣", label: "Wide / high-volume feet", desc: "Generous fit that accommodates broader foot shapes" });
  if (shoe.width === "narrow" || shoe.forefoot_volume === "low")
    profiles.push({ icon: "🦶", label: "Narrow / low-volume feet", desc: "Snug fit designed for slimmer foot shapes" });

  const shown = profiles.slice(0, 2);
  return (
    <div style={{ display: "grid", gridTemplateColumns: shown.length > 1 ? "1fr 1fr" : "1fr", gap: "10px" }}>
      {shown.map((p, i) => (
        <div key={i} style={{
          background: T.card, borderRadius: T.radiusSm, padding: "16px",
          border: `1px solid ${T.border}`, display: "flex", gap: "12px", alignItems: "flex-start",
        }}>
          <span style={{ fontSize: "20px", flexShrink: 0 }}>{p.icon}</span>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: T.text, marginBottom: "3px" }}>{p.label}</div>
            <div style={{ fontSize: "11px", color: T.muted, lineHeight: 1.5 }}>{p.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Pros / Cons ───
function ProsCons({ pros, cons, stacked }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: stacked ? "1fr" : "1fr 1fr", gap: "14px" }}>
      <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: T.green, marginBottom: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Strengths</div>
        {ensureArray(pros).map((p, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "10px", fontSize: "13px", color: T.text, lineHeight: 1.5 }}>
            <span style={{ color: T.green, flexShrink: 0, fontWeight: 700 }}>+</span> {p}
          </div>
        ))}
      </div>
      <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: T.red, marginBottom: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Trade-offs</div>
        {ensureArray(cons).map((c, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "10px", fontSize: "13px", color: T.text, lineHeight: 1.5 }}>
            <span style={{ color: T.red, flexShrink: 0, fontWeight: 700 }}>{"\u2212"}</span> {c}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Performance DNA (4-col grid) ───
function PerformanceDNA({ shoe, compact }) {
  const wallAngles = ensureArray(shoe.best_wall_angles);
  const rockTypes = ensureArray(shoe.best_rock_types);
  const footholdTypes = ensureArray(shoe.best_foothold_types);
  const skillLevels = ensureArray(shoe.skill_level);

  const hookTypes = ["toe_hook", "heel_hook"];
  const footholdTag = (f) => hookTypes.includes(f) ? "purple" : "blue";
  const skillTag = (s) => {
    if (s === "beginner" || s === "hobby") return "green";
    if (s === "intermediate") return "yellow";
    return "accent";
  };

  const cards = [
    { icon: "\uD83D\uDCD0", label: "Wall Angles", items: wallAngles, tagFn: () => "accent" },
    { icon: "\uD83E\uDEA8", label: "Rock Types", items: rockTypes, tagFn: () => "default" },
    { icon: "\uD83E\uDDB6", label: "Foothold Types", items: footholdTypes, tagFn: footholdTag },
    { icon: "\uD83C\uDFAF", label: "Skill Level", items: skillLevels, tagFn: skillTag },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(4, 1fr)", gap: compact ? "10px" : "14px" }}>
      {cards.map((c, ci) => (
        <div key={ci} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "18px", transition: "border-color 0.2s" }}
          onMouseOver={e => e.currentTarget.style.borderColor = "rgba(201,138,66,0.3)"}
          onMouseOut={e => e.currentTarget.style.borderColor = T.border}>
          <div style={{ fontSize: "18px", marginBottom: "10px" }}>{c.icon}</div>
          <div style={{ fontSize: "10px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>{c.label}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {c.items.map((item, i) => <Tag key={i} small variant={c.tagFn(item)}>{item}</Tag>)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Customer Voices ───
function CustomerVoices({ shoe, stacked }) {
  const voices = ensureArray(shoe.customer_voices).slice(0, 4);
  if (!voices.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: stacked ? "1fr" : "1fr 1fr", gap: "14px" }}>
      {voices.map((v, i) => {
        const text = typeof v === "object" && v !== null ? v.text : v;
        return (
          <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "22px", transition: "border-color 0.2s" }}
            onMouseOver={e => e.currentTarget.style.borderColor = "rgba(201,138,66,0.25)"}
            onMouseOut={e => e.currentTarget.style.borderColor = T.border}>
            <div style={{ fontSize: "28px", color: T.accent, opacity: 0.3, fontFamily: "Georgia, serif", lineHeight: 1, marginBottom: "6px" }}>{"\u201C"}</div>
            <div style={{ fontSize: "13px", color: T.text, lineHeight: 1.7, fontStyle: "italic", opacity: 0.9 }}>{text}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Image Gallery ───
function ImageGallery({ shoe, compact }) {
  const [active, setActive] = useState(0);
  // Use images array if available, otherwise fall back to single hero image
  const gallery = Array.isArray(shoe.images) && shoe.images.length > 0 ? shoe.images : null;
  const hasImage = shoe.image_url && shoe.image_url.startsWith("/images/");
  const views = gallery ? gallery.map(img => img.label || "View") : ["Side view", "Top view", "Sole", "Heel"];
  const activeUrl = gallery ? gallery[active]?.url : (hasImage ? shoe.image_url : null);
  const thumbHasImage = (i) => gallery ? !!gallery[i]?.url : (i === 0 && hasImage);
  const thumbUrl = (i) => gallery ? gallery[i]?.url : shoe.image_url;
  return (
    <div>
      <div style={{
        width: "100%", aspectRatio: "4/3", borderRadius: "18px", overflow: "hidden",
        position: "relative", border: `1px solid ${T.border}`,
        background: activeUrl ? "#f5f5f5" : `linear-gradient(135deg, ${T.surface} 0%, ${T.card} 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {activeUrl && <img
          src={activeUrl}
          alt={`${shoe.brand} ${shoe.model} - ${views[active]}`}
          style={{ width: "100%", height: "100%", objectFit: "contain", padding: "16px" }}
        />}
        {!activeUrl && <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "8px", opacity: 0.6 }}>{"\uD83D\uDC5F"}</div>
          <div style={{ fontSize: "11px", color: T.muted, fontFamily: T.font }}>{views[active]}</div>
        </div>}
        {views.length > 1 && <div style={{ position: "absolute", bottom: "16px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "8px" }}>
          {views.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} style={{
              width: i === active ? "24px" : "8px", height: "8px", borderRadius: "4px",
              background: i === active ? T.accent : "rgba(255,255,255,0.3)",
              border: "none", cursor: "pointer", transition: "all 0.3s ease",
            }} />
          ))}
        </div>}
      </div>
      {views.length > 1 && <div style={{ display: "flex", gap: compact ? "6px" : "8px", marginTop: compact ? "8px" : "10px" }}>
        {views.map((v, i) => (
          <button key={i} onClick={() => setActive(i)} style={{
            flex: 1, aspectRatio: "4/3", borderRadius: T.radiusSm,
            border: i === active ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
            background: thumbHasImage(i) ? "#f5f5f5" : T.surface,
            cursor: "pointer", opacity: i === active ? 1 : 0.5,
            transition: "all 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: "2px", overflow: "hidden",
          }}>
            {thumbHasImage(i) && <img src={thumbUrl(i)} alt={`${shoe.model} ${v}`}
              style={{ width: "100%", height: "100%", objectFit: "contain", padding: "4px" }} />}
            {!thumbHasImage(i) && <span style={{ fontSize: "18px", opacity: 0.5 }}>{"\uD83D\uDC5F"}</span>}
            {!thumbHasImage(i) && <span style={{ fontSize: "8px", color: T.muted }}>{v}</span>}
          </button>
        ))}
      </div>}
    </div>
  );
}

// ─── Amazon Search Link ───
function amazonSearchUrl(productType, brand, model) {
  const q = encodeURIComponent(`${productType} ${brand} ${model}`.trim());
  return `https://www.amazon.de/s?k=${q}&tag=climbinggear-21`;
}

function AmazonSearchLink({ productType, brand, model, style = {} }) {
  return (
    <a href={amazonSearchUrl(productType, brand, model)} target="_blank" rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px",
        background: "#232F3E", borderRadius: T.radiusSm || "8px", textDecoration: "none",
        transition: "opacity .15s", ...style }}
      onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
      onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
      <span style={{ fontSize: "13px", fontWeight: 700, color: "#FF9900" }}>amazon</span>
      <span style={{ fontSize: "12px", color: "#fff", flex: 1 }}>Search on Amazon.de</span>
      <span style={{ fontSize: "12px", color: "#FF9900" }}>→</span>
    </a>
  );
}

// ─── Price Comparison Table ───
function PriceComparison({ prices, shoe, compact }) {
  const hasRealRetailer = prices && prices.some(p => !p.shop?.toLowerCase().includes("amazon"));
  // Helper to ensure Amazon URLs include product category search terms
  const getRetailerUrl = (url) => {
    if (!url || url === "#") return undefined;
    if (url.toLowerCase().includes('amazon')) {
      return amazonSearchUrl("climbing shoe", shoe.brand, shoe.model);
    }
    return url;
  };
  if (!prices || !prices.length) {
    return (
      <div>
        <div style={{ background: T.card, borderRadius: T.radius, padding: "32px", border: `1px solid ${T.border}`, textAlign: "center", marginBottom: "8px" }}>
          <div style={{ fontSize: "13px", color: T.muted }}>Price comparison data coming soon</div>
        </div>
        <AmazonSearchLink productType="climbing shoe" brand={shoe.brand} model={shoe.model} />
      </div>
    );
  }
  const best = Math.min(...prices.filter(p => p.inStock && p.price).map(p => p.price));
  return (
    <div>
      <div style={{ background: T.card, borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: "8px" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase" }}>Price Comparison</div>
          <Tag variant="green" small icon={"\u2713"}>Best: {"\u20AC"}{best}</Tag>
        </div>
        {prices.map((p, i) => (
          <a key={i} href={getRetailerUrl(p.url)} target="_blank" rel="noopener noreferrer" style={{
            display: "grid", gridTemplateColumns: compact ? "1fr auto auto" : "1.5fr 0.8fr 0.5fr auto",
            alignItems: "center", padding: compact ? "10px 14px" : "12px 20px",
            gap: compact ? "8px" : "0",
            borderBottom: i < prices.length - 1 ? `1px solid ${T.border}` : "none",
            background: p.price === best && p.inStock ? T.accentSoft : "transparent",
            textDecoration: "none", cursor: p.url && p.url !== "#" ? "pointer" : "default",
            transition: "background .15s",
          }}
          onMouseEnter={e => { if (p.url && p.url !== "#") e.currentTarget.style.background = T.accentSoft; }}
          onMouseLeave={e => { e.currentTarget.style.background = p.price === best && p.inStock ? T.accentSoft : "transparent"; }}
          >
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: compact ? "12px" : "13px", fontWeight: 600, color: T.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.shop}
              </span>
              {p.delivery && (
                <span style={{ fontSize: "10px", color: T.muted, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.delivery}
                </span>
              )}
              {compact && !p.delivery && hasRealRetailer && (
                <span style={{ fontSize: "10px", fontWeight: 600, color: p.inStock ? T.green : T.red }}>
                  {p.inStock ? "In stock" : "Out of stock"}
                </span>
              )}
            </div>
            <span style={{ fontSize: compact ? "14px" : "15px", fontWeight: 800, color: p.price === best ? T.accent : T.text, fontFamily: T.mono, whiteSpace: "nowrap" }}>
              {p.price ? `\u20AC${p.price.toFixed(2)}` : "\u2014"}
            </span>
            {!compact && hasRealRetailer && (
              <span style={{ fontSize: "11px", fontWeight: 600, color: p.inStock ? T.green : T.red }}>
                {p.inStock ? "In stock" : "Out"}
              </span>
            )}
            {p.url && p.url !== "#" && (
              <span style={{ fontSize: "11px", color: T.accent, fontWeight: 600, whiteSpace: "nowrap" }}>
                {"\u2192"} Shop
              </span>
            )}
          </a>
        ))}
      </div>
      <AmazonSearchLink productType="climbing shoe" brand={shoe.brand} model={shoe.model} />
    </div>
  );
}

// ─── Similar / Alternatives MiniCard ───
function MiniCard({ shoe, onClick, matchLabel }) {
  const discount = shoe.price_uvp_eur && shoe.current_price_eur
    ? Math.round(((shoe.price_uvp_eur - shoe.current_price_eur) / shoe.price_uvp_eur) * 100) : 0;
  return (
    <button onClick={onClick} style={{
      background: T.card, borderRadius: T.radiusSm, padding: "16px",
      border: `1px solid ${T.border}`, cursor: "pointer", textAlign: "left",
      transition: "all 0.2s ease", width: "100%",
    }}
      onMouseOver={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {matchLabel && (
        <div style={{ fontSize: "9px", fontWeight: 700, color: T.accent, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>{matchLabel}</div>
      )}
      <div style={{ fontSize: "10px", color: T.muted, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "2px" }}>{shoe.brand}</div>
      <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "8px" }}>{shoe.model}</div>
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" }}>
        {[shoe.closure, shoe.downturn].filter(Boolean).map(t => <Tag key={t} small>{t}</Tag>)}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={{ fontSize: "16px", fontWeight: 800, color: T.accent, fontFamily: T.mono }}>{"\u20AC"}{shoe.current_price_eur}</span>
        {discount > 0 && <span style={{ fontSize: "11px", color: T.green, fontWeight: 700, fontFamily: T.mono }}>{"\u2212"}{discount}%</span>}
      </div>
    </button>
  );
}

// ═══ PRICE INTELLIGENCE ═══
export function getPriceIntelligence(shoe, prices, history, liveBestPrice) {
  const now = new Date();
  const month = now.getMonth();
  const currentYear = now.getFullYear();
  const factors = [];
  let totalScore = 0, totalWeight = 0;

  // Use live lowest price when available, otherwise fall back to seed price
  const effectivePrice = liveBestPrice || shoe.current_price_eur;
  const discount = shoe.price_uvp_eur && effectivePrice
    ? (shoe.price_uvp_eur - effectivePrice) / shoe.price_uvp_eur : 0;

  // Factor 1: Price vs MSRP (30%)
  let ps = discount >= 0.30 ? 1.0 : discount >= 0.20 ? 0.7 : discount >= 0.10 ? 0.3 : discount >= 0.05 ? 0.0 : -0.5;
  factors.push({ name: "Price vs MSRP", score: ps, weight: 0.30,
    detail: discount > 0.01 ? `${Math.round(discount * 100)}% below MSRP (\u20AC${shoe.price_uvp_eur}) — best price \u20AC${effectivePrice}` : `At or near full MSRP (\u20AC${shoe.price_uvp_eur})`,
    icon: ps >= 0.5 ? "\uD83D\uDFE2" : ps >= 0 ? "\uD83D\uDFE1" : "\uD83D\uDD34",
  });
  totalScore += ps * 0.30; totalWeight += 0.30;

  // Factor 2: Stock availability (20%)
  const inStockCount = prices.filter(p => p.inStock).length;
  const totalRetailers = prices.length;
  const hasRealRetailer = prices.some(p => !p.shop?.toLowerCase().includes("amazon"));
  if (totalRetailers > 0 && hasRealRetailer) {
    let ss = inStockCount <= 1 ? 0.8 : inStockCount <= 3 ? 0.3 : -0.2;
    factors.push({ name: "Stock Availability", score: ss, weight: 0.20,
      detail: `In stock at ${inStockCount} of ${totalRetailers} retailers`,
      icon: inStockCount <= 2 ? "\uD83D\uDD34" : inStockCount <= 4 ? "\uD83D\uDFE1" : "\uD83D\uDFE2",
    });
    totalScore += ss * 0.20; totalWeight += 0.20;
  } else {
    factors.push({ name: "Stock Availability", score: 0, weight: 0.20,
      detail: "Coming soon \u2014 retailer stock tracking in progress",
      icon: "\u23F3",
    });
  }

  // Factor 3: Expected Price Development (15%)
  factors.push({ name: "Expected Price Development", score: 0, weight: 0.15,
    detail: "Coming soon \u2014 data collection in progress",
    icon: "\u23F3",
  });
  // Don't add to totalScore/totalWeight — this factor is placeholder
    const seasonScore = 0; // placeholder — prevents ReferenceError in forecast text

  // Factor 4: Model lifecycle (15%)
  const modelAge = shoe.year_released ? currentYear - shoe.year_released : null;
  if (modelAge !== null) {
    let as, ad;
    if (modelAge >= 3) { as = 0.5; ad = `Released ${shoe.year_released} (${modelAge}y ago) \u2014 expect clearance pricing`; }
    else if (modelAge >= 2) { as = -0.3; ad = `Released ${shoe.year_released} (${modelAge}y ago) \u2014 successor may trigger price drops`; }
    else if (modelAge >= 1) { as = 0.0; ad = `Released ${shoe.year_released} \u2014 current model, stable pricing`; }
    else { as = -0.4; ad = `Released ${shoe.year_released} \u2014 brand-new, rarely discounted`; }
    factors.push({ name: "Model Lifecycle", score: as, weight: 0.15, detail: ad,
      icon: as > 0.2 ? "\uD83D\uDFE2" : as >= -0.1 ? "\uD83D\uDFE1" : "\uD83D\uDD34",
    });
    totalScore += as * 0.15; totalWeight += 0.15;
  }

  // Factor 5: Price Trend (20% — coming soon, history data not yet reliable)
  factors.push({ name: "Price Trend", score: 0, weight: 0.20,
    detail: "Coming soon \u2014 historical data collection in progress",
    icon: "\uD83D\uDCCA",
  });
  // Don't add to totalScore/totalWeight — this factor is placeholder

  const ns = totalWeight > 0 ? totalScore / totalWeight : 0;
  let signal, label, color, bgColor, icon;
  if (ns >= 0.45) { signal = "buy_now"; label = "Buy Now"; color = T.green; bgColor = T.greenSoft; icon = "\uD83D\uDFE2"; }
  else if (ns >= 0.15) { signal = "good_deal"; label = "Good Deal"; color = T.green; bgColor = T.greenSoft; icon = "\uD83D\uDC4D"; }
  else if (ns >= -0.15) { signal = "fair_price"; label = "Fair Price"; color = T.yellow; bgColor = T.yellowSoft; icon = "\u2696\uFE0F"; }
  else if (ns >= -0.40) { signal = "consider_waiting"; label = "Consider Waiting"; color = T.accent; bgColor = T.accentSoft; icon = "\u23F3"; }
  else { signal = "wait"; label = "Wait for Sale"; color = T.red; bgColor = T.redSoft; icon = "\uD83D\uDD34"; }

  const parts = [];
  if (ns >= 0.3) {
    parts.push("This is a strong buying moment.");
    if (discount >= 0.15) parts.push(`At ${Math.round(discount*100)}% off MSRP (\u20AC${effectivePrice} vs \u20AC${shoe.price_uvp_eur}), you're getting solid value.`);
    if (inStockCount > 0 && inStockCount <= 2) parts.push("Limited stock adds urgency.");
    parts.push("We don't expect significantly better pricing short-term.");
  } else if (ns >= 0) {
    parts.push("Reasonable price but not exceptional.");
    if (seasonScore < 0) parts.push("Prices tend to drop during sale season (Nov\u2013Feb).");
    if (modelAge >= 2) parts.push("A successor model may push this one's price down.");
    else parts.push("Current-model pricing is relatively stable.");
  } else {
    parts.push("We recommend waiting for a better price.");
    if (seasonScore < 0) parts.push("Peak season pricing \u2014 expect deals in autumn/winter.");
    if (modelAge === 0) parts.push("Newly released shoes rarely see discounts in year one.");
    if (discount < 0.05) parts.push("Currently at or near full MSRP.");
  }
  return { signal, label, color, bgColor, icon, score: ns, factors, forecast: parts.join(" ") };
}

// ═══ USE CASE ICON MAP ═══
const USE_CASE_ICONS = {
  boulder: "\uD83E\uDEA8", sport: "\uD83E\uDDD7", trad_multipitch: "\u26F0\uFE0F",
  gym: "\uD83C\uDFE2", indoor: "\uD83C\uDFE2", crack: "\uD83E\uDEA8", alpine: "\uD83C\uDFD4\uFE0F",
};
const USE_CASE_TAG_VARIANT = {
  boulder: "accent", sport: "blue", trad_multipitch: "green",
  gym: "default", indoor: "default", crack: "yellow", alpine: "green",
};

// ═══ SHOE DETAIL PAGE (3-Tab Layout) ═══
export default function ShoeDetail({ shoes = [], priceData = {}, priceHistory = [] }) {
  const { slug } = useParams();
  const shoe = shoes.find(s => s.slug === slug);
  usePageMeta(
    shoe ? `${shoe.brand} ${shoe.model} — Specs, Scores & Prices` : null,
    shoe ? `${shoe.brand} ${shoe.model} climbing shoe: detailed specs, 10-axis performance profile, and price comparison.` : null
  );
  useStructuredData(buildShoeSchema(shoe, priceData));
  if (!shoe) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, padding: "40px", fontFamily: T.font }}>
        <Link to="/shoes" style={{ color: T.accent, textDecoration: "none", fontWeight: 600, fontSize: "14px" }}>{"\u2190"} Back to search</Link>
        <div style={{ textAlign: "center", marginTop: "60px", color: T.muted }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>{"\uD83E\uDDD7"}</div>
          <div style={{ fontSize: "16px" }}>Shoe not found</div>
        </div>
      </div>
    );
  }

  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("overview");
  const prices = priceData[slug] || [];
  const history = priceHistory[slug] || [];

  // Compute live best price from retailer data
  const inStockPrices = prices.filter(p => p.inStock && p.price > 0).map(p => p.price);
  const liveBestPrice = inStockPrices.length > 0 ? Math.min(...inStockPrices) : null;
  const effectivePrice = liveBestPrice || shoe.current_price_eur;
  const bestOffer = prices.find(p => p.inStock && p.price === liveBestPrice) || prices[0];
  const bestOfferUrl = bestOffer?.url && bestOffer.url !== "#" ? bestOffer.url : null;
  const intel = getPriceIntelligence(shoe, prices, history, liveBestPrice);
  const discount = shoe.price_uvp_eur && effectivePrice && effectivePrice < shoe.price_uvp_eur
    ? Math.round(((shoe.price_uvp_eur - effectivePrice) / shoe.price_uvp_eur) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text }}>
      {/* Header */}
      <header style={{ padding: isMobile ? "8px 16px" : "10px 32px", borderBottom: `1px solid ${T.border}`, background: T.bg }}>
        <Link to="/shoes" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: T.text, textDecoration: "none", fontWeight: 600, fontSize: isMobile ? "13px" : "14px", padding: isMobile ? "4px 0" : "0", minHeight: isMobile ? "44px" : "auto" }}>
          {"\u2190"} Search
        </Link>
      </header>

      {/* ═══ HERO ═══ */}
      <div style={{ padding: isMobile ? "20px 16px" : "40px 32px", borderBottom: `1px solid ${T.border}`, background: `linear-gradient(135deg, ${T.surface} 0%, ${T.card} 100%)` }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "20px" : "40px", alignItems: "start" }}>
            {/* Left: Image Gallery */}
            <div>
              <ImageGallery shoe={shoe} compact={isMobile} />
            </div>

            {/* Right: Hero Info — flex column to push radar down */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* Brand + Gender + Use Case tags on ONE line */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                <span style={{ fontSize: "24px", color: BRAND_COLORS[shoe.brand] || T.accent }}>{"\u25CF"}</span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase" }}>{shoe.brand}</span>
                <Tag small>{cap(shoe.gender || "unisex")}</Tag>
                {ensureArray(shoe.use_cases).length > 0 && (
                  <span style={{ width: "1px", height: "16px", background: T.border, margin: "0 2px" }} />
                )}
                {ensureArray(shoe.use_cases).map((uc, i) => (
                  <Tag key={i} small variant={USE_CASE_TAG_VARIANT[uc] || "default"} icon={USE_CASE_ICONS[uc]}>
                    {uc}
                  </Tag>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: isMobile ? "0 0 14px" : "0 0 20px" }}>
                <h1 style={{ fontSize: isMobile ? "24px" : "32px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>{shoe.model}</h1>
                <HeartButton type="shoe" slug={shoe.slug} style={{ fontSize: "22px" }} />
              </div>

              {/* Price Comparison in Hero */}
              <div style={{ marginBottom: isMobile ? "16px" : "20px" }}>
                <PriceComparison prices={prices} shoe={shoe} compact={isMobile} />
              </div>

              {/* Price Alert */}
              <PriceAlertForm gearType="shoe" slug={shoe.slug} currentPrice={effectivePrice} isMobile={isMobile} />

              {/* Flex spacer pushes radar to bottom, aligned with image thumbnails */}
              {!isMobile && <div style={{ flex: 1 }} />}

              {/* Single 6-axis Performance Radar — hidden on mobile (shown in overview tab) */}
              {!isMobile && <PerformanceRadar shoe={shoe} allShoes={shoes} />}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: isMobile ? "20px 16px" : "40px 32px" }}>
        <div style={{ display: "flex", gap: isMobile ? "0" : "20px", marginBottom: isMobile ? "24px" : "40px", borderBottom: `1px solid ${T.border}`, paddingBottom: isMobile ? "12px" : "20px" }}>
          {[{ key: "overview", label: "Overview" }, { key: "prices", label: isMobile ? "Prices" : "Price & Availability" }, { key: "specs", label: "Specs" }].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: isMobile ? "8px 12px" : "8px 16px", border: "none", background: "transparent", color: activeTab === tab.key ? T.accent : T.muted,
              fontSize: isMobile ? "13px" : "14px", fontWeight: activeTab === tab.key ? 700 : 600, cursor: "pointer", borderBottom: activeTab === tab.key ? `2px solid ${T.accent}` : "none",
              transition: "all 0.2s ease", fontFamily: T.font, flex: isMobile ? 1 : "none", textAlign: "center",
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ OVERVIEW TAB ═══ */}
        {activeTab === "overview" && (
          <div>
            {/* Two-col: Description + Foot Shape | Best For + Pros/Cons */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "8px" : "40px" }}>
              {/* Left col */}
              <div>
                <SectionHeader icon={"\uD83D\uDCCB"} title="Overview" compact={isMobile} />
                <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.8, marginBottom: "36px" }}>{shoe.description}</p>

                <SectionHeader icon="🦶" title="Foot Shape & Sizing" compact={isMobile} />
                <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                  <FootShapeDiagram toe_form={shoe.toe_form} forefoot_volume={shoe.forefoot_volume} width={shoe.width} heel_volume={shoe.heel_volume} />
                </div>
              </div>

              {/* Right col */}
              <div>
                <SectionHeader icon={"\uD83C\uDFAF"} title="Best For" compact={isMobile} />
                <WhoIsThisFor shoe={shoe} />

                <SectionHeader icon={"\u2696\uFE0F"} title="Strengths & Trade-offs" compact={isMobile} />
                <ProsCons pros={shoe.pros} cons={shoe.cons} stacked={isMobile} />
              </div>
            </div>

            {/* Full-width: Sizing + Stretch side by side (50/50) */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "16px" : "40px", marginTop: isMobile ? "8px" : "36px" }}>
              <SizingCalculator shoe={shoe} compact={isMobile} />
              <StretchExpectation shoe={shoe} />
            </div>

            {/* Full-width: Performance DNA */}
            <SectionHeader icon={"\uD83E\uDDEC"} title="Performance DNA" subtitle="Where this shoe excels" compact={isMobile} />
            {isMobile && <PerformanceRadar shoe={shoe} allShoes={shoes} />}
            <PerformanceDNA shoe={shoe} compact={isMobile} />

            {/* Full-width: Customer Voices */}
            <SectionHeader icon={"\uD83D\uDCAC"} title="What Climbers Say" subtitle="Real feedback from verified climbers" compact={isMobile} />
            <CustomerVoices shoe={shoe} stacked={isMobile} />
          </div>
        )}

        {/* ═══ PRICE & AVAILABILITY TAB ═══ */}
        {activeTab === "prices" && (
          <div>
            <SectionHeader icon={"\uD83D\uDCC8"} title="Price History" subtitle={isMobile ? "Price evolution" : "Historical price evolution and directional forecast"} compact={isMobile} />
            <div style={{ background: T.card, borderRadius: T.radius, padding: "24px", border: `1px solid ${T.border}`, marginBottom: "36px" }}>
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.4 }}>{"\uD83D\uDCCA"}</div>
                <div style={{ fontSize: "12px", color: T.muted }}>Price history data coming soon</div>
              </div>
            </div>

            {/* Size Selection & Stock Availability placeholders */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "12px" : "16px", marginBottom: "36px" }}>
              {/* Size Selection */}
              <div style={{
                background: T.card, borderRadius: T.radius, border: `1px dashed ${T.border}`,
                padding: "24px", position: "relative", overflow: "hidden",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                  <span style={{ fontSize: "16px" }}>{"\uD83D\uDC5F"}</span>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: T.text, letterSpacing: "0.5px" }}>Size Selection</div>
                  <span style={{
                    fontSize: "9px", fontWeight: 700, color: T.accent, letterSpacing: "1px", textTransform: "uppercase",
                    background: T.accentSoft, padding: "3px 8px", borderRadius: "6px", border: `1px solid rgba(201,138,66,0.2)`,
                  }}>Coming Soon</span>
                </div>
                {/* Fake size pills */}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", opacity: 0.3, pointerEvents: "none" }}>
                  {["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"].map(s => (
                    <span key={s} style={{
                      padding: "6px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                      fontFamily: T.mono, background: T.surface, color: T.muted, border: `1px solid ${T.border}`,
                    }}>{s}</span>
                  ))}
                </div>
                <div style={{ fontSize: "11px", color: T.muted, marginTop: "12px", lineHeight: 1.5 }}>
                  Select your EU size to see size-specific prices and availability across retailers
                </div>
              </div>

              {/* Stock Availability Check */}
              <div style={{
                background: T.card, borderRadius: T.radius, border: `1px dashed ${T.border}`,
                padding: "24px", position: "relative", overflow: "hidden",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                  <span style={{ fontSize: "16px" }}>{"\uD83D\uDCE6"}</span>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: T.text, letterSpacing: "0.5px" }}>Stock Availability</div>
                  <span style={{
                    fontSize: "9px", fontWeight: 700, color: T.accent, letterSpacing: "1px", textTransform: "uppercase",
                    background: T.accentSoft, padding: "3px 8px", borderRadius: "6px", border: `1px solid rgba(201,138,66,0.2)`,
                  }}>Coming Soon</span>
                </div>
                {/* Fake retailer stock rows */}
                <div style={{ opacity: 0.3, pointerEvents: "none" }}>
                  {["bergfreunde.de", "basislager.de", "Amazon.de"].map((r, i) => (
                    <div key={r} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 0", borderBottom: i < 2 ? `1px solid ${T.border}` : "none",
                    }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: T.text }}>{r}</span>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {[38, 39, 40, 41, 42].map(s => (
                          <span key={s} style={{
                            width: "6px", height: "6px", borderRadius: "50%",
                            background: i === 1 && s === 40 ? T.red : T.green,
                          }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "11px", color: T.muted, marginTop: "12px", lineHeight: 1.5 }}>
                  Real-time stock checks per size across all tracked retailers
                </div>
              </div>
            </div>

            <SectionHeader icon={"\uD83E\uDDE0"} title="Price Intelligence" subtitle="Algorithmic buy/wait recommendation" compact={isMobile} />
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
              {intel.factors.map((f, i) => (
                <div key={i} style={{ background: T.card, borderRadius: T.radiusSm, padding: "14px", border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "14px" }}>{f.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: T.text }}>{f.name}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: T.muted, lineHeight: 1.5 }}>{f.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ SPECS TAB ═══ */}
        {activeTab === "specs" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "16px" : "40px" }}>
            {/* Left: Build Details (includes Weight + Break-in) */}
            <div>
              <SectionHeader icon={"\uD83D\uDD27"} title="Build Details" compact={isMobile} />
              <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                <SpecRow label="Closure" value={cap(shoe.closure)} />
                <SpecRow label="Downturn" value={cap(shoe.downturn)} />
                <SpecRow label="Asymmetry" value={cap(shoe.asymmetry)} />
                <SpecRow label="Toe Patch" value={cap(shoe.toe_patch)} />
                <SpecRow label="Heel Rubber" value={cap(shoe.heel_rubber_coverage)} />
                <SpecRow label="Midsole" value={cap(shoe.midsole)} />
                <SpecRow label="Rand" value={cap(shoe.rand)} />
                <SpecRow label="Upper Material" value={cap(shoe.upper_material)} />
                <SpecRow label="Weight (pair)" value={shoe.weight_g ? `${shoe.weight_g}g` : null} />
                <SpecRow label="Break-in" value={cap(shoe.break_in_period)} />
              </div>
            </div>

            {/* Right: Rubber System + Sustainability */}
            <div>
              <SectionHeader icon={"\uD83D\uDEDE"} title="Rubber System" compact={isMobile} />
              <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}`, marginBottom: "36px" }}>
                <SpecRow label="Manufacturer" value={cap(shoe.rubber_manufacturer)} />
                <SpecRow label="Compound" value={shoe.rubber_compound || shoe.rubber_type} />
                <SpecRow label="Thickness" value={shoe.rubber_thickness_mm ? `${shoe.rubber_thickness_mm}mm` : null} />
                <SpecRow label="Hardness" value={Array.isArray(shoe.rubber_hardness) ? shoe.rubber_hardness.map(cap).join(", ") : cap(shoe.rubber_hardness)} />
                <SpecRow label="Durability" value={Array.isArray(shoe.durability) ? shoe.durability.map(cap).join(", ") : cap(shoe.durability)} />
              </div>

              <SectionHeader icon={"\uD83C\uDF31"} title="Sustainability" compact={isMobile} />
              <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: shoe.recycled_material_pct != null ? "16px" : "0" }}>
                  {shoe.vegan && <Tag variant="green" icon={"\uD83C\uDF31"}>Vegan</Tag>}
                  {shoe.resoleable && <Tag variant="blue" icon={"\uD83D\uDD27"}>Resoleable</Tag>}
                  {shoe.recycled_material_pct != null && (
                    <Tag variant="green" icon={"\u267B\uFE0F"}>{shoe.recycled_material_pct}% Recycled</Tag>
                  )}
                </div>
                {shoe.recycled_material_pct != null && (
                  <div style={{ marginTop: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", color: T.muted, fontWeight: 600 }}>Recycled material</span>
                      <span style={{ fontSize: "11px", color: T.green, fontWeight: 700, fontFamily: T.mono }}>{shoe.recycled_material_pct}%</span>
                    </div>
                    <div style={{ height: "4px", borderRadius: "2px", background: T.border, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${shoe.recycled_material_pct}%`, borderRadius: "2px", background: `linear-gradient(90deg, ${T.green}88, ${T.green})` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer with similar shoes
           SIMILAR PRODUCTS LOGIC:
           Shows up to 4 shoes that match EITHER:
           1. Same skill_level (any overlap) — e.g. both "intermediate" shoes
           2. Same downturn — e.g. both "aggressive" shoes
           First matches shown, no scoring/ranking applied. */}
      <div style={{ padding: isMobile ? "24px 16px" : "40px 32px", borderTop: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <SectionHeader icon={"\uD83D\uDC5F"} title="You May Also Like" subtitle="Similar performance and fit" compact={isMobile} />
          <div style={{ display: isMobile ? "flex" : "grid", gridTemplateColumns: isMobile ? undefined : "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", overflowX: isMobile ? "auto" : undefined, paddingBottom: isMobile ? "8px" : undefined, WebkitOverflowScrolling: "touch" }}>
            {shoes
              .filter(s => s.slug !== slug && (
                (ensureArray(s.skill_level).some(l => ensureArray(shoe.skill_level).includes(l))) ||
                (s.downturn === shoe.downturn)
              ))
              .slice(0, 4)
              .map(s => (
                <div key={s.slug} style={{ minWidth: isMobile ? "200px" : undefined, flex: isMobile ? "0 0 auto" : undefined }}>
                  <MiniCard shoe={s} onClick={() => { navigate(`/shoe/${s.slug}`); window.scrollTo(0, 0); }} />
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Legal disclaimer */}
      <div style={{ padding: isMobile ? "20px 16px" : "24px 32px", borderTop: `1px solid ${T.border}`, background: T.bg }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "11px", color: T.muted, lineHeight: 1.7, fontFamily: T.font, margin: 0, maxWidth: "800px" }}>
            <strong style={{ color: T.muted, fontWeight: 600 }}>Disclaimer:</strong>{" "}
            Prices, availability, and product data are provided for informational purposes only and may change without notice.
            This site contains affiliate links {"\u2014"} if you purchase through these links, we may earn a commission at no extra cost to you.
            Product images and specifications are sourced from manufacturers and retailers.
            Community reviews reflect individual experiences and may not represent typical results.
            Always verify pricing and details with the retailer before purchasing.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        padding: isMobile ? "16px" : "24px 32px", borderTop: `1px solid ${T.border}`,
        display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "8px" : 0,
        justifyContent: "space-between", alignItems: "center",
        fontSize: "12px", color: T.muted, fontFamily: T.font,
      }}>
        <span>&copy; {new Date().getFullYear()} climbing-gear.com</span>
        <div style={{ display: "flex", gap: "20px" }}>
          <Link to="/about" style={{ color: T.muted, textDecoration: "none" }}>About</Link>
          <Link to="/impressum" style={{ color: T.muted, textDecoration: "none" }}>Impressum</Link>
          <Link to="/privacy" style={{ color: T.muted, textDecoration: "none" }}>Datenschutz</Link>
        </div>
      </footer>
    </div>
  );
}
