import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { T } from "./tokens.js";
import useIsMobile from "./useIsMobile.js";
import usePageMeta from "./usePageMeta.js";

// ═══════════════════════════════════════════════════════════════
// GUIDED SHOE FINDER — 5-step wizard with scoring algorithm
// Source: shoe-finder-proposal.html v2 (approved design)
// ═══════════════════════════════════════════════════════════════

// ─── Constants ────────────────────────────────────────────────
const DISCIPLINES = [
  { id: "boulder",        icon: "🪨", title: "Bouldering",       desc: "Short powerful problems, overhangs, toe & heel hooks." },
  { id: "sport",          icon: "🧗", title: "Sport Climbing",   desc: "Bolted routes, endurance, small footholds on vertical to steep." },
  { id: "trad_multipitch",icon: "⛰️", title: "Trad / Multipitch", desc: "Long routes, crack climbing, all-day comfort matters." },
  { id: "indoor",         icon: "🏢", title: "Gym / Indoor",     desc: "Indoor walls, mixed holds, easy on/off between climbs." },
];

const LEVELS = [
  { id: "beginner",     icon: "🌱", title: "Beginner",     desc: "Under 1 year. Still learning footwork and building foot strength." },
  { id: "intermediate", icon: "📈", title: "Intermediate", desc: "1–3 years. Solid technique, ready for more precision." },
  { id: "advanced",     icon: "⚡", title: "Advanced",     desc: "3+ years. Projecting hard, need maximum performance." },
];

const FOOT_SHAPES = [
  { id: "standard", icon: "👟", title: "Standard",          desc: "Average width, standard arch and instep. The most options live here." },
  { id: "low",      icon: "👠", title: "Low Volume",        desc: "Narrow heel, low instep, slim forefoot. Women's & LV models." },
  { id: "wide",     icon: "🦶", title: "Wide / High Volume", desc: "Wide forefoot, high arch. Fewer shoes, but the right fit matters most." },
];

// Downturn ranges by level (which downturns are eligible + primary preference)
const DOWNTURN_RANGES = {
  beginner:     { eligible: ["flat", "moderate"],               primary: "flat" },
  intermediate: { eligible: ["flat", "moderate", "aggressive"], primary: "moderate" },
  advanced:     { eligible: ["flat", "moderate", "aggressive"], primary: "aggressive" },
};

// Midsole base target by discipline
const MIDSOLE_BASE = {
  trad_multipitch: 2,  // stiff: full
  sport: 1,            // medium: partial
  boulder: 0.5,        // medium-soft: partial/none
  indoor: 0,           // soft: none
};

const MIDSOLE_NAMES = { none: 0, partial: 1, full: 2 };
const MIDSOLE_LABELS = ["none", "partial", "full"];

// ─── Scoring Engine ───────────────────────────────────────────

function computeTargetDownturn(level, preference) {
  // preference is 0 (comfort) to 100 (performance)
  const range = DOWNTURN_RANGES[level] || DOWNTURN_RANGES.intermediate;
  const eligible = range.eligible;
  // Map preference 0–100 to index in eligible array
  const idx = Math.min(eligible.length - 1, Math.floor((preference / 100) * eligible.length));
  return eligible[Math.max(0, idx)];
}

function computeTargetAsymmetry(preference) {
  if (preference < 33) return "none";
  if (preference < 66) return "slight";
  return "strong";
}

function computeTargetMidsole(disciplines, weightKg) {
  if (!disciplines.length) return 1; // default partial
  // Average base from selected disciplines
  let base = disciplines.reduce((sum, d) => sum + (MIDSOLE_BASE[d] ?? 1), 0) / disciplines.length;
  // Weight modifier
  if (weightKg < 60) base -= 0.5;       // shift softer
  else if (weightKg > 85) base += 0.5;  // shift stiffer
  return Math.max(0, Math.min(2, Math.round(base)));
}

function computeTargetRubber(disciplines, weightKg) {
  // Base rubber thickness preferences
  let base = 3.5;
  if (disciplines.includes("trad_multipitch")) base = 4.5;
  if (disciplines.includes("boulder")) base = Math.min(base, 3.5);
  if (disciplines.includes("indoor")) base = Math.min(base, 3);
  if (weightKg > 85) base += 0.5;
  if (weightKg < 60) base -= 0.3;
  return base;
}

