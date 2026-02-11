import { useNavigate } from "react-router-dom";
import { useCompare } from "./CompareContext.jsx";
import { T } from "./tokens.js";

export default function CompareBar({ shoes = [] }) {
  const { compareList, removeFromCompare, clearCompare, count } = useCompare();
  const navigate = useNavigate();

  if (count < 2) return null;

  const selectedShoes = compareList
    .map((slug) => shoes.find((s) => s.slug === slug))
    .filter(Boolean);

  return (
    <div
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(14,16,21,0.96)", backdropFilter: "blur(16px)",
        borderTop: `1px solid ${T.border}`, padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "16px", animation: "compareSlideUp 0.25s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, overflow: "auto" }}>
        {selectedShoes.map((shoe) => (
          <div key={shoe.slug} style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: "8px", padding: "6px 10px", flexShrink: 0,
          }}>
            {shoe.image_url && (
              <img src={shoe.image_url} alt={shoe.model}
                style={{ width: "28px", height: "28px", objectFit: "contain", borderRadius: "4px" }} />
            )}
            <span style={{ fontSize: "12px", fontWeight: 600, color: T.text, whiteSpace: "nowrap" }}>
              {shoe.brand} {shoe.model}
            </span>
            <button onClick={() => removeFromCompare(shoe.slug)}
              style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: "14px", padding: "0 2px", lineHeight: 1 }}
              title="Remove">{"\u2715"}</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        <button onClick={clearCompare} style={{
          background: "none", border: `1px solid ${T.border}`, borderRadius: "8px",
          color: T.muted, fontSize: "12px", fontWeight: 600, padding: "8px 14px",
          cursor: "pointer", fontFamily: T.font,
        }}>Clear</button>
        <button onClick={() => navigate(`/compare?shoes=${compareList.join(",")}`)} style={{
          background: T.accent, border: "none", borderRadius: "8px", color: "#fff",
          fontSize: "13px", fontWeight: 700, padding: "10px 20px", cursor: "pointer",
          fontFamily: T.font, display: "flex", alignItems: "center", gap: "6px",
        }}>Compare {count} shoes →</button>
      </div>
    </div>
  );
}
