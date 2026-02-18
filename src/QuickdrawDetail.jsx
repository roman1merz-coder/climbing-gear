import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { fmt, ensureArray } from "./utils/format.js";
import HeartButton from "./HeartButton.jsx";
import PriceAlertForm from "./PriceAlertForm.jsx";
import usePageMeta from "./usePageMeta.js";
import useIsMobile from "./useIsMobile.js";

/** Image with graceful fallback on 404 */
function Img({ src, alt, style, fallback }) {
  const [err, setErr] = useState(false);
  if (!src || err) return fallback || null;
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} style={style} />;
}

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

// ═══ TYPE BADGE ═══

const TYPE_COLORS = {
  sport: { bg: "rgba(232,115,74,0.15)", color: "#E8734A", icon: "⚡" },
  alpine: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", icon: "🏔️" },
  trad: { bg: "rgba(16,185,129,0.15)", color: "#10b981", icon: "🪨" },
  hybrid: { bg: "rgba(168,85,247,0.15)", color: "#a855f7", icon: "🔄" },
  competition: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", icon: "🏆" },
};

function TypeBadge({ type, size = "sm" }) {
  const t = TYPE_COLORS[type] || TYPE_COLORS.sport;
  const label = String(type).replace(/_/g, " ");
  const isSm = size === "sm";
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        padding: isSm ? "3px 10px" : "5px 14px", borderRadius: "12px",
        background: t.bg, color: t.color,
        fontSize: isSm ? "10px" : "12px", fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      {t.icon} {label}
    </span>
  );
}

// ═══ QUICKDRAW SVG (Detail — larger) ═══

function QuickdrawSVGDetail({ quickdraw, compact }) {
  const c1 = quickdraw.color_1 || "#4a4a4a";
  const c2 = quickdraw.color_2 || "#e8734a";
  const svgW = compact ? 200 : 300;
  const svgH = compact ? 160 : 240;

  return (
    <svg viewBox="0 0 200 160" width={svgW} height={svgH}>
      <defs>
        <linearGradient id="carabiner-grad-upper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
        </linearGradient>
        <linearGradient id="carabiner-grad-lower" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c2} />
          <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
        </linearGradient>
        <linearGradient id="sling-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={c1} opacity="0.8" />
          <stop offset="50%" stopColor={c2} opacity="0.8" />
          <stop offset="100%" stopColor={c1} opacity="0.8" />
        </linearGradient>
      </defs>

      {/* Upper Carabiner */}
      <path d="M45 35 Q45 25 55 25 L85 25 Q95 25 95 35 L95 55 Q95 60 90 62 L50 62 Q45 60 45 55 Z"
        fill="url(#carabiner-grad-upper)" stroke={c1} strokeWidth="1.5" opacity="0.95" />
      <circle cx="70" cy="42" r="3" fill="rgba(255,255,255,0.3)" />

      {/* Sling / Webbing Strip */}
      <rect x="48" y="60" width="104" height="28" rx="3" fill="url(#sling-grad)" opacity="0.85" />
      <line x1="50" y1="60" x2="150" y2="60" stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
      <line x1="50" y1="88" x2="150" y2="88" stroke="rgba(0,0,0,0.15)" strokeWidth="1" />

      {/* Lower Carabiner */}
      <path d="M105 90 Q105 85 115 85 L145 85 Q155 85 155 90 L155 110 Q155 118 145 120 L115 120 Q105 118 105 110 Z"
        fill="url(#carabiner-grad-lower)" stroke={c2} strokeWidth="1.5" opacity="0.95" />
      <circle cx="130" cy="102" r="3" fill="rgba(255,255,255,0.3)" />

      {/* Connecting Lines (visual depth) */}
      <path d="M70 62 Q90 75 130 90" stroke="rgba(232,115,74,0.2)" strokeWidth="1" fill="none" opacity="0.4" />

      {/* Label */}
      <text x="100" y="152" textAnchor="middle" fill={T.dim} fontSize="10" fontFamily={T.mono}>QUICKDRAW</text>
    </svg>
  );
}

// ═══ STAT ROW ═══

function StatRow({ label, value, unit }) {
  if (value == null || value === "") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ color: T.muted, fontSize: "13px" }}>{label}</span>
      <span style={{ color: T.text, fontSize: "13px", fontWeight: 500, fontFamily: T.mono }}>
        {value}{unit || ""}
      </span>
    </div>
  );
}

