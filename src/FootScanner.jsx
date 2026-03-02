import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";
import useIsMobile from "./useIsMobile.js";
import usePageMeta from "./usePageMeta.js";
import FootVizPanel from "./FootVizPanel.jsx";

// ═══════════════════════════════════════════════════════════════
// FOOT SCANNER — AI foot shape analysis for climbing shoe fitting
//
// Flow:
//   Step 0: Welcome
//   Step 1: Shoe size (EU)
//   Step 2: Photo capture with instruction overlays (top, side, heel)
//   Step 3: Analyzing (loading animation)
//   Step 4: Results with continuous sliders + CTA → ShoeFinder
//
// Research-backed anthropometric references:
//   Width/length: mean 0.386 ±0.022 (IOSR Journal)
//   Arch Height Index: standing mean 0.340 ±0.031 (PMC3396578)
//   Arch-to-total ratio: ~0.73 avg (Brannock)
//   Heel-to-forefoot width: ~0.65 avg
// ═══════════════════════════════════════════════════════════════

const EU_SIZES = [];
for (let s = 34; s <= 50; s += 0.5) EU_SIZES.push(s);

// ─── Resize image client-side ──────────────────────────────────
function resizeImage(file, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height / width) * maxDim); width = maxDim; }
          else { width = Math.round((width / height) * maxDim); height = maxDim; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82).split(",")[1]);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Photo instruction config ──────────────────────────────────
const PHOTO_STEPS = [
  {
    key: "top",
    title: "Top View",
    headline: "Look straight down",
    instructions: [
      "Stand barefoot on a flat, contrasting surface (e.g. dark floor)",
      "Hold your phone horizontally above your foot",
      "Camera should point straight down \u2014 no angle",
      "Make sure the full foot is visible in the frame",
      "Keep toes relaxed and spread naturally",
    ],
    icon: "\u{1F441}\u{FE0F}\u200D\u{1F5E8}\u{FE0F}",
    cameraLabel: "top-down",
  },
  {
    key: "side",
    title: "Side View",
    headline: "From the side, at ground level",
    instructions: [
      "Keep your foot straight on the floor",
      "Hold your phone horizontally on the floor next to your foot",
      "Camera end points toward the foot \u2014 capture the full side profile",
      "The arch and instep should be clearly visible",
      "Keep your weight evenly distributed",
    ],
    icon: "\u{1F4F7}",
    cameraLabel: "side profile",
  },
  {
    key: "heel",
    title: "Heel View",
    headline: "From behind, at ground level",
    instructions: [
      "Keep your foot straight on the floor",
      "Hold your phone horizontally on the floor behind your heel",
      "Camera end points toward the heel \u2014 capture the full back view",
      "The heel and Achilles area should be clearly visible",
      "Both sides of the heel should be in frame",
    ],
    icon: "\u{1F9B6}",
    cameraLabel: "rear heel",
  },
];

