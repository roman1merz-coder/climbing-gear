import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { fmt, ensureArray } from "./utils/format.js";
import HeartButton from "./HeartButton.jsx";
import PriceAlertForm from "./PriceAlertForm.jsx";
import usePageMeta from "./usePageMeta.js";
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
  radius: "12px", radiusSm: "8px",
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
    // Compute ratio metrics for all pads
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

    // Protection axis: area × thickness × layer quality × robustness
    const protRaw = (p) => {
      const a = (p.length_open_cm * p.width_open_cm) / 10000;
      const thickF = Math.min((p.thickness_cm || 1) / 12, 1.3);
      const isInflatable = (p.foam_types || []).includes("air_chamber");
      const layerF = isInflatable ? 0.75 : Math.max(0.33, Math.min((p.foam_layers || 0) / 3, 1.5));
      const robust = isInflatable ? 0.85 : 1.0;
      return a * thickF * layerF * robust;
    };
    const myProt = protRaw(pad);
    const allProt = allPads.map(protRaw);
    const protMin = Math.min(...allProt);
    const protMax = Math.max(...allProt);
    const protScore = protMax === protMin ? 50 : ((myProt - protMin) / (protMax - protMin)) * 100;

    // Portability axis: weight/area (primary, inverted) × carry_comfort discount
    const portRaw = (p) => {
      const a = (p.length_open_cm * p.width_open_cm) / 10000;
      const wpa = p.weight_kg / (a || 1);
      const comfortDiscount = { excellent: 0.85, good: 0.92, basic: 1.0 }[p.carry_comfort] || 1.0;
      return wpa * comfortDiscount;
    };
    const myPort = portRaw(pad);
    const allPort = allPads.map(portRaw);
    const portMin = Math.min(...allPort);
    const portMax = Math.max(...allPort);
    const portScore = portMax === portMin ? 50 : 100 - ((myPort - portMin) / (portMax - portMin)) * 100;

    return [
      { label: "Cost/m²", value: norm(mine.eurPerArea, mins.eurPerArea, maxs.eurPerArea), detail: `€${mine.eurPerArea.toFixed(0)}/m²` },
      { label: "Weight/m²", value: norm(mine.kgPerArea, mins.kgPerArea, maxs.kgPerArea), detail: `${mine.kgPerArea.toFixed(1)}kg/m²` },
      { label: "Protection", value: protScore, detail: `${area.toFixed(1)}m² · ${pad.thickness_cm}cm · ${pad.foam_layers || 0}L` },
      { label: "Cost/l", value: norm(mine.eurPerLiter, mins.eurPerLiter, maxs.eurPerLiter), detail: `€${mine.eurPerLiter.toFixed(1)}/l` },
      { label: "Weight/l", value: norm(mine.kgPerLiter, mins.kgPerLiter, maxs.kgPerLiter), detail: `${mine.kgPerLiter.toFixed(2)}kg/l` },
      { label: "Portability", value: portScore, detail: `${mine.kgPerArea.toFixed(1)}kg/m²` },
    ];
  }, [pad, allPads, area, vol]);

  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const r = 90;
  const n = metrics.length;

  const getPoint = (i, val) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = (val / 100) * r;
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
  };

  const dataPoints = metrics.map((m, i) => getPoint(i, Math.max(m.value, 5)));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <div style={{ background: T.card, borderRadius: T.radius, padding: "24px", border: `1px solid ${T.border}` }}>
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

