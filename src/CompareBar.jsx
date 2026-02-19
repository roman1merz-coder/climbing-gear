import { useNavigate, useLocation } from "react-router-dom";
import { useCompare } from "./CompareContext.jsx";
import { T } from "./tokens.js";

// Config per gear type
const TYPE_CONFIG = {
  shoes:     { label: "shoes",   singular: "shoe",     path: "/compare",     backPath: "/shoes",     icon: "👟" },
  ropes:     { label: "ropes",   singular: "rope",     path: "/compare-ropes", backPath: "/ropes",   icon: "🪢" },
  belays:    { label: "devices", singular: "device",   path: "/compare-belays", backPath: "/belays", icon: "🔗" },
  crashpads: { label: "pads",    singular: "pad",      path: "/compare-pads",  backPath: "/crashpads", icon: "🛏️" },
  quickdraws: { label: "draws",  singular: "draw",     path: "/compare-quickdraws", backPath: "/quickdraws", icon: "🔗" },
};

// Detect which type the user is currently browsing
function useActiveType() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/rope"))     return "ropes";
  if (pathname.startsWith("/belay"))    return "belays";
  if (pathname.startsWith("/crashpad")) return "crashpads";
  if (pathname.startsWith("/quickdraw")) return "quickdraws";
  return "shoes";
}

export default function CompareBar({ shoes = [], ropes = [], belays = [], crashpads = [], quickdraws = [] }) {
  const { getList, getCount, removeFromCompare, clearCompare } = useCompare();
  const navigate = useNavigate();
  const activeType = useActiveType();

  const count = getCount(activeType);
  if (count < 2) return null;

  const cfg = TYPE_CONFIG[activeType];
  const compareList = getList(activeType);

  // Resolve slugs to items
  const allItems = { shoes, ropes, belays, crashpads, quickdraws };
  const pool = allItems[activeType] || [];
  const selectedItems = compareList
    .map((slug) => pool.find((s) => s.slug === slug))
    .filter(Boolean);

  return (
    <div
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(44,50,39,0.96)", backdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.08)", padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "16px", animation: "compareSlideUp 0.25s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, overflow: "auto" }}>
        {selectedItems.map((item) => (
          <div key={item.slug} style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: "8px", padding: "6px 10px", flexShrink: 0,
          }}>
            {item.image_url && (
              <img src={item.image_url} alt={item.model}
                style={{ width: "28px", height: "28px", objectFit: "contain", borderRadius: "4px" }} />
            )}
            <span style={{ fontSize: "12px", fontWeight: 600, color: T.text, whiteSpace: "nowrap" }}>
              {item.brand} {item.model}
            </span>
            <button onClick={() => removeFromCompare(activeType, item.slug)}
              style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: "14px", padding: "0 2px", lineHeight: 1 }}
              title="Remove">{"\u2715"}</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        <button onClick={() => clearCompare(activeType)} style={{
          background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px",
          color: "#8a9485", fontSize: "12px", fontWeight: 600, padding: "8px 14px",
          cursor: "pointer", fontFamily: T.font,
        }}>Clear</button>
        <button onClick={() => {
          const param = activeType === "shoes" ? "shoes" : activeType;
          navigate(`${cfg.path}?${param}=${compareList.join(",")}`);
        }} style={{
          background: T.accent, border: "none", borderRadius: "8px", color: "#fff",
          fontSize: "13px", fontWeight: 700, padding: "10px 20px", cursor: "pointer",
          fontFamily: T.font, display: "flex", alignItems: "center", gap: "6px",
        }}>Compare {count} {cfg.label} →</button>
      </div>
    </div>
  );
}
