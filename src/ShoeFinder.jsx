import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { T } from "./tokens.js";
import useIsMobile from "./useIsMobile.js";
import usePageMeta from "./usePageMeta.js";

// ═══════════════════════════════════════════════════════════════
// GUIDED SHOE FINDER — 6-step wizard with trait-based scoring
// Step 1: Discipline (boulder/sport/trad) — multi-select
// Step 2: Environment (outdoor/indoor/both) + rock type if outdoor
// Step 3: Experience level
// Step 4: Preference (comfort/balanced/performance)
// Step 5: Foot shape (toe form, volume, width, heel)
// Step 6: Weight (stiffness bias)
//
// SCORING V2 — Each input defines target traits, then shoes are
// scored against those targets. Total: 100 pts.
//   Discipline use-case match:  20 pts (hard filter)
//   Closure fit:                10 pts (discipline → closure)
//   Environment + rock type:    10 pts
//   Downturn fit:               15 pts (level + preference)
//   Asymmetry fit:              10 pts (level + preference)
//   Midsole / stiffness fit:    15 pts (discipline + weight)
//   Rubber thickness fit:       10 pts (weight + discipline)
//   Foot shape bonuses:         10 pts (toe + width + heel)
// ═══════════════════════════════════════════════════════════════

// ─── Constants ────────────────────────────────────────────────
const DISCIPLINES = [
  { id: "boulder",        icon: "🪨", title: "Bouldering",        desc: "Slipper/velcro, soft & sensitive, full rubber coverage." },
  { id: "sport",          icon: "🧗", title: "Sport Climbing",    desc: "Velcro/lace, mid stiffness, medium-to-full rubber coverage." },
  { id: "trad_multipitch",icon: "⛰️", title: "Trad / Multipitch", desc: "Lace-up, stiff & supportive, full midsole for all-day edging." },
];

const ENVIRONMENTS = [
  { id: "outdoor", icon: "🏔️", title: "Mostly Outdoors",  desc: "Real rock — we'll ask what type to dial in rubber." },
  { id: "indoor",  icon: "🏢", title: "Mostly Indoors",   desc: "Gym walls, plastic holds. Favors soft rubber, easy on/off." },
  { id: "both",    icon: "🔄", title: "Both Equally",     desc: "Split between gym & crag. We'll pick versatile all-rounders." },
];

const ROCK_TYPES = [
  { id: "",          icon: "🤷", title: "Not sure / mixed",   desc: "We'll target medium-hardness rubber that works on most rock." },
  { id: "granite",   icon: "🪨", title: "Granite",            desc: "Coarse, abrasive — needs hard, durable rubber." },
  { id: "limestone", icon: "🏔️", title: "Limestone",          desc: "Sharp pockets & tufas — medium rubber for precision." },
  { id: "sandstone", icon: "🏜️", title: "Sandstone",          desc: "Soft, friction-dependent — soft sticky rubber is key." },
];

const LEVELS = [
  { id: "beginner",     icon: "🌱", title: "Beginner",     desc: "Under 1 year. Still learning footwork and building foot strength." },
  { id: "intermediate", icon: "📈", title: "Intermediate", desc: "1–3 years. Solid technique, ready for more precision." },
  { id: "advanced",     icon: "⚡", title: "Advanced",     desc: "3+ years. Projecting hard, need maximum performance." },
];

const PREFERENCES = [
  { id: "comfort",     icon: "☁️", title: "Comfort",      desc: "All-day wearability, minimal pain. Great for long routes and building technique." },
  { id: "balanced",    icon: "⚖️", title: "Balanced",     desc: "Good precision without sacrificing too much comfort. The sweet spot for most climbers." },
  { id: "performance", icon: "🎯", title: "Performance",  desc: "Maximum power on small holds and steep terrain. You accept the trade-off." },
];

const TOE_FORMS = [
  { id: "",        img: null,                        title: "Not sure / Skip", desc: "We won't filter by toe shape." },
  { id: "egyptian",img: "/images/foot-egyptian.png", title: "Egyptian",        desc: "Big toe longest, then tapers down." },
  { id: "roman",   img: "/images/foot-roman.png",   title: "Roman (Square)",  desc: "First 2–3 toes roughly equal length." },
  { id: "greek",   img: "/images/foot-greek.png",   title: "Greek (Morton's)", desc: "Second toe longest." },
];

const VOLUMES = [
  { id: "",         title: "Not sure / Skip", desc: "We'll show all forefoot volumes." },
  { id: "standard", title: "Standard",         desc: "Average forefoot depth — widest selection." },
  { id: "low",      title: "Low",              desc: "Flat forefoot, low instep. Women's & LV models." },
  { id: "high",     title: "High",             desc: "Deep forefoot, high arch." },
];

const WIDTHS = [
  { id: "",       title: "Not sure" },
  { id: "narrow", title: "Narrow" },
  { id: "medium", title: "Medium" },
  { id: "wide",   title: "Wide" },
];

const HEEL_VOLUMES = [
  { id: "",       title: "Not sure" },
  { id: "narrow", title: "Narrow" },
  { id: "medium", title: "Medium" },
  { id: "wide",   title: "Wide" },
];

// ─── Target Trait Computation ──────────────────────────────────

// Discipline → preferred closure types
const CLOSURE_PREFS = {
  boulder: ["slipper", "velcro"],
  sport: ["velcro", "lace"],
  trad_multipitch: ["lace"],
};

// Discipline → midsole base (0=none, 1=partial, 2=full)
const MIDSOLE_BASE = {
  boulder: 0.5,         // soft/sensitive: partial or none
  sport: 1,             // mid: partial
  trad_multipitch: 2,   // stiff: full
};

const MIDSOLE_NAMES = { none: 0, partial: 1, full: 2 };
const MIDSOLE_LABELS = ["none", "partial", "full"];

// Level + Preference → numeric value for downturn/asymmetry
const LEVEL_NUM = { beginner: 0, intermediate: 1, advanced: 2 };
const PREF_NUM = { comfort: 0, balanced: 1, performance: 2 };
const DOWNTURN_ORDER = ["flat", "moderate", "aggressive"]; // DB values, indices 0-2
const ASYM_ORDER = ["none", "slight", "strong"];           // DB values, indices 0-2

