import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { T, BRAND_COLORS } from "./tokens.js";
import { fmt, cap, ensureArray } from "./utils/format.js";
import { getComfortScore, getComfortLabel, FEEL_SCORE_MAP, _hardnessVal, computeSmearing, computeEdging, computePockets, computeHooks } from "./utils/comfort.js";

// ═══ DETAIL PAGE COMPONENTS ═══
// ─── Tiny Components ───
function Tag({ children, variant = "default", icon, small }) {
  const styles = {
    default: { bg: T.card, color: T.muted, border: T.border },
    accent: { bg: T.accentSoft, color: T.accent, border: "rgba(232,115,74,0.20)" },
    green: { bg: T.greenSoft, color: T.green, border: "rgba(52,211,153,0.20)" },
    red: { bg: T.redSoft, color: T.red, border: "rgba(239,68,68,0.20)" },
    yellow: { bg: T.yellowSoft, color: T.yellow, border: "rgba(251,191,36,0.20)" },
    blue: { bg: T.blueSoft, color: T.blue, border: "rgba(96,165,250,0.20)" },
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

function SectionHeader({ icon, title, subtitle, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", marginTop: "36px" }}>
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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
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
            style={{ fontSize: "9px", fontWeight: 600, fill: T.muted, fontFamily: T.font }}>
            {d}
          </text>
        );
      })}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} stroke={T.bg} strokeWidth="1.5" />
      ))}
    </svg>
  );
}

