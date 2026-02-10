import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import ShoeDetail from "./ShoeDetail.jsx";
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

// Mock price data (will be replaced by live scraping later)
const PRICE_DATA = {
  "scarpa-instinct-vs-mens": [
    { shop: "bergfreunde.de", price: 149.0, url: "#", inStock: true, shipping: "Free", delivery: "2-4 days" },
    { shop: "bergzeit.de", price: 152.95, url: "#", inStock: true, shipping: "Free >€50", delivery: "1-3 days" },
    { shop: "epictv.com", price: 154.9, url: "#", inStock: true, shipping: "€4.95", delivery: "3-5 days" },
    { shop: "bananafingers.co.uk", price: 159.0, url: "#", inStock: false, shipping: "—", delivery: "—" },
  ],
  "scarpa-drago": [
    { shop: "bergfreunde.de", price: 162.0, url: "#", inStock: true, shipping: "Free", delivery: "2-4 days" },
    { shop: "oliunid.com", price: 169.0, url: "#", inStock: true, shipping: "Free >€80", delivery: "3-5 days" },
    { shop: "epictv.com", price: 174.9, url: "#", inStock: true, shipping: "€4.95", delivery: "3-5 days" },
  ],
};

const PRICE_HISTORY = {
  "scarpa-instinct-vs-mens": [
    { month: "Sep", price: 175 },
    { month: "Oct", price: 175 },
    { month: "Nov", price: 159 },
    { month: "Dec", price: 155 },
    { month: "Jan", price: 149 },
    { month: "Feb", price: 149 },
  ],
};

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
            onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
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
function Root() {
  const [shoes, setShoes] = useState(SEED);
  const [src, setSrc] = useState("local");

  useEffect(() => {
    supabaseSelect("shoes")
      .then((data) => {
        if (data?.length) {
          setShoes(data);
          setSrc("supabase");
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<App shoes={shoes} src={src} />} />
            <Route
              path="/shoe/:slug"
              element={
                <ShoeDetail
                  shoes={shoes}
                  priceData={PRICE_DATA}
                  priceHistory={PRICE_HISTORY}
                />
              }
            />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
