import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import ShoeDetail from "./ShoeDetail.jsx";
import Legal from "./Legal.jsx";
import Compare from "./Compare.jsx";
import About from "./About.jsx";
import Landing from "./Landing.jsx";
import { CompareProvider } from "./CompareContext.jsx";
import CompareBar from "./CompareBar.jsx";
import { GLOBAL_CSS } from "./tokens.js";

// ─── Data Bridge ─────────────────────────────────────────────
// Both App (list) and ShoeDetail (detail) need access to shoes.
// This wrapper fetches once and passes data down.

import { useState, useEffect } from "react";

const SUPABASE_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjA3OTEsImV4cCI6MjA4NjEzNjc5MX0.QH3wFa14gSvRKOz8Q099sbKvKoSroGJfPerdZgPtbTI";

async function supabaseSelect(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

// Seed data — Vite imports JSON natively.
import SEED from "./seed_data.json";

// ─── Price Data (fetched live from Supabase) ─────────────────
// Populated by api/fetch-prices.js cron (SerpApi → Supabase)
async function fetchLivePrices() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/prices?select=*&order=price_eur`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) return {};
    const rows = await res.json();
    // Group by shoe_slug → array of {shop, price, url, inStock, ...}
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.shoe_slug]) grouped[r.shoe_slug] = [];
      grouped[r.shoe_slug].push({
        shop: r.retailer,
        price: Number(r.price_eur),
        oldPrice: r.old_price_eur ? Number(r.old_price_eur) : null,
        url: r.product_url || "#",
        inStock: r.in_stock !== false,
        shipping: "",
        delivery: r.delivery || "",
      });
    }
    return grouped;
  } catch { return {}; }
}

async function fetchPriceHistory() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/price_history?select=shoe_slug,price_eur,recorded_at&order=recorded_at`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (!res.ok) return {};
    const rows = await res.json();
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.shoe_slug]) grouped[r.shoe_slug] = [];
      const d = new Date(r.recorded_at);
      grouped[r.shoe_slug].push({
        month: d.toLocaleString("en", { month: "short" }),
        price: Number(r.price_eur),
      });
    }
    return grouped;
  } catch { return {}; }
}

// ─── Error Boundary ──────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "40px", color: "#ef4444", background: "#0e1015", minHeight: "100vh", fontFamily: "monospace" }}>
          <h2>Something went wrong</h2>
          <pre style={{ fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {String(this.state.error)}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = "/shoes"; }}
            style={{ marginTop: "20px", padding: "10px 20px", background: "#E8734A", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}
          >
            ← Back to search
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Root ────────────────────────────────────────────────────
// Build a slug→seed lookup so we can fill gaps from Supabase data
const SEED_MAP = Object.fromEntries(SEED.map(s => [s.slug, s]));

/** Merge Supabase row with seed data: Supabase wins for non-null fields, seed fills gaps */
function mergeShoe(sbShoe) {
  const seed = SEED_MAP[sbShoe.slug] || {};
  const merged = { ...seed };
  for (const [key, val] of Object.entries(sbShoe)) {
    if (val !== null && val !== undefined) {
      merged[key] = val;
    }
  }
  return merged;
}

function Root() {
  const [shoes, setShoes] = useState(SEED);
  const [src, setSrc] = useState("local");
  const [priceData, setPriceData] = useState({});
  const [priceHistory, setPriceHistory] = useState({});
  const [searchFilters, setSearchFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // Fetch shoes from Supabase
    supabaseSelect("shoes")
      .then((data) => {
        if (data?.length) {
          const merged = data.map(mergeShoe).filter(s => SEED_MAP[s.slug]);
          const sbSlugs = new Set(data.map(s => s.slug));
          const extras = SEED.filter(s => !sbSlugs.has(s.slug));
          setShoes([...merged, ...extras]);
          setSrc("supabase+seed");
        }
      })
      .catch(() => {});

    // Fetch live prices
    fetchLivePrices().then(setPriceData);
    fetchPriceHistory().then(setPriceHistory);
  }, []);

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <ErrorBoundary>
        <CompareProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/shoes" element={<App shoes={shoes} src={src} priceData={priceData} filters={searchFilters} setFilters={setSearchFilters} query={searchQuery} setQuery={setSearchQuery} />} />
              <Route
                path="/shoe/:slug"
                element={
                  <ShoeDetail
                    shoes={shoes}
                    priceData={priceData}
                    priceHistory={priceHistory}
                  />
                }
              />
              <Route path="/compare" element={<Compare shoes={shoes} />} />
              <Route path="/about" element={<About />} />
              <Route path="/impressum" element={<Legal />} />
              <Route path="/privacy" element={<Legal />} />
            </Routes>
            <CompareBar shoes={shoes} />
          </BrowserRouter>
        </CompareProvider>
      </ErrorBoundary>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
