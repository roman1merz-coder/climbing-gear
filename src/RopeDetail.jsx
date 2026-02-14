import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { fmt, ensureArray } from "./utils/format.js";
import HeartButton from "./HeartButton.jsx";
import PriceAlertForm from "./PriceAlertForm.jsx";
import useIsMobile from "./useIsMobile.js";

/** Image with graceful fallback on 404 */
function Img({ src, alt, style, fallback }) {
  const [err, setErr] = useState(false);
  if (!src || err) return fallback || null;
  return <img src={src} alt={alt} onError={() => setErr(true)} style={style} />;
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
};

const TYPE_COLORS = {
  single: { color: T.blue, bg: T.blueSoft, border: "rgba(96,165,250,.25)" },
  half: { color: T.purple, bg: T.purpleSoft, border: "rgba(167,139,250,.25)" },
  twin: { color: T.cyan, bg: T.cyanSoft, border: "rgba(34,211,238,.25)" },
  static: { color: T.yellow, bg: T.yellowSoft, border: "rgba(234,179,8,.25)" },
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

// ─── Rope SVG (Detail — wider) ───────────────────────────────────
function RopeSVGDetail({ color1, color2, diameter, ropeType }) {
  const w = 500, h = 80;
  const thickness = Math.max(4, diameter * 0.7);

  if (ropeType === "half" || ropeType === "twin") {
    const gap = ropeType === "twin" ? 5 : 10;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%" }}>
        {[0, 1].map((si) => {
          const yOff = h / 2 + (si === 0 ? -gap : gap);
          const c = si === 0 ? color1 : color2;
          const phase = si * Math.PI;
          const pts = [];
          for (let x = 0; x <= w; x += 2) pts.push(`${x},${yOff + Math.sin(x * 0.03 + phase) * 7}`);
          return <polyline key={si} points={pts.join(" ")} fill="none" stroke={c} strokeWidth={thickness * 0.8} strokeLinecap="round" opacity={0.8} />;
        })}
      </svg>
    );
  }
  const pts1 = [], pts2 = [];
  const amp = ropeType === "static" ? 4 : 10;
  const freq = ropeType === "static" ? 0.015 : 0.025;
  for (let x = 0; x <= w; x += 2) {
    pts1.push(`${x},${h / 2 + Math.sin(x * freq) * amp}`);
    pts2.push(`${x},${h / 2 + Math.sin(x * freq + 0.5) * (amp - 2)}`);
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "100%" }}>
      <polyline points={pts1.join(" ")} fill="none" stroke={color1} strokeWidth={thickness} strokeLinecap="round" opacity={0.85} />
      <polyline points={pts2.join(" ")} fill="none" stroke={color2} strokeWidth={thickness * 0.4} strokeLinecap="round" opacity={0.5} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN: Rope Detail Page
// ═══════════════════════════════════════════════════════════════════

