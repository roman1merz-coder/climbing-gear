import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { fmt, ensureArray } from "./utils/format.js";
import HeartButton from "./HeartButton.jsx";
import PriceAlertForm from "./PriceAlertForm.jsx";
import useIsMobile from "./useIsMobile.js";

// ─── Design Tokens ───────────────────────────────────────────────
const T = {
  bg: "#0e1015", surface: "#151820", card: "#1c1f26", border: "#2a2f38",
  text: "#f0f0f0", muted: "#9ca3af", dim: "#6b7280",
  accent: "#E8734A", accentSoft: "rgba(232,115,74,0.12)",
  green: "#22c55e", greenSoft: "rgba(34,197,94,0.08)",
  blue: "#60a5fa", blueSoft: "rgba(96,165,250,0.08)",
  purple: "#a78bfa", purpleSoft: "rgba(167,139,250,0.08)",
  cyan: "#22d3ee", cyanSoft: "rgba(34,211,238,0.08)",
  yellow: "#eab308", yellowSoft: "rgba(234,179,8,0.08)",
  red: "#ef4444", redSoft: "rgba(239,68,68,0.08)",
  font: "'DM Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'DM Mono', monospace",
};

const SIZE_COLORS = {
  sit_start: { color: T.yellow, bg: T.yellowSoft, border: "rgba(234,179,8,.25)" },
  slider: { color: T.purple, bg: T.purpleSoft, border: "rgba(167,139,250,.25)" },
  small: { color: T.cyan, bg: T.cyanSoft, border: "rgba(34,211,238,.25)" },
  medium: { color: T.blue, bg: T.blueSoft, border: "rgba(96,165,250,.25)" },
  large: { color: T.green, bg: T.greenSoft, border: "rgba(34,197,94,.25)" },
  oversized: { color: T.red, bg: T.redSoft, border: "rgba(239,68,68,.25)" },
};

// ─── Tiny Components ─────────────────────────────────────────────
function Tag({ children, variant = "default" }) {
  const styles = {
    default: { bg: T.card, color: T.muted, border: T.border },
    accent: { bg: T.accentSoft, color: T.accent, border: "rgba(232,115,74,0.20)" },
    green: { bg: T.greenSoft, color: T.green, border: "rgba(34,197,94,0.20)" },
    blue: { bg: T.blueSoft, color: T.blue, border: "rgba(96,165,250,0.20)" },
    purple: { bg: T.purpleSoft, color: T.purple, border: "rgba(167,139,250,0.20)" },
    yellow: { bg: T.yellowSoft, color: T.yellow, border: "rgba(234,179,8,0.20)" },
  };
  const s = styles[variant] || styles.default;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "5px 12px", borderRadius: "10px",
      fontSize: "11px", fontWeight: 600, letterSpacing: "0.3px",
      textTransform: "capitalize", background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, fontFamily: T.font, whiteSpace: "nowrap",
    }}>
      {typeof children === "string" ? fmt(children) : children}
    </span>
  );
}

