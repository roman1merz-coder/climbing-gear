import { useEffect } from "react";

const BASE_URL = "https://climbing-gear.com";

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
    description: `${shoe.brand} ${shoe.model} climbing shoe — ${shoe.closure || "lace"} closure, ${shoe.rubber_type || "rubber"} rubber, ${shoe.weight_g ? shoe.weight_g + "g" : "lightweight"}. Compare specs and prices.`,
    brand: { "@type": "Brand", name: shoe.brand },
    category: "Climbing Shoes",
    url: `${BASE_URL}/shoe/${shoe.slug}`,
    image: shoe.image_url ? `${BASE_URL}${shoe.image_url}` : undefined,
    ...(offers.length > 0 && {
      offers: offers.length === 1 ? offers[0] : {
        "@type": "AggregateOffer",
        lowPrice: Math.min(...offers.map(o => o.price)),
        highPrice: Math.max(...offers.map(o => o.price)),
        priceCurrency: offers[0].priceCurrency,
        offerCount: offers.length,
        offers,
      },
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
    description: `${rope.brand} ${rope.model} — ${rope.diameter_mm}mm ${rope.rope_type || "single"} rope, ${rope.weight_per_meter_g ? rope.weight_per_meter_g + "g/m" : ""}, ${rope.uiaa_falls ? rope.uiaa_falls + " UIAA falls" : ""}. Compare specs and prices.`,
    brand: { "@type": "Brand", name: rope.brand },
    category: "Climbing Ropes",
    url: `${BASE_URL}/rope/${rope.slug}`,
    image: rope.image_url ? `${BASE_URL}${rope.image_url}` : undefined,
    ...(offers.length > 0 && {
      offers: offers.length === 1 ? offers[0] : {
        "@type": "AggregateOffer",
        lowPrice: Math.min(...offers.map(o => o.price)),
        highPrice: Math.max(...offers.map(o => o.price)),
        priceCurrency: offers[0].priceCurrency,
        offerCount: offers.length,
        offers,
      },
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
    description: `${belay.brand} ${belay.model} belay device — ${belay.type || "assisted-braking"}, ${belay.weight_g ? belay.weight_g + "g" : ""}. Compare specs and prices.`,
    brand: { "@type": "Brand", name: belay.brand },
    category: "Belay Devices",
    url: `${BASE_URL}/belay/${belay.slug}`,
    image: belay.image_url ? `${BASE_URL}${belay.image_url}` : undefined,
    ...(offers.length > 0 && {
      offers: offers.length === 1 ? offers[0] : {
        "@type": "AggregateOffer",
        lowPrice: Math.min(...offers.map(o => o.price)),
        highPrice: Math.max(...offers.map(o => o.price)),
        priceCurrency: offers[0].priceCurrency,
        offerCount: offers.length,
        offers,
      },
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
 * Build WebSite structured data for the homepage.
 */
export function buildWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "climbing-gear.com",
    url: BASE_URL,
    description: "Compare 500+ climbing products — shoes, ropes, belay devices, and crashpads. Every spec, every price, zero brand bias.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${BASE_URL}/shoes?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
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
    description: `Compare ${items.length}+ climbing ${category.toLowerCase()} — specs, prices, and performance data.`,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/${pathPrefix}/${item.slug}`,
      name: `${item.brand} ${item.model}`,
    })),
  };
}