export default function RopeDetail({ ropes = [], priceData = {} }) {
  const { slug } = useParams();
  const rope = ropes.find((r) => r.slug === slug);
  const [selectedLength, setSelectedLength] = useState(null);
  const isMobile = useIsMobile();

  if (!rope) {
    return (
      <div style={{ background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <div style={{ fontSize: "48px" }}>🪢</div>
        <div style={{ color: T.muted, fontSize: "16px" }}>Rope not found</div>
        <Link to="/ropes" style={{ color: T.accent, textDecoration: "none", fontSize: "14px" }}>← Back to ropes</Link>
      </div>
    );
  }

  const isDynamic = rope.rope_type !== "static";
  const tc = TYPE_COLORS[rope.rope_type] || TYPE_COLORS.single;

  const similar = ropes.filter((r) =>
    r.slug !== rope.slug &&
    r.rope_type === rope.rope_type &&
    ensureArray(r.best_use_cases).some((u) => ensureArray(rope.best_use_cases).includes(u))
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
        <Link to="/ropes" style={{ color: T.muted, textDecoration: "none", fontSize: isMobile ? "13px" : "14px", display: "flex", alignItems: "center", gap: "6px", minHeight: "44px" }}>
          <span>←</span> Back to ropes
        </Link>
        {!isMobile && (
          <div style={{ marginLeft: "auto", fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>🧗</span>
            climbing-gear<span style={{ color: T.accent }}>.com</span>
          </div>
        )}
      </header>

      {/* Rope visual header */}
      <div style={{
        padding: isMobile ? "24px 0 16px" : "40px 0 20px",
        background: `linear-gradient(135deg, ${rope.rope_color_1 || '#555'}12, ${rope.rope_color_2 || '#333'}06)`,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px" }}>
          <Img
            src={rope.image_url}
            alt={`${rope.brand} ${rope.model}`}
            style={{ display: "block", maxWidth: isMobile ? "260px" : "380px", maxHeight: isMobile ? "180px" : "240px", objectFit: "contain", margin: "0 auto", borderRadius: "12px" }}
            fallback={<RopeSVGDetail color1={rope.rope_color_1 || "#888"} color2={rope.rope_color_2 || "#666"} diameter={rope.diameter_mm} ropeType={rope.rope_type} />}
          />
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: isMobile ? "20px 16px 60px" : "32px 24px 80px" }}>

        {/* Title block */}
        <div style={{ marginBottom: isMobile ? "24px" : "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: T.dim, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" }}>
              {rope.brand}
            </span>
            <span style={{
              padding: "3px 8px", borderRadius: "6px",
              fontSize: "10px", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase",
              fontFamily: T.mono, background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
            }}>
              {rope.rope_type}{rope.triple_rated ? " ③ triple rated" : ""}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <h1 style={{ fontSize: isMobile ? "22px" : "28px", fontWeight: 800, lineHeight: 1.2, margin: 0, letterSpacing: "-0.5px" }}>
              {rope.model}
            </h1>
            <HeartButton type="rope" slug={rope.slug} style={{ fontSize: "22px" }} />
          </div>
          <p style={{ fontSize: "15px", color: T.muted, lineHeight: 1.7, maxWidth: "700px" }}>
            {rope.description}
          </p>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "24px" : "32px" }}>

          {/* Left column — Specs */}
          <div>
            <Section title="Physical Specifications">
              <StatRow label="Diameter" value={rope.diameter_mm} unit="mm" highlight />
              <StatRow label="Weight" value={rope.weight_per_meter_g} unit="g/m" />
              <StatRow label="Sheath" value={rope.sheath_percentage} unit="%" />
              {isDynamic && rope.uiaa_falls && <StatRow label="UIAA Falls" value={rope.uiaa_falls} />}
              {isDynamic && rope.impact_force_kn && <StatRow label="Impact Force" value={rope.impact_force_kn} unit="kN" />}
              {isDynamic && rope.dynamic_elongation_pct && <StatRow label="Dynamic Elongation" value={rope.dynamic_elongation_pct} unit="%" />}
              {rope.static_elongation_pct && <StatRow label="Static Elongation" value={rope.static_elongation_pct} unit="%" />}
              {!isDynamic && rope.breaking_strength_kn && <StatRow label="Breaking Strength" value={rope.breaking_strength_kn} unit="kN" highlight />}
              {!isDynamic && rope.working_elongation_pct && <StatRow label="Working Elongation" value={rope.working_elongation_pct} unit="%" />}
            </Section>

            <Section title="Treatment & Technology">
              <StatRow label="Dry Treatment" value={rope.dry_treatment_name || fmt(rope.dry_treatment)} />
              <StatRow label="UIAA Water Repellent" value={rope.uiaa_water_repellent ? "Yes" : "No"} />
              <StatRow label="Core Construction" value={rope.core_construction} />
              {rope.sheath_technology && <StatRow label="Sheath Technology" value={rope.sheath_technology} />}
              <StatRow label="Aramid Protection" value={rope.aramid_protection ? "Yes" : "No"} />
              <StatRow label="Middle Mark" value={fmt(rope.middle_mark)} />
            </Section>
          </div>

          {/* Right column — Use, Price, Tags */}
          <div>
            <Section title="Best For">
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {ensureArray(rope.best_use_cases).map((u) => <Tag key={u} variant="accent">{u}</Tag>)}
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "12px" }}>
                {ensureArray(rope.skill_level).map((l) => <Tag key={l} variant="blue">{l}</Tag>)}
              </div>
            </Section>

            <Section title="Handling & Compatibility">
              <StatRow label="Handling Feel" value={fmt(rope.handling_feel)} />
              <StatRow label="Durability" value={fmt(rope.durability_rating)} />
              <div style={{ marginTop: "12px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {ensureArray(rope.compatible_device_types).map((d) => <Tag key={d}>{d}</Tag>)}
              </div>
            </Section>

            <Section title="Sustainability">
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {rope.bluesign && <Tag variant="green">Bluesign</Tag>}
                {rope.pfc_free && <Tag variant="green">PFC-Free</Tag>}
                {rope.recycled_materials !== "none" && <Tag variant="green">{fmt(rope.recycled_materials)} Recycled</Tag>}
                {rope.eco_label && <Tag variant="green">{rope.eco_label}</Tag>}
                {!rope.bluesign && !rope.pfc_free && rope.recycled_materials === "none" && (
                  <span style={{ fontSize: "13px", color: T.dim }}>No eco certifications</span>
                )}
              </div>
            </Section>

            {/* ═══ STANDARDIZED PRICE SECTION ═══ */}
            <Section title="Price & Deal Evaluation">
              {/* Combined Price Box: price+length left | evaluation right */}
              <div style={{
                background: T.card, border: `1px solid ${T.border}`, borderRadius: "12px",
                padding: 0, marginBottom: "16px", display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", overflow: "hidden",
              }}>
                {/* Left: Price + Length Selector */}
                <div style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "28px", fontWeight: 800, color: T.accent, fontFamily: T.mono }}>
                      {selectedLength
                        ? `€${(rope.price_per_meter_eur_min * selectedLength).toFixed(0)}`
                        : `€${rope.price_per_meter_eur_min?.toFixed(2)}`}
                    </span>
                    <span style={{ fontSize: "14px", color: T.dim }}>
                      {selectedLength ? `for ${selectedLength}m` : "/m"}
                    </span>
                    {rope.price_uvp_per_meter_eur > rope.price_per_meter_eur_min && (
                      <>
                        <span style={{ fontSize: "14px", color: T.muted, textDecoration: "line-through", fontFamily: T.mono }}>
                          €{selectedLength ? (rope.price_uvp_per_meter_eur * selectedLength).toFixed(0) : rope.price_uvp_per_meter_eur?.toFixed(2)}
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: T.green, fontFamily: T.mono }}>
                          −{Math.round(((rope.price_uvp_per_meter_eur - rope.price_per_meter_eur_min) / rope.price_uvp_per_meter_eur) * 100)}%
                        </span>
                      </>
                    )}
                  </div>
                  {selectedLength && (
                    <div style={{ fontSize: "11px", color: T.muted, marginBottom: "8px" }}>
                      €{rope.price_per_meter_eur_min}/m best price
                    </div>
                  )}
                  {!selectedLength && rope.price_per_meter_eur_max > rope.price_per_meter_eur_min && (
                    <div style={{ fontSize: "11px", color: T.muted, marginBottom: "8px" }}>
                      Range: €{rope.price_per_meter_eur_min?.toFixed(2)}–€{rope.price_per_meter_eur_max?.toFixed(2)}/m
                    </div>
                  )}
                  {/* Length selector */}
                  <div style={{ marginTop: "8px" }}>
                    <div style={{ fontSize: "11px", color: T.muted, letterSpacing: "1px", textTransform: "uppercase", fontWeight: 600, marginBottom: "8px" }}>
                      Length
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {ensureArray(rope.available_lengths_m).map((l) => (
                        <button
                          key={l}
                          onClick={() => setSelectedLength(selectedLength === l ? null : l)}
                          style={{
                            padding: "6px 14px", borderRadius: "8px",
                            fontSize: "13px", fontFamily: T.mono, fontWeight: 600,
                            background: selectedLength === l ? T.accentSoft : "transparent",
                            color: selectedLength === l ? T.accent : T.text,
                            border: selectedLength === l ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                            cursor: "pointer", transition: "all .15s",
                          }}
                        >
                          {l}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Right: Deal Evaluation */}
                <div style={{ padding: isMobile ? "16px 20px" : "20px", borderLeft: isMobile ? "none" : `1px solid ${T.border}`, borderTop: isMobile ? `1px solid ${T.border}` : "none", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  {(() => {
                    const discount = rope.price_uvp_per_meter_eur && rope.price_per_meter_eur_min
                      ? (rope.price_uvp_per_meter_eur - rope.price_per_meter_eur_min) / rope.price_uvp_per_meter_eur : 0;
                    const factors = [];
                    let totalScore = 0, totalWeight = 0;
                    // Factor 1: Price vs UVP (40%)
                    const ps = discount >= 0.30 ? 1.0 : discount >= 0.20 ? 0.7 : discount >= 0.10 ? 0.3 : discount >= 0.05 ? 0.0 : -0.5;
                    factors.push({ name: "Price vs UVP", icon: ps >= 0.5 ? "\uD83D\uDFE2" : ps >= 0 ? "\uD83D\uDFE1" : "\uD83D\uDD34", weight: 0.40,
                      detail: discount > 0.01 ? `${Math.round(discount * 100)}% below UVP (€${rope.price_uvp_per_meter_eur?.toFixed(2)}/m)` : `At or near full UVP` });
                    totalScore += ps * 0.40; totalWeight += 0.40;
                    // Factor 2: Model Lifecycle (25%)
                    const currentYear = new Date().getFullYear();
                    const modelAge = rope.year_released ? currentYear - rope.year_released : null;
                    if (modelAge !== null) {
                      const as = modelAge >= 3 ? 0.5 : modelAge >= 2 ? -0.3 : modelAge >= 1 ? 0.0 : -0.4;
                      factors.push({ name: "Model Lifecycle", icon: as > 0.2 ? "\uD83D\uDFE2" : as >= -0.1 ? "\uD83D\uDFE1" : "\uD83D\uDD34", weight: 0.25,
                        detail: `Released ${rope.year_released} (${modelAge}y ago)` });
                      totalScore += as * 0.25; totalWeight += 0.25;
                    }
                    // Factor 3: Expected Price Development (20%)
                    factors.push({ name: "Expected Price Development", icon: "\u23F3", weight: 0.20, detail: "Coming soon — data collection in progress" });
                    // Factor 4: Price History (15%)
                    factors.push({ name: "Price History", icon: "\uD83D\uDCCA", weight: 0.15, detail: "Coming soon — historical data collection in progress" });

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

              {/* Retailer Links */}
              {(() => {
                const prices = priceData[rope.slug] || [];
                if (!prices.length) return null;
                const best = Math.min(...prices.filter(p => p.inStock && p.price).map(p => p.price));
                return (
                  <div style={{ background: T.card, borderRadius: "12px", border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: "16px" }}>
                    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: T.muted, letterSpacing: "1px", textTransform: "uppercase" }}>Where to Buy</div>
                    </div>
                    {prices.map((p, i) => (
                      <a key={i} href={p.url && p.url !== "#" ? p.url : undefined} target="_blank" rel="noopener noreferrer" style={{
                        display: "grid", gridTemplateColumns: "1fr auto auto",
                        alignItems: "center", padding: "12px 20px", gap: "12px",
                        borderBottom: i < prices.length - 1 ? `1px solid ${T.border}` : "none",
                        background: p.price === best && p.inStock ? T.accentSoft : "transparent",
                        textDecoration: "none", cursor: p.url && p.url !== "#" ? "pointer" : "default",
                        transition: "background .15s",
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: T.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.shop}</span>
                          {p.delivery && <span style={{ fontSize: "10px", color: T.muted, display: "block" }}>{p.delivery}</span>}
                        </div>
                        <span style={{ fontSize: "15px", fontWeight: 800, color: p.price === best ? T.accent : T.text, fontFamily: T.mono, whiteSpace: "nowrap" }}>
                          {p.price ? `\u20AC${p.price.toFixed(2)}` : "\u2014"}
                        </span>
                        {p.url && p.url !== "#" && (
                          <span style={{ fontSize: "11px", color: T.accent, fontWeight: 600 }}>{"\u2192"} Shop</span>
                        )}
                      </a>
                    ))}
                  </div>
                );
              })()}

              {/* Price Alert */}
              <PriceAlertForm
                gearType="rope"
                slug={rope.slug}
                currentPrice={selectedLength ? rope.price_per_meter_eur_min * selectedLength : rope.price_per_meter_eur_min}
                isMobile={isMobile}
              />

              {/* Price History — Coming Soon */}
              <div style={{ background: T.card, borderRadius: "12px", padding: "24px", border: `1px solid ${T.border}`, textAlign: "center" }}>
                <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.4 }}>{"\uD83D\uDCCA"}</div>
                <div style={{ fontSize: "12px", color: T.muted }}>Price history data coming soon</div>
              </div>
            </Section>
          </div>
        </div>

        {/* ═══ Strengths & Trade-offs ═══ */}
        {(rope.pros?.length > 0 || rope.cons?.length > 0) && (
          <>
            <Section title="⚖️ Strengths & Trade-offs">
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
                <div style={{ background: T.card, borderRadius: "12px", padding: "20px", border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: T.green, marginBottom: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Strengths</div>
                  {(rope.pros || []).map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "10px", fontSize: "13px", color: T.text, lineHeight: 1.5 }}>
                      <span style={{ color: T.green, flexShrink: 0, fontWeight: 700 }}>+</span> {p}
                    </div>
                  ))}
                </div>
                <div style={{ background: T.card, borderRadius: "12px", padding: "20px", border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: T.red, marginBottom: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Trade-offs</div>
                  {(rope.cons || []).map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "10px", fontSize: "13px", color: T.text, lineHeight: 1.5 }}>
                      <span style={{ color: T.red, flexShrink: 0, fontWeight: 700 }}>{"\u2212"}</span> {c}
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          </>
        )}

        {/* ═══ What Climbers Say ═══ */}
        {rope.customer_voices?.length > 0 && (
          <Section title="💬 What Climbers Say">
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px" }}>
              {rope.customer_voices.slice(0, 4).map((v, i) => (
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

        {/* Similar ropes */}
        {similar.length > 0 && (
          <Section title="Similar Ropes">
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(250px, 1fr))", gap: "16px" }}>
              {similar.map((r) => (
                <Link key={r.slug} to={`/rope/${r.slug}`} style={{ textDecoration: "none" }}>
                  <div style={{
                    background: T.card, borderRadius: "12px", padding: "16px",
                    border: `1px solid ${T.border}`, transition: "all .2s", cursor: "pointer",
                  }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = T.accent; }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = T.border; }}
                  >
                    <div style={{ fontSize: "10px", color: T.dim, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>
                      {r.brand}
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "8px" }}>{r.model}</div>
                    <div style={{ display: "flex", gap: "8px", fontSize: "12px", color: T.muted, marginBottom: "8px" }}>
                      <span>⌀ {r.diameter_mm}mm</span>
                      <span>{r.weight_per_meter_g}g/m</span>
                    </div>
                    <span style={{ fontSize: "16px", fontWeight: 700, color: T.accent, fontFamily: T.mono }}>
                      €{r.price_per_meter_eur_min?.toFixed(2)}/m
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
