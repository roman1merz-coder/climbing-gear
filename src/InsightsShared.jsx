import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { T } from "./tokens.js";

/* ─── Responsive hook ─── */
export function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return m;
}

/* ─── Collapsible sub-section ─── */
export function Collapsible({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: "28px" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "8px", width: "100%",
          fontSize: "16px", fontWeight: 700, color: T.text, background: "none", border: "none",
          borderBottom: `1px solid ${T.border}`, paddingBottom: "8px", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "rotate(0)", fontSize: "12px", color: T.muted }}>▶</span>
        {title}
      </button>
      <div style={{
        maxHeight: open ? "5000px" : "0", overflow: "hidden",
        transition: "max-height 0.35s ease-in-out", opacity: open ? 1 : 0,
      }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Chart container ─── */
export function ChartContainer({ title, subtitle, children, style }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "24px", ...style }}>
      {title && <div style={{ fontSize: "15px", fontWeight: 700, color: T.text, marginBottom: subtitle ? "4px" : "16px" }}>{title}</div>}
      {subtitle && <div style={{ fontSize: "12px", color: T.muted, marginBottom: "16px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}

/* ─── Stat card ─── */
export function StatCard({ label, value, sub, color = T.accent }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "16px", textAlign: "center", flex: "1 1 120px" }}>
      <div style={{ fontSize: "11px", color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 800, color, letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: T.muted, marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

/* ─── Article header ─── */
export function ArticleHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h1 style={{ fontSize: "26px", fontWeight: 800, color: T.text, letterSpacing: "-0.5px", lineHeight: 1.3, margin: "0 0 8px" }}>{title}</h1>
      <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.6, margin: 0 }}>{subtitle}</p>
    </div>
  );
}

/* ─── Section heading ─── */
export function SectionHeading({ children }) {
  return (
    <div style={{ fontSize: "16px", fontWeight: 700, color: T.text, marginTop: "28px", marginBottom: "12px", borderBottom: `1px solid ${T.border}`, paddingBottom: "8px" }}>
      {children}
    </div>
  );
}

/* ─── Prose ─── */
export function Prose({ children }) {
  return <div style={{ fontSize: "14px", color: "#c0c4ce", lineHeight: 1.8, margin: "20px 0" }}>{children}</div>;
}

/* ─── Key insight callout ─── */
export function KeyInsight({ children, color = T.accent }) {
  const softBg = color === T.yellow ? T.yellowSoft : color === T.green ? T.greenSoft : color === T.red ? T.redSoft : color === T.blue ? T.blueSoft : color === T.purple ? T.purpleSoft : T.accentSoft;
  return (
    <div style={{ borderLeft: `3px solid ${color}`, margin: "20px 0", background: softBg, borderRadius: "0 8px 8px 0", padding: "14px 18px 14px 18px" }}>
      <div style={{ fontSize: "13.5px", color: T.text, lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

/* ─── Article page wrapper (shared layout) ─── */
export function ArticleLayout({ children, isMobile, breadcrumb }) {
  return (
    <div style={{ fontFamily: T.font, color: T.text, minHeight: "100vh", padding: isMobile ? "20px 12px 60px" : "40px 24px 80px" }}>
      <div style={{ maxWidth: "820px", margin: "0 auto" }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: "20px", fontSize: "12px", color: T.muted }}>
          <Link to="/insights" style={{ color: T.accent, textDecoration: "none", fontWeight: 600 }}>← All Insights</Link>
          {breadcrumb && <span> / {breadcrumb}</span>}
        </div>
        {/* Article body */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: "16px",
          padding: isMobile ? "24px 16px" : "40px 36px",
          marginBottom: "32px",
        }}>
          {children}
        </div>
        {/* Read more */}
        <MoreArticles />
      </div>
    </div>
  );
}

/* ─── "More articles" footer linking to other insights ─── */
export function MoreArticles() {
  const articles = [
    { to: "/insights/inflatable-crashpads", label: "Inflatable Crashpads: Game-Changer or Gimmick?", tag: "Crashpads", color: T.yellow },
    { to: "/insights/rope-cost-vs-safety", label: "Does Spending More Buy a Safer Rope?", tag: "Ropes", color: T.green },
    { to: "/insights/climbing-shoe-guide", label: "How to Pick Your Climbing Shoe", tag: "Shoes", color: T.accent },
  ];
  return (
    <div style={{ marginTop: "12px" }}>
      <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "12px" }}>More Insights</div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {articles.map(a => (
          <Link key={a.to} to={a.to} style={{
            flex: "1 1 200px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: "10px",
            padding: "14px 16px", textDecoration: "none", transition: "transform 0.15s",
          }}
            onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}
          >
            <span style={{ fontSize: "10px", fontWeight: 600, color: a.color, background: `${a.color}15`, padding: "2px 8px", borderRadius: "4px" }}>{a.tag}</span>
            <div style={{ fontSize: "13px", fontWeight: 600, color: T.text, marginTop: "8px", lineHeight: 1.4 }}>{a.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── Image with caption ─── */
export function ArticleImage({ src, alt, caption }) {
  return (
    <>
      <div style={{ borderRadius: T.radius, overflow: "hidden", margin: "20px 0", border: `1px solid ${T.border}` }}>
        <img src={src} alt={alt} style={{ width: "100%", height: "auto", display: "block" }} loading="lazy" />
      </div>
      {caption && (
        <div style={{ fontSize: "11px", color: T.muted, marginTop: "-12px", marginBottom: "16px", fontStyle: "italic" }}>
          {caption}
        </div>
      )}
    </>
  );
}

/* ─── Methodology footer ─── */
export function MethodologyFooter({ children }) {
  return (
    <div style={{ marginTop: "32px", padding: "20px", background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Methodology</div>
      <p style={{ fontSize: "12px", color: T.muted, lineHeight: 1.7, margin: 0 }}>{children}</p>
    </div>
  );
}
