import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import useIsMobile from "./useIsMobile.js";

const S = {
  page: { minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text },
  wrap: { maxWidth: "820px", margin: "0 auto", padding: "0 24px 60px" },
  header: {
    padding: "20px 24px", borderBottom: `1px solid ${T.border}`,
    display: "flex", alignItems: "center", gap: "12px",
  },
  back: { display: "inline-flex", alignItems: "center", gap: "6px", color: T.muted, textDecoration: "none", fontWeight: 600, fontSize: "14px" },
};

/* ─── Collapsible panel (reused for inline version) ─── */
export function ScoringDisclaimer({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden", marginBottom: "16px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer",
          fontFamily: T.font, color: T.text, fontSize: "13px", fontWeight: 600,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
          </svg>
          How we score shoes
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ padding: "0 18px 18px", fontSize: "13px", lineHeight: 1.8, color: T.muted }}>
          <p style={{ marginBottom: "12px" }}>
            Our performance scores are calculated from shoe specifications — downturn, rubber type &amp; thickness,
            midsole, closure, and more — using algorithms we've developed and refined with input from experienced
            climbers. They're designed to give you a useful starting point, not the final word.
          </p>
          <p style={{ marginBottom: "12px" }}>
            Every foot is different, every rock is different, and every climber has preferences that no formula
            can capture. Treat these as directional — a way to narrow down your options before you try them on.
          </p>
          <p style={{ marginBottom: "16px" }}>
            We have no brand affiliations or sponsorships. Every shoe is scored by the same formulas using the same data.
          </p>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", fontSize: "12px" }}>
            <Link to="/methodology" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>
              How each score works →
            </Link>
            <Link to="/" onClick={(e) => { e.preventDefault(); const el = document.getElementById("suggestion-hub"); if (el) { el.scrollIntoView({ behavior: "smooth" }); } else { window.location.href = "/"; } }}
              style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>
              Suggest an improvement →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Attribute Card ─── */
function AttrCard({ name, icon, children }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
      padding: "20px", marginBottom: "12px",
    }}>
      <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "18px" }}>{icon}</span> {name}
      </h3>
      <p style={{ fontSize: "13px", lineHeight: 1.8, color: T.muted, margin: 0 }}>{children}</p>
    </div>
  );
}

/* ─── Full Methodology Page ─── */
export default function Methodology() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={{ ...S.back, background: "none", border: "none", cursor: "pointer" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
      </div>

      <div style={S.wrap}>
        {/* Hero */}
        <div style={{ padding: "40px 0 32px" }}>
          <h1 style={{ fontSize: isMobile ? "24px" : "30px", fontWeight: 700, marginBottom: "12px" }}>
            How we score shoes
          </h1>
          <p style={{ fontSize: "15px", lineHeight: 1.8, color: T.muted, maxWidth: "640px" }}>
            Our performance scores are calculated from shoe specifications — downturn, rubber type &amp; thickness,
            midsole, closure, and more — using algorithms we've developed and refined with input from experienced
            climbers. They're designed to give you a useful starting point, not the final word.
          </p>
          <p style={{ fontSize: "15px", lineHeight: 1.8, color: T.muted, maxWidth: "640px", marginTop: "12px" }}>
            Every foot is different, every rock is different, and every climber has preferences that no formula
            can capture. Treat these as directional — a way to narrow down your options before you try them on.
          </p>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px", marginTop: "20px",
            padding: "8px 14px", borderRadius: T.radiusSm, background: T.accentSoft,
            fontSize: "13px", fontWeight: 600, color: T.accent,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Brand-neutral — no affiliations, no sponsorships. Same formulas, same data.
          </div>
        </div>

        {/* Performance Attributes */}
        <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px", borderTop: `1px solid ${T.border}`, paddingTop: "24px" }}>
          Performance Attributes
        </h2>

        <AttrCard name="Edging" icon="🗡️">
          How well a shoe stands on small footholds. Driven by shape (downturn + asymmetry) combined
          with construction stiffness and hard rubber. A flat shoe won't score high here no matter how
          stiff it is — shape acts as a gatekeeper.
        </AttrCard>

        <AttrCard name="Smearing" icon="🧈">
          How well rubber conforms to flat or rounded rock. Soft, flexible shoes score highest because
          the rubber molds to the surface. Even aggressive shoes can smear well if the rubber is soft enough.
        </AttrCard>

        <AttrCard name="Sensitivity" icon="🤏">
          How much rock feedback reaches your foot. Thin rubber and minimal midsole are the main drivers.
          Hard rubber dampens feedback even when thin, so soft + thin scores highest.
        </AttrCard>

        <AttrCard name="Comfort" icon="☁️">
          How wearable the shoe is for longer sessions. Flat shape, soft feel, good cushioning, and
          closure all contribute. Aggressive shoes score lower here by design.
        </AttrCard>

        <AttrCard name="Support" icon="🏗️">
          Structural rigidity and stability. Stiff feel, hard rubber, thick sole, full midsole, and
          lace closure all add support. Often the opposite of sensitivity.
        </AttrCard>

        <AttrCard name="Pockets" icon="🕳️">
          Performance on small pockets and holes in the rock. Aggressive downturn, strong asymmetry,
          pointed toe, and stiffness help concentrate force on tiny features.
        </AttrCard>

        <AttrCard name="Hooks" icon="🪝">
          Ability to hook holds with heel and toe. Heel rubber coverage, toe patch quality, and
          downturn are the main factors. Softer shoes provide better feedback for precise placement.
        </AttrCard>

        {/* Spec Attributes */}
        <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px", paddingTop: "24px", borderTop: `1px solid ${T.border}` }}>
          Spec Attributes
        </h2>

        <AttrCard name="Downturn / Asymmetry / Weight" icon="📐">
          These are closer to raw specs, with small secondary factors blended in for nuance — for example,
          a stiffer shoe with the same stated downturn will feel slightly more aggressive in practice.
        </AttrCard>

        {/* Feedback CTA */}
        <div style={{
          marginTop: "32px", padding: "24px", borderRadius: T.radius,
          background: T.surface, border: `1px solid ${T.border}`, textAlign: "center",
        }}>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "16px" }}>
            Think a score looks off? We'd love to hear your take — especially from climbers who've
            actually worn the shoes.
          </p>
          <Link to="/" onClick={(e) => {
            e.preventDefault();
            navigate("/");
            setTimeout(() => {
              const el = document.getElementById("suggestion-hub");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }, 300);
          }} style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "10px 20px", borderRadius: T.radiusSm,
            background: T.accent, color: "#fff", textDecoration: "none",
            fontWeight: 600, fontSize: "13px", fontFamily: T.font,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Suggest an improvement
          </Link>
        </div>
      </div>
    </div>
  );
}
