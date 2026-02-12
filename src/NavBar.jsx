import { useLocation, useNavigate, Link } from "react-router-dom";
import useIsMobile from "./useIsMobile.js";
import { T } from "./tokens.js";
import { useWL } from "./WishlistContext.jsx";
import AlertBell from "./AlertBell.jsx";

/* ─── Logo SVG (triangle + mountains + carabiner + rope) ─── */
function LogoIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Triangle frame */}
      <path d="M50 5 L92 88 H8 Z" fill="none" stroke="#3a4555" strokeWidth="5" strokeLinejoin="round" />
      {/* Mountains (blue) */}
      <path d="M25 72 L38 48 L46 58 L55 40 L64 55 L75 72" fill="none" stroke="#5b9cc7" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Snow caps */}
      <path d="M52 43 L55 40 L58 43" fill="none" stroke="#a8d4f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M35 51 L38 48 L41 51" fill="none" stroke="#a8d4f0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Carabiner (orange) at top */}
      <ellipse cx="50" cy="18" rx="7" ry="9" fill="none" stroke="#E8734A" strokeWidth="2.5" />
      <line x1="55" y1="12" x2="55" y2="24" stroke="#E8734A" strokeWidth="2" strokeLinecap="round" />
      {/* Rope coil (blue) at bottom */}
      <path d="M34 78 Q38 73 42 78 Q46 83 50 78 Q54 73 58 78 Q62 83 66 78" fill="none" stroke="#5b9cc7" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M37 83 Q41 78 45 83 Q49 88 53 83 Q57 78 61 83" fill="none" stroke="#5b9cc7" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </svg>
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
      background: "rgba(14,16,21,0.95)",
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
            letterSpacing: "-0.3px", color: T.text,
          }}>
            climbing-gear<span style={{ color: T.accent }}>.com</span>
          </span>
        )}
      </div>

      {/* Gear tabs */}
      <div style={{
        display: "flex", gap: "2px",
        background: T.surface, borderRadius: "8px", padding: "3px",
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
                fontWeight: 500, color: T.muted, opacity: 0.45,
                fontFamily: T.font, whiteSpace: "nowrap",
                display: "flex", alignItems: "center", gap: "3px",
              }}>
                {tab.label}
                <span style={{
                  fontSize: "7px", background: T.border, color: T.muted,
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
                fontWeight: isCurrent ? 600 : 500,
                color: isCurrent ? T.text : T.muted,
                cursor: "pointer", border: "none",
                background: isCurrent ? T.card : "none",
                boxShadow: isCurrent ? "0 1px 3px rgba(0,0,0,.3)" : "none",
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
            borderRadius: "16px", background: "rgba(232,115,74,0.1)",
            border: "1px solid rgba(232,115,74,0.25)", flexShrink: 0,
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
          <Link to="/about" style={{
            color: pathname === "/about" ? T.text : T.muted,
            textDecoration: "none", fontWeight: 500,
          }}>About</Link>
          <Link to="/impressum" style={{
            color: pathname === "/impressum" ? T.text : T.muted,
            textDecoration: "none", fontWeight: 500,
          }}>Impressum</Link>
        </div>
      )}
    </nav>
  );
}
