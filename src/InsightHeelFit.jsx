import { Link } from "react-router-dom";
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
              <span style={{ color: T.muted }}>{s.brand}</span>{" "}
              {s.slug
                ? <Link to={`/shoe/${s.slug}`} style={{ color: T.text, textDecoration: "none", fontWeight: 700 }}><strong>{s.model}</strong></Link>
                : <strong>{s.model}</strong>}
              <span style={{ color: T.muted, fontSize: "11px" }}> · EU {s.size}</span>
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

/* ─── Small shoe link helper ─── */
const S = ({ slug, children }) => (
  <Link to={`/shoe/${slug}`} style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "rgba(0,0,0,0.25)", textUnderlineOffset: "2px" }}>
    {children}
  </Link>
);

/* ─── Comparison table ─── */
function HeelFitTable() {
  const rows = [
    { slug: "scarpa-instinct-vsr-mens", shoe: "Scarpa Instinct VSR",  n: 13, pct: "23%", driver: "Narrow + shallow heels fail", fits: "Wider, deeper heels" },
    { slug: "la-sportiva-skwama",       shoe: "La Sportiva Skwama",    n: 10, pct: "10%", driver: "Shallow depth fails (soft 3D cup)", fits: "Deeper heels, any width" },
    { slug: "scarpa-drago",             shoe: "Scarpa Drago",          n: 11, pct: "55%", driver: "Narrow heels fail; depth-tolerant", fits: "Average-to-wide heels" },
    { slug: "evolv-shaman",             shoe: "Evolv Shaman",          n: 10, pct: "50%", driver: "Depth is everything (2.3× split)", fits: "Deep-projecting heels" },
  ];
  const cellStyle = { padding: "8px 10px", borderBottom: `1px solid ${T.border}`, fontSize: "12.5px", lineHeight: 1.5, verticalAlign: "top" };
  const hcell = { ...cellStyle, fontSize: "11px", fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: T.muted, background: T.bg };
  return (
    <div style={{ overflowX: "auto", margin: "16px 0 8px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8 }}>
        <caption style={{ captionSide: "bottom", fontSize: "11px", color: T.muted, textAlign: "left", padding: "8px 10px 0" }}>
          Source: climbing-gear.com foot-scan dataset, 280 fit reports as of 2026-04-13.
        </caption>
        <thead>
          <tr>
            <th style={hcell}>Shoe</th>
            <th style={hcell}>Reports</th>
            <th style={hcell}>Perfect heel</th>
            <th style={hcell}>Dominant fit driver</th>
            <th style={hcell}>Fits best</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug}>
              <td style={cellStyle}>
                <Link to={`/shoe/${r.slug}`} style={{ color: T.text, fontWeight: 700, textDecoration: "none" }}>{r.shoe}</Link>
              </td>
              <td style={cellStyle}>{r.n}</td>
              <td style={cellStyle}>{r.pct}</td>
              <td style={cellStyle}>{r.driver}</td>
              <td style={cellStyle}>{r.fits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── FAQ block (visible on page + matches JSON-LD) ─── */
function FAQ() {
  const items = [
    {
      q: "Why does my climbing shoe heel feel empty?",
      a: "An empty heel almost always comes down to one of two independent mismatches between your foot and the shoe's heel cup: heel width (how wide your heel is relative to your foot length) or heel depth (how far your heel projects backward from your ankle). A single adjective like \"narrow heel\" hides which one is actually wrong. In the climbing-gear.com foot-scan dataset (April 2026), the Scarpa Instinct VSR, La Sportiva Skwama, Scarpa Drago and Evolv Shaman each fail for different reasons.",
    },
    {
      q: "Which climbing shoes fit narrow heels?",
      a: "Based on climbing-gear.com foot-scan data, the best bets for narrow heels (heel width ratio under ~0.23) are the Scarpa Instinct VSR LV and the Mad Rock D2.ONE HV. The Instinct VSR LV is specifically narrowed through the heel; the D2.ONE HV is unusual in pairing a high-volume last with a rather narrow heel cup. Standard-width cups from Scarpa Drago, Scarpa Instinct VSR, and La Sportiva Ondra Comp often leave narrow heels empty.",
    },
    {
      q: "Which climbing shoes fit shallow heels?",
      a: "Shoes with firm, pre-shaped heel cups work best for shallow heels (heel depth ratio under ~0.03). In our dataset, the Tenaya Mastia and La Sportiva Solution both lock shallow heels in because their molded rubber shells hold their own form, rather than relying on rand tension to pull flat rubber tight. Shoes that consistently fail on shallow heels include the La Sportiva Skwama (90% empty), Evolv Shaman, and La Sportiva TC Pro.",
    },
    {
      q: "Does the Scarpa Instinct VSR fit narrow heels?",
      a: "Not reliably. Across 13 reports, the Scarpa Instinct VSR produced empty heels in 77% of cases, concentrated on climbers with heel width below 0.23 and normal-to-shallow depth. The low-volume Scarpa Instinct VSR LV is a much better choice for narrow heels.",
    },
    {
      q: "Does the La Sportiva Skwama fit shallow heels?",
      a: "No. Across 10 reports, the Skwama produced empty heels in 90% of cases, and the pattern is clearly shallow depth rather than narrow width. The Skwama's \"S-Heel\" reinforcement is a side stiffener, not a firm rear shell, so a shallow heel can't generate enough rearward pressure to fill the cup.",
    },
    {
      q: "What's the difference between a narrow heel and a shallow heel?",
      a: "Heel width is how wide your heel is relative to foot length (population average ~0.24). Heel depth is how far your heel projects backward from your ankle (population average ~0.034). They're largely independent: you can have a narrow heel with deep projection, or a wide heel that's shallow. Each needs a different cup shape, which is why single-adjective descriptions like \"narrow heel\" aren't enough.",
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "12px 0" }}>
      {items.map((it, i) => (
        <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 16px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 800, color: T.text, margin: "0 0 8px" }}>{it.q}</h3>
          <p style={{ fontSize: "13.5px", color: T.text, lineHeight: 1.65, margin: 0 }}>{it.a}</p>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INSIGHT: Climbing Shoe Heel Fit — narrow vs. shallow heels
   Data derived from Supabase foot_scan_fits on 2026-04-13:
   201 scans, 280 fit observations, 97 unique shoes.
   ═══════════════════════════════════════════════════════════════ */

const TITLE_TAG = "Climbing Shoe Heel Fit: Narrow vs. Shallow Heels (Data from 200 Scans) | climbing-gear.com";
const H1 = "Climbing Shoe Heel Fit: Why \"Narrow Heel\" Isn't Enough";
const SUBTITLE = "Narrow heel or shallow heel? The same \"empty heel\" complaint has two completely different causes — and different shoes fix each one.";
const META_DESC = "Empty heel in your climbing shoe? It's usually one of two things: narrow heel width or shallow heel depth. We analysed 280 fit reports across 97 shoes to show which dimension drives the mismatch for the Skwama, Instinct VSR, Drago, Shaman, Mastia, Solution and more.";

const FAQ_ITEMS_SCHEMA = [
  ["Why does my climbing shoe heel feel empty?", "An empty heel almost always comes down to one of two independent mismatches between your foot and the shoe's heel cup: heel width (how wide your heel is relative to your foot length) or heel depth (how far your heel projects backward from your ankle). A single adjective like \"narrow heel\" hides which one is actually wrong. In the climbing-gear.com foot-scan dataset (April 2026), the Scarpa Instinct VSR, La Sportiva Skwama, Scarpa Drago and Evolv Shaman each fail for different reasons."],
  ["Which climbing shoes fit narrow heels?", "Based on climbing-gear.com foot-scan data, the best bets for narrow heels (heel width ratio under ~0.23) are the Scarpa Instinct VSR LV and the Mad Rock D2.ONE HV. The Instinct VSR LV is specifically narrowed through the heel; the D2.ONE HV is unusual in pairing a high-volume last with a rather narrow heel cup. Standard-width cups from Scarpa Drago, Scarpa Instinct VSR, and La Sportiva Ondra Comp often leave narrow heels empty."],
  ["Which climbing shoes fit shallow heels?", "Shoes with firm, pre-shaped heel cups work best for shallow heels (heel depth ratio under ~0.03). In our dataset, the Tenaya Mastia and La Sportiva Solution both lock shallow heels in because their molded rubber shells hold their own form, rather than relying on rand tension to pull flat rubber tight. Shoes that consistently fail on shallow heels include the La Sportiva Skwama (90% empty), Evolv Shaman, and La Sportiva TC Pro."],
  ["Does the Scarpa Instinct VSR fit narrow heels?", "Not reliably. Across 13 reports, the Scarpa Instinct VSR produced empty heels in 77% of cases, concentrated on climbers with heel width below 0.23 and normal-to-shallow depth. The low-volume Scarpa Instinct VSR LV is a much better choice for narrow heels."],
  ["Does the La Sportiva Skwama fit shallow heels?", "No. Across 10 reports, the Skwama produced empty heels in 90% of cases, and the pattern is clearly shallow depth rather than narrow width. The Skwama's \"S-Heel\" reinforcement is a side stiffener, not a firm rear shell, so a shallow heel can't generate enough rearward pressure to fill the cup."],
  ["What's the difference between a narrow heel and a shallow heel?", "Heel width is how wide your heel is relative to foot length (population average ~0.24). Heel depth is how far your heel projects backward from your ankle (population average ~0.034). They're largely independent: you can have a narrow heel with deep projection, or a wide heel that's shallow. Each needs a different cup shape, which is why single-adjective descriptions like \"narrow heel\" aren't enough."],
];

export default function InsightHeelFit() {
  const isMobile = useIsMobile();

  usePageMeta(TITLE_TAG, META_DESC);

  useStructuredData({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": "https://www.climbing-gear.com/insights/heel-fit#article",
        headline: H1,
        alternativeHeadline: "What 200 foot scans reveal about heel width vs. heel depth",
        description: META_DESC,
        image: "https://www.climbing-gear.com/og-image.png",
        datePublished: "2026-04-13",
        dateModified: "2026-04-14",
        inLanguage: "en",
        wordCount: 1400,
        about: [
          { "@type": "Thing", name: "Climbing shoe heel fit" },
          { "@type": "Thing", name: "Climbing shoes" },
          { "@type": "Thing", name: "Foot scanning" },
        ],
        keywords: "climbing shoe heel fit, narrow heel climbing shoes, shallow heel climbing shoes, empty heel climbing shoe, heel width, heel depth, Scarpa Instinct VSR, La Sportiva Skwama, Tenaya Mastia, La Sportiva Solution, Evolv Shaman",
        mentions: [
          { "@type": "Product", name: "Scarpa Instinct VSR", url: "https://www.climbing-gear.com/shoe/scarpa-instinct-vsr-mens" },
          { "@type": "Product", name: "Scarpa Instinct VSR LV", url: "https://www.climbing-gear.com/shoe/scarpa-instinct-vsr-lv" },
          { "@type": "Product", name: "Scarpa Drago", url: "https://www.climbing-gear.com/shoe/scarpa-drago" },
          { "@type": "Product", name: "La Sportiva Skwama", url: "https://www.climbing-gear.com/shoe/la-sportiva-skwama" },
          { "@type": "Product", name: "La Sportiva Solution", url: "https://www.climbing-gear.com/shoe/la-sportiva-solution-mens" },
          { "@type": "Product", name: "La Sportiva TC Pro", url: "https://www.climbing-gear.com/shoe/la-sportiva-tc-pro" },
          { "@type": "Product", name: "La Sportiva Ondra Comp", url: "https://www.climbing-gear.com/shoe/la-sportiva-ondra-comp" },
          { "@type": "Product", name: "Tenaya Mastia", url: "https://www.climbing-gear.com/shoe/tenaya-mastia" },
          { "@type": "Product", name: "Evolv Shaman", url: "https://www.climbing-gear.com/shoe/evolv-shaman" },
          { "@type": "Product", name: "Mad Rock D2.ONE HV", url: "https://www.climbing-gear.com/shoe/mad-rock-d2-one-hv" },
        ],
        author: { "@type": "Organization", name: "climbing-gear.com", url: "https://www.climbing-gear.com" },
        publisher: {
          "@type": "Organization",
          name: "climbing-gear.com",
          url: "https://www.climbing-gear.com",
          logo: { "@type": "ImageObject", url: "https://www.climbing-gear.com/og-image.png" },
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": "https://www.climbing-gear.com/insights/heel-fit" },
      },
      {
        "@type": "FAQPage",
        "@id": "https://www.climbing-gear.com/insights/heel-fit#faq",
        mainEntity: FAQ_ITEMS_SCHEMA.map(([q, a]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  });

  return (
    <ArticleLayout isMobile={isMobile} breadcrumb="Heel Fit">
      <ArticleHeader title={H1} subtitle={SUBTITLE} />

      <SectionHeading>Why climbing shoe heel fit is hard to predict</SectionHeading>
      <Prose>
        <p>
          Heel fit is key to climbing shoe performance, especially for hard boulders where a
          subtle better fit, and hence less slip on aggressive heel hooks, makes a big difference.
          Yet, it's incredibly hard to pick the right heel from today's available online
          descriptions. Climbing shoes get often described with single words like "narrow" or
          "low-volume" on both the forefoot and the heel side, and those words turn out to hide a
          lot. Two climbers with the same "narrow heel" can get very different results in the
          same shoe. This article breaks down heel width and heel depth using data from our first
          200 foot scans.
        </p>
      </Prose>

      <SectionHeading>Heel width vs. heel depth: two independent dimensions</SectionHeading>
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
          <strong>Heel depth ratio</strong> captures the vertical profile of your heel, essentially
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

      <SectionHeading>Narrow heel vs. shallow heel: two climbers, two causes</SectionHeading>
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
          measurements={{ heel_width_ratio: 0.216, heel_depth_ratio: 0.047 }}
          shoes={[
            { brand: "Scarpa", model: "Drago", slug: "scarpa-drago", size: 44, heel: "empty" },
            { brand: "Scarpa", model: "Instinct VSR", slug: "scarpa-instinct-vsr-mens", size: 44, heel: "empty" },
            { brand: "La Sportiva", model: "Ondra Comp", slug: "la-sportiva-ondra-comp", size: 43, heel: "empty" },
            { brand: "Scarpa", model: "Instinct VSR LV", slug: "scarpa-instinct-vsr-lv", size: 44, heel: "perfect" },
            { brand: "Mad Rock", model: "D2.ONE HV", slug: "mad-rock-d2-one-hv", size: 46, heel: "perfect" },
          ]}
          takeaway="Heel width is well below the population average (climber 0.216 vs population 0.238). Depth is slightly above average. The three empty heels are all shoes whose cups are too wide for this climber. The low-volume Instinct VSR LV and the high-volume D2.ONE HV with its rather narrow heel both grip, the standard-fit heels don't. The problem here is clearly width, not depth."
          tone="blue"
        />
        <ScanCard
          label="Scan B"
          oneLine="Shallow heel depth with average width"
          toeShape="Egyptian"
          streetSize={42.5}
          measurements={{ heel_width_ratio: 0.251, heel_depth_ratio: 0.024 }}
          shoes={[
            { brand: "La Sportiva", model: "Skwama", slug: "la-sportiva-skwama", size: 39.5, heel: "empty" },
            { brand: "La Sportiva", model: "TC Pro", slug: "la-sportiva-tc-pro", size: 41, heel: "empty" },
            { brand: "Evolv", model: "Shaman", slug: "evolv-shaman", size: 42.5, heel: "empty" },
            { brand: "Tenaya", model: "Mastia", slug: "tenaya-mastia", size: 39.5, heel: "perfect" },
          ]}
          takeaway="Heel width is around the population average (climber 0.251 vs population 0.238), while heel depth is clearly below (0.024 vs 0.034). Three shoes report empty heels and only the Tenaya Mastia, which uses a pre-shaped and rather firm heel cup, locks in. Going narrower on width wouldn't help any of the empty-heel shoes; this is a depth problem."
          tone="red"
        />
      </div>

      <Prose>
        <p>
          Same written complaint, "empty heel", but two different mechanisms. If you treated both
          climbers as "narrow-heeled" and pointed them at low-volume lasts, you'd help Scan A and
          make Scan B worse.
        </p>
        <p>
          There is a wrinkle on the Scan B side. The one shoe that gripped was the{" "}
          <S slug="tenaya-mastia">Tenaya Mastia</S>, whose heel cup is pre-shaped from a firm,
          thermo-molded rubber shell, meaning the cup holds its own form. The{" "}
          <S slug="la-sportiva-solution-mens">La Sportiva Solution</S> uses the same idea: a firm,
          bulbous molded cup reinforced by P3 randing. Both of our other shallow-heel scans who
          wear the Solution (heel depth 0.021 and 0.024) also report perfect heel fit. Three out
          of three shallow heels in firm pre-formed cups landing on "perfect" is a small sample,
          but it is a consistent one, we'll keep watching it.
        </p>
      </Prose>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", margin: "24px 0" }}>
        <StatCard label="Foot scans" value="201" sub="as of 2026-04-13" />
        <StatCard label="Fit observations" value="280" sub="across 97 shoes" color={T.green} />
        <StatCard label="Shoes with ≥10 reports" value="4" sub="enough for clear patterns" color={T.yellow} />
      </div>

      <SectionHeading>Which climbing shoes fit which heel shapes? (Data from 280 reports)</SectionHeading>
      <Prose>
        <p>
          When someone scans their feet, they also tell us what shoes they currently climb in and
          how those shoes fit: toes, forefoot, and heel, each rated as squeezed/tight, perfect, or
          loose/empty. That lets us match real fit outcomes against measured foot geometry. The
          table below summarises heel-fit patterns for every shoe in the dataset with more than 10
          fit reports.
        </p>
      </Prose>

      <HeelFitTable />

      <Prose>
        <p>Four shoes now have 10 or more reports. The per-shoe patterns:</p>
      </Prose>

      <div id="scarpa-instinct-vsr-heel-fit">
        <KeyInsight>
          <strong><S slug="scarpa-instinct-vsr-mens">Scarpa Instinct VSR</S></strong>{" "}
          (13 reports): 77% empty heels. Empty-heel users average heel width 0.231 (narrow) with
          normal depth (0.036). The two users reporting a perfect heel have slightly wider heels
          (0.239) <em>and</em> notably deeper projection (0.053). Both dimensions seem to matter:
          narrow + shallow is where this cup fails.
        </KeyInsight>
      </div>

      <div id="la-sportiva-skwama-heel-fit">
        <KeyInsight color={T.blue}>
          <strong><S slug="la-sportiva-skwama">La Sportiva Skwama</S></strong>{" "}
          (10 reports): 90% empty heels. Eight of the nine empty-heel users have normal-to-wide
          heel width (avg 0.245), they're not narrow-heeled. What unites them is shallow depth
          (avg 0.027). Worth noting: the Skwama also uses a 3D molded heel cup, but a notably
          softer one than the Mastia or Solution. Its reinforcement (La Sportiva's "S-Heel") is a
          stiffener on the sides of the cup, not a firm backwards shell. So "3D molded" alone
          doesn't guarantee a shallow heel will grip, cup firmness matters too.
        </KeyInsight>
      </div>

      <div id="scarpa-drago-heel-fit">
        <KeyInsight color={T.yellow}>
          <strong><S slug="scarpa-drago">Scarpa Drago</S></strong>{" "}
          (11 reports): 55% perfect, 36% empty. Empty-heel users average heel width 0.225,
          perfect-heel users 0.251 with quite mixed heel depth. Apparently forgiving on depth, but
          not a good fit for narrow heels.
        </KeyInsight>
      </div>

      <div id="evolv-shaman-heel-fit">
        <KeyInsight color={T.green}>
          <strong><S slug="evolv-shaman">Evolv Shaman</S></strong>{" "}
          (10 reports): a textbook depth split. Heel width is nearly identical between perfect-fit
          (0.245) and empty-fit (0.246) users. Depth tells the whole story: perfect users average
          0.072, empty users 0.031. A 2.3× difference. If your heel projects deeply, the Shaman's
          aggressive rand tension grips it. If it doesn't, you float.
        </KeyInsight>
      </div>

      <SectionHeading>Best climbing shoes for narrow heels</SectionHeading>
      <Prose>
        <p>
          If your heel width ratio is under ~0.23, standard-last cups will feel empty no matter
          how aggressively you downsize. The two shoes that grip narrow heels most reliably in our
          dataset are the <S slug="scarpa-instinct-vsr-lv">Scarpa Instinct VSR LV</S>, which is
          explicitly the low-volume variant of the Instinct VSR, and the{" "}
          <S slug="mad-rock-d2-one-hv">Mad Rock D2.ONE HV</S>, whose heel cup is unusually narrow
          despite the shoe's high-volume forefoot. Avoid the standard Instinct VSR, Drago and
          Ondra Comp if narrow heel fit is your priority.
        </p>
      </Prose>

      <SectionHeading>Best climbing shoes for shallow heels</SectionHeading>
      <Prose>
        <p>
          If your heel depth ratio is under ~0.03, you need a cup that holds its shape rather
          than one that depends on rand tension wrapping flat rubber around your heel. The{" "}
          <S slug="tenaya-mastia">Tenaya Mastia</S> (firm thermo-molded shell) and the{" "}
          <S slug="la-sportiva-solution-mens">La Sportiva Solution</S> (firm P3 molded cup) both
          grip shallow heels in our data. Soft 3D-molded cups with side stiffeners, like the{" "}
          <S slug="la-sportiva-skwama">Skwama</S>, do not — they still need the foot to push
          backward to generate grip. Also avoid the <S slug="evolv-shaman">Shaman</S> and{" "}
          <S slug="la-sportiva-tc-pro">TC Pro</S> if your heel projects little.
        </p>
      </Prose>

      <SectionHeading>A new shape emerging? Mad Rock D2.ONE HV</SectionHeading>
      <Prose>
        <p>
          An interesting counterpoint is emerging in the{" "}
          <S slug="mad-rock-d2-one-hv">Mad Rock D2.ONE HV</S> (8 reports so far): 7 perfect heels,
          1 tight, zero empty. It's marketed as a high-volume shoe yet has a rather narrow heel
          cup. The first shoe in our dataset where "empty heel" essentially doesn't show up.
          We'll watch it closely as the sample grows.
        </p>
      </Prose>

      <SectionHeading>Frequently asked questions about climbing shoe heel fit</SectionHeading>
      <FAQ />

      <SectionHeading>Why two-dimensional heel scoring beats single adjectives</SectionHeading>
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
          construction, firm pre-formed cups (Solution, Mastia) versus soft/thin cups with side
          reinforcement (Skwama), because the same shallow-heel foot gets opposite outcomes
          depending on which type it meets. Moving forward we also want to introduce a proper 3D
          modelled heel to identify additional patterns and improve the quality of our
          recommendations.
        </p>
      </Prose>

      <SectionHeading>Still early, getting sharper</SectionHeading>
      <Prose>
        <p>
          We have performed 200 scans so far, enough to see first patterns for the four most
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
        <strong>Try it yourself:</strong>{" "}
        <a href="/scan" style={{ color: T.accent, fontWeight: 700 }}>climbing-gear.com/scan</a>.
        Two photos, ten seconds, free.
      </KeyInsight>
    </ArticleLayout>
  );
}
