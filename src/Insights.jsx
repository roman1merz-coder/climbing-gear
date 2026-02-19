import { Link } from "react-router-dom";
import { T } from "./tokens.js";
import usePageMeta from "./usePageMeta.js";
import { useIsMobile } from "./InsightsShared.jsx";

/* ═══════════════════════════════════════════════════════════════
   INSIGHTS HUB — index page linking to individual articles.
   Each article lives at its own SEO-optimized URL.
   ═══════════════════════════════════════════════════════════════ */

const ARTICLES = [
  {
    to: "/insights/climbing-shoe-guide",
    tag: "Shoes", tagColor: T.accent,
    title: "How We Score 340 Climbing Shoes — and How to Pick Yours",
    desc: "Our guided search scores every shoe across 7 performance axes. Learn how specs affect real-world performance and what foot shape means for fit.",
    stats: ["340 shoes", "7 performance axes", "6 shoe zones"],
  },
  {
    to: "/insights/inflatable-crashpads",
    tag: "Crashpads", tagColor: T.yellow,
    title: "Inflatable Crashpads: Game-Changer or Gimmick?",
    desc: "They shatter the weight curve, fit inside your main pad, and double as a mattress. But would you trust one on sharp rock?",
    stats: ["101 crashpads", "46% weight saving", "~5L packed"],
  },
  {
    to: "/insights/rope-cost-vs-safety",
    tag: "Ropes", tagColor: T.green,
    title: "Does Spending More Buy a Safer Rope?",
    desc: "We crunched cost-per-metre, UIAA falls, and weight across 106 single ropes. The data challenges some common assumptions.",
    stats: ["106 ropes", "r = –0.19 correlation", "9.5–9.8mm sweet spot"],
  },
];

export default function Insights() {
  usePageMeta(
    "Gear Insights",
    "Data-driven insights from comparing 340+ climbing shoes, 100+ crashpads, and 100+ ropes. No affiliate bias, no sponsored takes — just numbers and honest conclusions."
  );
  const isMobile = useIsMobile();

  return (
    <div style={{ fontFamily: T.font, color: T.text, minHeight: "100vh", padding: isMobile ? "20px 12px 60px" : "40px 24px 80px" }}>
      <div style={{ maxWidth: "820px", margin: "0 auto" }}>

        {/* Page Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.accent, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>Data-Driven Insights</div>
          <h1 style={{ fontSize: isMobile ? "28px" : "36px", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.2, margin: "0 0 12px", color: T.text }}>
            What the Data Actually Says<br />About Climbing Gear
          </h1>
          <p style={{ fontSize: "15px", color: T.muted, lineHeight: 1.6, maxWidth: "520px", margin: "0 auto" }}>
            We crunched specs across 340 shoes, 100+ crashpads and 100+ ropes. No affiliate bias, no sponsored takes — just numbers and honest conclusions.
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginTop: "16px" }}>
            <span style={{ fontSize: "11px", color: T.accent, background: T.accentSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>340 Shoes</span>
            <span style={{ fontSize: "11px", color: T.yellow, background: T.yellowSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>101 Crashpads</span>
            <span style={{ fontSize: "11px", color: T.green, background: T.greenSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>106 Ropes</span>
          </div>
        </div>

        {/* Article Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {ARTICLES.map((a, i) => (
            <Link key={a.to} to={a.to} style={{
              display: "block", textDecoration: "none",
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: "16px",
              padding: isMobile ? "20px 16px" : "28px 32px",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
              onMouseOver={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.2)`; }}
              onMouseOut={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: T.accent, background: T.accentSoft, padding: "3px 10px", borderRadius: "6px", letterSpacing: "0.5px" }}>
                  INSIGHT #{i + 1}
                </span>
                <span style={{ fontSize: "10px", fontWeight: 600, color: a.tagColor, background: `${a.tagColor}15`, padding: "2px 8px", borderRadius: "4px" }}>
                  {a.tag}
                </span>
              </div>
              <h2 style={{ fontSize: isMobile ? "18px" : "20px", fontWeight: 800, color: T.text, letterSpacing: "-0.3px", lineHeight: 1.3, margin: "0 0 8px" }}>
                {a.title}
              </h2>
              <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.6, margin: "0 0 14px" }}>
                {a.desc}
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {a.stats.map(s => (
                  <span key={s} style={{ fontSize: "10px", color: T.muted, background: T.bg, padding: "3px 10px", borderRadius: "4px", fontWeight: 600 }}>
                    {s}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: "14px", fontSize: "13px", fontWeight: 700, color: T.accent }}>
                Read article →
              </div>
            </Link>
          ))}
        </div>

        {/* Footer CTA */}
        <div style={{
          textAlign: "center", padding: "40px 24px", marginTop: "40px",
          background: `linear-gradient(135deg, ${T.accentSoft}, ${T.blueSoft})`,
          borderRadius: "16px", border: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color: T.text, marginBottom: "8px" }}>Ready to find your gear?</div>
          <p style={{ fontSize: "14px", color: T.muted, marginBottom: "20px", lineHeight: 1.6 }}>
            All insights are drawn from live product data. Explore the full database with filters, comparisons, and price tracking.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { label: "Find Your Shoe", to: "/shoes?finder=1" },
              { label: "Browse Crashpads", to: "/crashpads" },
              { label: "Browse Ropes", to: "/ropes" },
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
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Methodology */}
        <div style={{ marginTop: "32px", padding: "20px", background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Methodology</div>
          <p style={{ fontSize: "12px", color: T.muted, lineHeight: 1.7, margin: 0 }}>
            Data sourced from manufacturer specs and retailer listings across European markets. Prices reflect current street prices (or UVP where unavailable) as of early 2026.
            Shoe performance scores (edging, smearing, pockets, hooks, comfort, sensitivity, support) are computed from physical specs using weighted formulas, then percentile-normalised across 331 adult shoes.
            Crashpad €/m² calculated as current_price ÷ (length_open × width_open).
            Rope analysis covers 106 single-certified ropes (EN 892, 80kg test mass). Half and twin ropes (35 total) use a lighter 55kg test mass and are excluded to avoid inflated fall counts. Cost per metre (¢/m) = price per metre × 100. Sample sizes noted on each chart. Analysis by climbing-gear.com.
          </p>
        </div>

      </div>
    </div>
  );
}
