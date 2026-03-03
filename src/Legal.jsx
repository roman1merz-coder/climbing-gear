import { Link, useLocation } from "react-router-dom";
import { T } from "./tokens.js";
import usePageMeta from "./usePageMeta.js";

const S = {
  page: { minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text },
  header: {
    padding: "20px 32px", borderBottom: `1px solid ${T.border}`,
    background: T.bg,
  },
  back: { display: "inline-flex", alignItems: "center", gap: "8px", color: T.text, textDecoration: "none", fontWeight: 600, fontSize: "14px" },
  wrap: { maxWidth: "720px", margin: "0 auto", padding: "48px 32px 80px" },
  h1: { fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", marginBottom: "8px" },
  subtitle: { fontSize: "13px", color: T.muted, marginBottom: "40px" },
  h2: { fontSize: "18px", fontWeight: 700, marginTop: "36px", marginBottom: "12px", color: T.text },
  p: { fontSize: "14px", color: T.muted, lineHeight: 1.8, marginBottom: "16px" },
};

function Impressum() {
  return (
    <>
      <h1 style={S.h1}>Legal Notice</h1>
      <p style={S.subtitle}>Information pursuant to Section 5 TMG (German Telemedia Act)</p>

      <h2 style={S.h2}>Responsible Person</h2>
      <p style={S.p}>
        Roman Merz<br />
        Von-Hutten-Strasse 22<br />
        67489 Kirrweiler<br />
        Germany
      </p>

      <h2 style={S.h2}>Contact</h2>
      <p style={S.p}>Email: roman@climbing-gear.com</p>

      <h2 style={S.h2}>Disclaimer</h2>
      <p style={S.p}>
        The content of this website is created with the utmost care. However, we cannot guarantee the accuracy, completeness, or timeliness of the information provided.
      </p>
      <p style={S.p}>
        As a service provider, we are responsible for our own content on these pages under general law pursuant to Section 7(1) TMG. Under Sections 8 to 10 TMG, however, we are not obligated to monitor transmitted or stored third-party information.
      </p>

      <h2 style={S.h2}>Affiliate Links</h2>
      <p style={S.p}>
        This website contains affiliate links to retailers (e.g. via the AWIN network). If you purchase a product through such a link, we may receive a commission. The price you pay remains the same. Affiliate revenue never influences our ratings or rankings.
      </p>

      <h2 style={S.h2}>Copyright</h2>
      <p style={S.p}>
        The content and works created by the site operator are subject to copyright. Product images are sourced from the respective manufacturers and are used for informational purposes as part of product presentation.
      </p>
    </>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <h1 style={S.h1}>Privacy Policy</h1>
      <p style={S.subtitle}>How we handle your data</p>

      <h2 style={S.h2}>1. Data Controller</h2>
      <p style={S.p}>
        The person responsible for data processing on this website is:<br />
        Roman Merz — roman@climbing-gear.com
      </p>

      <h2 style={S.h2}>2. Hosting</h2>
      <p style={S.p}>
        This website is hosted by Vercel Inc. (San Francisco, USA). When you visit the website, certain information (e.g. IP address, browser type, time of access) is automatically stored in server log files. Legal basis: Art. 6(1)(f) GDPR (legitimate interest).
      </p>

      <h2 style={S.h2}>3. Analytics</h2>
      <p style={S.p}>
        We use Vercel Web Analytics for aggregated page view statistics (no cookies, no personal data).
      </p>
      <p style={S.p}>
        We also use PostHog (PostHog Inc., San Francisco, USA) for product analytics to understand how visitors interact with the site — for example which gear categories are most popular, which filters are used, and whether features like the shoe finder work well. PostHog runs in <strong>cookieless mode</strong>: it does not set cookies, does not use localStorage, and does not store any persistent identifiers on your device. No personal data is collected. Legal basis: Art. 6(1)(f) GDPR (legitimate interest in improving the website).
      </p>
      <p style={S.p}>
        If you consent via the cookie banner ("Alle akzeptieren"), PostHog may additionally record anonymized session replays to help us identify usability issues. Session replays capture page interactions (clicks, scrolls) but do not record text input in form fields, passwords, or any personal data. You can withdraw consent at any time by clearing your browser's local storage. Legal basis: Art. 6(1)(a) GDPR (consent).
      </p>

      <h2 style={S.h2}>4. Database</h2>
      <p style={S.p}>
        Product data is stored with Supabase (Singapore Pte. Ltd.). No personal user data is collected or stored in the database.
      </p>

      <h2 style={S.h2}>5. Cookies</h2>
      <p style={S.p}>
        This website does not set any first-party cookies. When you click an affiliate link, the affiliate partner (e.g. AWIN) may set a cookie on the retailer's website to attribute the transaction. This is governed by the retailer's own privacy policy.
      </p>

      <h2 style={S.h2}>6. Local Storage</h2>
      <p style={S.p}>
        This website uses your browser's local storage (localStorage and sessionStorage) to save your filter settings and wishlist. This data stays entirely on your device and is never transmitted to our servers. It is not a cookie.
      </p>

      <h2 style={S.h2}>7. Affiliate Links</h2>
      <p style={S.p}>
        This website contains affiliate links to retailers (e.g. via the AWIN network). When you click such a link, you are redirected to the retailer's website, where their privacy policy applies. The affiliate partner may set a cookie to attribute the transaction. Legal basis: Art. 6(1)(f) GDPR (legitimate interest in funding the service). Affiliate revenue never influences our ratings or rankings.
      </p>

      <h2 style={S.h2}>8. Your Rights</h2>
      <p style={S.p}>
        You have the right to access, rectification, erasure, restriction of processing, data portability, and objection. To exercise these rights, contact: roman@climbing-gear.com
      </p>

      <h2 style={S.h2}>9. Right to Complain</h2>
      <p style={S.p}>
        You have the right to lodge a complaint with a data protection supervisory authority.
      </p>
    </>
  );
}

function TermsOfService() {
  return (
    <>
      <h1 style={S.h1}>Terms of Service</h1>
      <p style={S.subtitle}>Please read before using this website</p>

      <h2 style={S.h2}>1. Scope</h2>
      <p style={S.p}>
        These terms apply to the use of climbing-gear.com, operated by Roman Merz. By accessing this website, you agree to these terms.
      </p>

      <h2 style={S.h2}>2. Informational Purpose</h2>
      <p style={S.p}>
        All data provided on this website — including product specifications, ratings, scores, size charts, and prices — is for informational and comparison purposes only. It does not constitute a purchase recommendation, safety advice, or professional consultation.
      </p>

      <h2 style={S.h2}>3. Not a Substitute for Professional Advice</h2>
      <p style={S.p}>
        Climbing is an inherently dangerous activity. The information on this website does not replace proper instruction by qualified trainers, professional equipment fitting, or manufacturer guidelines. Always use certified equipment (UIAA/EN) and inspect your gear before every use.
      </p>

      <h2 style={S.h2}>4. Limitation of Liability</h2>
      <p style={S.p}>
        Use of this website and all information provided is at your own risk. The operator assumes no liability for damages arising from the use of or reliance on the information provided — including but not limited to incorrect purchases, injuries, or consequential damages. Prices and availability shown may differ from the actual retailer listings.
      </p>

      <h2 style={S.h2}>5. Ratings and Scores</h2>
      <p style={S.p}>
        All scores and ratings are algorithmic estimates based on publicly available manufacturer data. They are brand-neutral and serve as a guide. Individual preferences, body measurements, and intended use may lead to different experiences.
      </p>

      <h2 style={S.h2}>6. Intellectual Property</h2>
      <p style={S.p}>
        Product images are sourced from the respective manufacturers and used for informational purposes as part of product presentation. All other content (text, scores, algorithms, design) is the property of climbing-gear.com and may not be reproduced without permission.
      </p>

      <h2 style={S.h2}>7. Changes</h2>
      <p style={S.p}>
        We reserve the right to modify these terms at any time. The current version is always available on this page.
      </p>

      <p style={{ ...S.p, marginTop: "32px", fontStyle: "italic" }}>Last updated: February 2026</p>
    </>
  );
}

export default function Legal() {
  const location = useLocation();
  const isPrivacy = location.pathname === "/privacy";
  const isTerms = location.pathname === "/terms";
  const title = isTerms ? "Terms of Service" : isPrivacy ? "Privacy Policy" : "Legal Notice";
  const desc = isTerms
    ? "Terms of Service for climbing-gear.com"
    : isPrivacy
    ? "Privacy policy for climbing-gear.com"
    : "Legal notice (Impressum) for climbing-gear.com per Section 5 TMG.";
  usePageMeta(title, desc);

  return (
    <div style={S.page}>
      <header style={S.header}>
        <Link to="/" style={S.back}>{"\u2190"} Home</Link>
      </header>
      <div style={S.wrap}>
        {isTerms ? <TermsOfService /> : isPrivacy ? <PrivacyPolicy /> : <Impressum />}
      </div>
    </div>
  );
}