function StatRow({ label, value, unit, highlight }) {
  if (value == null || value === "") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: "13px", color: T.muted }}>{label}</span>
      <span style={{ fontSize: "14px", fontWeight: 600, color: highlight ? T.accent : T.text, fontFamily: T.mono }}>
        {value}{unit && <span style={{ fontSize: "11px", color: T.dim, fontWeight: 400, marginLeft: "3px" }}>{unit}</span>}
      </span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <h3 style={{ fontSize: "13px", fontWeight: 700, color: T.dim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "16px", fontFamily: T.font }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// ─── Crashpad SVG (Detail — wider) ───────────────────────────────
function CrashpadSVGDetail({ pad }) {
  const w = 500, h = 200;
  const lenRatio = Math.min(pad.length_open_cm || 110, 180) / 180;
  const widRatio = Math.min(pad.width_open_cm || 95, 130) / 130;
  const padW = 120 + lenRatio * 260;
  const padH = 60 + widRatio * 80;
  const x = (w - padW) / 2;
  const y = (h - padH) / 2;
  const rx = pad.fold_style === "taco" ? 20 : pad.fold_style === "hinge" ? 6 : 14;
  const sizeColor = SIZE_COLORS[pad.pad_size_category]?.color || T.blue;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="detail-pad-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={sizeColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={sizeColor} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <rect x={x + 4} y={y + 4} width={padW} height={padH} rx={rx}
        fill="#000" opacity="0.2" />
      {/* Pad body */}
      <rect x={x} y={y} width={padW} height={padH} rx={rx}
        fill="url(#detail-pad-bg)" stroke={sizeColor} strokeWidth="2" strokeOpacity="0.4" />
      {/* Fold lines */}
      {pad.fold_style === "taco" && (
        <line x1={w / 2} y1={y + 8} x2={w / 2} y2={y + padH - 8}
          stroke={sizeColor} strokeWidth="1.5" strokeDasharray="6,4" strokeOpacity="0.35" />
      )}
      {pad.fold_style === "hinge" && (
        <line x1={w / 2} y1={y} x2={w / 2} y2={y + padH}
          stroke={sizeColor} strokeWidth="3" strokeOpacity="0.5" />
      )}
      {pad.fold_style === "tri_fold" && (
        <>
          <line x1={x + padW / 3} y1={y + 4} x2={x + padW / 3} y2={y + padH - 4}
            stroke={sizeColor} strokeWidth="1.5" strokeDasharray="5,4" strokeOpacity="0.3" />
          <line x1={x + (padW * 2) / 3} y1={y + 4} x2={x + (padW * 2) / 3} y2={y + padH - 4}
            stroke={sizeColor} strokeWidth="1.5" strokeDasharray="5,4" strokeOpacity="0.3" />
        </>
      )}
      {/* Foam layer indicator */}
      {pad.foam_layers && Array.from({ length: Math.min(pad.foam_layers, 5) }).map((_, i) => (
        <rect key={i}
          x={x + 12} y={y + padH - 14 - i * 6}
          width={18} height={4} rx={2}
          fill={sizeColor} opacity={0.2 + i * 0.12} />
      ))}
      {/* Dimensions label */}
      <text x={w / 2} y={y + padH + 20} textAnchor="middle"
        fill={T.dim} fontSize="12" fontFamily={T.mono}>
        {pad.length_open_cm} × {pad.width_open_cm} cm · {pad.thickness_cm} cm thick
      </text>
      {/* Carry straps indicator */}
      {pad.shoulder_straps && (
        <>
          <line x1={x + padW * 0.35} y1={y - 2} x2={x + padW * 0.35} y2={y - 14}
            stroke={T.muted} strokeWidth="1.5" strokeOpacity="0.3" />
          <line x1={x + padW * 0.65} y1={y - 2} x2={x + padW * 0.65} y2={y - 14}
            stroke={T.muted} strokeWidth="1.5" strokeOpacity="0.3" />
        </>
      )}
    </svg>
  );
}

