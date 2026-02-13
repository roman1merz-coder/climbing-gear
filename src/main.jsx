import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import App from "./App.jsx";
import ShoeDetail from "./ShoeDetail.jsx";
import RopeApp from "./RopeApp.jsx";
import RopeDetail from "./RopeDetail.jsx";
import BelayApp from "./BelayApp.jsx";
import BelayDetail from "./BelayDetail.jsx";
import CrashpadApp from "./CrashpadApp.jsx";
import CrashpadDetail from "./CrashpadDetail.jsx";
import Legal from "./Legal.jsx";
import Compare from "./Compare.jsx";
import CompareGeneric from "./CompareGeneric.jsx";
import About from "./About.jsx";
import Landing from "./Landing.jsx";
import Insights from "./Insights.jsx";
import GearNews from "./GearNews.jsx";
import NavBar from "./NavBar.jsx";
import { CompareProvider } from "./CompareContext.jsx";
import CompareBar from "./CompareBar.jsx";
import { WishlistProvider } from "./WishlistContext.jsx";
import { PriceAlertProvider } from "./PriceAlertContext.jsx";
import Wishlist from "./Wishlist.jsx";
import { T, GLOBAL_CSS } from "./tokens.js";

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
import ROPE_SEED from "./rope_seed_data.json";
import BELAY_SEED from "./belay_seed_data.json";
import CRASHPAD_SEED from "./crashpad_seed_data.json";

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
// Build slug→seed lookups so we can fill gaps from Supabase data
const SEED_MAP = Object.fromEntries(SEED.map(s => [s.slug, s]));
const ROPE_SEED_MAP = Object.fromEntries(ROPE_SEED.map(r => [r.slug, r]));
const BELAY_SEED_MAP = Object.fromEntries(BELAY_SEED.map(b => [b.slug, b]));
const CRASHPAD_SEED_MAP = Object.fromEntries(CRASHPAD_SEED.map(c => [c.slug, c]));

/** Merge Supabase row with seed data: Supabase wins for non-null fields, seed fills gaps */
function mergeWithSeed(sbRow, seedMap) {
  const seed = seedMap[sbRow.slug] || {};
  const merged = { ...seed };
  for (const [key, val] of Object.entries(sbRow)) {
    if (val !== null && val !== undefined) {
      merged[key] = val;
    }
  }
  return merged;
}
function mergeShoe(sbShoe) { return mergeWithSeed(sbShoe, SEED_MAP); }

/** Merge Supabase array with seed: update existing by slug, keep seed-only extras */
function mergeDataset(sbData, seedArr, seedMap) {
  const merged = sbData.map(row => mergeWithSeed(row, seedMap));
  const sbSlugs = new Set(sbData.map(r => r.slug));
  const extras = seedArr.filter(s => !sbSlugs.has(s.slug));
  return [...merged, ...extras];
}

/** Assign local image_url based on slug → /images/{category}/{slug}.jpg */
function assignLocalImages(items, category) {
  return items.map(item => ({
    ...item,
    image_url: item.image_url || `/images/${category}/${item.slug}.jpg`,
  }));
}

