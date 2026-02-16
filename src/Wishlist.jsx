import { useNavigate } from "react-router-dom";
import { useWL } from "./WishlistContext.jsx";
import useIsMobile from "./useIsMobile.js";
import { T } from "./tokens.js";
import usePageMeta from "./usePageMeta.js";

const S = {
  page: {
    minHeight: "100vh", background: T.bg, fontFamily: T.font, color: T.text,
    padding: "0",
  },
  wrap: { maxWidth: "880px", margin: "0 auto", padding: "32px 24px 80px" },
  h1: { fontSize: "24px", fontWeight: 800, letterSpacing: "-0.5px", marginBottom: "4px" },
  subtitle: { fontSize: "13px", color: T.muted, marginBottom: "32px" },
  empty: {
    textAlign: "center", padding: "80px 0", color: T.muted,
  },
  card: {
    display: "flex", alignItems: "center", gap: "16px",
    padding: "16px", borderRadius: "12px", background: T.card,
    border: `1px solid ${T.border}`, marginBottom: "10px",
    cursor: "pointer", transition: "all .2s",
  },
  typeTag: {
    padding: "3px 10px", borderRadius: "10px", fontSize: "10px",
    fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase",
    fontFamily: "'DM Mono',monospace",
  },
};

const TYPE_STYLE = {
  shoe: { bg: "rgba(232,115,74,0.12)", color: "#E8734A" },
  rope: { bg: "rgba(96,165,250,0.12)", color: "#60a5fa" },
  belay: { bg: "rgba(167,139,250,0.12)", color: "#a78bfa" },
  crashpad: { bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
};

function slug2label(slug) {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Wishlist() {
  usePageMeta("My Wishlist", "Your saved climbing gear wishlist on climbing-gear.com.");
  const { items, toggle, clear } = useWL();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const go = (type, slug) => {
    const base = type === "crashpad" ? "crashpad" : type === "belay" ? "belay" : type === "rope" ? "rope" : "shoe";
    navigate(`/${base}/${slug}`);
  };

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={S.h1}>{"\u2764\uFE0F"} Wishlist</h1>
            <p style={S.subtitle}>
              {items.length} saved item{items.length !== 1 ? "s" : ""} — stored in your browser
            </p>
          </div>
          {items.length > 0 && (
            <button
              onClick={clear}
              style={{
                padding: "8px 20px", borderRadius: "20px",
                border: `1px solid ${T.border}`, background: "transparent",
                color: T.muted, fontSize: "12px", cursor: "pointer",
                fontFamily: T.font, transition: "all .2s",
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {items.length === 0 && (
          <div style={S.empty}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>{"\u{1F90D}"}</div>
            <div style={{ fontSize: "16px", marginBottom: "8px" }}>No saved items yet</div>
            <div style={{ fontSize: "13px" }}>
              Tap the heart on any shoe, rope, belay device, or crashpad to save it here.
            </div>
          </div>
        )}

        {items.map((item) => {
          const ts = TYPE_STYLE[item.type] || TYPE_STYLE.shoe;
          return (
            <div
              key={`${item.type}-${item.slug}`}
              style={S.card}
              onClick={() => go(item.type, item.slug)}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = T.accent; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = T.border; }}
            >
              <span style={{ ...S.typeTag, background: ts.bg, color: ts.color }}>
                {item.type}
              </span>
              <span style={{
                flex: 1, fontSize: isMobile ? "13px" : "14px",
                fontWeight: 600, color: T.text,
              }}>
                {slug2label(item.slug)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); toggle(item.type, item.slug); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "16px", padding: "4px", color: "#ef4444",
                  transition: "transform .2s",
                }}
                aria-label="Remove from wishlist"
                title="Remove"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
