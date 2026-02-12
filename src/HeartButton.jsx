import { useWL } from "./WishlistContext.jsx";

/**
 * Heart toggle button for the wishlist.
 * @param {string} type - "shoe" | "rope" | "belay"
 * @param {string} slug - product slug
 * @param {object} [style] - optional extra styles
 */
export default function HeartButton({ type, slug, style }) {
  const { toggle, has } = useWL();
  const saved = has(type, slug);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(type, slug); }}
      aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
      style={{
        background: "none", border: "none", cursor: "pointer",
        fontSize: "18px", lineHeight: 1, padding: "4px",
        transition: "transform .2s",
        transform: saved ? "scale(1.1)" : "scale(1)",
        filter: saved ? "none" : "grayscale(1) opacity(0.5)",
        ...style,
      }}
      onMouseOver={e => { if (!saved) e.currentTarget.style.filter = "none"; }}
      onMouseOut={e => { if (!saved) e.currentTarget.style.filter = "grayscale(1) opacity(0.5)"; }}
    >
      {saved ? "\u2764\uFE0F" : "\u{1F90D}"}
    </button>
  );
}
