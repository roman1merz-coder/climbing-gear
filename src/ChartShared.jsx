import { useState } from "react";
import { T } from "./tokens.js";

/* ─── Chart Container ─── */
export function ChartContainer({ title, subtitle, children, style }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "24px", overflow: "hidden", minWidth: 0, maxWidth: "100%", position: "relative", ...style }}>
      {title && <div style={{ fontSize: "15px", fontWeight: 700, color: T.text, marginBottom: subtitle ? "4px" : "16px" }}>{title}</div>}
      {subtitle && <div style={{ fontSize: "12px", color: T.muted, marginBottom: "16px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}

/* ─── Pill ─── */
export function Pill({ color, label, hidden, onClick, shape }) {
  return (
    <span onClick={onClick} style={{
      fontSize: "10px", color: hidden ? "#4a5568" : T.muted, display: "flex", alignItems: "center", gap: "4px",
      cursor: "pointer", padding: "2px 8px", borderRadius: "10px", userSelect: "none",
      background: hidden ? "transparent" : "rgba(255,255,255,.04)",
      border: `1px solid ${hidden ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.1)"}`,
      opacity: hidden ? 0.4 : 1, textDecoration: hidden ? "line-through" : "none",
      transition: "all .15s",
    }}>
      {shape === "diamond" ? (
        <span style={{ width: "8px", height: "8px", background: color, display: "inline-block", opacity: hidden ? 0.3 : 1, transform: "rotate(45deg)", borderRadius: "1px" }} />
      ) : shape === "triangle" ? (
        <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: `8px solid ${color}`, display: "inline-block", opacity: hidden ? 0.3 : 1 }} />
      ) : (
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, display: "inline-block", opacity: hidden ? 0.3 : 1 }} />
      )}
      {label}
    </span>
  );
}

/* ─── Legend Row with hide-all/show-all and collapsible ─── */
export function LegendRow({ items, hiddenSet, onToggle, onClearAll, threshold = 5, initialShow = 8 }) {
  const [expanded, setExpanded] = useState(false);
  const showClearAll = items.length > threshold;
  const showCollapse = items.length > initialShow;
  const visible = showCollapse && !expanded ? items.slice(0, initialShow) : items;
  const remaining = items.length - initialShow;
  const allHidden = hiddenSet.size === items.length;

  return (
    <div style={{ marginTop: "10px" }}>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
        {showClearAll && (
          <button onClick={onClearAll} style={{
            fontSize: "9px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px",
            border: `1px solid ${allHidden ? T.accent : T.border}`, background: allHidden ? T.accentSoft : "transparent",
            color: allHidden ? T.accent : T.muted, cursor: "pointer", letterSpacing: "0.3px",
            height: "22px", lineHeight: "22px", display: "flex", alignItems: "center",
          }}>
            {allHidden ? "Show all" : "Hide all"}
          </button>
        )}
        {visible.map(item => (
          <Pill key={item.key} color={item.color} label={item.label}
            hidden={hiddenSet.has(item.key)} onClick={() => onToggle(item.key)}
            shape={item.shape} />
        ))}
        {showCollapse && !expanded && remaining > 0 && (
          <span onClick={() => setExpanded(true)} style={{
            fontSize: "10px", color: T.accent, cursor: "pointer", padding: "2px 8px",
            borderRadius: "10px", border: `1px dashed ${T.border}`, userSelect: "none",
            display: "flex", alignItems: "center",
          }}>+{remaining} more</span>
        )}
        {showCollapse && expanded && (
          <span onClick={() => setExpanded(false)} style={{
            fontSize: "10px", color: T.muted, cursor: "pointer", padding: "2px 8px",
            borderRadius: "10px", border: `1px dashed ${T.border}`, userSelect: "none",
            display: "flex", alignItems: "center",
          }}>Show less</span>
        )}
      </div>
    </div>
  );
}

