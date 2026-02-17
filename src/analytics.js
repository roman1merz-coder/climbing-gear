// Enhanced Analytics - Custom Event Tracking
// Integrates with Vercel Analytics for detailed user behavior tracking

import { track } from '@vercel/analytics';

/**
 * Track product views
 * @param {string} category - Product category (shoes, ropes, crashpads, belays)
 * @param {string} slug - Product slug
 * @param {string} brand - Product brand
 * @param {string} model - Product model
 */
export function trackProductView(category, slug, brand, model) {
  track('product_view', {
    category,
    slug,
    brand,
    model,
  });
}

/**
 * Track price comparison clicks
 * @param {string} retailer - Retailer name
 * @param {number} price - Price in EUR
 * @param {string} productSlug - Product slug
 */
export function trackPriceClick(retailer, price, productSlug) {
  track('price_click', {
    retailer,
    price,
    product: productSlug,
  });
}

/**
 * Track wishlist actions
 * @param {string} action - 'add' or 'remove'
 * @param {string} productSlug - Product slug
 */
export function trackWishlist(action, productSlug) {
  track('wishlist', {
    action,
    product: productSlug,
  });
}

/**
 * Track compare actions
 * @param {string} action - 'add' or 'remove'
 * @param {string} productSlug - Product slug
 */
export function trackCompare(action, productSlug) {
  track('compare', {
    action,
    product: productSlug,
  });
}

/**
 * Track filter usage
 * @param {string} category - Product category
 * @param {object} filters - Applied filters
 */
export function trackFilterUse(category, filters) {
  track('filter_use', {
    category,
    filter_count: Object.keys(filters).length,
    filters: JSON.stringify(filters),
  });
}

/**
 * Track Amazon search clicks
 * @param {string} productType - Product type (climbing shoe, rope, etc)
 * @param {string} brand - Brand name
 * @param {string} model - Model name
 */
export function trackAmazonSearch(productType, brand, model) {
  track('amazon_search', {
    product_type: productType,
    brand,
    model,
  });
}

/**
 * Track navigation between pages
 * @param {string} from - Previous page
 * @param {string} to - Next page
 */
export function trackNavigation(from, to) {
  track('navigation', {
    from,
    to,
  });
}

/**
 * Track search/sort usage
 * @param {string} category - Product category
 * @param {string} sortBy - Sort option
 */
export function trackSort(category, sortBy) {
  track('sort', {
    category,
    sort_by: sortBy,
  });
}
