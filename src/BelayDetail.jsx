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
        <circle cx="90" cy="118" r="8" fill="none" stroke="#9ca3af" strokeWidth="2" opacity="0.5" />
        <path d="M90 12 Q84 32 90 62 Q96 92 90 118" stroke="#e8734a" strokeWidth="2" fill="none" strokeDasharray="4,3" opacity="0.35" />
        <text x="90" y="152" textAnchor="middle" fill="#6b7280" fontSize="10" fontFamily="'DM Mono',monospace">CAM DEVICE</text>
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
        <circle cx="90" cy="110" r="6" fill="none" stroke="#9ca3af" strokeWidth="2" opacity="0.5" />
        <circle cx="72" cy="95" r="3" fill={c2} opacity="0.6" />
        <text x="90" y="148" textAnchor="middle" fill="#6b7280" fontSize="10" fontFamily="'DM Mono',monospace">PASSIVE ASSISTED</text>
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
        <path d="M90 28 Q90 16 100 16 Q110 16 110 28" stroke="#9ca3af" strokeWidth="2" fill="none" opacity="0.5" />
      )}
      <circle cx="90" cy="108" r="6" fill="none" stroke="#9ca3af" strokeWidth="2" opacity="0.5" />
      <text x="90" y="145" textAnchor="middle" fill="#6b7280" fontSize="10" fontFamily="'DM Mono',monospace">
        {device.guide_mode ? "TUBE + GUIDE" : "TUBE DEVICE"}
      </text>
    </svg>
  );
}

// ═══ STAT ROW ═══

function StatRow({ label, value, unit }) {
  if (value == null || value === "") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1d23" }}>
      <span style={{ color: "#9ca3af", fontSize: "13px" }}>{label}</span>
      <span style={{ color: "#e5e7eb", fontSize: "13px", fontWeight: 500, fontFamily: "'DM Mono',monospace" }}>
        {value}{unit || ""}
      </span>
    </div>
  );
}

