import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { fmt, ensureArray } from "./utils/format.js";
import HeartButton from "./HeartButton.jsx";
import PriceAlertForm from "./PriceAlertForm.jsx";
import usePageMeta from "./usePageMeta.js";
import useStructuredData, { buildBelaySchema } from "./useStructuredData.js";
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
  active_assisted: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", icon: "⚡" },
  passive_assisted: { bg: "rgba(168,85,247,0.15)", color: "#a855f7", icon: "🔒" },
  tube_guide: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", icon: "🔄" },
  tube: { bg: "rgba(107,114,128,0.15)", color: "#9ca3af", icon: "⊘" },
};

function TypeBadge({ type, size = "sm" }) {
  const t = TYPE_COLORS[type] || TYPE_COLORS.tube;
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

// ═══ BELAY DEVICE SVG (Detail — larger) ═══

function BelaySVGDetail({ device, compact }) {
  const c1 = device.device_color_1 || "#4a4a4a";
  const c2 = device.device_color_2 || "#e8734a";
  const isActive = device.device_type === "active_assisted";
  const isPassive = device.device_type === "passive_assisted";
  const svgW = compact ? 200 : 300;
  const svgH = compact ? 160 : 240;

  if (isActive) {
    return (
      <svg viewBox="0 0 200 160" width={svgW} height={svgH}>
        <defs>
          <linearGradient id="detail-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <rect x="45" y="20" width="90" height="105" rx="18" fill="url(#detail-bg)" opacity="0.9" />
        <rect x="58" y="32" width="60" height="30" rx="8" fill="#0d1117" opacity="0.6" />
        <path d="M80 62 Q95 85 115 62" stroke={c2} strokeWidth="3.5" fill="none" opacity="0.8" />
        <rect x="115" y="80" width="36" height="12" rx="6" fill={c2} opacity="0.7" />
        <circle cx="90" cy="118" r="8" fill="none" stroke={T.muted} strokeWidth="2" opacity="0.5" />
        <path d="M90 12 Q84 32 90 62 Q96 92 90 118" stroke="#e8734a" strokeWidth="2" fill="none" strokeDasharray="4,3" opacity="0.35" />
        <text x="90" y="152" textAnchor="middle" fill={T.dim} fontSize="10" fontFamily={T.mono}>CAM DEVICE</text>
      </svg>
    );
  }

  if (isPassive) {
    return (
      <svg viewBox="0 0 200 160" width={svgW} height={svgH}>
        <defs>
          <linearGradient id="detail-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <rect x="50" y="25" width="80" height="90" rx="14" fill="url(#detail-bg)" opacity="0.9" />
        <ellipse cx="75" cy="55" rx="10" ry="15" fill="#0d1117" opacity="0.6" />
        {device.rope_slots === 2 && <ellipse cx="100" cy="55" rx="10" ry="15" fill="#0d1117" opacity="0.6" />}
        <path d="M110 88 Q130 82 126 102 Q122 118 110 114" stroke={c2} strokeWidth="2.5" fill="none" opacity="0.7" />
        <circle cx="90" cy="110" r="6" fill="none" stroke={T.muted} strokeWidth="2" opacity="0.5" />
        <circle cx="72" cy="95" r="3" fill={c2} opacity="0.6" />
        <text x="90" y="148" textAnchor="middle" fill={T.dim} fontSize="10" fontFamily={T.mono}>PASSIVE ASSISTED</text>
      </svg>
    );
  }

  // Tube / Tube Guide
  return (
    <svg viewBox="0 0 200 160" width={svgW} height={svgH}>
      <defs>
        <linearGradient id="detail-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect x="48" y="28" width="85" height="85" rx="16" fill="url(#detail-bg)" opacity="0.9" />
      <ellipse cx="72" cy="60" rx="10" ry="16" fill="#0d1117" opacity="0.6" />
      {device.rope_slots === 2 && <ellipse cx="108" cy="60" rx="10" ry="16" fill="#0d1117" opacity="0.6" />}
      {device.guide_mode && (
        <path d="M90 28 Q90 16 100 16 Q110 16 110 28" stroke={T.muted} strokeWidth="2" fill="none" opacity="0.5" />
      )}
      <circle cx="90" cy="108" r="6" fill="none" stroke={T.muted} strokeWidth="2" opacity="0.5" />
      <text x="90" y="145" textAnchor="middle" fill={T.dim} fontSize="10" fontFamily={T.mono}>
        {device.guide_mode ? "TUBE + GUIDE" : "TUBE DEVICE"}
      </text>
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

export default function BelayDetail({ belays = [], priceData = {} }) {
  const { slug } = useParams();
  const d = belays.find((b) => b.slug === slug);
  usePageMeta(
    d ? `${d.brand} ${d.model} — Belay Device Specs` : null,
    d ? `${d.brand} ${d.model}: weight, rope compatibility, safety features, and price comparison.` : null
  );
  useStructuredData(buildBelaySchema(d, priceData));
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("overview");

  // SIMILAR PRODUCTS: up to 3 belay devices with the same device_type (e.g. active_assisted)
  const similar = useMemo(() => {
    if (!d) return [];
    return belays
      .filter((b) => b.slug !== d.slug && b.device_type === d.device_type)
      .slice(0, 3);
  }, [d, belays]);

  if (!d) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, color: T.text, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔗</div>
          <h2>Device not found</h2>
          <Link to="/belays" style={{ color: T.accent, textDecoration: "none" }}>← Back to belay devices</Link>
        </div>
      </div>
    );
  }

  const pros = ensureArray(d.pros);
  const cons = ensureArray(d.cons);
  const useCases = ensureArray(d.best_use_cases);
  const skills = ensureArray(d.skill_level);
  const ropeTypes = ensureArray(d.compatible_rope_types);
  const certs = ensureArray(d.certification);
  const price = d.price_eur_min || d.price_uvp_eur;
  const hasDiscount = d.price_eur_min && d.price_uvp_eur && d.price_eur_min < d.price_uvp_eur;
  const belayPrices = priceData[d.slug] || [];
  const bestBelayOffer = belayPrices.find(p => p.inStock && p.price > 0) || belayPrices[0];
  const bestBelayUrl = bestBelayOffer?.url && bestBelayOffer.url !== "#" ? bestBelayOffer.url : null;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font }}>
      {/* Header */}
      <header style={{ padding: isMobile ? "12px 16px" : "16px 32px", borderBottom: `1px solid ${T.border}`, minHeight: isMobile ? "44px" : "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to="/belays" style={{ color: T.dim, textDecoration: "none", fontSize: "13px", minHeight: "44px", display: "flex", alignItems: "center" }}>
          ← Back to belay devices
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
                fallback={<BelaySVGDetail device={d} compact={isMobile} />}
              />
            </div>

            {/* Right: Identity + Pricing */}
            <div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
                <TypeBadge type={d.device_type} size="md" />
              </div>
              <div style={{ color: T.muted, fontSize: "13px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                {d.brand}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "0 0 16px" }}>
                <h1 style={{ fontSize: isMobile ? "22px" : "28px", fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>
                  {d.model}
                </h1>
                <HeartButton type="belay" slug={d.slug} style={{ fontSize: "22px" }} />
              </div>

              <p style={{ color: T.muted, fontSize: "14px", lineHeight: 1.6, marginBottom: "20px" }}>
                {d.description}
              </p>

              {/* Quick feature tags */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" }}>
                {d.anti_panic && <Tag label="Anti-Panic" variant="green" />}
                {d.guide_mode && <Tag label="Guide Mode" variant="blue" />}
                {d.lead_top_switch && <Tag label="Lead/TR Switch" variant="green" />}
                {d.rappel_double_strand && <Tag label="Double Rappel" variant="blue" />}
                {d.eco_design && <Tag label="Eco Design" variant="green" />}
                {d.mechanical_advantage && <Tag label={d.mechanical_advantage} variant="purple" />}
              </div>

              {/* Inline Price Comparison + Amazon Link */}
              {(() => {
                const prices = priceData[d.slug] || [];
                const amazonUrl = `https://www.amazon.de/s?k=${encodeURIComponent(`belay device ${d.brand} ${d.model}`.trim())}&tag=climbinggear0e-21`;
                // Helper to ensure Amazon URLs include product category search terms
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
              <PriceAlertForm gearType="belay" slug={d.slug} currentPrice={price} isMobile={isMobile} />
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

            {/* Rope Compatibility */}
            <Section title="Rope Compatibility">
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {ropeTypes.map((r) => <Tag key={r} label={r} variant="purple" />)}
              </div>
            </Section>

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

            {/* What Climbers Say */}
            {d.customer_voices?.length > 0 && (
              <Section title="What Climbers Say">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
                  {d.customer_voices.slice(0, 4).map((v, i) => (
                    <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "22px", transition: "border-color 0.2s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(232,115,74,0.25)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                      <div style={{ fontSize: "28px", color: T.accent, opacity: 0.3, fontFamily: "Georgia, serif", lineHeight: 1, marginBottom: "6px" }}>"</div>
                      <div style={{ fontSize: "13px", color: T.text, lineHeight: 1.7, fontStyle: "italic", opacity: 0.9 }}>{typeof v === "object" ? v.text : v}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Similar Devices */}
            {similar.length > 0 && (
              <Section title="Similar Devices">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(250px, 1fr))", gap: "12px" }}>
                  {similar.map((s) => (
                    <Link
                      key={s.slug}
                      to={`/belay/${s.slug}`}
                      style={{
                        textDecoration: "none", color: "inherit",
                        background: T.card, borderRadius: T.radius, padding: "16px",
                        border: `1px solid ${T.border}`, transition: "all .2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.blue)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.border)}
                    >
                      <TypeBadge type={s.device_type} />
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
                  <StatRow label="Rope Slots" value={d.rope_slots} />
                  <StatRow label="Rope Diameter" value={`${d.rope_diameter_min_mm}–${d.rope_diameter_max_mm}`} unit=" mm" />
                  {d.rope_diameter_optimal_min_mm && (
                    <StatRow label="Optimal Range" value={`${d.rope_diameter_optimal_min_mm}–${d.rope_diameter_optimal_max_mm}`} unit=" mm" />
                  )}
                  <StatRow label="Material" value={String(d.material).replace(/_/g, " + ")} />
                  <StatRow label="Braking Type" value={String(d.braking_type).replace(/_/g, " ")} />
                  <StatRow label="Lowering" value={String(d.lowering_type).replace(/_/g, " ")} />
                  {d.mechanical_advantage && <StatRow label="Mech. Advantage" value={d.mechanical_advantage} />}
                  {d.year_released && <StatRow label="Released" value={d.year_released} />}
                </div>
              </Section>

              {d.eco_design && d.eco_details && (
                <Section title="Sustainability">
                  <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                    <p style={{ color: T.muted, fontSize: "13px", margin: 0 }}>{d.eco_details}</p>
                  </div>
                </Section>
              )}
            </div>

            {/* Right: Safety Features + Certifications */}
            <div>
              <Section title="Safety Features">
                <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}` }}>
                  <StatRow label="Anti-Panic" value={d.anti_panic ? "✅ Yes" : "—"} />
                  <StatRow label="Lead/TR Switch" value={d.lead_top_switch ? "✅ Yes" : "—"} />
                  <StatRow label="Guide Mode" value={d.guide_mode ? "✅ Yes" : "—"} />
                  <StatRow label="Single Strand Rappel" value={d.rappel_single_strand ? "✅ Yes" : "—"} />
                  <StatRow label="Double Strand Rappel" value={d.rappel_double_strand ? "✅ Yes" : "—"} />
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
            Belay devices are life-safety equipment. Proper training is essential {"\u2014"} always learn correct usage from a qualified instructor before belaying.
            Specifications, prices, and availability on this site are for informational comparison only and may change without notice.
            This site may contain affiliate links {"\u2014"} purchases through these links may earn us a commission at no extra cost to you.
            Product data is sourced from manufacturers and retailers. Always verify compatibility with your rope and harness before purchasing.
          </p>
        </div>
      </div>

    </div>
  );
}
