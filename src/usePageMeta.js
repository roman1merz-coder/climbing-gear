import { useEffect } from "react";

const SITE = "climbing-gear.com";
const BASE_URL = "https://climbing-gear.com";
const DEFAULT_TITLE = `${SITE} — Scroll less. Climb more.`;
const DEFAULT_DESC =
  "Compare 500+ climbing products — shoes, ropes, belay devices, and crashpads. Every spec, every price, zero brand bias.";
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

/** Helper: set or create a <meta> tag */
function setMeta(attr, key, value) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
  return el;
}

/** Helper: set or create a <link> tag by rel attribute */
function setLink(rel, href) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.href = href;
  return el;
}

/**
 * Sets document.title, <meta name="description">, and Open Graph tags.
 * Resets to defaults on unmount.
 *
 * @param {string} title - Page-specific title (appended with " | climbing-gear.com")
 * @param {string} description - Page-specific meta description
 * @param {object} [og] - Optional OG overrides: { image }
 */
export default function usePageMeta(title, description, og) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE}` : DEFAULT_TITLE;
    const desc = description || DEFAULT_DESC;
    const image = og?.image || DEFAULT_IMAGE;

    // Title
    document.title = fullTitle;

    // Standard meta
    const metaDesc = setMeta("name", "description", desc);

    // Canonical URL (use climbing-gear.com even if accessed via vercel.app)
    const canonicalUrl = `${BASE_URL}${window.location.pathname}`;
    const canonicalLink = setLink("canonical", canonicalUrl);

    // Open Graph
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:image", image);
    setMeta("property", "og:site_name", SITE);

    // Twitter Card
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", desc);
    setMeta("name", "twitter:image", image);

    // Reset on unmount
    return () => {
      document.title = DEFAULT_TITLE;
      metaDesc.content = DEFAULT_DESC;
      canonicalLink.href = BASE_URL;
      setMeta("property", "og:title", DEFAULT_TITLE);
      setMeta("property", "og:description", DEFAULT_DESC);
      setMeta("property", "og:url", BASE_URL);
      setMeta("property", "og:image", DEFAULT_IMAGE);
      setMeta("name", "twitter:title", DEFAULT_TITLE);
      setMeta("name", "twitter:description", DEFAULT_DESC);
      setMeta("name", "twitter:image", DEFAULT_IMAGE);
    };
  }, [title, description, og?.image]);
}
