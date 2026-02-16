import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import CRASHPAD_SEED from "./crashpad_seed_data.json";
import CrashpadScatterChart from "./CrashpadScatterChart.jsx";
import RopeScatterChart from "./RopeScatterChart.jsx";

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return m;
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

/* ═══════════════════════════════════════════════════════════════
   ARTICLE SECTIONS
   ═══════════════════════════════════════════════════════════════ */

function ArticleHeader({ number, title, subtitle, icon }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <span style={{ fontSize: "28px" }}>{icon}</span>
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
  const isMobile = useIsMobile();
  const maxW = "820px";

  const sectionStyle = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: "16px",
    padding: isMobile ? "24px 16px" : "40px 36px",
    marginBottom: "32px",
  };

  return (
    <div style={{ fontFamily: T.font, color: T.text, minHeight: "100vh", padding: isMobile ? "20px 12px 60px" : "40px 24px 80px" }}>
      <div style={{ maxWidth: maxW, margin: "0 auto" }}>

        {/* Page Header */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: T.accent, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>Data-Driven Insights</div>
          <h1 style={{ fontSize: isMobile ? "28px" : "36px", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.2, margin: "0 0 12px", color: T.text }}>
            What the Data Actually Says<br />About Climbing Gear
          </h1>
          <p style={{ fontSize: "15px", color: T.muted, lineHeight: 1.6, maxWidth: "520px", margin: "0 auto" }}>
            We crunched specs across 100+ crashpads and 100+ ropes. No affiliate bias, no sponsored takes — just numbers and honest conclusions.
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginTop: "20px" }}>
            <span style={{ fontSize: "11px", color: T.yellow, background: T.yellowSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>101 Crashpads</span>
            <span style={{ fontSize: "11px", color: T.green, background: T.greenSoft, padding: "4px 12px", borderRadius: "6px", fontWeight: 600 }}>106 Ropes</span>
          </div>
        </div>

        {/* ═══ ARTICLE 1: Inflatable Crashpads ═══ */}
        <section style={sectionStyle}>
          <ArticleHeader
            number={1}
            icon="💨"
            title="Inflatable Crashpads: Game-Changer or Gimmick?"
            subtitle="They shatter the weight curve, fit inside your main pad, and double as a mattress. But would you trust one on sharp rock?"
          />

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Avg kg/m² (Inflatable)" value="2.6" sub="vs 4.8 for foam pads" color={T.yellow} />
            <StatCard label="Weight Saving" value="46%" sub="Same thickness, half the weight" color={T.green} />
            <StatCard label="Packed Volume" value="~5L" sub="Fits inside any taco pad" color={T.blue} />
          </div>

          {/* ── Section: The Data ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            📊 Breaking the Trendline
          </div>

          <CrashpadScatterChart isMobile={isMobile} highlightSlugs={INFLATABLE_SLUGS} initialMetric="area_weight" compact thicknessRange={[10, 16]} />

          <Prose>
            The chart above tells the story better than words can. Among the {INFLATABLE_PADS.length} pads in our database with 10–16cm thickness, the inflatables sit dramatically below the weight trendline. At 3.5–5.0 kg for 1.8–2.0 m² of landing area, they weigh roughly half of what foam pads deliver for the same coverage. That's not a marginal improvement — it's a category break. Click on any dot to see the full specs of that pad.
          </Prose>

          <Prose>
            To put this in perspective: a foam pad with 1.5–2.0 m² landing area and 10–16cm thickness typically weighs 6–10 kg. The inflatables deliver the same or more area at 3.5–5.0 kg. The weight savings come from replacing dense PE and PU foam with air chambers — the same principle that makes inflatable sleeping mats lighter than foam rolls, but scaled up to crashpad dimensions.
          </Prose>

          <KeyInsight color={T.yellow}>
            <strong>The weight advantage is real.</strong> A Snap Air Shock 1 delivers 1.8m² of 15cm-thick landing zone at just 5kg. A comparable foam pad (e.g. Snap Wrap Original: 1.5m², 15cm, 10kg) weighs twice as much for less area. That deflated Air Shock rolls up to roughly sleeping-bag size — meaning you can carry two full-size pads to the crag for barely more than the weight of one traditional pad.
          </KeyInsight>

          {/* ── Section: Cost per Area ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "32px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            💶 Cost per Area: Surprisingly Competitive
          </div>

          <CrashpadScatterChart isMobile={isMobile} highlightSlugs={INFLATABLE_SLUGS} initialMetric="area_price" compact thicknessRange={[10, 16]} />

          <Prose>
            Here's where it gets really interesting. You might expect air-chamber technology to come at a steep premium — but the data tells a different story. When you plot area vs price for the same 10–16cm thickness range, the inflatables sit right on the trendline — competitive with foam pads of comparable landing area. You're not paying a premium for lighter weight — you're getting <em>more for the same money</em>.
          </Prose>

          <Prose>
            Compare this to the weight chart above: inflatables sit dramatically below the foam weight trendline <em>and</em> remain competitively priced for their landing area. That's an extraordinary combination in climbing gear, where lighter almost always means more expensive. The value proposition becomes even clearer when you factor in the dual-use potential — your crashpad doubles as a sleeping mat, pool float, and van insulation.
          </Prose>

          <KeyInsight color={T.green}>
            <strong>Better value by every metric.</strong> Inflatables deliver roughly half the weight at a below-average €/m². In other words, the air-chamber technology doesn't just save weight — it saves money per square meter of landing zone too. That's genuinely rare in climbing gear.
          </KeyInsight>

          {/* ── Section: Packed Size ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "32px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            📦 Packed Size: Where It Gets Ridiculous
          </div>

          {/* PHOTO PLACEHOLDER: packed size comparison */}
          <div style={{
            background: T.surface, border: `2px dashed ${T.border}`, borderRadius: T.radius,
            padding: "40px 24px", textAlign: "center", margin: "20px 0",
          }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>📷</div>
            <div style={{ fontSize: "13px", color: T.muted, fontWeight: 600 }}>Photo coming: Packed inflatable vs. similar-sized foam pad</div>
            <div style={{ fontSize: "11px", color: T.muted, marginTop: "4px" }}>Size comparison showing how an inflatable packs down next to a traditional pad</div>
          </div>

          <Prose>
            This is perhaps the most underappreciated advantage. When deflated, an inflatable crashpad rolls down to roughly the size of a sleeping bag — about 5 liters of volume. Compare that to a foam pad of similar landing area, which stays the same massive rectangle whether you're climbing on it or carrying it to the crag.
          </Prose>

          <Prose>
            The practical implication is huge: an inflatable fits inside most taco-fold or hinge-fold pads. You're not strapping a second bulky pad to the outside of your first one, Tetris-ing gear on your back, or making a second trip. Just roll it up, tuck it in, and hike normally. For long approaches — think Fontainebleau, Rocklands, or Magic Wood — this alone can be the deciding factor.
          </Prose>

          <KeyInsight color={T.blue}>
            <strong>Stacking made easy:</strong> Carry two full-size pads for the weight and bulk of roughly 1.3 traditional pads. That second pad doesn't just double your landing zone — it eliminates the gaps between pads, which is where most ankle injuries happen. And your spotter doesn't need to drag a pad over every time you move to a new problem.
          </KeyInsight>

          {/* ── Section: Inflation & Setup ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "32px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            🌬️ Inflation: Easier Than You'd Think
          </div>

          {/* PHOTO PLACEHOLDER: blower filling air */}
          <div style={{
            background: T.surface, border: `2px dashed ${T.border}`, borderRadius: T.radius,
            padding: "40px 24px", textAlign: "center", margin: "20px 0",
          }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>📷</div>
            <div style={{ fontSize: "13px", color: T.muted, fontWeight: 600 }}>Photo coming: Using a blower to inflate the pad</div>
            <div style={{ fontSize: "11px", color: T.muted, marginTop: "4px" }}>A battery-powered blower makes inflation a 60-second job</div>
          </div>

          <Prose>
            The most common objection we hear: "But I don't want to sit there pumping up a pad for 10 minutes." Fair point — with a manual pump, inflation takes a while and isn't exactly fun after a sweaty approach. But here's the thing: most boulderers already carry a battery-powered blower to clean holds. That same blower inflates an entire crashpad in about 60 seconds. Plug in, hit the button, done.
          </Prose>

          <Prose>
            And once it's inflated, you get something foam pads can't offer: adjustable firmness. Pump in more air for a firmer, more responsive landing surface on higher problems. Let some air out for a softer cushion on sit-starts or traverses where you're closer to the ground. It's like having multiple pads in one. Some climbers even fine-tune firmness throughout a session as they move between problems of different heights.
          </Prose>

          {/* ── Section: Best Use Cases ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "32px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            ✅ Where Inflatables Shine
          </div>

          {/* PHOTO: flat landing bouldering use case */}
          <div style={{
            borderRadius: T.radius, overflow: "hidden", margin: "20px 0",
            border: `1px solid ${T.border}`,
          }}>
            <img
              src="/images/insights/inflatable-bouldering.jpg"
              alt="Bouldering on flat, even terrain — the ideal use case for inflatable crashpads"
              style={{ width: "100%", height: "auto", display: "block" }}
              onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
            />
            <div style={{
              display: "none", background: T.surface, padding: "40px 24px", textAlign: "center",
              flexDirection: "column", alignItems: "center", gap: "8px",
            }}>
              <div style={{ fontSize: "32px" }}>🧗</div>
              <div style={{ fontSize: "13px", color: T.muted, fontWeight: 600 }}>Photo: Bouldering on flat, even terrain</div>
              <div style={{ fontSize: "11px", color: T.muted }}>The ideal use case for inflatable crashpads</div>
            </div>
          </div>
          <div style={{ fontSize: "11px", color: T.muted, marginTop: "-12px", marginBottom: "16px", fontStyle: "italic" }}>
            Flat, even landings — this is where inflatables truly excel. No sharp edges, no ankle-rolling slopes.
          </div>

          <Prose>
            Inflatables are at their best on flat, even terrain with relatively low problems. Think sandy bouldering areas, forest clearings with soft ground, or gym-style outdoor walls. The flat surface of the pad works perfectly when the ground underneath is also flat — you get a large, consistent landing zone without the dead spots that can appear when foam pads sit unevenly on rocky ground.
          </Prose>

          <Prose>
            They're also unbeatable for van-life and traveling boulderers. A deflated pad takes up barely any space in your vehicle compared to a foam pad that dominates the entire cargo area. When you arrive at the spot, 60 seconds with a blower and you've got a full-size landing zone. At the end of the day, deflate it and reclaim your living space — something anyone who's lived out of a van with a full-size crashpad will deeply appreciate.
          </Prose>

          <Prose>
            The comfort factor shouldn't be underestimated either. Inflatables make surprisingly decent sleeping mats — they're thick, insulating, and adjustable. If you're camping at the crag or doing a multi-day bouldering trip, your crashpad doubling as a comfortable mattress eliminates one more piece of gear from your pack.
          </Prose>

          {/* ── Section: Cons & Honest Warnings ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "32px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            ⚠️ The Honest Downsides
          </div>

          <Prose>
            Now for the part that matters most: where inflatables fall short. And we're not going to sugarcoat this — there are real limitations that every buyer should understand before dropping €200–300 on an air-filled pad.
          </Prose>

          <KeyInsight color={T.red}>
            <strong>Puncture risk is real.</strong> Sharp rock edges, thorny vegetation, or even a stray piece of metal in the dirt can puncture an air chamber. Unlike a foam pad that still works with a tear, a punctured inflatable loses its primary function. Most come with repair kits, but patching a pad mid-session isn't anyone's idea of a good time. On sharp limestone or granite with protruding edges, we'd strongly recommend foam.
          </KeyInsight>

          <Prose>
            Beyond punctures, there are several practical trade-offs to consider. The surface of an inflatable can feel slippery compared to the textured fabric of foam pads, especially when wet or dusty. On uneven terrain — slopes, roots, small rocks — the pad tends to shift and wobble in ways that foam pads don't. Some climbers report feeling less confident in their landings, particularly on sideways falls where ankle stability matters.
          </Prose>

          <Prose>
            Air also behaves differently from foam during impact. Foam absorbs energy progressively — the top layer compresses first, then the middle, then the base, giving you a gradual deceleration. Air compresses all at once, creating a bouncier, less predictable landing. For low-height falls onto flat ground, this is fine. For dynamic, off-axis falls from height, it's noticeably different from what your body expects after years of landing on foam.
          </Prose>

          <KeyInsight color={T.red}>
            <strong>No built-in storage.</strong> Foam pads typically have shoe pockets, chalk bag loops, and gear compartments built into the carry system. Inflatables have none of that. Your options are to carry the deflated pad inside your main foam pad (the recommended approach) or bring a separate bag. It's not a dealbreaker, but it's worth knowing before you expect the full "grab and go" experience of a traditional crashpad.
          </KeyInsight>

          <Prose>
            Finally, temperature affects performance. In cold conditions, the air inside contracts, making the pad slightly softer and potentially underinflated. You may need to top up the pressure on cold mornings. In extreme heat, the opposite can happen — the pad may feel overly firm or even need some air released. Foam pads are impervious to these temperature swings.
          </Prose>

          {/* ── Section: Verdict ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "32px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            🎯 The Verdict
          </div>

          <Prose>
            So, game-changer or gimmick? Neither — and both. Inflatable crashpads aren't here to replace your foam pad. They're here to complement it. The ideal setup for many boulderers is a traditional foam pad as the primary landing zone, with an inflatable tucked inside for extra coverage. You get the reliable, progressive impact absorption of foam where you need it most, plus a lightweight extension that covers gaps and expands your safe zone.
          </Prose>

          <KeyInsight color={T.green}>
            <strong>Our recommendation:</strong> If you boulder on flat terrain, travel often, or do long approaches — an inflatable pad is genuinely transformative. As a second pad, it's arguably the best value-for-weight investment in bouldering gear. But if you only own one pad and climb on rough, rocky terrain, stick with proven multi-layer foam. The peace of mind is worth the extra kilos.
          </KeyInsight>

          {/* ── Bonus Section: Swimming ── */}
          <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "32px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
            🏊 Bonus: The Best Pool Float Money Can Buy
          </div>

          {/* PHOTO: swimming bonus */}
          <div style={{
            borderRadius: T.radius, overflow: "hidden", margin: "20px 0",
            border: `1px solid ${T.border}`,
          }}>
            <img
              src="/images/insights/inflatable-swimming.jpg"
              alt="Using an inflatable crashpad as a pool float — the unexpected bonus"
              style={{ width: "100%", height: "auto", display: "block" }}
              onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
            />
            <div style={{
              display: "none", background: T.surface, padding: "40px 24px", textAlign: "center",
              flexDirection: "column", alignItems: "center", gap: "8px",
            }}>
              <div style={{ fontSize: "32px" }}>🏊</div>
              <div style={{ fontSize: "13px", color: T.muted, fontWeight: 600 }}>Photo: Inflatable crashpad as pool float</div>
              <div style={{ fontSize: "11px", color: T.muted }}>The unexpected bonus use case</div>
            </div>
          </div>
          <div style={{ fontSize: "11px", color: T.muted, marginTop: "-12px", marginBottom: "16px", fontStyle: "italic" }}>
            Not the intended use case, but we're not going to pretend we haven't tried it.
          </div>

          <Prose>
            We'd be lying if we said this wasn't a factor. An inflatable crashpad is, fundamentally, a very large, very durable air mattress. Take it to the lake, the river, or the pool after a session and you've got the most luxurious float anyone at the beach has ever seen. It's 1.5–1.8m² of lounging surface — big enough to actually lie on comfortably. Is this a legitimate purchase justification? Probably not. Does it bring joy? Absolutely.
          </Prose>

        </section>

        {/* ═══ ARTICLE 2: Rope Cost vs Performance vs Safety ═══ */}
        <section style={sectionStyle}>
          <ArticleHeader
            number={2}
            icon="🧵"
            title="Does Spending More Buy a Safer Rope? 106 Ropes Say: It's Complicated"
            subtitle="We crunched cost-per-gram, UIAA falls, and weight across 106 single ropes. The data challenges some common assumptions — and exposes what specs can't tell you."
          />

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
            <StatCard label="Correlation" value="–0.44" sub="cost ↑ = falls ↓ (counterintuitive)" color={T.red} />
            <StatCard label="Dry Premium" value="+37%" sub="dry-treated ropes cost €3.06 vs €2.24/m" color={T.blue} />
            <StatCard label="Best Band" value="9.5–9.8" sub="31 models — fiercest competition" color={T.accent} />
          </div>

          <Prose>
            Here's the uncomfortable truth: across 106 single-certified ropes, spending more per gram of rope does <em>not</em> buy you more UIAA fall ratings. The correlation is actually negative (r = –0.44). Thin, expensive alpine ropes at ≤8.9mm average 5.4 UIAA falls at 6.8¢/g, while budget-friendly 10mm+ ropes deliver 10–14 falls at just 3.4–3.8¢/g. So where does the money go?
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
            Switch the scatter chart above to "Falls/Weight vs ¢/g" and you'll see durability <em>efficiency</em>: how many UIAA falls you get per gram of rope weight, plotted against cost per gram. This normalizes for the obvious "thicker = more falls" effect and reveals which ropes actually punch above their weight class. The Trango Agility 9.8 stands out — 0.20 falls per g/m at just 3.8¢/g. But even here, the trend is essentially flat: paying more doesn't systematically buy better efficiency.
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
              { label: "Browse Crashpads", to: "/crashpads", icon: "🛏️" },
              { label: "Browse Ropes", to: "/ropes", icon: "🧵" },
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
                {l.icon} {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Methodology */}
        <div style={{ marginTop: "32px", padding: "20px", background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Methodology</div>
          <p style={{ fontSize: "12px", color: T.muted, lineHeight: 1.7, margin: 0 }}>
            Data sourced from manufacturer specs and retailer listings across European markets. Prices reflect current street prices (or UVP where unavailable) as of early 2025.
            Crashpad €/m² calculated as current_price ÷ (length_open × width_open).
            Rope analysis covers 106 single-certified ropes (EN 892, 80kg test mass). Half and twin ropes (35 total) use a lighter 55kg test mass and are excluded to avoid inflated fall counts. Cost per gram (¢/g) = (price per meter ÷ weight per meter) × 100. Sample sizes noted on each chart. Analysis by climbing-gear.com.
          </p>
        </div>

      </div>
    </div>
  );
}