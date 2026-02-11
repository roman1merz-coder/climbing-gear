import { useState } from "react";
import { Link } from "react-router-dom";
import { T } from "./tokens.js";

const S = {
  page: { minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text },
  header: {
    padding: "20px 32px", borderBottom: `1px solid ${T.border}`,
    position: "sticky", top: 0, background: "rgba(14,16,21,0.92)",
    backdropFilter: "blur(12px)", zIndex: 50,
  },
  back: { display: "inline-flex", alignItems: "center", gap: "8px", color: T.text, textDecoration: "none", fontWeight: 600, fontSize: "14px" },
};

// ─── Suggestion Hub ───
function SuggestionHub() {
  const [type, setType] = useState("feature");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Opens mailto with pre-filled subject
    const subject = encodeURIComponent(`[climbing-gear.com] ${type === "feature" ? "Feature request" : type === "bug" ? "Bug report" : "General feedback"}`);
    const body = encodeURIComponent(message);
    window.open(`mailto:roman1merz@gmail.com?subject=${subject}&body=${body}`, "_blank");
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const types = [
    { key: "feature", label: "Feature idea", icon: "\u{1F4A1}" },
    { key: "bug", label: "Bug report", icon: "\u{1F41B}" },
    { key: "data", label: "Data correction", icon: "\u{1F4CA}" },
    { key: "general", label: "General feedback", icon: "\u{1F4AC}" },
  ];

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "32px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.3px" }}>
        {"\u{1F4E8}"} Suggestion Hub
      </h2>
      <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7, margin: "0 0 24px" }}>
        Got an idea? Found wrong data? Every suggestion helps us build a better tool for the climbing community.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Type selector */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {types.map(t => (
            <button key={t.key} type="button" onClick={() => setType(t.key)} style={{
              padding: "8px 14px", borderRadius: "8px", border: `1px solid ${type === t.key ? T.accent : T.border}`,
              background: type === t.key ? T.accentSoft : "transparent", color: type === t.key ? T.accent : T.muted,
              fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: T.font, transition: "all 0.2s ease",
              display: "flex", alignItems: "center", gap: "6px",
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Message */}
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={
            type === "feature" ? "I'd love to see..." :
            type === "bug" ? "I noticed that..." :
            type === "data" ? "The data for [shoe model] seems off because..." :
            "Hey, just wanted to say..."
          }
          style={{
            width: "100%", minHeight: "120px", padding: "14px", borderRadius: "10px",
            border: `1px solid ${T.border}`, background: T.surface, color: T.text,
            fontSize: "13px", fontFamily: T.font, resize: "vertical", outline: "none",
            lineHeight: 1.6, boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = T.accent}
          onBlur={e => e.target.style.borderColor = T.border}
        />

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
          <span style={{ fontSize: "11px", color: T.muted }}>Opens your email client with a pre-filled message</span>
          <button type="submit" disabled={!message.trim()} style={{
            padding: "10px 24px", borderRadius: "8px", border: "none",
            background: message.trim() ? T.accent : T.border,
            color: message.trim() ? "#fff" : T.muted,
            fontSize: "13px", fontWeight: 700, cursor: message.trim() ? "pointer" : "not-allowed",
            fontFamily: T.font, transition: "all 0.2s ease",
          }}>
            {submitted ? "\u{2713} Opening email..." : "Send suggestion"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Stat card ───
function StatCard({ icon, number, label }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "20px",
      textAlign: "center", flex: 1, minWidth: "120px",
    }}>
      <div style={{ fontSize: "22px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontSize: "22px", fontWeight: 800, color: T.accent, fontFamily: "var(--mono, monospace)" }}>{number}</div>
      <div style={{ fontSize: "11px", color: T.muted, marginTop: "4px" }}>{label}</div>
    </div>
  );
}

// ─── Principle card ───
function Principle({ icon, title, description }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "20px",
      transition: "border-color 0.2s",
    }}
      onMouseOver={e => e.currentTarget.style.borderColor = "rgba(232,115,74,0.3)"}
      onMouseOut={e => e.currentTarget.style.borderColor = T.border}
    >
      <div style={{ fontSize: "20px", marginBottom: "10px" }}>{icon}</div>
      <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "6px" }}>{title}</div>
      <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.7 }}>{description}</div>
    </div>
  );
}

