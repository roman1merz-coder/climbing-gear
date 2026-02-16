import { useState, useEffect } from "react";
import usePageMeta from "./usePageMeta.js";
import { Link } from "react-router-dom";
import { T } from "./tokens.js";

// ─── Responsive hook ───
function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
}

// ─── Supabase (for Suggestion Hub) ───
const SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjA3OTEsImV4cCI6MjA4NjEzNjc5MX0.QH3wFa14gSvRKOz8Q099sbKvKoSroGJfPerdZgPtbTI";

// ─── Gear Selector Card ───
function GearCard({ icon, title, description, to, active }) {
  const isMobile = useIsMobile();
  return active ? (
    <Link to={to} style={{
      background: T.card, border: `1px solid ${T.accent}40`, borderRadius: "14px",
      padding: isMobile ? "24px 20px" : "32px 28px", textDecoration: "none",
      display: "flex", flexDirection: "column", gap: "12px",
      transition: "all 0.25s ease", cursor: "pointer", position: "relative", overflow: "hidden",
    }}
      onMouseOver={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 32px ${T.accent}20`; }}
      onMouseOut={e => { e.currentTarget.style.borderColor = `${T.accent}40`; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ position: "absolute", top: "12px", right: "14px", fontSize: "10px", fontWeight: 700, color: T.accent, background: T.accentSoft, padding: "3px 10px", borderRadius: "6px", letterSpacing: "0.5px", textTransform: "uppercase" }}>Live</div>
      <div style={{ fontSize: isMobile ? "32px" : "38px" }}>{icon}</div>
      <div>
        <div style={{ fontSize: isMobile ? "16px" : "18px", fontWeight: 800, color: T.text, letterSpacing: "-0.3px", marginBottom: "6px" }}>{title}</div>
        <div style={{ fontSize: "13px", color: T.muted, lineHeight: 1.6 }}>{description}</div>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: T.accent, fontSize: "13px", fontWeight: 700, marginTop: "auto" }}>
        Open selector <span style={{ fontSize: "16px" }}>{"\u2192"}</span>
      </div>
    </Link>
  ) : (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: "14px",
      padding: isMobile ? "24px 20px" : "32px 28px", opacity: 0.6,
      display: "flex", flexDirection: "column", gap: "12px", position: "relative",
    }}>
      <div style={{ position: "absolute", top: "12px", right: "14px", fontSize: "10px", fontWeight: 700, color: T.muted, background: `${T.border}`, padding: "3px 10px", borderRadius: "6px", letterSpacing: "0.5px", textTransform: "uppercase" }}>Coming Soon</div>
      <div style={{ fontSize: isMobile ? "32px" : "38px", filter: "grayscale(0.5)" }}>{icon}</div>
      <div>
        <div style={{ fontSize: isMobile ? "16px" : "18px", fontWeight: 800, color: T.muted, letterSpacing: "-0.3px", marginBottom: "6px" }}>{title}</div>
        <div style={{ fontSize: "13px", color: T.muted, lineHeight: 1.6, opacity: 0.7 }}>{description}</div>
      </div>
    </div>
  );
}

// ─── Content Hub Card (Insights / News / Deals) ───
function ContentCard({ icon, title, tagline, color, to }) {
  const isMobile = useIsMobile();
  const Wrap = to ? Link : "div";
  const wrapProps = to ? { to, style: { textDecoration: "none" } } : {};
  return (
    <Wrap {...wrapProps} style={{
      background: T.card, border: `1px solid ${to ? `${color}40` : T.border}`, borderRadius: "14px",
      padding: isMobile ? "24px 20px" : "28px 24px", flex: 1, minWidth: "240px",
      position: "relative", overflow: "hidden", textDecoration: "none",
      cursor: to ? "pointer" : "default", transition: "all 0.25s",
    }}
      onMouseOver={to ? e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = "translateY(-2px)"; } : undefined}
      onMouseOut={to ? e => { e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.transform = "translateY(0)"; } : undefined}
    >
      {to
        ? <div style={{ position: "absolute", top: "12px", right: "14px", fontSize: "10px", fontWeight: 700, color, background: `${color}18`, padding: "3px 10px", borderRadius: "6px", letterSpacing: "0.5px", textTransform: "uppercase" }}>Live</div>
        : <div style={{ position: "absolute", top: "12px", right: "14px", fontSize: "10px", fontWeight: 700, color: T.muted, background: T.border, padding: "3px 10px", borderRadius: "6px", letterSpacing: "0.5px", textTransform: "uppercase" }}>Coming Soon</div>
      }
      <div style={{ fontSize: "28px", marginBottom: "14px", width: "48px", height: "48px", borderRadius: "12px", background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <div style={{ fontSize: "16px", fontWeight: 800, color: T.text, letterSpacing: "-0.2px", marginBottom: "8px" }}>{title}</div>
      <div style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7 }}>{tagline}</div>
      {to && <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color, fontSize: "13px", fontWeight: 700, marginTop: "12px" }}>Read insights →</div>}
    </Wrap>
  );
}

// ─── Suggestion Hub ───
function SuggestionHub() {
  const [type, setType] = useState("feature");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch(`${SB_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ type, message: message.trim(), page_url: window.location.href }),
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
    { key: "question", label: "Gear question", icon: "\u{2753}" },
    { key: "feature", label: "Feature idea", icon: "\u{1F4A1}" },
    { key: "bug", label: "Bug report", icon: "\u{1F41B}" },
    { key: "data", label: "Data correction", icon: "\u{1F4CA}" },
    { key: "general", label: "General feedback", icon: "\u{1F4AC}" },
  ];

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "14px", padding: "32px" }}>
      <h3 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.3px" }}>{"\u{1F4E8}"} Suggestion Hub</h3>
      <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7, margin: "0 0 24px" }}>Got a gear question? An idea? Found wrong data? Ask anything or help us build a better tool for the climbing community.</p>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {types.map(t => (
            <button key={t.key} type="button" onClick={() => setType(t.key)} style={{
              padding: "8px 14px", borderRadius: "8px", border: `1px solid ${type === t.key ? T.accent : T.border}`,
              background: type === t.key ? T.accentSoft : "transparent", color: type === t.key ? T.accent : T.muted,
              fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: T.font, transition: "all 0.2s", display: "flex", alignItems: "center", gap: "6px",
            }}><span>{t.icon}</span> {t.label}</button>
          ))}
        </div>
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          placeholder={type === "question" ? "Which crashpad is best for highball bouldering on a budget?" : type === "feature" ? "I'd love to see..." : type === "bug" ? "I noticed that..." : type === "data" ? "The data for [shoe model] seems off because..." : "Hey, just wanted to say..."}
          style={{ width: "100%", minHeight: "100px", padding: "14px", borderRadius: "10px", border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: "13px", fontFamily: T.font, resize: "vertical", outline: "none", lineHeight: 1.6, boxSizing: "border-box" }}
          onFocus={e => e.target.style.borderColor = T.accent} onBlur={e => e.target.style.borderColor = T.border}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
          <span style={{ fontSize: "11px", color: T.muted }}>
            {status === "success" ? "Thanks! Your feedback has been received." : status === "error" ? "Something went wrong. Please try again." : "Your feedback is stored securely and read by a real human."}
          </span>
          <button type="submit" disabled={!message.trim() || status === "sending"} style={{
            padding: "10px 24px", borderRadius: "8px", border: "none",
            background: status === "success" ? T.green : status === "error" ? T.red : message.trim() ? T.accent : T.border,
            color: (status === "success" || status === "error" || message.trim()) ? "#fff" : T.muted,
            fontSize: "13px", fontWeight: 700, cursor: message.trim() && status !== "sending" ? "pointer" : "not-allowed", fontFamily: T.font, transition: "all 0.2s",
          }}>
            {status === "sending" ? "Sending..." : status === "success" ? "\u{2713} Sent!" : status === "error" ? "Failed" : type === "question" ? "Ask question" : "Send suggestion"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════════
export default function Landing() {
  usePageMeta(null, null);
  const isMobile = useIsMobile();
  const pad = isMobile ? "20px 16px" : "0 32px";
  const [showMore, setShowMore] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text }}>

      {/* ─── Hero ─── */}
      <section style={{ textAlign: "center", padding: isMobile ? "48px 20px 40px" : "72px 32px 56px", maxWidth: "800px", margin: "0 auto" }}>
        <h1 style={{ fontSize: isMobile ? "28px" : "42px", fontWeight: 800, letterSpacing: "-0.8px", margin: "0 0 18px", lineHeight: 1.15 }}>
          Scroll less. Climb more.
        </h1>
        <p style={{ fontSize: isMobile ? "14px" : "16px", color: T.muted, lineHeight: 1.8, maxWidth: "620px", margin: "0 auto" }}>
          Data-driven comparison tools for every piece of climbing gear. Every model, every spec, every price {"\u2014"} with zero brand bias and full transparency.
        </p>
      </section>

      {/* ─── Gear Selectors ─── */}
      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: pad }}>
        <h2 style={{ fontSize: isMobile ? "16px" : "18px", fontWeight: 700, marginBottom: "20px", paddingLeft: isMobile ? 0 : "4px" }}>
          Gear Selectors
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "14px" }}>
          <GearCard icon={"\u{1F45F}"} title="Shoe Selector" to="/shoes" active description="330+ climbing shoes compared across 20+ retailers. Find your perfect fit with smart filters and daily price tracking." />
          <GearCard icon={"\u{1FA22}"} title="Rope Selector" to="/ropes" active description="Dynamic, static, half, and twin ropes. Compare diameter, weight, falls rated, and dry treatment across all major brands." />
          <GearCard icon={"\u{1F517}"} title="Belay Device Selector" to="/belays" active description="Cam, passive-assist, tube, and guide devices. Compare weight, rope range, safety features, and price." />
          <GearCard icon={"\u{1F9FB}"} title="Crashpad Selector" to="/crashpads" active description="Bouldering pads from sit-start to oversized. Compare dimensions, foam systems, weight, and portability." />
          {showMore && <>
            <GearCard icon={"\u{26D1}"} title="Helmet Selector" description="Climbing helmets for sport, trad, and alpine. Compare weight, ventilation, protection rating, and adjustability." />
            <GearCard icon={"\u{1F4CE}"} title="Quickdraw Selector" description="Sport and alpine quickdraws. Compare gate type, weight, sling length, and carabiner nose design." />
            <GearCard icon={"\u{1FA93}"} title="Harness Selector" description="Sport, trad, alpine, and big wall harnesses. Compare weight, gear loops, comfort, and adjustability." />
            <GearCard icon={"\u{1F9D7}"} title="Pants Selector" description="Climbing pants and shorts. Compare stretch, durability, weather protection, and pocket layout." />
            <GearCard icon={"\u{1F9E5}"} title="Jacket Selector" description="Shell, softshell, and insulation layers. Compare breathability, waterproofing, and packability." />
          </>}
        </div>
        <button onClick={() => setShowMore(v => !v)} style={{
          display: "flex", alignItems: "center", gap: "6px", margin: "16px auto 0", padding: "10px 20px",
          background: "none", border: `1px solid ${T.border}`, borderRadius: "8px",
          color: T.muted, fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: T.font, transition: "all 0.2s",
        }}
          onMouseOver={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
        >
          {showMore ? "Show less" : "5 more selectors coming soon"} <span style={{ fontSize: "10px", transition: "transform 0.2s", transform: showMore ? "rotate(180deg)" : "rotate(0)" }}>{"\u25BC"}</span>
        </button>
      </section>

      {/* ─── Content Hub ─── */}
      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: `${isMobile ? "48px 16px" : "64px 32px"} 0` }}>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          <ContentCard
            icon={"\u{1F4CA}"} title="Gear Insights" color={T.purple} to="/insights"
            tagline="You'd be surprised what emerges when you compare every climbing product side by side. Data-driven insights no catalog can give you."
          />
        </div>
      </section>

      {/* ─── About (condensed) ─── */}
      <section id="about" style={{ maxWidth: "1100px", margin: "0 auto", padding: `${isMobile ? "48px 16px" : "64px 32px"} 0` }}>

        {/* Stats strip */}
        <div style={{ display: "flex", gap: "14px", marginBottom: "32px", flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { icon: "\u{1F3AF}", number: "500+", label: "Products compared" },
            { icon: "\u{1F3EA}", number: "20+", label: "Retailers tracked" },
            { icon: "\u{1F3F7}", number: "Daily", label: "Price updates" },
            { icon: "\u{1F6AB}", number: "0", label: "Ads or sponsored rankings" },
          ].map(s => (
            <div key={s.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "16px", textAlign: "center", flex: 1, minWidth: "110px" }}>
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>{s.icon}</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: T.accent, fontFamily: T.mono }}>{s.number}</div>
              <div style={{ fontSize: "11px", color: T.muted, marginTop: "4px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Who + mission in one compact card */}
        <div style={{ maxWidth: "820px", margin: "0 auto 32px", background: T.card, border: `1px solid ${T.border}`, borderRadius: "14px", padding: isMobile ? "24px 20px" : "28px 32px", textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.8, maxWidth: "560px", margin: "0 auto 8px" }}>
            Built by Roman {"\u2014"} a climber in Palatine, Germany {"\u2014"} because comparing gear across shops was taking
            longer than the actual climbing. No brand partnerships, no sponsored rankings. Just data.
          </p>
          <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7, margin: "0 auto" }}>
            Affiliate links help keep the lights on but never influence rankings.{" "}
            <a href="mailto:roman@climbing-gear.com" style={{ color: T.accent, textDecoration: "none" }}>roman@climbing-gear.com</a>
          </p>
        </div>

        {/* Suggestion Hub */}
        <div id="suggestion-hub" style={{ maxWidth: "820px", margin: "0 auto 40px", scrollMarginTop: "70px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>Help make it better</h3>
          <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.8, marginBottom: "20px" }}>
            Found wrong data, have a feature idea, or just want to say what's working?
            Every piece of feedback shapes what gets built next.
          </p>
          <SuggestionHub />
        </div>
      </section>

      {/* ─── Disclaimer ─── */}
      <div style={{ padding: isMobile ? "20px 16px" : "24px 32px", borderTop: `1px solid ${T.border}`, background: T.bg }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <p style={{ fontSize: "11px", color: T.muted, lineHeight: 1.7, fontFamily: T.font, margin: 0, maxWidth: "800px" }}>
            <strong style={{ color: T.muted, fontWeight: 600 }}>Disclaimer:</strong>{" "}
            Prices, availability, and product data are provided for informational purposes only and may change without notice.
            This site contains affiliate links {"\u2014"} if you purchase through these links, we may earn a commission at no extra cost to you.
            Product images and specifications are sourced from manufacturers and retailers.
            Community reviews reflect individual experiences and may not represent typical results.
            Always verify pricing and details with the retailer before purchasing.
          </p>
        </div>
      </div>

      {/* ─── Footer ─── */}
      <footer style={{
        padding: isMobile ? "16px" : "24px 32px", borderTop: `1px solid ${T.border}`,
        display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "8px" : 0,
        justifyContent: "space-between", alignItems: "center",
        fontSize: "12px", color: T.muted, fontFamily: T.font, maxWidth: "1100px", margin: "0 auto",
      }}>
        <span>&copy; {new Date().getFullYear()} climbing-gear.com</span>
        <div style={{ display: "flex", gap: "20px" }}>
          <a href="#about" style={{ color: T.muted, textDecoration: "none" }}>About</a>
          <Link to="/impressum" style={{ color: T.muted, textDecoration: "none" }}>Impressum</Link>
          <Link to="/privacy" style={{ color: T.muted, textDecoration: "none" }}>Datenschutz</Link>
        </div>
      </footer>

    </div>
  );
}