// ─── Efficiency Radar ────────────────────────────────────────────
function EfficiencyRadar({ pad, allPads }) {
  const area = (pad.length_open_cm * pad.width_open_cm) / 10000;
  const vol = (pad.length_open_cm * pad.width_open_cm * pad.thickness_cm) / 1000;

  const metrics = useMemo(() => {
    // Compute for all pads
    const all = allPads.map((p) => {
      const a = (p.length_open_cm * p.width_open_cm) / 10000;
      const v = (p.length_open_cm * p.width_open_cm * p.thickness_cm) / 1000;
      const price = p.current_price_eur || p.price_uvp_eur || 999;
      return {
        eurPerArea: price / (a || 1),
        kgPerArea: p.weight_kg / (a || 1),
        eurPerLiter: price / (v || 1),
        kgPerLiter: p.weight_kg / (v || 1),
      };
    });
    const mins = { eurPerArea: Infinity, kgPerArea: Infinity, eurPerLiter: Infinity, kgPerLiter: Infinity };
    const maxs = { eurPerArea: 0, kgPerArea: 0, eurPerLiter: 0, kgPerLiter: 0 };
    for (const m of all) {
      for (const k of Object.keys(mins)) {
        if (m[k] < mins[k]) mins[k] = m[k];
        if (m[k] > maxs[k]) maxs[k] = m[k];
      }
    }

    const price = pad.current_price_eur || pad.price_uvp_eur || 999;
    const mine = {
      eurPerArea: price / (area || 1),
      kgPerArea: pad.weight_kg / (area || 1),
      eurPerLiter: price / (vol || 1),
      kgPerLiter: pad.weight_kg / (vol || 1),
    };

    // Normalize (inverted — lower is better for all 4)
    const norm = (val, min, max) => {
      if (max === min) return 50;
      return 100 - ((val - min) / (max - min)) * 100;
    };

    // Protection axis: impact_protection level / thickness (higher = better)
    const impactScale = { low: 1, moderate: 2, high: 3, very_high: 4 };
    const impactVal = (impactScale[pad.impact_protection] || 2) / (pad.thickness_cm || 1);
    const allImpact = allPads.map((p) => (impactScale[p.impact_protection] || 2) / (p.thickness_cm || 1));
    const impMin = Math.min(...allImpact);
    const impMax = Math.max(...allImpact);
    const protScore = impMax === impMin ? 50 : ((impactVal - impMin) / (impMax - impMin)) * 100;

    // Portability axis: inverse weight × carry_comfort × approach
    const comfortScale = { basic: 1, good: 2, excellent: 3 };
    const approachScale = { roadside: 1, moderate: 2, long: 3 };
    const portVal = (1 / (pad.weight_kg || 1)) * (comfortScale[pad.carry_comfort] || 1) * (approachScale[pad.approach_suitability] || 1);
    const allPort = allPads.map((p) => (1 / (p.weight_kg || 1)) * (comfortScale[p.carry_comfort] || 1) * (approachScale[p.approach_suitability] || 1));
    const portMin = Math.min(...allPort);
    const portMax = Math.max(...allPort);
    const portScore = portMax === portMin ? 50 : ((portVal - portMin) / (portMax - portMin)) * 100;

    return [
      { label: "Cost/m²", value: norm(mine.eurPerArea, mins.eurPerArea, maxs.eurPerArea), detail: `€${mine.eurPerArea.toFixed(0)}/m²` },
      { label: "Weight/m²", value: norm(mine.kgPerArea, mins.kgPerArea, maxs.kgPerArea), detail: `${mine.kgPerArea.toFixed(1)}kg/m²` },
      { label: "Protection", value: protScore, detail: fmt(pad.impact_protection) },
      { label: "Cost/l", value: norm(mine.eurPerLiter, mins.eurPerLiter, maxs.eurPerLiter), detail: `€${mine.eurPerLiter.toFixed(1)}/l` },
      { label: "Weight/l", value: norm(mine.kgPerLiter, mins.kgPerLiter, maxs.kgPerLiter), detail: `${mine.kgPerLiter.toFixed(2)}kg/l` },
      { label: "Portability", value: portScore, detail: fmt(pad.carry_comfort) },
    ];
  }, [pad, allPads, area, vol]);

  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const r = 90;
  // Note: SVG uses viewBox so it auto-scales; we control rendered size via the parent
  const n = metrics.length;

  const getPoint = (i, val) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = (val / 100) * r;
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
  };

  const dataPoints = metrics.map((m, i) => getPoint(i, Math.max(m.value, 5)));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <div style={{ background: T.card, borderRadius: "16px", padding: "24px", border: `1px solid ${T.border}` }}>
      <h3 style={{ fontSize: "13px", fontWeight: 700, color: T.dim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "16px" }}>
        Efficiency Radar
      </h3>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", maxWidth: `${size}px`, height: "auto" }}>
          {/* Grid circles */}
          {[25, 50, 75, 100].map((pct) => (
            <circle key={pct} cx={cx} cy={cy} r={(pct / 100) * r}
              fill="none" stroke={T.border} strokeWidth="0.5" />
          ))}
          {/* Axis lines */}
          {metrics.map((_, i) => {
            const p = getPoint(i, 100);
            return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={T.border} strokeWidth="0.5" />;
          })}
          {/* Data polygon */}
          <path d={dataPath} fill="rgba(232,115,74,0.15)" stroke={T.accent} strokeWidth="2" />
          {/* Data dots */}
          {dataPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={T.accent} />
          ))}
          {/* Labels */}
          {metrics.map((m, i) => {
            const p = getPoint(i, 140);
            return (
              <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                fill={T.muted} fontSize="10" fontFamily={T.font} fontWeight="600">
                {m.label}
              </text>
            );
          })}
        </svg>
      </div>
      {/* Details below */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginTop: "12px" }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "10px", color: T.dim, marginBottom: "2px" }}>{m.label}</div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: T.text, fontFamily: T.mono }}>{m.detail}</div>
            <div style={{
              fontSize: "10px", fontWeight: 700, fontFamily: T.mono,
              color: m.value >= 70 ? T.green : m.value >= 40 ? T.accent : T.red,
            }}>
              {Math.round(m.value)}/100
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN: Crashpad Detail Page
// ═══════════════════════════════════════════════════════════════════

