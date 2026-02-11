import { useCompare } from "./CompareContext.jsx";
import { T } from "./tokens.js";

export default function CompareCheckbox({ slug }) {
  const { toggleCompare, isInCompare, isFull } = useCompare();
  const checked = isInCompare(slug);
  const disabled = !checked && isFull;

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) toggleCompare(slug);
      }}
      title={
        checked ? "Remove from comparison" :
        disabled ? "Max 4 shoes in comparison" :
        "Add to comparison"
      }
      style={{
        position: "absolute",
        top: "10px",
        right: "10px",
        zIndex: 10,
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        border: `1.5px solid ${checked ? T.accent : T.border}`,
        background: checked ? T.accent : "rgba(14,16,21,0.7)",
        backdropFilter: "blur(8px)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s ease",
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
    >
      {checked ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7L6 10L11 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 11L7 3L12 11" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="4" y1="9" x2="10" y2="9" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
