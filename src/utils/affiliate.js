/**
 * Affiliate link wrapping utility.
 *
 * Extensible config: add new AWIN retailers by adding an entry to AWIN_RETAILERS.
 * Each key is a lowercase substring matched against the retailer/shop name.
 */

const AWIN_RETAILERS = {
  bergfreunde: { advertiserId: 14102, publisherId: 2788122 },
  // Add more AWIN retailers here, e.g.:
  // "blue-tomato": { advertiserId: 12345, publisherId: 2788122 },
};

/**
 * Wrap a product URL with an AWIN deep link if the retailer has an AWIN config.
 * @param {string} url       – the direct product URL
 * @param {string} retailer  – the retailer/shop name (e.g. "bergfreunde.de")
 * @returns {string} – AWIN-wrapped URL or the original URL unchanged
 */
export function wrapAffiliateUrl(url, retailer) {
  if (!url || url === "#" || !retailer) return url;

  const key = retailer.toLowerCase();
  for (const [fragment, cfg] of Object.entries(AWIN_RETAILERS)) {
    if (key.includes(fragment)) {
      const encoded = encodeURIComponent(url);
      return `https://www.awin1.com/cread.php?awinmid=${cfg.advertiserId}&awinaffid=${cfg.publisherId}&ued=${encoded}`;
    }
  }

  return url;
}
