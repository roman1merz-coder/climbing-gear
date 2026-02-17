// ═══ Sorting Logic ═══
// 6 sort options, brand-neutral "Best Match" algorithm

import { T } from "./tokens.js";

export const SORT_OPTIONS = [
  { key: "best_match",   label: "Best Match" },
  { key: "price_asc",    label: "Price: Low \u2192 High" },
  { key: "price_desc",   label: "Price: High \u2192 Low" },
  { key: "discount",     label: "Biggest Discount" },
  { key: "newest",       label: "Newest Models" },
  { key: "brand_az",     label: "Brand A\u2013Z" },
];

function bestMatchScore(shoe) {
  let score = 0;
  if (shoe.current_price_eur && shoe.current_price_eur > 0) score += 30;
  if (shoe.price_uvp_eur && shoe.current_price_eur) {
    const discountPct = (shoe.price_uvp_eur - shoe.current_price_eur) / shoe.price_uvp_eur;
    score += Math.min(20, Math.max(0, discountPct * 60));
  }
  const hasImage = shoe.image_url && shoe.image_url.startsWith("/images/");
  const hasReviews = Array.isArray(shoe.customer_voices) && shoe.customer_voices.length > 0;
  const hasDescription = shoe.description && shoe.description.length > 50;
  const hasSpecs = shoe.rubber_compound || shoe.rubber_manufacturer;
  score += (hasImage ? 5 : 0) + (hasReviews ? 5 : 0) + (hasDescription ? 5 : 0) + (hasSpecs ? 5 : 0);
  if (shoe.year_released) {
    const age = new Date().getFullYear() - shoe.year_released;
    score += Math.max(0, 15 - age * 3);
  }
  if (shoe._retailerCount) {
    score += Math.min(15, shoe._retailerCount * 3);
  }
  return score;
}

export function sortShoes(shoes, sortKey, priceData = {}) {
  const enriched = shoes.map(s => ({
    ...s,
    _retailerCount: (priceData[s.slug] || []).filter(p => p.inStock).length,
  }));
  const sorted = [...enriched];

  switch (sortKey) {
    case "price_asc":
      sorted.sort((a, b) => (a.current_price_eur || Infinity) - (b.current_price_eur || Infinity));
      break;
    case "price_desc":
      sorted.sort((a, b) => (b.current_price_eur || 0) - (a.current_price_eur || 0));
      break;
    case "discount":
      sorted.sort((a, b) => {
        const da = (a.price_uvp_eur && a.current_price_eur) ? (a.price_uvp_eur - a.current_price_eur) / a.price_uvp_eur : 0;
        const db = (b.price_uvp_eur && b.current_price_eur) ? (b.price_uvp_eur - b.current_price_eur) / b.price_uvp_eur : 0;
        return db - da;
      });
      break;
    case "newest":
      sorted.sort((a, b) => (b.year_released || 0) - (a.year_released || 0));
      break;
    case "brand_az":
      sorted.sort((a, b) => {
        const brandCmp = (a.brand || "").localeCompare(b.brand || "");
        return brandCmp !== 0 ? brandCmp : (a.model || "").localeCompare(b.model || "");
      });
      break;
    case "best_match":
    default:
      sorted.sort((a, b) => bestMatchScore(b) - bestMatchScore(a));
      break;
  }
  return sorted;
}

/**
 * Generic sort for any gear type.
 * Pass accessor functions for price, weight fields, or use defaults (shoe-style).
 */
export function sortItems(items, sortKey, { getPrice, getUvp, getBrand, getModel, getWeight } = {}) {
  const gp = getPrice || (i => i.current_price_eur);
  const gu = getUvp || (i => i.price_uvp_eur);
  const gb = getBrand || (i => i.brand);
  const gm = getModel || (i => i.model);
  const gw = getWeight || (i => i.weight_g || i.weight_per_meter_g || i.weight_kg);
  const sorted = [...items];
  switch (sortKey) {
    case "price_asc":
      sorted.sort((a, b) => (gp(a) || Infinity) - (gp(b) || Infinity));
      break;
    case "price_desc":
      sorted.sort((a, b) => (gp(b) || 0) - (gp(a) || 0));
      break;
    case "discount":
      sorted.sort((a, b) => {
        const da = (gu(a) && gp(a)) ? (gu(a) - gp(a)) / gu(a) : 0;
        const db = (gu(b) && gp(b)) ? (gu(b) - gp(b)) / gu(b) : 0;
        return db - da;
      });
      break;
    case "weight_asc":
      sorted.sort((a, b) => (gw(a) || Infinity) - (gw(b) || Infinity));
      break;
    case "weight_desc":
      sorted.sort((a, b) => (gw(b) || 0) - (gw(a) || 0));
      break;
    case "brand_az":
      sorted.sort((a, b) => {
        const bc = (gb(a) || "").localeCompare(gb(b) || "");
        return bc !== 0 ? bc : (gm(a) || "").localeCompare(gm(b) || "");
      });
      break;
    case "best_match":
    default:
      break; // keep existing order from scoring
  }
  return sorted;
}

export const SORT_OPTIONS_GENERIC = [
  { key: "best_match",   label: "Best Match" },
  { key: "price_asc",    label: "Price: Low → High" },
  { key: "price_desc",   label: "Price: High → Low" },
  { key: "discount",     label: "Biggest Discount" },
  { key: "weight_asc",   label: "Weight: Light → Heavy" },
  { key: "weight_desc",  label: "Weight: Heavy → Light" },
  { key: "brand_az",     label: "Brand A–Z" },
];

export function SortDropdownGeneric({ value, onChange, options }) {
  const opts = options || SORT_OPTIONS_GENERIC;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "11px", color: T.muted, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
        Sort by
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: "7px 12px", borderRadius: "8px",
          border: `1px solid ${T.border}`, background: T.surface,
          color: T.text, fontSize: "12px", fontWeight: 600,
          fontFamily: T.font, cursor: "pointer", outline: "none",
          appearance: "none", paddingRight: "28px",
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23717889' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
        }}
      >
        {opts.map(o => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function SortDropdown({ value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "11px", color: T.muted, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
        Sort by
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: "7px 12px", borderRadius: "8px",
          border: `1px solid ${T.border}`, background: T.surface,
          color: T.text, fontSize: "12px", fontWeight: 600,
          fontFamily: T.font, cursor: "pointer", outline: "none",
          appearance: "none", paddingRight: "28px",
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23717889' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
        }}
      >
        {SORT_OPTIONS.map(o => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
