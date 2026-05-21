import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { T } from "./tokens.js";
import { supabaseFetch, supabaseRpc, SUPABASE_URL } from "./supabase.js";
import useIsMobile from "./useIsMobile.js";
import usePageMeta from "./usePageMeta.js";
import { SHOE_DB, BRANDS, modelsFor, SHOE_SIZES_EU, STREET_SIZES_EU, formatSize } from "./shoeDb.js";

// Writes used to call Supabase REST directly with the service-role key
// embedded in this bundle. They now POST to /api/scan, which holds the
// service-role key server-side. Reads still go through anon-key
// supabaseFetch (allowed by RLS on the public foot_scan_fits view).
async function apiScanPost(op, payload) {
  const r = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, ...(payload || {}) }),
  });
  if (!r.ok) throw new Error(`api/scan ${op} ${r.status}`);
  return r.json().catch(() => ({}));
}

// ══════════════════════════════════════════════════════════════
// Population reference (tertile-calibrated, 2026-04-14)
// Must stay in sync with scanner/foot_measure.py POP.
// lo/hi are explicit tertile boundaries (33rd/67th percentile on
// the current ~200-scan dataset) so narrow/normal/wide each cover
// ~1/3 of the population. The slider renders these three bands as
// three equal-width visual sections.
// ══════════════════════════════════════════════════════════════
// V2 5-tier population reference (very low / low / mid / high / very high).
// Thresholds mirror interp_foot_shape_v2.POP_5TIER - the single source of
// truth shared with the worker, so the slider and the section-1 prose
// always agree on a measurement's tier.
const POP = {
  forefoot_width_ratio:  { mean: 0.354, std: 0.029, vl_lo: 0.331, lo: 0.343, hi: 0.367, vh_hi: 0.384 },
  arch_length_ratio:     { mean: 0.725, std: 0.024, vl_lo: 0.700, lo: 0.714, hi: 0.735, vh_hi: 0.747 },
  heel_width_ratio:      { mean: 0.236, std: 0.021, vl_lo: 0.218, lo: 0.228, hi: 0.245, vh_hi: 0.255 },
  instep_height_ratio:   { mean: 0.263, std: 0.102, vl_lo: 0.241, lo: 0.255, hi: 0.273, vh_hi: 0.294 },
  heel_depth_ratio:      { mean: 0.036, std: 0.030, vl_lo: 0.022, lo: 0.029, hi: 0.043, vh_hi: 0.053 },
};

// HVA (hallux valgus) renders on its own 3-section slider. mild_lo matches
// the foot_measure.py classifier (raised 0.25 -> 0.28 at V2 go-live).
const HVA_BOUNDS = { mild_lo: 0.28, pronounced_lo: 0.35 };
const ACCENT_DARK = "#8a5d20";

// Shared geometry for the page's action buttons (Share, Edit, Retake,
// "Check details and availability", "See more" links). The warm-accent
// fill, hover lift/darken, disabled dimming and leading-icon nudge all
// come from the .scan-btn / .scan-btn-ext CSS classes in GLOBAL_CSS, so
// :hover works without per-button JS handlers. Each call site spreads
// this and adds its own padding / radius / font-size / shadow.
const ACTION_BTN = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  fontFamily: T.font, fontWeight: 700, border: "none",
  textDecoration: "none", lineHeight: 1.2, whiteSpace: "nowrap",
};

// ── Leading button icons (line art, inherit currentColor) ──────
function IconExternal({ size = 15 }) {
  return (
    <svg className="scan-btn-ext" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
    </svg>
  );
}
function IconShareGlyph({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </svg>
  );
}
function IconPencil({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconCamera({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

// Labels only. Visual min/max are derived below as mean ± 3σ from POP,
// so the outer band edges track real population spread instead of hand-
// picked cutoffs. Keeps the slider in sync with the single source of truth.
const META = {
  forefoot_width_ratio:  { label: "Forefoot Width" },
  arch_length_ratio:     { label: "Arch Length"    },
  heel_width_ratio:      { label: "Heel Width"     },
  instep_height_ratio:   { label: "Instep Height"  },
  heel_depth_ratio:      { label: "Heel Depth"     },
};

// Number of population standard deviations used for the slider's outer
// visual bounds. 3σ ≈ 99.7% of a normal population; measurements outside
// this just clamp to the ends, which is the correct visual signal for
// "genuinely extreme".
const VISUAL_SIGMA = 3;

// Pipeline stages during which the page should keep polling for updates.
// Everything else (complete, error, validation_failed, waiting_preferences)
// is terminal from the results-page perspective.
const IN_PROGRESS_STAGES = new Set([
  "pending", "segmenting", "finding_shoes", "rescore", "rescoring",
]);

const TOE_DESCRIPTIONS = {
  egyptian: "Big toe is the longest, toes descend in a smooth slope.",
  greek:    "Second toe is the longest, extends past the big toe.",
  roman:    "First two toes are nearly equal in length.",
};

// ── Helpers ──────────────────────────────────────────────────

// The visual track is split into five bands. The mid band is double-width
// (33%) because ~1/3 of the population lands there; the four off-mid bands
// are 16.67% each. BAND_STARTS are the cumulative left offsets.
const BAND_WIDTHS = [16.667, 16.667, 33.333, 16.667, 16.667];
const BAND_STARTS = [0, 16.667, 33.333, 66.667, 83.333];

// Map a measured value to a pointer position (0-100%) across the 5-section
// track. Each section maps its value range 1:1 onto its band width.
function sectionPct5(val, vmin, vlLo, lo, hi, vhHi, vmax) {
  const bounds = [vmin, vlLo, lo, hi, vhHi, vmax];
  for (let i = 0; i < 5; i++) {
    const b0 = bounds[i], b1 = bounds[i + 1];
    if (val <= b1) {
      const span = b1 - b0;
      const t = span > 0 ? Math.max(0, Math.min(1, (val - b0) / span)) : 0.5;
      return BAND_STARTS[i] + t * BAND_WIDTHS[i];
    }
  }
  return 100;
}

function levelLabel5(val, vlLo, lo, hi, vhHi) {
  if (val < vlLo) return "very low";
  if (val < lo)   return "low";
  if (val < hi)   return "mid";
  if (val < vhHi) return "high";
  return "very high";
}

function levelColor5(lbl) {
  if (lbl === "very low" || lbl === "very high") return ACCENT_DARK;
  if (lbl === "low" || lbl === "high") return T.accent;
  return T.green || "#6a8a4f";
}

// ── Metric bar component ─────────────────────────────────────
// Five sections (very low | low | mid | high | very high). The mid
// section is double-width. Pointer shows where the user sits.
function MetricBar({ ratioKey, value }) {
  const p = POP[ratioKey];
  const m = META[ratioKey];
  if (!p || !m || value == null) return null;

  // Derive visual bounds from real population spread (mean ± 3σ),
  // floored at 0 for ratios where negative is nonsensical.
  const vmin = Math.max(0, p.mean - VISUAL_SIGMA * p.std);
  const vmax = p.mean + VISUAL_SIGMA * p.std;
  const pos = sectionPct5(value, vmin, p.vl_lo, p.lo, p.hi, p.vh_hi, vmax);
  const lbl = levelLabel5(value, p.vl_lo, p.lo, p.hi, p.vh_hi);
  const col = levelColor5(lbl);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: T.text }}>{m.label}</span>
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: col }}>{lbl}</span>
      </div>

      {/* Five bands: extremes amber-strong, off-mid amber-soft, mid green */}
      <div style={{ height: 8, borderRadius: 4, position: "relative", overflow: "visible" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: "16.667%", background: "#e8c79b" }} />
          <div style={{ width: "16.667%", background: "#efdbc1" }} />
          <div style={{ width: "33.333%", background: "#cad7c4", borderLeft: "1px solid #b9c8b1", borderRight: "1px solid #b9c8b1" }} />
          <div style={{ width: "16.667%", background: "#efdbc1" }} />
          <div style={{ width: "16.667%", background: "#e8c79b" }} />
        </div>
        {/* Pointer */}
        <div
          title={value.toFixed(3)}
          style={{
            position: "absolute", top: -3, left: `${pos}%`,
            transform: "translateX(-50%)",
            width: 4, height: 14, background: col,
            borderRadius: 2,
            boxShadow: "0 0 0 1.5px #fff",
            transition: "left 1.2s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>

      {/* Section labels */}
      <div style={{ display: "flex", fontSize: "0.55rem", color: "#a8a08e", textTransform: "lowercase" }}>
        <span style={{ flex: 1, textAlign: "left" }}>very low</span>
        <span style={{ flex: 1, textAlign: "center" }}>low</span>
        <span style={{ flex: 1, textAlign: "center" }}>mid</span>
        <span style={{ flex: 1, textAlign: "center" }}>high</span>
        <span style={{ flex: 1, textAlign: "right" }}>very high</span>
      </div>
    </div>
  );
}

// ── HVA "Big Toe Inward Drift" bar ───────────────────────────
// Three sections (none | mild | pronounced). Hallux valgus is a
// sole-view measurement; the slider lives with the sole metrics.
function HvaBar({ value }) {
  if (value == null) return null;
  const { mild_lo, pronounced_lo } = HVA_BOUNDS;
  const bounds = [0, mild_lo, pronounced_lo, 0.50];
  let pos = 100;
  for (let i = 0; i < 3; i++) {
    const b0 = bounds[i], b1 = bounds[i + 1];
    if (value <= b1) {
      const span = b1 - b0;
      const t = span > 0 ? Math.max(0, Math.min(1, (value - b0) / span)) : 0.5;
      pos = i * 33.333 + t * 33.333;
      break;
    }
  }
  let lbl, col;
  if (value < mild_lo) { lbl = "none"; col = T.green || "#6a8a4f"; }
  else if (value < pronounced_lo) { lbl = "mild"; col = T.accent; }
  else { lbl = "pronounced"; col = ACCENT_DARK; }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: T.text }}>Big Toe Inward Drift</span>
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: col }}>{lbl}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, position: "relative", overflow: "visible" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ flex: 1, background: "#cad7c4" }} />
          <div style={{ flex: 1, background: "#efdbc1", borderLeft: "1px solid #d8c4a4", borderRight: "1px solid #d8c4a4" }} />
          <div style={{ flex: 1, background: "#e8c79b" }} />
        </div>
        <div
          title={value.toFixed(3)}
          style={{
            position: "absolute", top: -3, left: `${pos}%`,
            transform: "translateX(-50%)",
            width: 4, height: 14, background: col,
            borderRadius: 2,
            boxShadow: "0 0 0 1.5px #fff",
            transition: "left 1.2s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>
      <div style={{ display: "flex", fontSize: "0.58rem", color: "#a8a08e", textTransform: "lowercase" }}>
        <span style={{ flex: 1, textAlign: "left" }}>none</span>
        <span style={{ flex: 1, textAlign: "center" }}>mild</span>
        <span style={{ flex: 1, textAlign: "right" }}>pronounced</span>
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
          <div className="scan-btn" style={{
            ...ACTION_BTN,
            display: "flex", width: "100%", marginTop: "0.6rem",
            padding: "0.8rem 1rem", borderRadius: 11, fontSize: "0.92rem",
            boxShadow: "0 5px 16px rgba(201,138,66,0.34)",
          }}>
            <IconExternal size={16} />
            Check details and availability
          </div>
        </div>
      </Link>
    </div>
  );
}