// ─── Dual Radar: Specs + Style side-by-side ───
function DualRadar({ shoe }) {
  // === SPECS NET ===
  // Normalise raw specs to 0-1 range
  const specDims = ["Downturn", "Asymmetry", "Sensitivity", "Support", "Weight"];
  const dtVal = ({ flat: 0.15, moderate: 0.5, aggressive: 0.9 })[shoe.downturn] || 0.5;
  const asymVal = ({ none: 0.15, slight: 0.5, strong: 0.9 })[shoe.asymmetry] || 0.5;
  const feelVal = FEEL_SCORE_MAP[shoe.feel] || 0.5;  // soft = high sensitivity
  // Support: composite of rubber hardness (40%) + rubber thickness (35%) + midsole (25%)
  // harder rubber + thicker rubber + full midsole = more support
  const hardComp = 1 - (_hardnessVal(shoe));  // hard = high support
  const thickComp = shoe.rubber_thickness_mm ? Math.min(1, Math.max(0, (shoe.rubber_thickness_mm - 2) / 3)) : 0.5;
  const midComp = ({ full: 0.9, partial: 0.5, none: 0.1 })[shoe.midsole] || 0.5;
  const supportVal = Math.min(1, hardComp * 0.40 + thickComp * 0.35 + midComp * 0.25);
  // Weight: 200g (lightest) → 1.0, 890g (heaviest) → 0.05, inverted so lighter = higher
  const weightVal = shoe.weight_g ? Math.min(1, Math.max(0.05, 1 - (shoe.weight_g - 200) / 690)) : 0.5;
  const specValues = [dtVal, asymVal, feelVal, supportVal, weightVal];

  // === STYLE NET ===
  const styleDims = ["Smearing", "Edging", "Pockets", "Hooks", "Comfort"];
  const styleValues = [
    computeSmearing(shoe),
    computeEdging(shoe),
    computePockets(shoe),
    computeHooks(shoe),
    getComfortScore(shoe),
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
      <div style={{ background: T.card, borderRadius: T.radiusSm, padding: "12px 8px 8px", border: `1px solid ${T.border}`, textAlign: "center" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>Specs</div>
        <SpiderNet dims={specDims} values={specValues} size={180} color={T.accent} softColor={T.accentSoft} />
      </div>
      <div style={{ background: T.card, borderRadius: T.radiusSm, padding: "12px 8px 8px", border: `1px solid ${T.border}`, textAlign: "center" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>Style</div>
        <SpiderNet dims={styleDims} values={styleValues} size={180} color={T.blue} softColor={T.blueSoft} />
      </div>
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
          <text x={pad.l - 6} y={y + 3} textAnchor="end" style={{ fontSize: "9px", fill: T.muted, fontFamily: T.mono }}>€{Math.round(v)}</text>
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

// ─── Foot Shape Visual ───
function FootShapeDiagram({ toe_form, volume, width: w, heel }) {
  const body = "M15,62 Q12,80 14,100 Q16,125 22,145 Q28,165 35,180 Q42,192 50,195 Q58,192 65,180 Q72,165 78,145 Q84,125 86,100 Q88,80 85,62";

  const toeShapes = {
    egyptian: {
      toes: [
        "M15,62 Q13,50 15,38 Q17,24 22,16 Q27,8 32,8 Q37,8 39,16 Q41,24 40,38 Q39,50 38,62",
        "M38,62 Q38,52 39,42 Q40,30 43,22 Q46,16 49,16 Q52,16 54,22 Q56,30 56,42 Q56,52 55,62",
        "M55,62 Q55,52 56,44 Q57,34 59,28 Q61,22 63,22 Q65,22 67,28 Q69,34 69,44 Q69,52 68,62",
        "M68,62 Q68,54 69,47 Q70,39 71,34 Q73,29 75,29 Q77,29 78,34 Q79,39 79,47 Q79,54 78,62",
        "M78,62 Q79,56 79,51 Q80,45 81,41 Q82,37 83,37 Q85,37 85,41 Q86,45 86,51 Q86,56 85,62",
      ],
    },
    greek: {
      toes: [
        "M15,62 Q13,50 15,38 Q17,26 22,20 Q27,14 32,14 Q37,14 39,20 Q41,26 40,38 Q39,50 38,62",
        "M38,62 Q38,50 39,38 Q40,24 43,16 Q46,8 49,8 Q52,8 54,16 Q56,24 56,38 Q56,50 55,62",
        "M55,62 Q55,52 56,42 Q57,30 59,24 Q61,18 63,18 Q65,18 67,24 Q69,30 69,42 Q69,52 68,62",
        "M68,62 Q68,54 69,47 Q70,39 71,34 Q73,29 75,29 Q77,29 78,34 Q79,39 79,47 Q79,54 78,62",
        "M78,62 Q79,56 79,51 Q80,45 81,41 Q82,37 83,37 Q85,37 85,41 Q86,45 86,51 Q86,56 85,62",
      ],
    },
    roman: {
      toes: [
        "M15,62 Q13,50 15,38 Q17,26 22,18 Q27,10 32,10 Q37,10 39,18 Q41,26 40,38 Q39,50 38,62",
        "M38,62 Q38,50 39,40 Q40,28 43,20 Q46,12 49,12 Q52,12 54,20 Q56,28 56,40 Q56,50 55,62",
        "M55,62 Q55,52 56,42 Q57,30 59,22 Q61,14 63,14 Q65,14 67,22 Q69,30 69,42 Q69,52 68,62",
        "M68,62 Q68,54 69,47 Q70,39 71,34 Q73,29 75,29 Q77,29 78,34 Q79,39 79,47 Q79,54 78,62",
        "M78,62 Q79,56 79,51 Q80,45 81,41 Q82,37 83,37 Q85,37 85,41 Q86,45 86,51 Q86,56 85,62",
      ],
    },
  };

  const descs = {
    egyptian: "Big toe longest, toes descend diagonally",
    greek: "Second toe longest (Morton's toe)",
    roman: "First three toes roughly equal length",
  };

  const shape = toeShapes[toe_form] || toeShapes.egyptian;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
      <svg width="80" height="150" viewBox="5 2 90 198" style={{ flexShrink: 0 }}>
        <path d={body} fill={T.accentSoft} stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {shape.toes.map((d, i) => (
          <path key={i} d={d} fill={T.accentSoft} stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, fontFamily: T.font, textTransform: "capitalize", marginBottom: "6px" }}>
          {toe_form} foot shape
        </div>
        <div style={{ fontSize: "12px", color: T.muted, fontFamily: T.font, lineHeight: 1.6, marginBottom: "12px" }}>
          {descs[toe_form] || descs.egyptian}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <Tag small variant={w === "narrow" ? "accent" : "default"}>{w} width</Tag>
          <Tag small variant={volume === "low" ? "accent" : "default"}>{volume} volume</Tag>
          <Tag small variant={heel === "narrow" ? "blue" : heel === "wide" ? "yellow" : "default"}>{heel} heel</Tag>
        </div>
      </div>
    </div>
  );
}

// ─── Sizing Calculator ───
function SizingCalculator({ shoe }) {
  const [streetSize, setStreetSize] = useState("");
  const suggestion = streetSize ? `EU ${(parseFloat(streetSize) - 1.5).toFixed(1)} – ${(parseFloat(streetSize) - 0.5).toFixed(1)}` : null;
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
        <div style={{ fontSize: "20px", color: T.muted, paddingTop: "16px" }}>→</div>
        <div style={{ flex: 1.5 }}>
          <label style={{ fontSize: "11px", color: T.muted, display: "block", marginBottom: "4px" }}>Recommended size</label>
          <div style={{
            padding: "10px 12px", borderRadius: T.radiusXs, background: suggestion ? T.accentSoft : T.surface,
            border: `1px solid ${suggestion ? "rgba(232,115,74,0.25)" : T.border}`,
            fontSize: "14px", fontWeight: 700, fontFamily: T.mono, color: suggestion ? T.accent : T.muted,
            minHeight: "40px", display: "flex", alignItems: "center",
          }}>
            {suggestion || "Enter your size"}
          </div>
        </div>
      </div>
      <p style={{ fontSize: "11px", color: T.muted, marginTop: "10px", lineHeight: 1.5, fontStyle: "italic" }}>
        {shoe.sizing || `Size down 0.5–1.5 EU from street shoe for performance fit.`}
      </p>
    </div>
  );
}

// ─── "Who is this for?" ───
function WhoIsThisFor({ shoe }) {
  const profiles = [];
  if (ensureArray(shoe.skill_level).includes("beginner") || ensureArray(shoe.skill_level).includes("hobby"))
    profiles.push({ icon: "🌱", label: "Newer climbers", desc: "Comfortable enough for learning, supportive enough for progression" });
  if (ensureArray(shoe.skill_level).includes("intermediate"))
    profiles.push({ icon: "📈", label: "Progressing climbers", desc: "Ready to push grades with more precision and power" });
  if (ensureArray(shoe.skill_level).includes("advanced"))
    profiles.push({ icon: "🔥", label: "Strong climbers", desc: "Sending hard sport or steep boulders at a high level" });
  if (ensureArray(shoe.skill_level).includes("elite"))
    profiles.push({ icon: "🏆", label: "Competition / elite", desc: "Maximum performance for comp climbing and limit sends" });
  if (ensureArray(shoe.use_cases).includes("trad_multipitch"))
    profiles.push({ icon: "⛰️", label: "Trad & multi-pitch", desc: "All-day comfort, crack protection, durable rubber" });
  if (shoe.width === "wide" || shoe.volume === "high")
    profiles.push({ icon: "👣", label: "Wide / high-volume feet", desc: "Generous fit that accommodates broader foot shapes" });
  if (shoe.width === "narrow" || shoe.volume === "low")
    profiles.push({ icon: "🦶", label: "Narrow / low-volume feet", desc: "Snug fit designed for slimmer foot shapes" });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
      {profiles.map((p, i) => (
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
function ProsCons({ pros, cons }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
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
            <span style={{ color: T.red, flexShrink: 0, fontWeight: 700 }}>−</span> {c}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Image Gallery ───
function ImageGallery({ shoe }) {
  const [active, setActive] = useState(0);
  const views = ["Side view", "Top view", "Sole", "Heel"];
  return (
    <div>
      <div style={{
        width: "100%", aspectRatio: "4/3", borderRadius: "18px", overflow: "hidden",
        position: "relative", border: `1px solid ${T.border}`,
        background: `linear-gradient(135deg, ${T.surface} 0%, ${T.card} 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "8px", opacity: 0.6 }}>👟</div>
          <div style={{ fontSize: "11px", color: T.muted, fontFamily: T.font }}>{views[active]}</div>
        </div>
        <div style={{ position: "absolute", bottom: "16px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "8px" }}>
          {views.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} style={{
              width: i === active ? "24px" : "8px", height: "8px", borderRadius: "4px",
              background: i === active ? T.accent : "rgba(255,255,255,0.3)",
              border: "none", cursor: "pointer", transition: "all 0.3s ease",
            }} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        {views.map((v, i) => (
          <button key={i} onClick={() => setActive(i)} style={{
            flex: 1, aspectRatio: "4/3", borderRadius: T.radiusSm,
            border: i === active ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
            background: T.surface, cursor: "pointer", opacity: i === active ? 1 : 0.5,
            transition: "all 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: "2px",
          }}>
            <span style={{ fontSize: "18px", opacity: 0.5 }}>👟</span>
            <span style={{ fontSize: "8px", color: T.muted }}>{v}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Price Comparison Table ───
function PriceComparison({ prices, shoe }) {
  if (!prices || !prices.length) {
    return (
      <div style={{ background: T.card, borderRadius: T.radius, padding: "32px", border: `1px solid ${T.border}`, textAlign: "center" }}>
        <div style={{ fontSize: "13px", color: T.muted }}>Price comparison data coming soon</div>
      </div>
    );
  }
  const best = Math.min(...prices.filter(p => p.inStock && p.price).map(p => p.price));
  return (
    <div style={{ background: T.card, borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase" }}>Price Comparison</div>
        <Tag variant="green" small icon="✓">Best: €{best}</Tag>
      </div>
      {prices.map((p, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr 0.6fr 0.6fr",
          alignItems: "center", padding: "12px 20px",
          borderBottom: i < prices.length - 1 ? `1px solid ${T.border}` : "none",
          background: p.price === best && p.inStock ? T.accentSoft : "transparent",
        }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: T.text }}>{p.shop}</span>
          <span style={{ fontSize: "15px", fontWeight: 800, color: p.price === best ? T.accent : T.text, fontFamily: T.mono }}>
            {p.price ? `€${p.price.toFixed(2)}` : "—"}
          </span>
          <span style={{ fontSize: "11px", color: T.muted }}>{p.shipping}</span>
          <span style={{ fontSize: "11px", color: T.muted }}>{p.delivery}</span>
          <span style={{ fontSize: "11px", fontWeight: 600, color: p.inStock ? T.green : T.red }}>
            {p.inStock ? "In stock" : "Out"}
          </span>
        </div>
      ))}
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
        <span style={{ fontSize: "16px", fontWeight: 800, color: T.accent, fontFamily: T.mono }}>€{shoe.current_price_eur}</span>
        {discount > 0 && <span style={{ fontSize: "11px", color: T.green, fontWeight: 700, fontFamily: T.mono }}>−{discount}%</span>}
      </div>
    </button>
  );
}

// ═══ PRICE INTELLIGENCE ═══
export function getPriceIntelligence(shoe, prices, history) {
  const now = new Date();
  const month = now.getMonth();
  const currentYear = now.getFullYear();
  const factors = [];
  let totalScore = 0, totalWeight = 0;

  const discount = shoe.price_uvp_eur && shoe.current_price_eur
    ? (shoe.price_uvp_eur - shoe.current_price_eur) / shoe.price_uvp_eur : 0;

  // Factor 1: Price vs MSRP (30%)
  let ps = discount >= 0.30 ? 1.0 : discount >= 0.20 ? 0.7 : discount >= 0.10 ? 0.3 : discount >= 0.05 ? 0.0 : -0.5;
  factors.push({ name: "Price vs MSRP", score: ps, weight: 0.30,
    detail: discount > 0.01 ? `${Math.round(discount * 100)}% below MSRP (€${shoe.price_uvp_eur})` : `At or near full MSRP (€${shoe.price_uvp_eur})`,
    icon: ps >= 0.5 ? "🟢" : ps >= 0 ? "🟡" : "🔴",
  });
  totalScore += ps * 0.30; totalWeight += 0.30;

  // Factor 2: Stock availability (20%)
  const inStockCount = prices.filter(p => p.inStock).length;
  const totalRetailers = prices.length;
  if (totalRetailers > 0) {
    let ss = inStockCount <= 1 ? 0.8 : inStockCount <= 3 ? 0.3 : -0.2;
    factors.push({ name: "Stock Availability", score: ss, weight: 0.20,
      detail: `In stock at ${inStockCount} of ${totalRetailers} retailers`,
      icon: inStockCount <= 2 ? "🔴" : inStockCount <= 4 ? "🟡" : "🟢",
    });
    totalScore += ss * 0.20; totalWeight += 0.20;
  }

  // Factor 3: Seasonal timing (15%)
  let seasonScore, seasonDetail;
  if (month >= 10 || month <= 1) { seasonScore = 0.6; seasonDetail = "Peak sale season — Black Friday & winter deals"; }
  else if (month >= 2 && month <= 3) { seasonScore = 0.0; seasonDetail = "Pre-season — prices stabilising before spring"; }
  else if (month >= 4 && month <= 7) { seasonScore = -0.5; seasonDetail = "Peak climbing season — prices typically highest"; }
  else { seasonScore = 0.3; seasonDetail = "End of season — early discounts appearing"; }
  factors.push({ name: "Seasonal Timing", score: seasonScore, weight: 0.15, detail: seasonDetail,
    icon: seasonScore > 0.3 ? "🟢" : seasonScore >= 0 ? "🟡" : "🔴",
  });
  totalScore += seasonScore * 0.15; totalWeight += 0.15;

  // Factor 4: Model lifecycle (15%)
  const modelAge = shoe.year_released ? currentYear - shoe.year_released : null;
  if (modelAge !== null) {
    let as, ad;
    if (modelAge >= 3) { as = 0.5; ad = `Released ${shoe.year_released} (${modelAge}y ago) — expect clearance pricing`; }
    else if (modelAge >= 2) { as = -0.3; ad = `Released ${shoe.year_released} (${modelAge}y ago) — successor may trigger price drops`; }
    else if (modelAge >= 1) { as = 0.0; ad = `Released ${shoe.year_released} — current model, stable pricing`; }
    else { as = -0.4; ad = `Released ${shoe.year_released} — brand-new, rarely discounted`; }
    factors.push({ name: "Model Lifecycle", score: as, weight: 0.15, detail: ad,
      icon: as > 0.2 ? "🟢" : as >= -0.1 ? "🟡" : "🔴",
    });
    totalScore += as * 0.15; totalWeight += 0.15;
  }

  // Factor 5: Price trend (20%, if history available)
  if (history.length >= 3) {
    const recent = history.slice(-3), older = history.slice(0, 3);
    const rAvg = recent.reduce((a, d) => a + d.price, 0) / recent.length;
    const oAvg = older.reduce((a, d) => a + d.price, 0) / older.length;
    const trendPct = (rAvg - oAvg) / oAvg;
    let ts, td;
    if (trendPct <= -0.10) { ts = -0.3; td = `Down ${Math.abs(Math.round(trendPct*100))}% — may keep dropping`; }
    else if (trendPct <= -0.03) { ts = 0.3; td = "Slightly declining — good buying window"; }
    else if (trendPct <= 0.03) { ts = 0.0; td = "Stable — consistent market pricing"; }
    else { ts = 0.5; td = `Up ${Math.round(trendPct*100)}% — buy before further increase`; }
    factors.push({ name: "Price Trend", score: ts, weight: 0.20, detail: td,
      icon: ts > 0.2 ? "🟢" : ts >= -0.1 ? "🟡" : "🔴" });
    totalScore += ts * 0.20; totalWeight += 0.20;
  }

  const ns = totalWeight > 0 ? totalScore / totalWeight : 0;
  let signal, label, color, bgColor, icon;
  if (ns >= 0.45) { signal = "buy_now"; label = "Buy Now"; color = T.green; bgColor = T.greenSoft; icon = "🟢"; }
  else if (ns >= 0.15) { signal = "good_deal"; label = "Good Deal"; color = T.green; bgColor = T.greenSoft; icon = "👍"; }
  else if (ns >= -0.15) { signal = "fair_price"; label = "Fair Price"; color = T.yellow; bgColor = T.yellowSoft; icon = "⚖️"; }
  else if (ns >= -0.40) { signal = "consider_waiting"; label = "Consider Waiting"; color = T.accent; bgColor = T.accentSoft; icon = "⏳"; }
  else { signal = "wait"; label = "Wait for Sale"; color = T.red; bgColor = T.redSoft; icon = "🔴"; }

  const parts = [];
  if (ns >= 0.3) {
    parts.push("This is a strong buying moment.");
    if (discount >= 0.15) parts.push(`At ${Math.round(discount*100)}% off MSRP, you're getting solid value.`);
    if (inStockCount > 0 && inStockCount <= 2) parts.push("Limited stock adds urgency.");
    parts.push("We don't expect significantly better pricing short-term.");
  } else if (ns >= 0) {
    parts.push("Reasonable price but not exceptional.");
    if (seasonScore < 0) parts.push("Prices tend to drop during sale season (Nov–Feb).");
    if (modelAge >= 2) parts.push("A successor model may push this one's price down.");
    else parts.push("Current-model pricing is relatively stable.");
  } else {
    parts.push("We recommend waiting for a better price.");
    if (seasonScore < 0) parts.push("Peak season pricing — expect deals in autumn/winter.");
    if (modelAge === 0) parts.push("Newly released shoes rarely see discounts in year one.");
    if (discount < 0.05) parts.push("Currently at or near full MSRP.");
  }
  return { signal, label, color, bgColor, icon, score: ns, factors, forecast: parts.join(" ") };
}

// ═══ SHOE DETAIL PAGE (3-Tab Layout) ═══
export default function ShoeDetail({ shoes = [], priceData = {}, priceHistory = [] }) {
  const { slug } = useParams();
  const shoe = shoes.find(s => s.slug === slug);
  if (!shoe) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, padding: "40px", fontFamily: T.font }}>
        <Link to="/" style={{ color: T.accent, textDecoration: "none", fontWeight: 600, fontSize: "14px" }}>← Back to search</Link>
        <div style={{ textAlign: "center", marginTop: "60px", color: T.muted }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🧗</div>
          <div style={{ fontSize: "16px" }}>Shoe not found</div>
        </div>
      </div>
    );
  }

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const prices = priceData[slug] || [];
  const history = priceHistory[slug] || [];
  const intel = getPriceIntelligence(shoe, prices, history);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text }}>
      {/* Header */}
      <header style={{ padding: "20px 32px", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: `rgba(14,16,21,0.92)`, backdropFilter: "blur(12px)", zIndex: 50 }}>
        <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: T.text, textDecoration: "none", fontWeight: 600, fontSize: "14px", marginBottom: "16px" }}>
          ← Search
        </Link>
      </header>

      {/* Hero */}
      <div style={{ padding: "40px 32px", borderBottom: `1px solid ${T.border}`, background: `linear-gradient(135deg, ${T.surface} 0%, ${T.card} 100%)` }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", alignItems: "start" }}>
            {/* Image */}
            <div>
              <ImageGallery shoe={shoe} />
            </div>

            {/* Hero info */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span style={{ fontSize: "24px", color: BRAND_COLORS[shoe.brand] || T.accent }}>●</span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase" }}>{shoe.brand}</span>
              </div>
              <h1 style={{ fontSize: "32px", fontWeight: 800, margin: "0 0 24px", letterSpacing: "-0.5px" }}>{shoe.model}</h1>

              {/* Price Intelligence CTA */}
              <div style={{ background: intel.bgColor, border: `1px solid rgba(232,115,74,0.25)`, borderRadius: T.radius, padding: "20px", marginBottom: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "20px" }}>{intel.icon}</span>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: intel.color }}>{intel.label}</div>
                    <div style={{ fontSize: "11px", color: T.muted }}>{intel.signal.replace(/_/g, " ")}</div>
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: T.text, lineHeight: 1.6 }}>{intel.forecast}</div>
              </div>

              {/* Price */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "20px" }}>
                <span style={{ fontSize: "28px", fontWeight: 800, color: T.accent, fontFamily: T.mono }}>€{shoe.current_price_eur}</span>
                {shoe.current_price_eur < shoe.price_uvp_eur && (
                  <span style={{ fontSize: "14px", color: T.muted, textDecoration: "line-through", fontFamily: T.mono }}>€{shoe.price_uvp_eur}</span>
                )}
              </div>

              {/* Size Range */}
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "12px 16px", marginBottom: "24px" }}>
                <span style={{ fontSize: "11px", color: T.muted, letterSpacing: "1px", textTransform: "uppercase", fontWeight: 600 }}>EU Size Range</span>
                <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginTop: "4px" }}>{shoe.size_range}</div>
              </div>

              {/* Performance Nets */}
              <DualRadar shoe={shoe} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 32px" }}>
        <div style={{ display: "flex", gap: "20px", marginBottom: "40px", borderBottom: `1px solid ${T.border}`, paddingBottom: "20px" }}>
          {[{ key: "overview", label: "Overview" }, { key: "prices", label: "Price & Availability" }, { key: "specs", label: "Specs" }].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: "8px 16px", border: "none", background: "transparent", color: activeTab === tab.key ? T.accent : T.muted,
              fontSize: "14px", fontWeight: activeTab === tab.key ? 700 : 600, cursor: "pointer", borderBottom: activeTab === tab.key ? `2px solid ${T.accent}` : "none",
              transition: "all 0.2s ease",
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px" }}>
            {/* Left col */}
            <div>
              {/* Description */}
              <SectionHeader icon="📋" title="Overview" />
              <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.8, marginBottom: "36px" }}>{shoe.description}</p>

              {/* Foot Shape & Sizing */}
              <SectionHeader icon="🦶" title="Foot Shape & Sizing" />
              <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}`, marginBottom: "36px" }}>
                <FootShapeDiagram toe_form={shoe.toe_form} volume={shoe.volume} width={shoe.width} heel={shoe.heel} />
              </div>

              <SizingCalculator shoe={shoe} />
            </div>

            {/* Right col */}
            <div>
              {/* Best For */}
              <SectionHeader icon="🎯" title="Best For" />
              <WhoIsThisFor shoe={shoe} />

              {/* Pros & Cons */}
              <SectionHeader icon="⚖️" title="Strengths & Trade-offs" />
              <ProsCons pros={shoe.pros} cons={shoe.cons} />
            </div>
          </div>
        )}

        {/* PRICE & AVAILABILITY TAB */}
        {activeTab === "prices" && (
          <div>
            {/* Price History Chart - full width */}
            <SectionHeader icon="📈" title="Price History" subtitle="Historical price evolution and directional forecast" />
            <div style={{ background: T.card, borderRadius: T.radius, padding: "24px", border: `1px solid ${T.border}`, marginBottom: "36px" }}>
              {history.length > 0 ? (
                <>
                  <PriceChart data={history} width={720} height={200} />
                  <div style={{ display: "flex", gap: "24px", marginTop: "16px", paddingTop: "12px", borderTop: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: "11px", color: T.muted }}>
                      Lowest: <span style={{ color: T.green, fontWeight: 700, fontFamily: T.mono }}>€{Math.min(...history.map(h => h.price))}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: T.muted }}>
                      Highest: <span style={{ color: T.red, fontWeight: 700, fontFamily: T.mono }}>€{Math.max(...history.map(h => h.price))}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: T.muted }}>
                      Current: <span style={{ color: T.accent, fontWeight: 700, fontFamily: T.mono }}>€{shoe.current_price_eur}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.4 }}>📊</div>
                  <div style={{ fontSize: "12px", color: T.muted }}>Price history data coming soon</div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px" }}>
              {/* Left: Price Intelligence */}
              <div>
                <SectionHeader icon="🧠" title="Price Intelligence" subtitle="Algorithmic buy/wait recommendation" />
                <div style={{ display: "grid", gap: "12px" }}>
                  {intel.factors.map((f, i) => (
                    <div key={i} style={{ background: T.card, borderRadius: T.radiusSm, padding: "14px", border: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <span style={{ fontSize: "14px" }}>{f.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: T.text }}>{f.name}</div>
                        </div>
                        <span style={{ fontSize: "10px", color: T.muted, fontFamily: T.mono }}>{Math.round(f.weight * 100)}%</span>
                      </div>
                      <div style={{ fontSize: "11px", color: T.muted, lineHeight: 1.5 }}>{f.detail}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Retailer Availability */}
              <div>
                <SectionHeader icon="🏪" title="Retailer Availability" subtitle="Size-specific pricing coming soon" />
                <PriceComparison prices={prices} shoe={shoe} />
              </div>
            </div>
          </div>
        )}

        {/* SPECS TAB */}
        {activeTab === "specs" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px" }}>
            {/* Left: Build Details */}
            <div>
              <SectionHeader icon="🔧" title="Build Details" />
              <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                <SpecRow label="Closure" value={cap(shoe.closure)} />
                <SpecRow label="Downturn" value={cap(shoe.downturn)} />
                <SpecRow label="Asymmetry" value={cap(shoe.asymmetry)} />
                <SpecRow label="Toe Patch" value={cap(shoe.toe_patch)} />
                <SpecRow label="Heel Rubber" value={cap(shoe.heel_rubber_coverage)} />
                <SpecRow label="Midsole" value={cap(shoe.midsole)} />
                <SpecRow label="Rand" value={cap(shoe.rand)} />
                <SpecRow label="Upper Material" value={cap(shoe.upper_material)} />
              </div>


            </div>

            {/* Right: Rubber & Comfort */}
            <div>
              <SectionHeader icon="🛞" title="Rubber & Durability" />
              <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}`, marginBottom: "36px" }}>
                <SpecRow label="Rubber Type" value={shoe.rubber_type} />
                <SpecRow label="Thickness" value={`${shoe.rubber_thickness_mm}mm`} />
                <SpecRow label="Hardness" value={Array.isArray(shoe.rubber_hardness) ? shoe.rubber_hardness.map(cap).join(", ") : cap(shoe.rubber_hardness)} />
                <SpecRow label="Durability" value={Array.isArray(shoe.durability) ? shoe.durability.map(cap).join(", ") : cap(shoe.durability)} />
                <SpecRow label="Weight" value={`${shoe.weight_g}g`} />
              </div>

              <SectionHeader icon="✨" title="Wearing Comfort" />
              <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}`, marginBottom: "36px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "20px" }}>🏆</span>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: T.text }}>Comfort: {getComfortLabel(shoe)}</div>
                    <div style={{ fontSize: "12px", color: T.muted }}>Feel: {cap(shoe.feel)}</div>
                  </div>
                </div>
                <SpecRow label="Sizing" value={shoe.sizing} />
                <SpecRow label="Break-in" value={cap(shoe.break_in_period)} />
              </div>

              <SectionHeader icon="🌱" title="Sustainability" />
              <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: shoe.recycled_material_pct != null ? "16px" : "0" }}>
                  {shoe.vegan && <Tag variant="green" icon="🌱">Vegan</Tag>}
                  {shoe.resoleable && <Tag variant="blue" icon="🔧">Resoleable</Tag>}
                  {shoe.recycled_material_pct != null && (
                    <Tag variant="green" icon="♻️">{shoe.recycled_material_pct}% Recycled</Tag>
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

      {/* Footer with similar shoes */}
      <div style={{ padding: "40px 32px", borderTop: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <SectionHeader icon="👟" title="You May Also Like" subtitle="Similar performance and fit" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            {shoes
              .filter(s => s.slug !== slug && (
                (ensureArray(s.skill_level).some(l => ensureArray(shoe.skill_level).includes(l))) ||
                (s.downturn === shoe.downturn)
              ))
              .slice(0, 4)
              .map(s => (
                <MiniCard key={s.slug} shoe={s} onClick={() => { navigate(`/shoe/${s.slug}`); window.scrollTo(0, 0); }} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