function scoreShoe(shoe, { disciplines, level, preference, footShape, weightKg }) {
  let score = 0;

  // 1. Discipline match (40 pts) — hard filter + score
  const useCases = Array.isArray(shoe.use_cases) ? shoe.use_cases :
    (typeof shoe.use_cases === "string" ? safeParseJSON(shoe.use_cases) : []);
  // Map "indoor" → check for "indoor" or "gym" in use_cases
  const disciplineAliases = {
    indoor: ["indoor", "gym"],
    boulder: ["boulder", "bouldering"],
    sport: ["sport", "sport_climbing"],
    trad_multipitch: ["trad_multipitch", "trad", "multipitch"],
  };
  if (disciplines.length > 0) {
    let matches = 0;
    for (const d of disciplines) {
      const aliases = disciplineAliases[d] || [d];
      if (aliases.some(a => useCases.some(uc => uc.toLowerCase().includes(a)))) {
        matches++;
      }
    }
    if (matches === 0) return null; // hard filter: must match at least 1 discipline
    score += (matches / disciplines.length) * 40;
  } else {
    score += 20; // no discipline selected, neutral
  }

  // 2. Downturn fit (25 pts)
  const targetDownturn = computeTargetDownturn(level, preference);
  const shoeDownturn = (shoe.downturn || "").toLowerCase();
  const dtOrder = ["flat", "moderate", "aggressive"];
  const targetIdx = dtOrder.indexOf(targetDownturn);
  const shoeIdx = dtOrder.indexOf(shoeDownturn);
  if (targetIdx >= 0 && shoeIdx >= 0) {
    const dist = Math.abs(targetIdx - shoeIdx);
    if (dist === 0) score += 25;
    else if (dist === 1) score += 15;
    else score += 5;
  } else {
    score += 10; // unknown downturn, partial credit
  }

  // 3. Stiffness / midsole fit (15 pts)
  const targetMidsole = computeTargetMidsole(disciplines, weightKg);
  const shoeMidsole = MIDSOLE_NAMES[shoe.midsole?.toLowerCase()] ?? 1;
  const midsoleDist = Math.abs(targetMidsole - shoeMidsole);
  if (midsoleDist === 0) score += 15;
  else if (midsoleDist === 1) score += 8;
  else score += 2;

  // 4. Volume match (10 pts) — hard filter (relaxable)
  // Skip volume scoring here — it's applied as a hard filter in the main function
  score += 10; // placeholder; volume filtering happens before scoring

  // 5. Rubber thickness fit (10 pts)
  const targetRubber = computeTargetRubber(disciplines, weightKg);
  const shoeRubber = shoe.rubber_thickness_mm;
  if (shoeRubber) {
    const rubberDist = Math.abs(shoeRubber - targetRubber);
    if (rubberDist <= 0.5) score += 10;
    else if (rubberDist <= 1) score += 7;
    else score += 3;
  } else {
    score += 5; // unknown rubber, partial credit
  }

  // Asymmetry bonus (up to 5 pts bonus)
  const targetAsym = computeTargetAsymmetry(preference);
  const shoeAsym = (shoe.asymmetry || "").toLowerCase();
  const asymOrder = ["none", "slight", "strong"];
  const asymTargetIdx = asymOrder.indexOf(targetAsym);
  const asymShoeIdx = asymOrder.indexOf(shoeAsym);
  if (asymTargetIdx >= 0 && asymShoeIdx >= 0) {
    const asymDist = Math.abs(asymTargetIdx - asymShoeIdx);
    if (asymDist === 0) score += 5;
    else if (asymDist === 1) score += 2;
  }

  return Math.round(score);
}

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return []; }
}

// ─── Volume filter helper ─────────────────────────────────────
function matchesVolume(shoe, footShape) {
  if (!footShape) return true;
  const vol = (shoe.volume || "").toLowerCase();
  const gender = (shoe.gender || "").toLowerCase();
  if (footShape === "standard") {
    return vol !== "low" || gender === "unisex";
  }
  if (footShape === "low") {
    return vol === "low" || gender === "women" || gender === "womens";
  }
  if (footShape === "wide") {
    return vol === "high" || vol === "wide";
  }
  return true;
}

// ─── URL encode/decode params ─────────────────────────────────
function encodeFinderState(state) {
  const p = new URLSearchParams();
  if (state.disciplines.length) p.set("d", state.disciplines.join(","));
  if (state.level) p.set("l", state.level);
  if (state.preference !== 50) p.set("p", String(state.preference));
  if (state.footShape) p.set("f", state.footShape);
  if (state.weightKg !== 70) p.set("w", String(state.weightKg));
  return p.toString();
}

