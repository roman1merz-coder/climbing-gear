import { Link } from "react-router-dom";
import { T } from "./tokens.js";
import ROPE_SEED from "./rope_seed_data.json";
import RopeScatterChart from "./RopeScatterChart.jsx";
import usePageMeta from "./usePageMeta.js";
import {
  useIsMobile, ArticleLayout, ArticleHeader, SectionHeading, StatCard,
  ChartContainer, Prose, KeyInsight,
} from "./InsightsShared.jsx";

/* ─── Derived from rope_seed_data.json — single ropes only ─── */
const SINGLES = ROPE_SEED.filter(r => r.rope_type === "single");

/* ─── Rope Diameter Band data (derived from seed 2026-02-25) ─── */
const ROPE_BANDS = (() => {
  const bands = [
    { band: "≤8.7",      min: 0,     max: 8.75  },
    { band: "8.8–9.1",   min: 8.75,  max: 9.15  },
    { band: "9.1–9.4",   min: 9.15,  max: 9.45  },
    { band: "9.5–9.8",   min: 9.45,  max: 9.85  },
    { band: "9.9–10.2",  min: 9.85,  max: 10.25 },
    { band: "≥10.3",     min: 10.25, max: 999   },
  ];
  return bands.map(b => {
    const ropes = SINGLES.filter(r => r.diameter_mm >= b.min && r.diameter_mm < b.max && r.uiaa_falls);
    const n = ropes.length;
    const falls = n ? +(ropes.reduce((s, r) => s + r.uiaa_falls, 0) / n).toFixed(1) : 0;
    const gm = n ? +(ropes.reduce((s, r) => s + (r.weight_per_meter_g || 0), 0) / n).toFixed(1) : 0;
    return { band: b.band, falls, gm, n };
  });
})();

function RopeTeaserChart({ isMobile }) {
  const W = isMobile ? 340 : 700, H = isMobile ? 240 : 260;
  const pad = { top: 20, right: 20, bottom: 40, left: 55 };
  const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;
  const barW = Math.min(50, cw / ROPE_BANDS.length - 8);
  const maxFalls = 16;
  const sweet = [3, 3]; // 9.5–9.8mm band

  return (
    <ChartContainer title="Avg UIAA Falls by Diameter Band" subtitle={`${SINGLES.length} single ropes · Sweet spot highlighted`}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
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
        {[0, 4, 8, 12, 16].map(v => (
          <g key={v}>
            <line x1={pad.left} y1={pad.top + ch - (v / maxFalls) * ch} x2={W - pad.right} y2={pad.top + ch - (v / maxFalls) * ch} stroke={T.border} strokeDasharray="3,3" />
            <text x={pad.left - 8} y={pad.top + ch - (v / maxFalls) * ch + 4} fill={T.muted} fontSize="10" textAnchor="end">{v}</text>
          </g>
        ))}
        <text x={14} y={H / 2} fill={T.muted} fontSize="11" textAnchor="middle" fontWeight="600" transform={`rotate(-90,14,${H / 2})`}>Avg UIAA Falls</text>
        <text x={W / 2} y={H - 2} fill={T.muted} fontSize="11" textAnchor="middle" fontWeight="600">Diameter (mm)</text>
      </svg>
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
        Explore all {SINGLES.length} ropes interactively →
      </Link>
    </ChartContainer>
  );
}

