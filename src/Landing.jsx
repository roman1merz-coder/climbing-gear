import { useState, useEffect } from "react";
import usePageMeta from "./usePageMeta.js";
import { Link } from "react-router-dom";
import { T } from "./tokens.js";
import SHOES from "./seed_data.json";
import ROPES from "./rope_seed_data.json";
import BELAYS from "./belay_seed_data.json";
import PADS from "./crashpad_seed_data.json";

const TOTAL_PRODUCTS = SHOES.length + ROPES.length + BELAYS.length + PADS.length;

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

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";

// ─── Gear Selector Card ───
function GearCard({ title, shortTitle, count, description, to, active, cta = "Open selector", mobileCta = "Browse" }) {
  const isMobile = useIsMobile();

  // Mobile compact 2×2 card
  if (isMobile) {
    return active ? (
      <Link to={to} style={{
        background: T.card, border: `1px solid ${T.accent}40`, borderRadius: "12px",
        padding: "18px 16px", textDecoration: "none",
        display: "flex", flexDirection: "column", gap: "4px",
        transition: "all 0.25s ease", cursor: "pointer",
      }}>
        <div style={{ fontSize: "14px", fontWeight: 800, color: T.text }}>{shortTitle || title}</div>
        {count && <div style={{ fontSize: "12px", color: T.muted }}>{count}</div>}
        <div style={{ color: T.accent, fontSize: "12px", fontWeight: 700, marginTop: "10px" }}>
          {mobileCta} {"\u2192"}
        </div>
      </Link>
    ) : (
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: "12px",
        padding: "18px 16px", opacity: 0.5,
        display: "flex", flexDirection: "column", gap: "4px",
      }}>
        <div style={{ fontSize: "14px", fontWeight: 800, color: T.muted }}>{shortTitle || title}</div>
        {count && <div style={{ fontSize: "12px", color: T.muted }}>{count}</div>}
      </div>
    );
  }

  // Desktop full card
  return active ? (
    <Link to={to} style={{
      background: T.card, border: `1px solid ${T.accent}40`, borderRadius: "14px",
      padding: "32px 28px", textDecoration: "none",
      display: "flex", flexDirection: "column", gap: "12px",
      transition: "all 0.25s ease", cursor: "pointer", position: "relative", overflow: "hidden",
    }}
      onMouseOver={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 32px ${T.accent}20`; }}
      onMouseOut={e => { e.currentTarget.style.borderColor = `${T.accent}40`; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ position: "absolute", top: "12px", right: "14px", fontSize: "10px", fontWeight: 700, color: T.accent, background: T.accentSoft, padding: "3px 10px", borderRadius: "6px", letterSpacing: "0.5px", textTransform: "uppercase" }}>Live</div>
      <div>
        <div style={{ fontSize: "18px", fontWeight: 800, color: T.text, letterSpacing: "-0.3px", marginBottom: "6px" }}>{title}</div>
        <div style={{ fontSize: "13px", color: T.muted, lineHeight: 1.6 }}>{description}</div>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: T.accent, fontSize: "13px", fontWeight: 700, marginTop: "auto" }}>
        {cta} <span style={{ fontSize: "16px" }}>{"\u2192"}</span>
      </div>
    </Link>
  ) : (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: "14px",
      padding: "32px 28px", opacity: 0.6,
      display: "flex", flexDirection: "column", gap: "12px", position: "relative",
    }}>
      <div style={{ position: "absolute", top: "12px", right: "14px", fontSize: "10px", fontWeight: 700, color: T.muted, background: `${T.border}`, padding: "3px 10px", borderRadius: "6px", letterSpacing: "0.5px", textTransform: "uppercase" }}>Coming Soon</div>
      <div>
        <div style={{ fontSize: "18px", fontWeight: 800, color: T.muted, letterSpacing: "-0.3px", marginBottom: "6px" }}>{title}</div>
        <div style={{ fontSize: "13px", color: T.muted, lineHeight: 1.6, opacity: 0.7 }}>{description}</div>
      </div>
    </div>
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
      const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
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
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? "10px" : "14px" }}>
          <GearCard title="Shoe Selector" shortTitle="Shoes" count={`${SHOES.length} models`} to="/shoes" active description="330+ climbing shoes compared across 20+ retailers. Find your perfect fit with smart filters and daily price tracking." />
          <GearCard title="Rope Selector" shortTitle="Ropes" count={`${ROPES.length} models`} to="/ropes" active description="Dynamic, static, half, and twin ropes. Compare diameter, weight, falls rated, and dry treatment across all major brands." />
          <GearCard title="Belay Device Selector" shortTitle="Belay Devices" count={`${BELAYS.length} models`} to="/belays" active description="Cam, passive-assist, tube, and guide devices. Compare weight, rope range, safety features, and price." />
          <GearCard title="Crashpad Selector" shortTitle="Crashpads" count={`${PADS.length} models`} to="/crashpads" active description="Bouldering pads from sit-start to oversized. Compare dimensions, foam systems, weight, and portability." />
          {showMore && <>
            <GearCard title="Helmet Selector" shortTitle="Helmets" description="Climbing helmets for sport, trad, and alpine. Compare weight, ventilation, protection rating, and adjustability." />
            <GearCard title="Quickdraw Selector" shortTitle="Quickdraws" description="Sport and alpine quickdraws. Compare gate type, weight, sling length, and carabiner nose design." />
            <GearCard title="Harness Selector" shortTitle="Harnesses" description="Sport, trad, alpine, and big wall harnesses. Compare weight, gear loops, comfort, and adjustability." />
            <GearCard title="Pants Selector" shortTitle="Pants" description="Climbing pants and shorts. Compare stretch, durability, weather protection, and pocket layout." />
            <GearCard title="Jacket Selector" shortTitle="Jackets" description="Shell, softshell, and insulation layers. Compare breathability, waterproofing, and packability." />
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

      {/* ─── Gear Insights ─── */}
      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: `${isMobile ? "48px 16px" : "64px 32px"} 0` }}>
        <h2 style={{ fontSize: isMobile ? "16px" : "18px", fontWeight: 700, marginBottom: "20px", paddingLeft: isMobile ? 0 : "4px" }}>
          Gear Insights
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: isMobile ? "10px" : "14px" }}>
          <GearCard title="Inflatable Crashpads: Game-Changer or Gimmick?" shortTitle="Inflatable Crashpads: Gimmick?" to="/insights#crashpads" active cta="Read insight" mobileCta="Read" description="They shatter the weight curve, fit inside your main pad, and double as a mattress. But would you trust one on sharp rock?" />
          <GearCard title="Does Spending More Buy a Safer Rope?" shortTitle="Does Price = Safer Rope?" to="/insights#ropes" active cta="Read insight" mobileCta="Read" description="We crunched cost-per-gram, UIAA falls, and weight across 106 single ropes. The data challenges some common assumptions." />
          {!isMobile && <GearCard title="More Insights in the Making" description="New data-driven articles are on the way. Got a topic you'd like us to cover? Drop us a suggestion below." />}
        </div>
      </section>

      {/* ─── About (condensed) ─── */}
      <section id="about" style={{ maxWidth: "1100px", margin: "0 auto", padding: `${isMobile ? "48px 16px" : "64px 32px"} 0` }}>

        {/* Stats strip */}
        <div style={{ display: "flex", gap: "14px", marginBottom: "32px", flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { number: String(TOTAL_PRODUCTS), label: "Products compared" },
            { number: "20+", label: "Retailers tracked" },
            { number: "Daily", label: "Price updates" },
            { number: "0", label: "Ads or sponsored rankings" },
          ].map(s => (
            <div key={s.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "16px", textAlign: "center", flex: 1, minWidth: "110px" }}>
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