/* ─── Mobile Bottom Sheet ─── */
export function BottomSheet({ item, onClose, onNavigate, children }) {
  if (!item) return null;
  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: "absolute", bottom: 0, left: "-24px", right: "-24px", zIndex: 50,
      background: T.card, borderTop: `2px solid ${T.accent}`,
      borderRadius: "14px 14px 0 0", padding: "14px 20px 16px",
      boxShadow: "0 -8px 32px rgba(0,0,0,.6)",
      animation: "sheetUp .25s cubic-bezier(.16,1,.3,1)",
    }}>
      <div onClick={onClose} style={{ display: "flex", justifyContent: "center", marginBottom: "8px", cursor: "pointer", padding: "2px 0" }}>
        <div style={{ width: "32px", height: "3px", borderRadius: "2px", background: T.border }} />
      </div>
      {children}
      {onNavigate && (
        <button onClick={onNavigate} style={{
          display: "block", width: "100%", marginTop: "10px", padding: "8px", borderRadius: "8px",
          background: T.accentSoft, color: T.accent, border: "none", cursor: "pointer",
          fontSize: "12px", fontWeight: 600, textAlign: "center",
        }}>View full specs →</button>
      )}
      <style>{`@keyframes sheetUp { from { transform: translateY(100%); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
    </div>
  );
}

/* ─── Structured desktop tooltip HTML builder ─── */
export function buildTipHTML({ name, color, stats, details, link, pinned }) {
  const statsHtml = stats.map(s => (
    `<div style="min-width:0"><div style="font-size:10px;color:#717889;margin-bottom:1px">${s.label}</div><div style="font-size:13px;font-weight:600;color:${s.color || T.text}">${s.value}</div></div>`
  )).join("");
  const detailHtml = details ? `<div style="color:#64748b;font-size:11px;margin-top:4px">${details}</div>` : "";
  const linkHtml = pinned && link ? `<a href="${link}" style="display:inline-block;margin-top:8px;padding:4px 12px;background:${T.accentSoft};color:${T.accent};border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;width:100%;text-align:center;box-sizing:border-box">View full specs →</a>` : "";
  return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span><b style="color:${T.text};font-size:13px;line-height:1.2">${name}</b></div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:3px 14px">${statsHtml}</div>${detailHtml}${linkHtml}`;
}

/* ─── Position desktop tooltip safely ─── */
export function positionTip(tip, x, y, pinned) {
  tip.style.opacity = "1";
  tip.style.pointerEvents = pinned ? "auto" : "none";
  tip.style.borderColor = pinned ? T.accent : "rgba(99,179,237,.35)";
  const tipW = 300, tipH = 200;
  let tx = x + 14, ty = y - 10;
  if (tx + tipW > window.innerWidth - 8) tx = x - tipW - 14;
  if (tx < 8) tx = 8;
  if (ty < 8) ty = 8;
  if (ty + tipH > window.innerHeight - 8) ty = window.innerHeight - tipH - 8;
  tip.style.left = tx + "px";
  tip.style.top = ty + "px";
}

/* ─── Desktop tooltip style ─── */
export const TIP_STYLE = {
  position: "fixed", pointerEvents: "none",
  background: "rgba(15,17,25,.97)", border: "1px solid rgba(99,179,237,.35)",
  borderRadius: "10px", padding: "12px 14px", fontSize: "12px", lineHeight: 1.5, color: T.text,
  boxShadow: "0 8px 32px rgba(0,0,0,.6)", zIndex: 999, opacity: 0, transition: "opacity .15s",
  maxWidth: "300px",
};

/* ─── Touch-aware event coordinate extractor ─── */
export function getEventCoords(e) {
  if (e.touches && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  if (e.changedTouches && e.changedTouches.length > 0) {
    return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
  }
  return { clientX: e.clientX, clientY: e.clientY };
}

/* ─── toggleHidden helper ─── */
export const toggleHidden = (setter, key) => setter(prev => {
  const next = new Set(prev);
  next.has(key) ? next.delete(key) : next.add(key);
  return next;
});