// 5-tier system: level (0-2) + preference (0-2) = sum (0-4)
// sum 0 → zero, 1 → slight, 2 → moderate, 3 → high, 4 → ultra
const TIER_NAMES = ["zero", "slight", "moderate", "high", "ultra"];

// Fractional index into DB scale (0-2) — used for scoring distance
const TIER_DOWNTURN_IDX  = [0, 0.5, 1, 1.5, 2]; // zero→flat(0), slight→0.5, moderate→mod(1), high→1.5, ultra→agg(2)
const TIER_ASYMMETRY_IDX = [0, 0.5, 1, 1.5, 2]; // zero→none(0), slight→0.5, moderate→slight(1), high→1.5, ultra→strong(2)

// Human-readable labels for display
const TIER_DOWNTURN_LABEL = {
  zero: "flat",
  slight: "flat–moderate",
  moderate: "moderate",
  high: "moderate–aggressive",
  ultra: "aggressive",
};
const TIER_ASYMMETRY_LABEL = {
  zero: "none",
  slight: "none–slight",
  moderate: "slight",
  high: "slight–strong",
  ultra: "strong",
};

function combinedTier(level, preference) {
  const sum = (LEVEL_NUM[level] ?? 1) + (PREF_NUM[preference] ?? 1);
  return TIER_NAMES[Math.min(sum, 4)];
}

function computeTargetDownturn(level, preference) {
  return combinedTier(level, preference);
}

function computeTargetAsymmetry(level, preference) {
  return combinedTier(level, preference);
}

// Fractional index for scoring — maps tier to 0-2 scale
function downturnTargetIdx(level, preference) {
  const sum = (LEVEL_NUM[level] ?? 1) + (PREF_NUM[preference] ?? 1);
  return TIER_DOWNTURN_IDX[Math.min(sum, 4)];
}
function asymmetryTargetIdx(level, preference) {
  const sum = (LEVEL_NUM[level] ?? 1) + (PREF_NUM[preference] ?? 1);
  return TIER_ASYMMETRY_IDX[Math.min(sum, 4)];
}

function computeTargetMidsole(disciplines, weightKg) {
  if (!disciplines.length) return 1;
  let base = disciplines.reduce((sum, d) => sum + (MIDSOLE_BASE[d] ?? 1), 0) / disciplines.length;
  if (weightKg < 60) base -= 0.5;
  else if (weightKg > 85) base += 0.5;
  return Math.max(0, Math.min(2, Math.round(base)));
}

function computeTargetRubberThickness(disciplines, weightKg) {
  let base = 3.5;
  if (disciplines.includes("trad_multipitch")) base = 4.5;
  if (disciplines.includes("boulder")) base = Math.min(base, 3.5);
  if (weightKg > 85) base += 0.5;
  if (weightKg < 60) base -= 0.3;
  return base;
}

// Preferred closures for a discipline set
function computeTargetClosures(disciplines) {
  const set = new Set();
  for (const d of disciplines) {
    for (const c of (CLOSURE_PREFS[d] || [])) set.add(c);
  }
  return set.size ? [...set] : ["velcro", "lace"];
}

// ─── Helpers ───────────────────────────────────────────────────
function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return []; }
}
function parseArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") return safeParseJSON(val);
  return [];
}

const TOTAL_STEPS = 6;

// ─── Scoring Engine V2 ─────────────────────────────────────────

