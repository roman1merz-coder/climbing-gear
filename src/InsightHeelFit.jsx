import { T } from "./tokens.js";
import usePageMeta from "./usePageMeta.js";
import useStructuredData from "./useStructuredData.js";
import {
  useIsMobile, ArticleLayout, ArticleHeader, SectionHeading,
  Prose, KeyInsight, StatCard,
} from "./InsightsShared.jsx";

/* ─── Population reference values (from spec / literature) ───
   Same distributions as shown on /scan/:id pages. */
const POP = {
  forefoot_width_ratio:  { mean: 0.383, std: 0.021 },
  arch_length_ratio:     { mean: 0.700, std: 0.025 },
  heel_width_ratio:      { mean: 0.251, std: 0.018 },
  heel_depth_ratio:      { mean: 0.035, std: 0.020 },
};
const META = {
  forefoot_width_ratio: { min: 0.31, max: 0.45, label: "Forefoot Width" },
  arch_length_ratio:    { min: 0.61, max: 0.77, label: "Arch Length" },
  heel_width_ratio:     { min: 0.20, max: 0.31, label: "Heel Width" },
  heel_depth_ratio:     { min: 0.00, max: 0.15, label: "Heel Depth" },
};

function clamp01(x) { return Math.max(0, Math.min(100, x)); }
function pctPos(val, mn, mx) { return clamp01(((val - mn) / (mx - mn)) * 100); }
function levelLabel(val, mean, std) {
  const z = (val - mean) / std;
  if (z < -0.7) return "low";
  if (z > 0.7) return "high";
  return "mid";
}
function levelColor(val, mean, std) {
  const z = Math.abs(val - mean) / std;
  if (z < 0.7) return T.green;
  if (z < 1.5) return T.yellow;
  return T.red;
}

/* ─── A single measurement bar (same style as /scan result page) ─── */
function MetricBar({ ratioKey, value }) {
  const p = POP[ratioKey]; const m = META[ratioKey];
  if (!p || !m || value == null) return null;
  const fill = pctPos(value, m.min, m.max);
  const avg = pctPos(p.mean, m.min, m.max);
  const color = levelColor(value, p.mean, p.std);
  const lbl = levelLabel(value, p.mean, p.std);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: T.text }}>{m.label}</span>
        <span style={{ fontSize: "12px", fontWeight: 700, color }}>
          {value.toFixed(3)} <span style={{ color: T.muted, fontWeight: 500 }}>({lbl})</span>
        </span>
      </div>
      <div style={{ height: 5, background: "#e8e2d6", borderRadius: 3, position: "relative" }}>
        <div style={{ height: "100%", borderRadius: 3, background: T.accent, width: `${fill}%` }} />
        <div style={{ position: "absolute", top: -3, left: `${avg}%`, width: 2, height: 11, background: "#a8a08e", borderRadius: 1, transform: "translateX(-1px)" }} title={`Population avg: ${p.mean.toFixed(3)}`} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#a8a08e" }}>
        <span>{m.min}</span><span style={{ fontSize: "9px", color: "#b8b0a0" }}>pop. avg {p.mean.toFixed(3)}</span><span>{m.max}</span>
      </div>
    </div>
  );
}

/* ─── Fit pill (empty / perfect / tight) ─── */
function FitPill({ fit }) {
  const map = {
    empty:    { label: "empty",   bg: T.redSoft,    fg: T.red },
    perfect:  { label: "perfect", bg: T.greenSoft,  fg: T.green },
    squeezed: { label: "tight",   bg: T.yellowSoft, fg: T.yellow },
    tight:    { label: "tight",   bg: T.yellowSoft, fg: T.yellow },
  };
  const s = map[fit] || { label: fit, bg: T.bg, fg: T.muted };
  return (
    <span style={{ display: "inline-block", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: s.fg, background: s.bg, padding: "2px 8px", borderRadius: 4 }}>
      {s.label}
    </span>
  );
}

