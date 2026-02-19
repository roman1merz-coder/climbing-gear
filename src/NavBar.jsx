import { useLocation, useNavigate, Link } from "react-router-dom";
import useIsMobile from "./useIsMobile.js";
import { T } from "./tokens.js";
import { useWL } from "./WishlistContext.jsx";
import AlertBell from "./AlertBell.jsx";

/* ─── Logo (custom SVG) ─── */
function LogoIcon({ size = 32 }) {
  return (
    <img
      src="/images/logo.svg"
      alt="climbing-gear.com"
      width={size}
      height={size}
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}

const TABS = [
  { key: "shoes",  label: "Shoes",      path: "/shoes",  match: ["/shoes", "/shoe/"],  active: true },
  { key: "ropes",  label: "Ropes",      path: "/ropes",  match: ["/ropes", "/rope/"],  active: true },
  { key: "belays", label: "Belays",     path: "/belays", match: ["/belays", "/belay/"], active: true },
  { key: "pads",   label: "Crashpads",  path: "/crashpads", match: ["/crashpads", "/crashpad/"], active: true },
  { key: "harness",label: "Harnesses",  path: null,      match: [],                    active: false },
  { key: "pants",  label: "Pants",      path: null,      match: [],                    active: false },
];

export default function NavBar({ priceData = {} }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { count } = useWL();

  const current = TABS.find(t => t.match.some(m => pathname.startsWith(m)))?.key || null;

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 200,
      display: "flex", alignItems: "center",
      gap: isMobile ? "8px" : "16px",
      padding: isMobile ? "8px 12px" : "0 24px",
      minHeight: isMobile ? "44px" : "50px",
      background: T.navBg,
      backdropFilter: "blur(14px)",
      borderBottom: `1px solid ${T.border}`,
      fontFamily: T.font,
    }}>
      {/* Logo */}
      <div
        onClick={() => navigate("/")}
        style={{
          display: "flex", alignItems: "center", gap: isMobile ? "4px" : "8px",
          cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        <LogoIcon size={isMobile ? 28 : 34} />
        {!isMobile && (
          <span style={{
            fontSize: "15px", fontWeight: 800,
            letterSpacing: "-0.3px", color: T.navText,
          }}>
            climbing-gear<span style={{ color: T.primary }}>.com</span>
          </span>
        )}
      </div>

      {/* Gear tabs */}
      <div style={{
        display: "flex", gap: "2px",
        background: "rgba(44,50,39,0.06)", borderRadius: "8px", padding: "3px",
        marginLeft: isMobile ? "0" : "12px",
        overflow: "auto", flexShrink: isMobile ? 1 : 0,
        WebkitOverflowScrolling: "touch",
        msOverflowStyle: "none",
        scrollbarWidth: "none",
      }}>
        {TABS.map(tab => {
          const isCurrent = tab.key === current;
          // Hide inactive tabs on mobile to save space
          if (!tab.active) {
            if (isMobile) return null;
            return (
              <span key={tab.key} style={{
                padding: "5px 14px",
                borderRadius: "6px", fontSize: "11px",
                fontWeight: 500, color: T.navMuted, opacity: 0.45,
                fontFamily: T.font, whiteSpace: "nowrap",
                display: "flex", alignItems: "center", gap: "3px",
              }}>
                {tab.label}
                <span style={{
                  fontSize: "7px", background: "rgba(44,50,39,0.08)", color: T.navMuted,
                  padding: "1px 4px", borderRadius: "3px", fontWeight: 700,
                  letterSpacing: "0.3px", textTransform: "uppercase",
                }}>soon</span>
              </span>
            );
          }
          const mobileLabel = isMobile && tab.key === "pads" ? "Pads" : tab.label;
          return (
            <button
              key={tab.key}
              onClick={() => navigate(tab.path)}
              style={{
                padding: isMobile ? "4px 10px" : "5px 16px",
                borderRadius: "6px",
                fontSize: isMobile ? "11px" : "12px",
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? T.navText : T.navMuted,
                cursor: "pointer", border: "none",
                background: isCurrent ? "#fff" : "none",
                boxShadow: isCurrent ? "0 1px 4px rgba(0,0,0,.08)" : "none",
                fontFamily: T.font, transition: "all .2s",
                whiteSpace: "nowrap",
              }}
            >{mobileLabel}</button>
          );
        })}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Wishlist indicator */}
      {count > 0 && (
        <div
          onClick={() => navigate("/wishlist")}
          style={{
            display: "flex", alignItems: "center", gap: "4px",
            cursor: "pointer", padding: isMobile ? "4px 8px" : "5px 12px",
            borderRadius: "16px", background: "rgba(201,138,66,0.1)",
            border: "1px solid rgba(201,138,66,0.2)", flexShrink: 0,
            transition: "all .2s",
          }}
        >
          <span style={{ fontSize: isMobile ? "12px" : "13px" }}>{"\u2764\uFE0F"}</span>
          <span style={{
            fontSize: isMobile ? "10px" : "11px", fontWeight: 700,
            color: T.accent, fontFamily: "'DM Mono',monospace",
          }}>
            {count}
          </span>
        </div>
      )}

      {/* Price alert bell */}
      <AlertBell priceData={priceData} isMobile={isMobile} onClick={() => navigate("/wishlist")} />

      {/* Right links (desktop only) */}
      {!isMobile && (
        <div style={{ display: "flex", gap: "16px", fontSize: "12px", flexShrink: 0 }}>
          <Link to="/insights" style={{
            color: pathname === "/insights" ? T.primary : T.navMuted,
            textDecoration: "none", fontWeight: 600,
          }}>Insights</Link>
          <Link to="/news" style={{
            color: pathname === "/news" ? T.primary : T.navMuted,
            textDecoration: "none", fontWeight: 600,
          }}>News</Link>
          <Link to="/about" style={{
            color: pathname === "/about" ? T.navText : T.navMuted,
            textDecoration: "none", fontWeight: 500,
          }}>About</Link>
          <Link to="/impressum" style={{
            color: pathname === "/impressum" ? T.navText : T.navMuted,
            textDecoration: "none", fontWeight: 500,
          }}>Impressum</Link>
        </div>
      )}
    </nav>
  );
}
