import { useLocation, useNavigate, Link } from "react-router-dom";
import useIsMobile from "./useIsMobile.js";
import { T } from "./tokens.js";
import { useWL } from "./WishlistContext.jsx";
import AlertBell from "./AlertBell.jsx";

const TABS = [
  { key: "shoes",  label: "Shoes",      path: "/shoes",  match: ["/shoes", "/shoe/"],  active: true },
  { key: "ropes",  label: "Ropes",      path: "/ropes",  match: ["/ropes", "/rope/"],  active: true },
  { key: "belays", label: "Belays",     path: "/belays", match: ["/belays", "/belay/"], active: true },
  { key: "pads",   label: "Crashpads",  path: null,      match: [],                    active: false },
  { key: "harness",label: "Harnesses",  path: null,      match: [],                    active: false },
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
          display: "flex", alignItems: "center", gap: "8px",
          cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        <span style={{ fontSize: isMobile ? "16px" : "18px" }}>{"\u26F0\uFE0F"}</span>
        <span style={{
          fontSize: isMobile ? "13px" : "15px", fontWeight: 800,
          letterSpacing: "-0.3px", color: T.text,
        }}>
          climbing-gear<span style={{ color: T.accent }}>.com</span>
        </span>
      </div>

      {/* Gear tabs */}
      <div style={{
        display: "flex", gap: "2px",
        background: T.surface, borderRadius: "8px", padding: "3px",
        marginLeft: isMobile ? "auto" : "12px",
        overflow: "auto", flexShrink: 0,
      }}>
        {TABS.map(tab => {
          const isCurrent = tab.key === current;
          if (!tab.active) {
            return (
              <span key={tab.key} style={{
                padding: isMobile ? "4px 8px" : "5px 14px",
                borderRadius: "6px", fontSize: isMobile ? "10px" : "11px",
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
            >{tab.label}</button>
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