// ═══════════════════════════════════════════════════════════════
// RESULT SLIDER — continuous spectrum with marker
// ═══════════════════════════════════════════════════════════════
function ResultSlider({ label, value, min, max, avgValue, avgLabel, lowLabel, highLabel, lowThresh, highThresh, description, color }) {
  const pct = ((value - min) / (max - min)) * 100;
  const avgPct = ((avgValue - min) / (max - min)) * 100;
  const lowPct = ((lowThresh - min) / (max - min)) * 100;
  const highPct = ((highThresh - min) / (max - min)) * 100;

  // Determine zone
  const zone = value < lowThresh ? "low" : value > highThresh ? "high" : "mid";
  const zoneLabel = zone === "low" ? lowLabel : zone === "high" ? highLabel : avgLabel;
  const zoneColor = color || (zone === "low" ? T.blue : zone === "high" ? T.accent : T.green);

  return (
    <div style={{
      background: T.card, border: `1.5px solid ${T.border}`, borderRadius: T.radius,
      padding: "16px 18px", marginBottom: "12px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {label}
        </div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: zoneColor }}>{zoneLabel}</div>
      </div>

      {/* Slider track */}
      <div style={{ position: "relative", height: "24px", marginBottom: "6px" }}>
        {/* Background gradient bar */}
        <div style={{
          position: "absolute", top: "9px", left: 0, right: 0, height: "6px",
          borderRadius: "3px", background: `linear-gradient(90deg, ${T.blue}40, ${T.green}40, ${T.accent}40)`,
        }} />

        {/* Zone regions */}
        <div style={{
          position: "absolute", top: "9px", left: 0, width: `${lowPct}%`, height: "6px",
          borderRadius: "3px 0 0 3px", background: `${T.blue}25`,
        }} />
        <div style={{
          position: "absolute", top: "9px", left: `${highPct}%`, right: 0, height: "6px",
          borderRadius: "0 3px 3px 0", background: `${T.accent}25`,
        }} />

        {/* Average marker (thin line) */}
        <div style={{
          position: "absolute", top: "6px", left: `${avgPct}%`, width: "1.5px", height: "12px",
          background: T.muted, opacity: 0.35, transform: "translateX(-50%)",
        }} />

        {/* User's value marker */}
        <div style={{
          position: "absolute", top: "4px",
          left: `${Math.min(97, Math.max(3, pct))}%`,
          transform: "translateX(-50%)",
        }}>
          <div style={{
            width: "16px", height: "16px", borderRadius: "50%",
            background: zoneColor, border: "2.5px solid #fff",
            boxShadow: `0 1px 6px ${zoneColor}50`,
          }} />
        </div>
      </div>

      {/* Labels below */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: T.muted }}>
        <span>{lowLabel}</span>
        <span style={{ opacity: 0.5 }}>avg</span>
        <span>{highLabel}</span>
      </div>

      {/* Description */}
      {description && (
        <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.4, marginTop: "8px" }}>
          {description}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function FootScanner() {
  usePageMeta({
    title: "Foot Scanner — AI Foot Shape Analysis | climbing-gear.com",
    description: "Scan your foot with 3 photos and discover your exact foot shape for the perfect climbing shoe fit.",
  });

  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [step, setStep] = useState(0);
  const [shoeSize, setShoeSize] = useState(42);
  const [photos, setPhotos] = useState({ top: null, side: null, heel: null });
  const [previews, setPreviews] = useState({ top: null, side: null, heel: null });
  const [photoStep, setPhotoStep] = useState(0); // which of the 3 photos we're on
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef();

  // ─── Photo handling ──────────────────────────────────────────
  const handlePhoto = useCallback(async (viewKey, file) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPreviews(prev => ({ ...prev, [viewKey]: previewUrl }));
    try {
      const base64 = await resizeImage(file);
      setPhotos(prev => ({ ...prev, [viewKey]: base64 }));
    } catch {
      setError("Failed to process image. Please try a different photo.");
    }
  }, []);

  const allPhotosReady = photos.top && photos.side && photos.heel;

  // ─── Store scan result in Supabase (fire-and-forget) ────────
  const storeScanResult = useCallback(async (data, size) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/foot_scans`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          shoe_size_eu: size,
          toe_shape: data.toe_shape,
          toe_confidence: data.toe_confidence,
          width_ratio: data.width_ratio,
          instep_ratio: data.instep_ratio,
          heel_ratio: data.heel_ratio,
          arch_ratio: data.arch_ratio,
          volume: data.volume,
          width: data.width,
          heel_width: data.heel_width,
          confidence: data.confidence,
          notes: data.notes,
        }),
      });
    } catch {
      // Silent — storage failure should never block the user experience
    }
  }, []);

  // ─── API call ────────────────────────────────────────────────
  const analyzePhotos = useCallback(async () => {
    setStep(3);
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-foot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: { top: photos.top, side: photos.side, heel: photos.heel },
          shoe_size_eu: shoeSize,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Server error: ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
      // If no foot detected or low confidence → show retry screen (step 5)
      if (!data.foot_detected || data.confidence === "low") {
        setStep(5);
      } else {
        setStep(4);
        // Only store valid scans in Supabase
        storeScanResult(data, shoeSize);
      }
    } catch (err) {
      setError(err.message || "Analysis failed. Please try again.");
      setStep(2);
    } finally {
      setAnalyzing(false);
    }
  }, [photos, shoeSize, storeScanResult]);

  // ─── Navigate to ShoeFinder ──────────────────────────────────
  const goToFinder = useCallback(() => {
    if (!result) return;
    const p = new URLSearchParams();
    if (result.toe_shape) p.set("tf", result.toe_shape);
    if (result.volume) p.set("v", result.volume);
    if (result.width) p.set("wd", result.width);
    if (result.heel_width) p.set("hl", result.heel_width);
    navigate(`/find?${p.toString()}`);
  }, [result, navigate]);

  // ─── Shared components ───────────────────────────────────────
  const Wrap = ({ children, narrow }) => (
    <div style={{
      minHeight: "100vh", background: T.bg, fontFamily: T.font,
      padding: isMobile ? "16px 16px 100px" : "32px 24px 100px",
    }}>
      <div style={{ maxWidth: narrow ? "520px" : "680px", margin: "0 auto" }}>{children}</div>
    </div>
  );

  const Badge = ({ text }) => (
    <span style={{
      display: "inline-block", fontSize: "10px", fontWeight: 700,
      letterSpacing: "0.8px", textTransform: "uppercase",
      color: T.accent, background: T.accentSoft,
      padding: "4px 10px", borderRadius: "12px", marginBottom: "12px", fontFamily: T.mono,
    }}>{text}</span>
  );

  const Btn = ({ onClick, children, disabled, primary = true, full = false }) => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: primary ? "13px 32px" : "10px 24px",
      borderRadius: T.radiusSm, fontFamily: T.font,
      fontSize: primary ? "15px" : "14px", fontWeight: primary ? 700 : 600,
      cursor: disabled ? "default" : "pointer", transition: "all 0.2s",
      border: primary ? "none" : `1px solid ${T.border}`,
      background: disabled ? T.border : primary ? T.accent : "transparent",
      color: disabled ? T.muted : primary ? "#fff" : T.muted,
      opacity: disabled ? 0.6 : 1,
      width: full ? "100%" : "auto", textAlign: "center",
    }}>{children}</button>
  );

  // ═══════════════════════════════════════════════════════════
  // STEP 0 — Welcome
  // ═══════════════════════════════════════════════════════════
  if (step === 0) return (
    <Wrap narrow>
      <div style={{ textAlign: "center", paddingTop: isMobile ? "16px" : "32px" }}>
        <Badge text="Beta" />
        <h1 style={{
          fontSize: isMobile ? "26px" : "34px", fontWeight: 800,
          letterSpacing: "-0.5px", color: T.text, marginBottom: "12px", lineHeight: 1.2,
        }}>Discover your foot shape</h1>
        <p style={{
          fontSize: "15px", color: T.muted, lineHeight: 1.6,
          maxWidth: "420px", margin: "0 auto 28px",
        }}>
          Take 3 quick photos and we'll map your toe shape, volume, width, heel, and arch
          proportions — then match you to climbing shoes that fit.
        </p>

        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
          padding: isMobile ? "16px" : "22px 26px", textAlign: "left", marginBottom: "28px",
        }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: T.text, marginBottom: "14px" }}>What you'll need</div>
          {[
            "Bare feet — no socks",
            "A flat surface with good lighting",
            "Your street shoe size (EU)",
            "~60 seconds of your time",
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "8px", fontSize: "13px", color: T.muted }}>
              <span style={{ color: T.green, fontWeight: 700, flexShrink: 0 }}>{"\u2713"}</span>{t}
            </div>
          ))}
        </div>

        <Btn onClick={() => setStep(1)} full={isMobile}>{"Let's scan"}</Btn>

        <div style={{ fontSize: "11px", color: T.muted, marginTop: "14px", lineHeight: 1.5 }}>
          Photos are analyzed in real-time and never stored. No account needed.
        </div>
      </div>
    </Wrap>
  );

  // ═══════════════════════════════════════════════════════════
  // STEP 1 — Shoe Size
  // ═══════════════════════════════════════════════════════════
  if (step === 1) return (
    <Wrap narrow>
      <Badge text="Step 1 of 3" />
      <h2 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "8px", color: T.text }}>
        Your street shoe size
      </h2>
      <p style={{ fontSize: "13px", color: T.muted, marginBottom: "20px", lineHeight: 1.5 }}>
        This anchors the proportions from your photos. Use your everyday shoe size, not your climbing shoe size.
      </p>

      <div style={{
        background: T.card, border: `1.5px solid ${T.border}`, borderRadius: T.radius,
        padding: "20px", marginBottom: "20px",
      }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: T.muted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>EU Size</div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <input type="range" min="34" max="50" step="0.5" value={shoeSize}
            onChange={e => setShoeSize(Number(e.target.value))}
            style={{ flex: 1, accentColor: T.accent, height: "6px" }} />
          <div style={{ fontFamily: T.mono, fontSize: "24px", fontWeight: 700, color: T.accent, minWidth: "52px", textAlign: "right" }}>
            {shoeSize % 1 === 0 ? shoeSize : shoeSize.toFixed(1)}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "14px" }}>
          {[37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49].map(s => (
            <span key={s} onClick={() => setShoeSize(s)} style={{
              fontSize: "12px", padding: "5px 12px", borderRadius: "16px",
              border: `1.5px solid ${shoeSize === s ? T.accent : T.border}`,
              background: shoeSize === s ? T.accentSoft : "transparent",
              color: shoeSize === s ? T.accent : T.muted,
              cursor: "pointer", fontFamily: T.mono, fontWeight: 600, transition: "all 0.15s",
            }}>{s}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px" }}>
        <Btn onClick={() => setStep(0)} primary={false}>Back</Btn>
        <Btn onClick={() => setStep(2)}>Continue</Btn>
      </div>
    </Wrap>
  );

  // ═══════════════════════════════════════════════════════════
  // STEP 2 — Photo Capture (one at a time, fullscreen instruction)
  // ═══════════════════════════════════════════════════════════
  if (step === 2) {
    const currentPhoto = PHOTO_STEPS[photoStep];
    const hasCurrentPhoto = !!previews[currentPhoto?.key];
    const completedCount = [previews.top, previews.side, previews.heel].filter(Boolean).length;

    return (
      <Wrap>
        <Badge text="Step 2 of 3 — Photos" />

        {/* Progress dots */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {PHOTO_STEPS.map((ps, i) => (
            <div key={ps.key} style={{
              flex: 1, height: "4px", borderRadius: "2px",
              background: previews[ps.key] ? T.accent : i === photoStep ? `${T.accent}50` : T.border,
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        {error && (
          <div style={{
            background: T.redSoft, border: `1px solid ${T.red}30`, borderRadius: T.radiusSm,
            padding: "10px 14px", marginBottom: "12px", fontSize: "13px", color: T.red,
          }}>{error}</div>
        )}

        {/* Current photo card — instructions ABOVE upload area */}
        {currentPhoto && (
          <div style={{
            background: T.card, border: `1.5px solid ${hasCurrentPhoto ? T.green : T.border}`,
            borderRadius: T.radius, overflow: "hidden", marginBottom: "16px",
          }}>
            {/* Instructions (always visible, above the photo) */}
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "10px" }}>
                {currentPhoto.title} — {currentPhoto.headline}
              </div>
              {currentPhoto.instructions.map((inst, i) => (
                <div key={i} style={{
                  display: "flex", gap: "8px", marginBottom: "5px",
                  fontSize: "12px", color: T.muted, lineHeight: 1.4,
                }}>
                  <span style={{ color: T.accent, fontWeight: 600, flexShrink: 0, fontFamily: T.mono, fontSize: "10px" }}>{i + 1}</span>
                  {inst}
                </div>
              ))}
            </div>

            {/* Photo area / preview (below instructions) */}
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                height: isMobile ? "220px" : "260px",
                background: hasCurrentPhoto ? "#000" : "rgba(44,50,39,0.03)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", position: "relative",
              }}
            >
              {hasCurrentPhoto ? (
                <>
                  <img src={previews[currentPhoto.key]} alt={currentPhoto.title}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  <div style={{
                    position: "absolute", top: "10px", right: "10px",
                    width: "30px", height: "30px", borderRadius: "50%",
                    background: T.green, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "16px", fontWeight: 700,
                  }}>{"\u2713"}</div>
                  <div style={{
                    position: "absolute", bottom: "10px", right: "10px",
                    background: "rgba(0,0,0,0.65)", color: "#fff",
                    padding: "6px 14px", borderRadius: "14px",
                    fontSize: "12px", fontWeight: 600,
                  }}>Tap to retake</div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "20px" }}>
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>{currentPhoto.icon}</div>
                  <div style={{
                    fontSize: "13px", color: T.accent, fontWeight: 600, marginTop: "8px",
                    padding: "8px 24px", borderRadius: "20px",
                    border: `1.5px solid ${T.accent}`, display: "inline-block",
                  }}>
                    {isMobile ? "Tap to take photo" : "Click to upload photo"}
                  </div>
                </div>
              )}
            </div>

            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handlePhoto(currentPhoto.key, f);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {/* Thumbnail strip of all 3 */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {PHOTO_STEPS.map((ps, i) => (
            <div key={ps.key}
              onClick={() => setPhotoStep(i)}
              style={{
                flex: 1, height: "64px", borderRadius: T.radiusSm,
                border: `2px solid ${i === photoStep ? T.accent : previews[ps.key] ? T.green : T.border}`,
                overflow: "hidden", cursor: "pointer", position: "relative",
                background: previews[ps.key] ? "#000" : T.surface,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {previews[ps.key] ? (
                <img src={previews[ps.key]} alt={ps.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }} />
              ) : (
                <span style={{ fontSize: "10px", color: T.muted, fontWeight: 600 }}>{ps.title}</span>
              )}
              {previews[ps.key] && (
                <div style={{
                  position: "absolute", top: "3px", right: "3px",
                  width: "16px", height: "16px", borderRadius: "50%",
                  background: T.green, color: "#fff", fontSize: "9px",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
                }}>{"\u2713"}</div>
              )}
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", gap: "10px" }}>
          <Btn onClick={() => {
            if (photoStep > 0) setPhotoStep(photoStep - 1);
            else setStep(1);
          }} primary={false}>Back</Btn>

          {hasCurrentPhoto && photoStep < 2 && (
            <Btn onClick={() => setPhotoStep(photoStep + 1)}>Next photo</Btn>
          )}

          {completedCount === 3 && (
            <Btn onClick={analyzePhotos}>
              Analyze my foot {"\u2192"}
            </Btn>
          )}

          {!hasCurrentPhoto && completedCount > 0 && photoStep < 2 && (
            <Btn onClick={() => setPhotoStep(photoStep + 1)} primary={false}>Skip for now</Btn>
          )}
        </div>
      </Wrap>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3 — Analyzing
  // ═══════════════════════════════════════════════════════════
  if (step === 3) return (
    <Wrap narrow>
      <div style={{ textAlign: "center", paddingTop: isMobile ? "48px" : "80px" }}>
        <div style={{
          width: "72px", height: "72px", borderRadius: "50%",
          background: T.accentSoft, margin: "0 auto 20px",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "pulse 2s ease-in-out infinite",
        }}>
          <svg viewBox="0 0 40 40" width="32" height="32" style={{ animation: "spin 3s linear infinite" }}>
            <path d="M12,35 Q10,28 12,18 Q14,10 20,7 Q26,10 28,18 Q30,28 28,35 Z"
              fill="none" stroke={T.accent} strokeWidth="1.5" />
            <circle cx="20" cy="7" r="2" fill={T.accent} opacity="0.5" />
          </svg>
        </div>

        <h2 style={{ fontSize: "20px", fontWeight: 700, color: T.text, marginBottom: "8px" }}>
          Analyzing your foot
        </h2>
        <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.5, marginBottom: "28px" }}>
          AI is examining toe shape, instep height, width, heel profile, and arch proportions...
        </p>

        <div style={{ maxWidth: "260px", margin: "0 auto" }}>
          {["Detecting foot outline", "Classifying toe shape", "Measuring proportions", "Calculating ratios", "Building your profile"].map((label, i) => (
            <div key={i} style={{
              display: "flex", gap: "10px", alignItems: "center",
              padding: "5px 0", fontSize: "12px", color: T.muted,
              opacity: 0, animation: `fadeUp 0.4s ease ${i * 0.3}s forwards`,
            }}>
              <div style={{
                width: "14px", height: "14px", borderRadius: "50%",
                border: `1.5px solid ${T.accent}30`,
                animation: `fillDot 0.2s ease ${i * 0.3 + 1}s forwards`,
              }} />
              {label}
            </div>
          ))}
        </div>

        <style>{`
          @keyframes fillDot { to { background: ${T.accent}; border-color: ${T.accent}; } }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </Wrap>
  );

  // ═══════════════════════════════════════════════════════════
  // STEP 4 — Results with sliders
  // ═══════════════════════════════════════════════════════════
  if (step === 4 && result) {
    const toeInfo = {
      egyptian: { label: "Egyptian", desc: "Big toe longest, smooth taper. Fits most asymmetric climbing shoes well." },
      greek: { label: "Greek (Morton's)", desc: "Second toe longer. Needs extra toe box room — avoid heavily downturned shoes that crush the 2nd toe." },
      roman: { label: "Roman (Square)", desc: "First 2–3 toes roughly equal. Benefits from wider, more symmetric toe boxes." },
    };
    const toe = toeInfo[result.toe_shape] || toeInfo.egyptian;

    return (
      <Wrap>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Badge text="Your Foot Profile" />
          <h2 style={{
            fontSize: isMobile ? "24px" : "30px", fontWeight: 800,
            letterSpacing: "-0.5px", color: T.text, marginBottom: "8px",
          }}>Here's your foot shape</h2>
          <p style={{ fontSize: "14px", color: T.muted }}>Based on your photos and EU {shoeSize}</p>
        </div>

        {/* Foot visualization — SVG diagrams with measurement overlays */}
        <FootVizPanel result={result} isMobile={isMobile} />

        {/* Toe shape — special card (categorical, not slider) */}
        <div style={{
          background: T.card, border: `1.5px solid ${T.border}`, borderRadius: T.radius,
          padding: "16px 18px", marginBottom: "12px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.4px" }}>Toe Shape</div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: T.accent }}>{toe.label}</div>
          </div>
          {/* Toe type selector visual */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            {["egyptian", "greek", "roman"].map(t => (
              <div key={t} style={{
                flex: 1, padding: "6px", borderRadius: T.radiusXs, textAlign: "center",
                background: result.toe_shape === t ? T.accentSoft : "transparent",
                border: `1px solid ${result.toe_shape === t ? T.accent : T.border}`,
                fontSize: "11px", fontWeight: result.toe_shape === t ? 700 : 500,
                color: result.toe_shape === t ? T.accent : T.muted,
                textTransform: "capitalize",
              }}>{t}</div>
            ))}
          </div>
          <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.4 }}>{toe.desc}</div>
          {result.toe_confidence < 0.7 && (
            <div style={{ fontSize: "11px", color: T.yellow, marginTop: "4px" }}>
              Confidence is moderate — a clearer top-down photo would improve accuracy.
            </div>
          )}
        </div>

        {/* Continuous sliders for all ratio-based measurements */}
        <ResultSlider
          label="Forefoot Width"
          value={result.width_ratio}
          min={0.299} max={0.467} avgValue={0.383} avgLabel="Average"
          lowLabel="Narrow" highLabel="Wide"
          lowThresh={0.362} highThresh={0.404}
          description={
            result.width_ratio < 0.362
              ? "Slimmer forefoot — European-lasted shoes tend to fit well. Look for models described as 'narrow.'"
              : result.width_ratio > 0.404
              ? "Wider forefoot — prioritize shoes with generous toe boxes. Lace closures give extra adjustability."
              : "Average width — most shoes should fit well. You have the widest selection available."
          }
        />

        <ResultSlider
          label="Instep Ratio"
          value={result.instep_ratio}
          min={0.163} max={0.307} avgValue={0.235} avgLabel="Standard"
          lowLabel="Low Volume" highLabel="High Volume"
          lowThresh={0.217} highThresh={0.253}
          description={
            result.instep_ratio < 0.217
              ? "Flat instep profile — look for women's or LV (low-volume) models for the best fit. Standard shoes may gap above the forefoot."
              : result.instep_ratio > 0.253
              ? "Pronounced instep — avoid snug LV models. Shoes with generous forefoot depth will be more comfortable."
              : "Standard volume — most unisex shoes will accommodate your instep well."
          }
        />

        <ResultSlider
          label="Heel Width"
          value={result.heel_ratio}
          min={0.491} max={0.819} avgValue={0.655} avgLabel="Medium"
          lowLabel="Narrow" highLabel="Wide"
          lowThresh={0.614} highThresh={0.696}
          description={
            result.heel_ratio < 0.614
              ? "Narrow heel relative to forefoot — classic 'fin shape.' You may experience heel slip in standard shoes. Prioritize shoes with snug heel cups."
              : result.heel_ratio > 0.696
              ? "Broad heel — lace-up closures give the most adjustability. Avoid shoes with very narrow heel cups."
              : "Proportional heel — standard heel cups should work well across most models."
          }
        />

        <ResultSlider
          label="Toe Length"
          value={result.arch_ratio}
          min={0.66} max={0.86} avgValue={0.760} avgLabel="Average"
          lowLabel="Short toes" highLabel="Long toes"
          lowThresh={0.735} highThresh={0.785}
          description={
            result.arch_ratio < 0.735
              ? "Your toes are shorter than average. Shoes with a standard or rearward flex point will align better with your natural bend."
              : result.arch_ratio > 0.785
              ? "Your toes are longer than average. Look for shoes with a forward flex point — the shoe should bend where your foot naturally bends."
              : "Average proportion — most shoes will flex in the right spot for your foot."
          }
        />

        {/* AI notes */}
        {result.notes && (
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
            padding: "12px 14px", display: "flex", gap: "10px", alignItems: "flex-start",
            marginBottom: "20px",
          }}>
            <span style={{ fontSize: "14px", flexShrink: 0 }}>{"\uD83E\uDD16"}</span>
            <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.5 }}>
              <strong style={{ color: T.text, fontWeight: 600 }}>AI note:</strong> {result.notes}
            </div>
          </div>
        )}

        {/* Confidence */}
        <div style={{
          fontSize: "11px", color: T.muted, marginBottom: "24px",
          display: "flex", alignItems: "center", gap: "6px",
        }}>
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: result.confidence === "high" ? T.green : result.confidence === "medium" ? T.yellow : T.red,
          }} />
          Analysis confidence: {result.confidence}
          {result.confidence !== "high" && " — better lighting or angle may improve accuracy"}
        </div>

        {/* CTAs */}
        <div style={{
          display: "flex", flexDirection: isMobile ? "column" : "row",
          gap: "10px", marginBottom: "20px",
        }}>
          <button onClick={goToFinder} style={{
            padding: "14px 28px", borderRadius: T.radiusSm, fontFamily: T.font,
            fontSize: "15px", fontWeight: 700, cursor: "pointer", border: "none",
            background: `linear-gradient(135deg, ${T.accent}, #d4613a)`,
            color: "#fff", boxShadow: `0 4px 16px ${T.accent}40`,
            transition: "all 0.2s", textAlign: "center", width: isMobile ? "100%" : "auto",
          }}>
            Find matching shoes {"\u2192"}
          </button>
          <Btn onClick={() => {
            setStep(0); setPhotoStep(0);
            setPhotos({ top: null, side: null, heel: null });
            setPreviews({ top: null, side: null, heel: null });
            setResult(null);
          }} primary={false}>Scan again</Btn>
        </div>

        <div style={{
          fontSize: "11px", color: T.muted, lineHeight: 1.5,
          borderTop: `1px solid ${T.border}`, paddingTop: "14px",
        }}>
          AI-powered estimate based on photos. For the most accurate fit, try shoes on in person.
          Foot shape is one factor — climbing style and preference matter too.
        </div>
      </Wrap>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 5 — Foot not recognized / low confidence → retry
  // ═══════════════════════════════════════════════════════════
  if (step === 5) return (
    <Wrap narrow>
      <div style={{ textAlign: "center", paddingTop: isMobile ? "32px" : "60px" }}>
        <div style={{
          width: "72px", height: "72px", borderRadius: "50%",
          background: `${T.red}12`, margin: "0 auto 20px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "32px",
        }}>{"\u{1F9B6}"}</div>

        <h2 style={{
          fontSize: isMobile ? "22px" : "26px", fontWeight: 700,
          color: T.text, marginBottom: "10px", lineHeight: 1.3,
        }}>We couldn't recognize your foot</h2>

        <p style={{
          fontSize: "14px", color: T.muted, lineHeight: 1.6,
          maxWidth: "400px", margin: "0 auto 24px",
        }}>
          The photos didn't contain a clear enough view of a bare foot for us to analyze.
          This can happen with poor lighting, unusual angles, or if the foot isn't fully visible.
        </p>

        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
          padding: isMobile ? "16px" : "20px 24px", textAlign: "left", marginBottom: "28px",
          maxWidth: "400px", margin: "0 auto 28px",
        }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: T.text, marginBottom: "12px" }}>Tips for better results</div>
          {[
            "Stand barefoot on a flat, contrasting surface",
            "Make sure the entire foot is visible in each photo",
            "Use good, even lighting — avoid harsh shadows",
            "Follow the angle instructions for each shot carefully",
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "7px", fontSize: "13px", color: T.muted }}>
              <span style={{ color: T.accent, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>{t}
            </div>
          ))}
        </div>

        <Btn onClick={() => {
          setStep(2); setPhotoStep(0);
          setPhotos({ top: null, side: null, heel: null });
          setPreviews({ top: null, side: null, heel: null });
          setResult(null); setError(null);
        }} full={isMobile}>Try again with new photos</Btn>

        <div style={{ fontSize: "11px", color: T.muted, marginTop: "14px", lineHeight: 1.5 }}>
          Photos are analyzed in real-time and never stored.
        </div>
      </div>
    </Wrap>
  );

  return null;
}
