import { useMemo } from "react";
import { T } from "./tokens.js";
import CRASHPAD_SEED from "./crashpad_seed_data.json";
import CrashpadScatterChart from "./CrashpadScatterChart.jsx";
import usePageMeta from "./usePageMeta.js";
import {
  useIsMobile, ArticleLayout, ArticleHeader, SectionHeading, StatCard,
  Prose, KeyInsight, ArticleImage,
} from "./InsightsShared.jsx";

/* ─── Data derived from seed ─── */
const INFLATABLE_SLUGS = CRASHPAD_SEED
  .filter(p => (p.foam_types || []).includes("air_chamber"))
  .map(p => p.slug);

const INFLATABLE_PADS = CRASHPAD_SEED
  .filter(p => p.length_open_cm && p.width_open_cm && p.weight_kg && p.thickness_cm >= 10 && p.thickness_cm <= 16)
  .map(p => {
    const area = (p.length_open_cm * p.width_open_cm) / 10000;
    return {
      slug: p.slug,
      inflatable: (p.foam_types || []).includes("air_chamber"),
    };
  });

export default function InsightCrashpads() {
  usePageMeta(
    "Inflatable Crashpads: Game-Changer or Gimmick? — Data Analysis",
    "We compared inflatable vs foam crashpads across 101 models. Inflatables weigh 46% less at competitive prices — but have real trade-offs on rough terrain. Full data breakdown inside."
  );
  const isMobile = useIsMobile();

  return (
    <ArticleLayout isMobile={isMobile} breadcrumb="Inflatable Crashpads">
      <ArticleHeader
        title="Inflatable Crashpads: Game-Changer or Gimmick?"
        subtitle="They shatter the weight curve, fit inside your main pad, and double as a mattress. But would you trust one on sharp rock?"
      />

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
        <StatCard label="Avg kg/m² (Inflatable)" value="2.6" sub="vs 4.8 for foam pads" color={T.yellow} />
        <StatCard label="Weight Saving" value="46%" sub="Same thickness, half the weight" color={T.green} />
        <StatCard label="Packed Volume" value="~5L" sub="Fits inside any taco pad" color={T.blue} />
      </div>

      <SectionHeading>Breaking the Trendline</SectionHeading>

      <CrashpadScatterChart isMobile={isMobile} highlightSlugs={INFLATABLE_SLUGS} initialMetric="area_weight" compact thicknessRange={[10, 16]} />

      <Prose>
        The chart above tells the story better than words can. Among the {INFLATABLE_PADS.length} pads in our database with 10–16cm thickness, the inflatables sit dramatically below the weight trendline. At 3.5–5.0 kg for 1.8–2.0 m² of landing area, they weigh roughly half of what foam pads deliver for the same coverage. That's not a marginal improvement — it's a category break. Click on any dot to see the full specs of that pad.
      </Prose>

      <KeyInsight color={T.yellow}>
        <strong>The weight advantage is real.</strong> A Snap Air Shock 1 delivers 1.8m² of 15cm-thick landing zone at just 5kg. A comparable foam pad (e.g. Snap Wrap Original: 1.5m², 15cm, 10kg) weighs twice as much for less area. That deflated Air Shock rolls up to roughly sleeping-bag size — meaning you can carry two full-size pads to the crag for barely more than the weight of one traditional pad.
      </KeyInsight>

      <SectionHeading>Cost per Area: Surprisingly Competitive</SectionHeading>

      <CrashpadScatterChart isMobile={isMobile} highlightSlugs={INFLATABLE_SLUGS} initialMetric="area_price" compact thicknessRange={[10, 16]} />

      <Prose>
        You might expect air-chamber technology to come at a steep premium — but the data tells a different story. When you plot area vs price for the same 10–16cm thickness range, the inflatables are competitive with foam pads of comparable landing area. You're not paying a premium for lighter weight.
      </Prose>

      <KeyInsight color={T.green}>
        <strong>Better value by every metric.</strong> Inflatables deliver roughly half the weight at a below-average €/m². In other words, the air-chamber technology doesn't just save weight — it saves money per square meter of landing zone too. That's genuinely rare in climbing gear.
      </KeyInsight>

      <SectionHeading>Packed Size: Where It Gets Ridiculous</SectionHeading>

      <ArticleImage
        src="/images/insights/inflatable-packed-size.jpg"
        alt="Size comparison: a full-size foam crashpad next to a deflated inflatable rolled into a small bag"
        caption="A full-size foam pad next to a deflated inflatable of comparable landing area. The size difference speaks for itself."
      />

      <Prose>
        When deflated, an inflatable crashpad rolls down to roughly the size of a sleeping bag — about 5 liters of volume. Compare that to a foam pad of similar landing area, which stays the same massive rectangle whether you're climbing on it or carrying it to the crag.
      </Prose>

      <Prose>
        The practical implication is huge: an inflatable fits inside most taco-fold or hinge-fold pads. You're not strapping a second bulky pad to the outside of your first one, Tetris-ing gear on your back, or making a second trip. Just roll it up, tuck it in, and hike normally. For long approaches this alone can be the deciding factor.
      </Prose>

      <KeyInsight color={T.blue}>
        <strong>Stacking made easy:</strong> Carry two full-size pads for the weight and bulk of roughly 1.5 traditional pads. Or three full-size pads at the weight of two — you can easily fit 2 inflatable pads into one conventional taco pad.
      </KeyInsight>

      <SectionHeading>Inflation: Easier Than You'd Think</SectionHeading>

      <ArticleImage
        src="/images/insights/inflatable-blower.jpg"
        alt="Inflating a crashpad with a battery-powered blower — takes about 60 seconds"
        caption="A battery-powered blower inflates an entire crashpad in about 60 seconds."
      />

      <Prose>
        Initially our biggest concern: "I don't want to sit there pumping up a pad for 10 minutes." Fair — but some boulderers already carry a battery-powered blower to clean holds. That same blower inflates an entire crashpad in about 60 seconds.
      </Prose>

      <Prose>
        And once it's inflated, you get something foam pads can't offer: adjustable firmness. Pump in more air for a firmer, more responsive landing surface on higher problems. Let some air out for a softer cushion on sit-starts or traverses.
      </Prose>

      <SectionHeading>Where Inflatables Shine</SectionHeading>

      <ArticleImage
        src="/images/insights/inflatable-bouldering.jpg"
        alt="Bouldering on flat, even terrain — the ideal use case for inflatable crashpads"
        caption="Flat, even landings — this is where inflatables truly excel."
      />

      <Prose>
        Inflatables are at their best on flat, even terrain with relatively low problems. Think sandy bouldering areas, forest clearings with soft ground, or gym-style outdoor walls. They're also unbeatable for van-life and traveling boulderers — a deflated pad takes up barely any space in your vehicle compared to a foam pad that dominates the entire cargo area.
      </Prose>

      <Prose>
        The comfort factor shouldn't be underestimated either. Inflatables make surprisingly decent sleeping mats — they're thick and adjustable.
      </Prose>

      <SectionHeading>The Honest Downsides</SectionHeading>

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

      <SectionHeading>The Verdict</SectionHeading>

      <Prose>
        Game-changer or gimmick? Neither — and both. Inflatable crashpads aren't here to replace your foam pad. They're here to complement it. The ideal setup for many boulderers is a traditional foam pad as the primary landing zone, with an inflatable tucked inside for extra coverage.
      </Prose>

      <KeyInsight color={T.green}>
        <strong>Our recommendation:</strong> If you boulder on flat terrain, travel often, or do long approaches — an inflatable pad is genuinely transformative. As a second pad, it's arguably the best value-for-weight investment in bouldering gear. But if you only own one pad and climb on rough, rocky terrain, stick with proven multi-layer foam. The peace of mind is worth the extra kilos.
      </KeyInsight>

      <SectionHeading>Bonus: The Best Pool Float Money Can Buy</SectionHeading>

      <ArticleImage
        src="/images/insights/inflatable-swimming.jpg"
        alt="Using an inflatable crashpad as a pool float at a lake"
        caption="Not the intended use case, but the kids loved it."
      />

      <Prose>
        An inflatable crashpad is, fundamentally, a quite large, very durable air mattress. Take it to the lake, the river, or the pool after a session and you've got the most luxurious float at the beach. It's 1.5–1.8m² of lounging surface — big and stable enough to actually lie on comfortably. Is this a legitimate purchase justification? Probably not. Does it bring joy? Absolutely.
      </Prose>
    </ArticleLayout>
  );
}
