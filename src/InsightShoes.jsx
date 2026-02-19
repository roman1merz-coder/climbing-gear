import { Link } from "react-router-dom";
import { T } from "./tokens.js";
import SHOE_SEED from "./seed_data.json";
import ShoeScatterChart from "./ShoeScatterChart.jsx";
import usePageMeta from "./usePageMeta.js";
import {
  useIsMobile, ArticleLayout, ArticleHeader, SectionHeading, StatCard,
  ChartContainer, Collapsible, Prose, KeyInsight,
} from "./InsightsShared.jsx";

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
  const maxCount = 140;
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
        {[0, 35, 70, 105, 140].map(v => (
          <g key={v}>
            <line x1={pad.left} y1={pad.top + ch - (v / maxCount) * ch} x2={W - pad.right} y2={pad.top + ch - (v / maxCount) * ch} stroke={T.border} strokeDasharray="3,3" />
            <text x={pad.left - 8} y={pad.top + ch - (v / maxCount) * ch + 4} fill={T.muted} fontSize="10" textAnchor="end">{v}</text>
          </g>
        ))}
        <text x={14} y={H / 2} fill={T.muted} fontSize="11" textAnchor="middle" fontWeight="600" transform={`rotate(-90,14,${H / 2})`}>Shoe Count</text>
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