// ═══ ABOUT PAGE ═══
export default function About() {
  return (
    <div style={S.page}>
      <header style={S.header}>
        <Link to="/" style={S.back}>{"\u2190"} Search</Link>
      </header>

      <div style={{ maxWidth: "820px", margin: "0 auto", padding: "48px 32px 80px" }}>

        {/* Hero section */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 16px" }}>
            Built by climbers, for climbers.
          </h1>
          <p style={{ fontSize: "15px", color: T.muted, lineHeight: 1.8, maxWidth: "600px", margin: "0 auto" }}>
            climbing-gear.com exists for one reason: so you can spend more time climbing
            and less time researching your gear. We compare every model, every spec,
            every price {"\u2014"} with zero brand bias and full transparency.
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: "14px", marginBottom: "48px", flexWrap: "wrap" }}>
          <StatCard icon={"\u{1F45F}"} number="328+" label="Shoes compared" />
          <StatCard icon={"\u{1F3EA}"} number="20+" label="Retailers tracked" />
          <StatCard icon={"\u{1F3F7}"} number="Daily" label="Price updates" />
          <StatCard icon={"\u{1F6AB}"} number="0" label="Ads or sponsored rankings" />
        </div>

        {/* Mission */}
        <div style={{ marginBottom: "48px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>Why this exists</h2>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.8, marginBottom: "16px" }}>
            If you've ever spent hours comparing climbing shoes across different shops, reading
            conflicting reviews, and wondering whether that "sale" is actually a good deal {"\u2014"} you know
            the pain. I built this tool because I was tired of doing exactly that.
          </p>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.8, marginBottom: "16px" }}>
            This is a community project. There's no company behind it, no investors to
            please, and no brand partnerships influencing what gets shown first. Every shoe gets the
            same treatment. Every price is tracked the same way. The sorting algorithm doesn't care
            who made the shoe.
          </p>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.8 }}>
            We will use affiliate links in the future, but we are upfront about it {"\u2014"} and they will
            never influence rankings, recommendations, or which retailers appear first. Transparency
            is the whole point here.
          </p>
        </div>

        {/* Principles grid */}
        <div style={{ marginBottom: "48px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>Our principles</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <Principle
              icon={"\u{2696}"} title="Brand neutral"
              description="No brand pays us, sponsors us, or gets preferential placement. Every shoe is evaluated on the same criteria."
            />
            <Principle
              icon={"\u{1F3EA}"} title="Shop neutral"
              description="We track prices across all retailers equally. The cheapest price wins, regardless of which shop it comes from."
            />
            <Principle
              icon={"\u{1F50D}"} title="Full transparency"
              description="Our price tracking, scoring algorithm, and data sources are not hidden. If something looks off, tell us and we'll fix it."
            />
            <Principle
              icon={"\u{1F91D}"} title="Community-driven"
              description="This tool gets better with your feedback. Found wrong data? Have a feature idea? That's exactly what the suggestion hub below is for."
            />
          </div>
        </div>

        {/* Suggestion Hub */}
        <div style={{ marginBottom: "48px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>Help make it better</h2>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.8, marginBottom: "20px" }}>
            This is an open project. If you notice incorrect data, have an idea for a feature, or just
            want to say what's working (or not) {"\u2014"} We'd genuinely love to hear it. Every piece of
            feedback shapes what gets built next.
          </p>
          <SuggestionHub />
        </div>

        {/* Who am I */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "32px", textAlign: "center" }}>
          <div style={{ fontSize: "28px", marginBottom: "12px" }}>{"\u{26F0}"}</div>
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>Who's behind this?</h2>
          <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7, maxWidth: "500px", margin: "0 auto" }}>
            Hi, I'm Roman {"\u2014"} a climber based in beautiful Palatine, Germany. I built climbing-gear.com
            because I wanted the tool I couldn't find anywhere else. If you have questions or just want
            to chat about climbing gear, drop me a line at{" "}
            <a href="mailto:roman1merz@gmail.com" style={{ color: T.accent, textDecoration: "none" }}>roman1merz@gmail.com</a>.
          </p>
        </div>

      </div>
    </div>
  );
}