// ── Share results card ───────────────────────────────────────
// Tries the native Web Share sheet first (mobile / supporting browsers),
// falls back to a clipboard copy with inline confirmation. We never
// silently mix the two: if the user picks "Copy link" inside the share
// sheet we don't also overwrite their clipboard from here.
function ShareCard({ scanId }) {
  const [status, setStatus] = useState("idle"); // idle | copied | error

  async function handleShare() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/scan/${encodeURIComponent(scanId)}`;
    const shareData = {
      title: "My Climbing Shoe Scan Results",
      text: "My foot scan and shoe recommendations from climbing-gear.com",
      url,
    };
    // Prefer the native share sheet when available.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        // User cancelled: leave the UI alone, no clipboard fallback.
        if (e && e.name === "AbortError") return;
        // Any other share failure: fall through to clipboard copy.
      }
    }
    // Fallback: copy to clipboard.
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Legacy fallback for very old browsers.
        const ta = document.createElement("textarea");
        ta.value = url; ta.setAttribute("readonly", "");
        ta.style.position = "absolute"; ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select(); document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2200);
    } catch (e) {
      console.error("Share/copy failed:", e);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2200);
    }
  }

  const label =
    status === "copied" ? "Link copied to clipboard" :
    status === "error"  ? "Couldn't copy, try again" :
    "Share your results";

  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #e8e2d6",
      padding: "0.7rem 1rem", marginBottom: "1rem",
      boxShadow: "0 2px 16px rgba(44,50,39,0.05)",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
        <span aria-hidden="true" style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "#fdf3e3", color: "#c98a42",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {/* simple share glyph */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.2"
               strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5"  r="3" />
            <circle cx="6"  cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            <line x1="15.4" y1="6.5"  x2="8.6"  y2="10.5" />
          </svg>
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: T.text, lineHeight: 1.3 }}>
            {label}
          </div>
          <div style={{ fontSize: "0.72rem", color: T.muted, lineHeight: 1.4 }}>
            Send this scan to yourself or a friend.
          </div>
        </div>
      </div>
      <button
        onClick={handleShare}
        className={status === "copied" ? "scan-btn scan-btn-green" : "scan-btn"}
        style={{
          ...ACTION_BTN,
          flexShrink: 0,
          padding: "0.55rem 1.05rem", borderRadius: 999, fontSize: "0.82rem",
          boxShadow: status === "copied"
            ? "0 4px 12px rgba(61,122,82,0.3)"
            : "0 4px 12px rgba(201,138,66,0.32)",
        }}
      >
        <IconShareGlyph size={15} />
        {status === "copied" ? "Copied" : "Share results"}
      </button>
    </div>
  );
}

// ── Email capture card ───────────────────────────────────────
// Collapses to a compact confirmation row once the user has saved an
// email + frequency preference (either earlier in this session, or in
// a previous visit: savedEmail comes from the persisted scan row).
// "Edit" re-expands the form so the user can change either field.
function EmailCapture({ scanId, savedEmail, savedFreq }) {
  const hasSaved = Boolean(savedEmail);
  const [email, setEmail] = useState(savedEmail || "");
  const [freq, setFreq]   = useState(savedFreq  || "once");
  const [status, setStatus] = useState(hasSaved ? "sent" : "idle"); // idle | sending | sent | error
  const [expanded, setExpanded] = useState(!hasSaved);

  async function handleSend() {
    if (!email.trim() || !scanId) return;
    setStatus("sending");
    try {
      await apiScanPost("email", { scan_id: scanId, email: email.trim(), email_freq: freq });
      setStatus("sent");
      // Brief pause so the user sees the "Saved!" state before collapse.
      setTimeout(() => setExpanded(false), 900);
    } catch (e) {
      console.error("Email save failed:", e);
      setStatus("error");
    }
  }

  // Collapsed confirmation row, shown once an email has been saved.
  if (!expanded) {
    return (
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #e8e2d6",
        padding: "0.7rem 1rem", marginBottom: "1rem",
        boxShadow: "0 2px 16px rgba(44,50,39,0.05)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
          <span aria-hidden="true" style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "#eaf2e1", color: "#6b8f5e",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, fontWeight: 700, fontSize: 16, lineHeight: 1,
          }}>✓</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: T.text, lineHeight: 1.3 }}>
              Email saved
            </div>
            <div style={{
              fontSize: "0.72rem", color: T.muted, lineHeight: 1.4,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {email}{freq === "updates" ? " · with scan updates" : ""}
            </div>
          </div>
        </div>
        <button
          onClick={() => setExpanded(true)}
          style={{
            padding: "6px 12px", border: "1.5px solid #e8e2d6", borderRadius: 10,
            background: "#fff", color: "#8a6930", fontSize: "0.75rem", fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
          }}
        >
          Edit
        </button>
      </div>
    );
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
// User Inputs Panel
// ══════════════════════════════════════════════════════════════
// Read-only summary of what the user submitted (shoes, fit ratings,
// next-shoe preference, notes). Edit + Retake buttons are wired in
// a later step - for now the panel just shows the data so users can
// verify what the recommendations are based on.
const PREF_LABELS = {
  comfort:     "More comfort",
  same:        "Same balance",
  performance: "More performance",
  allround:    "Not specified",
};
const FIT_LABELS = { tight: "Tight", perfect: "Perfect", loose: "Loose" };

// ── Advanced preferences (override layer on the V2-derived targets) ──
const PREF_KEYS = ["stiffness", "downturn", "asymmetry", "closure", "ankle"];
const DOWNTURN_OPTS = ["flat", "slight", "moderate", "aggressive"];
const ASYM_OPTS = ["none", "slight", "moderate", "strong"];
const CLOSURE_OPTS = ["lace", "velcro", "slipper"];
const CLOSURE_LABELS = { lace: "Laces", velcro: "Velcro", slipper: "Slipper", any: "No preference" };

// Closure overrides are multi-select: 1-2 of lace/velcro/slipper. Normalize
// any stored shape (array, single string, legacy "any", null) to a clean
// array of valid closure values.
function closureArr(c) {
  const raw = Array.isArray(c) ? c : (c == null ? [] : [c]);
  return raw.filter((x) => x === "lace" || x === "velcro" || x === "slipper");
}
// Equality test for one preference axis. Closure compares order-independently
// as a set; every other axis is a plain scalar compare.
function prefEq(key, a, b) {
  if (key === "closure") {
    const x = closureArr(a), y = closureArr(b);
    return x.length === y.length && x.every((v) => y.includes(v));
  }
  return a === b;
}
function stiffnessWord(v) {
  if (v < 0.15) return "Super sensitive";
  if (v < 0.25) return "Very sensitive";
  if (v < 0.40) return "Sensitive";
  if (v < 0.60) return "Balanced";
  if (v < 0.75) return "Supportive";
  if (v < 0.86) return "Very supportive";
  return "Super supportive";
}

function FitBadge({ value }) {
  if (!value) return null;
  const palette = {
    tight:   { bg: "#f3e3d8", fg: "#8a4f20" },
    perfect: { bg: "#e3ede0", fg: "#4a6a3a" },
    loose:   { bg: "#f3e3d8", fg: "#8a4f20" },
  };
  const c = palette[value] || { bg: "#ece5d4", fg: "#6a5c42" };
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 10,
      background: c.bg, color: c.fg, fontSize: "0.68rem", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 0.3,
    }}>{FIT_LABELS[value] || value}</span>
  );
}

function UserInputsPanel({ scan, onEdit, disabled }) {
  if (!scan) return null;
  const shoes = Array.isArray(scan.shoes) ? scan.shoes : [];
  const pref = PREF_LABELS[scan.next_shoe_preference] || scan.next_shoe_preference || "Not specified";
  // V2 scans carry discipline/environment/rock/aggressiveness instead of a
  // single "next shoe" preference. Show that summary when present.
  const v2Summary = scan.discipline
    ? [scan.discipline, scan.environment, scan.rock_type, scan.aggressiveness]
        .filter(Boolean)
        .map((s) => String(s).replace(/_/g, " "))
        .join(" · ")
    : null;
  // When the user set explicit preference overrides, surface those in the
  // panel in place of the climbing-discipline summary.
  const ov = (scan.preference_overrides && typeof scan.preference_overrides === "object")
    ? scan.preference_overrides : null;
  const customPrefSummary = ov
    ? PREF_KEYS.filter((k) => ov[k] != null).map((k) => {
        if (k === "stiffness") return stiffnessWord(ov.stiffness).toLowerCase();
        if (k === "closure") {
          const cl = closureArr(ov.closure);
          return cl.length
            ? cl.map((c) => (CLOSURE_LABELS[c] || c).toLowerCase()).join(" / ")
            : "any closure";
        }
        if (k === "ankle") return ov.ankle ? "ankle protection" : "no ankle protection";
        return `${ov[k]} ${k}`;
      }).join(" · ")
    : null;
  const sex = scan.sex ? scan.sex.charAt(0).toUpperCase() + scan.sex.slice(1) : "Not specified";
  const size = scan.street_size_eu != null ? `EU ${scan.street_size_eu}` : "Not specified";

  const rowStyle = {
    display: "flex", alignItems: "baseline", gap: "0.5rem",
    padding: "0.4rem 0", borderBottom: "1px dashed #eee8dc",
    fontSize: "0.8rem",
  };
  const keyStyle = {
    flex: "0 0 120px", color: T.muted, fontWeight: 600,
    textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: 0.5,
  };

  return (
    <div style={{
      background: T.card, borderRadius: 12, border: `1px solid ${T.border}`,
      padding: "0.9rem 1.1rem", marginBottom: "1.1rem",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "0.5rem", gap: "0.75rem",
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: 1.5, color: T.accent,
        }}>Your inputs</div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            className="scan-btn"
            style={{
              ...ACTION_BTN,
              padding: "0.46rem 0.95rem", borderRadius: 999, fontSize: "0.78rem",
              boxShadow: "0 3px 10px rgba(201,138,66,0.28)",
            }}
          >
            <IconPencil size={14} />
            Edit inputs
          </button>
        )}
      </div>

      <div style={{ ...rowStyle, paddingTop: 0 }}>
        <span style={keyStyle}>Sex</span>
        <span style={{ color: T.text }}>{sex}</span>
      </div>
      <div style={rowStyle}>
        <span style={keyStyle}>Street size</span>
        <span style={{ color: T.text }}>{size}</span>
      </div>
      {customPrefSummary ? (
        <div style={rowStyle}>
          <span style={keyStyle}>Preferences</span>
          <span style={{ color: T.text, textTransform: "capitalize" }}>{customPrefSummary}</span>
        </div>
      ) : v2Summary ? (
        <div style={rowStyle}>
          <span style={keyStyle}>Climbing</span>
          <span style={{ color: T.text, textTransform: "capitalize" }}>{v2Summary}</span>
        </div>
      ) : (
        <div style={rowStyle}>
          <span style={keyStyle}>Next shoe</span>
          <span style={{ color: T.text }}>{pref}</span>
        </div>
      )}
      {scan.next_shoe_notes && (
        <div style={rowStyle}>
          <span style={keyStyle}>Notes</span>
          <span style={{ color: T.text, fontStyle: "italic" }}>"{scan.next_shoe_notes}"</span>
        </div>
      )}

      <div style={{ paddingTop: "0.6rem" }}>
        <div style={{ ...keyStyle, marginBottom: 6 }}>
          Current shoes {shoes.length > 0 ? `(${shoes.length})` : ""}
        </div>
        {shoes.length === 0 ? (
          <div style={{ fontSize: "0.78rem", color: T.muted, fontStyle: "italic" }}>
            None submitted
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {shoes.map((sh, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                flexWrap: "wrap", padding: "0.35rem 0.6rem",
                background: T.accentSoft || "#faf8f4",
                borderRadius: 8, fontSize: "0.78rem",
              }}>
                <span style={{ fontWeight: 700, color: T.text }}>
                  {[sh.brand, sh.model].filter(Boolean).join(" ") || "(unnamed)"}
                </span>
                {sh.size_eu && (
                  <span style={{ color: T.muted }}>EU {sh.size_eu}</span>
                )}
                {sh.fit && (
                  <span style={{ display: "inline-flex", gap: 4, marginLeft: "auto" }}>
                    {sh.fit.toes     && <><span style={{ fontSize: "0.68rem", color: T.muted }}>toes</span><FitBadge value={sh.fit.toes} /></>}
                    {sh.fit.forefoot && <><span style={{ fontSize: "0.68rem", color: T.muted }}>forefoot</span><FitBadge value={sh.fit.forefoot} /></>}
                    {sh.fit.heel     && <><span style={{ fontSize: "0.68rem", color: T.muted }}>heel</span><FitBadge value={sh.fit.heel} /></>}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Edit Inputs Modal
// ══════════════════════════════════════════════════════════════
// Unified editor for sex, street size, shoes, next-shoe preference, notes.
// Save PATCHes foot_scan_fits with the new values and sets pipeline_stage='rescore',
// which the scan_worker picks up within ~5s and regenerates recommendations in ~1s.
// The parent ScanResult is polling, so the refreshed data appears automatically.

const FIT_VALUES = ["tight", "perfect", "loose"];
const PREF_VALUES = ["comfort", "same", "performance"];

// Small retake trigger shown in each scan-card header.
// Disabled while a pipeline run is in flight so we never queue two
// concurrent uploads against the same scan row.
function RetakeLink({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Wait for current processing to finish" : "Retake this photo"}
      className="scan-btn"
      style={{
        ...ACTION_BTN,
        padding: "0.46rem 0.95rem", borderRadius: 999, fontSize: "0.74rem",
        boxShadow: "0 3px 10px rgba(201,138,66,0.28)",
      }}
    >
      <IconCamera size={14} />
      Retake photo
    </button>
  );
}

function SegmentedToggle({ value, options, labels, onChange, disabled, allowDeselect = true }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (active) {
                if (allowDeselect) onChange(null);
                // else no-op - keep the current selection
              } else {
                onChange(opt);
              }
            }}
            style={{
              flex: 1, padding: "0.35rem 0.5rem",
              fontSize: "0.72rem", fontWeight: 700,
              border: `1px solid ${active ? T.accent : T.border}`,
              background: active ? T.accent : "#fff",
              color: active ? "#fff" : T.text,
              borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
              textTransform: "capitalize",
            }}
          >
            {(labels && labels[opt]) || opt}
          </button>
        );
      })}
    </div>
  );
}

function EditInputsModal({ scan, scanId, onClose, onSaved }) {
  const [sex, setSex] = useState(scan?.sex || "");
  const [streetSize, setStreetSize] = useState(
    scan?.street_size_eu != null ? String(scan.street_size_eu) : ""
  );
  const [shoes, setShoes] = useState(() => {
    const src = Array.isArray(scan?.shoes) ? scan.shoes : [];
    // Deep-copy so edits don't mutate the parent scan object
    return src.map((sh) => ({
      brand: sh.brand || "",
      model: sh.model || "",
      size_eu: sh.size_eu != null ? String(sh.size_eu) : "",
      fit: {
        toes: sh.fit?.toes || null,
        forefoot: sh.fit?.forefoot || null,
        heel: sh.fit?.heel || null,
      },
    }));
  });
  const [notes, setNotes] = useState(scan?.next_shoe_notes || "");
  // V2 climbing preferences. Pre-filled for V2 scans; empty for older V1
  // scans, in which case validate() makes them required before rescoring.
  const [discipline, setDiscipline] = useState(scan?.discipline || "");
  const [environment, setEnvironment] = useState(scan?.environment || "");
  const [rockType, setRockType] = useState(scan?.rock_type || "");
  const [aggressiveness, setAggressiveness] = useState(scan?.aggressiveness || "");
  // Advanced preferences: the V2 questions derive default targets; the user
  // can override any directly. derivedPrefs is the auto baseline; prefs is
  // the current (possibly overridden) set. A control is "Customized" when
  // its value differs from the derived default.
  const derivedPrefs = scan?.derived_preferences || null;
  const [prefs, setPrefs] = useState(() => {
    const merged = { ...(derivedPrefs || {}), ...(scan?.preference_overrides || {}) };
    // closure is multi-select - always carry it as a normalized array
    merged.closure = closureArr(merged.closure);
    return merged;
  });
  // Toggle one closure chip. Capped at 2 (adding a third drops the oldest).
  // The "any" chip clears the selection ("No preference"); deselecting the
  // last real closure also lands on "No preference" (empty array).
  const toggleClosure = (c) => setPrefs((p) => {
    if (c === "any") return { ...p, closure: [] };
    const cur = closureArr(p.closure);
    if (cur.includes(c)) {
      return { ...p, closure: cur.filter((x) => x !== c) };
    }
    const next = cur.length >= 2 ? [cur[cur.length - 1], c] : [...cur, c];
    return { ...p, closure: next };
  });
  const [advancedOpen, setAdvancedOpen] = useState(
    !!(scan?.preference_overrides && Object.keys(scan.preference_overrides).length)
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const addShoe = () => setShoes((prev) => [
    ...prev,
    { brand: "", model: "", size_eu: "", fit: { toes: null, forefoot: null, heel: null } },
  ]);

  const removeShoe = (idx) => setShoes((prev) => prev.filter((_, i) => i !== idx));

  const updateShoe = (idx, patch) => setShoes((prev) =>
    prev.map((sh, i) => (i === idx ? { ...sh, ...patch } : sh))
  );
  const updateShoeFit = (idx, part, val) => setShoes((prev) =>
    prev.map((sh, i) => (i === idx ? { ...sh, fit: { ...sh.fit, [part]: val } } : sh))
  );

  // Returns list of human-readable error strings. Empty list = valid.
  // Rules: sex required; at least 1 climbing shoe; every shoe row that is
  // not entirely blank must have brand + model + size + all 3 fit ratings.
  const validate = () => {
    const errors = [];
    if (!sex) {
      errors.push("Please select a sex - the recommendation engine needs this to compute sizes.");
    }

    // V2 climbing preferences are all required (old V1 scans must supply
    // them here before they can be re-scored under the V2 pipeline).
    if (!discipline) errors.push("Please select your climbing discipline.");
    if (!environment) errors.push("Please select where you climb most.");
    if (environment === "outdoor" && !rockType) {
      errors.push("Please select your main rock type.");
    }
    if (!aggressiveness) errors.push("Please select your fit preference.");

    // A row "counts" if any field is set; completely empty rows are silently dropped.
    const activeRows = shoes
      .map((sh, idx) => ({ sh, idx, rowNum: idx + 1 }))
      .filter(({ sh }) =>
        sh.brand.trim() ||
        sh.model.trim() ||
        sh.size_eu.trim() ||
        sh.fit.toes ||
        sh.fit.forefoot ||
        sh.fit.heel
      );

    if (activeRows.length === 0) {
      errors.push("Please add at least one climbing shoe with brand, model, size, and fit ratings.");
    }

    activeRows.forEach(({ sh, rowNum }) => {
      if (!sh.brand.trim()) errors.push(`Shoe ${rowNum}: please select a brand.`);
      if (!sh.model.trim()) errors.push(`Shoe ${rowNum}: please select a model.`);
      if (!sh.size_eu.trim()) errors.push(`Shoe ${rowNum}: please select the EU size.`);
      if (!sh.fit.toes) errors.push(`Shoe ${rowNum}: please rate the toes fit.`);
      if (!sh.fit.forefoot) errors.push(`Shoe ${rowNum}: please rate the forefoot fit.`);
      if (!sh.fit.heel) errors.push(`Shoe ${rowNum}: please rate the heel fit.`);
    });

    return errors;
  };

  const handleSave = async () => {
    const errors = validate();
    if (errors.length) { setSaveError(errors); return; }
    setSaving(true);
    setSaveError(null);

    // validate() has already ensured every non-empty row is fully specified.
    // Drop entirely-blank rows, then serialise the rest with full fit objects.
    const cleanedShoes = shoes
      .filter((sh) =>
        sh.brand.trim() ||
        sh.model.trim() ||
        sh.size_eu.trim() ||
        sh.fit.toes ||
        sh.fit.forefoot ||
        sh.fit.heel
      )
      .map((sh) => ({
        brand: sh.brand.trim(),
        model: sh.model.trim(),
        size_eu: Number(sh.size_eu),
        fit: {
          toes: sh.fit.toes,
          forefoot: sh.fit.forefoot,
          heel: sh.fit.heel,
        },
      }));

    // /api/scan op:rescore validates the payload server-side then patches
    // foot_scan_fits with pipeline_stage='rescore' so the worker re-runs
    // matrix scoring against the new fit data. The pipeline_started_at
    // timestamp is reset server-side so ProcessingScreen counts from 0.
    // Build the sparse preference-override set: only axes the user moved
    // away from the question-derived default.
    const prefOverrides = {};
    if (derivedPrefs) {
      for (const k of PREF_KEYS) {
        if (!prefEq(k, prefs[k], derivedPrefs[k])) {
          prefOverrides[k] = k === "closure" ? closureArr(prefs[k]) : prefs[k];
        }
      }
    }
    const payload = {
      scan_id: scanId,
      sex,
      shoes: cleanedShoes,
      next_shoe_notes: notes.trim() || null,
      discipline: discipline || null,
      environment: environment || null,
      rock_type: environment === "outdoor" ? (rockType || null) : null,
      aggressiveness: aggressiveness || null,
      preference_overrides: Object.keys(prefOverrides).length ? prefOverrides : null,
    };
    if (streetSize.trim()) {
      const n = Number(streetSize);
      if (!Number.isNaN(n)) payload.street_size_eu = n;
    }

    try {
      await apiScanPost("rescore", payload);
      setSaving(false);
      if (onSaved) onSaved();
      onClose();
    } catch (e) {
      setSaving(false);
      setSaveError(e.message || "Save failed");
    }
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const labelStyle = {
    fontSize: "0.7rem", fontWeight: 700, color: T.muted,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
  };
  const inputStyle = {
    width: "100%", padding: "0.4rem 0.6rem", fontSize: "0.82rem",
    border: `1px solid ${T.border}`, borderRadius: 6,
    background: "#fff", color: T.text, fontFamily: T.font, boxSizing: "border-box",
  };

  const nCustomPrefs = derivedPrefs
    ? PREF_KEYS.filter((k) => !prefEq(k, prefs[k], derivedPrefs[k])).length : 0;

  // One advanced-preference row: label, Auto/Customized status, per-row
  // reset, and the control.
  const renderPrefRow = (key, label, control) => {
    const custom = derivedPrefs && !prefEq(key, prefs[key], derivedPrefs[key]);
    return (
      <div style={{ marginBottom: "0.7rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: T.text }}>{label}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{
              fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
              padding: "2px 7px", borderRadius: 999,
              background: custom ? "rgba(201,138,66,0.13)" : "rgba(61,122,82,0.13)",
              color: custom ? "#8a5d20" : (T.green || "#3d7a52"),
            }}>{custom ? "Customized" : "Auto"}</span>
            {custom && (
              <button type="button" disabled={saving}
                onClick={() => setPrefs((p) => ({
                  ...p,
                  [key]: key === "closure" ? closureArr(derivedPrefs[key]) : derivedPrefs[key],
                }))}
                style={{ fontSize: "0.68rem", fontWeight: 600, color: T.accent, background: "none",
                  border: "none", cursor: "pointer", fontFamily: T.font, padding: 0 }}>
                &#8634; auto
              </button>
            )}
          </span>
        </div>
        {control}
      </div>
    );
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(26,22,15,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "2rem 1rem", overflowY: "auto",
      }}
    >
      <div style={{
        background: T.card, borderRadius: 14, maxWidth: 560, width: "100%",
        padding: "1.2rem 1.25rem", boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        fontFamily: T.font,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: "0.8rem",
        }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: T.text }}>
            Edit your inputs
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              background: "transparent", border: "none",
              fontSize: "1.2rem", cursor: saving ? "not-allowed" : "pointer",
              color: T.muted, padding: 0, lineHeight: 1,
            }}
            aria-label="Close"
          >x</button>
        </div>

        <p style={{
          fontSize: "0.75rem", color: T.muted, lineHeight: 1.5,
          margin: "0 0 1rem",
        }}>
          Changes here re-run the scoring engine against the same foot scan.
          No new photos needed - this takes about 3 seconds.
        </p>

        {/* Sex */}
        <div style={{ marginBottom: "0.85rem" }}>
          <div style={labelStyle}>Sex *</div>
          <SegmentedToggle
            value={sex}
            options={["male", "female"]}
            onChange={(v) => setSex(v || "")}
            disabled={saving}
          />
        </div>

        {/* Street size */}
        <div style={{ marginBottom: "0.85rem" }}>
          <div style={labelStyle}>Street shoe size (EU)</div>
          <select
            value={streetSize}
            onChange={(e) => setStreetSize(e.target.value)}
            disabled={saving}
            style={{ ...inputStyle, maxWidth: 140 }}
          >
            <option value="">Size...</option>
            {/* preserve any legacy off-grid value */}
            {streetSize && !STREET_SIZES_EU.includes(Number(streetSize)) && (
              <option value={streetSize}>{streetSize}</option>
            )}
            {STREET_SIZES_EU.map((s) => (
              <option key={s} value={s}>{formatSize(s)}</option>
            ))}
          </select>
        </div>

        {/* V2 climbing preferences */}
        <div style={{ marginBottom: "0.85rem" }}>
          <div style={labelStyle}>Climbing discipline *</div>
          <select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
            disabled={saving}
            style={inputStyle}
          >
            <option value="">Select...</option>
            <option value="boulder">Bouldering</option>
            <option value="sport">Sport climbing</option>
            <option value="trad_multipitch">Trad / multipitch</option>
          </select>
        </div>
        <div style={{ marginBottom: "0.85rem" }}>
          <div style={labelStyle}>Where you climb most *</div>
          <select
            value={environment}
            onChange={(e) => {
              const v = e.target.value;
              setEnvironment(v);
              if (v !== "outdoor") setRockType("");
            }}
            disabled={saving}
            style={inputStyle}
          >
            <option value="">Select...</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
            <option value="both">Both</option>
          </select>
        </div>
        {environment === "outdoor" && (
          <div style={{ marginBottom: "0.85rem" }}>
            <div style={labelStyle}>Main rock type *</div>
            <select
              value={rockType}
              onChange={(e) => setRockType(e.target.value)}
              disabled={saving}
              style={inputStyle}
            >
              <option value="">Select...</option>
              <option value="granite">Granite</option>
              <option value="limestone">Limestone</option>
              <option value="sandstone">Sandstone</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
        )}
        <div style={{ marginBottom: "0.85rem" }}>
          <div style={labelStyle}>Fit preference *</div>
          <select
            value={aggressiveness}
            onChange={(e) => setAggressiveness(e.target.value)}
            disabled={saving}
            style={inputStyle}
          >
            <option value="">Select...</option>
            <option value="comfort">Comfort</option>
            <option value="balanced">Balanced</option>
            <option value="moderate">Moderate performance</option>
            <option value="aggressive">Aggressive performance</option>
          </select>
        </div>

        {/* Advanced preferences - override layer on the V2-derived targets */}
        {derivedPrefs && (
          <div style={{ marginBottom: "0.85rem" }}>
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              disabled={saving}
              style={{
                width: "100%", display: "flex", justifyContent: "space-between",
                alignItems: "center", background: "#faf8f4",
                border: `1px solid ${T.border}`,
                borderRadius: advancedOpen ? "8px 8px 0 0" : 8,
                padding: "0.5rem 0.7rem", cursor: "pointer", fontFamily: T.font,
              }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: T.text }}>
                Advanced preferences{nCustomPrefs > 0 ? ` (${nCustomPrefs} customized)` : " (optional)"}
              </span>
              <span style={{ fontSize: "1rem", color: T.muted }}>{advancedOpen ? "−" : "+"}</span>
            </button>
            {advancedOpen && (
              <div style={{
                border: `1px solid ${T.border}`, borderTop: "none",
                borderRadius: "0 0 8px 8px", padding: "0.85rem 0.7rem",
              }}>
                <div style={{ fontSize: "0.72rem", color: T.muted, lineHeight: 1.5, marginBottom: "0.85rem" }}>
                  Your answers set these automatically. Adjust any directly and we re-score against your choice.
                </div>

                {renderPrefRow("stiffness", "Stiffness",
                  <div>
                    <input
                      type="range" min="0" max="1" step="0.01" disabled={saving}
                      value={prefs.stiffness ?? 0.5}
                      onChange={(e) => setPrefs((p) => ({ ...p, stiffness: Number(e.target.value) }))}
                      style={{ width: "100%", accentColor: T.accent }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", color: "#a8a08e" }}>
                      <span>soft / sensitive</span><span>stiff / supportive</span>
                    </div>
                    <div style={{ fontSize: "0.76rem", fontWeight: 700, color: T.accent, marginTop: 2 }}>
                      {stiffnessWord(prefs.stiffness ?? 0.5)}
                    </div>
                  </div>
                )}

                {renderPrefRow("downturn", "Downturn",
                  <SegmentedToggle
                    value={prefs.downturn} options={DOWNTURN_OPTS}
                    labels={{ flat: "Flat", slight: "Slight", moderate: "Moderate", aggressive: "Aggressive" }}
                    onChange={(v) => v && setPrefs((p) => ({ ...p, downturn: v }))}
                    disabled={saving}
                  />
                )}

                {renderPrefRow("asymmetry", "Asymmetry",
                  <SegmentedToggle
                    value={prefs.asymmetry} options={ASYM_OPTS}
                    labels={{ none: "None", slight: "Slight", moderate: "Moderate", strong: "Strong" }}
                    onChange={(v) => v && setPrefs((p) => ({ ...p, asymmetry: v }))}
                    disabled={saving}
                  />
                )}

                {renderPrefRow("closure", "Closure",
                  <div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[...CLOSURE_OPTS, "any"].map((c) => {
                        const sel = closureArr(prefs.closure);
                        const active = c === "any" ? sel.length === 0 : sel.includes(c);
                        return (
                          <button
                            key={c} type="button" disabled={saving}
                            onClick={() => toggleClosure(c)}
                            style={{
                              flex: 1, padding: "0.35rem 0.3rem",
                              fontSize: "0.7rem", fontWeight: 700,
                              border: `1px solid ${active ? T.accent : T.border}`,
                              background: active ? T.accent : "#fff",
                              color: active ? "#fff" : T.text,
                              borderRadius: 6, cursor: saving ? "not-allowed" : "pointer",
                            }}
                          >
                            {CLOSURE_LABELS[c]}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: "0.62rem", color: "#a8a08e", marginTop: 4 }}>
                      Pick one or two closures, or No preference. With a closure set, recommendations only include shoes that match.
                    </div>
                  </div>
                )}

                {renderPrefRow("ankle", "Ankle protection",
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.78rem", color: "#5a5344", cursor: "pointer" }}>
                    <input
                      type="checkbox" checked={!!prefs.ankle} disabled={saving}
                      onChange={(e) => setPrefs((p) => ({ ...p, ankle: e.target.checked }))}
                      style={{ accentColor: T.accent, width: 16, height: 16 }}
                    />
                    {prefs.ankle ? "Prefer a protective higher cuff" : "Standard low-cut shoes"}
                  </label>
                )}

                {nCustomPrefs > 0 && (
                  <button
                    type="button" disabled={saving}
                    onClick={() => setPrefs({ ...derivedPrefs, closure: closureArr(derivedPrefs.closure) })}
                    style={{ fontSize: "0.72rem", fontWeight: 600, color: T.muted, background: "none",
                      border: "none", cursor: "pointer", fontFamily: T.font, textDecoration: "underline", padding: 0 }}
                  >
                    Reset all to auto
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Shoes editor */}
        <div style={{ marginBottom: "0.85rem" }}>
          <div style={labelStyle}>Current climbing shoes</div>
          {shoes.length === 0 && (
            <div style={{ fontSize: "0.78rem", color: T.muted, fontStyle: "italic", marginBottom: 6 }}>
              No shoes submitted. Add one below to get more precise recommendations.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {shoes.map((sh, idx) => (
              <div key={idx} style={{
                padding: "0.7rem 0.8rem", background: "#faf8f4",
                borderRadius: 8, border: `1px solid ${T.border}`,
              }}>
                {(() => {
                  const brandInDb = !!sh.brand && Object.prototype.hasOwnProperty.call(SHOE_DB, sh.brand);
                  const models = brandInDb ? modelsFor(sh.brand) : [];
                  const modelInDb = brandInDb && !!sh.model && models.includes(sh.model);
                  const sizeNum = sh.size_eu === "" ? null : Number(sh.size_eu);
                  const sizeInDb = sizeNum != null && !Number.isNaN(sizeNum) && SHOE_SIZES_EU.includes(sizeNum);
                  return (
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <select
                        value={sh.brand || ""}
                        onChange={(e) => {
                          // Changing brand clears model so a stale pair
                          // can't survive a switch.
                          updateShoe(idx, { brand: e.target.value, model: "" });
                        }}
                        disabled={saving}
                        style={{ ...inputStyle, flex: "1 1 140px", minWidth: 0 }}
                      >
                        <option value="">Brand...</option>
                        {sh.brand && !brandInDb && (
                          <option value={sh.brand}>{sh.brand} (legacy)</option>
                        )}
                        {BRANDS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                      <select
                        value={sh.model || ""}
                        onChange={(e) => updateShoe(idx, { model: e.target.value })}
                        disabled={saving || !brandInDb}
                        style={{ ...inputStyle, flex: "1 1 140px", minWidth: 0 }}
                      >
                        <option value="">Model...</option>
                        {sh.model && !modelInDb && (
                          <option value={sh.model}>{sh.model} (legacy)</option>
                        )}
                        {models.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={sh.size_eu || ""}
                        onChange={(e) => updateShoe(idx, { size_eu: e.target.value })}
                        disabled={saving}
                        style={{ ...inputStyle, flex: "0 0 100px", minWidth: 90 }}
                      >
                        <option value="">EU size...</option>
                        {sh.size_eu && !sizeInDb && (
                          <option value={sh.size_eu}>{sh.size_eu}</option>
                        )}
                        {SHOE_SIZES_EU.map((s) => (
                          <option key={s} value={s}>{formatSize(s)}</option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
                <div style={{
                  display: "flex", flexDirection: "column",
                  gap: 6, marginTop: 8,
                }}>
                  {["toes", "forefoot", "heel"].map((part) => (
                    <div key={part} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        flex: "0 0 72px",
                        fontSize: "0.68rem", fontWeight: 700,
                        color: T.muted, textTransform: "uppercase", letterSpacing: 0.5,
                      }}>{part}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <SegmentedToggle
                          value={sh.fit[part]}
                          options={FIT_VALUES}
                          onChange={(v) => updateShoeFit(idx, part, v)}
                          disabled={saving}
                          allowDeselect={false}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: "right", marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => removeShoe(idx)}
                    disabled={saving}
                    style={{
                      background: "transparent", border: "none",
                      color: T.muted, fontSize: "0.7rem",
                      cursor: saving ? "not-allowed" : "pointer",
                      textDecoration: "underline",
                    }}
                  >Remove</button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addShoe}
            disabled={saving}
            style={{
              marginTop: 8, padding: "0.35rem 0.9rem",
              background: "transparent", border: `1px dashed ${T.accent}`,
              color: T.accent, borderRadius: 6,
              fontSize: "0.75rem", fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >+ Add shoe</button>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={labelStyle}>Additional notes (optional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
            rows={3}
            style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
            placeholder="Any other preferences?"
          />
        </div>

        {saveError && (
          <div style={{
            padding: "0.5rem 0.75rem", marginBottom: "0.75rem",
            background: "#fbebe6", color: "#8a3d1d", borderRadius: 6,
            fontSize: "0.78rem", lineHeight: 1.5,
          }}>
            {Array.isArray(saveError) ? (
              saveError.length === 1 ? (
                saveError[0]
              ) : (
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {saveError.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              )
            ) : (
              saveError
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "0.5rem 1rem", background: "transparent",
              border: `1px solid ${T.border}`, borderRadius: 6,
              color: T.text, fontSize: "0.82rem", fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "0.5rem 1.2rem", background: T.accent,
              border: `1px solid ${T.accent}`, borderRadius: 6,
              color: "#fff", fontSize: "0.82rem", fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >{saving ? "Saving..." : "Save & re-run"}</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Retake Modal
// ══════════════════════════════════════════════════════════════
// Lets the user replace a single view (sole or side). Instead of a
// simple file picker, we redirect the user through the REAL capture
// flow at /scan - the same getUserMedia camera stream, voice guide,
// brightness auto-snap, alignment overlay, and review screen as the
// original scan. scan.html detects retake-mode via ?retake=sole|side
// &scan_id=XXX, shows only the relevant instruction screen, skips
// start / shoe-fit / processing screens, upserts the new JPEG into
// scans/{scan_id}-{view}.jpg, sets pipeline_stage='pending' so
// scan_worker re-runs the FULL pipeline (SAM3 + measurements +
// scoring + interpretation), and redirects back here.
//
// This modal is therefore a simple confirmation step - no upload
// happens here; the navigation is the action.

function RetakeModal({ scanId, view, onClose }) {
  const viewLabel = view === "sole" ? "Sole (bottom of foot)" : "Side (profile)";
  const viewHint = view === "sole"
    ? "Lay your phone flat on the ground, screen up, and hold your foot above the camera. Toes and heel should be the same distance from the phone."
    : "Hold your phone horizontally on the ground, screen facing the inside of your right foot. Foot flat, leg straight, full profile in frame.";

  const handleStart = () => {
    window.location.href = `/scan?retake=${view}&scan_id=${encodeURIComponent(scanId)}`;
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(26,22,15,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "2rem 1rem", overflowY: "auto",
      }}
    >
      <div style={{
        background: T.card, borderRadius: 14, maxWidth: 460, width: "100%",
        padding: "1.2rem 1.25rem", boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: T.text, margin: 0 }}>
            Retake {viewLabel} photo
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none", border: "none", fontSize: "1.3rem",
              color: T.muted, cursor: "pointer", padding: 0, lineHeight: 1,
            }}
          >×</button>
        </div>

        <div style={{
          fontSize: "0.8rem", color: T.text, lineHeight: 1.55, marginBottom: "0.9rem",
        }}>
          {viewHint}
        </div>

        <div style={{
          fontSize: "0.78rem", color: T.muted, lineHeight: 1.5, marginBottom: "0.9rem",
          padding: "0.7rem 0.85rem",
          background: "#faf8f4", border: `1px solid ${T.border}`, borderRadius: 8,
        }}>
          We'll open the scanner with the camera, voice guide, and alignment overlay - exactly the same capture flow as your original scan. Your shoe-fit preferences and the other photo stay as they are.
        </div>

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          marginTop: "1rem", paddingTop: "0.75rem", borderTop: `1px solid ${T.border}`,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem", background: "#fff",
              border: `1px solid ${T.border}`, borderRadius: 6,
              color: T.text, fontSize: "0.82rem", fontWeight: 600,
              cursor: "pointer",
            }}
          >Cancel</button>
          <button
            type="button"
            onClick={handleStart}
            style={{
              padding: "0.5rem 1.2rem", background: T.accent,
              border: `1px solid ${T.accent}`, borderRadius: 6,
              color: "#fff", fontSize: "0.82rem", fontWeight: 700,
              cursor: "pointer",
            }}
          >Open scanner</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PROCESSING SCREEN
// Shown full-page whenever pipeline_stage is in progress — either a
// single-photo retake (pending → segmenting → finding_shoes) or a
// preference edit (rescore → rescoring). Prevents the user from seeing
// stale recommendations while the worker is still updating them.
//
// Key design choice: the progress bar + stage list are driven CLIENT-SIDE
// off a monotonic timer, *not* off the server's pipeline_stage polls.
// Reason: the deterministic scoring engine runs in well under 2 seconds,
// so `finding_shoes` often finishes between two polls and the user never
// sees it. A purely-server-driven UI would jump from 30 % straight to the
// results page, which felt like recommendations weren't being rewritten.
//
// We enforce a minimum dwell (≈6 s retake, ≈2.5 s rescore) so every stage
// is visible; if the server is still working past that, we keep showing
// the screen until stage=='complete'; if the server finished early, we
// animate cleanly to 100 %, flash "Done!" for a beat, then dismiss.
// ══════════════════════════════════════════════════════════════

function ProcessingScreen({ scan, scanId, onDismiss }) {
  const mobile = useIsMobile();
  const serverStage = scan?.pipeline_stage || "pending";

  // Capture whether this session started as a rescore at mount-time, so a
  // mid-flight transition (e.g. worker flips from `rescore` to `complete`)
  // doesn't make us suddenly switch to the full-pipeline copy.
  const isRescoreRef = useRef(
    serverStage === "rescore" || serverStage === "rescoring"
  );
  const isRescore = isRescoreRef.current;

  const MIN_DWELL_MS = isRescore ? 2500 : 6500;
  const DONE_HOLD_MS = 1200;

  const mountedAtRef = useRef(Date.now());
  const [clientProgress, setClientProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      const ms = Date.now() - mountedAtRef.current;

      // Client-side curve: 0→95% over MIN_DWELL_MS with a brief pause at
      // the stage boundaries so the eye can read "segmenting" and
      // "finding shoes" distinctly.
      const t = Math.min(1, ms / MIN_DWELL_MS);
      const target = Math.round(t * 95);
      setClientProgress((p) => Math.max(p, target));

      // Server finished AND we've held the screen long enough: close out.
      if (serverStage === "complete" && ms >= MIN_DWELL_MS) {
        setClientProgress(100);
        setDone(true);
        clearInterval(id);
        const t2 = setTimeout(() => { if (onDismiss) onDismiss(); }, DONE_HOLD_MS);
        // setTimeout returns a number; stash it on the ref so cleanup below
        // can cancel if the component unmounts mid-hold.
        mountedAtRef.closeTimer = t2;
      }
    }, 120);
    return () => {
      clearInterval(id);
      if (mountedAtRef.closeTimer) clearTimeout(mountedAtRef.closeTimer);
    };
  }, [serverStage, onDismiss, MIN_DWELL_MS]);

  const progress = clientProgress;

  // Derive the visible stage from the CLIENT timeline (not the server's
  // pipeline_stage) so every stage has a guaranteed dwell. Maps cleanly
  // onto the same 3-step layout as the initial scan in scan.html.
  let displayStage;
  if (done) displayStage = "complete";
  else if (isRescore) displayStage = "rescoring";
  else if (progress < 6)  displayStage = "pending";
  else if (progress < 40) displayStage = "segmenting";
  else                    displayStage = "finding_shoes";

  const title = done
    ? "Done!"
    : isRescore
      ? "Updating your recommendations..."
      : displayStage === "pending"       ? "Queued for analysis..."
      : displayStage === "segmenting"    ? "Segmenting your foot..."
      : displayStage === "finding_shoes" ? "Finding your perfect shoes..."
      : "Processing your scan...";

  const subtitle = isRescore
    ? "No new photos needed — usually takes a couple of seconds."
    : "This usually takes about 10–15 seconds.";

  // Stage list (full pipeline) — hidden for the rescore path which only
  // re-scores, doesn't re-segment.
  const stages = isRescore
    ? null
    : [
        { key: "seg",   label: "Segmenting your foot",       done: ["finding_shoes","complete"].includes(displayStage), active: displayStage === "segmenting" || displayStage === "pending" },
        { key: "meas",  label: "Analysing measurements",     done: ["finding_shoes","complete"].includes(displayStage), active: false },
        { key: "shoes", label: "Finding your perfect shoes", done: displayStage === "complete", active: displayStage === "finding_shoes" },
      ];

  return (
    <div style={{
      minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: T.font, padding: mobile ? "1.5rem 1rem" : "3rem 1.5rem",
    }}>
      <div style={{
        maxWidth: 520, width: "100%",
        background: T.card, borderRadius: 14,
        border: `1px solid ${T.border}`,
        padding: mobile ? "1.5rem 1.25rem" : "2rem 2rem",
        boxShadow: "0 6px 24px rgba(0,0,0,0.05)",
        textAlign: "center",
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: 2, color: T.accent, marginBottom: 8,
        }}>
          climbing-gear.com
        </div>
        <h1 style={{
          fontSize: mobile ? 20 : 24, fontWeight: 800,
          color: T.text, letterSpacing: -0.3, margin: "0 0 0.4rem",
        }}>
          {title}
        </h1>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: "1.4rem" }}>
          {subtitle}
        </div>

        {/* Progress bar */}
        <div style={{
          height: 10, width: "100%", background: "#f2ede2",
          borderRadius: 999, overflow: "hidden", marginBottom: 6,
        }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: `linear-gradient(90deg, ${T.accent}, #c98a42)`,
            transition: "width 0.6s ease-out",
          }} />
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: "1.4rem" }}>
          {progress}%
        </div>

        {stages && (
          <ul style={{
            listStyle: "none", padding: 0, margin: "0 auto",
            textAlign: "left", maxWidth: 320,
          }}>
            {stages.map((st, i) => {
              const color = st.done ? "#3d7a52" : st.active ? T.accent : T.muted;
              return (
                <li key={st.key} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "0.45rem 0",
                  fontSize: 13,
                  color: st.done || st.active ? T.text : T.muted,
                  fontWeight: st.active ? 700 : 500,
                }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, borderRadius: "50%",
                    background: st.done ? "#3d7a52" : "transparent",
                    border: st.done ? "none" : `2px solid ${color}`,
                    color: st.done ? "#fff" : color,
                    fontSize: 11, fontWeight: 800, flexShrink: 0,
                  }}>
                    {st.done ? "✓" : i + 1}
                  </span>
                  <span>{st.label}</span>
                  {st.active && (
                    <span style={{
                      width: 10, height: 10, marginLeft: "auto",
                      border: `2px solid ${T.border}`, borderTopColor: T.accent,
                      borderRadius: "50%", animation: "spin 0.8s linear infinite",
                    }} />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {isRescore && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            marginTop: 4,
          }}>
            <div style={{
              width: 12, height: 12,
              border: `2px solid ${T.border}`, borderTopColor: T.accent,
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ fontSize: 12, color: T.muted }}>
              Re-running the scoring engine against the same foot scan
            </span>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{
          marginTop: "1.6rem", fontSize: 11, color: T.muted,
          borderTop: `1px solid ${T.border}`, paddingTop: "0.9rem",
        }}>
          You'll be redirected here automatically when it's ready.
          Scan ID: <code style={{ fontSize: 10 }}>{scanId}</code>
        </div>
      </div>
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
  const [editOpen, setEditOpen] = useState(false);
  // Which view the user is retaking: null | 'sole' | 'side'
  const [retakeView, setRetakeView] = useState(null);
  // Bumped whenever we want to (re)start polling - e.g. after the user saves
  // edits and the backend transitions complete -> rescore -> complete.
  const [pollEpoch, setPollEpoch] = useState(0);
  // Flipped to true by ProcessingScreen's onDismiss once it has held the
  // screen long enough AND the server reports complete. Reset back to
  // false whenever the pipeline re-enters an in-progress stage (new
  // retake or new rescore triggered by the user).
  const [processingDone, setProcessingDone] = useState(false);
  // Tracks whether we've seen the pipeline in-progress at least once for
  // this scan view. Keeps ProcessingScreen mounted through the brief
  // window between the server flipping to `complete` and the client's
  // min-dwell timer firing onDismiss.
  const pipelineWasInFlightRef = useRef(false);
  const interpretationRef = useRef(null);
  const recSectionRefs = useRef({});

  // When the pipeline re-enters an in-progress stage (retake/rescore),
  // remember that we're mid-flight and clear any previous "done" flag so
  // the ProcessingScreen takes over again.
  useEffect(() => {
    if (scan && IN_PROGRESS_STAGES.has(scan.pipeline_stage)) {
      pipelineWasInFlightRef.current = true;
      setProcessingDone(false);
    }
  }, [scan?.pipeline_stage]);

  usePageMeta(
    scan ? "Your Foot Profile" : "Scan Results",
    "AI-powered foot scan analysis for climbing shoe fitting"
  );

  // Single source of truth: foot_scan_fits table.
  // Poll while the pipeline is running (full scan or rescore) so the page
  // updates in place when the user edits preferences or retakes a photo.
  // Stops on terminal stages (complete, error, validation_failed, waiting_preferences).
  //
  // Payload optimisation (2026-04-22): foot_scan_fits rows grew to ~100 KB
  // once browse_extended started carrying 4x30 tier shoes with full specs.
  // Re-pulling select=* on every 2 s tick meant ~50 KB/s of sustained
  // traffic during rescore, which stalled the page whenever Supabase REST
  // latency spiked (we saw 10-14 s responses). Fix:
  //   - First tick after mount / pollEpoch bump: full select=* (we need
  //     the fat columns to render the results page at all).
  //   - Subsequent ticks while IN_PROGRESS: narrow select (~150 B) just
  //     to watch pipeline_stage flip.
  //   - When the stage flips OUT of IN_PROGRESS: one final full fetch so
  //     the newly-written interpretation / recommendations / browse_extended
  //     replace the pre-rescore snapshot in state.
  useEffect(() => {
    if (!scanId) return;
    let cancelled = false;
    let timer = null;
    let haveFullSnapshot = false;

    const POLL_COLS = "scan_id,pipeline_stage,pipeline_error,pipeline_started_at";

    // Full row goes through /api/scan?op=get (service-role server-side) so
    // PII columns (email, email_freq) are returned even though anon RLS now
    // hides them. The narrow poll stays on direct REST: it only reads non-
    // PII columns and benefits from PostgREST's lower latency. /api/scan
    // returns a single row object; wrap in array to match the existing
    // consumer shape (rows[0]).
    const fetchFull = () =>
      fetch(`/api/scan?op=get&scan_id=${encodeURIComponent(scanId)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((row) => (row ? [row] : []));
    const fetchNarrow = () =>
      supabaseFetch(`/rest/v1/foot_scan_fits?scan_id=eq.${scanId}&select=${POLL_COLS}`);

    const tick = () => {
      const req = haveFullSnapshot ? fetchNarrow() : fetchFull();
      req
        .then((rows) => {
          if (cancelled) return;
          if (!rows.length) { setError("Scan not found"); setLoading(false); return; }
          const row = rows[0];
          const inProgress = IN_PROGRESS_STAGES.has(row.pipeline_stage);

          if (!haveFullSnapshot) {
            // First tick: full row — populate state as before.
            setScan(row);
            haveFullSnapshot = true;
            setLoading(false);
            if (inProgress) timer = setTimeout(tick, 2000);
            return;
          }

          if (inProgress) {
            // Narrow poll: merge only the small fields that change during
            // the run so the fat columns (browse_extended, recommendations,
            // interpretation, measurements) stay intact in React state.
            setScan((prev) => prev ? { ...prev, ...row } : row);
            timer = setTimeout(tick, 2000);
            return;
          }

          // Pipeline just left IN_PROGRESS → the fat columns are now stale.
          // Hold off on flipping pipeline_stage in state until the full
          // fresh row arrives, so ProcessingScreen keeps covering the UI
          // through the transition. If the full fetch fails, fall back to
          // the narrow merge so the UI can still transition (stale fat
          // columns + manual-refresh recovery is better than being stuck).
          fetchFull()
            .then((rows2) => {
              if (cancelled) return;
              if (rows2.length) {
                setScan(rows2[0]);
              } else {
                setScan((prev) => prev ? { ...prev, ...row } : row);
              }
            })
            .catch(() => {
              if (cancelled) return;
              setScan((prev) => prev ? { ...prev, ...row } : row);
            });
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e.message);
          setLoading(false);
        });
    };

    // Only show the full-screen loader on first mount, not on poll restarts
    if (pollEpoch === 0) setLoading(true);
    setError(null);
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [scanId, pollEpoch]);

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

  // Terminal failure gate: the worker rejected the scan (validation_failed,
  // e.g. a blurry or wrong photo) or hit an error. Without this the scan
  // never reaches stage 'complete', so ProcessingScreen's onDismiss never
  // fires and the user is stuck on the loading screen forever. Show a clear
  // failure card with a retake action instead.
  if (s.pipeline_stage === "validation_failed" || s.pipeline_stage === "error") {
    const isValidation = s.pipeline_stage === "validation_failed";
    const failMsg = s.pipeline_error || (isValidation
      ? "We could not read this scan clearly. Please retake your photos in good light with the foot inside the guide."
      : "Something went wrong while processing this scan. Please try again.");
    const retakeBtn = (view, label, filled) => (
      <a
        href={`/scan?retake=${view}&scan_id=${encodeURIComponent(scanId)}`}
        style={{
          display: "inline-block", margin: "0 5px 8px",
          padding: "0.6rem 1.2rem", borderRadius: 8,
          fontWeight: 700, fontSize: "0.85rem", textDecoration: "none",
          background: filled ? T.accent : "transparent",
          color: filled ? "#fff" : T.accent,
          border: filled ? "none" : `1.5px solid ${T.accent}`,
        }}
      >{label}</a>
    );
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, padding: "2rem 1rem" }}>
        <div style={{ textAlign: "center", maxWidth: 430 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>
            {isValidation ? "This scan needs a retake" : "Scan could not be processed"}
          </div>
          <div style={{ fontSize: 14, color: T.muted, marginBottom: 20, lineHeight: 1.55 }}>
            {failMsg}
          </div>
          {retakeBtn("sole", "Retake sole photo", true)}
          {retakeBtn("side", "Retake side photo", false)}
          <div style={{ marginTop: 12 }}>
            <a href="/scan" style={{ color: T.muted, fontWeight: 600, textDecoration: "none", fontSize: "0.8rem" }}>
              Start a new scan
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Pipeline gate: we never show stale results while the worker is
  // running. ProcessingScreen also enforces a client-side minimum dwell
  // (because the scoring engine runs in <1 s, faster than our 2 s poll,
  // so `finding_shoes` would never be visible otherwise). It only fires
  // onDismiss once the server reports complete AND its min dwell has
  // elapsed, at which point we render the refreshed results.
  if (IN_PROGRESS_STAGES.has(s.pipeline_stage) || (!processingDone && pipelineWasInFlightRef.current)) {
    return (
      <ProcessingScreen
        scan={s}
        scanId={scanId}
        onDismiss={() => setProcessingDone(true)}
      />
    );
  }

  const toeShape = s.toe_shape || "egyptian";
  const toeDesc = TOE_DESCRIPTIONS[toeShape] || TOE_DESCRIPTIONS.egyptian;

  // Overlay image URLs - predictable paths in Supabase Storage
  const storageBase = `${SUPABASE_URL}/storage/v1/object/public/foot-scans/scans`;
  // Bust overlay caches whenever the pipeline last ran — the worker
  // rewrites *-sole_overlay.png / *-side_overlay.png on every retake, and
  // browsers will otherwise show the stale image. The row has no
  // `updated_at`; `pipeline_started_at` advances on every fresh run.
  const cacheBust = s.pipeline_started_at ? `?t=${new Date(s.pipeline_started_at).getTime()}` : "";
  const soleOverlay = s.toe_shape ? `${storageBase}/${scanId}-sole_overlay.png${cacheBust}` : null;
  const sideOverlay = (s.instep_height_ratio != null || s.heel_depth_ratio != null) ? `${storageBase}/${scanId}-side_overlay.png${cacheBust}` : null;

  // Fit data from same row
  const fitShoes = s.shoes || [];
  const fitSummary = fitShoes.length > 0 ? fitShoes[0] : null;

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: mobile ? "1rem 0.75rem" : "2rem 1.5rem", fontFamily: T.font }}>

      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: "1.2rem" }}>
        <h1 style={{ fontSize: mobile ? 22 : 28, fontWeight: 800, color: T.text, letterSpacing: -0.5, margin: 0 }}>
          Your Scan Results
        </h1>
      </div>

      {/* ── Share + Email capture ── */}
      <ShareCard scanId={scanId} />
      <EmailCapture
        scanId={scanId}
        savedEmail={s.email}
        savedFreq={s.email_freq}
      />

      {/* ── Your inputs (read-only summary of what was submitted) ── */}
      <UserInputsPanel
        scan={s}
        onEdit={() => setEditOpen(true)}
        disabled={IN_PROGRESS_STAGES.has(s.pipeline_stage)}
      />

      {editOpen && (
        <EditInputsModal
          scan={s}
          scanId={scanId}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            // Optimistic: immediately reflect rescore stage + fresh start
            // time so the ProcessingScreen appears instantly with a clean
            // 0% progress bar, no wait for the next poll tick.
            setScan((prev) => prev ? {
              ...prev,
              pipeline_stage: "rescore",
              pipeline_started_at: new Date().toISOString(),
            } : prev);
            // Restart the polling loop (it stopped when the scan was 'complete').
            setPollEpoch((n) => n + 1);
          }}
        />
      )}

      {retakeView && (
        <RetakeModal
          scanId={scanId}
          view={retakeView}
          onClose={() => setRetakeView(null)}
        />
      )}

      {/* Note: processing banner removed — ScanResult now returns the
          full ProcessingScreen when IN_PROGRESS_STAGES.has(stage), so
          the stale results never render alongside an "updating..." badge. */}

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
          <div style={{ ...cardHeaderStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={labelStyle}>Sole Scan Results</div>
            <RetakeLink
              onClick={() => setRetakeView("sole")}
              disabled={IN_PROGRESS_STAGES.has(s.pipeline_stage)}
            />
          </div>
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
              <HvaBar value={s.hva_offset_ratio} />
            </div>
          </div>
        </div>

        {/* Side View Card */}
        <div style={cardStyle}>
          <div style={{ ...cardHeaderStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={labelStyle}>Side Scan Results</div>
            <RetakeLink
              onClick={() => setRetakeView("side")}
              disabled={IN_PROGRESS_STAGES.has(s.pipeline_stage)}
            />
          </div>
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
          baseline: { label: "Your Best Match", desc: "Best fit to your use case and performance preference", ctaText: "top matches" },
          softer: { label: "Softer Shoes", desc: "For more sensitivity and better smearing.", ctaText: "softer picks" },
          stiffer: { label: "Stiffer Shoes", desc: "For more support and better edging.", ctaText: "stiffer picks" },
          budget: { label: "Best Value", desc: "Affordable picks for real dirtbags.", ctaText: "value picks" },
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
                {hasCats && scan?.browse_extended && g.cat !== "all" && scanId && (
                  <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>
                    <a
                      href={`/scan/${encodeURIComponent(scanId)}/browse?tier=${g.cat}`}
                      className="scan-btn"
                      style={{
                        ...ACTION_BTN,
                        padding: mobile ? "0.7rem 1.3rem" : "0.65rem 1.4rem",
                        borderRadius: 999,
                        fontSize: mobile ? "0.88rem" : "0.85rem",
                        boxShadow: "0 3px 9px rgba(201,138,66,0.3)",
                      }}
                    >
                      <IconExternal size={mobile ? 16 : 15} />
                      See more {g.ctaText || "shoes"}
                    </a>
                  </div>
                )}
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
