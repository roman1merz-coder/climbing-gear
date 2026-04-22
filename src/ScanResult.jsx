import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { T } from "./tokens.js";
import { supabaseFetch, supabaseRpc, SUPABASE_URL } from "./supabase.js";
import useIsMobile from "./useIsMobile.js";
import usePageMeta from "./usePageMeta.js";
import { SHOE_DB, BRANDS, modelsFor, SHOE_SIZES_EU, STREET_SIZES_EU, formatSize } from "./shoeDb.js";

// Service-role key for writes (same key already public in scan.html)
const SB_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4";

// ══════════════════════════════════════════════════════════════
// Population reference (tertile-calibrated, 2026-04-14)
// Must stay in sync with scanner/foot_measure.py POP.
// lo/hi are explicit tertile boundaries (33rd/67th percentile on
// the current ~200-scan dataset) so narrow/normal/wide each cover
// ~1/3 of the population. The slider renders these three bands as
// three equal-width visual sections.
// ══════════════════════════════════════════════════════════════
const POP = {
  forefoot_width_ratio:  { mean: 0.355, std: 0.028, lo: 0.344, hi: 0.367 },
  arch_length_ratio:     { mean: 0.725, std: 0.025, lo: 0.712, hi: 0.734 },
  heel_width_ratio:      { mean: 0.238, std: 0.022, lo: 0.228, hi: 0.245 },
  instep_height_ratio:   { mean: 0.264, std: 0.036, lo: 0.255, hi: 0.273 },
  heel_depth_ratio:      { mean: 0.034, std: 0.020, lo: 0.028, hi: 0.041 },
};

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

// Map a measured value into the three-equal-section slider space
// (0-100%). Uses piecewise-linear mapping so each of the three
// classification bands (low / mid / high) occupies exactly 33.33%
// of visible width, regardless of how wide each band is in real units.
function sectionPct(val, min, lo, hi, max) {
  if (val <= lo) {
    const span = lo - min;
    const t = span > 0 ? (val - min) / span : 0.5;
    return Math.max(0, Math.min(1, t)) * 33.333;
  }
  if (val <= hi) {
    const span = hi - lo;
    const t = span > 0 ? (val - lo) / span : 0.5;
    return 33.333 + Math.max(0, Math.min(1, t)) * 33.334;
  }
  const span = max - hi;
  const t = span > 0 ? (val - hi) / span : 0.5;
  return 66.667 + Math.max(0, Math.min(1, t)) * 33.333;
}

function levelLabel(val, lo, hi) {
  if (val < lo) return "low";
  if (val > hi) return "high";
  return "mid";
}

function levelColor(lbl) {
  if (lbl === "low")  return T.accent;
  if (lbl === "high") return T.accent;
  return T.green || "#6a8a4f";
}

