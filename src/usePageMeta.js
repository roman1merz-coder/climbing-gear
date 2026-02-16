import { useEffect } from "react";

const SITE = "climbing-gear.com";
const DEFAULT_TITLE = `${SITE} — Scroll less. Climb more.`;
const DEFAULT_DESC =
  "Compare 500+ climbing products — shoes, ropes, belay devices, and crashpads. Every spec, every price, zero brand bias.";

/**
 * Sets document.title and <meta name="description"> for the current page.
 * Resets to defaults on unmount.
 *
 * @param {string} title - Page-specific title (appended with " | climbing-gear.com")
 * @param {string} description - Page-specific meta description
 */
export default function usePageMeta(title, description) {
  useEffect(() => {
    // Set title
    document.title = title ? `${title} | ${SITE}` : DEFAULT_TITLE;

    // Set or create meta description
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description || DEFAULT_DESC;

    // Reset on unmount
    return () => {
      document.title = DEFAULT_TITLE;
      meta.content = DEFAULT_DESC;
    };
  }, [title, description]);
}