/* ─── One scan card (real profile + shoes + fit outcomes) ─── */
function ScanCard({ label, oneLine, measurements, toeShape, streetSize, shoes, takeaway, tone = "accent" }) {
  const border = tone === "red" ? T.red : tone === "blue" ? T.blue : T.accent;
  return (
    <div style={{
      flex: "1 1 320px", minWidth: 280,
      background: T.surface, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${border}`,
      borderRadius: 10, padding: "16px 18px",
    }}>
      <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "1px", color: border, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: 10 }}>{oneLine}</div>

      <div style={{ fontSize: "11px", color: T.muted, marginBottom: 10 }}>
        {toeShape} toes · street size EU {streetSize}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {Object.entries(measurements).map(([k, v]) => (
          <MetricBar key={k} ratioKey={k} value={v} />
        ))}
      </div>

      <div style={{ fontSize: "11px", fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
        Shoes this climber tested
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {shoes.map((s, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: "12px" }}>
            <span style={{ color: T.text }}>
              <span style={{ color: T.muted }}>{s.brand}</span> <strong>{s.model}</strong> <span style={{ color: T.muted, fontSize: "11px" }}>· EU {s.size}</span>
            </span>
            <FitPill fit={s.heel} />
          </div>
        ))}
      </div>

      <div style={{ fontSize: "12.5px", lineHeight: 1.6, color: T.text, background: T.bg, padding: "10px 12px", borderRadius: 6 }}>
        {takeaway}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INSIGHT: What Our First 200 Foot Scans Revealed About Heel Fit
   Data derived from Supabase foot_scan_fits on 2026-04-13:
   201 scans, 280 fit observations, 97 unique shoes.
   Route live, but intentionally NOT linked from /insights hub yet.
   ═══════════════════════════════════════════════════════════════ */

export default function InsightHeelFit() {
  const isMobile = useIsMobile();

  usePageMeta(
    "What Our First 200 Foot Scans Revealed About Heel Fit — climbing-gear.com",
    "Heel fit is one of the first things climbers check, but hard to predict from a single adjective. Our scanner measures heel width and heel depth separately, then cross-references 280 real fit reports across 97 shoes to show which dimension actually drives the mismatch for each shoe.",
  );

  useStructuredData({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "What Our First 200 Foot Scans Revealed About Heel Fit",
    description: "Two measurements, one fit question, and what 280 shoe fit observations are teaching us about why climbing shoe heels don't lock in.",
    image: "https://www.climbing-gear.com/images/og-default.jpg",
    datePublished: "2026-04-13",
    author: { "@type": "Organization", name: "climbing-gear.com" },
  });

  return (
    <ArticleLayout isMobile={isMobile} breadcrumb="Heel Fit">
      <ArticleHeader
        title="What Our First 200 Foot Scans Revealed About Heel Fit"
        subtitle="Two measurements, one fit question, and what 280 shoe fit observations are teaching us."
      />

      <SectionHeading>Heel fit is hard to predict</SectionHeading>
      <Prose>
        <p>
          Climbers care about heel fit — it's one of the first things people check when they try
          on a shoe, and a loose heel is a common reason to send a pair back. The tricky part
          isn't caring, it's predicting. Heels get described with single words like "narrow" or
          "low-volume" on both the foot and the shoe side, and those words turn out to hide a lot.
          Two climbers with the same "narrow heel" can get very different results in the same
          shoe. This article is a look at why, using data from our first 200 scans.
        </p>
      </Prose>

      <SectionHeading>One measurement isn't enough</SectionHeading>
      <Prose>
        <p>
          Most sizing guides treat the heel as a single dimension: narrow, normal, or wide. That's
          like describing a climbing hold by its colour. The scanner measures two independent
          dimensions from your side photo.
        </p>
        <p>
          <strong>Heel width ratio</strong> captures how wide your heel is relative to your foot
          length. Our scans range from 0.20 (very narrow) to 0.28 (wide). The average sits around 0.23.
        </p>
        <p>
          <strong>Heel depth ratio</strong> captures the vertical profile of your heel — essentially
          how much it projects backward from your ankle. This ranges from 0.01 to 0.12, with the
          average around 0.035. A shallow heel (under 0.03) and a deep heel (over 0.05) need
          fundamentally different cup shapes, but most shoe brands only design for one.
        </p>
        <p>
          These two numbers are surprisingly independent. You can have a narrow heel with deep
          projection, or a wide heel that's shallow. They produce very different fit problems, and
          shoes respond to them differently.
        </p>
      </Prose>

      <SectionHeading>Two scans, same complaint, different cause</SectionHeading>
      <Prose>
        <p>
          Here are two real scans from our dataset. Both climbers reported an empty heel in at
          least one popular shoe. The underlying mismatch is the opposite in each case.
        </p>
      </Prose>

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", margin: "20px 0" }}>
        <ScanCard
          label="Scan A"
          oneLine="Narrow heel, normal-to-deep projection"
          toeShape="Egyptian"
          streetSize={45.5}
          measurements={{
            heel_width_ratio: 0.216,
            heel_depth_ratio: 0.047,
            forefoot_width_ratio: 0.340,
            arch_length_ratio: 0.751,
          }}
          shoes={[
            { brand: "Scarpa", model: "Drago", size: 44, heel: "empty" },
            { brand: "Scarpa", model: "Instinct VSR", size: 44, heel: "empty" },
            { brand: "La Sportiva", model: "Ondra Comp", size: 43, heel: "empty" },
            { brand: "Scarpa", model: "Instinct VSR LV", size: 44, heel: "perfect" },
            { brand: "Mad Rock", model: "D2.ONE HV", size: 46, heel: "perfect" },
          ]}
          takeaway="Heel width is well below the population average (0.216 vs 0.251). Depth is slightly above average. The three empty heels are all shoes whose cups are too wide for this climber. The low-volume Instinct VSR LV and the high-volume D2.ONE HV both grip — the standard-fit cups in the same line don't. The problem here is width, not depth."
          tone="blue"
        />
        <ScanCard
          label="Scan B"
          oneLine="Normal heel width, very shallow depth"
          toeShape="Egyptian"
          streetSize={41}
          measurements={{
            heel_width_ratio: 0.254,
            heel_depth_ratio: 0.014,
            forefoot_width_ratio: 0.397,
            arch_length_ratio: 0.731,
          }}
          shoes={[
            { brand: "La Sportiva", model: "Skwama", size: 40, heel: "empty" },
          ]}
          takeaway="Heel width sits right on the average (0.254). Heel depth is at the bottom of the distribution (0.014 vs 0.035 average). The Skwama's cup needs backward heel projection to lock in — without it, the cup sits off the back of the heel. Going narrower on width wouldn't help; this is a depth problem."
          tone="red"
        />
      </div>

      <Prose>
        <p>
          Same written complaint — "empty heel" — two different mechanisms. If you treated both
          climbers as "narrow-heeled" and pointed them at low-volume lasts, you'd help Scan A and
          make Scan B worse.
        </p>
      </Prose>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", margin: "24px 0" }}>
        <StatCard label="Foot scans" value="201" sub="as of 2026-04-13" />
        <StatCard label="Fit observations" value="280" sub="across 97 shoes" color={T.green} />
        <StatCard label="Shoes with ≥10 reports" value="4" sub="enough for clear patterns" color={T.yellow} />
      </div>

      <SectionHeading>What 280 fit observations tell us</SectionHeading>
      <Prose>
        <p>
          When someone scans their feet, they also tell us what shoes they currently climb in and
          how those shoes fit: toes, forefoot, and heel, each rated as squeezed/tight, perfect, or
          loose/empty. That lets us match real fit outcomes against measured foot geometry.
        </p>
        <p>Four shoes now have 10 or more reports. The patterns are striking:</p>
      </Prose>

      <KeyInsight>
        <strong>Scarpa Instinct VSR</strong> (13 reports) — 77% empty heels. Empty-heel users
        average heel width 0.231 (narrow) with normal depth (0.036). The two users reporting a
        perfect heel have slightly wider heels (0.239) <em>and</em> notably deeper projection
        (0.053). Both dimensions matter: narrow + shallow is where this cup fails.
      </KeyInsight>

      <KeyInsight color={T.blue}>
        <strong>La Sportiva Skwama</strong> (10 reports) — 90% empty heels. Eight of the nine
        empty-heel users have normal-to-wide heel width (avg 0.245) — they're not narrow-heeled
        people. What unites them is shallow depth (avg 0.027). The Skwama's cup is designed for a
        heel that projects further back than most climbers actually have. A pure depth story.
      </KeyInsight>

      <KeyInsight color={T.yellow}>
        <strong>Scarpa Drago</strong> (11 reports) — 55% perfect, 36% empty. Used to look like the
        universal cup. With more data a real pattern has emerged: empty-heel users average heel
        width 0.225, perfect-heel users 0.251. Forgiving on depth, but punishes narrow heels.
      </KeyInsight>

      <KeyInsight color={T.green}>
        <strong>Evolv Shaman</strong> (10 reports) — a textbook depth split. Heel width is nearly
        identical between perfect-fit (0.245) and empty-fit (0.246) users. Depth tells the whole
        story: perfect users average 0.072, empty users 0.031. A 2.3× difference. If your heel
        projects deeply, the Shaman's aggressive rand tension grips it. If it doesn't, you float.
      </KeyInsight>

      <SectionHeading>A new shape at the other end</SectionHeading>
      <Prose>
        <p>
          An interesting counterpoint is emerging in the <strong>Mad Rock D2.ONE HV</strong>
          {" "}(8 reports so far): 7 perfect heels, 1 tight, zero empty. It's marketed as a
          high-volume shoe, and that's exactly who reports wearing it — climbers with deeper, fuller
          heels who struggle in mainstream cups. It's the first shoe in our dataset where "empty
          heel" essentially doesn't show up. We'll watch it closely as the sample grows past ten.
        </p>
      </Prose>

      <SectionHeading>Two dimensions, different shoes, different answers</SectionHeading>
      <Prose>
        <p>
          This is what makes heel fit hard. The same "empty heel" complaint has completely
          different causes depending on the shoe. The Instinct VSR punishes narrow-and-shallow
          combos. The Skwama punishes shallow heels at any width. The Drago is forgiving on depth
          but punishes narrow width. The Shaman doesn't care about width at all, only depth. The
          D2.ONE HV flips the problem and asks for volume most climbers don't have. Treating "heel"
          as one variable misses the mechanism.
        </p>
        <p>
          Our scorer uses both dimensions. When it evaluates whether a shoe's heel cup will work
          for you, it weights heel width and heel depth separately, calibrated by what we've
          learned from each shoe's fit pattern. A narrow-heeled climber gets steered away from the
          Drago and Instinct VSR. A shallow-heeled climber gets warned about the Skwama and Shaman.
          Someone with deep projection and normal width sees the Shaman bubble to the top.
        </p>
      </Prose>

      <SectionHeading>Still early, getting sharper</SectionHeading>
      <Prose>
        <p>
          We have 280 observations across 97 shoes, up from 166 and 71 a week ago. That's enough
          to see clear patterns for the four most popular models, but for many shoes we still only
          have 1–2 data points. Scarpa Instinct VS, La Sportiva Theory, La Sportiva Tarantula,
          La Sportiva Solution, Scarpa Drago XT, La Sportiva Kubo, La Sportiva Ondra Comp, Scarpa
          Drago LV, and Scarpa Instinct VSR LV are all sitting in the 6–9 report range and should
          cross the ten-report line within the next few weeks. Every scan that includes a current
          shoe fit adds to what we know. The model doesn't guess: it uses what it has, flags
          uncertainty where data is thin, and gets more precise as the dataset grows.
        </p>
        <p>
          The goal isn't to replace trying shoes on. It's to narrow the field from 400+ shoes to
          the dozen that match your geometry, before you spend money on shipping or drive to a
          shop that might not stock what you need.
        </p>
      </Prose>

      <KeyInsight color={T.accent}>
        <strong>Try it yourself:</strong> <a href="/scan" style={{ color: T.accent, fontWeight: 700 }}>climbing-gear.com/scan</a>.
        Two photos, ten seconds, free.
      </KeyInsight>
    </ArticleLayout>
  );
}