function scoreShoe(shoe, { disciplines, environment, rockType, level, preference, forefootVolume, toeForm, width, heelVolume, weightKg,
  downturnTierOvr, asymmetryTierOvr, closureOvr, midsoleOvr, rubberOvr, envOvr }) {
  let score = 0;

  // ── 1. Discipline use-case match (20 pts) — HARD FILTER ──
  const useCases = parseArray(shoe.use_cases);
  const disciplineAliases = {
    boulder: ["boulder", "bouldering"],
    sport: ["sport", "sport_climbing"],
    trad_multipitch: ["trad_multipitch", "trad", "multipitch"],
  };
  if (disciplines.length > 0) {
    let matches = 0;
    for (const d of disciplines) {
      const aliases = disciplineAliases[d] || [d];
      if (aliases.some(a => useCases.some(uc => uc.toLowerCase().includes(a)))) matches++;
    }
    if (matches === 0) return null; // EXCLUDED
    score += (matches / disciplines.length) * 20;
  } else {
    score += 10;
  }

  // ── 2. Closure fit (10 pts) — discipline → preferred closure ──
  const targetClosures = closureOvr || computeTargetClosures(disciplines);
  const shoeClosure = (shoe.closure || "").toLowerCase();
  if (targetClosures.includes(shoeClosure)) {
    score += 10;
  } else if (shoeClosure) {
    // Adjacent: e.g. user wants velcro but shoe is lace → partial credit
    score += 4;
  } else {
    score += 5; // no data
  }

  // ── 3. Environment + Rock type (10 pts) ──
  const effEnv = envOvr || environment;
  const bestRock = parseArray(shoe.best_rock_types).map(r => r.toLowerCase());
  if (effEnv === "indoor") {
    // Indoor: favor shoes with indoor tags, soft rubber shoes
    if (bestRock.some(r => r.includes("indoor"))) score += 10;
    else if (!bestRock.length) score += 5;
    else score += 3;
  } else if (effEnv === "outdoor") {
    // Outdoor: remove indoor-specific shoes (soft filter — lower score, not hard exclude)
    const isIndoorOnly = bestRock.length > 0 && bestRock.every(r => r.includes("indoor"));
    if (isIndoorOnly) {
      score += 1; // heavily penalised but not excluded
    } else if (rockType) {
      // Rock-type-specific scoring
      const rockMap = { granite: ["granite", "gneiss", "basalt"], limestone: ["limestone", "tufa"], sandstone: ["sandstone", "slate"] };
      const matchRocks = rockMap[rockType] || [];
      if (bestRock.some(r => matchRocks.some(m => r.includes(m)))) score += 10;
      else if (!bestRock.length) score += 6;
      else score += 4;
    } else {
      // No specific rock: any outdoor rock = good
      const outdoorTypes = ["limestone", "granite", "sandstone", "gneiss", "basalt", "slate"];
      if (bestRock.some(r => outdoorTypes.some(ot => r.includes(ot)))) score += 10;
      else if (!bestRock.length) score += 6;
      else score += 4;
    }
  } else {
    // "both" — versatile shoes (avoid extremes)
    const hasIndoor = bestRock.some(r => r.includes("indoor"));
    const hasOutdoor = bestRock.some(r => !r.includes("indoor"));
    if (hasIndoor && hasOutdoor) score += 10;
    else if (bestRock.length > 1) score += 8;
    else if (bestRock.length > 0) score += 6;
    else score += 5;
  }

  // ── 4. Downturn fit (15 pts) — fractional 5-tier system ──
  const dtTarget = downturnTierOvr != null
    ? TIER_DOWNTURN_IDX[TIER_NAMES.indexOf(downturnTierOvr)] ?? downturnTargetIdx(level, preference)
    : downturnTargetIdx(level, preference);
  const shoeDownturn = (shoe.downturn || "").toLowerCase();
  const dtShoeIdx = DOWNTURN_ORDER.indexOf(shoeDownturn);
  if (dtShoeIdx >= 0) {
    const dist = Math.abs(dtTarget - dtShoeIdx);
    if (dist <= 0.25) score += 15;
    else if (dist <= 0.75) score += 12;
    else if (dist <= 1.25) score += 7;
    else score += 2;
  } else {
    score += 6;
  }

  // ── 5. Asymmetry fit (10 pts) — fractional 5-tier system ──
  const aTarget = asymmetryTierOvr != null
    ? TIER_ASYMMETRY_IDX[TIER_NAMES.indexOf(asymmetryTierOvr)] ?? asymmetryTargetIdx(level, preference)
    : asymmetryTargetIdx(level, preference);
  const shoeAsym = (shoe.asymmetry || "").toLowerCase();
  const aShoeIdx = ASYM_ORDER.indexOf(shoeAsym);
  if (aShoeIdx >= 0) {
    const asymDist = Math.abs(aTarget - aShoeIdx);
    if (asymDist <= 0.25) score += 10;
    else if (asymDist <= 0.75) score += 8;
    else if (asymDist <= 1.25) score += 4;
    else score += 1;
  } else {
    score += 4;
  }

  // ── 6. Midsole / stiffness fit (15 pts) — discipline + weight ──
  const targetMidsole = midsoleOvr != null ? midsoleOvr : computeTargetMidsole(disciplines, weightKg);
  const shoeMidsole = MIDSOLE_NAMES[shoe.midsole?.toLowerCase()] ?? 1;
  const midsoleDist = Math.abs(targetMidsole - shoeMidsole);
  if (midsoleDist === 0) score += 15;
  else if (midsoleDist === 1) score += 7;
  else score += 2;

  // ── 7. Rubber thickness fit (10 pts) — weight + discipline ──
  const targetRubber = rubberOvr != null ? rubberOvr : computeTargetRubberThickness(disciplines, weightKg);
  const shoeRubber = shoe.rubber_thickness_mm;
  if (shoeRubber) {
    const rubberDist = Math.abs(shoeRubber - targetRubber);
    if (rubberDist <= 0.5) score += 10;
    else if (rubberDist <= 1) score += 6;
    else score += 2;
  } else {
    score += 5; // no data → neutral
  }

  // ── 8. Foot shape bonuses (up to 10 pts) ──
  if (toeForm) {
    const shoeToe = (shoe.toe_form || "").toLowerCase();
    if (shoeToe === toeForm) score += 3;
    else if (!shoeToe) score += 1;
  }
  if (width) {
    const shoeWidth = (shoe.width || "").toLowerCase();
    if (shoeWidth === width) score += 3;
    else if (!shoeWidth || shoeWidth === "medium") score += 1;
  }
  if (heelVolume) {
    const shoeHeel = (shoe.heel_volume || shoe.heel || "").toLowerCase();
    if (shoeHeel === heelVolume) score += 2;
    else if (!shoeHeel || shoeHeel === "medium") score += 1;
  }
  // Neutral bonus when no foot prefs set
  if (!toeForm && !width && !heelVolume) score += 5;

  return Math.round(score);
}

// ─── Forefoot volume hard filter ─────────────────────────────
function matchesVolume(shoe, forefootVolume) {
  if (!forefootVolume) return true;
  const vol = (shoe.forefoot_volume || shoe.volume || "").toLowerCase();
  const gender = (shoe.gender || "").toLowerCase();
  if (forefootVolume === "standard") return vol !== "low" || gender === "unisex";
  if (forefootVolume === "low") return vol === "low" || gender === "women" || gender === "womens";
  if (forefootVolume === "high") return vol === "high" || vol === "wide";
  return true;
}

// ─── URL encode/decode ────────────────────────────────────────
function encodeFinderState(s) {
  const p = new URLSearchParams();
  if (s.disciplines.length) p.set("d", s.disciplines.join(","));
  if (s.environment) p.set("e", s.environment);
  if (s.rockType) p.set("rt", s.rockType);
  if (s.level) p.set("l", s.level);
  if (s.preference !== "balanced") p.set("p", s.preference);
  if (s.forefootVolume) p.set("v", s.forefootVolume);
  if (s.toeForm) p.set("tf", s.toeForm);
  if (s.width) p.set("wd", s.width);
  if (s.heelVolume) p.set("hl", s.heelVolume);
  if (s.weightKg !== 70) p.set("w", String(s.weightKg));
  return p.toString();
}

