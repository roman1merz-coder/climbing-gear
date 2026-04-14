import { T } from "./tokens.js";
import usePageMeta from "./usePageMeta.js";
import useStructuredData from "./useStructuredData.js";
import {
  useIsMobile, ArticleLayout, ArticleHeader, SectionHeading,
  Prose, KeyInsight, StatCard,
} from "./InsightsShared.jsx";

/* ─── Population reference (kept in sync with ScanResult.jsx POP) ───
   Tertile calibration from ~200-scan dataset. `lo`/`hi` are the
   low/mid and mid/high tertile boundaries. `mean` ± 3σ defines the
   visible slider bounds. */
const POP = {
  heel_width_ratio: { mean: 0.238, std: 0.022, lo: 0.228, hi: 0.245 },
  heel_depth_ratio: { mean: 0.034, std: 0.020, lo: 0.028, hi: 0.041 },
};
const META = {
  heel_width_ratio: { label: "Heel Width" },
  heel_depth_ratio: { label: "Heel Depth" },
};
const VISUAL_SIGMA = 3;

function sectionPct(val, min, lo, hi, max) {
  if (val <= lo) {
    const span = lo - min;
    const t = span > 0 ? (val - min) / span : 0.5;
    return Math.max(0, Math.min(1, t)) * 33.333;
  }
  if (val <= hi) {
    const span = hi - lo;
    const t = span > 0 ? (val - lo) / span : 0.5;
    return 33.333 + Math.max(0, Math.min(1, t)) * 33.334;
  }
  const span = max - hi;
  const t = span > 0 ? (val - hi) / span : 0.5;
  return 66.667 + Math.max(0, Math.min(1, t)) * 33.333;
}
function levelLabel(val, lo, hi) {
  if (val < lo) return "low";
  if (val > hi) return "high";
  return "mid";
}
function levelColor(lbl) {
  if (lbl === "low")  return T.accent;
  if (lbl === "high") return T.accent;
  return T.green || "#6a8a4f";
}

/* ─── New tertile-band MetricBar (mirrors ScanResult.jsx) ─── */
function MetricBar({ ratioKey, value }) {
  const p = POP[ratioKey]; const m = META[ratioKey];
  if (!p || !m || value == null) return null;
  const lo = p.lo, hi = p.hi;
  const vmin = Math.max(0, p.mean - VISUAL_SIGMA * p.std);
  const vmax = p.mean + VISUAL_SIGMA * p.std;
  const pos = sectionPct(value, vmin, lo, hi, vmax);
  const lbl = levelLabel(value, lo, hi);
  const col = levelColor(lbl);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: T.text }}>{m.label}</span>
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: col }}>{lbl}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, position: "relative", overflow: "visible" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ flex: 1, background: "#ece5d4" }} />
          <div style={{ flex: 1, background: "#d6cdb4", borderLeft: "1px solid #c4b99a", borderRight: "1px solid #c4b99a" }} />
          <div style={{ flex: 1, background: "#ece5d4" }} />
        </div>
        <div
          title={value.toFixed(3)}
          style={{
            position: "absolute", top: -3, left: `${pos}%`,
            transform: "translateX(-50%)",
            width: 4, height: 14, background: col, borderRadius: 2,
            boxShadow: "0 0 0 1.5px #fff",
          }}
        />
      </div>
      <div style={{ display: "flex", fontSize: "0.58rem", color: "#a8a08e", textTransform: "lowercase" }}>
        <span style={{ flex: 1, textAlign: "left" }}>low</span>
        <span style={{ flex: 1, textAlign: "center" }}>mid</span>
        <span style={{ flex: 1, textAlign: "right" }}>high</span>
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