// ─── Price Comparison (inline card) ───────────────────────────────
function PriceComparison({ prices, compact, pad }) {
  const amazonUrl = pad ? `https://www.amazon.de/s?k=${encodeURIComponent(`crash pad ${pad.brand} ${pad.model}`.trim())}&tag=climbinggear0e-21` : null;
  // Helper to ensure Amazon URLs include product category search terms
  const getRetailerUrl = (url) => {
    if (!url || url === "#") return undefined;
    if (url.toLowerCase().includes('amazon')) return amazonUrl;
    return url;
  };
  const amazonLink = amazonUrl && (
    <a href={amazonUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px",
        background: "#232F3E", borderRadius: T.radiusSm, textDecoration: "none",
        transition: "opacity .15s", marginBottom: "16px" }}
      onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
      onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
      <span style={{ fontSize: "13px", fontWeight: 700, color: "#FF9900" }}>amazon</span>
      <span style={{ fontSize: "12px", color: "#fff", flex: 1 }}>Search on Amazon.de</span>
      <span style={{ fontSize: "12px", color: "#FF9900" }}>→</span>
    </a>
  );
  if (!prices || !prices.length) return amazonLink || null;
  const best = Math.min(...prices.filter(p => p.inStock && p.price).map(p => p.price));
  return (
    <>
      <div style={{ background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: "8px" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase" }}>Price Comparison</div>
          <Tag variant="green">Best: €{best}</Tag>
        </div>
        {prices.map((p, i) => (
          <a key={i} href={getRetailerUrl(p.url)} target="_blank" rel="noopener noreferrer" style={{
            display: "grid", gridTemplateColumns: compact ? "1fr auto auto" : "1fr auto auto",
            alignItems: "center", padding: compact ? "10px 16px" : "10px 16px", gap: "8px",
            borderBottom: i < prices.length - 1 ? `1px solid ${T.border}` : "none",
            background: p.price === best && p.inStock ? T.accentSoft : "transparent",
            textDecoration: "none", cursor: p.url && p.url !== "#" ? "pointer" : "default",
            transition: "background .15s",
          }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: T.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.shop}</span>
              {p.delivery && <span style={{ fontSize: "10px", color: T.muted, display: "block" }}>{p.delivery}</span>}
            </div>
            <span style={{ fontSize: "14px", fontWeight: 800, color: p.price === best ? T.accent : T.text, fontFamily: T.mono, whiteSpace: "nowrap" }}>
              €{p.price.toFixed(2)}
            </span>
            {p.url && p.url !== "#" && (
              <span style={{ fontSize: "11px", color: T.accent, fontWeight: 600 }}>→ Shop</span>
            )}
          </a>
        ))}
      </div>
      {amazonLink}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN: Crashpad Detail Page
// ═══════════════════════════════════════════════════════════════════

export default function CrashpadDetail({ crashpads = [], priceData = {} }) {
  const { slug } = useParams();
  const pad = crashpads.find((p) => p.slug === slug);
  usePageMeta(
    pad ? `${pad.brand} ${pad.model} — Crashpad Specs` : null,
    pad ? `${pad.brand} ${pad.model}: dimensions, weight, foam type, and price comparison.` : null
  );
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("overview");

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
  const padPrices = priceData[pad.slug] || [];
  const bestPadOffer = padPrices.find(p => p.inStock && p.price > 0) || padPrices[0];
  const bestPadUrl = bestPadOffer?.url && bestPadOffer.url !== "#" ? bestPadOffer.url : null;

  // SIMILAR PRODUCTS: up to 3 pads matching EITHER same size_category OR any overlapping best_use
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

      {/* Hero Section */}
      <div style={{
        padding: isMobile ? "24px 16px" : "32px 24px",
        background: `linear-gradient(135deg, ${sc.color}10, ${sc.color}04)`,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "24px" : "40px" }}>
          {/* Left: Image or SVG */}
          <div>
            {pad.image_url ? (
              <div style={{
                width: "100%", aspectRatio: "1",
                borderRadius: T.radius, overflow: "hidden",
                background: `linear-gradient(135deg, ${sc.color}08, ${sc.color}02)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${T.border}`,
              }}>
                <img src={pad.image_url} alt={`${pad.brand} ${pad.model}`}
                  style={{ width: "100%", height: "100%", objectFit: "contain", padding: "16px" }} />
              </div>
            ) : (
              <div style={{
                width: "100%", aspectRatio: "1",
                borderRadius: T.radius,
                background: `linear-gradient(135deg, ${sc.color}08, ${sc.color}02)`,
                border: `1px solid ${T.border}`,
                padding: "24px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <CrashpadSVGDetail pad={pad} />
              </div>
            )}
          </div>

          {/* Right: Identity + Pricing */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Size Badge + Brand */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
              <span style={{
                padding: "4px 12px", borderRadius: "8px",
                fontSize: "10px", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase",
                fontFamily: T.mono, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
              }}>
                {fmt(pad.pad_size_category)}
              </span>
              <span style={{ fontSize: "11px", color: T.dim, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" }}>
                {pad.brand}
              </span>
              {pad.year_released && (
                <span style={{ fontSize: "10px", color: T.dim, fontFamily: T.mono }}>{pad.year_released}</span>
              )}
            </div>

            {/* Model + Heart */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <h1 style={{ fontSize: isMobile ? "24px" : "28px", fontWeight: 800, lineHeight: 1.2, margin: 0, letterSpacing: "-0.5px" }}>
                {pad.model}
              </h1>
              <HeartButton type="crashpad" slug={pad.slug} style={{ fontSize: "22px" }} />
            </div>

            {/* Description */}
            {pad.description && (
              <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.6, marginBottom: "16px" }}>
                {pad.description}
              </p>
            )}

            {/* Price Comparison inline */}
            <PriceComparison prices={padPrices} compact={isMobile} pad={pad} />

            {/* Price Alert */}
            <PriceAlertForm gearType="crashpad" slug={pad.slug} currentPrice={pad.current_price_eur} isMobile={isMobile} />
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px" }}>
        <div style={{ display: "flex", gap: isMobile ? "0" : "20px", borderBottom: `1px solid ${T.border}`, paddingBottom: "0" }}>
          {[{ key: "overview", label: "Overview" }, { key: "prices", label: "Prices" }, { key: "specs", label: "Specs" }].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: "16px 0", border: "none", background: "transparent", color: activeTab === tab.key ? T.accent : T.muted,
              fontSize: isMobile ? "13px" : "14px", fontWeight: activeTab === tab.key ? 700 : 600, cursor: "pointer",
              borderBottom: activeTab === tab.key ? `2px solid ${T.accent}` : "none",
              transition: "all 0.2s ease", fontFamily: T.font, flex: isMobile ? 1 : "none", textAlign: "center",
              marginRight: isMobile ? "0" : "20px",
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: isMobile ? "20px 16px 60px" : "32px 24px 80px" }}>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div>
            {/* Best For + Approach/Fold */}
            <Section title="Best For">
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
                {ensureArray(pad.best_use).map((u) => <Tag key={u} variant="accent">{u}</Tag>)}
              </div>
              <StatRow label="Approach" value={fmt(pad.approach_suitability)} />
              <StatRow label="Fold Style" value={fmt(pad.fold_style)} />
            </Section>

            {/* Efficiency Radar */}
            <EfficiencyRadar pad={pad} allPads={crashpads} />

            {/* Strengths & Trade-offs */}
            {((Array.isArray(pad.pros) ? pad.pros.length : pad.pros) || (Array.isArray(pad.cons) ? pad.cons.length : pad.cons)) && (
              <Section title="Strengths & Trade-offs">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
                  <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: T.green, marginBottom: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Strengths</div>
                    {(Array.isArray(pad.pros) ? pad.pros : String(pad.pros || "").split(/\n|(?<=\w)\. /).filter(Boolean)).map((p, i) => (
                      <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "10px", fontSize: "13px", color: T.text, lineHeight: 1.5 }}>
                        <span style={{ color: T.green, flexShrink: 0, fontWeight: 700 }}>+</span> {typeof p === "string" ? p.replace(/\.$/, "") : p}
                      </div>
                    ))}
                  </div>
                  <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: T.red, marginBottom: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Trade-offs</div>
                    {(Array.isArray(pad.cons) ? pad.cons : String(pad.cons || "").split(/\n|(?<=\w)\. /).filter(Boolean)).map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "10px", fontSize: "13px", color: T.text, lineHeight: 1.5 }}>
                        <span style={{ color: T.red, flexShrink: 0, fontWeight: 700 }}>−</span> {typeof c === "string" ? c.replace(/\.$/, "") : c}
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {/* What Climbers Say */}
            {pad.customer_voices?.length > 0 && (
              <Section title="What Climbers Say">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
                  {pad.customer_voices.slice(0, 4).map((v, i) => (
                    <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "22px", transition: "border-color 0.2s" }}
                      onMouseOver={e => e.currentTarget.style.borderColor = "rgba(232,115,74,0.25)"}
                      onMouseOut={e => e.currentTarget.style.borderColor = T.border}>
                      <div style={{ fontSize: "28px", color: T.accent, opacity: 0.3, fontFamily: "Georgia, serif", lineHeight: 1, marginBottom: "6px" }}>"</div>
                      <div style={{ fontSize: "13px", color: T.text, lineHeight: 1.7, fontStyle: "italic", opacity: 0.9 }}>{typeof v === "object" ? v.text : v}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Similar Crashpads */}
            {similar.length > 0 && (
              <Section title="Similar Crashpads">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(250px, 1fr))", gap: "16px" }}>
                  {similar.map((p) => {
                    const psc = SIZE_COLORS[p.pad_size_category] || SIZE_COLORS.medium;
                    return (
                      <Link key={p.slug} to={`/crashpad/${p.slug}`} style={{ textDecoration: "none" }}>
                        <div style={{
                          background: T.card, borderRadius: T.radius, padding: "16px",
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
        )}

        {/* Prices Tab */}
        {activeTab === "prices" && (
          <div>
            {/* Price Intelligence 2x2 Grid */}
            <Section title="Price Intelligence">
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
                {/* Price vs UVP */}
                <div style={{ background: T.card, borderRadius: T.radiusSm, padding: "16px", border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "16px" }}>💵</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: T.text }}>Price vs UVP</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: T.muted, lineHeight: 1.5 }}>
                    {hasDiscount ? `${Math.round(((pad.price_uvp_eur - pad.current_price_eur) / pad.price_uvp_eur) * 100)}% below UVP (€${pad.price_uvp_eur})` : "At or near full UVP"}
                  </div>
                </div>

                {/* Model Lifecycle */}
                <div style={{ background: T.card, borderRadius: T.radiusSm, padding: "16px", border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "16px" }}>📅</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: T.text }}>Model Lifecycle</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: T.muted, lineHeight: 1.5 }}>
                    {pad.year_released ? `Released ${pad.year_released} (${new Date().getFullYear() - pad.year_released}y ago)` : "Release date unknown"}
                  </div>
                </div>

                {/* Expected Price Development */}
                <div style={{ background: T.card, borderRadius: T.radiusSm, padding: "16px", border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "16px" }}>⏳</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: T.text }}>Expected Price Development</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: T.muted, lineHeight: 1.5 }}>Coming soon</div>
                </div>

                {/* Price History */}
                <div style={{ background: T.card, borderRadius: T.radiusSm, padding: "16px", border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "16px" }}>📊</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: T.text }}>Price History</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: T.muted, lineHeight: 1.5 }}>Coming soon</div>
                </div>
              </div>
            </Section>
          </div>
        )}

        {/* Specs Tab */}
        {activeTab === "specs" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "24px" : "40px" }}>
            {/* Left Column */}
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

            {/* Right Column */}
            <div>
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
            </div>
          </div>
        )}

      </div>

      {/* Legal disclaimer */}
      <div style={{ padding: isMobile ? "20px 16px" : "24px 32px", borderTop: `1px solid ${T.border}`, background: T.bg }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "11px", color: T.muted, lineHeight: 1.7, fontFamily: T.font, margin: 0, maxWidth: "800px" }}>
            <strong style={{ color: T.muted, fontWeight: 600 }}>Disclaimer:</strong>{" "}
            Crashpads reduce but do not eliminate the risk of injury from bouldering falls. Always assess landing zones, use a spotter, and follow safe bouldering practices.
            Specifications, prices, and availability on this site are for informational comparison only and may change without notice.
            This site may contain affiliate links {"\u2014"} purchases through these links may earn us a commission at no extra cost to you.
            Product data is sourced from manufacturers and retailers. Always verify details with the retailer before purchasing.
          </p>
        </div>
      </div>

    </div>
  );
}