// ═══ SECTION ═══

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h3 style={{ color: "#e5e7eb", fontSize: "14px", fontWeight: 600, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// ═══ TAG ═══

function Tag({ label, variant = "default" }) {
  const styles = {
    default: { bg: "rgba(107,114,128,0.15)", color: "#9ca3af" },
    accent: { bg: "rgba(232,115,74,0.15)", color: "#E8734A" },
    green: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
    blue: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6" },
    purple: { bg: "rgba(168,85,247,0.15)", color: "#a855f7" },
    red: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
  };
  const s = styles[variant] || styles.default;
  return (
    <span style={{ padding: "4px 12px", borderRadius: "10px", background: s.bg, color: s.color, fontSize: "12px", fontWeight: 500 }}>
      {String(label).replace(/_/g, " ")}
    </span>
  );
}

// ═══ MAIN DETAIL ═══

export default function BelayDetail({ belays = [] }) {
  const { slug } = useParams();
  const d = belays.find((b) => b.slug === slug);
  const isMobile = useIsMobile();

  const similar = useMemo(() => {
    if (!d) return [];
    return belays
      .filter((b) => b.slug !== d.slug && b.device_type === d.device_type)
      .slice(0, 3);
  }, [d, belays]);

  if (!d) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1117", color: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔗</div>
          <h2>Device not found</h2>
          <Link to="/belays" style={{ color: "#E8734A", textDecoration: "none" }}>← Back to belay devices</Link>
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

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#e5e7eb", fontFamily: "'DM Sans',sans-serif" }}>
      {/* Header */}
      <header style={{ padding: isMobile ? "12px 16px" : "16px 32px", borderBottom: "1px solid #23272f", minHeight: isMobile ? "44px" : "auto", display: "flex", alignItems: "center" }}>
        <Link to="/belays" style={{ color: "#6b7280", textDecoration: "none", fontSize: "13px", minHeight: "44px", display: "flex", alignItems: "center" }}>
          ← Back to belay devices
        </Link>
      </header>

      {/* Main */}
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: isMobile ? "20px 16px" : "32px" }}>
        {/* Top section */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "24px" : "40px", marginBottom: isMobile ? "28px" : "40px" }}>
          {/* Left: Product Image (fallback to SVG) */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", background: d.image_url ? "#fff" : "#14171c", borderRadius: "16px", padding: isMobile ? "20px" : "32px", minHeight: isMobile ? "180px" : "260px" }}>
            <Img
              src={d.image_url}
              alt={`${d.brand} ${d.model}`}
              style={{ maxWidth: "90%", maxHeight: isMobile ? "160px" : "220px", objectFit: "contain" }}
              fallback={<BelaySVGDetail device={d} compact={isMobile} />}
            />
          </div>

          {/* Right: Identity + Price */}
          <div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
              <TypeBadge type={d.device_type} size="md" />
            </div>
            <div style={{ color: "#9ca3af", fontSize: "13px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
              {d.brand}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "0 0 16px" }}>
              <h1 style={{ fontSize: isMobile ? "22px" : "28px", fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>
                {d.model}
              </h1>
              <HeartButton type="belay" slug={d.slug} style={{ fontSize: "22px" }} />
            </div>

            <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6, marginBottom: "20px" }}>
              {d.description}
            </p>

            {/* ═══ STANDARDIZED PRICE SECTION ═══ */}
            <div style={{
              background: "#14171c", border: "1px solid #23272f", borderRadius: "12px",
              padding: 0, marginBottom: "16px", display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", overflow: "hidden",
            }}>
              {/* Left: Price + Size (N/A) */}
              <div style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "28px", fontWeight: 800, color: "#E8734A", fontFamily: "'DM Mono',monospace" }}>
                    €{fmt(price)}
                  </span>
                  {hasDiscount && (
                    <>
                      <span style={{ fontSize: "14px", color: "#6b7280", textDecoration: "line-through", fontFamily: "'DM Mono',monospace" }}>
                        €{fmt(d.price_uvp_eur)}
                      </span>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#22c55e", fontFamily: "'DM Mono',monospace" }}>
                        −{Math.round(((d.price_uvp_eur - d.price_eur_min) / d.price_uvp_eur) * 100)}%
                      </span>
                    </>
                  )}
                </div>
                {!hasDiscount && (
                  <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>UVP €{fmt(d.price_uvp_eur)}</div>
                )}
                {/* Size selection — N/A for belay */}
                <div style={{ marginTop: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#6b7280", letterSpacing: "1px", textTransform: "uppercase", fontWeight: 600, marginBottom: "4px" }}>Size Selection</div>
                  <div style={{ fontSize: "11px", color: "#4b5563", fontStyle: "italic" }}>Not applicable for belay devices</div>
                </div>
              </div>
              {/* Right: Deal Evaluation */}
              <div style={{ padding: isMobile ? "16px 20px" : "20px", borderLeft: isMobile ? "none" : "1px solid #23272f", borderTop: isMobile ? "1px solid #23272f" : "none", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                {(() => {
                  const discount = d.price_uvp_eur && d.price_eur_min
                    ? (d.price_uvp_eur - d.price_eur_min) / d.price_uvp_eur : 0;
                  const factors = [];
                  let totalScore = 0, totalWeight = 0;
                  // Factor 1: Price vs UVP (40%)
                  const ps = discount >= 0.30 ? 1.0 : discount >= 0.20 ? 0.7 : discount >= 0.10 ? 0.3 : discount >= 0.05 ? 0.0 : -0.5;
                  factors.push({ name: "Price vs UVP", icon: ps >= 0.5 ? "\uD83D\uDFE2" : ps >= 0 ? "\uD83D\uDFE1" : "\uD83D\uDD34", weight: 0.40,
                    detail: discount > 0.01 ? `${Math.round(discount * 100)}% below UVP (€${d.price_uvp_eur})` : "At or near full UVP" });
                  totalScore += ps * 0.40; totalWeight += 0.40;
                  // Factor 2: Model Lifecycle (25%)
                  const currentYear = new Date().getFullYear();
                  const modelAge = d.year_released ? currentYear - d.year_released : null;
                  if (modelAge !== null) {
                    const as = modelAge >= 3 ? 0.5 : modelAge >= 2 ? -0.3 : modelAge >= 1 ? 0.0 : -0.4;
                    factors.push({ name: "Model Lifecycle", icon: as > 0.2 ? "\uD83D\uDFE2" : as >= -0.1 ? "\uD83D\uDFE1" : "\uD83D\uDD34", weight: 0.25,
                      detail: `Released ${d.year_released} (${modelAge}y ago)` });
                    totalScore += as * 0.25; totalWeight += 0.25;
                  }
                  // Factor 3: Expected Price Development (20%)
                  factors.push({ name: "Expected Price Development", icon: "\u23F3", weight: 0.20, detail: "Coming soon" });
                  // Factor 4: Price History (15%)
                  factors.push({ name: "Price History", icon: "\uD83D\uDCCA", weight: 0.15, detail: "Coming soon" });

                  const ns = totalWeight > 0 ? totalScore / totalWeight : 0;
                  let label, color, icon;
                  if (ns >= 0.45) { label = "Buy Now"; color = "#22c55e"; icon = "\uD83D\uDFE2"; }
                  else if (ns >= 0.15) { label = "Good Deal"; color = "#22c55e"; icon = "\uD83D\uDC4D"; }
                  else if (ns >= -0.15) { label = "Fair Price"; color = "#eab308"; icon = "\u2696\uFE0F"; }
                  else if (ns >= -0.40) { label = "Consider Waiting"; color = "#E8734A"; icon = "\u23F3"; }
                  else { label = "Wait for Sale"; color = "#ef4444"; icon = "\uD83D\uDD34"; }
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
                      <div style={{ fontSize: "11px", color: "#9ca3af", lineHeight: 1.6, marginBottom: "14px" }}>{forecast}</div>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {factors.map((f, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "12px" }}>{f.icon}</span>
                            <span style={{ fontSize: "11px", fontWeight: 600, color: "#e5e7eb", whiteSpace: "nowrap" }}>{f.name}</span>
                            <span style={{ fontSize: "10px", color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>{Math.round(f.weight * 100)}%</span>
                            <span style={{ flex: 1, fontSize: "10px", color: "#9ca3af", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.detail}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Price Alert */}
            <PriceAlertForm gearType="belay" slug={d.slug} currentPrice={price} isMobile={isMobile} />

            {/* Price History — Coming Soon */}
            <div style={{ background: "#14171c", borderRadius: "12px", padding: "24px", border: "1px solid #23272f", textAlign: "center", marginBottom: "20px" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.4 }}>{"\uD83D\uDCCA"}</div>
              <div style={{ fontSize: "12px", color: "#9ca3af" }}>Price history data coming soon</div>
            </div>

            {/* Quick tags */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {d.anti_panic && <Tag label="Anti-Panic" variant="green" />}
              {d.guide_mode && <Tag label="Guide Mode" variant="blue" />}
              {d.lead_top_switch && <Tag label="Lead/TR Switch" variant="green" />}
              {d.rappel_double_strand && <Tag label="Double Rappel" variant="blue" />}
              {d.eco_design && <Tag label="Eco Design" variant="green" />}
              {d.mechanical_advantage && <Tag label={d.mechanical_advantage} variant="purple" />}
            </div>
          </div>
        </div>

        {/* Specs + Use in two columns */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "24px" : "32px", marginBottom: isMobile ? "28px" : "40px" }}>
          {/* Specs */}
          <div>
            <Section title="📐 Specifications">
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
            </Section>

            <Section title="🛡️ Safety Features">
              <StatRow label="Anti-Panic" value={d.anti_panic ? "✅ Yes" : "—"} />
              <StatRow label="Lead/TR Switch" value={d.lead_top_switch ? "✅ Yes" : "—"} />
              <StatRow label="Guide Mode" value={d.guide_mode ? "✅ Yes" : "—"} />
              <StatRow label="Single Strand Rappel" value={d.rappel_single_strand ? "✅ Yes" : "—"} />
              <StatRow label="Double Strand Rappel" value={d.rappel_double_strand ? "✅ Yes" : "—"} />
            </Section>
          </div>

          {/* Use Cases + Rope Types */}
          <div>
            <Section title="🧗 Use Cases">
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {useCases.map((u) => (
                  <Tag key={u} label={u} variant="accent" />
                ))}
              </div>
            </Section>

            <Section title="🎯 Skill Level">
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {skills.map((s) => (
                  <Tag key={s} label={s} variant="blue" />
                ))}
              </div>
            </Section>

            <Section title="🪢 Rope Compatibility">
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {ropeTypes.map((r) => (
                  <Tag key={r} label={r} variant="purple" />
                ))}
              </div>
            </Section>

            {certs.length > 0 && (
              <Section title="📜 Certifications">
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {certs.map((c) => (
                    <Tag key={c} label={c.replace(/_/g, " ")} />
                  ))}
                </div>
              </Section>
            )}

            {d.eco_design && d.eco_details && (
              <Section title="🌱 Sustainability">
                <p style={{ color: "#9ca3af", fontSize: "13px" }}>{d.eco_details}</p>
              </Section>
            )}
          </div>
        </div>

        {/* Pros / Cons */}
        {(pros.length > 0 || cons.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px", marginBottom: isMobile ? "28px" : "40px" }}>
            {pros.length > 0 && (
              <div style={{ background: "rgba(34,197,94,0.05)", borderRadius: "12px", padding: "20px", border: "1px solid rgba(34,197,94,0.15)" }}>
                <h4 style={{ color: "#22c55e", fontSize: "13px", fontWeight: 600, margin: "0 0 12px" }}>✓ Pros</h4>
                {pros.map((p, i) => (
                  <div key={i} style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "6px", paddingLeft: "12px" }}>• {p}</div>
                ))}
              </div>
            )}
            {cons.length > 0 && (
              <div style={{ background: "rgba(239,68,68,0.05)", borderRadius: "12px", padding: "20px", border: "1px solid rgba(239,68,68,0.15)" }}>
                <h4 style={{ color: "#ef4444", fontSize: "13px", fontWeight: 600, margin: "0 0 12px" }}>✗ Cons</h4>
                {cons.map((c, i) => (
                  <div key={i} style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "6px", paddingLeft: "12px" }}>• {c}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Similar devices */}
        {similar.length > 0 && (
          <Section title="🔗 Similar Devices">
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(250px, 1fr))", gap: "12px" }}>
              {similar.map((s) => (
                <Link
                  key={s.slug}
                  to={`/belay/${s.slug}`}
                  style={{
                    textDecoration: "none", color: "inherit",
                    background: "#14171c", borderRadius: "12px", padding: "16px",
                    border: "1px solid #23272f", transition: "all .2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#23272f")}
                >
                  <TypeBadge type={s.device_type} />
                  <div style={{ color: "#9ca3af", fontSize: "11px", marginTop: "8px", textTransform: "uppercase" }}>{s.brand}</div>
                  <div style={{ color: "#e5e7eb", fontSize: "14px", fontWeight: 600 }}>{s.model}</div>
                  <div style={{ color: "#6b7280", fontSize: "11px", marginTop: "4px", fontFamily: "'DM Mono',monospace" }}>
                    {s.weight_g}g · €{fmt(s.price_eur_min || s.price_uvp_eur)}
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
