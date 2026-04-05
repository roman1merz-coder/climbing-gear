import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { T } from "./tokens.js";
import { supabaseFetch, supabaseRpc, SUPABASE_URL } from "./supabase.js";
import useIsMobile from "./useIsMobile.js";
import usePageMeta from "./usePageMeta.js";

// Service-role key for writes (same key already public in scan.html)
const SB_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4";

// ══════════════════════════════════════════════════════════════
// Population reference values (from spec / literature)
// Mean +/- SD from Jurca et al. 2019, Karger 2024, Goonetilleke
// ══════════════════════════════════════════════════════════════
const POP = {
  forefoot_width_ratio:  { mean: 0.383, std: 0.021 },
  arch_length_ratio:     { mean: 0.700, std: 0.025 },
  heel_width_ratio:      { mean: 0.251, std: 0.018 },
  instep_height_ratio:   { mean: 0.290, std: 0.030 },
  heel_depth_ratio:      { mean: 0.035, std: 0.020 },
};

const META = {
  forefoot_width_ratio:  { min: 0.31, max: 0.45, label: "Forefoot Width",  color: T.accent },
  arch_length_ratio:     { min: 0.61, max: 0.77, label: "Arch Length",     color: T.accent },
  heel_width_ratio:      { min: 0.20, max: 0.31, label: "Heel Width",      color: T.accent },
  instep_height_ratio:   { min: 0.20, max: 0.38, label: "Instep Height",   color: "#34d399" },
  heel_depth_ratio:      { min: 0.00, max: 0.15, label: "Heel Depth",      color: "#f472b6" },
};

const TOE_DESCRIPTIONS = {
  egyptian: "Big toe is the longest, toes descend in a smooth slope. Most common shape.",
  greek:    "Second toe is the longest, extends past the big toe. Needs a slightly deeper toe box.",
  roman:    "First two toes are nearly equal in length. Works with symmetrical toe boxes.",
};

// ── Helpers ──────────────────────────────────────────────────
function zColor(val, mean, std) {
  const z = Math.abs(val - mean) / std;
  if (z < 0.7) return T.green;
  if (z < 1.5) return T.yellow;
  return T.red;
}
function pct(val, mn, mx) {
  return Math.max(0, Math.min(100, ((val - mn) / (mx - mn)) * 100));
}
function levelLabel(val, mean, std) {
  const z = (val - mean) / std;
  if (z < -0.7) return "low";
  if (z > 0.7) return "high";
  return "mid";
}

// ── Metric bar component ─────────────────────────────────────
function MetricBar({ ratioKey, value }) {
  const p = POP[ratioKey];
  const m = META[ratioKey];
  if (!p || !m || value == null) return null;
  const fill = pct(value, m.min, m.max);
  const avg = pct(p.mean, m.min, m.max);
  const color = zColor(value, p.mean, p.std);
  const lbl = levelLabel(value, p.mean, p.std);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: T.text }}>{m.label}</span>
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color }}>{lbl}</span>
      </div>
      <div style={{ height: 5, background: "#e8e2d6", borderRadius: 3, position: "relative" }}>
        <div style={{ height: "100%", borderRadius: 3, background: T.accent, width: `${fill}%`, transition: "width 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
        <div style={{ position: "absolute", top: -3, left: `${avg}%`, width: 2, height: 11, background: "#a8a08e", borderRadius: 1, transform: "translateX(-1px)" }} title={`Average: ${p.mean.toFixed(3)}`} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.58rem", color: "#a8a08e" }}>
        <span>{m.min}</span><span>{m.max}</span>
      </div>
    </div>
  );
}

