import { Link, useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import useIsMobile from "./useIsMobile.js";

export default function Footer() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const goToFeedback = (e) => {
    e.preventDefault();
    navigate("/");
    setTimeout(() => {
      const el = document.getElementById("suggestion-hub");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, 300);
  };

  return (
    <footer style={{ borderTop: `1px solid ${T.border}`, background: T.bg, fontFamily: T.font }}>
      {/* Scoring disclaimer */}
      <div style={{ padding: isMobile ? "20px 16px" : "24px 32px" }}>
        <p style={{ maxWidth: "800px", margin: "0 auto", fontSize: "11px", color: T.muted, lineHeight: 1.7 }}>
          <strong style={{ fontWeight: 600 }}>Scores</strong> are algorithmic estimates based on published
          specs and climber experience. They are brand-neutral and meant as a guide — not a substitute for
          trying shoes on. Found something off?{" "}
          <a href="/" onClick={goToFeedback} style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>
            Let us know →
          </a>
        </p>
      </div>

      {/* Safety notice */}
      <div style={{ padding: isMobile ? "0 16px 16px" : "0 32px 20px" }}>
        <p style={{ maxWidth: "800px", margin: "0 auto", fontSize: "11px", color: T.muted, lineHeight: 1.7 }}>
          <strong style={{ fontWeight: 600 }}>Safety:</strong> Climbing is inherently dangerous. Data on this site is for
          informational comparison only and does not replace proper training, professional gear fitting, or manufacturer
          instructions. Always use certified equipment that meets UIAA/EN standards and inspect your gear before every use.
        </p>
      </div>

      {/* Bottom bar */}
      <div style={{
        padding: isMobile ? "14px 16px" : "18px 32px", borderTop: `1px solid ${T.border}`,
        maxWidth: "1100px", margin: "0 auto",
        display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "8px" : 0,
        justifyContent: "space-between", alignItems: "center",
        fontSize: "12px", color: T.muted,
      }}>
        <span>&copy; {new Date().getFullYear()} climbing-gear.com</span>
        <div style={{ display: "flex", gap: "20px" }}>
          <Link to="/methodology" style={{ color: T.muted, textDecoration: "none" }}>Methodology</Link>
          <Link to="/about" style={{ color: T.muted, textDecoration: "none" }}>About</Link>
          <Link to="/terms" style={{ color: T.muted, textDecoration: "none" }}>Nutzungsbedingungen</Link>
          <Link to="/impressum" style={{ color: T.muted, textDecoration: "none" }}>Impressum</Link>
          <Link to="/privacy" style={{ color: T.muted, textDecoration: "none" }}>Datenschutz</Link>
        </div>
      </div>
    </footer>
  );
}
