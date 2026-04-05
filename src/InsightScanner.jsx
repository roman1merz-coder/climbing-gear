import { T } from "./tokens.js";
import usePageMeta from "./usePageMeta.js";
import useStructuredData from "./useStructuredData.js";
import {
  useIsMobile, ArticleLayout, ArticleHeader, SectionHeading,
  Prose, KeyInsight, StatCard,
} from "./InsightsShared.jsx";

/* ═══════════════════════════════════════════════════════════════
   INSIGHT: How the Foot Scanner Works - A Practical Guide
   ═══════════════════════════════════════════════════════════════ */

export default function InsightScanner() {
  const isMobile = useIsMobile();

  usePageMeta(
    "How the Climbing Shoe Foot Scanner Works | climbing-gear.com",
    "A practical guide to the climbing-gear.com Foot Scanner. Two phone photos, 7 measurements, 400+ shoes ranked. See a real scan walkthrough with results.",
  );

  useStructuredData({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "How the Climbing Shoe Foot Scanner Works",
    description: "A practical guide to the climbing-gear.com Foot Scanner. See how two phone photos become personalized climbing shoe recommendations.",
    author: { "@type": "Organization", name: "climbing-gear.com", url: "https://www.climbing-gear.com" },
    publisher: { "@type": "Organization", name: "climbing-gear.com", url: "https://www.climbing-gear.com" },
    datePublished: "2026-04-05",
    mainEntityOfPage: "https://www.climbing-gear.com/insights/foot-scanner",
  });

  const linkStyle = { color: T.accent, textDecoration: "none", fontWeight: 600 };

  return (
    <ArticleLayout isMobile={isMobile} breadcrumb="Foot Scanner Guide">
      <ArticleHeader
        title="How the Foot Scanner Works"
        subtitle="Two photos, seven measurements, 400+ shoes ranked. Here's what actually happens when you scan your foot."
      />

      {/* ── What You Need ── */}
      <SectionHeading>What you need</SectionHeading>
      <Prose>
        <p>
          A phone with a camera. That's it. No app, no account, no special paper. Open
          the <a href="/scan" style={linkStyle}>scanner</a> in your mobile browser, take a photo
          of the sole of your foot and one from the side. The whole thing takes about 60 seconds.
        </p>
      </Prose>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", margin: "16px 0" }}>
        <StatCard label="Photos needed" value="2" sub="sole + side view" />
        <StatCard label="Measurements" value="7" sub="extracted automatically" color={T.green} />
        <StatCard label="Shoes compared" value="400+" sub="across 30 attributes" color={T.blue} />
      </div>

      {/* ── How to Get a Good Scan ── */}
      <SectionHeading>How to get a good scan</SectionHeading>
      <Prose>
        <p>
          Photo quality is the single biggest factor in scan accuracy. Good lighting matters more than
          camera resolution. Stand on a flat, contrasting surface (light floor works best). For the sole
          photo, point the camera straight down at your foot. For the side photo, place the camera level
          with your foot so your full profile is visible from heel to toes.
        </p>
        <p>
          The scanner will guide you through each step with an overlay outline. Try to fill the outline
          with your foot. After each photo, you'll see a review screen with a checklist: does the outline
          match? Is the full foot visible? Is the image sharp? If not, retake it. A retake costs 10 seconds;
          a bad scan wastes the whole result.
        </p>
      </Prose>

      <KeyInsight>
        <strong>Tip:</strong> Avoid backlighting (no window behind your foot). The scanner needs
        contrast between your foot and the background to isolate the outline.
      </KeyInsight>

      {/* ── What Gets Measured ── */}
      <SectionHeading>What gets measured</SectionHeading>
      <Prose>
        <p>
          From the sole photo, the scanner extracts five measurements: forefoot width, heel width, arch
          length, toe shape (Egyptian, Greek, or Roman), and hallux valgus tendency. From the side photo,
          it measures instep height and heel depth. These seven values are expressed as ratios relative to
          your foot length, so the actual size of the photo doesn't matter.
        </p>
        <p>
          Each measurement is classified into a range (narrow, medium, wide for width; low, medium, high for
          instep) and combined into an overall foot profile. This profile is what gets matched against the
          shoe database.
        </p>
      </Prose>

      {/* ── What You Tell It ── */}
      <SectionHeading>What you tell it</SectionHeading>
      <Prose>
        <p>
          After the photos, the scanner asks a few questions: your street shoe size, whether you climb in
          men's or women's shoes, and your current climbing shoe (brand, model, size, and how it fits in
          three zones: toes, forefoot, and heel). This fit feedback is critical because it tells the
          system what works and what doesn't in a shoe you already know. If your Solution's heel
          feels empty but the forefoot is perfect, the scanner knows to find shoes with a tighter heel
          cup but keep the forefoot geometry.
        </p>
      </Prose>

      {/* ── What You Get Back ── */}
      <SectionHeading>What you get back</SectionHeading>
      <Prose>
        <p>
          The result page has two parts. First, three interpretation sections that explain your foot shape
          in plain language, what your current shoe fit tells us, and what to look for in your next shoe.
          Second, 12 shoe recommendations split into four tiers of three shoes each: baseline (matching
          your current shoe's stiffness), softer, stiffer, and budget options.
        </p>
        <p>
          Each recommended shoe comes with a description of why it was selected for your foot and any
          tradeoffs to consider. Recommendations include a suggested size based on your street size,
          brand-specific sizing patterns, and the downsize of your current shoe.
        </p>
      </Prose>

      {/* ── Real Scan Example ── */}
      <SectionHeading>A real scan, start to finish</SectionHeading>
      <Prose>
        <p>
          Here's what a real scan looks like. The foot below belongs to a male climber, street size EU 44.5,
          currently wearing La Sportiva Solutions in EU 43 with squeezed toes but empty heels.
        </p>
      </Prose>

      {/* Scan Photos */}
      <div style={{ display: "flex", gap: "16px", margin: "16px 0", flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <div style={{ flex: "1 1 0", minWidth: isMobile ? "100%" : "0" }}>
          <div style={{ position: "relative", borderRadius: T.radius, overflow: "hidden", border: `1px solid ${T.border}` }}>
            <img
              src="https://wsjsuhvpgupalwgcjatp.supabase.co/storage/v1/object/public/foot-scans/scans/scan-2026-03-30T19-21-23-sole.jpg"
              alt="Sole photo of a male climber's right foot, taken from below"
              style={{ width: "100%", display: "block" }}
              loading="lazy"
            />
            <img
              src="https://wsjsuhvpgupalwgcjatp.supabase.co/storage/v1/object/public/foot-scans/scans/scan-2026-03-30T19-21-23-sole_overlay.png"
              alt="Scanner overlay showing detected foot outline, toe tips, and measurement lines on the sole photo"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }}
              loading="lazy"
            />
          </div>
          <div style={{ fontSize: "11px", color: T.muted, textAlign: "center", marginTop: "8px", fontWeight: 600 }}>
            Sole scan with detected outline and measurement points
          </div>
        </div>
        <div style={{ flex: "1 1 0", minWidth: isMobile ? "100%" : "0" }}>
          <div style={{ position: "relative", borderRadius: T.radius, overflow: "hidden", border: `1px solid ${T.border}` }}>
            <img
              src="https://wsjsuhvpgupalwgcjatp.supabase.co/storage/v1/object/public/foot-scans/scans/scan-2026-03-30T19-21-23-side.jpg"
              alt="Side profile photo of a male climber's right foot"
              style={{ width: "100%", display: "block" }}
              loading="lazy"
            />
            <img
              src="https://wsjsuhvpgupalwgcjatp.supabase.co/storage/v1/object/public/foot-scans/scans/scan-2026-03-30T19-21-23-side_overlay.png"
              alt="Scanner overlay showing instep height and heel depth measurement on the side profile"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }}
              loading="lazy"
            />
          </div>
          <div style={{ fontSize: "11px", color: T.muted, textAlign: "center", marginTop: "8px", fontWeight: 600 }}>
            Side profile with instep and heel depth measurements
          </div>
        </div>
      </div>

      {/* Measurement Summary */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
        gap: "10px", margin: "16px 0",
      }}>
        {[
          { label: "Toe Shape", value: "Egyptian", sub: "big toe longest" },
          { label: "Forefoot Width", value: "Narrow", sub: "ratio 0.343" },
          { label: "Heel Width", value: "Narrow", sub: "ratio 0.213" },
          { label: "Instep Height", value: "Low", sub: "ratio 0.242" },
          { label: "Arch Length", value: "Long", sub: "ratio 0.732" },
          { label: "Heel Depth", value: "Shallow", sub: "ratio 0.038" },
          { label: "Hallux Valgus", value: "Normal", sub: "no deviation" },
          { label: "Overall Profile", value: "Low Volume", sub: "slim front to back" },
        ].map(m => (
          <div key={m.label} style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: "10px",
            padding: "12px", textAlign: "center",
          }}>
            <div style={{ fontSize: "10px", color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: "4px" }}>{m.label}</div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: T.text }}>{m.value}</div>
            <div style={{ fontSize: "10px", color: T.muted, marginTop: "2px" }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <Prose>
        <p>
          The scanner detected an Egyptian toe shape, narrow forefoot (width ratio 0.343), narrow heel
          (0.213), low instep (0.242), and long arch. The foot has a consistently slim profile front to
          back, pointing toward low-volume shoes.
        </p>
        <p>
          The fit feedback from the Solutions was key: the squeezed toes despite generous sizing (only 1.5
          sizes down vs the typical 2.5 for La Sportiva) flagged a toe box shape mismatch, not a width
          problem. The empty heel confirmed the narrow, shallow heel profile from the scan. The scanner
          adjusted its targets accordingly: medium-width shoes (one step wider than the raw scan suggests)
          to avoid repeating the toe squeeze, while keeping narrow heel volume to fix the empty heel.
        </p>
        <p>
          Top recommendations included the Tenaya Mastia, Unparallel Souped Up, and Red Chili Voltage
          Lace in the baseline tier, with the La Sportiva Mantra and Evolv Zenist as softer alternatives.
          Budget picks included the Black Diamond Shadow and Boreal Ninja.
        </p>
      </Prose>

      <KeyInsight color={T.green}>
        <strong>The fit feedback loop:</strong> Every scan with shoe fit data makes the system smarter.
        The more climbers scan their feet and rate how their current shoes fit, the better the
        recommendations become for everyone. If you scan, tell it about your shoes.
      </KeyInsight>

      {/* ── Limitations ── */}
      <SectionHeading>What it can't do (yet)</SectionHeading>
      <Prose>
        <p>
          Photo quality matters: a blurry or poorly lit photo will produce
          unreliable measurements, and the scanner will tell you when it can't get a good read rather
          than guessing.
        </p>
        <p>
          Processing is sequential right now. If many people scan at the same time, you'll wait in
          a short queue. It won't break, but it might take a minute instead of ten seconds.
        </p>
        <p>
          And nothing replaces trying shoes on. If you have access to a shop with good stock, go
          try shoes. This tool is built for the many climbers who order online and want to narrow down
          the options before committing.
        </p>
      </Prose>

      {/* ── CTA ── */}
      <div style={{
        textAlign: "center", marginTop: "36px", padding: "28px 20px",
        background: `${T.accent}08`, borderRadius: T.radius, border: `1px solid ${T.accent}20`,
      }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: T.text, marginBottom: "8px" }}>
          Ready to find your shoe?
        </div>
        <div style={{ fontSize: "13px", color: T.muted, marginBottom: "16px" }}>
          60 seconds, no account, free.
        </div>
        <a
          href="/scan"
          style={{
            display: "inline-block", padding: "12px 28px",
            background: T.accent, color: "#fff", borderRadius: "8px",
            fontWeight: 700, fontSize: "14px", textDecoration: "none",
          }}
        >
          Start Scanning
        </a>
      </div>
    </ArticleLayout>
  );
}