function decodeFinderState(search) {
  const p = new URLSearchParams(search);
  return {
    disciplines: p.get("d") ? p.get("d").split(",").filter(Boolean) : [],
    level: p.get("l") || "intermediate",
    preference: p.has("p") ? Number(p.get("p")) : 50,
    footShape: p.get("f") || "",
    weightKg: p.has("w") ? Number(p.get("w")) : 70,
  };
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ShoeFinder({ shoes = [] }) {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [step, setStep] = useState(0);
  const [disciplines, setDisciplines] = useState([]);
  const [level, setLevel] = useState("intermediate");
  const [preference, setPreference] = useState(50);
  const [footShape, setFootShape] = useState("");
  const [weightKg, setWeightKg] = useState(70);
  const [brandFilter, setBrandFilter] = useState("all");
  const [closureFilter, setClosureFilter] = useState("all");
  const [showAllResults, setShowAllResults] = useState(false);

  // Restore from URL on mount
  useEffect(() => {
    const s = decodeFinderState(searchParams.toString());
    if (s.disciplines.length) setDisciplines(s.disciplines);
    if (s.level) setLevel(s.level);
    if (s.preference !== 50) setPreference(s.preference);
    if (s.footShape) setFootShape(s.footShape);
    if (s.weightKg !== 70) setWeightKg(s.weightKg);
    // If URL has params, jump to results
    if (s.disciplines.length && s.footShape) setStep(5);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // SEO
  usePageMeta({
    title: "Climbing Shoe Finder — Find Your Perfect Shoe | climbing-gear.com",
    description: "Answer 5 questions and our algorithm matches you with the best climbing shoes from 339+ models. No opinions, just data.",
  });

  // ─── Computed results ─────────────────────────────────────
  const params = useMemo(() => ({
    disciplines, level, preference, footShape, weightKg,
  }), [disciplines, level, preference, footShape, weightKg]);

  const allResults = useMemo(() => {
    const filtered = shoes
      .filter(s => matchesVolume(s, footShape))
      .map(s => {
        const sc = scoreShoe(s, params);
        return sc !== null ? { shoe: s, score: sc } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return filtered;
  }, [shoes, params, footShape]);

  // Apply brand/closure filters
  const filteredResults = useMemo(() => {
    let r = allResults;
    if (brandFilter !== "all") r = r.filter(x => x.shoe.brand === brandFilter);
    if (closureFilter !== "all") r = r.filter(x => (x.shoe.closure || "").toLowerCase() === closureFilter);
    return r;
  }, [allResults, brandFilter, closureFilter]);

  // Count shoes matching after each step (for live counter)
  const matchCount = useMemo(() => {
    if (step < 5) {
      // Show how many shoes match current selections (before volume)
      return shoes.filter(s => {
        const sc = scoreShoe(s, params);
        return sc !== null;
      }).length;
    }
    return allResults.length;
  }, [shoes, params, step, allResults]);

  // Brand counts
  const brandCounts = useMemo(() => {
    const counts = {};
    for (const { shoe } of allResults) {
      counts[shoe.brand] = (counts[shoe.brand] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [allResults]);

  // Closure counts
  const closureCounts = useMemo(() => {
    const counts = {};
    for (const { shoe } of allResults) {
      const c = (shoe.closure || "unknown").toLowerCase();
      counts[c] = (counts[c] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allResults]);

  // Target specs for conclusion
  const targetDownturn = computeTargetDownturn(level, preference);
  const targetAsymmetry = computeTargetAsymmetry(preference);
  const targetMidsole = MIDSOLE_LABELS[computeTargetMidsole(disciplines, weightKg)];
  const targetRubber = computeTargetRubber(disciplines, weightKg).toFixed(1);

  // Update URL when step completes
  const updateURL = useCallback(() => {
    const qs = encodeFinderState({ disciplines, level, preference, footShape, weightKg });
    setSearchParams(qs, { replace: true });
  }, [disciplines, level, preference, footShape, weightKg, setSearchParams]);

  // Navigation
  const nextStep = () => {
    if (step < 5) {
      setStep(step + 1);
      if (step === 4) updateURL(); // Update URL when reaching results
    }
  };
  const prevStep = () => { if (step > 0) setStep(step - 1); };
  const goToStep = (s) => setStep(s);

  // ─── Shared styles ──────────────────────────────────────────
  const accentBorder = "rgba(232,115,74,0.25)";
  const blueSoft = "rgba(96,165,250,0.08)";
  const blueBorder = "rgba(96,165,250,0.2)";
  const greenSoft = "rgba(34,197,94,0.08)";
  const greenBorder = "rgba(34,197,94,0.2)";

  // ─── Sub-components ─────────────────────────────────────────
  const OptionCard = ({ selected, onClick, icon, title, desc, multi }) => (
    <div
      onClick={onClick}
      style={{
        background: selected ? T.accentSoft : T.card,
        border: `1.5px solid ${selected ? T.accent : T.border}`,
        borderRadius: T.radius,
        padding: isMobile ? "14px" : "16px",
        cursor: "pointer",
        transition: "all 0.2s",
        display: "flex", flexDirection: "column", gap: "6px",
        position: "relative",
      }}
    >
      {selected && (
        <div style={{
          position: "absolute", top: "10px", right: "12px",
          width: "20px", height: "20px", borderRadius: "50%",
          background: T.accent, color: "#fff",
          fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700,
        }}>✓</div>
      )}
      <div style={{ fontSize: "22px", lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "-0.2px", color: T.text }}>{title}</div>
      <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.45 }}>{desc}</div>
    </div>
  );

  const Tip = ({ children }) => (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
      padding: "12px 14px", marginTop: "14px", display: "flex", gap: "10px", alignItems: "flex-start",
    }}>
      <span style={{ fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>💡</span>
      <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.5 }}>{children}</div>
    </div>
  );

  const Counter = ({ count }) => (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      background: T.accentSoft, border: `1px solid ${accentBorder}`,
      padding: "6px 14px", borderRadius: "20px",
      fontSize: "13px", fontWeight: 600, color: T.accent, marginTop: "20px",
    }}>
      <span style={{ fontFamily: T.mono, fontSize: "15px" }}>{count}</span> shoes match
    </div>
  );

  const StepNumber = ({ n }) => (
    <div style={{
      fontSize: "11px", fontWeight: 600, color: T.accent,
      letterSpacing: "0.5px", textTransform: "uppercase",
      marginBottom: "8px", fontFamily: T.mono,
    }}>Step {n} of 5</div>
  );

  const NavButtons = ({ canBack = true, canNext = true, nextLabel = "Continue" }) => (
    <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
      {canBack && step > 0 && (
        <button onClick={prevStep} style={{
          padding: "10px 24px", borderRadius: T.radiusSm, fontFamily: T.font,
          fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
          background: "transparent", color: T.muted, border: `1px solid ${T.border}`,
        }}>Back</button>
      )}
      {canNext && (
        <button onClick={nextStep} style={{
          padding: "10px 24px", borderRadius: T.radiusSm, fontFamily: T.font,
          fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
          background: T.accent, color: "#fff", border: "none",
        }}>{nextLabel}</button>
      )}
    </div>
  );

  // ─── Progress bar ───────────────────────────────────────────
  const stepNames = ["Discipline", "Level", "Preference", "Foot", "Weight"];
  const ProgressBar = () => (
    <div style={{ marginBottom: "40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        {stepNames.map((name, i) => (
          <span
            key={name}
            onClick={() => i < step && goToStep(i)}
            style={{
              fontSize: "11px", fontWeight: i === step ? 700 : 500,
              letterSpacing: "0.3px", textTransform: "uppercase",
              color: i < step ? T.accent : i === step ? T.text : "#6b7280",
              cursor: i < step ? "pointer" : "default",
            }}
          >{name}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: "4px" }}>
        {stepNames.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: "3px", borderRadius: "2px",
            background: i < step ? T.accent : i === step ? `linear-gradient(90deg, ${T.accent}, rgba(232,115,74,0.3))` : T.border,
          }} />
        ))}
      </div>
    </div>
  );

  // ─── Step renderers ─────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <StepNumber n={1} />
      <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "6px", color: T.text }}>
        What do you climb?
      </h2>
      <p style={{ fontSize: "13px", color: T.muted, marginBottom: "12px", lineHeight: 1.5 }}>
        Select all that apply — we'll find shoes that cover your mix.
      </p>
      <span style={{
        display: "inline-block", fontSize: "11px", color: T.blue,
        background: blueSoft, border: `1px solid ${blueBorder}`,
        padding: "3px 10px", borderRadius: "12px", marginBottom: "16px", fontWeight: 500,
      }}>Select one or more</span>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
        {DISCIPLINES.map(d => (
          <OptionCard
            key={d.id}
            selected={disciplines.includes(d.id)}
            onClick={() => {
              setDisciplines(prev =>
                prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]
              );
            }}
            icon={d.icon} title={d.title} desc={d.desc} multi
          />
        ))}
      </div>
      <Counter count={matchCount} />
      <Tip>
        Selecting <strong style={{ color: T.text, fontWeight: 600 }}>multiple disciplines</strong> shows
        versatile shoes that work across them. A bouldering + sport combo finds shoes that handle
        both power moves and longer routes.
      </Tip>
      <NavButtons canBack={false} canNext={disciplines.length > 0} />
    </div>
  );

  const renderStep1 = () => (
    <div>
      <StepNumber n={2} />
      <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "6px", color: T.text }}>
        How long have you been climbing?
      </h2>
      <p style={{ fontSize: "13px", color: T.muted, marginBottom: "20px", lineHeight: 1.5 }}>
        This widens or narrows the range of shoe shapes we'll consider. It's not a hard wall — a determined beginner can handle a moderate shoe.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "12px" }}>
        {LEVELS.map(l => (
          <OptionCard
            key={l.id}
            selected={level === l.id}
            onClick={() => setLevel(l.id)}
            icon={l.icon} title={l.title} desc={l.desc}
          />
        ))}
      </div>
      <Counter count={matchCount} />
      {/* Downturn range visual */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        padding: "16px 8px", marginTop: "16px",
        background: T.surface, borderRadius: T.radiusSm, border: `1px solid ${T.border}`,
      }}>
        {["Flat", "Moderate", "Aggressive"].map((label, i) => {
          const range = DOWNTURN_RANGES[level];
          const key = label.toLowerCase();
          const isEligible = range.eligible.includes(key);
          const isPrimary = range.primary === key;
          return (
            <div key={label} style={{ textAlign: "center", flex: 1 }}>
              <svg width="60" height="28" viewBox="0 0 60 28">
                <path
                  d={i === 0 ? "M4 24 Q14 24 28 23 Q46 22 56 22" :
                     i === 1 ? "M4 24 Q14 22 28 18 Q46 14 56 18" :
                              "M4 24 Q14 18 28 10 Q46 4 56 12"}
                  fill="none"
                  stroke={isPrimary ? T.accent : isEligible ? T.muted : "#333"}
                  strokeWidth="2.5" strokeLinecap="round"
                />
              </svg>
              <div style={{
                fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.3px",
                color: isPrimary ? T.accent : isEligible ? T.text : "#444",
                fontWeight: isPrimary ? 600 : 400,
              }}>{label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "10px 20px 0" }}>
        <div style={{ flex: 1, height: "1px", background: T.accent }} />
        <span style={{ fontSize: "10px", color: T.accent, fontWeight: 600, padding: "0 10px", whiteSpace: "nowrap" }}>
          {level.charAt(0).toUpperCase() + level.slice(1)} range
        </span>
        <div style={{ flex: 1, height: "1px", background: T.accent }} />
      </div>
      <Tip>
        Experience sets the <strong style={{ color: T.text, fontWeight: 600 }}>downturn range</strong>, not a
        single value. The next step (comfort vs. performance) determines where within that range you land.
      </Tip>
      <NavButtons />
    </div>
  );

  const renderStep2 = () => {
    // Compute live description from preference
    const dt = computeTargetDownturn(level, preference);
    const asym = computeTargetAsymmetry(preference);
    const descriptions = {
      flat:       { label: "Flat, symmetric", sub: "Maximum comfort for long sessions and all-day wear" },
      moderate:   { label: "Moderate downturn, slight asymmetry", sub: "Good edging precision with reasonable comfort for 30+ minute sessions" },
      aggressive: { label: "Aggressive downturn, strong asymmetry", sub: "Maximum power on small holds and steep terrain" },
    };
    const desc = descriptions[dt] || descriptions.moderate;

    return (
      <div>
        <StepNumber n={3} />
        <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "6px", color: T.text }}>
          Comfort or performance?
        </h2>
        <p style={{ fontSize: "13px", color: T.muted, marginBottom: "20px", lineHeight: 1.5 }}>
          This is the single biggest trade-off in climbing shoes. Drag the slider to set your preference — it determines the shoe shape we target within your experience range.
        </p>

        <div style={{
          background: T.card, border: `1.5px solid ${T.border}`, borderRadius: T.radius, padding: "20px 24px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "11px", color: T.green, fontWeight: 600 }}>☁️ COMFORT</span>
            <span style={{ fontSize: "11px", color: T.accent, fontWeight: 600 }}>🎯 PERFORMANCE</span>
          </div>
          <div style={{ padding: "12px 0" }}>
            <input
              type="range" min="0" max="100" value={preference}
              onChange={e => setPreference(Number(e.target.value))}
              style={{ width: "100%", accentColor: T.accent, height: "6px" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: T.green }}>All-day</div>
              <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>Flat, symmetric</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: T.muted }}>Balanced</div>
              <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>Comfort + precision</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: T.accent }}>Send mode</div>
              <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>Power on small holds</div>
            </div>
          </div>

          <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: "12px", color: T.muted }}>At this setting, you'll see:</div>
            <div style={{ fontSize: "13px", color: T.text, fontWeight: 600, marginTop: "4px" }}>
              {desc.label}
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
              {desc.sub}
            </div>
          </div>
        </div>

        <Counter count={matchCount} />
        <Tip>
          <strong style={{ color: T.text, fontWeight: 600 }}>{level.charAt(0).toUpperCase() + level.slice(1)} + {preference > 60 ? "performance-leaning" : preference < 40 ? "comfort-leaning" : "balanced"}</strong>
          {" "}
          {level === "beginner" && preference > 60 ? "gets you a moderate shoe — ambitious but manageable if you're committed to progressing quickly." :
           level === "intermediate" && preference > 60 ? "unlocks moderate-to-aggressive shoes — great for projecting hard boulders while still being able to warm up comfortably." :
           "gives you a balanced shoe that matches your current climbing style."}
        </Tip>
        <NavButtons />
      </div>
    );
  };

  const renderStep3 = () => (
    <div>
      <StepNumber n={4} />
      <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "6px", color: T.text }}>
        What fits your foot?
      </h2>
      <p style={{ fontSize: "13px", color: T.muted, marginBottom: "20px", lineHeight: 1.5 }}>
        Climbing shoes come in different volumes. This is about foot shape, not gender — pick the silhouette that matches your foot.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "12px" }}>
        {FOOT_SHAPES.map(f => (
          <OptionCard
            key={f.id}
            selected={footShape === f.id}
            onClick={() => setFootShape(f.id)}
            icon={f.icon} title={f.title} desc={f.desc}
          />
        ))}
      </div>
      <Counter count={matchCount} />
      <Tip>
        <strong style={{ color: T.text, fontWeight: 600 }}>Not sure?</strong> If rental shoes always feel baggy in the heel, try Low Volume. If your toes get crushed but the heel is fine, try Wide. Standard works for most people.
      </Tip>
      <NavButtons canNext={!!footShape} />
    </div>
  );

  const renderStep4 = () => {
    const zone = weightKg < 60 ? "light" : weightKg > 85 ? "heavy" : "medium";
    const disciplineLabel = disciplines.map(d => {
      const found = DISCIPLINES.find(x => x.id === d);
      return found ? found.title.split(" ")[0] : d;
    }).join(" + ") || "General";

    return (
      <div>
        <StepNumber n={5} />
        <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "6px", color: T.text }}>
          How much do you weigh?
        </h2>
        <p style={{ fontSize: "13px", color: T.muted, marginBottom: "20px", lineHeight: 1.5 }}>
          This fine-tunes our stiffness recommendation. Heavier climbers benefit from stiffer soles for edge support; lighter climbers can get away with softer, more sensitive shoes.
        </p>

        <div style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: T.radius, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "8px" }}>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>45 kg</span>
            <input
              type="range" min="45" max="110" value={weightKg}
              onChange={e => setWeightKg(Number(e.target.value))}
              style={{ flex: 1, accentColor: T.accent, height: "6px" }}
            />
            <span style={{
              fontFamily: T.mono, fontSize: "15px", fontWeight: 600,
              color: T.accent, minWidth: "55px", textAlign: "right",
            }}>{weightKg} kg</span>
          </div>

          <div style={{ display: "flex", marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${T.border}` }}>
            {[
              { label: "Light", range: "< 60 kg", active: zone === "light" },
              { label: "Medium", range: "60 – 85 kg", active: zone === "medium" },
              { label: "Heavy", range: "> 85 kg", active: zone === "heavy" },
            ].map(z => (
              <div key={z.label} style={{
                textAlign: "center", flex: 1, padding: "6px 0",
                background: z.active ? T.accentSoft : "transparent",
                borderRadius: T.radiusXs,
              }}>
                <div style={{
                  fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.3px",
                  color: z.active ? T.accent : "#6b7280", fontWeight: z.active ? 600 : 400,
                }}>{z.label}</div>
                <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>{z.range}</div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: "14px", padding: "10px 14px",
            background: T.surface, borderRadius: T.radiusSm, border: `1px solid ${T.border}`,
            fontSize: "12px", color: T.muted, lineHeight: 1.5,
          }}>
            Based on your selections (<strong style={{ color: T.text }}>{disciplineLabel}</strong>,{" "}
            <strong style={{ color: T.text }}>{level}</strong>,{" "}
            <strong style={{ color: T.text }}>{weightKg} kg</strong>):<br />
            <span style={{ color: T.accent, fontWeight: 700 }}>→</span> {targetMidsole.charAt(0).toUpperCase() + targetMidsole.slice(1)} midsole preferred<br />
            <span style={{ color: T.accent, fontWeight: 700 }}>→</span> ~{targetRubber}mm rubber sweet spot
          </div>
        </div>

        <Tip>
          <strong style={{ color: T.text, fontWeight: 600 }}>How weight interacts with discipline:</strong> A 90 kg trad climber needs a very stiff shoe to stand on edges all day.
          A 55 kg trad climber can use a moderately stiff shoe. Weight shifts the stiffness dial — it doesn't override your other preferences.
        </Tip>
        <NavButtons nextLabel="Show results →" />
      </div>
    );
  };

  // ─── Results view (step 5) ──────────────────────────────────
  const renderResults = () => {
    const disciplineLabel = disciplines.map(d => {
      const found = DISCIPLINES.find(x => x.id === d);
      return found ? found.title : d;
    }).join(" + ") || "General climbing";

    const displayResults = showAllResults ? filteredResults : filteredResults.slice(0, 10);

    return (
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "20px", color: T.text }}>
          Your recommendation
        </h2>

        {/* Conclusion card */}
        <div style={{
          background: T.card, border: `1.5px solid ${accentBorder}`,
          borderRadius: T.radius, padding: "24px", marginBottom: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{ fontSize: "28px" }}>🎯</div>
            <div>
              <div style={{ fontSize: "17px", fontWeight: 700, letterSpacing: "-0.3px", color: T.text }}>
                {targetDownturn.charAt(0).toUpperCase() + targetDownturn.slice(1)}, {footShape === "low" ? "low-volume" : footShape === "wide" ? "high-volume" : "standard"}, {targetMidsole}-midsole shoe
              </div>
              <div style={{ fontSize: "12px", color: T.muted, marginTop: "2px" }}>
                For {disciplineLabel.toLowerCase()} at {level} level
              </div>
            </div>
          </div>

          <div style={{ fontSize: "13px", color: T.muted, lineHeight: 1.65 }}>
            Based on your answers, you need a shoe with <strong style={{ color: T.text, fontWeight: 600 }}>{targetDownturn} downturn</strong>
            {targetDownturn === "flat" && " — maximum comfort and a natural foot position, ideal for long sessions and building technique."}
            {targetDownturn === "moderate" && " — enough curve for precision on small holds without the pain of an aggressive shoe."}
            {targetDownturn === "aggressive" && " — maximum power on small holds, overhangs, and steep terrain."}
            {" "}Your <strong style={{ color: T.text, fontWeight: 600 }}>{preference > 60 ? "performance-leaning" : preference < 40 ? "comfort-leaning" : "balanced"}</strong> preference
            {preference > 60 ? " pushes us toward slight-to-strong asymmetry for better edging." :
             preference < 40 ? " keeps things symmetric for all-day comfort." :
             " targets slight asymmetry — a good middle ground."}
            <br /><br />
            At <strong style={{ color: T.text, fontWeight: 600 }}>{weightKg} kg</strong>, a <strong style={{ color: T.text, fontWeight: 600 }}>{targetMidsole} midsole</strong>
            {targetMidsole === "full" && " gives maximum stiffness for edge support on long routes."}
            {targetMidsole === "partial" && " gives the right balance: enough stiffness for thin edges, flexible enough to feel the rock."}
            {targetMidsole === "none" && " gives maximum sensitivity and flexibility for smearing and feeling the rock."}
            {" "}We're targeting <strong style={{ color: T.text, fontWeight: 600 }}>~{targetRubber}mm rubber</strong> — grippy and durable.
            {footShape && (
              <>
                <br /><br />
                Your <strong style={{ color: T.text, fontWeight: 600 }}>{footShape === "low" ? "low-volume" : footShape === "wide" ? "wide/high-volume" : "standard"}</strong> selection
                {footShape === "low" && " narrows to shoes built on a narrower last — snugger heel, lower instep, slimmer toe box."}
                {footShape === "wide" && " focuses on shoes with wider toe boxes and higher arches."}
                {footShape === "standard" && " keeps the widest selection of shoes available."}
              </>
            )}
          </div>

          <div style={{
            display: "flex", gap: "12px", flexWrap: "wrap",
            marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${T.border}`,
          }}>
            {[
              { label: "Downturn", value: targetDownturn },
              { label: "Asymmetry", value: targetAsymmetry },
              { label: "Midsole", value: targetMidsole },
              { label: "Rubber", value: `~${targetRubber}mm` },
              { label: "Volume", value: footShape || "any" },
            ].map(chip => (
              <div key={chip.label} style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "6px 12px", background: T.surface,
                border: `1px solid ${T.border}`, borderRadius: "20px", fontSize: "12px",
              }}>
                <span style={{ color: "#6b7280" }}>{chip.label}</span>
                <span style={{ color: T.text, fontWeight: 600 }}>{chip.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Results header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: T.text }}>Top matches</h3>
          <Counter count={allResults.length} />
        </div>

        {/* Brand filter chips */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
          <FilterChip label="All brands" active={brandFilter === "all"} onClick={() => setBrandFilter("all")} />
          {brandCounts.map(([brand, count]) => (
            <FilterChip key={brand} label={brand} count={count} active={brandFilter === brand} onClick={() => setBrandFilter(brand)} />
          ))}
        </div>

        {/* Closure filter chips */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          <FilterChip label="All closures" active={closureFilter === "all"} onClick={() => setClosureFilter("all")} />
          {closureCounts.map(([closure, count]) => (
            <FilterChip key={closure} label={closure.charAt(0).toUpperCase() + closure.slice(1)} count={count} active={closureFilter === closure} onClick={() => setClosureFilter(closure)} />
          ))}
        </div>

        {/* Result cards */}
        <div style={{ display: "grid", gap: "10px" }}>
          {displayResults.map(({ shoe, score }, i) => (
            <ResultCard key={shoe.slug} shoe={shoe} score={score} rank={i + 1} />
          ))}
        </div>

        {/* Show more / CTA */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "20px", flexWrap: "wrap" }}>
          {!showAllResults && filteredResults.length > 10 && (
            <button onClick={() => setShowAllResults(true)} style={{
              padding: "10px 24px", borderRadius: T.radiusSm, fontFamily: T.font,
              fontSize: "14px", fontWeight: 600, cursor: "pointer",
              background: "transparent", color: T.muted, border: `1px solid ${T.border}`,
            }}>Show all {filteredResults.length} matches</button>
          )}
          <Link to="/shoes" style={{
            padding: "10px 24px", borderRadius: T.radiusSm, fontFamily: T.font,
            fontSize: "14px", fontWeight: 600, cursor: "pointer", textDecoration: "none",
            background: T.accent, color: "#fff", border: "none",
            display: "inline-flex", alignItems: "center",
          }}>Open full shoe finder →</Link>
        </div>

        {/* Shareable link tip */}
        <Tip>
          <strong style={{ color: T.text, fontWeight: 600 }}>Shareable link:</strong> Your selections are encoded in the URL.
          Send it to your climbing partner or bookmark for later.
        </Tip>

        {/* Edit selections */}
        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <button onClick={() => setStep(0)} style={{
            padding: "8px 20px", borderRadius: T.radiusSm, fontFamily: T.font,
            fontSize: "13px", fontWeight: 500, cursor: "pointer",
            background: "transparent", color: T.muted, border: `1px solid ${T.border}`,
          }}>← Edit my answers</button>
        </div>
      </div>
    );
  };

  // ─── Filter chip sub-component ──────────────────────────────
  const FilterChip = ({ label, count, active, onClick }) => (
    <span
      onClick={onClick}
      style={{
        fontSize: "12px", padding: "6px 14px", borderRadius: "20px",
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentSoft : T.card,
        color: active ? T.accent : T.muted,
        cursor: "pointer", fontFamily: T.font, fontWeight: 500,
        transition: "all 0.2s",
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{ fontFamily: T.mono, fontSize: "10px", marginLeft: "4px", opacity: 0.7 }}>{count}</span>
      )}
    </span>
  );

  // ─── Result card sub-component ──────────────────────────────
  const ResultCard = ({ shoe, score, rank }) => {
    const tagColor = (type) => {
      const colors = {
        downturn: { bg: T.accentSoft, color: T.accent, border: accentBorder },
        closure: { bg: blueSoft, color: T.blue, border: blueBorder },
        weight: { bg: greenSoft, color: T.green, border: greenBorder },
        rubber: { bg: T.purpleSoft, color: T.purple, border: "rgba(167,139,250,0.2)" },
      };
      return colors[type] || colors.downturn;
    };

    return (
      <Link to={`/shoe/${shoe.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
          padding: "14px 18px", display: "flex", alignItems: "center", gap: "14px",
          transition: "all 0.2s", cursor: "pointer",
        }}
          onMouseOver={e => { e.currentTarget.style.borderColor = accentBorder; e.currentTarget.style.background = T.surface; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.card; }}
        >
          <div style={{
            fontFamily: T.mono, fontSize: "13px", fontWeight: rank <= 3 ? 700 : 500,
            color: rank === 1 ? T.accent : rank <= 3 ? T.text : "#6b7280",
            width: "24px", textAlign: "center", flexShrink: 0,
          }}>{rank}</div>

          <div style={{
            width: "56px", height: "56px", borderRadius: T.radiusSm,
            background: T.surface, flexShrink: 0, overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {shoe.image_url ? (
              <img src={shoe.image_url} alt={`${shoe.brand} ${shoe.model}`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                loading="lazy"
              />
            ) : (
              <span style={{ fontSize: "24px" }}>🧗</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {shoe.brand}
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700, margin: "1px 0 5px", letterSpacing: "-0.2px", color: T.text }}>
              {shoe.model}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {shoe.downturn && <Tag type="downturn" c={tagColor("downturn")}>{shoe.downturn}</Tag>}
              {shoe.closure && <Tag type="closure" c={tagColor("closure")}>{shoe.closure}</Tag>}
              {shoe.weight_g && <Tag type="weight" c={tagColor("weight")}>{shoe.weight_g}g</Tag>}
              {shoe.rubber_thickness_mm && <Tag type="rubber" c={tagColor("rubber")}>{shoe.rubber_type ? `${shoe.rubber_type} ` : ""}{shoe.rubber_thickness_mm}mm</Tag>}
            </div>
          </div>

          <div style={{ textAlign: "center", flexShrink: 0, minWidth: "44px" }}>
            <div style={{ fontFamily: T.mono, fontSize: "16px", fontWeight: 700, color: T.accent }}>
              {score}
            </div>
            <div style={{ fontSize: "9px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.3px" }}>Match</div>
          </div>

          <div style={{ color: "#6b7280", fontSize: "16px", flexShrink: 0 }}>›</div>
        </div>
      </Link>
    );
  };

  const Tag = ({ children, c }) => (
    <span style={{
      fontSize: "10px", fontWeight: 600, padding: "2px 7px",
      borderRadius: "4px", letterSpacing: "0.2px",
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>{children}</span>
  );

  // ─── Main render ────────────────────────────────────────────
  return (
    <div style={{
      maxWidth: "720px", margin: "0 auto",
      padding: isMobile ? "24px 16px 120px" : "40px 24px 120px",
      fontFamily: T.font, color: T.text,
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: step < 5 ? "32px" : "24px" }}>
        <h1 style={{
          fontSize: isMobile ? "22px" : "28px", fontWeight: 700,
          letterSpacing: "-0.5px", marginBottom: "8px",
        }}>Find Your Climbing Shoe</h1>
        <p style={{ color: T.muted, fontSize: "15px", maxWidth: "520px", margin: "0 auto" }}>
          5 questions, {shoes.length} shoes, 0 opinions. Tell us how you climb — we'll match you with data.
        </p>
      </div>

      {/* Progress bar (hidden on results) */}
      {step < 5 && <ProgressBar />}

      {/* Steps */}
      {step === 0 && renderStep0()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
      {step === 5 && renderResults()}
    </div>
  );
}
