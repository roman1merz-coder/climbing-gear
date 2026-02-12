import { useState } from "react";
import { usePA } from "./PriceAlertContext.jsx";
import { T } from "./tokens.js";

/**
 * Inline price alert widget for detail pages.
 * Shows either:
 *   - Set alert form (target price input + save button)
 *   - Active alert indicator (with edit/remove)
 *
 * Props:
 *   gearType: "shoe" | "rope" | "belay" | "crashpad"
 *   slug: string
 *   currentPrice: number | null — current best price for this item
 *   isMobile: boolean
 */
export default function PriceAlertForm({ gearType, slug, currentPrice, isMobile }) {
  const { getAlert, addAlert, removeAlert } = usePA();
  const existing = getAlert(gearType, slug);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(
    existing ? String(existing.targetPrice) : currentPrice ? String(Math.floor(currentPrice * 0.9)) : ""
  );
  const [showConfirm, setShowConfirm] = useState(false);

  const isTriggered = existing && currentPrice && currentPrice <= existing.targetPrice;

  const handleSave = () => {
    const val = parseFloat(target);
    if (!val || val <= 0) return;
    addAlert(gearType, slug, val);
    setEditing(false);
    setShowConfirm(true);
    setTimeout(() => setShowConfirm(false), 3000);
  };

  const handleRemove = () => {
    removeAlert(gearType, slug);
    setEditing(false);
  };

  // Triggered alert banner
  if (isTriggered && !editing) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: isMobile ? "10px 14px" : "12px 16px", borderRadius: T.radiusSm,
        background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
        marginBottom: "12px", animation: "fadeUp .4s ease both",
      }}>
        <span style={{ fontSize: "18px" }}>{"\uD83D\uDD14"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: T.green, marginBottom: "2px" }}>
            Price alert triggered!
          </div>
          <div style={{ fontSize: "11px", color: T.muted }}>
            Now {"\u20AC"}{currentPrice} — your target was {"\u20AC"}{existing.targetPrice}
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          style={{
            padding: "4px 10px", borderRadius: T.radiusXs,
            border: `1px solid ${T.border}`, background: "transparent",
            color: T.muted, fontSize: "11px", cursor: "pointer",
          }}
        >Edit</button>
        <button
          onClick={handleRemove}
          style={{
            padding: "4px 10px", borderRadius: T.radiusXs,
            border: "none", background: "transparent",
            color: T.muted, fontSize: "14px", cursor: "pointer",
          }}
        >{"\u00D7"}</button>
      </div>
    );
  }

  // Active alert (not triggered)
  if (existing && !editing) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: isMobile ? "10px 14px" : "12px 16px", borderRadius: T.radiusSm,
        background: T.yellowSoft, border: "1px solid rgba(251,191,36,0.2)",
        marginBottom: "12px",
      }}>
        <span style={{ fontSize: "16px" }}>{"\uD83D\uDD14"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: T.yellow }}>
            Alert set at {"\u20AC"}{existing.targetPrice}
          </div>
          <div style={{ fontSize: "10px", color: T.muted }}>
            {currentPrice
              ? `Currently \u20AC${currentPrice} — \u20AC${(currentPrice - existing.targetPrice).toFixed(0)} above target`
              : "We\u2019ll check on your next visit"
            }
          </div>
        </div>
        <button
          onClick={() => { setTarget(String(existing.targetPrice)); setEditing(true); }}
          style={{
            padding: "4px 10px", borderRadius: T.radiusXs,
            border: `1px solid ${T.border}`, background: "transparent",
            color: T.muted, fontSize: "11px", cursor: "pointer",
          }}
        >Edit</button>
        <button
          onClick={handleRemove}
          style={{
            padding: "4px 10px", borderRadius: T.radiusXs,
            border: "none", background: "transparent",
            color: T.muted, fontSize: "14px", cursor: "pointer",
          }}
        >{"\u00D7"}</button>
      </div>
    );
  }

  // Confirmation flash
  if (showConfirm) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "10px 14px", borderRadius: T.radiusSm,
        background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
        marginBottom: "12px",
      }}>
        <span style={{ fontSize: "14px" }}>{"\u2705"}</span>
        <span style={{ fontSize: "12px", color: T.green, fontWeight: 600 }}>
          Alert saved! We'll show you when the price drops below {"\u20AC"}{target}
        </span>
      </div>
    );
  }

  // Set alert form / editing form
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px",
      padding: isMobile ? "10px 14px" : "12px 16px", borderRadius: T.radiusSm,
      background: T.card, border: `1px solid ${T.border}`,
      marginBottom: "12px",
    }}>
      <span style={{ fontSize: "14px", flexShrink: 0 }}>{"\uD83D\uDD14"}</span>
      <span style={{ fontSize: "11px", color: T.muted, flexShrink: 0, whiteSpace: "nowrap" }}>
        Alert at
      </span>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <span style={{
          position: "absolute", left: "8px", fontSize: "12px",
          color: T.accent, fontFamily: T.mono, fontWeight: 600,
          pointerEvents: "none",
        }}>{"\u20AC"}</span>
        <input
          type="number"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder={currentPrice ? String(Math.floor(currentPrice * 0.9)) : "100"}
          min="1"
          step="1"
          style={{
            width: "80px", padding: "6px 8px 6px 22px", borderRadius: T.radiusXs,
            border: `1px solid ${T.border}`, background: T.surface, color: T.text,
            fontSize: "13px", fontFamily: T.mono, fontWeight: 600, outline: "none",
          }}
          onFocus={(e) => e.target.style.borderColor = T.accent}
          onBlur={(e) => e.target.style.borderColor = T.border}
        />
      </div>
      <button
        onClick={handleSave}
        disabled={!target || parseFloat(target) <= 0}
        style={{
          padding: "6px 14px", borderRadius: T.radiusXs,
          border: "none", background: T.accent, color: "#fff",
          fontSize: "11px", fontWeight: 700, cursor: "pointer",
          fontFamily: T.font, opacity: (!target || parseFloat(target) <= 0) ? 0.5 : 1,
          transition: "opacity .2s", whiteSpace: "nowrap",
        }}
      >
        {editing ? "Update" : "Set Alert"}
      </button>
      {editing && (
        <button
          onClick={() => setEditing(false)}
          style={{
            padding: "4px 8px", borderRadius: T.radiusXs,
            border: "none", background: "transparent",
            color: T.muted, fontSize: "14px", cursor: "pointer",
          }}
        >{"\u00D7"}</button>
      )}
    </div>
  );
}