function decodeFinderState(search) {
  const p = new URLSearchParams(search);
  return {
    disciplines: p.get("d") ? p.get("d").split(",").filter(Boolean) : [],
    environment: p.get("e") || "both",
    rockType: p.get("rt") || "",
    level: p.get("l") || "intermediate",
    preference: p.get("p") || "balanced",
    forefootVolume: p.get("v") || "",
    toeForm: p.get("tf") || "",
    width: p.get("wd") || "",
    heelVolume: p.get("hl") || "",
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
  const [environment, setEnvironment] = useState("both");
  const [rockType, setRockType] = useState("");
  const [level, setLevel] = useState("intermediate");
  const [preference, setPreference] = useState("balanced");
  const [forefootVolume, setForefootVolume] = useState("");
  const [toeForm, setToeForm] = useState("");
  const [width, setWidth] = useState("");
  const [heelVolume, setHeelVolume] = useState("");
  const [weightKg, setWeightKg] = useState(70);
  const [brandFilter, setBrandFilter] = useState("all");
  const [closureFilter, setClosureFilter] = useState("all");
  const [showAllResults, setShowAllResults] = useState(false);
  const [editingTrait, setEditingTrait] = useState(null); // which trait row is expanded for inline edit
  // Overrides: if user manually adjusts a trait on the results page, these take priority
  const [downturnOverride, setDownturnOverride] = useState(null); // tier name or null
  const [asymmetryOverride, setAsymmetryOverride] = useState(null);
  const [closureOverride, setClosureOverride] = useState(null); // array or null
  const [midsoleOverride, setMidsoleOverride] = useState(null); // 0/1/2 or null
  const [rubberOverride, setRubberOverride] = useState(null); // number or null
  const [envOverride, setEnvOverride] = useState(null); // string or null

  // Restore from URL on mount
  useEffect(() => {
    const s = decodeFinderState(searchParams.toString());
    if (s.disciplines.length) setDisciplines(s.disciplines);
    if (s.environment) setEnvironment(s.environment);
    if (s.rockType) setRockType(s.rockType);
    if (s.level) setLevel(s.level);
    if (s.preference) setPreference(s.preference);
    if (s.forefootVolume) setForefootVolume(s.forefootVolume);
    if (s.toeForm) setToeForm(s.toeForm);
    if (s.width) setWidth(s.width);
    if (s.heelVolume) setHeelVolume(s.heelVolume);
    if (s.weightKg !== 70) setWeightKg(s.weightKg);
    if (s.disciplines.length && s.preference) setStep(TOTAL_STEPS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  usePageMeta(
    "Climbing Shoe Finder — Find Your Perfect Shoe",
    "Answer 6 questions and our algorithm matches you with the best climbing shoes from 339+ models. No opinions, just data."
  );

  // ─── Computed ───────────────────────────────────────────────
  const params = useMemo(() => ({
    disciplines, environment, rockType, level, preference, forefootVolume, toeForm, width, heelVolume, weightKg,
    downturnTierOvr: downturnOverride, asymmetryTierOvr: asymmetryOverride,
    closureOvr: closureOverride, midsoleOvr: midsoleOverride, rubberOvr: rubberOverride, envOvr: envOverride,
  }), [disciplines, environment, rockType, level, preference, forefootVolume, toeForm, width, heelVolume, weightKg,
    downturnOverride, asymmetryOverride, closureOverride, midsoleOverride, rubberOverride, envOverride]);

  const allResults = useMemo(() => {
    return shoes
      .filter(s => matchesVolume(s, forefootVolume))
      .map(s => {
        const sc = scoreShoe(s, params);
        return sc !== null ? { shoe: s, score: sc } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  }, [shoes, params, forefootVolume]);

  const filteredResults = useMemo(() => {
    let r = allResults;
    if (brandFilter !== "all") r = r.filter(x => x.shoe.brand === brandFilter);
    if (closureFilter !== "all") r = r.filter(x => (x.shoe.closure || "").toLowerCase() === closureFilter);
    return r;
  }, [allResults, brandFilter, closureFilter]);

  const brandCounts = useMemo(() => {
    const counts = {};
    for (const { shoe } of allResults) counts[shoe.brand] = (counts[shoe.brand] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [allResults]);

  const closureCounts = useMemo(() => {
    const counts = {};
    for (const { shoe } of allResults) {
      const c = (shoe.closure || "unknown").toLowerCase();
      counts[c] = (counts[c] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allResults]);

  // Computed targets for display (respect overrides)
  const effectiveDtTier = downturnOverride || computeTargetDownturn(level, preference);
  const effectiveAsymTier = asymmetryOverride || computeTargetAsymmetry(level, preference);
  const targetDownturn = TIER_DOWNTURN_LABEL[effectiveDtTier] || effectiveDtTier;
  const targetAsymmetry = TIER_ASYMMETRY_LABEL[effectiveAsymTier] || effectiveAsymTier;
  const effectiveMidsoleNum = midsoleOverride != null ? midsoleOverride : computeTargetMidsole(disciplines, weightKg);
  const targetMidsole = MIDSOLE_LABELS[effectiveMidsoleNum];
  const effectiveRubber = rubberOverride != null ? rubberOverride : computeTargetRubberThickness(disciplines, weightKg);
  const targetRubber = effectiveRubber.toFixed(1);
  const effectiveClosures = closureOverride || computeTargetClosures(disciplines);
  const effectiveEnv = envOverride || environment;

  const updateURL = useCallback(() => {
    const qs = encodeFinderState({ disciplines, environment, rockType, level, preference, forefootVolume, toeForm, width, heelVolume, weightKg });
    setSearchParams(qs, { replace: true });
  }, [disciplines, environment, rockType, level, preference, forefootVolume, toeForm, width, heelVolume, weightKg, setSearchParams]);

  const nextStep = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      if (step === TOTAL_STEPS - 1) updateURL();
    }
  };
  const prevStep = () => { if (step > 0) setStep(step - 1); };
  const goToStep = (s) => setStep(s);

  // Clear rock type when switching away from outdoor
  useEffect(() => {
    if (environment !== "outdoor") setRockType("");
  }, [environment]);

  // ─── Shared styles ──────────────────────────────────────────
  const accentBorder = "rgba(232,115,74,0.25)";
  const blueSoft = "rgba(96,165,250,0.08)";
  const blueBorder = "rgba(96,165,250,0.2)";
  const greenSoft = "rgba(34,197,94,0.08)";
  const greenBorder = "rgba(34,197,94,0.2)";

  // ─── Sub-components ─────────────────────────────────────────
  const OptionCard = ({ selected, onClick, icon, img, title, desc }) => (
    <div
      onClick={onClick}
      style={{
        background: selected ? T.accentSoft : T.card,
        border: `1.5px solid ${selected ? T.accent : T.border}`,
        borderRadius: T.radius, padding: isMobile ? "14px" : "16px",
        cursor: "pointer", transition: "all 0.2s",
        display: "flex", flexDirection: "column", gap: "6px", position: "relative",
      }}
    >
      {selected && (
        <div style={{
          position: "absolute", top: "10px", right: "12px",
          width: "20px", height: "20px", borderRadius: "50%",
          background: T.accent, color: "#fff",
          fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
        }}>✓</div>
      )}
      {img && <img src={img} alt={title} style={{ width: "52px", height: "auto", filter: "brightness(0.95)", marginBottom: "2px" }} />}
      {icon && !img && <div style={{ fontSize: "22px", lineHeight: 1 }}>{icon}</div>}
      <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "-0.2px", color: T.text }}>{title}</div>
      {desc && <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.45 }}>{desc}</div>}
    </div>
  );

  // Compact pill selector — used for width, heel, volume
  const PillSelect = ({ label, options, value, onChange, explain }) => (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ fontSize: "13px", fontWeight: 600, color: T.text, marginBottom: "8px" }}>{label}</div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {options.map(o => (
          <span
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              fontSize: "12px", padding: "7px 16px", borderRadius: "20px",
              border: `1.5px solid ${value === o.id ? T.accent : T.border}`,
              background: value === o.id ? T.accentSoft : T.card,
              color: value === o.id ? T.accent : T.muted,
              cursor: "pointer", fontFamily: T.font, fontWeight: 600, transition: "all 0.2s",
            }}
          >{o.title}</span>
        ))}
      </div>
      {explain && (
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
          padding: "10px 14px", marginTop: "8px",
          fontSize: "12px", color: T.muted, lineHeight: 1.5,
        }}>{explain}</div>
      )}
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

  const StepNumber = ({ n }) => (
    <div style={{
      fontSize: "11px", fontWeight: 600, color: T.accent,
      letterSpacing: "0.5px", textTransform: "uppercase",
      marginBottom: "8px", fontFamily: T.mono,
    }}>Step {n} of {TOTAL_STEPS}</div>
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
  const stepNames = ["Discipline", "Where", "Level", "Preference", "Foot", "Weight"];
  const ProgressBar = () => (
    <div style={{ marginBottom: "40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        {stepNames.map((name, i) => (
          <span
            key={name}
            onClick={() => i < step && goToStep(i)}
            style={{
              fontSize: isMobile ? "9px" : "11px", fontWeight: i === step ? 700 : 500,
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

  // ═══════════════════════════════════════════════════════════
  // STEP RENDERERS
  // ═══════════════════════════════════════════════════════════

  // STEP 0 — Discipline (multi-select)
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
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "12px" }}>
        {DISCIPLINES.map(d => (
          <OptionCard
            key={d.id}
            selected={disciplines.includes(d.id)}
            onClick={() => setDisciplines(prev =>
              prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]
            )}
            icon={d.icon} title={d.title} desc={d.desc}
          />
        ))}
      </div>
      <Tip>
        Your discipline determines <strong style={{ color: T.text, fontWeight: 600 }}>closure type</strong> (slipper vs. lace),{" "}
        <strong style={{ color: T.text, fontWeight: 600 }}>stiffness</strong>, and <strong style={{ color: T.text, fontWeight: 600 }}>midsole</strong> target.
        Multi-select averages these traits.
      </Tip>
      <NavButtons canBack={false} canNext={disciplines.length > 0} />
    </div>
  );

  // STEP 1 — Environment + Rock Type sub-question
  const renderStep1 = () => (
    <div>
      <StepNumber n={2} />
      <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "6px", color: T.text }}>
        Where do you climb most?
      </h2>
      <p style={{ fontSize: "13px", color: T.muted, marginBottom: "20px", lineHeight: 1.5 }}>
        This determines rubber compound and filters out shoes that don't match your terrain.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "12px" }}>
        {ENVIRONMENTS.map(e => (
          <OptionCard
            key={e.id}
            selected={environment === e.id}
            onClick={() => setEnvironment(e.id)}
            icon={e.icon} title={e.title} desc={e.desc}
          />
        ))}
      </div>

      {/* Rock type sub-question — only shown when outdoor */}
      {environment === "outdoor" && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "6px" }}>
            What rock type do you climb on most?
          </div>
          <p style={{ fontSize: "12px", color: T.muted, marginBottom: "14px" }}>
            Different rock textures favor different rubber compounds. This fine-tunes your results.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "10px" }}>
            {ROCK_TYPES.map(r => (
              <OptionCard key={r.id} selected={rockType === r.id} onClick={() => setRockType(r.id)}
                icon={r.icon} title={r.title} desc={r.desc} />
            ))}
          </div>
        </div>
      )}

      <Tip>
        <strong style={{ color: T.text, fontWeight: 600 }}>Outdoors</strong> removes indoor-specific shoes
        {!disciplines.includes("boulder") && " and favors harder rubber for sport/trad"}.{" "}
        <strong style={{ color: T.text, fontWeight: 600 }}>Indoors</strong> favors soft rubber and easy on/off.{" "}
        <strong style={{ color: T.text, fontWeight: 600 }}>Both</strong> avoids extremes — allrounder territory.
      </Tip>
      <NavButtons />
    </div>
  );

  // STEP 2 — Experience Level
  const renderStep2 = () => (
    <div>
      <StepNumber n={3} />
      <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "6px", color: T.text }}>
        How long have you been climbing?
      </h2>
      <p style={{ fontSize: "13px", color: T.muted, marginBottom: "20px", lineHeight: 1.5 }}>
        Together with the next question, this sets your target downturn and asymmetry.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "12px" }}>
        {LEVELS.map(l => (
          <OptionCard key={l.id} selected={level === l.id} onClick={() => setLevel(l.id)}
            icon={l.icon} title={l.title} desc={l.desc} />
        ))}
      </div>

      {/* Combined downturn preview — 5 tiers */}
      {(() => {
        const tier = computeTargetDownturn(level, preference);
        const tierIdx = TIER_NAMES.indexOf(tier);
        const tiers = [
          { label: "Zero", path: "M4 24 Q30 24 56 24" },
          { label: "Slight", path: "M4 24 Q14 23 28 22 Q46 21 56 22" },
          { label: "Moderate", path: "M4 24 Q14 22 28 18 Q46 14 56 18" },
          { label: "High", path: "M4 24 Q14 20 28 14 Q46 8 56 14" },
          { label: "Ultra", path: "M4 24 Q14 18 28 10 Q46 4 56 12" },
        ];
        return (
          <>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-end",
              padding: "16px 4px", marginTop: "16px",
              background: T.surface, borderRadius: T.radiusSm, border: `1px solid ${T.border}`,
            }}>
              {tiers.map((t, i) => {
                const isTarget = i === tierIdx;
                return (
                  <div key={t.label} style={{ textAlign: "center", flex: 1 }}>
                    <svg width={isMobile ? "44" : "52"} height="28" viewBox="0 0 60 28">
                      <path d={t.path} fill="none"
                        stroke={isTarget ? T.accent : "#444"}
                        strokeWidth={isTarget ? "3" : "2"} strokeLinecap="round" />
                    </svg>
                    <div style={{
                      fontSize: isMobile ? "8px" : "9px", textTransform: "uppercase", letterSpacing: "0.3px",
                      color: isTarget ? T.accent : "#555",
                      fontWeight: isTarget ? 700 : 400,
                    }}>{t.label}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: "center", marginTop: "8px" }}>
              <span style={{ fontSize: "10px", color: T.accent, fontWeight: 600 }}>
                {level.charAt(0).toUpperCase() + level.slice(1)} + {preference} → {TIER_DOWNTURN_LABEL[tier]} downturn
              </span>
            </div>
          </>
        );
      })()}

      <Tip>
        <strong style={{ color: T.text, fontWeight: 600 }}>Level + Preference</strong> combine to set your target.
        A beginner who wants performance gets a moderate shoe; an advanced comfort-seeker gets the same.
      </Tip>
      <NavButtons />
    </div>
  );

  // STEP 3 — Preference (3 cards)
  const renderStep3 = () => {
    const dt = computeTargetDownturn(level, preference);
    const asym = computeTargetAsymmetry(level, preference);

    return (
      <div>
        <StepNumber n={4} />
        <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "6px", color: T.text }}>
          Comfort or performance?
        </h2>
        <p style={{ fontSize: "13px", color: T.muted, marginBottom: "20px", lineHeight: 1.5 }}>
          Combined with your experience level, this determines the shoe shape we target.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "12px" }}>
          {PREFERENCES.map(p => (
            <OptionCard key={p.id} selected={preference === p.id} onClick={() => setPreference(p.id)}
              icon={p.icon} title={p.title} desc={p.desc} />
          ))}
        </div>

        {/* Live target preview */}
        <div style={{
          marginTop: "18px", padding: "16px 20px",
          background: T.surface, borderRadius: T.radiusSm, border: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: "12px", color: T.muted, marginBottom: "10px" }}>With your settings:</div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {[
              { label: "Downturn", value: TIER_DOWNTURN_LABEL[dt] || dt },
              { label: "Asymmetry", value: TIER_ASYMMETRY_LABEL[asym] || asym },
            ].map(t => (
              <div key={t.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "#6b7280" }}>{t.label}:</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: T.accent }}>{t.value}</span>
              </div>
            ))}
          </div>
        </div>

        <Tip>
          <strong style={{ color: T.text, fontWeight: 600 }}>{level.charAt(0).toUpperCase() + level.slice(1)} + {preference}</strong> →{" "}
          {TIER_DOWNTURN_LABEL[dt]} downturn, {TIER_ASYMMETRY_LABEL[asym]} asymmetry.
          {dt === "zero" && " Flat, symmetric shoes maximize comfort for long sessions."}
          {dt === "slight" && " Minimal curve — comfort-first with a hint of precision."}
          {dt === "moderate" && " Enough curve for precision without the pain of an aggressive shoe."}
          {dt === "high" && " Significant curve and toe power for hard climbing."}
          {dt === "ultra" && " Maximum downturn and asymmetry — pure performance on steep terrain."}
        </Tip>
        <NavButtons />
      </div>
    );
  };

  // STEP 4 — Foot Shape (toe form, volume, width, heel)
  const renderStep4 = () => (
    <div>
      <StepNumber n={5} />
      <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "6px", color: T.text }}>
        Tell us about your feet
      </h2>
      <p style={{ fontSize: "13px", color: T.muted, marginBottom: "24px", lineHeight: 1.5 }}>
        Skip any you're unsure about — we'll just cast a wider net.
      </p>

      {/* Toe shape — cards with images */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: T.text, marginBottom: "8px" }}>Toe shape</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "10px" }}>
          {TOE_FORMS.map(t => (
            <OptionCard key={t.id} selected={toeForm === t.id} onClick={() => setToeForm(t.id)}
              img={t.img} title={t.title} desc={t.desc} />
          ))}
        </div>
      </div>

      {/* Forefoot Volume — pills */}
      <PillSelect label="Forefoot volume" options={VOLUMES} value={forefootVolume} onChange={setForefootVolume}
        explain={<>How deep is the space above your forefoot? <strong style={{ color: T.text }}>Low</strong> = flat instep (women's/LV models). <strong style={{ color: T.text }}>High</strong> = deep arch.</>} />

      {/* Forefoot Width — pills */}
      <PillSelect label="Forefoot width" options={WIDTHS} value={width} onChange={setWidth}
        explain={<>Toes get squeezed? Try <strong style={{ color: T.text }}>Wide</strong>. Sloppy side-to-side? Try <strong style={{ color: T.text }}>Narrow</strong>.</>} />

      {/* Heel Volume — pills */}
      <PillSelect label="Heel volume" options={HEEL_VOLUMES} value={heelVolume} onChange={setHeelVolume}
        explain={<>Heel slips out? Try <strong style={{ color: T.text }}>Narrow</strong>. Feels pinched? Try <strong style={{ color: T.text }}>Wide</strong>.</>} />

      <Tip>
        <strong style={{ color: T.text, fontWeight: 600 }}>Not sure?</strong> Skip all foot shape questions.
        We'll show the full range and you can narrow down later.
      </Tip>
      <NavButtons />
    </div>
  );

  // STEP 5 — Weight
  const renderStep5 = () => {
    const zone = weightKg < 60 ? "light" : weightKg > 85 ? "heavy" : "medium";

    return (
      <div>
        <StepNumber n={6} />
        <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "6px", color: T.text }}>
          How much do you weigh?
        </h2>
        <p style={{ fontSize: "13px", color: T.muted, marginBottom: "20px", lineHeight: 1.5 }}>
          Heavier climbers benefit from stiffer soles and thicker rubber; lighter climbers can go softer and thinner.
        </p>

        <div style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: T.radius, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "8px" }}>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>45 kg</span>
            <input type="range" min="45" max="110" value={weightKg}
              onChange={e => setWeightKg(Number(e.target.value))}
              style={{ flex: 1, accentColor: T.accent, height: "6px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
              <input type="number" min="45" max="110" value={weightKg}
                onChange={e => { const v = Math.max(45, Math.min(110, Number(e.target.value) || 45)); setWeightKg(v); }}
                style={{
                  width: "48px", fontFamily: T.mono, fontSize: "15px", fontWeight: 600,
                  color: T.accent, background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: T.radiusXs, padding: "4px 6px", textAlign: "right",
                  outline: "none",
                }} />
              <span style={{ fontSize: "13px", color: T.muted }}>kg</span>
            </div>
          </div>

          <div style={{ display: "flex", marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${T.border}` }}>
            {[
              { label: "Light", range: "< 60 kg", active: zone === "light" },
              { label: "Medium", range: "60 – 85 kg", active: zone === "medium" },
              { label: "Heavy", range: "> 85 kg", active: zone === "heavy" },
            ].map(z => (
              <div key={z.label} style={{
                textAlign: "center", flex: 1, padding: "6px 0",
                background: z.active ? T.accentSoft : "transparent", borderRadius: T.radiusXs,
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
            At <strong style={{ color: T.text }}>{weightKg} kg</strong>:<br />
            <span style={{ color: T.accent, fontWeight: 700 }}>→</span> {targetMidsole.charAt(0).toUpperCase() + targetMidsole.slice(1)} midsole preferred<br />
            <span style={{ color: T.accent, fontWeight: 700 }}>→</span> ~{targetRubber}mm rubber sweet spot
          </div>
        </div>

        <Tip>
          <strong style={{ color: T.text, fontWeight: 600 }}>Weight shifts the stiffness dial</strong> — it doesn't override your
          other preferences. A 90 kg trad climber needs a very stiff shoe; a 55 kg boulderer can go super soft.
        </Tip>
        <NavButtons nextLabel="Show results →" />
      </div>
    );
  };

  // ─── Inline editor pill helper ─────────────────────────────
  const InlinePills = ({ options, value, onChange, multi }) => (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
      {options.map(o => {
        const id = typeof o === "string" ? o : o.id;
        const label = typeof o === "string" ? o : o.label;
        const isActive = multi ? (value || []).includes(id) : value === id;
        return (
          <button key={id} onClick={() => {
            if (multi) {
              const cur = value || [];
              onChange(isActive ? cur.filter(x => x !== id) : [...cur, id]);
            } else {
              onChange(id);
            }
          }} style={{
            padding: "5px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: isActive ? 700 : 500,
            background: isActive ? "rgba(232,115,74,0.15)" : T.surface,
            color: isActive ? T.accent : T.muted,
            border: `1.5px solid ${isActive ? T.accent : T.border}`,
            cursor: "pointer", transition: "all 0.15s",
          }}>{label}</button>
        );
      })}
    </div>
  );

  // ─── Results view ────────────────────────────────────────────
  const renderResults = () => {
    const disciplineLabel = disciplines.map(d => {
      const found = DISCIPLINES.find(x => x.id === d);
      return found ? found.title : d;
    }).join(" + ") || "General climbing";

    const displayResults = showAllResults ? filteredResults : filteredResults.slice(0, 10);

    // Capitalize first letter
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

    // Combined downturn+asymmetry display label
    const dtAsymLabel = targetDownturn === targetAsymmetry
      ? `${cap(targetDownturn)} downturn & asymmetry`
      : `${cap(targetDownturn)} downturn, ${targetAsymmetry} asymmetry`;

    // Build trait rows (no foot shape rows)
    const traitRows = [
      {
        id: "shape",
        value: dtAsymLabel,
        reason: `${level} level + ${preference} preference`,
        editor: () => (
          <div>
            <div style={{ fontSize: "11px", color: T.muted, marginBottom: "2px" }}>Downturn</div>
            <InlinePills options={TIER_NAMES.map(t => ({ id: t, label: TIER_DOWNTURN_LABEL[t] }))}
              value={effectiveDtTier} onChange={v => setDownturnOverride(v)} />
            <div style={{ fontSize: "11px", color: T.muted, marginTop: "10px", marginBottom: "2px" }}>Asymmetry</div>
            <InlinePills options={TIER_NAMES.map(t => ({ id: t, label: TIER_ASYMMETRY_LABEL[t] }))}
              value={effectiveAsymTier} onChange={v => setAsymmetryOverride(v)} />
          </div>
        ),
      },
      {
        id: "closure",
        value: `${cap(effectiveClosures.join(" / "))} closure`,
        reason: disciplineLabel.toLowerCase(),
        editor: () => (
          <InlinePills multi options={["slipper", "velcro", "lace"].map(c => ({ id: c, label: cap(c) }))}
            value={effectiveClosures} onChange={v => setClosureOverride(v.length ? v : null)} />
        ),
      },
      {
        id: "midsole",
        value: `${cap(targetMidsole)} midsole`,
        reason: `${disciplineLabel.toLowerCase()} + ${weightKg} kg`,
        editor: () => (
          <InlinePills options={MIDSOLE_LABELS.map((m, i) => ({ id: String(i), label: cap(m) }))}
            value={String(effectiveMidsoleNum)} onChange={v => setMidsoleOverride(Number(v))} />
        ),
      },
      {
        id: "rubber",
        value: `~${targetRubber} mm rubber`,
        reason: `${weightKg} kg body weight`,
        editor: () => (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
            <input type="range" min="2.5" max="5.5" step="0.5" value={effectiveRubber}
              onChange={e => setRubberOverride(Number(e.target.value))}
              style={{ flex: 1, accentColor: T.accent }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: T.accent, minWidth: "48px" }}>{effectiveRubber.toFixed(1)} mm</span>
          </div>
        ),
      },
      {
        id: "env",
        value: effectiveEnv === "outdoor" && rockType
          ? `Outdoor · ${cap(rockType)}`
          : cap(effectiveEnv),
        reason: effectiveEnv === "outdoor" && rockType
          ? `${rockType} → ${rockType === "granite" ? "hard" : rockType === "sandstone" ? "soft" : "medium"} rubber`
          : effectiveEnv === "indoor" ? "soft rubber, easy on/off" : "versatile all-rounder",
        editor: () => (
          <InlinePills options={[
            { id: "outdoor", label: "Outdoor" }, { id: "indoor", label: "Indoor" }, { id: "both", label: "Both" },
          ]} value={effectiveEnv} onChange={v => setEnvOverride(v)} />
        ),
      },
    ];

    return (
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "20px", color: T.text }}>
          Your recommendation
        </h2>

        {/* Trait explanation card */}
        <div style={{
          background: T.card, border: `1.5px solid ${accentBorder}`,
          borderRadius: T.radius, padding: "20px 24px", marginBottom: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <div style={{ fontSize: "24px" }}>🎯</div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: T.text }}>
              Based on your answers, we're looking for:
            </div>
          </div>

          {/* Trait rows — two-line format with inline edit */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {traitRows.map(t => {
              const isEditing = editingTrait === t.id;
              return (
                <div key={t.id} style={{
                  padding: "10px 14px", borderRadius: T.radiusSm,
                  background: T.surface, border: `1px solid ${isEditing ? T.accent : T.border}`,
                  transition: "all 0.2s",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: T.accent, fontSize: "14px", lineHeight: 1.4 }}>
                        {t.value}
                      </div>
                      <div style={{ fontSize: "12px", color: T.muted, marginTop: "2px" }}>
                        {t.reason}
                      </div>
                    </div>
                    <button onClick={() => setEditingTrait(isEditing ? null : t.id)} style={{
                      background: "none", border: "none", cursor: "pointer", padding: "4px",
                      color: isEditing ? T.accent : T.muted, fontSize: "14px", flexShrink: 0,
                      transition: "color 0.15s",
                    }}>✎</button>
                  </div>
                  {isEditing && (
                    <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: `1px solid ${T.border}` }}>
                      {t.editor()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Results header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: T.text }}>Top matches</h3>
          <span style={{ fontSize: "13px", color: T.muted, fontFamily: T.mono }}>{allResults.length} results</span>
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

        <Tip>
          <strong style={{ color: T.text, fontWeight: 600 }}>Shareable link:</strong> Your selections are encoded in the URL.
          Send it to your climbing partner or bookmark for later.
        </Tip>

        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <button onClick={() => setStep(0)} style={{
            padding: "8px 20px", borderRadius: T.radiusSm, fontFamily: T.font,
            fontSize: "13px", fontWeight: 500, cursor: "pointer",
            background: "transparent", color: T.muted, border: `1px solid ${T.border}`,
          }}>← Start over</button>
        </div>
      </div>
    );
  };

  // ─── Filter chip ────────────────────────────────────────────
  const FilterChip = ({ label, count, active, onClick }) => (
    <span onClick={onClick} style={{
      fontSize: "12px", padding: "6px 14px", borderRadius: "20px",
      border: `1px solid ${active ? T.accent : T.border}`,
      background: active ? T.accentSoft : T.card,
      color: active ? T.accent : T.muted,
      cursor: "pointer", fontFamily: T.font, fontWeight: 500, transition: "all 0.2s",
    }}>
      {label}
      {count !== undefined && <span style={{ fontFamily: T.mono, fontSize: "10px", marginLeft: "4px", opacity: 0.7 }}>{count}</span>}
    </span>
  );

  // ─── Result card ────────────────────────────────────────────
  const ResultCard = ({ shoe, score, rank }) => {
    const tagColor = (type) => ({
      downturn: { bg: T.accentSoft, color: T.accent, border: accentBorder },
      closure:  { bg: blueSoft, color: T.blue, border: blueBorder },
      weight:   { bg: greenSoft, color: T.green, border: greenBorder },
      rubber:   { bg: T.purpleSoft, color: T.purple, border: "rgba(167,139,250,0.2)" },
    }[type] || { bg: T.accentSoft, color: T.accent, border: accentBorder });

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
                style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
            ) : (
              <span style={{ fontSize: "24px" }}>🧗</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.4px" }}>{shoe.brand}</div>
            <div style={{ fontSize: "14px", fontWeight: 700, margin: "1px 0 5px", letterSpacing: "-0.2px", color: T.text }}>{shoe.model}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {shoe.downturn && <Tag c={tagColor("downturn")}>{shoe.downturn}</Tag>}
              {shoe.closure && <Tag c={tagColor("closure")}>{shoe.closure}</Tag>}
              {shoe.weight_g && <Tag c={tagColor("weight")}>{shoe.weight_g}g</Tag>}
              {shoe.rubber_thickness_mm && <Tag c={tagColor("rubber")}>{shoe.rubber_type ? `${shoe.rubber_type} ` : ""}{shoe.rubber_thickness_mm}mm</Tag>}
            </div>
          </div>

          <div style={{ textAlign: "center", flexShrink: 0, minWidth: "44px" }}>
            <div style={{ fontFamily: T.mono, fontSize: "16px", fontWeight: 700, color: T.accent }}>{score}</div>
            <div style={{ fontSize: "9px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.3px" }}>Match</div>
          </div>
          <div style={{ color: "#6b7280", fontSize: "16px", flexShrink: 0 }}>›</div>
        </div>
      </Link>
    );
  };

  const Tag = ({ children, c }) => (
    <span style={{
      fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "4px", letterSpacing: "0.2px",
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
      <div style={{ textAlign: "center", marginBottom: step < TOTAL_STEPS ? "32px" : "24px" }}>
        <h1 style={{
          fontSize: isMobile ? "22px" : "28px", fontWeight: 700,
          letterSpacing: "-0.5px", marginBottom: "8px",
        }}>Find Your Climbing Shoe</h1>
        <p style={{ color: T.muted, fontSize: "15px", maxWidth: "520px", margin: "0 auto" }}>
          6 questions, {shoes.length} shoes, 0 opinions. Tell us how you climb — we'll match you with data.
        </p>
      </div>

      {step < TOTAL_STEPS && <ProgressBar />}

      {step === 0 && renderStep0()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
      {step === 5 && renderStep5()}
      {step === TOTAL_STEPS && renderResults()}
    </div>
  );
}
