import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { T } from "./tokens.js";
import CRASHPAD_SEED from "./crashpad_seed_data.json";
import SHOE_SEED from "./seed_data.json";
import CrashpadScatterChart from "./CrashpadScatterChart.jsx";
import RopeScatterChart from "./RopeScatterChart.jsx";
import ShoeScatterChart from "./ShoeScatterChart.jsx";
import usePageMeta from "./usePageMeta.js";

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return m;
}

/* ─── Collapsible sub-section for long articles ─── */
function Collapsible({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: "28px" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "8px", width: "100%",
          fontSize: "16px", fontWeight: 700, color: T.text, background: "none", border: "none",
          borderBottom: `1px solid ${T.border}`, paddingBottom: "8px", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "rotate(0)", fontSize: "12px", color: T.muted }}>▶</span>
        {title}
      </button>
      <div style={{
        maxHeight: open ? "5000px" : "0", overflow: "hidden",
        transition: "max-height 0.35s ease-in-out", opacity: open ? 1 : 0,
      }}>
        {children}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   DATA — embedded from seed file analysis of 333 shoes,
   141 ropes (106 single), 19 belay devices.
   Crashpad data from curated analysis (DB table pending).
   ═══════════════════════════════════════════════════════════════ */
// Crashpad inline scatter data removed — now lives in CrashpadScatterChart.jsx
/* ═══════════════════════════════════════════════════════════════
   SHARED CHART COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

function ChartContainer({ title, subtitle, children, style }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "24px", ...style }}>
      {title && <div style={{ fontSize: "15px", fontWeight: 700, color: T.text, marginBottom: subtitle ? "4px" : "16px" }}>{title}</div>}
      {subtitle && <div style={{ fontSize: "12px", color: T.muted, marginBottom: "16px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color = T.accent }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "16px", textAlign: "center", flex: "1 1 120px" }}>
      <div style={{ fontSize: "11px", color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 800, color, letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: T.muted, marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}
/* ─── Rope Diameter Data (for article teaser chart) ─── */

/* ─── Rope Diameter Teaser (SVG bar chart for article) ─── */
const ROPE_BANDS = [
  { band: "≤8.7", falls: 4.8, gm: 48.5, n: 6 },
  { band: "8.8–9.0", falls: 6.2, gm: 53.2, n: 6 },
  { band: "9.1–9.2", falls: 6.3, gm: 54.8, n: 12 },
  { band: "9.3–9.5", falls: 7.0, gm: 58.8, n: 21 },
  { band: "9.6–9.8", falls: 8.0, gm: 61.6, n: 31 },
  { band: "9.9–10.0", falls: 8.4, gm: 63.9, n: 14 },
  { band: "10.1–10.5", falls: 8.8, gm: 67.1, n: 12 },
  { band: "≥11.0", falls: 13.8, gm: 75.5, n: 4 },
];

function RopeTeaserChart({ isMobile }) {
  const W = isMobile ? 340 : 700, H = isMobile ? 240 : 260;
  const pad = { top: 20, right: 20, bottom: 40, left: 55 };
  const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;
  const barW = Math.min(50, cw / ROPE_BANDS.length - 8);
  const maxFalls = 16;
  const sweet = [4, 5]; // indices for 9.3–9.5 and 9.6–9.8

  return (
    <ChartContainer title="Avg UIAA Falls by Diameter Band" subtitle="106 single ropes · Sweet spot highlighted">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {/* Sweet spot highlight */}
        <rect
          x={pad.left + (cw / ROPE_BANDS.length) * sweet[0]}
          y={pad.top}
          width={(cw / ROPE_BANDS.length) * (sweet[1] - sweet[0] + 1)}
          height={ch}
          rx="6" fill={T.green} opacity="0.06"
        />
        <text
          x={pad.left + (cw / ROPE_BANDS.length) * (sweet[0] + 1)}
          y={pad.top + 14}
          fill={T.green} fontSize="9" textAnchor="middle" fontWeight="600" opacity="0.7"
        >Sweet Spot</text>
        {/* Bars */}
        {ROPE_BANDS.map((d, i) => {
          const cx = pad.left + (i + 0.5) * (cw / ROPE_BANDS.length);
          const barH2 = (d.falls / maxFalls) * ch;
          const isSweet = i >= sweet[0] && i <= sweet[1];
          return (
            <g key={d.band}>
              <rect x={cx - barW / 2} y={pad.top + ch - barH2} width={barW} height={barH2} rx="4"
                fill={isSweet ? T.green : T.accent} opacity={isSweet ? 0.9 : 0.7} />
              <text x={cx} y={pad.top + ch - barH2 - 6} fill={T.text} fontSize="11" fontWeight="700" textAnchor="middle">
                {d.falls}
              </text>
              <text x={cx} y={H - pad.bottom + 14} fill={T.text} fontSize={isMobile ? "8" : "10"} fontWeight="600" textAnchor="middle">
                {d.band}
              </text>
              <text x={cx} y={H - pad.bottom + 26} fill={T.muted} fontSize="9" textAnchor="middle">
                n={d.n}
              </text>
            </g>
          );
        })}
        {/* Y axis */}
        {[0, 4, 8, 12, 16].map(v => (
          <g key={v}>
            <line x1={pad.left} y1={pad.top + ch - (v / maxFalls) * ch} x2={W - pad.right} y2={pad.top + ch - (v / maxFalls) * ch} stroke={T.border} strokeDasharray="3,3" />
            <text x={pad.left - 8} y={pad.top + ch - (v / maxFalls) * ch + 4} fill={T.muted} fontSize="10" textAnchor="end">{v}</text>
          </g>
        ))}
        <text x={14} y={H / 2} fill={T.muted} fontSize="11" textAnchor="middle" fontWeight="600" transform={`rotate(-90,14,${H / 2})`}>Avg UIAA Falls</text>
        <text x={W / 2} y={H - 2} fill={T.muted} fontSize="11" textAnchor="middle" fontWeight="600">Diameter (mm)</text>
      </svg>
      {/* CTA to interactive chart */}
      <Link to="/ropes?view=chart" style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        marginTop: "16px", padding: "10px 20px",
        background: T.accentSoft, color: T.accent,
        borderRadius: "8px", fontSize: "13px", fontWeight: 700,
        textDecoration: "none", transition: "transform 0.15s",
      }}
        onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"}
        onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}
      >
        Explore all 106 ropes interactively →
      </Link>
    </ChartContainer>
  );
}