// ═══ SECTION ═══

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h3 style={{ color: T.text, fontSize: "14px", fontWeight: 600, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// ═══ TAG ═══

function Tag({ label, variant = "default" }) {
  const styles = {
    default: { bg: "rgba(107,114,128,0.15)", color: T.muted },
    accent: { bg: T.accentSoft, color: T.accent },
    green: { bg: T.greenSoft, color: T.green },
    blue: { bg: T.blueSoft, color: T.blue },
    purple: { bg: T.purpleSoft, color: T.purple },
    red: { bg: T.redSoft, color: T.red },
  };
  const s = styles[variant] || styles.default;
  return (
    <span style={{ padding: "4px 12px", borderRadius: "10px", background: s.bg, color: s.color, fontSize: "12px", fontWeight: 500 }}>
      {String(label).replace(/_/g, " ")}
    </span>
  );
}

// ═══ MAIN DETAIL ═══

export default function QuickdrawDetail({ quickdraws = [], priceData = {} }) {
  const { slug } = useParams();
  const d = quickdraws.find((q) => q.slug === slug);
  usePageMeta(
    d ? `${d.brand} ${d.model} — Quickdraw Specs` : null,
    d ? `${d.brand} ${d.model}: weight, lengths, carabiner specs, and price comparison.` : null
  );
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("overview");

  // SIMILAR PRODUCTS: up to 3 quickdraws with the same quickdraw_type
  const similar = useMemo(() => {
    if (!d) return [];
    return quickdraws
      .filter((q) => q.slug !== d.slug && q.quickdraw_type === d.quickdraw_type)
      .slice(0, 3);
  }, [d, quickdraws]);

  if (!d) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, color: T.text, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔗</div>
          <h2>Quickdraw not found</h2>
          <Link to="/quickdraws" style={{ color: T.accent, textDecoration: "none" }}>← Back to quickdraws</Link>
        </div>
      </div>
    );
  }

  const pros = ensureArray(d.pros);
  const cons = ensureArray(d.cons);
  const useCases = ensureArray(d.best_use_cases);
  const skills = ensureArray(d.skill_level);
  const certs = ensureArray(d.certification);
  const availableLengths = ensureArray(d.available_lengths_cm);
  const price = d.price_eur_min || d.price_uvp_eur;
  const hasDiscount = d.price_eur_min && d.price_uvp_eur && d.price_eur_min < d.price_uvp_eur;
  const quickdrawPrices = priceData[d.slug] || [];
  const bestQuickdrawOffer = quickdrawPrices.find(p => p.inStock && p.price > 0) || quickdrawPrices[0];
  const bestQuickdrawUrl = bestQuickdrawOffer?.url && bestQuickdrawOffer.url !== "#" ? bestQuickdrawOffer.url : null;

  // Check for keylock on both carabiners
  const bothKeylock = d.upper_nose_type?.toLowerCase().includes("keylock") && d.lower_nose_type?.toLowerCase().includes("keylock");

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font }}>
      {/* Header */}
      <header style={{ padding: isMobile ? "12px 16px" : "16px 32px", borderBottom: `1px solid ${T.border}`, minHeight: isMobile ? "44px" : "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to="/quickdraws" style={{ color: T.dim, textDecoration: "none", fontSize: "13px", minHeight: "44px", display: "flex", alignItems: "center" }}>
          ← Back to quickdraws
        </Link>
        {!isMobile && (
          <div style={{ fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>🧗</span>
            climbing-gear<span style={{ color: T.accent }}>.com</span>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <div style={{ padding: isMobile ? "20px 16px" : "32px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "24px" : "40px", alignItems: "start" }}>
            {/* Left: Product Image */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", background: d.image_url ? "#fff" : T.card, borderRadius: "16px", padding: isMobile ? "20px" : "32px", minHeight: isMobile ? "180px" : "260px" }}>
              <Img
                src={d.image_url}
                alt={`${d.brand} ${d.model}`}
                style={{ maxWidth: "90%", maxHeight: isMobile ? "160px" : "220px", objectFit: "contain" }}
                fallback={<QuickdrawSVGDetail quickdraw={d} compact={isMobile} />}
              />
            </div>

            {/* Right: Identity + Pricing */}
            <div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
                <TypeBadge type={d.quickdraw_type} size="md" />
              </div>
              <div style={{ color: T.muted, fontSize: "13px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                {d.brand}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "0 0 16px" }}>
                <h1 style={{ fontSize: isMobile ? "22px" : "28px", fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>
                  {d.model}
                </h1>
                <HeartButton type="quickdraw" slug={d.slug} style={{ fontSize: "22px" }} />
              </div>

              <p style={{ color: T.muted, fontSize: "14px", lineHeight: 1.6, marginBottom: "20px" }}>
                {d.description}
              </p>

              {/* Quick feature tags */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" }}>
                {d.hot_forged && <Tag label="Hot Forged" variant="green" />}
                {bothKeylock && <Tag label="Keylock Nose" variant="blue" />}
                {d.rubber_keeper && <Tag label="Rubber Keeper" variant="green" />}
                {d.captive_eye && <Tag label="Captive Eye" variant="blue" />}
                {d.extendable && <Tag label="Extendable" variant="purple" />}
                {d.sling_type && <Tag label={d.sling_type} variant="accent" />}
              </div>

              {/* Inline Price Comparison + Amazon Link */}
              {(() => {
                const prices = priceData[d.slug] || [];
                const amazonUrl = `https://www.amazon.de/s?k=${encodeURIComponent(`quickdraw ${d.brand} ${d.model}`.trim())}&tag=climbinggear-21`;
                const getRetailerUrl = (url) => {
                  if (!url || url === "#") return undefined;
                  if (url.toLowerCase().includes('amazon')) return amazonUrl;
                  return url;
                };
                const amazonLink = (
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
                if (!prices.length) return amazonLink;
                const best = Math.min(...prices.filter(p => p.inStock && p.price).map(p => p.price));
                return (
                  <>
                    <div style={{ background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: "8px" }}>
                      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase" }}>Price Comparison</div>
                        <Tag label={`Best: €${best}`} variant="green" />
                      </div>
                      {prices.slice(0, 3).map((p, i) => (
                        <a key={i} href={getRetailerUrl(p.url)} target="_blank" rel="noopener noreferrer" style={{
                          display: "grid", gridTemplateColumns: "1fr auto auto",
                          alignItems: "center", padding: "10px 16px", gap: "12px",
                          borderBottom: i < Math.min(3, prices.length - 1) ? `1px solid ${T.border}` : "none",
                          background: p.price === best && p.inStock ? T.accentSoft : "transparent",
                          textDecoration: "none", cursor: p.url && p.url !== "#" ? "pointer" : "default",
                          transition: "background .15s",
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: T.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.shop}</span>
                            {p.delivery && <span style={{ fontSize: "9px", color: T.muted, display: "block" }}>{p.delivery}</span>}
                          </div>
                          <span style={{ fontSize: "14px", fontWeight: 800, color: p.price === best ? T.accent : T.text, fontFamily: T.mono, whiteSpace: "nowrap" }}>
                            {p.price ? `€${p.price.toFixed(2)}` : "—"}
                          </span>
                          {p.url && p.url !== "#" && (
                            <span style={{ fontSize: "10px", color: T.accent, fontWeight: 600 }}>→ Shop</span>
                          )}
                        </a>
                      ))}
                    </div>
                    {amazonLink}
                  </>
                );
              })()}

              {/* Price Alert */}
              <PriceAlertForm gearType="quickdraw" slug={d.slug} currentPrice={price} isMobile={isMobile} />
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: isMobile ? "20px 16px" : "32px" }}>
        <div style={{ display: "flex", gap: isMobile ? "0" : "20px", marginBottom: "32px", borderBottom: `1px solid ${T.border}`, paddingBottom: "12px" }}>
          {[
            { key: "overview", label: "Overview" },
            { key: "prices", label: "Prices" },
            { key: "specs", label: "Specs" }
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: isMobile ? "8px 12px" : "8px 16px", border: "none", background: "transparent", color: activeTab === tab.key ? T.accent : T.muted,
              fontSize: isMobile ? "13px" : "14px", fontWeight: activeTab === tab.key ? 700 : 600, cursor: "pointer", borderBottom: activeTab === tab.key ? `2px solid ${T.accent}` : "none",
              transition: "all 0.2s ease", fontFamily: T.font, flex: isMobile ? 1 : "none", textAlign: "center",
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div style={{ marginBottom: "40px" }}>
            {/* Use Cases + Skill Level */}
            <Section title="Use Cases & Skill Level">
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: T.muted, fontWeight: 600, marginBottom: "8px", textTransform: "uppercase" }}>Best Use Cases</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {useCases.map((u) => <Tag key={u} label={u} variant="accent" />)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: T.muted, fontWeight: 600, marginBottom: "8px", textTransform: "uppercase" }}>Skill Level</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {skills.map((s) => <Tag key={s} label={s} variant="blue" />)}
                  </div>
                </div>
              </div>
            </Section>

            {/* Available Lengths */}
            {availableLengths.length > 0 && (
              <Section title="Available Lengths">
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {availableLengths.map((len) => <Tag key={len} label={`${len}cm`} variant="purple" />)}
                </div>
              </Section>
            )}

            {/* Strengths & Trade-offs */}
            {(pros.length > 0 || cons.length > 0) && (
              <Section title="Strengths & Trade-offs">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
                  <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: T.green, marginBottom: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Strengths</div>
                    {pros.map((p, i) => (
                      <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "10px", fontSize: "13px", color: T.text, lineHeight: 1.5 }}>
                        <span style={{ color: T.green, flexShrink: 0, fontWeight: 700 }}>+</span> {p}
                      </div>
                    ))}
                  </div>
                  <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: T.red, marginBottom: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Trade-offs</div>
                    {cons.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "10px", fontSize: "13px", color: T.text, lineHeight: 1.5 }}>
                        <span style={{ color: T.red, flexShrink: 0, fontWeight: 700 }}>−</span> {c}
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {/* Similar Quickdraws */}
            {similar.length > 0 && (
              <Section title="Similar Quickdraws">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(250px, 1fr))", gap: "12px" }}>
                  {similar.map((s) => (
                    <Link
                      key={s.slug}
                      to={`/quickdraw/${s.slug}`}
                      style={{
                        textDecoration: "none", color: "inherit",
                        background: T.card, borderRadius: T.radius, padding: "16px",
                        border: `1px solid ${T.border}`, transition: "all .2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.blue)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border)}
                    >
                      <TypeBadge type={s.quickdraw_type} />
                      <div style={{ color: T.muted, fontSize: "11px", marginTop: "8px", textTransform: "uppercase" }}>{s.brand}</div>
                      <div style={{ color: T.text, fontSize: "14px", fontWeight: 600 }}>{s.model}</div>
                      <div style={{ color: T.dim, fontSize: "11px", marginTop: "4px", fontFamily: T.mono }}>
                        {s.weight_g}g · €{fmt(s.price_eur_min || s.price_uvp_eur)}
                      </div>
                    </Link>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* Prices Tab */}
        {activeTab === "prices" && (
          <div style={{ marginBottom: "40px" }}>
            {/* Price Intelligence 2×2 Grid */}
            <Section title="Price Intelligence">
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
                {(() => {
                  const discount = d.price_uvp_eur && d.price_eur_min
                    ? (d.price_uvp_eur - d.price_eur_min) / d.price_uvp_eur : 0;
                  const factors = [];

                  // Factor 1: Price vs UVP
                  const ps = discount >= 0.30 ? 1.0 : discount >= 0.20 ? 0.7 : discount >= 0.10 ? 0.3 : discount >= 0.05 ? 0.0 : -0.5;
                  factors.push({
                    name: "Price vs UVP",
                    icon: ps >= 0.5 ? "🟢" : ps >= 0 ? "🟡" : "🔴",
                    detail: discount > 0.01 ? `${Math.round(discount * 100)}% below UVP (€${d.price_uvp_eur})` : "At or near full UVP"
                  });

                  // Factor 2: Model Lifecycle
                  const currentYear = new Date().getFullYear();
                  const modelAge = d.year_released ? currentYear - d.year_released : null;
                  if (modelAge !== null) {
                    const as = modelAge >= 3 ? 0.5 : modelAge >= 2 ? -0.3 : modelAge >= 1 ? 0.0 : -0.4;
                    factors.push({
                      name: "Model Lifecycle",
                      icon: as > 0.2 ? "🟢" : as >= -0.1 ? "🟡" : "🔴",
                      detail: `Released ${d.year_released} (${modelAge}y ago)`
                    });
                  }

                  // Factor 3: Expected Price Development
                  factors.push({
                    name: "Expected Price Development",
                    icon: "⏳",
                    detail: "Coming soon"
                  });

                  // Factor 4: Price History
                  factors.push({
                    name: "Price History",
                    icon: "📊",
                    detail: "Coming soon"
                  });

                  return factors.map((f, i) => (
                    <div key={i} style={{ background: T.card, borderRadius: T.radiusSm, padding: "16px", border: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                        <span style={{ fontSize: "18px" }}>{f.icon}</span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: T.text }}>{f.name}</span>
                      </div>
                      <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.5 }}>{f.detail}</div>
                    </div>
                  ));
                })()}
              </div>
            </Section>

            {/* Price History Placeholder */}
            <Section title="Price History">
              <div style={{ background: T.card, borderRadius: T.radius, padding: "24px", border: `1px solid ${T.border}`, textAlign: "center" }}>
                <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.4 }}>📊</div>
                <div style={{ fontSize: "12px", color: T.muted }}>Price history data coming soon</div>
              </div>
            </Section>
          </div>
        )}

        {/* Specs Tab */}
        {activeTab === "specs" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "24px" : "32px", marginBottom: "40px" }}>
            {/* Left: Specifications */}
            <div>
              <Section title="Specifications">
                <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                  <StatRow label="Weight" value={d.weight_g} unit="g" />
                  <StatRow label="Sling Type" value={String(d.sling_type)} />
                  <StatRow label="Sling Width" value={d.sling_width_mm} unit="mm" />
                  <StatRow label="Sling Length" value={d.sling_length_mm} unit="mm" />
                  <StatRow label="Carabiner Shape" value={String(d.carabiner_shape)} />
                  <StatRow label="Hot Forged" value={d.hot_forged ? "Yes" : "No"} />
                  {d.year_released && <StatRow label="Year Released" value={d.year_released} />}
                </div>
              </Section>
            </div>

            {/* Right: Gate & Strength */}
            <div>
              <Section title="Gate & Strength">
                <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                  <StatRow label="Upper Gate" value={String(d.upper_gate_type)} />
                  <StatRow label="Upper Nose" value={String(d.upper_nose_type)} />
                  <StatRow label="Gate Opening (Upper)" value={d.gate_opening_upper_mm} unit="mm" />
                  <StatRow label="Lower Gate" value={String(d.lower_gate_type)} />
                  <StatRow label="Lower Nose" value={String(d.lower_nose_type)} />
                  <StatRow label="Gate Opening (Lower)" value={d.gate_opening_lower_mm} unit="mm" />
                  <StatRow label="Major Axis" value={d.strength_major_kn} unit="kN" />
                  <StatRow label="Minor Axis" value={d.strength_minor_kn} unit="kN" />
                  <StatRow label="Open Gate" value={d.strength_open_kn} unit="kN" />
                </div>
              </Section>

              {certs.length > 0 && (
                <Section title="Certifications">
                  <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {certs.map((c) => (
                        <Tag key={c} label={c.replace(/_/g, " ")} />
                      ))}
                    </div>
                  </div>
                </Section>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legal disclaimer */}
      <div style={{ padding: isMobile ? "20px 16px" : "24px 32px", borderTop: `1px solid ${T.border}`, background: T.bg }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p style={{ fontSize: "11px", color: T.muted, lineHeight: 1.7, fontFamily: T.font, margin: 0, maxWidth: "800px" }}>
            <strong style={{ color: T.muted, fontWeight: 600 }}>Disclaimer:</strong>{" "}
            Quickdraws are life-safety equipment. Proper training is essential {"\u2014"} always learn correct usage from a qualified instructor before climbing.
            Specifications, prices, and availability on this site are for informational comparison only and may change without notice.
            This site may contain affiliate links {"\u2014"} purchases through these links may earn us a commission at no extra cost to you.
            Product data is sourced from manufacturers and retailers. Always verify compatibility with your climbing style and harness before purchasing.
          </p>
        </div>
      </div>

    </div>
  );
}