// ── Shoe recommendation card ─────────────────────────────────
function ShoeCard({ slug, brand, model, description, why, tradeoffs, imageUrl, recommendedSize, sizeNote, bestOffer }) {
  return (
    <div style={{
      background: T.card, border: `1px solid #eee8dc`, borderRadius: 12,
      overflow: "hidden", transition: "box-shadow 0.15s",
    }}>
      <Link to={`/shoe/${slug}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        <img
          src={imageUrl || `/images/shoes/${slug}.jpg`}
          alt={`${brand} ${model}`}
          loading="lazy"
          style={{ width: "100%", aspectRatio: "1", objectFit: "contain", background: "#faf8f4", padding: 12 }}
        />
        <div style={{ padding: "0.8rem 1rem" }}>
          <div style={{ fontSize: "0.7rem", color: T.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{brand}</div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: T.text, margin: "0.15rem 0 0.4rem" }}>{model}</div>
          {/* Size + Price row */}
          {(recommendedSize || bestOffer) && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap",
              margin: "0 0 0.4rem", padding: "0.35rem 0.5rem",
              background: T.accentSoft || "#f5f0e8", borderRadius: 6,
            }}>
              {recommendedSize && (
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: T.accent, whiteSpace: "nowrap" }}>
                  EU {recommendedSize}
                </span>
              )}
              {recommendedSize && bestOffer && (
                <span style={{ fontSize: "0.65rem", color: "#c5bfb3" }}>|</span>
              )}
              {bestOffer && bestOffer.price_eur && (
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#2d7a3a", whiteSpace: "nowrap" }}>
                  {Number(bestOffer.price_eur).toFixed(0)} EUR
                </span>
              )}
              {bestOffer && bestOffer.retailer && (
                <span style={{ fontSize: "0.65rem", color: T.muted, whiteSpace: "nowrap" }}>
                  @ {bestOffer.retailer}
                </span>
              )}
            </div>
          )}
          {sizeNote && (
            <div style={{ fontSize: "0.68rem", color: "#8a8272", lineHeight: 1.4, marginBottom: "0.35rem", fontStyle: "italic" }}>
              {sizeNote}
            </div>
          )}
          {description && (
            <div style={{ fontSize: "0.75rem", color: "#5a5344", lineHeight: 1.5, marginBottom: "0.3rem" }}>{description}</div>
          )}
          <div style={{ fontSize: "0.75rem", color: "#5a5344", lineHeight: 1.5 }}>{why}</div>
          {tradeoffs && (
            <div style={{ fontSize: "0.73rem", color: "#8a7e6e", lineHeight: 1.5, fontStyle: "italic", marginTop: "0.3rem" }}>{tradeoffs}</div>
          )}
          <div style={{
            marginTop: "0.6rem", padding: "0.45rem 0", textAlign: "center",
            fontSize: "0.75rem", fontWeight: 600, color: T.accent,
            border: `1px solid ${T.accent}`, borderRadius: 6,
          }}>
            Check details and availability
          </div>
        </div>
      </Link>
    </div>
  );
}

// ── Email capture card ───────────────────────────────────────
function EmailCapture({ scanId }) {
  const [email, setEmail] = useState("");
  const [freq, setFreq] = useState("once");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error

  async function handleSend() {
    if (!email.trim() || !scanId) return;
    setStatus("sending");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/foot_scan_fits?scan_id=eq.${scanId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${SB_SERVICE_KEY}`,
          apikey: SB_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim(), email_freq: freq }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("sent");
    } catch (e) {
      console.error("Email save failed:", e);
      setStatus("error");
    }
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #e8e2d6",
      padding: "1rem 1.2rem", marginBottom: "1rem",
      boxShadow: "0 2px 16px rgba(44,50,39,0.05)",
    }}>
      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: T.text, marginBottom: "0.5rem" }}>
        Get your results via email
      </div>
      <input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          width: "100%", padding: "10px 12px", border: "1.5px solid #e8e2d6",
          borderRadius: 10, fontSize: "0.85rem", fontFamily: "inherit",
          background: "#faf8f4", boxSizing: "border-box", marginBottom: "0.6rem",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.7rem" }}>
        <label style={{
          display: "flex", gap: "0.5rem", padding: "0.5rem 0.65rem",
          border: `1.5px solid ${freq === "once" ? "#c98a42" : "#e8e2d6"}`,
          borderRadius: 10, cursor: "pointer",
          background: freq === "once" ? "#fdf8f1" : "#fff",
        }}>
          <input
            type="radio" name="email-freq" value="once"
            checked={freq === "once"} onChange={() => setFreq("once")}
            style={{ marginTop: 2, accentColor: "#c98a42", flexShrink: 0 }}
          />
          <span>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#2c3227", lineHeight: 1.3 }}>
              Send results only
            </div>
            <div style={{ fontSize: "0.72rem", color: "#7a7462", lineHeight: 1.4 }}>
              One-time email with your scan results and shoe recommendations.
            </div>
          </span>
        </label>
        <label style={{
          display: "flex", gap: "0.5rem", padding: "0.5rem 0.65rem",
          border: `1.5px solid ${freq === "updates" ? "#c98a42" : "#e8e2d6"}`,
          borderRadius: 10, cursor: "pointer",
          background: freq === "updates" ? "#fdf8f1" : "#fff",
        }}>
          <input
            type="radio" name="email-freq" value="updates"
            checked={freq === "updates"} onChange={() => setFreq("updates")}
            style={{ marginTop: 2, accentColor: "#c98a42", flexShrink: 0 }}
          />
          <span>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#2c3227", lineHeight: 1.3 }}>
              Send results + scan updates
            </div>
            <div style={{ fontSize: "0.72rem", color: "#7a7462", lineHeight: 1.4 }}>
              We continuously improve our model. When we make a significant improvement, we'll re-run your scan and send you updated recommendations.
            </div>
          </span>
        </label>
      </div>
      <button
        disabled={status === "sending" || status === "sent" || !email.trim()}
        onClick={() => { if (status === "error") { setStatus("idle"); } else { handleSend(); } }}
        style={{
          width: "100%", padding: "12px", border: "none", borderRadius: 10,
          background: status === "sent" ? "#6b8f5e" : status === "error" ? "#c9424a" : "#c98a42",
          color: "#fff", fontSize: "0.9rem", fontWeight: 700,
          cursor: (status === "sent" || !email.trim()) ? "default" : "pointer",
          fontFamily: "inherit", opacity: (status === "sending" || !email.trim()) ? 0.6 : 1,
          transition: "background 0.3s, opacity 0.3s",
        }}
      >
        {status === "sending" ? "Saving..." : status === "sent" ? "Saved!" : status === "error" ? "Failed - try again" : "Send Results"}
      </button>
      {status === "sent" && (
        <div style={{ fontSize: "0.78rem", color: "#6b8f5e", textAlign: "center", marginTop: "0.4rem", fontWeight: 500 }}>
          Your email and preference have been saved. {freq === "updates" ? "We'll notify you when we improve your recommendations." : "You'll receive your results shortly."}
        </div>
      )}
      {status === "error" && (
        <div style={{ fontSize: "0.78rem", color: "#c9424a", textAlign: "center", marginTop: "0.4rem" }}>
          Something went wrong. Please try again.
        </div>
      )}
    </div>
  );
}