/* ─── Floating Action Button: links to Suggestion Hub ─── */
function FeedbackFAB() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  const isLanding = pathname === "/" || pathname === "";

  const handleClick = () => {
    if (isLanding) {
      const el = document.getElementById("suggestion-hub");
      if (el) { el.scrollIntoView({ behavior: "smooth" }); return; }
    }
    navigate("/");
    setTimeout(() => {
      const el = document.getElementById("suggestion-hub");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, 300);
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Questions & Feedback"
      style={{
        position: "fixed", bottom: "24px", right: "24px", zIndex: 900,
        width: hover ? "auto" : "52px", height: "52px",
        borderRadius: hover ? "26px" : "50%",
        background: `linear-gradient(135deg, ${T.accent}, #d4613a)`,
        color: "#fff", border: "none", cursor: "pointer",
        boxShadow: hover ? `0 8px 32px ${T.accent}50` : `0 4px 16px rgba(0,0,0,0.4)`,
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        padding: hover ? "0 20px" : "0",
        transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
        transform: hover ? "scale(1.05)" : "scale(1)",
        fontFamily: T.font, fontSize: "13px", fontWeight: 700,
        whiteSpace: "nowrap", overflow: "hidden",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {hover && <span>Questions & Feedback</span>}
    </button>
  );
}

function Root() {
  const [shoes, setShoes] = useState(SEED);
  const [src, setSrc] = useState("local");
  const [priceData, setPriceData] = useState({});
  const [priceHistory, setPriceHistory] = useState({});
  const [searchFilters, setSearchFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState("");

  // Rope & Belay state
  const [ropes, setRopes] = useState(assignLocalImages(ROPE_SEED, "ropes"));
  const [ropeSrc, setRopeSrc] = useState("seed");
  const [belays, setBelays] = useState(assignLocalImages(BELAY_SEED, "belays"));
  const [belaySrc, setBelaySrc] = useState("seed");
  const [crashpads, setCrashpads] = useState(CRASHPAD_SEED);
  const [crashpadSrc, setCrashpadSrc] = useState("seed");

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

    // Fetch ropes from Supabase — merge with seed so seed-only ropes are kept
    supabaseSelect("ropes")
      .then((data) => {
        if (data?.length) {
          const merged = mergeDataset(data, ROPE_SEED, ROPE_SEED_MAP);
          setRopes(assignLocalImages(merged, "ropes"));
          setRopeSrc(`supabase+seed · ${merged.length}`);
        }
      })
      .catch(() => {});

    // Fetch belay devices — merge with seed
    supabaseSelect("belay_devices")
      .then((data) => {
        if (data?.length) {
          const merged = mergeDataset(data, BELAY_SEED, BELAY_SEED_MAP);
          setBelays(assignLocalImages(merged, "belays"));
          setBelaySrc(`supabase+seed · ${merged.length}`);
        }
      })
      .catch(() => {});

    // Fetch crashpads — merge with seed
    supabaseSelect("crashpads")
      .then((data) => {
        if (data?.length) {
          const merged = mergeDataset(data, CRASHPAD_SEED, CRASHPAD_SEED_MAP);
          setCrashpads(merged);
          setCrashpadSrc(`supabase+seed · ${merged.length}`);
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
        <WishlistProvider>
        <PriceAlertProvider>
        <CompareProvider>
          <BrowserRouter>
            <NavBar priceData={priceData} />
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
              <Route path="/compare-ropes" element={<CompareGeneric items={ropes} type="ropes" />} />
              <Route path="/compare-belays" element={<CompareGeneric items={belays} type="belays" />} />
              <Route path="/compare-pads" element={<CompareGeneric items={crashpads} type="crashpads" />} />
              {/* Rope routes */}
              <Route path="/ropes" element={<RopeApp ropes={ropes} src={ropeSrc} />} />
              <Route path="/rope/:slug" element={<RopeDetail ropes={ropes} />} />
              {/* Belay device routes */}
              <Route path="/belays" element={<BelayApp belays={belays} src={belaySrc} />} />
              <Route path="/belay/:slug" element={<BelayDetail belays={belays} />} />
              {/* Crashpad routes */}
              <Route path="/crashpads" element={<CrashpadApp crashpads={crashpads} src={crashpadSrc} />} />
              <Route path="/crashpad/:slug" element={<CrashpadDetail crashpads={crashpads} />} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/news" element={<GearNews />} />
              <Route path="/about" element={<About />} />
              <Route path="/impressum" element={<Legal />} />
              <Route path="/privacy" element={<Legal />} />
            </Routes>
            <CompareBar shoes={shoes} ropes={ropes} belays={belays} crashpads={crashpads} />
            <FeedbackFAB />
          </BrowserRouter>
        </CompareProvider>
        </PriceAlertProvider>
        </WishlistProvider>
      </ErrorBoundary>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