// ── Metric bar component ─────────────────────────────────────
// Three equal-width sections (low | mid | high). Pointer shows
// where the user sits, with its left/right offset within a section
// indicating closeness to the boundary.
function MetricBar({ ratioKey, value }) {
  const p = POP[ratioKey];
  const m = META[ratioKey];
  if (!p || !m || value == null) return null;

  const lo  = p.lo;
  const hi  = p.hi;
  // Derive visual bounds from real population spread (mean ± 3σ),
  // floored at 0 for ratios where negative is nonsensical.
  const vmin = Math.max(0, p.mean - VISUAL_SIGMA * p.std);
  const vmax = p.mean + VISUAL_SIGMA * p.std;
  const pos = sectionPct(value, vmin, lo, hi, vmax);
  const lbl = levelLabel(value, lo, hi);
  const col = levelColor(lbl);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: T.text }}>{m.label}</span>
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: col }}>{lbl}</span>
      </div>

      {/* Three equal-width bands */}
      <div style={{ height: 8, borderRadius: 4, position: "relative", overflow: "visible" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ flex: 1, background: "#ece5d4" }} />
          <div style={{ flex: 1, background: "#d6cdb4", borderLeft: "1px solid #c4b99a", borderRight: "1px solid #c4b99a" }} />
          <div style={{ flex: 1, background: "#ece5d4" }} />
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
      <div style={{ display: "flex", fontSize: "0.58rem", color: "#a8a08e", textTransform: "lowercase" }}>
        <span style={{ flex: 1, textAlign: "left" }}>low</span>
        <span style={{ flex: 1, textAlign: "center" }}>mid</span>
        <span style={{ flex: 1, textAlign: "right" }}>high</span>
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
            style={{
              fontSize: "0.72rem", fontWeight: 700,
              padding: "0.25rem 0.7rem", borderRadius: 6,
              border: `1px solid ${T.accent}`,
              background: "transparent", color: T.accent,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.5 : 1,
              textTransform: "uppercase", letterSpacing: 0.5,
            }}
          >
            Edit
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
      <div style={rowStyle}>
        <span style={keyStyle}>Next shoe</span>
        <span style={{ color: T.text }}>{pref}</span>
      </div>
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
      style={{
        padding: "0.25rem 0.55rem",
        fontSize: "0.7rem", fontWeight: 700,
        background: "transparent",
        border: `1px solid ${T.border}`, borderRadius: 6,
        color: disabled ? T.muted : T.accent,
        cursor: disabled ? "not-allowed" : "pointer",
        textTransform: "uppercase", letterSpacing: 0.5,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      Retake
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
  const [nextPref, setNextPref] = useState(scan?.next_shoe_preference || "");
  const [notes, setNotes] = useState(scan?.next_shoe_notes || "");
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

    const body = {
      sex,
      shoes: cleanedShoes,
      next_shoe_preference: nextPref || null,
      next_shoe_notes: notes.trim() || null,
      pipeline_stage: "rescore",
      // Reset the start timestamp so the ProcessingScreen progress bar
      // counts from 0 rather than whatever the original scan recorded.
      pipeline_started_at: new Date().toISOString(),
    };
    if (streetSize.trim()) {
      const n = Number(streetSize);
      if (!Number.isNaN(n)) body.street_size_eu = n;
    }

    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/foot_scan_fits?scan_id=eq.${scanId}`,
        {
          method: "PATCH",
          headers: {
            apikey: SB_SERVICE_KEY,
            Authorization: `Bearer ${SB_SERVICE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(body),
        }
      );
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Save failed (${resp.status}): ${txt.slice(0, 200)}`);
      }
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

        {/* Next shoe preference */}
        <div style={{ marginBottom: "0.85rem" }}>
          <div style={labelStyle}>What should your next shoe prioritise?</div>
          <SegmentedToggle
            value={nextPref}
            options={PREF_VALUES}
            labels={{ comfort: "More comfort", same: "Same balance", performance: "More performance" }}
            onChange={(v) => setNextPref(v || "")}
            disabled={saving}
          />
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

    const fetchFull = () =>
      supabaseFetch(`/rest/v1/foot_scan_fits?scan_id=eq.${scanId}&select=*`);
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
          baseline: { label: "Your Best Match", desc: "Similar feel and use case to your current shoes", ctaText: "top matches" },
          softer: { label: "Softer Shoes", desc: "For more sensitivity, recommended for indoors and bouldering", ctaText: "softer picks" },
          stiffer: { label: "Stiffer Shoes", desc: "For more support, recommended for outdoors and sport/trad climbing", ctaText: "stiffer picks" },
          budget: { label: "Best Value", desc: "Affordable picks at your recommended size", ctaText: "value picks" },
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
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        padding: mobile ? "0.7rem 1.3rem" : "0.65rem 1.5rem",
                        borderRadius: 999,
                        background: T.accent,
                        color: "#fff",
                        fontSize: mobile ? "0.88rem" : "0.85rem",
                        fontWeight: 700,
                        letterSpacing: "0.2px",
                        textDecoration: "none",
                        boxShadow: "0 2px 8px rgba(201,138,66,0.28)",
                      }}
                    >
                      See more {g.ctaText || "shoes"}
                      <span style={{ fontSize: "1rem", lineHeight: 1, marginTop: "-1px" }}>→</span>
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