// ── Section navigation ───────────────────────────────────────
function SectionNav({ groups, onScrollTo }) {
  const navStyle = {
    display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center",
    maxWidth: 500, margin: "0 auto 1.2rem", padding: "0 4px",
  };
  const linkStyle = {
    padding: "6px 12px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 600,
    color: "#8a6930", background: "transparent", border: "1.5px solid #e8e2d6",
    cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap",
    transition: "background 0.15s, border-color 0.15s",
  };
  return (
    <div style={navStyle}>
      <a href="#interpretation-section" style={linkStyle}
        onClick={(e) => { e.preventDefault(); onScrollTo("interpretation"); }}>
        Your foot profile
      </a>
      {groups.map((g) => (
        <a key={g.cat} href={`#recs-${g.cat}`} style={linkStyle}
          onClick={(e) => { e.preventDefault(); onScrollTo(g.cat); }}>
          {g.label}
        </a>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function ScanResult({ shoes }) {
  const { scanId } = useParams();
  const mobile = useIsMobile();
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const interpretationRef = useRef(null);
  const recSectionRefs = useRef({});

  usePageMeta(
    scan ? "Your Foot Profile" : "Scan Results",
    "AI-powered foot scan analysis for climbing shoe fitting"
  );

  // Single source of truth: foot_scan_fits table
  useEffect(() => {
    if (!scanId) return;
    setLoading(true);
    setError(null);
    supabaseFetch(`/rest/v1/foot_scan_fits?scan_id=eq.${scanId}&select=*`)
      .then((rows) => {
        if (!rows.length) { setError("Scan not found"); setLoading(false); return; }
        setScan(rows[0]);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [scanId]);

  // ── Build recommendations from shoe database ──────────────
  // Match shoes based on scan profile
  const rawRecommendations = buildRecommendations(scan, shoes);

  // ── Fetch live prices for recommended shoes ──────────────
  const [livePrices, setLivePrices] = useState({});
  useEffect(() => {
    if (!rawRecommendations.length) return;
    const requests = rawRecommendations
      .filter((r) => r.slug && r.recommended_size_eu)
      .map((r) => ({ slug: r.slug, size: Number(r.recommended_size_eu) }));
    if (!requests.length) return;
    supabaseRpc("get_best_prices", { shoe_requests: requests })
      .then((rows) => {
        const map = {};
        for (const row of rows) {
          map[row.product_slug] = {
            price_eur: row.price_eur,
            retailer: row.retailer,
            product_url: row.product_url,
          };
        }
        setLivePrices(map);
      })
      .catch((e) => console.warn("Price fetch failed:", e));
  }, [scan]); // re-fetch when scan data changes

  // Merge live prices into recommendations
  const recommendations = rawRecommendations.map((r) => {
    const offer = livePrices[r.slug];
    return offer ? { ...r, best_offer: offer } : r;
  });

  // ── Loading / Error states ────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 8 }}>Loading scan results...</div>
        <div style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>Scan not found</div>
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 20 }}>
          We couldn't find scan results for "{scanId}". The link may be expired or incorrect.
        </div>
        <a href="/scan" style={{ color: T.accent, fontWeight: 600, textDecoration: "none" }}>Try a new scan</a>
      </div>
    </div>
  );

  const s = scan; // shorthand
  const toeShape = s.toe_shape || "egyptian";
  const toeDesc = TOE_DESCRIPTIONS[toeShape] || TOE_DESCRIPTIONS.egyptian;

  // Overlay image URLs - predictable paths in Supabase Storage
  const storageBase = `${SUPABASE_URL}/storage/v1/object/public/foot-scans/scans`;
  const cacheBust = s.updated_at ? `?t=${new Date(s.updated_at).getTime()}` : "";
  const soleOverlay = s.toe_shape ? `${storageBase}/${scanId}-sole_overlay.png${cacheBust}` : null;
  const sideOverlay = (s.instep_height_ratio != null || s.heel_depth_ratio != null) ? `${storageBase}/${scanId}-side_overlay.png${cacheBust}` : null;

  // Fit data from same row
  const fitShoes = s.shoes || [];
  const fitSummary = fitShoes.length > 0 ? fitShoes[0] : null;

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: mobile ? "1rem 0.75rem" : "2rem 1.5rem", fontFamily: T.font }}>

      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: "1.2rem" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: T.accent, marginBottom: 6 }}>
          climbing-gear.com
        </div>
        <h1 style={{ fontSize: mobile ? 22 : 28, fontWeight: 800, color: T.text, letterSpacing: -0.5, margin: 0 }}>
          Your Foot Profile
        </h1>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
          Scan analysis - sole &amp; side view
        </div>
      </div>

      {/* ── Email capture ── */}
      <EmailCapture scanId={scanId} />

      {/* ── Section navigation ── */}
      {recommendations.length > 0 && (() => {
        const CATEGORY_LABELS = {
          baseline: "Your Best Match", softer: "Softer Feel", stiffer: "Stiffer Feel", budget: "Best Value",
        };
        const navGroups = ["baseline", "softer", "stiffer", "budget"]
          .map((cat) => ({ cat, label: CATEGORY_LABELS[cat], shoes: recommendations.filter((r) => r.category === cat) }))
          .filter((g) => g.shoes.length > 0);
        return (
          <SectionNav
            groups={navGroups}
            onScrollTo={(target) => {
              if (target === "interpretation" && interpretationRef.current) {
                interpretationRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
              } else if (recSectionRefs.current[target]) {
                recSectionRefs.current[target].scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
          />
        );
      })()}

      {/* ── Views Row: Sole + Side ── */}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>

        {/* Sole View Card */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}><div style={labelStyle}>Sole Scan Results</div></div>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr" }}>
            <div style={{ ...imgPanelStyle, borderRight: mobile ? "none" : "1px solid #eee8dc", borderBottom: mobile ? "1px solid #eee8dc" : "none" }}>
              {soleOverlay ? (
                <img src={soleOverlay} alt="sole view overlay" style={overlayImgStyle} />
              ) : (
                <div style={{ padding: 40, color: T.muted, fontSize: 13 }}>Sole overlay not available</div>
              )}
            </div>
            <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", justifyContent: "center" }}>
              {/* Toe shape card */}
              <div style={{
                display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.75rem",
                background: T.accentSoft, borderRadius: 10, border: "1px solid #eee8dc", marginBottom: "0.25rem",
              }}>
                <img src={`/images/foot-${toeShape}.png`} alt={toeShape} style={{ width: 56, height: "auto", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 2, textTransform: "capitalize" }}>{toeShape}</div>
                  <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>{toeDesc}</div>
                </div>
              </div>
              <MetricBar ratioKey="forefoot_width_ratio" value={s.forefoot_width_ratio} />
              <MetricBar ratioKey="arch_length_ratio" value={s.arch_length_ratio} />
              <MetricBar ratioKey="heel_width_ratio" value={s.heel_width_ratio} />
            </div>
          </div>
        </div>

        {/* Side View Card */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}><div style={labelStyle}>Side Scan Results</div></div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#faf8f4", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #eee8dc" }}>
              {sideOverlay ? (
                <img src={sideOverlay} alt="side view overlay" style={{ maxWidth: "90%", height: "auto", borderRadius: 8 }} />
              ) : (
                <div style={{ padding: 40, color: T.muted, fontSize: 13 }}>Side overlay not available</div>
              )}
            </div>
            <div style={{ padding: "0.75rem 1.25rem", display: "flex", flexWrap: "wrap", gap: "0.65rem 2rem", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                {s.instep_height_ratio != null
                  ? <MetricBar ratioKey="instep_height_ratio" value={s.instep_height_ratio} />
                  : <div style={{ fontSize: "0.78rem", color: T.muted, padding: "0.25rem 0" }}>
                      <span style={{ fontWeight: 600, color: T.text }}>Instep Height</span>
                      <span style={{ marginLeft: 8, fontStyle: "italic" }}>excluded — side photo quality too low</span>
                    </div>
                }
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <MetricBar ratioKey="heel_depth_ratio" value={s.heel_depth_ratio} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Interpretation ── */}
      {s.interpretation && (
        <div ref={interpretationRef} id="interpretation-section" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontFamily: T.display, fontSize: "1.3rem", color: T.text, margin: "0 0 1rem" }}>What This Means</h2>
          {Array.isArray(s.interpretation)
            ? s.interpretation.map((block, i) => {
                const isFootShape = block.title && block.title.toLowerCase().includes("foot shape");
                const showHalluxGraphic = isFootShape
                  && s.hallux_valgus_class && s.hallux_valgus_class !== "normal";
                return (
                  <div key={i} style={{ marginBottom: "1.2rem" }}>
                    <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#8a6930", margin: "0 0 0.3rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {block.title}
                    </h3>
                    {block.paragraphs.map((p, j) => (
                      <p key={j} style={{ fontSize: "0.82rem", color: "#4a4538", lineHeight: 1.55, margin: j > 0 ? "0.4rem 0 0" : 0 }}>{p}</p>
                    ))}
                    {showHalluxGraphic && (
                      <img
                        src={`${SUPABASE_URL}/storage/v1/object/public/foot-scans/assets/hallux-valgus-toebox.jpg`}
                        alt="Toe box fit with hallux valgus: too pointed, perfect, and too centered"
                        style={{ width: "100%", maxWidth: 600, borderRadius: 10, margin: "0.8rem 0" }}
                      />
                    )}
                  </div>
                );
              })
            : (
                <div>
                  {s.interpretation.summary && (
                    <p style={{ fontSize: "0.82rem", color: "#4a4538", lineHeight: 1.55, margin: "0 0 1rem" }}>{s.interpretation.summary}</p>
                  )}
                  {s.interpretation.fit_diagnosis && (
                    <p style={{ fontSize: "0.82rem", color: "#4a4538", lineHeight: 1.55, margin: 0 }}>{s.interpretation.fit_diagnosis}</p>
                  )}
                </div>
              )
          }
        </div>
      )}

      {/* ── Shoe Recommendations ── */}
      {recommendations.length > 0 && (() => {
        // Group recommendations by category (new format) or show flat list (legacy)
        const CATEGORY_META = {
          baseline: { label: "Your Best Match", desc: "Similar feel to your current shoes" },
          softer: { label: "Softer Feel", desc: "More sensitivity and smearing" },
          stiffer: { label: "Stiffer Feel", desc: "More support and edging power" },
          budget: { label: "Best Value", desc: "Affordable picks that address your fit" },
        };
        const hasCats = recommendations.some((r) => r.category);
        const groups = hasCats
          ? ["baseline", "softer", "stiffer", "budget"].map((cat) => ({
              cat,
              ...CATEGORY_META[cat],
              shoes: recommendations.filter((r) => r.category === cat),
            })).filter((g) => g.shoes.length > 0)
          : [{ cat: "all", label: "Recommended Shoes", desc: "", shoes: recommendations }];

        return (
          <div style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontFamily: T.display, fontSize: "1.3rem", color: T.text, margin: "0 0 1rem" }}>Recommended Shoes</h2>
            {groups.map((g) => (
              <div key={g.cat} id={`recs-${g.cat}`} ref={(el) => { recSectionRefs.current[g.cat] = el; }} style={{ marginBottom: "1.5rem" }}>
                {hasCats && (
                  <div style={{ margin: "0 0 0.6rem" }}>
                    <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#8a6930", margin: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>{g.label}</h3>
                    {g.desc && <p style={{ fontSize: "0.72rem", color: T.muted, margin: "0.15rem 0 0" }}>{g.desc}</p>}
                  </div>
                )}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: "1rem",
                }}>
                  {g.shoes.map((r) => {
                    const brand = r.brand || slugToBrand(r.slug);
                    const model = r.model || slugToModel(r.slug);
                    const why = r.why || r.why_fit || r.reason || "";
                    return (
                      <ShoeCard
                        key={r.slug}
                        slug={r.slug}
                        brand={brand}
                        model={model}
                        description={r.description || ""}
                        why={why}
                        tradeoffs={r.tradeoffs || ""}
                        imageUrl={r.image_url}
                        recommendedSize={r.recommended_size_eu}
                        sizeNote={r.size_note}
                        bestOffer={r.best_offer}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── CTAs ── */}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: "1.25rem", marginTop: "1.5rem" }}>
        <div style={ctaCardStyle}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: T.text, margin: 0 }}>Browse the Database</h3>
          <p style={{ fontSize: "0.8rem", color: "#5a5344", lineHeight: 1.5, margin: 0 }}>
            Check out our full database of 350+ climbing shoes with detailed specs, fit profiles and price comparison.
          </p>
          <Link to="/shoes" style={{ ...ctaBtnStyle, background: T.accent, color: "#fff" }}>Browse Shoes</Link>
        </div>
        <div style={ctaCardStyle}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: T.text, margin: 0 }}>Was this scan helpful?</h3>
          <p style={{ fontSize: "0.8rem", color: "#5a5344", lineHeight: 1.5, margin: 0 }}>
            We're building this tool to help climbers find their perfect shoe. Your feedback helps us improve.
          </p>
          <Link to="/about#suggestion-hub" style={{ ...ctaBtnStyle, background: "transparent", color: T.accent, border: `1.5px solid ${T.accent}` }}>Give Feedback</Link>
        </div>
      </div>

    </div>
  );
}

// ── Slug helpers (fallback for recs without brand/model) ─────
function slugToBrand(slug) {
  if (!slug) return "";
  const parts = slug.split("-");
  // Common two-word brands
  const twoPart = ["la-sportiva", "five-ten", "mad-rock", "black-diamond", "red-chili", "climb-x", "wild-climb", "so-ill"];
  const prefix2 = parts.slice(0, 2).join("-");
  if (twoPart.includes(prefix2)) return parts.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}
function slugToModel(slug) {
  if (!slug) return "";
  const parts = slug.split("-");
  const twoPart = ["la-sportiva", "five-ten", "mad-rock", "black-diamond", "red-chili", "climb-x", "wild-climb", "so-ill"];
  const prefix2 = parts.slice(0, 2).join("-");
  const modelParts = twoPart.includes(prefix2) ? parts.slice(2) : parts.slice(1);
  return modelParts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Style constants ──────────────────────────────────────────
const cardStyle = {
  background: T.card, borderRadius: 16, border: `1px solid ${T.border}`,
  overflow: "hidden", boxShadow: "0 2px 16px rgba(44,50,39,0.05)",
};
const cardHeaderStyle = {
  padding: "0.7rem 1.5rem 0.5rem", borderBottom: "1px solid #eee8dc",
};
const labelStyle = {
  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: 1.5, color: T.accent,
};
const imgPanelStyle = {
  background: "#faf8f4", padding: "0.75rem", display: "flex",
  alignItems: "center", justifyContent: "center",
};
const overlayImgStyle = {
  width: "100%", maxWidth: 340, height: "auto", objectFit: "contain", borderRadius: 8,
};
const ctaCardStyle = {
  background: T.card, borderRadius: 16, border: `1px solid ${T.border}`,
  overflow: "hidden", boxShadow: "0 2px 16px rgba(44,50,39,0.05)",
  padding: "1.5rem", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.6rem",
};
const ctaBtnStyle = {
  display: "inline-block", padding: "0.5rem 1.25rem", borderRadius: 8,
  fontSize: "0.8rem", fontWeight: 700, textDecoration: "none",
};

// ── Build shoe recommendations from scan data + shoe DB ──────
function buildRecommendations(scan, shoes) {
  if (!scan || !shoes || !shoes.length) return [];

  // If scan has pre-computed recommendations stored in DB, use those.
  // Ensure every rec has a slug — look it up from the shoe DB first,
  // fall back to generating one from brand+model.
  if (scan.recommendations && Array.isArray(scan.recommendations)) {
    return scan.recommendations.map((r) => {
      if (r.slug) {
        const shoe = shoes.find((s) => s.slug === r.slug);
        return shoe ? { ...r, brand: shoe.brand, model: shoe.model, image_url: shoe.image_url } : r;
      }
      // Try to find the shoe in the DB by brand+model match
      const match = shoes.find(
        (s) =>
          s.brand?.toLowerCase() === r.brand?.toLowerCase() &&
          s.model?.toLowerCase() === r.model?.toLowerCase()
      );
      const slug = match
        ? match.slug
        : `${r.brand || ""} ${r.model || ""}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
      return { ...r, slug };
    });
  }

  // Otherwise, score shoes dynamically based on scan profile
  const widthClass = scan.forefoot_width_class || "medium";
  const heelClass = scan.heel_width_class || "medium";
  const instepClass = scan.volume_class || "medium";
  const toeShape = scan.toe_shape || "egyptian";

  const scored = shoes
    .filter((s) => s.closure !== "slipper" && s.downturn && s.downturn !== "flat")
    .map((shoe) => {
      let score = 0;

      // Width match
      if (widthClass === "narrow" && shoe.width === "narrow") score += 3;
      else if (widthClass === "narrow" && shoe.width === "medium") score += 1;
      else if (widthClass === shoe.width) score += 3;

      // Volume match
      if (instepClass === "high") {
        if (shoe.forefoot_volume === "standard" || shoe.forefoot_volume === "medium") score += 2;
        if (shoe.forefoot_volume === "high") score += 1;
        if (shoe.forefoot_volume === "low") score -= 2;
      }

      // Heel match
      if (heelClass === "wide") {
        if (shoe.heel_volume === "medium") score += 2;
        if (shoe.heel_volume === "wide" || shoe.heel_volume === "high") score += 1;
        if (shoe.heel_volume === "narrow" || shoe.heel_volume === "low") score += 0;
      }

      // Toe shape compatibility
      if (toeShape === "egyptian") {
        if (shoe.toe_form === "egyptian") score += 2;
        if (shoe.asymmetry === "strong") score -= 1;
      } else if (toeShape === "greek") {
        if (shoe.toe_form === "greek") score += 2;
      }

      // Prefer adjustable closures for high volume
      if (instepClass === "high") {
        if (shoe.closure === "lace") score += 1;
        if (shoe.closure === "velcro") score += 1;
      }

      // Aggressive shoes (user seems to want performance)
      if (shoe.downturn === "aggressive") score += 1;
      if (shoe.downturn === "moderate") score += 0.5;

      return { ...shoe, _score: score };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  return scored.map((shoe) => ({
    slug: shoe.slug,
    brand: shoe.brand,
    model: shoe.model,
    why: generateShoeWhy(shoe, scan),
  }));
}

function generateShoeWhy(shoe, scan) {
  const parts = [];
  if (shoe.width) parts.push(`${shoe.width} width`);
  if (shoe.forefoot_volume) parts.push(`${shoe.forefoot_volume} forefoot volume`);
  if (shoe.heel_volume) parts.push(`${shoe.heel_volume} heel volume`);
  if (shoe.closure) parts.push(`${shoe.closure} closure`);
  if (shoe.downturn) parts.push(`${shoe.downturn} downturn`);
  return parts.join(", ") + ".";
}
