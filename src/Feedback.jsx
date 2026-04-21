import { useState } from "react";
import { Link } from "react-router-dom";
import { T } from "./tokens.js";
import usePageMeta from "./usePageMeta.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";

/* ─── Suggestion Hub (same form used on /about) ─── */
function SuggestionHub() {
  const [type, setType] = useState("feature");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | success | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          type,
          message: message.trim(),
          page_url: window.location.href,
        }),
      });
      if (!res.ok) throw new Error(res.statusText);
      setStatus("success");
      setMessage("");
      setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
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
            width: "100%", minHeight: "140px", padding: "14px", borderRadius: "10px",
            border: `1px solid ${T.border}`, background: T.surface, color: T.text,
            fontSize: "14px", fontFamily: T.font, resize: "vertical", outline: "none",
            lineHeight: 1.6, boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = T.accent}
          onBlur={e => e.target.style.borderColor = T.border}
        />

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", color: T.muted }}>
            {status === "success" ? "Thanks! Your feedback has been received." :
             status === "error" ? "Something went wrong. Please try again." :
             "Your feedback is stored securely and read by a real human."}
          </span>
          <button type="submit" disabled={!message.trim() || status === "sending"} style={{
            padding: "10px 24px", borderRadius: "8px", border: "none",
            background: status === "success" ? T.green : status === "error" ? T.red : message.trim() ? T.accent : T.border,
            color: (status === "success" || status === "error" || message.trim()) ? "#fff" : T.muted,
            fontSize: "13px", fontWeight: 700, cursor: message.trim() && status !== "sending" ? "pointer" : "not-allowed",
            fontFamily: T.font, transition: "all 0.2s ease",
          }}>
            {status === "sending" ? "Sending..." :
             status === "success" ? "\u{2713} Sent!" :
             status === "error" ? "Failed" :
             "Send suggestion"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Small helper card for "what to share" examples ─── */
function ExampleCard({ icon, title, text }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "16px",
    }}>
      <div style={{ fontSize: "18px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontSize: "13px", fontWeight: 700, color: T.text, marginBottom: "4px" }}>{title}</div>
      <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

export default function Feedback() {
  usePageMeta(
    "Share Your Feedback",
    "Share feedback, report bugs, suggest features, or flag data corrections for climbing-gear.com. Every message is read by a real human."
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text }}>
      <div style={{ maxWidth: "820px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb / back link */}
        <div style={{ marginBottom: "32px" }}>
          <Link to="/" style={{ fontSize: "13px", color: T.muted, textDecoration: "none", fontWeight: 500 }}>
            {"\u2190"} Back to climbing-gear.com
          </Link>
        </div>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>{"\u{1F44B}"}</div>
          <h1 style={{ fontSize: "34px", fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 16px", lineHeight: 1.2 }}>
            Tell us what you think.
          </h1>
          <p style={{ fontSize: "16px", color: T.muted, lineHeight: 1.8, maxWidth: "560px", margin: "0 auto" }}>
            climbing-gear.com is a community project. Spotted wrong data, got an idea for
            a feature, or just want to say hi? This is the place. Every message lands
            in my inbox and actually shapes what gets built next.
          </p>
        </div>

        {/* Examples */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "32px" }}>
          <ExampleCard
            icon={"\u{1F4A1}"} title="Feature idea"
            text="A filter or comparison you wish existed."
          />
          <ExampleCard
            icon={"\u{1F41B}"} title="Bug report"
            text="Something broken, confusing, or just weird."
          />
          <ExampleCard
            icon={"\u{1F4CA}"} title="Data correction"
            text="A spec, weight, or price that looks off."
          />
          <ExampleCard
            icon={"\u{1F4AC}"} title="General feedback"
            text="Anything else you want to share."
          />
        </div>

        {/* Suggestion Hub form */}
        <div id="suggestion-hub" style={{ marginBottom: "40px", scrollMarginTop: "70px" }}>
          <SuggestionHub />
        </div>

        {/* Contact card */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: "14px",
          padding: "24px", textAlign: "center",
        }}>
          <div style={{ fontSize: "22px", marginBottom: "8px" }}>{"\u{26F0}"}</div>
          <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7, margin: 0 }}>
            Prefer email? You can also reach Roman directly at{" "}
            <a href="mailto:roman@climbing-gear.com" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>
              roman@climbing-gear.com
            </a>.
          </p>
        </div>

      </div>
    </div>
  );
}
