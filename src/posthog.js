/**
 * PostHog Analytics — climbing-gear.com
 *
 * Runs in cookieless mode by default (no GDPR consent needed for basic analytics).
 * Session replays are opt-in via the cookie consent banner.
 *
 * Usage:
 *   import { ph, trackEvent } from "./posthog.js";
 *   trackEvent("affiliate_click", { retailer: "bergfreunde.de", product: "la-sportiva-solution" });
 */
import posthog from "posthog-js";

const POSTHOG_KEY = "phc_OkrxqJzUXVGEdKKvbuAMZ5jdZ2R9Vp9GItLNYW9UIWe";
const POSTHOG_HOST = "https://eu.i.posthog.com";

let initialized = false;

export function initPostHog() {
  if (initialized || typeof window === "undefined") return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Cookieless mode — no localStorage/cookies, fully GDPR-compliant
    persistence: "memory",
    // SPA — we handle pageviews manually on route changes
    capture_pageview: false,
    // Autocapture clicks, form submits, etc.
    autocapture: true,
    // Session replay OFF by default — enabled when user consents
    disable_session_recording: true,
    // DNT is deprecated and we already run cookieless — no need for respect_dnt
    // (it silently kills PostHog if the browser has Do Not Track enabled)
    respect_dnt: false,
    // Don't send data in dev
    loaded: (ph) => {
      if (import.meta.env.DEV) {
        ph.opt_out_capturing();
      }
    },
  });
  initialized = true;
  console.log("[PostHog] initialized — api_host:", POSTHOG_HOST);
}

/** Enable session replays (call after user consents to analytics) */
export function enableSessionReplay() {
  if (!initialized) return;
  posthog.startSessionRecording();
}

/** Disable session replays (call if user revokes consent) */
export function disableSessionReplay() {
  if (!initialized) return;
  posthog.stopSessionRecording();
}

/** Track a pageview (call on every route change) */
export function trackPageView(path) {
  if (!initialized) return;
  posthog.capture("$pageview", { $current_url: window.location.href });
}

/** Track a custom event */
export function trackEvent(eventName, properties = {}) {
  if (!initialized) return;
  posthog.capture(eventName, properties);
}

/**
 * Global click listener for affiliate link tracking.
 * Catches clicks on any <a> with an AWIN or known retailer URL.
 * Call once after init.
 */
export function setupAffiliateLinkTracking() {
  if (typeof document === "undefined") return;
  document.addEventListener("click", (e) => {
    const anchor = e.target.closest("a[href]");
    if (!anchor) return;
    const href = anchor.href || "";
    // Track AWIN affiliate clicks
    if (href.includes("awin1.com") || href.includes("awinmid=")) {
      // Extract the real destination from the ued= param
      let destination = href;
      try {
        const url = new URL(href);
        const ued = url.searchParams.get("ued");
        if (ued) destination = decodeURIComponent(ued);
      } catch { /* use href as-is */ }
      // Extract retailer from destination URL
      let retailer = "unknown";
      try { retailer = new URL(destination).hostname.replace("www.", ""); } catch {}
      // Get product context from nearby DOM
      const card = anchor.closest("[data-product-slug]");
      const slug = card?.dataset?.productSlug || "";
      trackEvent("affiliate_click", {
        retailer,
        product_slug: slug,
        destination_url: destination,
        page_path: window.location.pathname,
      });
    }
    // Track any external link click (non-affiliate outbound)
    else if (anchor.hostname && anchor.hostname !== window.location.hostname) {
      trackEvent("outbound_click", {
        url: href,
        page_path: window.location.pathname,
      });
    }
  });
}

/** Convenience: PostHog instance (for advanced use) */
export { posthog as ph };
