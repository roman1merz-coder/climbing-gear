import { useEffect } from "react";

const BASE_URL = "https://www.climbing-gear.com";

/**
 * Injects JSON-LD structured data into <head>.
 * Removes it on unmount to avoid stale data across routes.
 *
 * @param {object|null} data - The structured data object (will be wrapped in <script type="application/ld+json">)
 */
export default function useStructuredData(data) {
  useEffect(() => {
    if (!data) return;

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(data);
    script.id = "structured-data-jsonld";
    // Remove any previous one first
    const old = document.getElementById("structured-data-jsonld");
    if (old) old.remove();
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [data]);
}

/**
 * Build Product structured data for a climbing shoe.
 */
export function buildShoeSchema(shoe, priceData) {
  if (!shoe) return null;
  const prices = priceData?.[shoe.slug];
  const offers = [];

  if (prices?.retailers) {
    for (const r of prices.retailers) {
      if (r.price && r.url) {
        offers.push({
          "@type": "Offer",
          url: r.url,
          priceCurrency: r.currency || "EUR",
          price: r.price,
          availability: "https://schema.org/InStock",
          seller: { "@type": "Organization", name: r.name },
        });
      }
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${shoe.brand} ${shoe.model}`,
    description: `${shoe.brand} ${shoe.model} climbing shoe - ${shoe.closure || "lace"} closure, ${shoe.rubber_type || "rubber"} rubber, ${shoe.weight_g ? shoe.weight_g + "g" : "lightweight"}. Compare specs and prices.`,
    brand: { "@type": "Brand", name: shoe.brand },
    category: "Climbing Shoes",
    url: `${BASE_URL}/shoe/${shoe.slug}`,
    image: shoe.image_url ? `${BASE_URL}${shoe.image_url}` : undefined,
    offers: offers.length === 0 ? {
      "@type": "Offer",
      url: `${BASE_URL}/shoe/${shoe.slug}`,
      priceCurrency: "EUR",
      availability: "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "climbing-gear.com" },
    } : (offers.length === 1 ? offers[0] : {
      "@type": "AggregateOffer",
      lowPrice: Math.min(...offers.map(o => o.price)),
      highPrice: Math.max(...offers.map(o => o.price)),
      priceCurrency: offers[0].priceCurrency,
      offerCount: offers.length,
      offers,
    }),
    additionalProperty: [
      shoe.weight_g && { "@type": "PropertyValue", name: "Weight", value: `${shoe.weight_g}g` },
      shoe.closure && { "@type": "PropertyValue", name: "Closure", value: shoe.closure },
      shoe.downturn && { "@type": "PropertyValue", name: "Downturn", value: shoe.downturn },
      shoe.asymmetry && { "@type": "PropertyValue", name: "Asymmetry", value: shoe.asymmetry },
      shoe.rubber_type && { "@type": "PropertyValue", name: "Rubber", value: shoe.rubber_type },
      shoe.rubber_thickness_mm && { "@type": "PropertyValue", name: "Rubber Thickness", value: `${shoe.rubber_thickness_mm}mm` },
    ].filter(Boolean),
  };
}

/**
 * Build Product structured data for a rope.
 */
export function buildRopeSchema(rope, priceData) {
  if (!rope) return null;
  const prices = priceData?.[rope.slug];
  const offers = [];

  if (prices?.retailers) {
    for (const r of prices.retailers) {
      if (r.price && r.url) {
        offers.push({
          "@type": "Offer",
          url: r.url,
          priceCurrency: r.currency || "EUR",
          price: r.price,
          availability: "https://schema.org/InStock",
          seller: { "@type": "Organization", name: r.name },
        });
      }
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${rope.brand} ${rope.model}`,
    description: `${rope.brand} ${rope.model} - ${rope.diameter_mm}mm ${rope.rope_type || "single"} rope, ${rope.weight_per_meter_g ? rope.weight_per_meter_g + "g/m" : ""}, ${rope.uiaa_falls ? rope.uiaa_falls + " UIAA falls" : ""}. Compare specs and prices.`,
    brand: { "@type": "Brand", name: rope.brand },
    category: "Climbing Ropes",
    url: `${BASE_URL}/rope/${rope.slug}`,
    image: rope.image_url ? `${BASE_URL}${rope.image_url}` : undefined,
    offers: offers.length === 0 ? {
      "@type": "Offer",
      url: `${BASE_URL}/rope/${rope.slug}`,
      priceCurrency: "EUR",
      availability: "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "climbing-gear.com" },
    } : (offers.length === 1 ? offers[0] : {
      "@type": "AggregateOffer",
      lowPrice: Math.min(...offers.map(o => o.price)),
      highPrice: Math.max(...offers.map(o => o.price)),
      priceCurrency: offers[0].priceCurrency,
      offerCount: offers.length,
      offers,
    }),
    additionalProperty: [
      rope.diameter_mm && { "@type": "PropertyValue", name: "Diameter", value: `${rope.diameter_mm}mm` },
      rope.weight_per_meter_g && { "@type": "PropertyValue", name: "Weight per Meter", value: `${rope.weight_per_meter_g}g/m` },
      rope.uiaa_falls && { "@type": "PropertyValue", name: "UIAA Falls", value: String(rope.uiaa_falls) },
      rope.dynamic_elongation_pct && { "@type": "PropertyValue", name: "Dynamic Elongation", value: `${rope.dynamic_elongation_pct}%` },
      rope.sheath_proportion_pct && { "@type": "PropertyValue", name: "Sheath Proportion", value: `${rope.sheath_proportion_pct}%` },
    ].filter(Boolean),
  };
}

/**
 * Build Product structured data for a belay device.
 */
export function buildBelaySchema(belay, priceData) {
  if (!belay) return null;
  const prices = priceData?.[belay.slug];
  const offers = [];

  if (prices?.retailers) {
    for (const r of prices.retailers) {
      if (r.price && r.url) {
        offers.push({
          "@type": "Offer",
          url: r.url,
          priceCurrency: r.currency || "EUR",
          price: r.price,
          availability: "https://schema.org/InStock",
          seller: { "@type": "Organization", name: r.name },
        });
      }
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${belay.brand} ${belay.model}`,
    description: `${belay.brand} ${belay.model} belay device - ${belay.type || "assisted-braking"}, ${belay.weight_g ? belay.weight_g + "g" : ""}. Compare specs and prices.`,
    brand: { "@type": "Brand", name: belay.brand },
    category: "Belay Devices",
    url: `${BASE_URL}/belay/${belay.slug}`,
    image: belay.image_url ? `${BASE_URL}${belay.image_url}` : undefined,
    offers: offers.length === 0 ? {
      "@type": "Offer",
      url: `${BASE_URL}/belay/${belay.slug}`,
      priceCurrency: "EUR",
      availability: "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "climbing-gear.com" },
    } : (offers.length === 1 ? offers[0] : {
      "@type": "AggregateOffer",
      lowPrice: Math.min(...offers.map(o => o.price)),
      highPrice: Math.max(...offers.map(o => o.price)),
      priceCurrency: offers[0].priceCurrency,
      offerCount: offers.length,
      offers,
    }),
    additionalProperty: [
      belay.weight_g && { "@type": "PropertyValue", name: "Weight", value: `${belay.weight_g}g` },
      belay.type && { "@type": "PropertyValue", name: "Type", value: belay.type },
      belay.rope_diameter_min_mm && { "@type": "PropertyValue", name: "Min Rope Diameter", value: `${belay.rope_diameter_min_mm}mm` },
      belay.rope_diameter_max_mm && { "@type": "PropertyValue", name: "Max Rope Diameter", value: `${belay.rope_diameter_max_mm}mm` },
    ].filter(Boolean),
  };
}

/**
 * Build Product structured data for a quickdraw.
 */
export function buildQuickdrawSchema(qd, priceData) {
  if (!qd) return null;
  const prices = priceData?.[qd.slug];
  const offers = [];

  if (prices?.retailers) {
    for (const r of prices.retailers) {
      if (r.price && r.url) {
        offers.push({
          "@type": "Offer",
          url: r.url,
          priceCurrency: r.currency || "EUR",
          price: r.price,
          availability: "https://schema.org/InStock",
          seller: { "@type": "Organization", name: r.name },
        });
      }
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${qd.brand} ${qd.model}`,
    description: `${qd.brand} ${qd.model} quickdraw - ${qd.quickdraw_type || "sport"}, ${qd.weight_g ? qd.weight_g + "g" : ""}, ${qd.strength_major_kn ? qd.strength_major_kn + "kN" : ""}. Compare specs and prices.`,
    brand: { "@type": "Brand", name: qd.brand },
    category: "Quickdraws",
    url: `${BASE_URL}/quickdraw/${qd.slug}`,
    image: qd.image_url ? `${BASE_URL}${qd.image_url}` : undefined,
    offers: offers.length === 0 ? {
      "@type": "Offer",
      url: `${BASE_URL}/quickdraw/${qd.slug}`,
      priceCurrency: "EUR",
      availability: "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "climbing-gear.com" },
    } : (offers.length === 1 ? offers[0] : {
      "@type": "AggregateOffer",
      lowPrice: Math.min(...offers.map(o => o.price)),
      highPrice: Math.max(...offers.map(o => o.price)),
      priceCurrency: offers[0].priceCurrency,
      offerCount: offers.length,
      offers,
    }),
    additionalProperty: [
      qd.weight_g && { "@type": "PropertyValue", name: "Weight", value: `${qd.weight_g}g` },
      qd.quickdraw_type && { "@type": "PropertyValue", name: "Type", value: qd.quickdraw_type },
      qd.strength_major_kn && { "@type": "PropertyValue", name: "Major Axis Strength", value: `${qd.strength_major_kn}kN` },
      qd.sling_material && { "@type": "PropertyValue", name: "Sling Material", value: qd.sling_material },
    ].filter(Boolean),
  };
}

/**
 * Build Product structured data for a crashpad.
 */
export function buildCrashpadSchema(pad, priceData) {
  if (!pad) return null;
  const prices = priceData?.[pad.slug];
  const offers = [];

  if (prices?.retailers) {
    for (const r of prices.retailers) {
      if (r.price && r.url) {
        offers.push({
          "@type": "Offer",
          url: r.url,
          priceCurrency: r.currency || "EUR",
          price: r.price,
          availability: "https://schema.org/InStock",
          seller: { "@type": "Organization", name: r.name },
        });
      }
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${pad.brand} ${pad.model}`,
    description: `${pad.brand} ${pad.model} crashpad - ${pad.weight_kg ? pad.weight_kg + "kg" : ""}, ${pad.open_length_cm && pad.open_width_cm ? pad.open_length_cm + "×" + pad.open_width_cm + "cm" : ""}. Compare specs and prices.`,
    brand: { "@type": "Brand", name: pad.brand },
    category: "Crashpads",
    url: `${BASE_URL}/crashpad/${pad.slug}`,
    image: pad.image_url ? `${BASE_URL}${pad.image_url}` : undefined,
    offers: offers.length === 0 ? {
      "@type": "Offer",
      url: `${BASE_URL}/crashpad/${pad.slug}`,
      priceCurrency: "EUR",
      availability: "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "climbing-gear.com" },
    } : (offers.length === 1 ? offers[0] : {
      "@type": "AggregateOffer",
      lowPrice: Math.min(...offers.map(o => o.price)),
      highPrice: Math.max(...offers.map(o => o.price)),
      priceCurrency: offers[0].priceCurrency,
      offerCount: offers.length,
      offers,
    }),
    additionalProperty: [
      pad.weight_kg && { "@type": "PropertyValue", name: "Weight", value: `${pad.weight_kg}kg` },
      pad.open_length_cm && { "@type": "PropertyValue", name: "Length", value: `${pad.open_length_cm}cm` },
      pad.open_width_cm && { "@type": "PropertyValue", name: "Width", value: `${pad.open_width_cm}cm` },
      pad.thickness_cm && { "@type": "PropertyValue", name: "Thickness", value: `${pad.thickness_cm}cm` },
      pad.foam_type && { "@type": "PropertyValue", name: "Foam", value: pad.foam_type },
    ].filter(Boolean),
  };
}

/**
 * Build WebSite structured data for the homepage.
 *
 * Note: the Sitelinks Searchbox feature (potentialAction → SearchAction) was
 * deprecated by Google in early 2024 and no longer renders. We previously
 * emitted it with `urlTemplate: ".../shoes?q={search_term_string}"`, which
 * Googlebot was crawling literally — the placeholder URL appeared in GSC as
 * "Alternative Seite mit kanonischem Tag" and "Crawled — currently not
 * indexed". Removed 2026-05-07; do NOT re-add unless Google revives the spec.
 */
export function buildWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "climbing-gear.com",
    url: BASE_URL,
    description: "Compare 750+ climbing products - shoes, ropes, belay devices, and crashpads. Every spec, every price, zero brand bias.",
  };
}

/**
 * Build ItemList structured data for category pages.
 */
export function buildItemListSchema(items, category, pathPrefix) {
  if (!items?.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Climbing ${category} Comparison`,
    description: `Compare ${items.length}+ climbing ${category.toLowerCase()} - specs, prices, and performance data.`,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/${pathPrefix}/${item.slug}`,
      name: `${item.brand} ${item.model}`,
    })),
  };
}
