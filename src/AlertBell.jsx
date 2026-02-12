import { usePA } from "./PriceAlertContext.jsx";
import { T } from "./tokens.js";

/**
 * NavBar bell indicator — shows count of triggered price alerts.
 * Only visible when at least one alert has been triggered (price <= target).
 *
 * Props:
 *   priceData: { [slug]: [{price, shop, ...}] } — live price data from Supabase
 *   isMobile: boolean
 *   onClick: () => void
 */
export default function AlertBell({ priceData = {}, isMobile, onClick }) {
  const { alerts } = usePA();

  if (!alerts.length) return null;

  // Count triggered alerts
  const triggered = alerts.filter(a => {
    if (a.gearType !== "shoe") return false; // only shoes have live prices for now
    const prices = priceData[a.slug];
    if (!prices?.length) return false;
    const best = Math.min(...prices.filter(p => p.inStock && p.price > 0).map(p => p.price));
    return best > 0 && best <= a.targetPrice;
  });

  const total = alerts.length;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "4px",
        cursor: "pointer", padding: isMobile ? "4px 8px" : "5px 12px",
        borderRadius: "16px", flexShrink: 0, transition: "all .2s",
        background: triggered.length > 0 ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.08)",
        border: `1px solid ${triggered.length > 0 ? "rgba(34,197,94,0.3)" : "rgba(251,191,36,0.15)"}`,
      }}
      title={triggered.length > 0
        ? `${triggered.length} price alert${triggered.length > 1 ? "s" : ""} triggered!`
        : `${total} price alert${total > 1 ? "s" : ""} active`
      }
    >
      <span style={{
        fontSize: isMobile ? "12px" : "13px",
        filter: triggered.length > 0 ? "none" : "grayscale(0.5)",
      }}>{"\uD83D\uDD14"}</span>
      <span style={{
        fontSize: isMobile ? "10px" : "11px", fontWeight: 700,
        color: triggered.length > 0 ? T.green : T.yellow,
        fontFamily: T.mono,
      }}>
        {triggered.length > 0 ? triggered.length : total}
      </span>
    </div>
  );
}
