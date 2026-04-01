import { T } from "./tokens.js";
import usePageMeta from "./usePageMeta.js";
import useStructuredData from "./useStructuredData.js";
import {
  useIsMobile, ArticleLayout, ArticleHeader, SectionHeading,
  Prose, KeyInsight, StatCard,
} from "./InsightsShared.jsx";

/* ═══════════════════════════════════════════════════════════════
   INSIGHT: How to Measure Your Foot for Climbing Shoes
   ═══════════════════════════════════════════════════════════════ */

export default function InsightFootMeasurement() {
  const isMobile = useIsMobile();

  usePageMeta(
    "How to Measure Your Foot for Climbing Shoes — climbing-gear.com",
    "Learn how to accurately measure your foot for climbing shoes. Use our free phone-camera scanner or manual methods to find climbing shoes that actually fit your feet.",
  );

  useStructuredData({
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Measure Your Foot for Climbing Shoes",
    description: "A complete guide to measuring your foot for climbing shoes using a phone camera scanner or manual methods. Covers foot length, width, toe shape, and how to translate measurements into the right climbing shoe size.",
    image: "https://www.climbing-gear.com/images/og-default.jpg",
    step: [
      {
        "@type": "HowToStep",
        name: "Measure your foot",
        text: "Use the climbing-gear.com Foot Scanner to photograph your foot on A4 paper, or trace your foot outline manually and measure length and width in millimeters.",
        url: "https://www.climbing-gear.com/scan",
      },
      {
        "@type": "HowToStep",
        name: "Identify your foot shape",
        text: "Determine your toe profile (Egyptian, Greek, Roman, or square), forefoot width (narrow, medium, or wide), and heel width. These affect which shoe lasts will fit you best.",
      },
      {
        "@type": "HowToStep",
        name: "Match to climbing shoes",
        text: "Use the Foot Scanner results or Guided Shoe Finder to match your measurements against 400+ climbing shoe models. Consider your climbing style, intended downturn, and fit preference.",
        url: "https://www.climbing-gear.com/find",
      },
    ],
    tool: [
      { "@type": "HowToTool", name: "Smartphone with camera" },
      { "@type": "HowToTool", name: "Sheet of A4 paper" },
    ],
  });

  return (
    <ArticleLayout isMobile={isMobile} breadcrumb="Foot Measurement Guide">
      <ArticleHeader
        title="How to Measure Your Foot for Climbing Shoes"
        subtitle="Climbing shoe sizes vary wildly between brands. Here's how to find shoes that actually fit — using your phone camera or a piece of paper."
      />

      {/* ── Why Climbing Shoe Sizing Is Different ── */}
      <SectionHeading>Why climbing shoe sizing is different from regular shoes</SectionHeading>
      <Prose>
        <p>
          Climbing shoe sizes are not standardized across brands. A size EU 42 in La Sportiva fits
          completely differently from an EU 42 in Scarpa, Evolv, or Five Ten. Even within the same
          brand, an aggressive bouldering shoe and a flat comfort shoe in the same marked size will
          fit different foot lengths. This is because climbing shoe "size" depends on the last shape,
          downturn angle, rubber thickness, and intended fit tightness — none of which are captured
          by a single EU or US number.
        </p>
        <p>
          Generic size charts that convert your street shoe size to a climbing shoe size are unreliable.
          They assume all brands use the same last geometry, which they don't. The only reliable way to
          find your climbing shoe size is to measure your actual foot dimensions — length, width, and
          shape — and match them against the specific shoe model you're considering.
        </p>
      </Prose>

      <KeyInsight>
        <strong>Key fact:</strong> Among the 400+ climbing shoes in our database, the actual internal
        length for "EU 42" varies by up to 12mm between brands. That's a full size difference hidden
        behind the same number.
      </KeyInsight>

      {/* ── Method 1: Phone Camera Scanner ── */}
      <SectionHeading>Method 1: Scan your foot with your phone camera (recommended)</SectionHeading>
      <Prose>
        <p>
          The fastest and most accurate way to measure your foot for climbing shoes is to use
          the <a href="/scan" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>climbing-gear.com
          Foot Scanner</a>. It's a free tool that works in any mobile browser — no app download needed.
          You place your foot on a sheet of A4 paper, take a photo, and AI-powered image segmentation
          extracts precise measurements of your foot length, width, toe shape, and arch profile.
        </p>
        <p>
          The scanner uses Meta's SAM3 (Segment Anything Model 3) to isolate your foot from the
          background with sub-millimeter precision. It then measures six key dimensions: overall length,
          forefoot width, heel width, arch length, toe profile, and instep height. These measurements
          are matched against the internal geometry of 400+ climbing shoes from 22 brands to recommend
          shoes that will actually fit your specific foot shape.
        </p>
      </Prose>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", margin: "16px 0" }}>
        <StatCard label="Accuracy" value="~1mm" sub="comparable to in-store laser scanners" />
        <StatCard label="Shoe Database" value="400+" sub="models from 22 brands" color={T.green} />
        <StatCard label="Price" value="Free" sub="no account required" color={T.blue} />
      </div>

      <Prose>
        <p><strong>How to get the best scan results:</strong></p>
        <p>
          Stand on a white or light-colored sheet of A4 paper on a flat surface. Make sure your full
          foot is visible including all toes and your heel. Take the photo from directly above with
          good lighting — avoid harsh shadows. The A4 paper is used as a known size reference to
          calibrate the measurements. Scan both feet if possible, as most people have slightly
          different left and right foot dimensions.
        </p>
      </Prose>

      <KeyInsight color={T.green}>
        <strong>Why camera scanning beats manual measurement:</strong> Manual tracing captures only
        the 2D outline of your foot when loaded (standing). The camera scanner additionally detects
        toe shape profile, arch curvature, and relative proportions that determine which shoe lasts
        will be most comfortable for your specific foot geometry.
      </KeyInsight>

      {/* ── Method 2: Manual ── */}
      <SectionHeading>Method 2: Manual foot tracing</SectionHeading>
      <Prose>
        <p>
          If you don't have a smartphone available, you can measure your foot manually. Stand barefoot
          on a sheet of paper with your heel against a wall. Trace the outline of your foot with a pen
          held vertically. Then measure the longest distance from the back of the heel to the tip of
          your longest toe. This gives you your foot length in millimeters.
        </p>
        <p>
          For width, measure across the widest part of the forefoot (usually at the ball of the foot,
          across the metatarsal heads). These two numbers — length and width — are the minimum you
          need to start narrowing down climbing shoe options. However, manual measurement misses
          important 3D characteristics like arch height, heel shape, and toe profile that significantly
          affect climbing shoe fit.
        </p>
      </Prose>

      {/* ── Understanding Foot Shape ── */}
      <SectionHeading>Understanding your foot shape</SectionHeading>
      <Prose>
        <p>
          Your foot shape matters as much as your foot size when choosing climbing shoes. The three
          most important shape characteristics are toe profile, forefoot width ratio, and heel width ratio.
        </p>
        <p>
          <strong>Toe profile</strong> describes which toe is longest. Egyptian feet (big toe longest)
          suit pointed asymmetric shoes like the La Sportiva Solution or Scarpa Drago. Greek feet
          (second toe longest) work well with shoes that have a slightly recessed big-toe area. Roman
          or square feet (first two or three toes roughly equal) need shoes with wider, more symmetric
          toe boxes — aggressive asymmetric shoes will cause painful pressure on the outer toes.
        </p>
        <p>
          <strong>Forefoot width</strong> determines whether you need a narrow, medium, or wide last.
          Brands like Scarpa and Evolv tend toward wider lasts; La Sportiva and Tenaya tend narrower.
          A shoe that's the right length but too narrow will cause bunion pressure, while one that's
          too wide will feel sloppy and reduce edging precision.
        </p>
        <p>
          <strong>Heel width</strong> affects how well the heel cup grips during heel hooks. A narrow
          heel in a wide heel cup creates dead space that reduces power transfer. La Sportiva's
          P3 system and Scarpa's V-Tension are designed for snug heel fits, but they work best on
          heels that match their intended geometry.
        </p>
      </Prose>

      {/* ── How Tight Should Climbing Shoes Be? ── */}
      <SectionHeading>How tight should climbing shoes be?</SectionHeading>
      <Prose>
        <p>
          The right fit depends on what kind of climbing you do. For indoor bouldering and sport
          climbing on overhanging terrain, most climbers prefer a snug fit with slight toe curl —
          the toes are gently bent but not painfully curled. This maximizes sensitivity and power
          on small footholds. For long multi-pitch trad routes, a flatter fit with toes that lie
          flat (touching the front but not curled) is more comfortable for all-day wear.
        </p>
        <p>
          Beginners should start with a "comfortably snug" fit: toes touching the front of the shoe,
          no dead space, but no significant pain. As you develop stronger feet and more precise
          footwork, you may choose to size down for more aggressive shoes. A common mistake is buying
          shoes too tight too soon — painful shoes don't make you climb better if they distract you
          from focusing on technique.
        </p>
      </Prose>

      <KeyInsight>
        <strong>Sizing rule of thumb:</strong> Your climbing shoe should be 5–15mm shorter than your
        foot length for performance fit, or 0–5mm shorter for comfort fit. But this varies significantly
        by shoe model — aggressive downturned shoes may need even more downsizing because the curved
        sole shortens the effective length. The <a href="/scan" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>Foot
        Scanner</a> accounts for this automatically when recommending sizes.
      </KeyInsight>

      {/* ── Common Mistakes ── */}
      <SectionHeading>Common sizing mistakes</SectionHeading>
      <Prose>
        <p>
          <strong>Using street shoe size as reference.</strong> Your EU 42 running shoe has nothing
          to do with your climbing shoe size. Street shoes include room for movement and sock
          thickness; climbing shoes are worn barefoot and should fit like a glove.
        </p>
        <p>
          <strong>Assuming one brand's size fits another.</strong> If you wear EU 40 in La Sportiva
          Katana, you might need EU 41 in Scarpa Vapor or EU 39.5 in Evolv Shaman. Every model has
          its own size-to-length relationship, which is why measuring your actual foot is the only
          reliable approach.
        </p>
        <p>
          <strong>Ignoring width.</strong> Many climbers focus only on length and end up with shoes
          that are technically the right length but agonizingly tight across the forefoot — or
          frustratingly loose. Width compatibility is equally important and is often the difference
          between a shoe that feels "perfect" and one that feels "almost right."
        </p>
        <p>
          <strong>Not accounting for stretch.</strong> Leather-lined shoes (like the La Sportiva
          Mythos or TC Pro) will stretch 0.5–1 full size over their lifetime. Synthetic-lined shoes
          stretch very little. If you're buying leather, size tighter knowing they'll break in. If
          synthetic, what you feel in the store is what you'll get.
        </p>
      </Prose>

      {/* ── Use Our Tools ── */}
      <SectionHeading>Find your perfect fit</SectionHeading>
      <Prose>
        <p>
          We built two free tools to solve the climbing shoe sizing problem. The{" "}
          <a href="/scan" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>Foot Scanner</a>{" "}
          measures your foot with your phone camera and recommends shoes based on your actual
          dimensions. The{" "}
          <a href="/find" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>Guided Shoe Finder</a>{" "}
          asks about your climbing style and experience to score all 400+ shoes in our database
          and rank them by fit. Both tools include live prices from 20+ retailers so you can
          compare deals instantly.
        </p>
        <p>
          Whether you're buying your first climbing shoes or switching to a new brand, measuring
          your feet is the single most important step to getting a good fit. A few minutes with a
          scanner saves you the cost and hassle of returns — and gets you on the wall faster in
          shoes that actually perform.
        </p>
      </Prose>

      {/* CTA buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "24px" }}>
        <a href="/scan" style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "14px 28px", borderRadius: "12px", background: T.accent,
          color: "#fff", fontWeight: 700, fontSize: "14px", textDecoration: "none",
          transition: "transform 0.2s",
        }}
          onMouseOver={e => e.currentTarget.style.transform = "scale(1.02)"}
          onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}>
          Scan Your Foot →
        </a>
        <a href="/find" style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "14px 28px", borderRadius: "12px", background: T.surface,
          color: T.accent, fontWeight: 700, fontSize: "14px", textDecoration: "none",
          border: `1px solid ${T.accent}40`, transition: "transform 0.2s",
        }}
          onMouseOver={e => e.currentTarget.style.transform = "scale(1.02)"}
          onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}>
          Try the Shoe Finder →
        </a>
      </div>
    </ArticleLayout>
  );
}