export default function CrashpadDetail({ crashpads = [] }) {
  const { slug } = useParams();
  const pad = crashpads.find((p) => p.slug === slug);
  const isMobile = useIsMobile();

  if (!pad) {
    return (
      <div style={{ background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <div style={{ fontSize: "48px" }}>🛏️</div>
        <div style={{ color: T.muted, fontSize: "16px" }}>Crashpad not found</div>
        <Link to="/crashpads" style={{ color: T.accent, textDecoration: "none", fontSize: "14px" }}>← Back to crashpads</Link>
      </div>
    );
  }

  const sc = SIZE_COLORS[pad.pad_size_category] || SIZE_COLORS.medium;
  const area = ((pad.length_open_cm * pad.width_open_cm) / 10000).toFixed(2);
  const volume = ((pad.length_open_cm * pad.width_open_cm * pad.thickness_cm) / 1000).toFixed(1);
  const hasDiscount = pad.price_uvp_eur > pad.current_price_eur;

  const similar = crashpads.filter((p) =>
    p.slug !== pad.slug &&
    (p.pad_size_category === pad.pad_size_category ||
     ensureArray(p.best_use).some((u) => ensureArray(pad.best_use).includes(u)))
  ).slice(0, 3);

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: T.font, color: T.text }}>
      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", gap: isMobile ? "10px" : "16px",
        padding: isMobile ? "0 16px" : "0 24px", height: isMobile ? "44px" : "50px",
        background: T.bg,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <Link to="/crashpads" style={{ color: T.muted, textDecoration: "none", fontSize: isMobile ? "13px" : "14px", display: "flex", alignItems: "center", gap: "6px", minHeight: "44px" }}>
          <span>←</span> Back to crashpads
        </Link>
        {!isMobile && (
          <div style={{ marginLeft: "auto", fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>🧗</span>
            climbing-gear<span style={{ color: T.accent }}>.com</span>
          </div>
        )}
      </header>

      {/* Pad visual header */}
      <div style={{
        padding: pad.image_url ? "0" : "32px 0 12px",
        background: pad.image_url ? "none" : `linear-gradient(135deg, ${sc.color}10, ${sc.color}04)`,
        borderBottom: `1px solid ${T.border}`,
      }}>
        {pad.image_url ? (
          <div style={{
            maxWidth: "900px", margin: "0 auto",
            display: "flex", justifyContent: "center",
            background: `linear-gradient(135deg, ${sc.color}08, ${sc.color}02)`,
          }}>
            <img src={pad.image_url} alt={`${pad.brand} ${pad.model}`}
              style={{
                width: "100%", maxHeight: isMobile ? "280px" : "400px",
                objectFit: "contain",
              }} />
          </div>
        ) : (
          <div style={{ maxWidth: "900px", margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px" }}>
            <CrashpadSVGDetail pad={pad} />
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: isMobile ? "20px 16px 60px" : "32px 24px 80px" }}>

        {/* Title block */}
        <div style={{ marginBottom: isMobile ? "24px" : "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: T.dim, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" }}>
              {pad.brand}
            </span>
            <span style={{
              padding: "3px 8px", borderRadius: "6px",
              fontSize: "10px", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase",
              fontFamily: T.mono, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
            }}>
              {fmt(pad.pad_size_category)}
            </span>
            {pad.year_released && (
              <span style={{ fontSize: "10px", color: T.dim, fontFamily: T.mono }}>{pad.year_released}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <h1 style={{ fontSize: isMobile ? "22px" : "28px", fontWeight: 800, lineHeight: 1.2, margin: 0, letterSpacing: "-0.5px" }}>
              {pad.model}
            </h1>
            <HeartButton type="crashpad" slug={pad.slug} style={{ fontSize: "22px" }} />
          </div>
          {pad.description && (
            <p style={{ fontSize: "15px", color: T.muted, lineHeight: 1.7, maxWidth: "700px" }}>
              {pad.description}
            </p>
          )}
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "24px" : "32px" }}>

          {/* Left column — Specs */}
          <div>
            <Section title="Dimensions & Weight">
              <StatRow label="Open Size" value={`${pad.length_open_cm} × ${pad.width_open_cm}`} unit="cm" highlight />
              <StatRow label="Thickness" value={pad.thickness_cm} unit="cm" />
              <StatRow label="Weight" value={pad.weight_kg} unit="kg" />
              <StatRow label="Landing Area" value={area} unit="m²" highlight />
              <StatRow label="Volume" value={volume} unit="l" />
            </Section>

            <Section title="Protection & Foam">
              <StatRow label="Impact Protection" value={fmt(pad.impact_protection)} />
              <StatRow label="Foam Firmness" value={fmt(pad.foam_firmness)} />
              <StatRow label="Foam Layers" value={pad.foam_layers} />
              {pad.foam_types && (
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                  {ensureArray(pad.foam_types).map((ft) => <Tag key={ft}>{ft}</Tag>)}
                </div>
              )}
              <StatRow label="Hinge Protection" value={pad.has_hinge_protection ? "Yes" : "No"} />
              <StatRow label="Durability" value={fmt(pad.durability)} />
            </Section>

            <Section title="Construction">
              <StatRow label="Shell Denier" value={pad.shell_denier} unit="D" />
              <StatRow label="Bottom Coating" value={fmt(pad.bottom_coating)} />
              <StatRow label="Closure System" value={fmt(pad.closure_system)} />
              <StatRow label="Reconfigurable" value={pad.reconfigurable ? "Yes" : "No"} />
            </Section>
          </div>

          {/* Right column — Use, Carry, Price */}
          <div>
            <Section title="Best For">
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {ensureArray(pad.best_use).map((u) => <Tag key={u} variant="accent">{u}</Tag>)}
              </div>
              <div style={{ marginTop: "12px" }}>
                <StatRow label="Approach" value={fmt(pad.approach_suitability)} />
                <StatRow label="Fold Style" value={fmt(pad.fold_style)} />
              </div>
            </Section>

            <Section title="Carry System">
              <StatRow label="Carry Comfort" value={fmt(pad.carry_comfort)} highlight />
              <StatRow label="Shoulder Straps" value={pad.shoulder_straps ? "Yes" : "No"} />
              <StatRow label="Waist Belt" value={pad.waist_belt ? "Yes" : "No"} />
              <StatRow label="Chest Strap" value={pad.chest_strap ? "Yes" : "No"} />
              <StatRow label="Carry Handles" value={pad.carry_handles} />
              <StatRow label="Bandolier Strap" value={pad.bandolier_strap ? "Yes" : "No"} />
              <StatRow label="Gear Storage" value={fmt(pad.gear_storage)} />
            </Section>

            <Section title="Features">
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {pad.shoe_wipe && <Tag variant="blue">Shoe Wipe</Tag>}
                {pad.couch_mode && <Tag variant="blue">Couch Mode</Tag>}
                {!pad.shoe_wipe && !pad.couch_mode && (
                  <span style={{ fontSize: "13px", color: T.dim }}>No special features</span>
                )}
              </div>
            </Section>

            <Section title="Sustainability">
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {pad.hic_certified && <Tag variant="green">HIC Certified</Tag>}
                {pad.bluesign && <Tag variant="green">Bluesign</Tag>}
                {pad.recycled_materials !== "none" && <Tag variant="green">{fmt(pad.recycled_materials)} Recycled</Tag>}
                {!pad.hic_certified && !pad.bluesign && pad.recycled_materials === "none" && (
                  <span style={{ fontSize: "13px", color: T.dim }}>No eco certifications</span>
                )}
              </div>
            </Section>

            {/* ═══ STANDARDIZED PRICE SECTION ═══ */}
            <div style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: "12px",
              padding: 0, marginBottom: "16px", display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", overflow: "hidden",
            }}>
              {/* Left: Price + Size (N/A) */}
              <div style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "28px", fontWeight: 800, color: T.accent, fontFamily: T.mono }}>
                    €{pad.current_price_eur}
                  </span>
                  {hasDiscount && (
                    <>
                      <span style={{ fontSize: "14px", color: T.muted, textDecoration: "line-through", fontFamily: T.mono }}>
                        €{pad.price_uvp_eur}
                      </span>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: T.green, fontFamily: T.mono }}>
                        −{Math.round(((pad.price_uvp_eur - pad.current_price_eur) / pad.price_uvp_eur) * 100)}%
                      </span>
                    </>
                  )}
                </div>
                {!hasDiscount && (
                  <div style={{ fontSize: "11px", color: T.dim, marginBottom: "4px" }}>UVP €{pad.price_uvp_eur}</div>
                )}
                {/* Size selection — N/A for crashpads */}
                <div style={{ marginTop: "8px" }}>
                  <div style={{ fontSize: "11px", color: T.muted, letterSpacing: "1px", textTransform: "uppercase", fontWeight: 600, marginBottom: "4px" }}>Size Selection</div>
                  <div style={{ fontSize: "11px", color: T.dim, fontStyle: "italic" }}>Not applicable for crashpads</div>
                </div>
              </div>
              {/* Right: Deal Evaluation */}
              <div style={{ padding: isMobile ? "16px 20px" : "20px", borderLeft: isMobile ? "none" : `1px solid ${T.border}`, borderTop: isMobile ? `1px solid ${T.border}` : "none", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                {(() => {
                  const discount = pad.price_uvp_eur && pad.current_price_eur
                    ? (pad.price_uvp_eur - pad.current_price_eur) / pad.price_uvp_eur : 0;
                  const factors = [];
                  let totalScore = 0, totalWeight = 0;
                  // Factor 1: Price vs UVP (40%)
                  const ps = discount >= 0.30 ? 1.0 : discount >= 0.20 ? 0.7 : discount >= 0.10 ? 0.3 : discount >= 0.05 ? 0.0 : -0.5;
                  factors.push({ name: "Price vs UVP", icon: ps >= 0.5 ? "\uD83D\uDFE2" : ps >= 0 ? "\uD83D\uDFE1" : "\uD83D\uDD34", weight: 0.40,
                    detail: discount > 0.01 ? `${Math.round(discount * 100)}% below UVP (€${pad.price_uvp_eur})` : "At or near full UVP" });
                  totalScore += ps * 0.40; totalWeight += 0.40;
                  // Factor 2: Model Lifecycle (25%)
                  const currentYear = new Date().getFullYear();
                  const modelAge = pad.year_released ? currentYear - pad.year_released : null;
                  if (modelAge !== null) {
                    const as = modelAge >= 3 ? 0.5 : modelAge >= 2 ? -0.3 : modelAge >= 1 ? 0.0 : -0.4;
                    factors.push({ name: "Model Lifecycle", icon: as > 0.2 ? "\uD83D\uDFE2" : as >= -0.1 ? "\uD83D\uDFE1" : "\uD83D\uDD34", weight: 0.25,
                      detail: `Released ${pad.year_released} (${modelAge}y ago)` });
                    totalScore += as * 0.25; totalWeight += 0.25;
                  }
                  // Factor 3: Expected Price Development (20%)
                  factors.push({ name: "Expected Price Development", icon: "\u23F3", weight: 0.20, detail: "Coming soon" });
                  // Factor 4: Price History (15%)
                  factors.push({ name: "Price History", icon: "\uD83D\uDCCA", weight: 0.15, detail: "Coming soon" });

                  const ns = totalWeight > 0 ? totalScore / totalWeight : 0;
                  let label, color, icon;
                  if (ns >= 0.45) { label = "Buy Now"; color = T.green; icon = "\uD83D\uDFE2"; }
                  else if (ns >= 0.15) { label = "Good Deal"; color = T.green; icon = "\uD83D\uDC4D"; }
                  else if (ns >= -0.15) { label = "Fair Price"; color = T.yellow; icon = "\u2696\uFE0F"; }
                  else if (ns >= -0.40) { label = "Consider Waiting"; color = T.accent; icon = "\u23F3"; }
                  else { label = "Wait for Sale"; color = T.red; icon = "\uD83D\uDD34"; }
                  const forecast = ns >= 0.3
                    ? `At ${Math.round(discount*100)}% off UVP, this is a strong buying moment.`
                    : ns >= 0
                      ? "Reasonable price. More data coming soon for better recommendations."
                      : "Currently at or near full UVP. Consider waiting for a sale.";

                  return (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                        <span style={{ fontSize: "18px" }}>{icon}</span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color }}>{label}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: T.muted, lineHeight: 1.6, marginBottom: "14px" }}>{forecast}</div>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {factors.map((f, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "12px" }}>{f.icon}</span>
                            <span style={{ fontSize: "11px", fontWeight: 600, color: T.text, whiteSpace: "nowrap" }}>{f.name}</span>
                            <span style={{ fontSize: "10px", color: T.dim, fontFamily: T.mono }}>{Math.round(f.weight * 100)}%</span>
                            <span style={{ flex: 1, fontSize: "10px", color: T.muted, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.detail}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Price Alert */}
            <PriceAlertForm gearType="crashpad" slug={pad.slug} currentPrice={pad.current_price_eur} isMobile={isMobile} />

            {/* Price History — Coming Soon */}
            <div style={{ background: T.card, borderRadius: "12px", padding: "24px", border: `1px solid ${T.border}`, textAlign: "center" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.4 }}>{"\uD83D\uDCCA"}</div>
              <div style={{ fontSize: "12px", color: T.muted }}>Price history data coming soon</div>
            </div>
          </div>
        </div>

        {/* Efficiency Radar */}
        <div style={{ marginTop: "32px" }}>
          <EfficiencyRadar pad={pad} allPads={crashpads} />
        </div>

        {/* ═══ Strengths & Trade-offs ═══ */}
        {((Array.isArray(pad.pros) ? pad.pros.length : pad.pros) || (Array.isArray(pad.cons) ? pad.cons.length : pad.cons)) && (
          <Section title="⚖️ Strengths & Trade-offs">
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
              <div style={{ background: T.card, borderRadius: "12px", padding: "20px", border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: T.green, marginBottom: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Strengths</div>
                {(Array.isArray(pad.pros) ? pad.pros : String(pad.pros || "").split(". ").filter(Boolean)).map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "10px", fontSize: "13px", color: T.text, lineHeight: 1.5 }}>
                    <span style={{ color: T.green, flexShrink: 0, fontWeight: 700 }}>+</span> {typeof p === "string" ? p.replace(/\.$/, "") : p}
                  </div>
                ))}
              </div>
              <div style={{ background: T.card, borderRadius: "12px", padding: "20px", border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: T.red, marginBottom: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Trade-offs</div>
                {(Array.isArray(pad.cons) ? pad.cons : String(pad.cons || "").split(". ").filter(Boolean)).map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "10px", fontSize: "13px", color: T.text, lineHeight: 1.5 }}>
                    <span style={{ color: T.red, flexShrink: 0, fontWeight: 700 }}>{"\u2212"}</span> {typeof c === "string" ? c.replace(/\.$/, "") : c}
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* ═══ What Climbers Say ═══ */}
        {pad.customer_voices?.length > 0 && (
          <Section title="💬 What Climbers Say">
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
              {pad.customer_voices.slice(0, 4).map((v, i) => (
                <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "22px", transition: "border-color 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.borderColor = "rgba(232,115,74,0.25)"}
                  onMouseOut={e => e.currentTarget.style.borderColor = T.border}>
                  <div style={{ fontSize: "28px", color: T.accent, opacity: 0.3, fontFamily: "Georgia, serif", lineHeight: 1, marginBottom: "6px" }}>{"\u201C"}</div>
                  <div style={{ fontSize: "13px", color: T.text, lineHeight: 1.7, fontStyle: "italic", opacity: 0.9 }}>{typeof v === "object" ? v.text : v}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Similar pads */}
        {similar.length > 0 && (
          <Section title="Similar Crashpads">
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(250px, 1fr))", gap: "16px" }}>
              {similar.map((p) => {
                const psc = SIZE_COLORS[p.pad_size_category] || SIZE_COLORS.medium;
                return (
                  <Link key={p.slug} to={`/crashpad/${p.slug}`} style={{ textDecoration: "none" }}>
                    <div style={{
                      background: T.card, borderRadius: "12px", padding: "16px",
                      border: `1px solid ${T.border}`, transition: "all .2s", cursor: "pointer",
                    }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = T.accent; }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = T.border; }}
                    >
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{
                          padding: "2px 6px", borderRadius: "4px",
                          fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
                          fontFamily: T.mono, background: psc.bg, color: psc.color,
                        }}>
                          {fmt(p.pad_size_category)}
                        </span>
                      </div>
                      <div style={{ fontSize: "10px", color: T.dim, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>
                        {p.brand}
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "8px" }}>{p.model}</div>
                      <div style={{ display: "flex", gap: "8px", fontSize: "12px", color: T.muted, marginBottom: "8px" }}>
                        <span>{p.length_open_cm}×{p.width_open_cm}cm</span>
                        <span>{p.weight_kg}kg</span>
                      </div>
                      <span style={{ fontSize: "16px", fontWeight: 700, color: T.accent, fontFamily: T.mono }}>
                        €{p.current_price_eur}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
