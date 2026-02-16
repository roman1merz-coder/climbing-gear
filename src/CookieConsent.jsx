import { useState, useEffect } from "react";
import { T } from "./tokens.js";

/**
 * Cookie Consent Banner
 *
 * Lightweight, GDPR-compliant cookie consent for climbing-gear.com.
 * Currently the site sets NO cookies, but this component is ready for
 * when affiliate partners (Amazon Associates, Skimlinks) are activated.
 *
 * How it works:
 * - On first visit: shows a small bottom banner
 * - User can Accept (all) or Reject (essential only)
 * - Choice is stored in localStorage (not a cookie — no consent needed for that)
 * - The banner never shows again once a choice is made
 *
 * To activate affiliate scripts conditionally:
 *   import { hasConsentFor } from "./CookieConsent.jsx";
 *   if (hasConsentFor("affiliate")) { loadSkimlinks(); }
 */

const STORAGE_KEY = "cg_cookie_consent";

// Consent categories — extend as needed
const CATEGORIES = {
  essential: true,   // always on (no actual cookies set yet)
  affiliate: false,  // Skimlinks / Amazon Associates tracking cookies
};

/** Check if user has consented to a specific category */
export function hasConsentFor(category) {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored) return false;
    return stored.categories?.[category] === true;
  } catch {
    return false;
  }
}

/** Check if user has made any consent choice */
export function hasConsentChoice() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if no choice has been made yet
    if (!hasConsentChoice()) {
      // Small delay so it doesn't flash on page load
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const saveChoice = (acceptAll) => {
    const consent = {
      categories: {
        essential: true,
        affiliate: acceptAll,
      },
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: T.surface, borderTop: `1px solid ${T.border}`,
      padding: "16px 24px",
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: "16px", flexWrap: "wrap",
      fontFamily: T.font, fontSize: "13px", color: T.muted,
      boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
      animation: "fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards",
    }}>
      <span style={{ maxWidth: "600px", lineHeight: 1.6 }}>
        Diese Website kann Cookies von Affiliate-Partnern verwenden, um Eink&auml;ufe zuzuordnen.{" "}
        <a href="/privacy" style={{ color: T.accent, textDecoration: "underline" }}>
          Datenschutz
        </a>
      </span>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={() => saveChoice(false)}
          style={{
            padding: "8px 16px", borderRadius: T.radiusXs,
            background: "transparent", border: `1px solid ${T.border}`,
            color: T.text, cursor: "pointer", fontFamily: T.font,
            fontSize: "13px", fontWeight: 600,
          }}
        >
          Nur Essenzielle
        </button>
        <button
          onClick={() => saveChoice(true)}
          style={{
            padding: "8px 16px", borderRadius: T.radiusXs,
            background: T.accent, border: "none",
            color: "#fff", cursor: "pointer", fontFamily: T.font,
            fontSize: "13px", fontWeight: 700,
          }}
        >
          Alle akzeptieren
        </button>
      </div>
    </div>
  );
}