/* ─── Shoe Price × Downturn Teaser (stacked bar chart) ─── */
// Derived from Supabase prices × seed_data.json (312 shoes with prices) — 2026-02-18
const SHOE_PRICE_BANDS = [
  { band: "< €80",      flat: 17, mod: 6,  agg: 2  },
  { band: "€80–120",    flat: 49, mod: 28, agg: 6  },
  { band: "€120–160",   flat: 18, mod: 78, agg: 42 },
  { band: "€160–200",   flat: 10, mod: 23, agg: 33 },
];

function ShoePriceTeaserChart({ isMobile }) {
  const W = isMobile ? 340 : 700, H = isMobile ? 240 : 260;
  const pad = { top: 20, right: 20, bottom: 40, left: 55 };
  const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;
  const barW = Math.min(80, cw / SHOE_PRICE_BANDS.length - 16);
  const maxCount = 140; // slightly above highest total (138)
  const colors = { flat: T.green, mod: T.accent, agg: T.yellow };

  return (
    <ChartContainer title="Shoe Count by Price Band × Downturn" subtitle="312 shoes with price data · Stacked by downturn profile">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {SHOE_PRICE_BANDS.map((d, i) => {
          const cx = pad.left + (i + 0.5) * (cw / SHOE_PRICE_BANDS.length);
          const total = d.flat + d.mod + d.agg;
          const segments = [
            { key: "flat", val: d.flat, color: colors.flat },
            { key: "mod",  val: d.mod,  color: colors.mod },
            { key: "agg",  val: d.agg,  color: colors.agg },
          ];
          let yOff = 0;
          return (
            <g key={d.band}>
              {segments.map(seg => {
                const barH = (seg.val / maxCount) * ch;
                const y = pad.top + ch - yOff - barH;
                yOff += barH;
                return (
                  <rect key={seg.key} x={cx - barW / 2} y={y} width={barW} height={barH}
                    fill={seg.color} opacity={0.8} rx={seg.key === "agg" ? "4" : "0"} />
                );
              })}
              <text x={cx} y={pad.top + ch - (total / maxCount) * ch - 6} fill={T.text} fontSize="11" fontWeight="700" textAnchor="middle">
                {total}
              </text>
              <text x={cx} y={H - pad.bottom + 14} fill={T.text} fontSize={isMobile ? "9" : "11"} fontWeight="600" textAnchor="middle">
                {d.band}
              </text>
            </g>
          );
        })}
        {/* Y gridlines */}
        {[0, 35, 70, 105, 140].map(v => (
          <g key={v}>
            <line x1={pad.left} y1={pad.top + ch - (v / maxCount) * ch} x2={W - pad.right} y2={pad.top + ch - (v / maxCount) * ch} stroke={T.border} strokeDasharray="3,3" />
            <text x={pad.left - 8} y={pad.top + ch - (v / maxCount) * ch + 4} fill={T.muted} fontSize="10" textAnchor="end">{v}</text>
          </g>
        ))}
        <text x={14} y={H / 2} fill={T.muted} fontSize="11" textAnchor="middle" fontWeight="600" transform={`rotate(-90,14,${H / 2})`}>Shoe Count</text>
        {/* Legend */}
        {[
          { label: "Flat", color: colors.flat, x: W - pad.right - (isMobile ? 170 : 200) },
          { label: "Moderate", color: colors.mod, x: W - pad.right - (isMobile ? 110 : 130) },
          { label: "Aggressive", color: colors.agg, x: W - pad.right - (isMobile ? 40 : 45) },
        ].map(l => (
          <g key={l.label}>
            <rect x={l.x} y={4} width={10} height={10} rx="2" fill={l.color} opacity={0.8} />
            <text x={l.x + 14} y={13} fill={T.muted} fontSize="10" fontWeight="600">{l.label}</text>
          </g>
        ))}
      </svg>
    </ChartContainer>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ARTICLE SECTIONS
   ═══════════════════════════════════════════════════════════════ */

function ArticleHeader({ number, title, subtitle }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ marginBottom: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: T.accent, background: T.accentSoft, padding: "3px 10px", borderRadius: "6px", letterSpacing: "0.5px" }}>INSIGHT #{number}</span>
      </div>
      <h2 style={{ fontSize: "24px", fontWeight: 800, color: T.text, letterSpacing: "-0.5px", lineHeight: 1.3, margin: "0 0 6px" }}>{title}</h2>
      <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.6, margin: 0 }}>{subtitle}</p>
    </div>
  );
}