export default function InsightRopes() {
  usePageMeta(
    `Does Spending More Buy a Safer Climbing Rope? ${SINGLES.length} Ropes Analysed`,
    `We compared cost-per-metre, UIAA fall ratings, and weight across ${SINGLES.length} single climbing ropes. The correlation between price and safety is surprisingly weak. Here's why — and what to buy instead.`
  );
  const isMobile = useIsMobile();

  return (
    <ArticleLayout isMobile={isMobile} breadcrumb="Rope Cost vs Safety">
      <ArticleHeader
        title={`Does Spending More Buy a Safer Rope? ${SINGLES.length} Ropes Say: It's Complicated`}
        subtitle={`We crunched cost-per-gram, UIAA falls, and weight across ${SINGLES.length} single ropes. The data challenges some common assumptions — and exposes what specs can't tell you.`}
      />

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
        <StatCard label="Correlation" value="–0.19" sub="cost ↑ ≠ more falls (counterintuitive)" color={T.red} />
        <StatCard label="Dry Premium" value="+37%" sub="dry-treated ropes cost €3.06 vs €2.24/m" color={T.blue} />
        <StatCard label="Best Band" value="9.5–9.8" sub={`${ROPE_BANDS[3].n} models — fiercest competition`} color={T.accent} />
      </div>

      <Prose>
        Here's the uncomfortable truth: across {SINGLES.length} single-certified ropes, spending more per metre of rope does <em>not</em> buy you more UIAA fall ratings. The correlation is weak and actually negative (r = –0.19). Thin, expensive alpine ropes at ≤8.9mm average 5.6 UIAA falls at €3.41/m, while budget-friendly 10mm+ ropes deliver 9–10 falls at just €2.58/m. So where does the money go?
      </Prose>

      <RopeScatterChart isMobile={isMobile} initialMetric="fpgVsPrice" initialColorBy="diameter" />

      <KeyInsight color={T.green}>
        <strong>You're paying for lightweight engineering, not durability.</strong> The premium on thin ropes funds R&D in sheath construction, dry treatments, and weight-optimized cores. A 70m rope at 48 g/m (≤8.9mm) weighs 3.4kg — versus 5.3kg at 75 g/m (≥11mm). On a long alpine route, that 1.9kg difference is real. But on a fall rating chart, the thick rope wins by a mile.
      </KeyInsight>

      <Prose>
        This creates a genuine dilemma. The UIAA fall test is the one standardized, repeatable metric we have for rope durability. Every rope must survive at least 5 falls for certification — and most exceed that comfortably. But the test uses an 80kg mass, a 5.5m fall on 2.8m of rope (factor 1.78), and a sharp 10mm edge. It's a worst-case lab scenario, not a real-world climbing fall.
      </Prose>

      <RopeTeaserChart isMobile={isMobile} />

      <KeyInsight>
        <strong>The 9.5–9.8mm sweet spot is real — and it's driven by competition, not physics.</strong> This band holds {ROPE_BANDS[3].n} of {SINGLES.length} models. More models means fiercer price wars and more choice. Average: {ROPE_BANDS[3].falls} UIAA falls, {ROPE_BANDS[3].gm} g/m, and moderate pricing. Below 9.5mm you're in high-performance and eventually specialist alpine territory; above 9.8mm, weight climbs faster than durability.
      </KeyInsight>

      <Prose>
        Switch the scatter chart above to "Falls/Weight vs €/m" and you'll see durability <em>efficiency</em>: how many UIAA falls you get per gram of rope weight, plotted against cost per metre. This normalizes for the obvious "thicker = more falls" effect and reveals which ropes actually punch above their weight class. But even here, the trend is essentially flat: paying more doesn't systematically buy better efficiency.
      </Prose>

      <KeyInsight color={T.blue}>
        <strong>What the data can't show you — and why it matters.</strong> UIAA falls measure one very specific thing: resistance to repeated, severe edge falls. What they don't capture is abrasion resistance — how your sheath holds up over months of threading through quickdraws, rubbing over rock, and eating grit at the gym. Sheath durability, handling characteristics, and knot-ability are arguably more relevant for day-to-day longevity than the number on the fall test. Unfortunately, these properties can only be assessed through real-world use over time. Our database gives you every spec-based comparison you need to narrow the field — diameter, weight, fall rating, dry treatment, price — so you can shortlist confidently, then let hands-on feel make the final call.
      </KeyInsight>

      <Prose>
        The dry treatment pattern tells its own story. 100% of ropes below 9.0mm ship with dry treatment — these are mountain tools built for ice, mixed routes, and alpine weather where a wet rope can lose up to 40% of its dynamic strength. By 9.6–9.8mm the dry-treatment rate drops to 65%; above 10mm it's a coin flip. Dry treatment adds a 37% price premium (avg €3.06/m vs €2.24/m untreated) — a meaningful cost that's justified if you climb in wet conditions, but potentially wasted money if your rope lives mostly at the sport crag.
      </Prose>

      <KeyInsight color={T.yellow}>
        <strong>Our honest take:</strong> Pick your rope by how you climb: alpine multi-pitch? Go thin, dry, and accept the lower fall count. Single-pitch sport? A 9.5–9.8mm untreated rope gives you the best combination of price, weight, and durability – thinner ropes will wear faster whilst treatments add unnecessary cost. Gym only? Grab a thick 10mm+ workhorse — you'll get maximum falls-per-euro and you won't care about the extra weight. Use our <Link to="/ropes?view=chart" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>rope comparison</Link> to filter by diameter, weight, and price — then let handling feel guide the final pick.
      </KeyInsight>
    </ArticleLayout>
  );
}