export default function InsightShoes() {
  usePageMeta(
    "How to Choose Climbing Shoes: Data-Driven Guide (340 Shoes Analysed)",
    "We scored 340 climbing shoes across 7 performance axes. Learn how downturn, rubber, and midsole affect edging, smearing, and comfort — plus what foot shape means for fit. Interactive chart and shoe finder included."
  );
  const isMobile = useIsMobile();

  return (
    <ArticleLayout isMobile={isMobile} breadcrumb="Climbing Shoe Guide">
      <ArticleHeader
        title="How We Score 340 Climbing Shoes — and How to Pick Yours"
        subtitle="Our guided search scores every shoe across 7 performance axes. Here's what the algorithm actually measures, how shoe specs translate to real-world performance, and what your foot shape means for fit."
      />

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
        <StatCard label="Database" value="340" sub="shoes from 25+ brands" color={T.accent} />
        <StatCard label="Price Gap" value="€47" sub="flat avg €109 → aggressive €156" color={T.yellow} />
        <StatCard label="Performance Axes" value="7" sub="edging · smearing · pockets · hooks · comfort · sensitivity · support" color={T.green} />
      </div>

      <SectionHeading>The Price–Downturn Connection</SectionHeading>

      <ShoePriceTeaserChart isMobile={isMobile} />

      <Prose>
        Across the 312 shoes with price data, the pattern is clear: more aggressive shapes cost more. Flat-lasted shoes average €109, moderate-downturn shoes €139, and aggressive shoes €156. That €47 gap from flat to aggressive isn't random — it reflects the precision construction, asymmetric lasts, and premium rubber compounds that high-performance shoes demand. But an expensive shoe isn't automatically the right shoe. A beginner in an aggressive €160 shoe will be less comfortable and less effective than in a flat €90 shoe that matches their skill level.
      </Prose>

      <KeyInsight color={T.yellow}>
        <strong>The best value lives in the €80–120 range.</strong> This band holds 83 shoes — more than any other bracket — including most flat-lasted all-rounders and entry-level moderate shoes. You don't need to spend €160+ to get a capable climbing shoe. What you're paying for at the top end is specialisation, not raw quality.
      </KeyInsight>

      <SectionHeading>How Our Guided Search Scores Every Shoe</SectionHeading>

      <Prose>
        Our <Link to="/find" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>Shoe Finder</Link> walks you through six questions — discipline, environment, experience, preference, foot shape, and body weight — then scores all 340 shoes out of 100 points. The scoring isn't a black box: it maps your answers to concrete specs, then rewards shoes whose construction matches what you need.
      </Prose>

      <Prose>
        The 100 points break down into eight categories. <strong>Discipline</strong> carries the most weight, matching your climbing style to ideal closure types — bouldering favours slippers and velcro for quick on/off, sport climbing suits velcro and lace, and trad climbing rewards lace-ups for all-day precision. <strong>Downturn</strong> and <strong>asymmetry</strong> use a five-tier system that combines your experience level and comfort preference into a single target profile — beginners who want comfort land at the flat/symmetric end, while advanced climbers chasing performance are pushed toward aggressive/asymmetric shapes. <strong>Midsole stiffness</strong> is tuned by both discipline and body weight: heavier climbers need more support, and trad routes demand stiffer platforms than bouldering. The remaining points go to <strong>environment</strong>, <strong>closure</strong>, <strong>rubber thickness</strong>, and <strong>foot shape</strong>.
      </Prose>

      <KeyInsight>
        <strong>The five-tier system is the core of our scoring.</strong> Your experience level (beginner → advanced) sets a base number. Your preference (comfort → performance) adds to it. The sum maps to one of five tiers — from flat/symmetric to ultra-aggressive/strong-asymmetric. This prevents beginners from being matched with painful aggressive shoes, while giving advanced climbers the full performance range.
      </KeyInsight>

      <SectionHeading>How Specs Actually Affect Performance</SectionHeading>

      <Prose>
        Beyond the Finder's scoring, we compute seven performance axes for every shoe based purely on its physical specs. These are the spider-chart values you see on each shoe's detail page. Here's what drives each one — and why certain trade-offs are unavoidable.
      </Prose>

      <Collapsible title="Edging — standing on tiny holds" defaultOpen={true}>
        <Prose>
          Edging is about transferring your weight through a small contact point. The score uses a geometric mean of <strong>rigidity</strong> (55%) and <strong>shape</strong> (45%) — you need both for a top score. Rigidity blends structural stiffness (midsole, rand tension, closure) with perceived stiffness from the shoe's feel. Shape rewards moderate-to-aggressive downturn and strong asymmetry. Hard rubber and lace closure each add smaller bonuses. The top edgers in our database all combine stiff construction with aggressive, strongly asymmetric profiles. A flat shoe can have great stiffness but still score low because it lacks the shape component; conversely, a soft aggressive shoe has shape but not rigidity.
        </Prose>
      </Collapsible>

      <Collapsible title="Smearing — friction on flat rock">
        <Prose>
          Smearing is the opposite story. <strong>Conformability</strong> dominates (72% of the score) — an equal blend of rubber softness and structural flexibility (low stiffness), because the foot needs to deform around the rock surface. Rubber thickness is the next biggest factor (20%), especially when the rubber is soft, because more material can mould to the surface. Flat shape with no asymmetry adds a small bonus (8%). The ideal smearer: soft rubber, soft feel, no midsole, flat profile. Top scorers are all soft, minimal shoes with no midsole. Stiffer shoes score poorly here despite a flat profile, because a full midsole and stiff-moderate feel kill conformability.
        </Prose>
      </Collapsible>

      <Collapsible title="Pockets — hooking toes into holes">
        <Prose>
          Pocket performance needs a curled, stiff toe that can hook into small openings. Downturn and asymmetry are the biggest drivers, followed by toe patch coverage, perceived stiffness, closure, and rubber hardness. Aggressive, asymmetric shoes with a full toe patch dominate — but interestingly, slippers score higher for closure here than lace-ups, because the flexible upper lets the toe curl more naturally into pockets.
        </Prose>
      </Collapsible>

      <Collapsible title="Hooks & heel/toe performance">
        <Prose>
          Hooking requires rubber coverage more than anything else. Heel rubber coverage is the biggest factor, followed by toe patch, downturn, sensitivity, and closure. Soft-feeling shoes score higher on the sensitivity component — they transmit feedback from the rock, helping you feel whether a heel hook is secure. Slippers again score well for closure: their flexibility lets you wrap the shoe around features.
        </Prose>
      </Collapsible>

      <Collapsible title="Sensitivity — feeling the rock through your shoe">
        <Prose>
          Sensitivity measures rock feedback reaching your foot. It's driven by structural flexibility, soft feel, thin rubber, rubber softness, minimal midsole, and light weight. Notice the tension with edging: the specs that maximise sensitivity (thin, soft, no midsole) are exactly the ones that minimise stiffness. This is the fundamental climbing shoe trade-off — you can't have maximum edging <em>and</em> maximum sensitivity in the same shoe.
        </Prose>
      </Collapsible>

      <Collapsible title="Comfort & Support — the other side of the coin">
        <Prose>
          Comfort blends soft feel, flat downturn, gentle asymmetry, upper material (leather scores highest), closure convenience, light weight, midsole cushioning, and rubber thickness. <strong>Support</strong> is essentially the inverse of sensitivity: stiff feel, hard rubber, thick soles, full midsole, and lace closure all maximise it. For multi-pitch trad routes, support prevents foot fatigue over hours of climbing. For bouldering sessions, comfort matters more for the time between attempts than during the climb itself.
        </Prose>
      </Collapsible>

      <KeyInsight color={T.green}>
        <strong>The central trade-off in every climbing shoe:</strong> sensitivity vs. support, and smearing vs. edging. A shoe that scores 90th percentile on edging will typically sit below 30th on smearing. A shoe built for maximum sensitivity sacrifices support. Understanding this trade-off is more important than chasing the "best" shoe — because the best shoe is the one that matches <em>your</em> climbing style. The chart below maps all 340 shoes into six zones — toggle "Zones" to see where each archetype lives.
      </KeyInsight>

      <SectionHeading>Why Foot Shape Matters More Than You Think</SectionHeading>

      <Prose>
        Of our 331 adult shoes, the majority have an Egyptian last — longest big toe, tapering down. About a third use a Roman (square) last with the first 2–3 toes roughly equal. Only a handful target a Greek (Morton's) foot where the second toe is longest. If you have Greek toes, your options are genuinely limited, and choosing a mismatched last will cause hot spots and pain regardless of how well the shoe scores on performance.
      </Prose>

      <Prose>
        Width and volume matter just as much. Most shoes have a medium heel volume, while roughly a third are narrow. If you have wide heels, only a small fraction of shoes in our database will fit comfortably — and no amount of break-in will fix a heel cup that's fundamentally too narrow. Similarly, most shoes target a standard forefoot volume, with far fewer options for low-volume or high-volume forefeet. Our Finder rewards foot shape matches, but the more important role of foot data is <em>filtering out</em> shoes that will never fit.
      </Prose>

      <KeyInsight color={T.blue}>
        <strong>Know your foot before you shop.</strong> Stand on a piece of paper, trace your foot, and identify your toe form (Egyptian, Roman, or Greek). Try on shoes at a local shop to learn your width and volume. Then use these parameters in our <Link to="/find" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>Shoe Finder</Link> — they'll eliminate mismatches before you ever look at performance scores.
      </KeyInsight>

      <SectionHeading>Explore the Full Shoe Database</SectionHeading>

      <Prose>
        The scatter chart below defaults to Edging vs Sensitivity with six annotated zones. Green dots are beginner-to-intermediate shoes, orange dots are advanced-to-elite. Each zone corresponds to a distinct shoe archetype — hover the zone cards below the chart for details. Switch metrics, change the colour mode, and click any dot to see the full spec sheet.
      </Prose>

      <ShoeScatterChart shoes={SHOE_SEED} isMobile={isMobile} insightsMode />

      <div style={{ marginTop: "20px" }}>
        <Link to="/find" style={{
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
    </ArticleLayout>
  );
}