function Prose({ children }) {
  return <div style={{ fontSize: "14px", color: "#c0c4ce", lineHeight: 1.8, margin: "20px 0" }}>{children}</div>;
}

function KeyInsight({ children, color = T.accent }) {
  const softBg = color === T.yellow ? T.yellowSoft : color === T.green ? T.greenSoft : color === T.red ? T.redSoft : color === T.blue ? T.blueSoft : color === T.purple ? T.purpleSoft : T.accentSoft;
  return (
    <div style={{ borderLeft: `3px solid ${color}`, margin: "20px 0", background: softBg, borderRadius: "0 8px 8px 0", padding: "14px 18px 14px 18px" }}>
      <div style={{ fontSize: "13.5px", color: T.text, lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}
/* ─── Inflatable slugs for chart highlighting ─── */
const INFLATABLE_SLUGS = CRASHPAD_SEED
  .filter(p => (p.foam_types || []).includes("air_chamber"))
  .map(p => p.slug);

/* ─── Inflatable vs Foam stats: computed from seed data for article text ─── */
const INFLATABLE_PADS = CRASHPAD_SEED
  .filter(p => p.length_open_cm && p.width_open_cm && p.weight_kg && p.thickness_cm >= 10 && p.thickness_cm <= 16)
  .map(p => {
    const area = (p.length_open_cm * p.width_open_cm) / 10000;
    const isInflatable = (p.foam_types || []).includes("air_chamber");
    return {
      name: `${p.brand} ${p.model}`, slug: p.slug,
      kg_m2: +(p.weight_kg / area).toFixed(2),
      thick: p.thickness_cm, area: +area.toFixed(2),
      weight: p.weight_kg, layers: p.foam_layers || 0,
      price: p.current_price_eur || p.price_uvp_eur,
      eur_m2: +( (p.current_price_eur || p.price_uvp_eur || 0) / area ).toFixed(0),
      inflatable: isInflatable,
    };
  });

/* InflatableChart and InflatableCostChart removed — now using CrashpadScatterChart with highlightSlugs */

/* ═══════════════════════════════════════════════════════════════
   MAIN INSIGHTS PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function Insights() {
  usePageMeta("Gear Insights", "Data-driven insights from comparing every climbing product side by side. Discover trends, outliers, and surprising facts about climbing gear.");
  const isMobile = useIsMobile();
  const maxW = "820px";
  const art1Ref = useRef(null);
  const art2Ref = useRef(null);
  const art3Ref = useRef(null);
  const [activeArt, setActiveArt] = useState(1);
  const location = useLocation();

  /* Scroll to article if URL has a hash */
  useEffect(() => {
    const hash = location.hash?.replace("#", "");
    if (!hash) return;
    const timer = setTimeout(() => {
      const target = hash === "ropes" ? art2Ref.current : hash === "crashpads" ? art1Ref.current : hash === "shoes" ? art3Ref.current : document.getElementById(hash);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 500);
    return () => clearTimeout(timer);
  }, [location.hash]);

  /* Track which article is in view */
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) setActiveArt(e.target === art1Ref.current ? 1 : e.target === art2Ref.current ? 2 : 3);
      }),
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
    );
    if (art1Ref.current) obs.observe(art1Ref.current);
    if (art2Ref.current) obs.observe(art2Ref.current);
    if (art3Ref.current) obs.observe(art3Ref.current);
    return () => obs.disconnect();
  }, []);

  const navigate = useNavigate();
  const scrollTo = useCallback((ref, hash) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (hash) navigate(`/insights#${hash}`, { replace: true });
  }, [navigate]);

  const sectionStyle = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: "16px",
    padding: isMobile ? "24px 16px" : "40px 36px",
    marginBottom: "32px",
  };

  const jumpPill = (n, label, ref, hash) => (
    <button
      key={n}
      onClick={() => scrollTo(ref, hash)}
      style={{
        padding: "6px 16px", fontSize: "12px", fontWeight: 600, borderRadius: "20px",
        border: "none", cursor: "pointer", transition: "all 0.15s",
        background: activeArt === n ? T.accent : "rgba(255,255,255,.06)",
        color: activeArt === n ? "#fff" : T.muted,
      }}
    >{label}</button>
  );

  return (
    <div style={{ fontFamily: T.font, color: T.text, minHeight: "100vh", padding: isMobile ? "20px 12px 60px" : "40px 24px 80px" }}>
      <div style={{ maxWidth: maxW, margin: "0 auto" }}>

        {/* Page Header */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.accent, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>Data-Driven Insights</div>
          <h1 style={{ fontSize: isMobile ? "28px" : "36px", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.2, margin: "0 0 12px", color: T.text }}>
            What the Data Actually Says<br />About Climbing Gear
          </h1>
          <p style={{ fontSize: "15px", color: T.muted, lineHeight: 1.6, maxWidth: "520px", margin: "0 auto" }}>
            We crunched specs across 340 shoes, 100+ crashpads and 100+ ropes. No affiliate bias, no sponsored takes — just numbers and honest conclusions.
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginTop: "16px" }}>
            <span style={{ fontSize: "11px", color: T.yellow, background: T.yellowSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>101 Crashpads</span>
            <span style={{ fontSize: "11px", color: T.green, background: T.greenSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>106 Ropes</span>
            <span style={{ fontSize: "11px", color: T.accent, background: T.accentSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>340 Shoes</span>
          </div>
        </div>

        {/* Sticky jump nav */}
        <div style={{
          position: "sticky", top: "50px", zIndex: 20,
          display: "flex", justifyContent: "center", gap: "8px",
          padding: "10px 0", marginBottom: "24px",
          background: T.bg,
        }}>
          {jumpPill(1, "Inflatable Crashpads", art1Ref, "crashpads")}
          {jumpPill(2, "Ropes: Cost vs Safety", art2Ref, "ropes")}
          {jumpPill(3, "Shoe Selection Guide", art3Ref, "shoes")}
        </div>

        {/* ═══ ARTICLE 1: Inflatable Crashpads ═══ */}
        <section id="crashpads" ref={art1Ref} style={{ ...sectionStyle, scrollMarginTop: "60px" }}>
          <ArticleHeader
            number={1}
            title="Inflatable Crashpads: Game-Changer or Gimmick?"
            subtitle="They shatter the weight curve, fit inside your main pad, and double as a mattress. But would you trust one on sharp rock?"
          />

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Avg kg/m² (Inflatable)" value="2.6" sub="vs 4.8 for foam pads" color={T.yellow} />
            <StatCard label="Weight Saving" value="46%" sub="Same thickness, half the weight" color={T.green} />
            <StatCard label="Packed Volume" value="~5L" sub="Fits inside any taco pad" color={T.blue} />
          </div>

          {/* ── Breaking the Trendline ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            Breaking the Trendline
          </div>

          <CrashpadScatterChart isMobile={isMobile} highlightSlugs={INFLATABLE_SLUGS} initialMetric="area_weight" compact thicknessRange={[10, 16]} />

          <Prose>
            The chart above tells the story better than words can. Among the {INFLATABLE_PADS.length} pads in our database with 10–16cm thickness, the inflatables sit dramatically below the weight trendline. At 3.5–5.0 kg for 1.8–2.0 m² of landing area, they weigh roughly half of what foam pads deliver for the same coverage. That's not a marginal improvement — it's a category break. Click on any dot to see the full specs of that pad.
          </Prose>

          <KeyInsight color={T.yellow}>
            <strong>The weight advantage is real.</strong> A Snap Air Shock 1 delivers 1.8m² of 15cm-thick landing zone at just 5kg. A comparable foam pad (e.g. Snap Wrap Original: 1.5m², 15cm, 10kg) weighs twice as much for less area. That deflated Air Shock rolls up to roughly sleeping-bag size — meaning you can carry two full-size pads to the crag for barely more than the weight of one traditional pad.
          </KeyInsight>

          {/* ── Cost per Area ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            Cost per Area: Surprisingly Competitive
          </div>

          <CrashpadScatterChart isMobile={isMobile} highlightSlugs={INFLATABLE_SLUGS} initialMetric="area_price" compact thicknessRange={[10, 16]} />

          <Prose>
            You might expect air-chamber technology to come at a steep premium — but the data tells a different story. When you plot area vs price for the same 10–16cm thickness range, the inflatables are competitive with foam pads of comparable landing area. You're not paying a premium for lighter weight.
          </Prose>

          <KeyInsight color={T.green}>
            <strong>Better value by every metric.</strong> Inflatables deliver roughly half the weight at a below-average €/m². In other words, the air-chamber technology doesn't just save weight — it saves money per square meter of landing zone too. That's genuinely rare in climbing gear.
          </KeyInsight>

          {/* ── Packed Size ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            Packed Size: Where It Gets Ridiculous
          </div>

          <div style={{ borderRadius: T.radius, overflow: "hidden", margin: "20px 0", border: `1px solid ${T.border}` }}>
            <img
              src="/images/insights/inflatable-packed-size.jpg"
              alt="Size comparison: a full-size foam crashpad next to a deflated inflatable rolled into a small bag"
              style={{ width: "100%", height: "auto", display: "block" }}
              loading="lazy"
            />
          </div>
          <div style={{ fontSize: "11px", color: T.muted, marginTop: "-12px", marginBottom: "16px", fontStyle: "italic" }}>
            A full-size foam pad next to a deflated inflatable of comparable landing area. The size difference speaks for itself.
          </div>

          <Prose>
            When deflated, an inflatable crashpad rolls down to roughly the size of a sleeping bag — about 5 liters of volume. Compare that to a foam pad of similar landing area, which stays the same massive rectangle whether you're climbing on it or carrying it to the crag.
          </Prose>

          <Prose>
            The practical implication is huge: an inflatable fits inside most taco-fold or hinge-fold pads. You're not strapping a second bulky pad to the outside of your first one, Tetris-ing gear on your back, or making a second trip. Just roll it up, tuck it in, and hike normally. For long approaches this alone can be the deciding factor.
          </Prose>

          <KeyInsight color={T.blue}>
            <strong>Stacking made easy:</strong> Carry two full-size pads for the weight and bulk of roughly 1.5 traditional pads. Or three full-size pads at the weight of two — you can easily fit 2 inflatable pads into one conventional taco pad.
          </KeyInsight>

          {/* ── Inflation ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            Inflation: Easier Than You'd Think
          </div>

          <div style={{ borderRadius: T.radius, overflow: "hidden", margin: "20px 0", border: `1px solid ${T.border}` }}>
            <img
              src="/images/insights/inflatable-blower.jpg"
              alt="Inflating a crashpad with a battery-powered blower — takes about 60 seconds"
              style={{ width: "100%", height: "auto", display: "block" }}
              loading="lazy"
            />
          </div>
          <div style={{ fontSize: "11px", color: T.muted, marginTop: "-12px", marginBottom: "16px", fontStyle: "italic" }}>
            A battery-powered blower inflates an entire crashpad in about 60 seconds.
          </div>

          <Prose>
            Initially our biggest concern: "I don't want to sit there pumping up a pad for 10 minutes." Fair — but some boulderers already carry a battery-powered blower to clean holds. That same blower inflates an entire crashpad in about 60 seconds.
          </Prose>

          <Prose>
            And once it's inflated, you get something foam pads can't offer: adjustable firmness. Pump in more air for a firmer, more responsive landing surface on higher problems. Let some air out for a softer cushion on sit-starts or traverses.
          </Prose>

          {/* ── Where Inflatables Shine ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            Where Inflatables Shine
          </div>

          <div style={{ borderRadius: T.radius, overflow: "hidden", margin: "20px 0", border: `1px solid ${T.border}` }}>
            <img
              src="/images/insights/inflatable-bouldering.jpg"
              alt="Bouldering on flat, even terrain — the ideal use case for inflatable crashpads"
              style={{ width: "100%", height: "auto", display: "block" }}
              loading="lazy"
            />
          </div>
          <div style={{ fontSize: "11px", color: T.muted, marginTop: "-12px", marginBottom: "16px", fontStyle: "italic" }}>
            Flat, even landings — this is where inflatables truly excel.
          </div>

          <Prose>
            Inflatables are at their best on flat, even terrain with relatively low problems. Think sandy bouldering areas, forest clearings with soft ground, or gym-style outdoor walls. They're also unbeatable for van-life and traveling boulderers — a deflated pad takes up barely any space in your vehicle compared to a foam pad that dominates the entire cargo area.
          </Prose>

          <Prose>
            The comfort factor shouldn't be underestimated either. Inflatables make surprisingly decent sleeping mats — they're thick and adjustable.
          </Prose>

          {/* ── The Honest Downsides ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            The Honest Downsides
          </div>

          <Prose>
            Now for the part that matters most: where inflatables fall short. There are real limitations that every buyer should understand before dropping €200–300 on an air-filled pad.
          </Prose>

          <KeyInsight color={T.red}>
            <strong>Puncture risk is real.</strong> Sharp rock edges, thorny vegetation, or even a stray piece of metal can puncture an air chamber. Unlike a foam pad that still works with a tear, a punctured inflatable loses its primary function. On sharp limestone or granite, we'd rather trust a good old foam pad.
          </KeyInsight>

          <Prose>
            The surface can feel slippery compared to textured foam pads, especially when wet or dusty. On uneven terrain — slopes, roots, small rocks — the pad tends to shift and wobble. Air also behaves differently from foam during impact: foam absorbs energy progressively, giving you gradual deceleration, while air compresses all at once, creating a bouncier, less predictable landing.
          </Prose>

          <KeyInsight color={T.red}>
            <strong>No built-in storage.</strong> Foam pads typically have shoe pockets, chalk bag loops, and gear compartments. Inflatables have none of that. Your options are to carry the deflated pad inside your main foam pad or bring a separate bag.
          </KeyInsight>

          {/* ── The Verdict ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "32px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            The Verdict
          </div>

          <Prose>
            Game-changer or gimmick? Neither — and both. Inflatable crashpads aren't here to replace your foam pad. They're here to complement it. The ideal setup for many boulderers is a traditional foam pad as the primary landing zone, with an inflatable tucked inside for extra coverage.
          </Prose>

          <KeyInsight color={T.green}>
            <strong>Our recommendation:</strong> If you boulder on flat terrain, travel often, or do long approaches — an inflatable pad is genuinely transformative. As a second pad, it's arguably the best value-for-weight investment in bouldering gear. But if you only own one pad and climb on rough, rocky terrain, stick with proven multi-layer foam. The peace of mind is worth the extra kilos.
          </KeyInsight>

          {/* ── Pool Float Bonus ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            Bonus: The Best Pool Float Money Can Buy
          </div>

          <div style={{ borderRadius: T.radius, overflow: "hidden", margin: "20px 0", border: `1px solid ${T.border}` }}>
            <img
              src="/images/insights/inflatable-swimming.jpg"
              alt="Using an inflatable crashpad as a pool float at a lake"
              style={{ width: "100%", height: "auto", display: "block" }}
              loading="lazy"
            />
          </div>
          <div style={{ fontSize: "11px", color: T.muted, marginTop: "-12px", marginBottom: "16px", fontStyle: "italic" }}>
            Not the intended use case, but the kids loved it.
          </div>

          <Prose>
            An inflatable crashpad is, fundamentally, a quite large, very durable air mattress. Take it to the lake, the river, or the pool after a session and you've got the most luxurious float at the beach. It's 1.5–1.8m² of lounging surface — big and stable enough to actually lie on comfortably. Is this a legitimate purchase justification? Probably not. Does it bring joy? Absolutely.
          </Prose>

        </section>

        {/* ═══ ARTICLE 2: Rope Cost vs Performance vs Safety ═══ */}
        <section id="ropes" ref={art2Ref} style={{ ...sectionStyle, scrollMarginTop: "60px" }}>
          <ArticleHeader
            number={2}
            title="Does Spending More Buy a Safer Rope? 106 Ropes Say: It's Complicated"
            subtitle="We crunched cost-per-gram, UIAA falls, and weight across 106 single ropes. The data challenges some common assumptions — and exposes what specs can't tell you."
          />

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Correlation" value="–0.19" sub="cost ↑ ≠ more falls (counterintuitive)" color={T.red} />
            <StatCard label="Dry Premium" value="+37%" sub="dry-treated ropes cost €3.06 vs €2.24/m" color={T.blue} />
            <StatCard label="Best Band" value="9.5–9.8" sub="31 models — fiercest competition" color={T.accent} />
          </div>

          <Prose>
            Here's the uncomfortable truth: across 106 single-certified ropes, spending more per metre of rope does <em>not</em> buy you more UIAA fall ratings. The correlation is weak and negative (r = –0.19). Thin, expensive alpine ropes at ≤8.9mm average 5.6 UIAA falls at 341¢/m, while budget-friendly 10mm+ ropes deliver 9–10 falls at just 258¢/m. So where does the money go?
          </Prose>

          <RopeScatterChart isMobile={isMobile} initialMetric="fpgVsPrice" initialColorBy="diameter" />

          <KeyInsight color={T.green}>
            <strong>You're paying for lightweight engineering, not durability.</strong> The premium on thin ropes funds R&D in sheath construction, dry treatments, and weight-optimized cores. A 70m rope at 48 g/m (≤8.9mm) weighs 3.4kg — versus 5.3kg at 75 g/m (≥11mm). On a long alpine route, that 1.9kg difference is real. But on a fall rating chart, the thick rope wins by a mile.
          </KeyInsight>

          <Prose>
            This creates a genuine dilemma. The UIAA fall test is the one standardized, repeatable metric we have for rope durability. Every rope must survive at least 5 falls for certification — and most exceed that comfortably. But the test uses an 80kg mass, a 5.5m fall on 2.8m of rope (factor 1.78), and a sharp 10mm edge. It's a worst-case lab scenario, not a real-world climbing fall. A rope rated for 7 falls isn't "less safe" than one rated for 13 — it simply reaches the test threshold sooner under extreme, repeated abuse.
          </Prose>

          <RopeTeaserChart isMobile={isMobile} />

          <KeyInsight>
            <strong>The 9.5–9.8mm sweet spot is real — and it's driven by competition, not physics.</strong> This band holds 31 of 106 models, nearly a third of the entire market. More models means fiercer price wars and more choice. Average: 8.0 UIAA falls, 62 g/m, and moderate pricing. Below 9.0mm you're in specialist alpine territory; above 10.0mm, weight climbs faster than durability.
          </KeyInsight>

          <Prose>
            Switch the scatter chart above to "Falls/Weight vs ¢/m" and you'll see durability <em>efficiency</em>: how many UIAA falls you get per gram of rope weight, plotted against cost per metre. This normalizes for the obvious "thicker = more falls" effect and reveals which ropes actually punch above their weight class. But even here, the trend is essentially flat: paying more doesn't systematically buy better efficiency.
          </Prose>

          <KeyInsight color={T.blue}>
            <strong>What the data can't show you — and why it matters.</strong> UIAA falls measure one very specific thing: resistance to repeated, severe edge falls. What they don't capture is abrasion resistance — how your sheath holds up over months of threading through quickdraws, rubbing over rock, and eating grit at the gym. Sheath durability, handling characteristics, and knot-ability are arguably more relevant for day-to-day longevity than the number on the fall test. Unfortunately, these properties can only be assessed through real-world product testing over time, not from a spec sheet. Until the industry develops a standardized abrasion test, no database (including ours) can give you the full picture.
          </KeyInsight>

          <Prose>
            The dry treatment pattern tells its own story. 100% of ropes below 9.0mm ship with dry treatment — these are mountain tools built for ice, mixed routes, and alpine weather where a wet rope can lose up to 40% of its dynamic strength. By 9.6–9.8mm the dry-treatment rate drops to 65%; above 10mm it's a coin flip. Dry treatment adds a 37% price premium (avg €3.06/m vs €2.24/m untreated) — a meaningful cost that's justified if you climb in wet conditions, but potentially wasted money if your rope lives mostly at the sport crag.
          </Prose>

          <KeyInsight color={T.yellow}>
            <strong>Our honest take:</strong> Don't chase fall ratings. Every certified rope is safe. Instead, pick your rope by how you climb: alpine multi-pitch? Go thin, dry, and accept the lower fall count. Single-pitch sport? A 9.5–9.8mm untreated rope gives you the best combination of price, weight, and durability. Gym only? Grab a thick 10mm+ workhorse — you'll get maximum falls-per-euro and you won't care about the extra weight. The real differentiator between similar ropes in the same class is sheath longevity and handling — and for that, you'll need hands-on experience or trusted reviews, not spec sheets.
          </KeyInsight>
        </section>

        {/* ═══ ARTICLE 3: Shoe Selection Guide ═══ */}
        <section id="shoes" ref={art3Ref} style={{ ...sectionStyle, scrollMarginTop: "60px" }}>
          <ArticleHeader
            number={3}
            title="How We Score 340 Climbing Shoes — and How to Pick Yours"
            subtitle="Our guided search scores every shoe across 7 performance axes. Here's what the algorithm actually measures, how shoe specs translate to real-world performance, and what your foot shape means for fit."
          />

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Database" value="340" sub="shoes from 25+ brands" color={T.accent} />
            <StatCard label="Price Gap" value="€47" sub="flat avg €109 → aggressive €156" color={T.yellow} />
            <StatCard label="Performance Axes" value="7" sub="edging · smearing · pockets · hooks · comfort · sensitivity · support" color={T.green} />
          </div>

          {/* ── The Price–Downturn Connection ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            The Price–Downturn Connection
          </div>

          {/* Derived from Supabase prices × seed_data.json (312 shoes with prices) — 2026-02-18 */}
          <ShoePriceTeaserChart isMobile={isMobile} />

          <Prose>
            Across the 312 shoes with price data, the pattern is clear: more aggressive shapes cost more. Flat-lasted shoes average €109, moderate-downturn shoes €139, and aggressive shoes €156. That €47 gap from flat to aggressive isn't random — it reflects the precision construction, asymmetric lasts, and premium rubber compounds that high-performance shoes demand. But an expensive shoe isn't automatically the right shoe. A beginner in an aggressive €160 shoe will be less comfortable and less effective than in a flat €90 shoe that matches their skill level.
          </Prose>

          <KeyInsight color={T.yellow}>
            <strong>The best value lives in the €80–120 range.</strong> This band holds 83 shoes — more than any other bracket — including most flat-lasted all-rounders and entry-level moderate shoes. You don't need to spend €160+ to get a capable climbing shoe. What you're paying for at the top end is specialisation, not raw quality.
          </KeyInsight>

          {/* ── How Our Scoring Works ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            How Our Guided Search Scores Every Shoe
          </div>

          <Prose>
            Our <Link to="/shoes?finder=1" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>Shoe Finder</Link> walks you through six questions — discipline, environment, experience, preference, foot shape, and body weight — then scores all 340 shoes out of 100 points. The scoring isn't a black box: it maps your answers to concrete specs, then rewards shoes whose construction matches what you need.
          </Prose>

          <Prose>
            The 100 points break down into eight categories. <strong>Discipline</strong> (20 pts) matches your climbing style to ideal closure types — bouldering favours slippers and velcro for quick on/off, sport climbing suits velcro and lace, and trad climbing rewards lace-ups for all-day precision. <strong>Downturn</strong> (15 pts) and <strong>asymmetry</strong> (10 pts) use a five-tier system that combines your experience level and comfort preference into a single target profile — beginners who want comfort land at the flat/symmetric end, while advanced climbers chasing performance are pushed toward aggressive/asymmetric shapes. <strong>Midsole stiffness</strong> (15 pts) is tuned by both discipline and body weight: heavier climbers need more support, and trad routes demand stiffer platforms than bouldering. The remaining points go to <strong>environment</strong> (10 pts), <strong>closure</strong> (10 pts), <strong>rubber thickness</strong> (10 pts), and <strong>foot shape</strong> (10 pts).
          </Prose>

          <KeyInsight>
            <strong>The five-tier system is the core of our scoring.</strong> Your experience level (beginner → advanced) sets a base number. Your preference (comfort → performance) adds to it. The sum maps to one of five tiers — from flat/symmetric to ultra-aggressive/strong-asymmetric. This prevents beginners from being matched with painful aggressive shoes, while giving advanced climbers the full performance range.
          </KeyInsight>

          {/* ── How Specs Map to Performance ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            How Specs Actually Affect Performance
          </div>

          <Prose>
            Beyond the Finder's scoring, we compute seven performance axes for every shoe based purely on its physical specs. These are the spider-chart values you see on each shoe's detail page. Here's what drives each one — and why certain trade-offs are unavoidable.
          </Prose>

          <Collapsible title="Edging — standing on tiny holds" defaultOpen={true}>
            <Prose>
              Edging is about transferring your weight through a small contact point. The formula is rigidity-dominant: 65% structural stiffness, 35% shape. <strong>Stiffness</strong> comes from midsole type (40%), rand tension (25%), rubber thickness (15%), closure (10%), and upper material (10%). A full midsole with a tensioned rand and lace closure creates the stiffest platform. <strong>Shape</strong> is driven 80% by downturn and 20% by asymmetry — moderate-to-aggressive shoes concentrate force at the toe. Hard rubber adds a small bonus for edge precision. The best edging shoes combine a stiff platform with a moderate-to-aggressive profile: think La Sportiva TC Pro or Scarpa Maestro.
            </Prose>
          </Collapsible>

          <Collapsible title="Smearing — friction on flat rock">
            <Prose>
              Smearing is the opposite story. The formula is 72% conformability, 20% rubber thickness, 8% shape. <strong>Conformability</strong> is an equal blend of rubber softness and a soft feel — the foot needs to deform around the rock surface. Thick rubber helps <em>more</em> when it's soft, because more material can mould to the surface. Flat shoes with no asymmetry smear better than aggressive shapes that concentrate pressure at the toe. The ideal smearer: soft rubber, soft feel, flat profile, thick sole. Shoes like the La Sportiva Mythos or Five Ten Moccasym define this archetype.
            </Prose>
          </Collapsible>

          <Collapsible title="Pockets — hooking toes into holes">
            <Prose>
              Pocket performance needs a curled, stiff toe that can hook into small openings. Downturn (23%) and asymmetry (23%) are the biggest drivers, followed by toe patch coverage (18%), perceived stiffness (14%), closure (12%), and rubber hardness (10%). Aggressive, asymmetric shoes with a full toe patch dominate — but interestingly, slippers score higher for closure here than lace-ups, because the flexible upper lets the toe curl more naturally into pockets.
            </Prose>
          </Collapsible>

          <Collapsible title="Hooks & heel/toe performance">
            <Prose>
              Hooking requires rubber coverage more than anything else. Heel rubber coverage is the biggest factor at 30%, followed by toe patch (25%), downturn (20%), sensitivity (15%), and closure (10%). Soft-feeling shoes score higher on the sensitivity component — they transmit feedback from the rock, helping you feel whether a heel hook is secure. Slippers again score well for closure: their flexibility lets you wrap the shoe around features.
            </Prose>
          </Collapsible>

          <Collapsible title="Sensitivity — feeling the rock through your shoe">
            <Prose>
              Sensitivity measures rock feedback reaching your foot. It's driven by structural flexibility (26%), soft feel (22%), thin rubber (20%), rubber softness (10%), minimal midsole (12%), and light weight (10%). Notice the tension with edging: the specs that maximise sensitivity (thin, soft, no midsole) are exactly the ones that minimise stiffness. This is the fundamental climbing shoe trade-off — you can't have maximum edging <em>and</em> maximum sensitivity in the same shoe.
            </Prose>
          </Collapsible>

          <Collapsible title="Comfort & Support — the other side of the coin">
            <Prose>
              Comfort is a weighted blend of soft feel (20%), flat downturn (20%), gentle asymmetry (16%), upper material (10% — leather scores highest), closure convenience (10%), light weight (8%), midsole cushioning (8%), and rubber thickness (8%). <strong>Support</strong> is essentially the inverse of sensitivity: stiff feel, hard rubber, thick soles, full midsole, and lace closure all maximise it. For multi-pitch trad routes, support prevents foot fatigue over hours of climbing. For bouldering sessions, comfort matters more for the time between attempts than during the climb itself.
            </Prose>
          </Collapsible>

          <KeyInsight color={T.green}>
            <strong>The central trade-off in every climbing shoe:</strong> sensitivity vs. support, and smearing vs. edging. A shoe that scores 90th percentile on edging will typically sit below 30th on smearing. A shoe built for maximum sensitivity sacrifices support. Understanding this trade-off is more important than chasing the "best" shoe — because the best shoe is the one that matches <em>your</em> climbing style. The chart below maps all 340 shoes into six zones — toggle "Zones" to see where each archetype lives.
          </KeyInsight>

          {/* ── Foot Shape ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            Why Foot Shape Matters More Than You Think
          </div>

          <Prose>
            Of our 331 adult shoes, 197 (60%) have an Egyptian last — longest big toe, tapering down. 118 (36%) use a Roman (square) last with the first 2–3 toes roughly equal. Only 10 shoes (3%) target a Greek (Morton's) foot where the second toe is longest. If you have Greek toes, your options are genuinely limited, and choosing a mismatched last will cause hot spots and pain regardless of how well the shoe scores on performance.
          </Prose>

          <Prose>
            Width and volume matter just as much. 194 shoes (59%) have a medium heel volume, while 118 (36%) are narrow. If you have wide heels, only 13 shoes in our database will fit comfortably — and no amount of break-in will fix a heel cup that's fundamentally too narrow. Similarly, 219 shoes (67%) target a standard forefoot volume, 78 (24%) are low-volume, and only 28 (9%) accommodate high-volume forefeet. Our Finder awards up to 10 bonus points for foot shape matches, but the more important role of foot data is <em>filtering out</em> shoes that will never fit.
          </Prose>

          <KeyInsight color={T.blue}>
            <strong>Know your foot before you shop.</strong> Stand on a piece of paper, trace your foot, and identify your toe form (Egyptian, Roman, or Greek). Try on shoes at a local shop to learn your width and volume. Then use these parameters in our <Link to="/shoes?finder=1" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>Shoe Finder</Link> — they'll eliminate mismatches before you ever look at performance scores.
          </KeyInsight>

          {/* ── Interactive Chart ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            Explore the Full Shoe Database
          </div>

          <Prose>
            The scatter chart below defaults to Edging vs Sensitivity with six annotated zones. Green dots are beginner-to-intermediate shoes, orange dots are advanced-to-elite. Each zone corresponds to a distinct shoe archetype — hover the zone cards below the chart for details. Switch metrics, change the colour mode, and click any dot to see the full spec sheet.
          </Prose>

          <ShoeScatterChart shoes={SHOE_SEED} isMobile={isMobile} />

          <div style={{ marginTop: "20px" }}>
            <Link to="/shoes?finder=1" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              padding: "12px 24px", background: T.accent, color: "#fff",
              borderRadius: "8px", fontSize: "14px", fontWeight: 700,
              textDecoration: "none", transition: "transform 0.15s",
            }}
              onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"}
              onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              Try the Shoe Finder — 6 questions, personalised results →
            </Link>
          </div>
        </section>

        {/* ═══ FOOTER CTA ═══ */}
        <div style={{
          textAlign: "center", padding: "40px 24px",
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