/* ─── One scan card ─── */
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

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {Object.entries(measurements).map(([k, v]) => (
          <MetricBar key={k} ratioKey={k} value={v} />
        ))}
      </div>

      <div style={{ fontSize: "11px", fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
        Heel feedback from this climber
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
   ═══════════════════════════════════════════════════════════════ */

export default function InsightHeelFit() {
  const isMobile = useIsMobile();

  usePageMeta(
    "What Our First 200 Foot Scans Revealed About Heel Fit — climbing-gear.com",
    "Heel fit is hard to predict from a single adjective. Our scanner measures heel width and heel depth separately, then cross-references 280 fit reports across 97 shoes to show which dimension drives the mismatch for each shoe.",
  );

  useStructuredData({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "What Our First 200 Foot Scans Revealed About Heel Fit",
    description: "Two measurements, one fit question, and how we keep iterating heel fit.",
    image: "https://www.climbing-gear.com/images/og-default.jpg",
    datePublished: "2026-04-13",
    dateModified: "2026-04-14",
    author: { "@type": "Organization", name: "climbing-gear.com" },
  });

  return (
    <ArticleLayout isMobile={isMobile} breadcrumb="Heel Fit">
      <ArticleHeader
        title="What Our First 200 Foot Scans Revealed About Heel Fit"
        subtitle="Two measurements, one fit question, and how we keep iterating heel fit."
      />

      <SectionHeading>Heel fit is hard to predict</SectionHeading>
      <Prose>
        <p>
          Heel fit is key to climbing shoe performance, especially for hard boulders where a
          subtle better fit and hence less slip on aggressive heel hooks makes a big difference.
          Yet, it's incredibly hard to pick the right heel from today's available online
          descriptions. Climbing shoes get often described with single words like "narrow" or
          "low-volume" on both the forefoot and the heel side, and those words turn out to hide a
          lot. Two climbers with the same "narrow heel" can get very different results in the
          same shoe. This article is a look at why, breaking down heel width and depth using data
          from our first 200 scans.
        </p>
      </Prose>

      <SectionHeading>One measurement isn't enough</SectionHeading>
      <Prose>
        <p>
          Sizing guides often treat the heel as a single dimension: narrow, normal, or wide.
          That's simply not enough. Our scanner explicitly captures two photos, sole and side, to
          measure two completely independent dimensions.
        </p>
        <p>
          <strong>Heel width ratio</strong> captures how wide your heel is relative to your foot
          length. Our scans range from 0.20 (very narrow) to 0.28 (wide). The average sits around 0.24.
        </p>
        <p>
          <strong>Heel depth ratio</strong> captures the vertical profile of your heel — essentially
          how much it projects backward from your ankle. This ranges from 0.01 to 0.12, with the
          average around 0.035. A shallow heel (under 0.03) and a deep heel (over 0.05) need
          fundamentally different cup shapes.
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
          oneLine="Narrow heel width with average depth"
          toeShape="Egyptian"
          streetSize={45.5}
          measurements={{
            heel_width_ratio: 0.216,
            heel_depth_ratio: 0.047,
          }}
          shoes={[
            { brand: "Scarpa", model: "Drago", size: 44, heel: "empty" },
            { brand: "Scarpa", model: "Instinct VSR", size: 44, heel: "empty" },
            { brand: "La Sportiva", model: "Ondra Comp", size: 43, heel: "empty" },
            { brand: "Scarpa", model: "Instinct VSR LV", size: 44, heel: "perfect" },
            { brand: "Mad Rock", model: "D2.ONE HV", size: 46, heel: "perfect" },
          ]}
          takeaway="Heel width is well below the population average (climber 0.216 vs population 0.238). Depth is slightly above average. The three empty heels are all shoes whose cups are too wide for this climber. The low-volume Instinct VSR LV and the high-volume D2.ONE HV with rather narrow heel both grip, the standard-fit heels don't. The problem here is clearly width, not depth."
          tone="blue"
        />
        <ScanCard
          label="Scan B"
          oneLine="Shallow heel depth with average width"
          toeShape="Egyptian"
          streetSize={42.5}
          measurements={{
            heel_width_ratio: 0.251,
            heel_depth_ratio: 0.024,
          }}
          shoes={[
            { brand: "La Sportiva", model: "Skwama", size: 39.5, heel: "empty" },
            { brand: "La Sportiva", model: "TC Pro", size: 41, heel: "empty" },
            { brand: "Evolv", model: "Shaman", size: 42.5, heel: "empty" },
            { brand: "Tenaya", model: "Mastia", size: 39.5, heel: "perfect" },
          ]}
          takeaway="Heel width is around the population average (climber 0.251 vs population 0.238), while heel depth is clearly below (0.024 vs 0.034). Three shoes report empty heels and only the Tenaya Mastia, which uses a pre-shaped and rather firm heel cup, locks in. Going narrower on width wouldn't help any of the empty-heel shoes; this is a depth problem."
          tone="red"
        />
      </div>

      <Prose>
        <p>
          Same written complaint "empty heel" but two different mechanisms. If you treated both
          climbers as "narrow-heeled" and pointed them at low-volume lasts, you'd help Scan A and
          make Scan B worse.
        </p>
        <p>
          There is a wrinkle on the Scan B side. The one shoe that gripped was the Tenaya Mastia,
          whose heel cup is pre-shaped from a firm, thermo-molded rubber shell, meaning the cup
          holds its own form. The La Sportiva Solution uses the same idea: a firm, bulbous molded
          cup reinforced by P3 randing. Both of our other shallow-heel scans who wear the Solution
          (heel depth 0.021 and 0.024) also report perfect heel fit. Three out of three shallow
          heels in firm pre-formed cups land on "perfect" is a small sample, but it is a
          consistent one — we'll keep watching it.
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
        <strong>Scarpa Instinct VSR</strong> (13 reports): 77% empty heels. Empty-heel users
        average heel width 0.231 (narrow) with normal depth (0.036). The two users reporting a
        perfect heel have slightly wider heels (0.239) <em>and</em> notably deeper projection
        (0.053). Both dimensions seem to matter: narrow + shallow is where this cup fails.
      </KeyInsight>

      <KeyInsight color={T.blue}>
        <strong>La Sportiva Skwama</strong> (10 reports): 90% empty heels. Eight of the nine
        empty-heel users have normal-to-wide heel width (avg 0.245) — they're not narrow-heeled.
        What unites them is shallow depth (avg 0.027). Worth noting: the Skwama also uses a 3D
        molded heel cup, but a notably softer one than the Mastia or Solution. Its reinforcement
        (La Sportiva's "S-Heel") is a stiffener on the sides of the cup, not a firm backwards
        shell. So "3D molded" alone doesn't guarantee a shallow heel will grip — cup firmness
        matters too.
      </KeyInsight>

      <KeyInsight color={T.yellow}>
        <strong>Scarpa Drago</strong> (11 reports): 55% perfect, 36% empty. Empty-heel users
        average heel width 0.225, perfect-heel users 0.251 with quite mixed heel depth. Apparently
        forgiving on depth, but not a good fit for narrow heels.
      </KeyInsight>

      <KeyInsight color={T.green}>
        <strong>Evolv Shaman</strong> (10 reports): a textbook depth split. Heel width is nearly
        identical between perfect-fit (0.245) and empty-fit (0.246) users. Depth tells the whole
        story: perfect users average 0.072, empty users 0.031. A 2.3× difference. If your heel
        projects deeply, the Shaman's aggressive rand tension grips it. If it doesn't, you float.
      </KeyInsight>

      <SectionHeading>A new shape emerging?</SectionHeading>
      <Prose>
        <p>
          An interesting counterpoint is emerging in the <strong>Mad Rock D2.ONE HV</strong>
          {" "}(8 reports so far): 7 perfect heels, 1 tight, zero empty. It's marketed as a
          high-volume shoe yet has a rather narrow heel cup. The first shoe in our dataset where
          "empty heel" essentially doesn't show up. We'll watch it closely as the sample grows.
        </p>
      </Prose>

      <SectionHeading>Two dimensions, different shoes, different answers</SectionHeading>
      <Prose>
        <p>
          This is what makes heel fit hard. The same "empty heel" complaint has completely
          different causes depending on the shoe and foot, but standard manufacturer descriptions
          often rely on a single generic fit aspect. Treating "heel" as one variable misses the
          mechanism.
        </p>
        <p>
          Hence, our scorer uses two dimensions. When it evaluates whether a shoe's heel cup will
          work for you, it weights heel width and heel depth separately, calibrated by what we've
          learned from each shoe's fit pattern. We're also starting to tag shoes by heel-cup
          construction — firm pre-formed cups (Solution, Mastia) versus soft/thin cups with side
          reinforcement (Skwama) — because the same shallow-heel foot gets opposite outcomes
          depending on which type it meets. Moving forward we also want to introduce a proper 3D
          modelled heel to identify additional patterns and improve the quality of our
          recommendations.
        </p>
      </Prose>

      <SectionHeading>Still early, getting sharper</SectionHeading>
      <Prose>
        <p>
          We have performed 200 scans so far — enough to see first patterns for the four most
          popular models, but for many shoes we still only have 1–2 data points. Incoming scans
          are growing rapidly and every scan that includes a current shoe fit adds to our
          recommendation engine. The model doesn't guess: it uses what it has, flags uncertainty
          where data is thin, and gets more precise as the dataset grows.
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
