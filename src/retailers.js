// ─── Retailer Shipping & Return Policies ─────────────────────
// Static lookup - updated ~1x/year. All prices in EUR.
// shipping: { cost (EUR or null if unknown), freeThreshold (EUR or 0 if always free) }
// returns:  { days, free (boolean for DE), cost (string note if not free) }

export const RETAILERS = {
  "bergfreunde.de": {
    country: "DE",
    shipping: { cost: 2.95, freeThreshold: 69 },
    returns: { days: 100, free: true, cost: null },
  },
  "alpinstore.com": {
    country: "FR",
    shipping: { cost: 7.5, freeThreshold: 80 },
    returns: { days: 30, free: false, cost: "€6" },
  },
  "8a.de": {
    country: "DE",
    shipping: { cost: 3.95, freeThreshold: 100 },
    returns: { days: 30, free: true, cost: null },
  },
  "Amazon (Search)": {
    country: "DE",
    shipping: { cost: 3.99, freeThreshold: 39 },
    returns: { days: 30, free: true, cost: null },
  },
  "barrabes.com": {
    country: "ES",
    shipping: { cost: 0, freeThreshold: 0 },
    returns: { days: 30, free: false, cost: "customer pays" },
  },
  "bergzeit.de": {
    country: "DE",
    shipping: { cost: 3.95, freeThreshold: 100 },
    returns: { days: 100, free: true, cost: null },
  },
  "basislager.de": {
    country: "DE",
    shipping: { cost: 5.00, freeThreshold: 30 },
    returns: { days: 30, free: true, cost: null },
  },
  "oliunid.com": {
    country: "IT",
    shipping: { cost: null, freeThreshold: 100 },
    returns: { days: 100, free: false, cost: "customer pays" },
  },
  "bananafingers.co.uk": {
    country: "UK",
    shipping: { cost: 9.96, freeThreshold: 70 },
    returns: { days: 30, free: false, cost: "customer pays" },
  },
  "9cclimbing.com": {
    country: "NL",
    shipping: { cost: null, freeThreshold: 45 },
    returns: { days: 30, free: false, cost: "customer pays" },
  },
  "snowleader.com": {
    country: "FR",
    shipping: { cost: 5, freeThreshold: null },
    returns: { days: 60, free: false, cost: "customer pays" },
  },
  "deporvillage.com": {
    country: "ES",
    shipping: { cost: null, freeThreshold: null },
    returns: { days: 30, free: false, cost: "customer pays" },
  },
  "chalkr.de": {
    country: "DE",
    shipping: { cost: 3.95, freeThreshold: 50 },
    returns: { days: 30, free: true, cost: null },
  },
  "funktionelles.de": {
    country: "DE",
    shipping: { cost: null, freeThreshold: 50 },
    returns: { days: 14, free: false, cost: "customer pays" },
  },
  "kletterbude.de": {
    country: "DE",
    shipping: { cost: null, freeThreshold: 99 },
    returns: { days: 14, free: false, cost: "€6.90" },
  },
  "hardloop.de": {
    country: "DE",
    shipping: { cost: 4.95, freeThreshold: 100 },
    returns: { days: 100, free: true, cost: null },
  },
  "outdoor-climbing.de": {
    country: "DE",
    shipping: { cost: 3.95, freeThreshold: 60 },
    returns: { days: 14, free: false, cost: "customer pays" },
  },
  "decathlon.de": {
    country: "DE",
    shipping: { cost: null, freeThreshold: 35 },
    returns: { days: 30, free: true, cost: null },
  },
  "sportokay.com": {
    country: "AT",
    shipping: { cost: 4.95, freeThreshold: 100 },
    returns: { days: 30, free: true, cost: null },
  },
  "epictv.com": {
    country: "IT",
    shipping: { cost: null, freeThreshold: 150 },
    returns: { days: 100, free: false, cost: "customer pays" },
  },
  "sport-conrad.com": {
    country: "DE",
    shipping: { cost: 0, freeThreshold: 0 },
    returns: { days: 14, free: true, cost: null },
  },
  "rockrun.com": {
    country: "UK",
    shipping: { cost: null, freeThreshold: null },
    returns: { days: 28, free: false, cost: "customer pays" },
  },
  "naturzeit.com": {
    country: "DE",
    shipping: { cost: 3.90, freeThreshold: 60 },
    returns: { days: 14, free: true, cost: null },
  },
  "tapir-store.de": {
    country: "DE",
    shipping: { cost: 4.50, freeThreshold: 70 },
    returns: { days: 14, free: false, cost: "€5" },
  },
  // ── Additional retailers seen in quickdraw_prices ──
  "oliunid.de": {
    country: "DE",
    shipping: { cost: null, freeThreshold: 100 },
    returns: { days: 100, free: false, cost: "customer pays" },
  },
};

// ─── Helpers ──────────────────────────────────────────────────

export function getRetailerPolicy(name) {
  return RETAILERS[name] || null;
}

/**
 * Contextual shipping label based on product price vs free-ship threshold.
 * Returns e.g. "Free shipping" or "+€2.95 shipping"
 */
export function getShippingLabel(retailerName, price) {
  const p = RETAILERS[retailerName];
  if (!p) return null;
  const s = p.shipping;
  if (s.freeThreshold === 0) return "Free shipping";
  if (s.freeThreshold != null && typeof price === "number" && price >= s.freeThreshold) return "Free shipping";
  if (typeof s.cost === "number" && s.cost > 0) return `+€${s.cost.toFixed(2)} shipping`;
  if (s.freeThreshold != null) return `Free from €${s.freeThreshold}`;
  return null;
}

/**
 * Return policy label, e.g. "100d returns · free" or "30d returns"
 */
export function getReturnLabel(retailerName) {
  const p = RETAILERS[retailerName];
  if (!p) return null;
  const r = p.returns;
  const daysPart = `${r.days}d returns`;
  if (r.free) return `${daysPart} · free`;
  return daysPart;
}
