import { useState, useEffect, useRef } from "react";
import usePageMeta from "./usePageMeta.js";
import useStructuredData, { buildWebsiteSchema } from "./useStructuredData.js";
import { Link } from "react-router-dom";
import { T } from "./tokens.js";
import { motion } from "framer-motion";
import SHOES from "./seed_data.json";
import ROPES from "./rope_seed_data.json";
import BELAYS from "./belay_seed_data.json";
import PADS from "./crashpad_seed_data.json";

const TOTAL_PRODUCTS = SHOES.length + ROPES.length + BELAYS.length + PADS.length;

// Responsive hook
function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
}

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";

// ─── SVG Icons (inline, avoids external icon library) ───
function IconChart({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>);
}
function IconStore({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>);
}
function IconRadar({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>);
}
function IconClock({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>);
}
function IconArrow({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>);
}
function IconTarget({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>);
}
function IconBook({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>);
}
function IconShoe({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18h18a1 1 0 0 0 1-1v-1a3 3 0 0 0-3-3h-2l-1.5-3a2 2 0 0 0-1.8-1.1H13L11.5 7a1.5 1.5 0 0 0-1.3-.8H8.5A2.5 2.5 0 0 0 6 8.7V13H4a2 2 0 0 0-2 2v2a1 1 0 0 0 1 1z" /><path d="M6 13h3" /><path d="M3 18v1" /><path d="M21 18v1" /></svg>);
}
function IconRope({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3c0 0 3 2.5 6 2.5S18 3 18 3" /><path d="M6 8c0 0 3 2.5 6 2.5S18 8 18 8" /><path d="M6 13c0 0 3 2.5 6 2.5S18 13 18 13" /><path d="M6 18c0 0 3 2.5 6 2.5S18 18 18 18" /><circle cx="4" cy="3" r="1.2" fill={color} /><circle cx="4" cy="21" r="1.2" fill={color} /><path d="M4 3v18" /></svg>);
}
function IconShield({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
}
function IconLayers({ size = 16, color = "currentColor" }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>);
}

// ─── Data arrays ───
const STATS = [
  { value: `${TOTAL_PRODUCTS}+`, label: "Products", Icon: IconChart },
  { value: "20+", label: "Retailers", Icon: IconStore },
  { value: "0", label: "Bias", Icon: IconRadar },
  { value: "24h", label: "Price Cycle", Icon: IconClock },
];

const SELECTORS = [
  { title: "Shoe Selector", count: `${SHOES.length}+`, to: "/shoes", description: `${SHOES.length}+ climbing shoes compared across 20+ retailers. Find your perfect fit with smart filters and daily price tracking.`, Icon: IconShoe, finderTo: "/find" },
  { title: "Rope Selector", count: `${ROPES.length}+`, to: "/ropes", description: "Dynamic, static, half, and twin ropes. Compare diameter, weight, falls rated, and dry treatment across all major brands.", Icon: IconRope },
  { title: "Belay Device Selector", count: `${BELAYS.length}+`, to: "/belays", description: "Cam, passive-assist, tube, and guide devices. Compare weight, rope range, safety features, and price.", Icon: IconShield },
  { title: "Crashpad Selector", count: `${PADS.length}+`, to: "/crashpads", description: "Bouldering pads from sit-start to oversized. Compare dimensions, foam systems, weight, and portability.", Icon: IconLayers },
];

const INSIGHTS = [
  { title: "How We Score 340 Climbing Shoes \u2014 and How to Pick Yours", description: "Our guided search scores every shoe across 7 performance axes. Learn how specs affect real-world performance.", to: "/insights/climbing-shoe-guide" },
  { title: "Inflatable Crashpads: Game-Changer or Gimmick?", description: "They shatter the weight curve, fit inside your backpack, and inflate in minutes. But how safe are they really?", to: "/insights/inflatable-crashpads" },
  { title: "Does Spending More Buy a Safer Rope?", description: "We crunched cost-per-gram, UIAA falls, and impact force across 200+ ropes to find out.", to: "/insights/rope-cost-vs-safety" },
];

// ═══════════════════════════════════════════════════════════════
// HERO SECTION
// ═══════════════════════════════════════════════════════════════
function HeroSection({ isMobile }) {
  return (
    <section style={{ position: "relative", minHeight: isMobile ? "100svh" : "90vh", display: "flex", alignItems: "center", overflow: "hidden", paddingBottom: isMobile ? "112px" : "96px" }}>
      {/* Background image */}
      <div style={{ position: "absolute", inset: 0 }}>
        <img src="/images/hero-mountain.jpg" alt="Climber on mountain rock face at golden hour" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="eager" />
        <div style={{ position: "absolute", inset: 0, background: isMobile
          ? "linear-gradient(to bottom, rgba(18,16,14,0.92) 0%, rgba(18,16,14,0.72) 50%, rgba(18,16,14,0.25) 100%)"
          : "linear-gradient(to right, rgba(18,16,14,0.92) 0%, rgba(18,16,14,0.72) 40%, rgba(18,16,14,0.25) 70%, transparent 100%)" }} />
      </div>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "1200px", margin: "0 auto", padding: isMobile ? "80px 20px 0" : "96px 40px 0" }}>
        <div style={{ maxWidth: "640px" }}>
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 14px", fontSize: isMobile ? "10px" : "11px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", borderRadius: "20px", background: "rgba(201,138,66,0.18)", color: T.accent, border: "1px solid rgba(201,138,66,0.25)", fontFamily: T.font }}>
              <IconChart size={14} color={T.accent} />
              Data-Driven Gear Comparison
            </span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
            style={{ fontSize: isMobile ? "32px" : "64px", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-1px", color: "#ffffff", margin: isMobile ? "16px 0" : "24px 0", fontFamily: T.font }}>
            Scroll less.<br /><span style={{ fontStyle: "italic", color: T.accent }}>Climb more.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            style={{ fontSize: isMobile ? "15px" : "18px", color: "rgba(255,255,255,0.8)", lineHeight: 1.7, maxWidth: "500px", fontFamily: T.font, marginBottom: isMobile ? "24px" : "32px" }}>
            Every model, every spec, every price {"\u2014"} with zero brand bias and full transparency. Compare climbing gear the smart way.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
            style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "10px" : "12px" }}>
            <Link to="/shoes" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: isMobile ? "12px 20px" : "14px 24px", borderRadius: "10px", background: T.accent, color: "#fff", fontWeight: 700, fontSize: "14px", textDecoration: "none", fontFamily: T.font, transition: "opacity 0.2s" }}>
              Explore Gear Selectors <IconArrow size={16} />
            </Link>
            <Link to="/find" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: isMobile ? "12px 20px" : "14px 24px", borderRadius: "10px", background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 700, fontSize: "14px", textDecoration: "none", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(8px)", fontFamily: T.font, transition: "background 0.2s" }}>
              <IconTarget size={16} /> Guided Shoe Finder
            </Link>
            <a href="#insights" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: isMobile ? "12px 20px" : "14px 24px", borderRadius: "10px", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)", fontWeight: 700, fontSize: "14px", textDecoration: "none", border: "1px solid rgba(255,255,255,0.12)", fontFamily: T.font, transition: "color 0.2s" }}>
              <IconBook size={16} /> Explore Insights
            </a>
          </motion.div>
        </div>
      </div>

      {/* Stats bar at bottom */}
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.6, ease: "easeOut" }}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1px", borderRadius: isMobile ? "14px 14px 0 0" : "18px 18px 0 0", overflow: "hidden" }}>
            {STATS.map(({ value, label, Icon }) => (
              <div key={label} style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center", gap: isMobile ? "4px" : "12px", padding: isMobile ? "12px 8px" : "18px 24px", background: "rgba(245,240,232,0.92)", backdropFilter: "blur(12px)", borderTop: `1px solid ${T.border}`, textAlign: isMobile ? "center" : "left" }}>
                <Icon size={isMobile ? 14 : 18} color={T.accent} />
                <div>
                  <div style={{ fontSize: isMobile ? "14px" : "20px", fontWeight: 800, color: T.text, fontFamily: T.font }}>{value}</div>
                  <div style={{ fontSize: isMobile ? "9px" : "11px", color: T.muted, lineHeight: 1.2 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// GEAR SELECTORS SECTION
// ═══════════════════════════════════════════════════════════════
function GearSelectorsSection({ isMobile }) {
  return (
    <section style={{ padding: isMobile ? "48px 16px" : "80px 40px", maxWidth: "1200px", margin: "0 auto" }}>
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} style={{ marginBottom: isMobile ? "24px" : "40px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: T.accent, display: "block", marginBottom: "10px" }}>Compare & Choose</span>
        <h2 style={{ fontSize: isMobile ? "24px" : "38px", fontWeight: 800, color: T.text, letterSpacing: "-0.5px", margin: 0, fontFamily: T.font }}>Gear Selectors</h2>
        <p style={{ marginTop: "12px", color: T.muted, fontSize: isMobile ? "14px" : "16px", lineHeight: 1.7, maxWidth: "520px" }}>Every piece of gear, broken down by specs. No opinions {"\u2014"} just data to help you decide.</p>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: isMobile ? "12px" : "16px" }}>
        {SELECTORS.map((sel, i) => (
          <motion.div key={sel.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}>
            <Link to={sel.to} style={{ display: "flex", flexDirection: "column", padding: isMobile ? "20px" : "24px", borderRadius: "16px", background: T.card, border: `1px solid ${T.border}`, textDecoration: "none", transition: "all 0.3s ease", height: "100%" }}
              onMouseOver={e => { e.currentTarget.style.borderColor = `${T.accent}60`; e.currentTarget.style.boxShadow = `0 8px 32px ${T.accent}08`; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: `${T.accent}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <sel.Icon size={20} color={T.accent} />
                </div>
                <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: T.green, background: `${T.green}15`, padding: "4px 10px", borderRadius: "12px" }}>Live</span>
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: T.text, marginBottom: "8px", fontFamily: T.font }}>{sel.title}</h3>
              <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.65, flex: 1 }}>{sel.description}</p>
              {sel.finderTo && (
                <Link to={sel.finderTo} onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "14px", padding: "10px 12px", borderRadius: "10px", background: `${T.accent}12`, textDecoration: "none", transition: "background 0.2s" }}
                  onMouseOver={e => e.currentTarget.style.background = `${T.accent}22`}
                  onMouseOut={e => e.currentTarget.style.background = `${T.accent}12`}>
                  <IconTarget size={14} color={T.accent} />
                  <span style={{ fontSize: "12px", fontWeight: 700, color: T.accent }}>Guided Shoe Finder</span>
                  <span style={{ marginLeft: "auto" }}><IconArrow size={12} color={T.accent} /></span>
                </Link>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "18px", paddingTop: "14px", borderTop: `1px solid ${T.border}` }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: T.accent }}>{sel.count} models</span>
                <IconArrow size={14} color={T.muted} />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} style={{ textAlign: "center", color: T.muted, fontSize: "13px", marginTop: "24px" }}>
        More selectors coming soon {"\u2014"} Helmets & more
      </motion.p>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// GUIDED FINDER CTA
// ═══════════════════════════════════════════════════════════════
function GuidedFinderSection({ isMobile }) {
  return (
    <section style={{ padding: isMobile ? "0 16px 48px" : "0 40px 80px", maxWidth: "1200px", margin: "0 auto" }}>
      <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
        style={{ position: "relative", overflow: "hidden", borderRadius: "20px", background: `linear-gradient(135deg, ${T.accent}18, ${T.accent}08)`, border: `1px solid ${T.accent}30`, padding: isMobile ? "28px 20px" : "48px 56px" }}>
        {/* Decorative blur */}
        <div style={{ position: "absolute", top: "-64px", right: "-64px", width: "200px", height: "200px", borderRadius: "50%", background: `${T.accent}12`, filter: "blur(60px)" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? "20px" : "48px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: `${T.accent}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconTarget size={22} color={T.accent} />
              </div>
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: T.muted }}>Personalized</span>
            </div>
            <h2 style={{ fontSize: isMobile ? "24px" : "32px", fontWeight: 800, color: T.text, lineHeight: 1.15, marginBottom: "12px", fontFamily: T.font }}>Guided Shoe Finder</h2>
            <p style={{ color: T.muted, fontSize: isMobile ? "14px" : "16px", lineHeight: 1.7, maxWidth: "480px" }}>
              Answer 5 quick questions about your climbing style, experience, and foot shape {"\u2014"} our algorithm scores {SHOES.length} shoes and shows your top matches.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "14px", fontSize: "12px", color: T.muted }}>
              {"\u2728"} Zero opinions, just data
            </div>
          </div>
          <Link to="/find" style={{ display: "inline-flex", alignItems: "center", gap: "12px", padding: isMobile ? "14px 28px" : "16px 32px", borderRadius: "14px", background: T.accent, color: "#fff", fontWeight: 700, fontSize: isMobile ? "14px" : "15px", textDecoration: "none", fontFamily: T.font, whiteSpace: "nowrap", flexShrink: 0, transition: "transform 0.2s" }}
            onMouseOver={e => e.currentTarget.style.transform = "scale(1.02)"}
            onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}>
            Find your shoe <IconArrow size={18} />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// INSIGHTS SECTION
// ═══════════════════════════════════════════════════════════════
function InsightsSection({ isMobile }) {
  return (
    <section id="insights" style={{ padding: isMobile ? "48px 16px" : "80px 40px", maxWidth: "1200px", margin: "0 auto", scrollMarginTop: "60px" }}>
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} style={{ marginBottom: isMobile ? "24px" : "40px" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: T.accent, display: "block", marginBottom: "10px" }}>Learn & Decide</span>
        <h2 style={{ fontSize: isMobile ? "24px" : "38px", fontWeight: 800, color: T.text, letterSpacing: "-0.5px", margin: 0, fontFamily: T.font }}>Gear Insights</h2>
        <p style={{ marginTop: "12px", color: T.muted, fontSize: isMobile ? "14px" : "16px", lineHeight: 1.7, maxWidth: "520px" }}>Deep dives into specs, safety data, and performance {"\u2014"} so you know exactly what you're buying.</p>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? "12px" : "16px" }}>
        {INSIGHTS.map((insight, i) => (
          <motion.div key={insight.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.5 }}>
            <Link to={insight.to} style={{ display: "flex", flexDirection: "column", padding: isMobile ? "20px" : "24px", borderRadius: "16px", border: `1px solid ${T.border}`, background: T.card, textDecoration: "none", transition: "all 0.3s ease", height: "100%" }}
              onMouseOver={e => { e.currentTarget.style.borderColor = `${T.accent}40`; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)"; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <IconBook size={14} color={T.accent} />
                <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: T.accent }}>Insight {["I", "II", "III"][i]}</span>
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: T.text, lineHeight: 1.35, marginBottom: "10px", fontFamily: T.font }}>{insight.title}</h3>
              <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.65, flex: 1 }}>{insight.description}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "16px", fontSize: "13px", fontWeight: 700, color: T.accent }}>
                Read insight <IconArrow size={14} color={T.accent} />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUGGESTION HUB (preserved from original)
// ═══════════════════════════════════════════════════════════════
function SuggestionHub() {
  const [type, setType] = useState("feature");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ type, message: message.trim(), page_url: window.location.href }),
      });
      if (!res.ok) throw new Error(res.statusText);
      setStatus("success");
      setMessage("");
      setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  const types = [
    { key: "question", label: "Gear question", icon: "\u2753" },
    { key: "feature", label: "Feature idea", icon: "\uD83D\uDCA1" },
    { key: "bug", label: "Bug report", icon: "\uD83D\uDC1B" },
    { key: "data", label: "Data correction", icon: "\uD83D\uDCCA" },
    { key: "general", label: "General feedback", icon: "\uD83D\uDCAC" },
  ];

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "32px" }}>
      <h3 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.3px" }}>{"\uD83D\uDCE8"} Suggestion Hub</h3>
      <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7, margin: "0 0 24px" }}>Got a gear question? An idea? Found wrong data? Ask anything or help us build a better tool for the climbing community.</p>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {types.map(t => (
            <button key={t.key} type="button" onClick={() => setType(t.key)} style={{
              padding: "8px 14px", borderRadius: "8px", border: `1px solid ${type === t.key ? T.accent : T.border}`,
              background: type === t.key ? T.accentSoft : "transparent", color: type === t.key ? T.accent : T.muted,
              fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: T.font, transition: "all 0.2s", display: "flex", alignItems: "center", gap: "6px",
            }}><span>{t.icon}</span> {t.label}</button>
          ))}
        </div>
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          placeholder={type === "question" ? "Which crashpad is best for highball bouldering on a budget?" : type === "feature" ? "I'd love to see..." : type === "bug" ? "I noticed that..." : type === "data" ? "The data for [shoe model] seems off because..." : "Hey, just wanted to say..."}
          style={{ width: "100%", minHeight: "100px", padding: "14px", borderRadius: "10px", border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: "13px", fontFamily: T.font, resize: "vertical", outline: "none", lineHeight: 1.6, boxSizing: "border-box" }}
          onFocus={e => e.target.style.borderColor = T.accent} onBlur={e => e.target.style.borderColor = T.border}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
          <span style={{ fontSize: "11px", color: T.muted }}>
            {status === "success" ? "Thanks! Your feedback has been received." : status === "error" ? "Something went wrong. Please try again." : "Your feedback is stored securely and read by a real human."}
          </span>
          <button type="submit" disabled={!message.trim() || status === "sending"} style={{
            padding: "10px 24px", borderRadius: "8px", border: "none",
            background: status === "success" ? T.green : status === "error" ? T.red : message.trim() ? T.accent : T.border,
            color: (status === "success" || status === "error" || message.trim()) ? "#fff" : T.muted,
            fontSize: "13px", fontWeight: 700, cursor: message.trim() && status !== "sending" ? "pointer" : "not-allowed", fontFamily: T.font, transition: "all 0.2s",
          }}>
            {status === "sending" ? "Sending..." : status === "success" ? "\u2713 Sent!" : status === "error" ? "Failed" : type === "question" ? "Ask question" : "Send suggestion"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════════
export default function Landing() {
  usePageMeta(null, null);
  useStructuredData(buildWebsiteSchema());
  const isMobile = useIsMobile();

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text }}>
      <HeroSection isMobile={isMobile} />
      <GearSelectorsSection isMobile={isMobile} />
      <InsightsSection isMobile={isMobile} />

      {/* About section */}
      <section id="about" style={{ maxWidth: "1200px", margin: "0 auto", padding: isMobile ? "48px 16px" : "80px 40px" }}>
        {/* (Stats strip removed — consolidated into hero stats bar) */}

        {/* Who + mission */}
        <div style={{ maxWidth: "820px", margin: "0 auto 32px", background: T.card, border: `1px solid ${T.border}`, borderRadius: "14px", padding: isMobile ? "24px 20px" : "28px 32px", textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.8, maxWidth: "560px", margin: "0 auto 8px" }}>
            Built by Roman {"\u2014"} a climber in Palatine, Germany {"\u2014"} because comparing gear across shops was taking
            longer than the actual climbing. No brand partnerships, no sponsored rankings. Just data.
          </p>
          <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7, margin: "0 auto" }}>
            Affiliate links help keep the lights on but never influence rankings.{" "}
            <a href="mailto:roman@climbing-gear.com" style={{ color: T.accent, textDecoration: "none" }}>roman@climbing-gear.com</a>
          </p>
        </div>

        {/* Suggestion Hub */}
        <div id="suggestion-hub" style={{ maxWidth: "820px", margin: "0 auto 40px", scrollMarginTop: "70px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>Help make it better</h3>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.8, marginBottom: "20px" }}>
            Found wrong data, have a feature idea, or just want to say what's working?
            Every piece of feedback shapes what gets built next.
          </p>
          <SuggestionHub />
        </div>
      </section>

      {/* Disclaimer */}
      <div style={{ padding: isMobile ? "20px 16px" : "24px 32px", borderTop: `1px solid ${T.border}`, background: T.bg }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
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
    </div>
  );
}
