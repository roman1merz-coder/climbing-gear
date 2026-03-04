import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import { buildPercentileMap } from "./utils/comfort.js";
import { ChartContainer, Pill, LegendRow, BottomSheet, buildTipHTML, positionTip, TIP_STYLE, getEventCoords, toggleHidden, chartPad, chartH, drawChartArea, drawGrid, drawTicks, drawCountBadge, drawDot, jitter, drawClusterBadges, drawCrosshair, hex2rgb } from "./ChartShared.jsx";

/* ─── Color palettes ─── */
const CLOSURE_COLORS = { lace: "#60a5fa", velcro: "#c98a42", slipper: "#34d399" };
const LEVEL_ORDER = ["beginner", "hobby", "intermediate", "advanced", "expert", "elite"];
const LEVEL_COLORS = { beginner: "#34d399", hobby: "#60a5fa", intermediate: "#a78bfa", advanced: "#ecc94b", expert: "#c98a42", elite: "#ed64a6" };
const LEVEL_LABELS = { beginner: "Beginner", hobby: "Hobby", intermediate: "Intermediate", advanced: "Advanced", expert: "Expert", elite: "Elite" };

/* ─── Skill-group colors (2 groups) ─── */
const SKILL_GROUP_COLORS = { "beginner": "#34d399", "advanced": "#c98a42" };
const SKILL_GROUP_LABELS = { "beginner": "Beginner – Intermediate", "advanced": "Advanced – Elite" };
function skillGroup(shoe) {
  const lvls = shoe.skill_level || [];
  if (lvls.includes("elite") || lvls.includes("expert") || lvls.includes("advanced")) return "advanced";
  return "beginner";
}

/* ─── Zone definitions for Edging × Sensitivity chart (6 irregular polygons) ─── */
const ZONE_POLYS = [
  { id: "1-sup",  label: "Multi-Pitch Comfort", emoji: "🏔",  side: "beg",
    poly: [[0,0], [0.55,0], [0.52,0.32], [0,0.32]] },
  { id: "2-sup",  label: "Edging Machine",      emoji: "🔪", side: "adv",
    poly: [[0.55,0], [1,0], [1,0.30], [0.52,0.32]] },
  { id: "1-bal",  label: "Allrounder",           emoji: "⭐", side: "beg",
    poly: [[0,0.32], [0.52,0.32], [0.42,0.65], [0,0.65]] },
  { id: "2-bal",  label: "Advanced Allrounder",  emoji: "🎯", side: "adv",
    poly: [[0.52,0.32], [1,0.30], [1,0.68], [0.42,0.65]] },
  { id: "1-sens", label: "Gym Progression",      emoji: "🧗", side: "beg",
    poly: [[0,0.65], [0.42,0.65], [0.30,1], [0,1]] },
  { id: "2-sens", label: "Overhang Specialist",  emoji: "💪", side: "adv",
    poly: [[0.42,0.65], [1,0.68], [1,1], [0.30,1]] },
];
const ZONE_DESCRIPTIONS = {
  "1-sens": "Modern bouldering gym shoe for beginners. Minimal downturn and asymmetry, but thin, soft sole for maximum rock feel. Less supportive - your feet may tire faster at first - but builds toe strength and footwork skills faster than a stiff shoe.",
  "1-bal": "The beginner allrounder that does it all. Enough support for long sessions, enough sensitivity and grip for indoor bouldering. The safest first-shoe pick for climbers who want one pair that works everywhere.",
  "1-sup": "Very comfortable for all-day use, but limited feedback from the rock surface. Better suited for easy sport climbing, multi-pitch, and trad than for indoor bouldering - a common mismatch we see with new climbers buying \"comfortable\" shoes for the gym.",
  "2-sens": "Aggressive shape meets soft construction - surprisingly comfortable for its profile. Excels on steep, overhanging terrain and modern-style bouldering where toe hooks and precision on small holds matter more than standing on edges.",
  "2-bal": "The advanced allrounder. Enough downturn and asymmetry for demanding sport routes, enough sensitivity for technical slab, enough support for longer pitches. The shoe that can do everything well when you know how to use it.",
  "2-sup": "The edging machine. Stiff platform channels maximum force through a small contact point. Excels on micro-edges, thin cracks, and small pockets - vertical-to-slightly-overhung terrain where precision beats flexibility. More at home on sport crags than in the bouldering gym.",
};
function topLevel(shoe) {
  const lvls = shoe.skill_level || [];
  for (let i = LEVEL_ORDER.length - 1; i >= 0; i--) if (lvls.includes(LEVEL_ORDER[i])) return LEVEL_ORDER[i];
  return "intermediate";
}const BRAND_PAL = [
  "#63b3ed","#ed64a6","#48bb78","#ecc94b","#ed8936","#9f7aea","#38b2ac","#fc8181",
  "#f6ad55","#68d391","#d53f8c","#4fd1c5","#b794f4","#90cdf4","#feb2b2","#fbd38d",
  "#81e6d9","#c4b5fd","#fca5a5","#bef264","#e879f9","#67e8f9",
];

/* ─── Axis options for free-choice dropdowns ─── */
const AXIS_OPTIONS = [
  { key: "_edging",      label: "Edging",             unit: "%",  fmt: v => Math.round(v * 100) + "%", pct: true },
  { key: "_sensitivity", label: "Sensitivity",        unit: "%",  fmt: v => Math.round(v * 100) + "%", pct: true },
  { key: "_crack",       label: "Crack",              unit: "%",  fmt: v => Math.round(v * 100) + "%", pct: true },
  { key: "_comfort",     label: "Comfort",            unit: "%",  fmt: v => Math.round(v * 100) + "%", pct: true },
  { key: "_price",       label: "Price (€)",          unit: "€",  fmt: v => "€" + Math.round(v), pct: false },
];
const AXIS_MAP = Object.fromEntries(AXIS_OPTIONS.map(a => [a.key, a]));

/* Map old metric keys → x/y pairs for backward-compat */
const METRIC_TO_AXES = {
  edging_sensitivity: { x: "_edging", y: "_sensitivity" },
  edging_comfort:     { x: "_edging", y: "_comfort" },
  edging_crack:       { x: "_edging", y: "_crack" },
  crack_comfort:      { x: "_crack",  y: "_comfort" },
  edging_price:       { x: "_edging", y: "_price" },
  crack_price:        { x: "_crack",  y: "_price" },
};

/* ─── Dynamic axis bounds ─── */
function fieldBounds(data, key) {
  const opt = AXIS_MAP[key];
  /* Percentile axes always use 0→1 */
  if (opt && opt.pct) return { min: 0, max: 1, step: 0.2 };
  const vals = data.filter(r => r[key] != null).map(r => r[key]);
  if (!vals.length) return { min: 0, max: 10, step: 1 };
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || 1;
  const rawStep = range / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  const step = niceSteps.map(s => s * mag).find(s => s >= rawStep) || mag * 10;
  const min = Math.floor(lo / step) * step - step;
  const max = Math.ceil(hi / step) * step + step;
  return { min, max, step };
}

/* ─── Main Component ─── */
export default function ShoeScatterChart({ shoes = [], isMobile, insightsMode = false }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);
  const sheetRef = useRef(null);

  const [xAxis, setXAxis] = useState("_edging");
  const [yAxis, setYAxis] = useState("_comfort");
  const [sizeAxis, setSizeAxis] = useState("none");
  const [colorBy, setColorBy] = useState(insightsMode ? "skill" : "level");
  const [showZones, setShowZones] = useState(insightsMode);
  const [mobileItem, setMobileItem] = useState(null);  /* Filter state */
  const [hideKids, setHideKids] = useState(true);
  const [genderFilter, setGenderFilter] = useState("all");
  const [footShape, setFootShape] = useState("all");
  const [hiddenClosure, setHiddenClosure] = useState(new Set());
  const [hiddenBrands, setHiddenBrands] = useState(new Set());
  const [hiddenLevels, setHiddenLevels] = useState(new Set());

  /* Percentile-normalize scores across non-kids shoes */
  const scored = useMemo(() => {
    const pctMap = buildPercentileMap(shoes);
    return shoes.map(s => {
      const pct = pctMap[s.slug] || {};
      return {
        ...s,
        _edging: pct.edging ?? 0.5,
        _sensitivity: pct.sensitivity ?? 0.5,
        _crack: pct.crack ?? 0.5,
        _comfort: pct.comfort ?? 0.5,
        _price: s.price_uvp_eur || 0,
        _level: topLevel(s),
      };
    });
  }, [shoes]);

  /* Brand list & colors */
  const BRAND_LIST = useMemo(() => [...new Set(scored.map(d => d.brand))].sort(), [scored]);
  const BRAND_COLORS = useMemo(() => Object.fromEntries(BRAND_LIST.map((b, i) => [b, BRAND_PAL[i % BRAND_PAL.length]])), [BRAND_LIST]);

  /* Bubble-size scaler */
  const sizeScale = useMemo(() => {
    if (sizeAxis === "none") return null;
    const vals = scored.filter(r => r[sizeAxis] != null).map(r => r[sizeAxis]);
    if (!vals.length) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const range = hi - lo || 1;
    const minR = isMobile ? 2 : 3, maxR = isMobile ? 12 : 16;
    return (v) => v == null ? (minR + maxR) / 2 : minR + ((v - lo) / range) * (maxR - minR);
  }, [sizeAxis, isMobile, scored]);

  /* Apply filters */
  const filtered = useMemo(() => scored.filter(d => {
    if (hideKids && d.kids_friendly) return false;
    if (genderFilter !== "all" && d.gender !== genderFilter) return false;
    if (footShape !== "all" && !(Array.isArray(d.toe_form) ? d.toe_form.includes(footShape) : d.toe_form === footShape)) return false;
    if (hiddenClosure.has(d.closure)) return false;
    if (hiddenBrands.has(d.brand)) return false;
    if (hiddenLevels.has(d._level)) return false;
    if (d[xAxis] == null || d[yAxis] == null) return false;
    return true;
  }), [scored, hideKids, genderFilter, footShape, hiddenClosure, hiddenBrands, hiddenLevels, xAxis, yAxis]);

  /* Dynamic axis config */
  const cfg = useMemo(() => {
    const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
    const xb = fieldBounds(filtered, xAxis);
    const yb = fieldBounds(filtered, yAxis);
    return {
      xField: xAxis, xLabel: xOpt.label, xMin: xb.min, xMax: xb.max, xStep: xb.step,
      yField: yAxis, yLabel: yOpt.label, yMin: yb.min, yMax: yb.max, yStep: yb.step,
      pctAxis: xOpt.pct && yOpt.pct, xPct: xOpt.pct, yPct: yOpt.pct,
      sub: `${filtered.length} shoes · ${xOpt.label} vs ${yOpt.label}${sizeAxis !== "none" ? ` · size = ${AXIS_MAP[sizeAxis]?.label}` : ""}`,
    };
  }, [filtered, xAxis, yAxis, sizeAxis]);

  /* Check if we're on the edging/sensitivity combo for zone overlay */
  const isEdgingSensitivity = xAxis === "_edging" && yAxis === "_sensitivity";  /* Color function */
  const getColor = useCallback((d) => {
    if (colorBy === "skill") return SKILL_GROUP_COLORS[skillGroup(d)] || "#94a3b8";
    if (colorBy === "closure") return CLOSURE_COLORS[d.closure] || "#94a3b8";
    if (colorBy === "level") return LEVEL_COLORS[d._level] || "#94a3b8";
    return BRAND_COLORS[d.brand] || "#94a3b8";
  }, [colorBy, BRAND_COLORS]);

  /* ─── Draw ─── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width, H = chartH(isMobile);
    const PAD = chartPad(isMobile);
    canvas.width = W * 2; canvas.height = H * 2;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { xField, yField, xMin, xMax, yMin, yMax, xStep, yStep, xPct, yPct, pctAxis } = cfg;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    drawChartArea(ctx, PAD, W, H);

    // ── 6-zone overlay (edging_sensitivity + insightsMode + showZones) ──
    if (isEdgingSensitivity && insightsMode && showZones) {
      const polyToPx = poly => poly.map(([ex, se]) => [sx(ex), sy(se)]);
      const centroid = pxPoly => [
        pxPoly.reduce((s, p) => s + p[0], 0) / pxPoly.length,
        pxPoly.reduce((s, p) => s + p[1], 0) / pxPoly.length,
      ];

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ZONE_POLYS.forEach(z => {
        const pxPoly = polyToPx(z.poly);
        const [cx, cy] = centroid(pxPoly);
        ctx.font = `${isMobile ? 22 : 32}px sans-serif`;
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = "#fff";
        ctx.fillText(z.emoji, cx, cy - (isMobile ? 4 : 6));
        ctx.font = `800 ${isMobile ? 8 : 11}px ${T.font}`;
        ctx.fillStyle = z.side === "beg" ? "#34d399" : "#c98a42";
        ctx.globalAlpha = 0.13;
        ctx.fillText(z.label.toUpperCase(), cx, cy + (isMobile ? 12 : 18));
      });
      ctx.restore();
    }

    drawGrid(ctx, PAD, W, H, xMin, xMax, yMin, xStep, yStep, { yMax, fn: sy });

    const xFmt = AXIS_MAP[xField]?.fmt || (x => String(x));
    const yFmt = AXIS_MAP[yField]?.fmt || (y => String(y));
    drawTicks(ctx, PAD, W, H, isMobile, { xMin, xMax, yMin, yMax, xStep, yStep, xFmt, yFmt, xLabel: cfg.xLabel, yLabel: cfg.yLabel, sxFn: sx, syFn: sy });

    drawCountBadge(ctx, PAD, W, filtered.length, "shoes");

    /* Crosshair */
    const hovered = hovRef.current;
    if (hovered && hovered[xField] != null && hovered[yField] != null) {
      const hpx = sx(Math.max(xMin, Math.min(xMax, hovered[xField])));
      const hpy = sy(Math.max(yMin, Math.min(yMax, hovered[yField])));
      drawCrosshair(ctx, hpx, hpy, PAD, W, H, xFmt(hovered[xField]), yFmt(hovered[yField]));
    }    /* Dots */
    const baseR = isMobile ? 3 : 4;
    const pixelPts = [];
    filtered.forEach((d, i) => {
      const xv = d[xField], yv = d[yField];
      if (xv == null || yv == null) return;
      if (d === hovered) return;
      const j = jitter(i);
      const px = sx(Math.max(xMin, Math.min(xMax, xv))) + j.dx;
      const py = sy(Math.max(yMin, Math.min(yMax, yv))) + j.dy;
      pixelPts.push({ px, py });
      const sz = sizeScale ? sizeScale(d[sizeAxis]) : baseR;
      drawDot(ctx, px, py, sz, getColor(d), false);
    });

    if (!sizeScale) drawClusterBadges(ctx, pixelPts);

    if (hovered && hovered[xField] != null && hovered[yField] != null) {
      const hpx = sx(Math.max(xMin, Math.min(xMax, hovered[xField])));
      const hpy = sy(Math.max(yMin, Math.min(yMax, hovered[yField])));
      const sz = sizeScale ? sizeScale(hovered[sizeAxis]) : baseR;
      drawDot(ctx, hpx, hpy, sz, getColor(hovered), true);
    }

    // Zone outlines ON TOP of dots
    if (isEdgingSensitivity && insightsMode && showZones) {
      const polyToPx = poly => poly.map(([ex, se]) => [sx(ex), sy(se)]);
      ctx.save();
      ZONE_POLYS.forEach(z => {
        const pxPoly = polyToPx(z.poly);
        ctx.beginPath();
        pxPoly.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
        ctx.closePath();
        ctx.strokeStyle = z.side === "beg" ? "rgba(52,211,153,0.28)" : "rgba(201,138,66,0.28)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.stroke();
      });
      ctx.restore();
    }
  }, [cfg, isMobile, getColor, filtered, showZones, insightsMode, isEdgingSensitivity, sizeAxis, sizeScale]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);

  /* ─── Hover / Click ─── */
  const findClosest = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { clientX, clientY } = getEventCoords(e);
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const W = rect.width, H = chartH(isMobile);
    const P = chartPad(isMobile);
    const { xField, yField, xMin, xMax, yMin, yMax } = cfg;
    const sx = x => P.l + (x - xMin) / (xMax - xMin) * (W - P.l - P.r);
    const sy = y => H - P.b - (y - yMin) / (yMax - yMin) * (H - P.t - P.b);
    let closest = null, best = Infinity;
    const threshold = isMobile ? 30 : 22;
    filtered.forEach(d => {
      const xv = d[xField], yv = d[yField];
      if (xv == null || yv == null) return;
      const dx = sx(xv) - mx, dy = sy(yv) - my, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < threshold && dist < best) { closest = d; best = dist; }
    });
    return closest;
  }, [isMobile, cfg, filtered]);  const pct = v => v != null ? Math.round(v * 100) + "%" : "–";

  /* Desktop tooltip */
  const showTip = useCallback((d, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
    const sOpt = sizeAxis !== "none" ? AXIS_MAP[sizeAxis] : null;
    const stats = [
      { label: xOpt.label, value: xOpt.fmt(d[xAxis]) },
      { label: yOpt.label, value: yOpt.fmt(d[yAxis]) },
    ];
    if (sOpt && d[sizeAxis] != null) stats.push({ label: sOpt.label, value: sOpt.fmt(d[sizeAxis]) });
    const shown = new Set([xAxis, yAxis, ...(sizeAxis !== "none" ? [sizeAxis] : [])]);
    if (!shown.has("_edging")) stats.push({ label: "Edging", value: pct(d._edging) });
    if (!shown.has("_sensitivity")) stats.push({ label: "Sensitivity", value: pct(d._sensitivity) });
    if (!shown.has("_comfort")) stats.push({ label: "Comfort", value: pct(d._comfort) });

    tip.innerHTML = buildTipHTML({
      name: `${d.brand} ${d.model}`,
      color: getColor(d),
      stats: stats.slice(0, 6),
      details: `${d.closure} · ${d.downturn}${d.price_uvp_eur ? " · €" + d.price_uvp_eur : ""}${d.vegan ? " · 🌱" : ""}`,
      link: `/shoe/${d.slug}`,
      pinned,
    });
    positionTip(tip, x, y, pinned);
  }, [getColor, xAxis, yAxis, sizeAxis]);

  const hideTip = useCallback(() => {
    const tip = tipRef.current;
    if (tip) { tip.style.opacity = "0"; tip.style.pointerEvents = "none"; }
  }, []);

  const handleMove = useCallback((e) => {
    if (isMobile || pinnedRef.current) return;
    const d = findClosest(e);
    if (d !== hovRef.current) { hovRef.current = d; draw(); }
    if (d) showTip(d, e.clientX, e.clientY, false); else hideTip();
  }, [isMobile, findClosest, draw, showTip, hideTip]);

  const handleLeave = useCallback(() => {
    if (isMobile || pinnedRef.current) return;
    hovRef.current = null; draw(); hideTip();
  }, [isMobile, draw, hideTip]);

  const handleClick = useCallback((e) => {
    if (isMobile) return;
    const d = findClosest(e);
    if (pinnedRef.current === d) {
      pinnedRef.current = null; hovRef.current = null; draw(); hideTip();
    } else if (d) {
      pinnedRef.current = d; hovRef.current = d; draw();
      showTip(d, e.clientX, e.clientY, true);
    } else {
      pinnedRef.current = null; hovRef.current = null; draw(); hideTip();
    }
  }, [isMobile, findClosest, draw, showTip, hideTip]);

  const handleTouch = useCallback((e) => {
    if (!isMobile) return;
    e.preventDefault();
    const d = findClosest(e);
    if (d) { hovRef.current = d; draw(); setMobileItem(d); }
    else { hovRef.current = null; draw(); setMobileItem(null); }
  }, [isMobile, findClosest, draw]);  const closeMobileSheet = useCallback(() => {
    setMobileItem(null); hovRef.current = null; draw();
  }, [draw]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!pinnedRef.current) return;
      if (canvasRef.current?.contains(e.target)) return;
      if (tipRef.current?.contains(e.target)) return;
      pinnedRef.current = null; hovRef.current = null; draw(); hideTip();
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [draw, hideTip]);

  useEffect(() => {
    if (!isMobile) return;
    const onTouch = (e) => {
      if (!mobileItem) return;
      if (canvasRef.current?.contains(e.target)) return;
      if (sheetRef.current?.contains(e.target)) return;
      closeMobileSheet();
    };
    document.addEventListener("touchstart", onTouch, { passive: true });
    return () => document.removeEventListener("touchstart", onTouch);
  }, [isMobile, mobileItem, closeMobileSheet]);

  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const onClick = (e) => {
      const a = e.target.closest("a");
      if (a && a.getAttribute("href")?.startsWith("/shoe/")) { e.preventDefault(); navigate(a.getAttribute("href")); }
    };
    tip.addEventListener("click", onClick);
    return () => tip.removeEventListener("click", onClick);
  }, [navigate]);

  /* ─── Legend data ─── */
  const closureKeys = ["lace", "velcro", "slipper"];

  /* ─── Styles ─── */
  const selectStyle = {
    padding: "5px 10px", fontSize: "12px", fontWeight: 600, borderRadius: "6px",
    border: `1px solid ${T.border}`, cursor: "pointer", background: T.surface, color: T.text,
    outline: "none", appearance: "none", WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237a7462'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", backgroundSize: "10px 6px",
    paddingRight: "24px", minWidth: isMobile ? "110px" : "140px",
  };

  const filterBtn = (active) => ({
    padding: "3px 8px", fontSize: "10px", fontWeight: 600, borderRadius: "4px", border: "none", cursor: "pointer",
    background: active ? "rgba(44,50,39,.08)" : "transparent", color: active ? T.text : T.muted,
  });  return (
    <ChartContainer title="Shoe Spec Deep Dive" subtitle={cfg.sub} isMobile={isMobile}>
      {/* Axis selectors */}
      <div style={{ display: "flex", gap: isMobile ? "8px" : "12px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: T.muted }}>X axis</span>
          <select value={xAxis} onChange={e => { setXAxis(e.target.value); pinnedRef.current = null; hovRef.current = null; hideTip(); setMobileItem(null); }} style={selectStyle}>
            {AXIS_OPTIONS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: T.muted }}>Y axis</span>
          <select value={yAxis} onChange={e => { setYAxis(e.target.value); pinnedRef.current = null; hovRef.current = null; hideTip(); setMobileItem(null); }} style={selectStyle}>
            {AXIS_OPTIONS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>
        <button onClick={() => { const tmp = xAxis; setXAxis(yAxis); setYAxis(tmp); pinnedRef.current = null; hovRef.current = null; hideTip(); }}
          style={{ padding: "4px 10px", fontSize: "11px", fontWeight: 700, borderRadius: "6px", border: `1px solid ${T.border}`, cursor: "pointer", background: "transparent", color: T.muted }}
          title="Swap axes">⇄</button>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: T.muted }}>Size</span>
          <select value={sizeAxis} onChange={e => { setSizeAxis(e.target.value); pinnedRef.current = null; hovRef.current = null; hideTip(); setMobileItem(null); }} style={selectStyle}>
            <option value="none">- None -</option>
            {AXIS_OPTIONS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
        {(hideKids !== true || genderFilter !== "all" || footShape !== "all" || hiddenClosure.size > 0 || hiddenBrands.size > 0 || hiddenLevels.size > 0) && (
          <button onClick={() => { setHideKids(true); setGenderFilter("all"); setFootShape("all"); setHiddenClosure(new Set()); setHiddenBrands(new Set()); setHiddenLevels(new Set()); }}
            style={{ padding: "3px 10px", fontSize: "10px", fontWeight: 700, borderRadius: "5px", border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, letterSpacing: "0.5px" }}>
            ✕ Reset filters
          </button>
        )}
        <label style={{ fontSize: "11px", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
          <input type="checkbox" checked={hideKids} onChange={e => setHideKids(e.target.checked)}
            style={{ accentColor: T.accent, width: "13px", height: "13px" }} />
          Hide kids
        </label>
        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: T.muted, marginRight: "2px" }}>Gender:</span>
          {[["all", "All"], ["unisex", "Unisex"], ["womens", "Women"], ["mens", "Men"]].map(([k, l]) => (
            <button key={k} onClick={() => setGenderFilter(k)} style={filterBtn(genderFilter === k)}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: T.muted, marginRight: "2px" }}>Toe:</span>
          {[["all", "All"], ["egyptian", "Egyptian"], ["roman", "Roman"], ["greek", "Greek"]].map(([k, l]) => (
            <button key={k} onClick={() => setFootShape(k)} style={filterBtn(footShape === k)}>{l}</button>
          ))}
        </div>
      </div>      {/* Color-by toggle + count */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", color: T.muted }}>Color by:</span>
        {[["skill", "Skill Group"], ["level", "Level"], ["closure", "Closure"], ["brand", "Brand"]].map(([k, l]) => (
          <button key={k} onClick={() => setColorBy(k)} style={{
            padding: "3px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "5px", border: "none", cursor: "pointer",
            background: colorBy === k ? "rgba(44,50,39,.08)" : "transparent", color: colorBy === k ? T.text : T.muted,
          }}>{l}</button>
        ))}
        {insightsMode && isEdgingSensitivity && (
          <label style={{ fontSize: "11px", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", marginLeft: "6px" }}>
            <input type="checkbox" checked={showZones} onChange={e => setShowZones(e.target.checked)}
              style={{ accentColor: T.accent, width: "13px", height: "13px" }} />
            Zones
          </label>
        )}
        <span style={{ fontSize: "10px", color: T.muted, marginLeft: "auto" }}>{filtered.length} shown</span>
      </div>

      {/* Canvas */}
      <div style={{ width: "100%", overflow: "hidden" }}>
        <canvas ref={canvasRef} style={{ display: "block", cursor: "crosshair", width: "100%", touchAction: "none" }}
          onMouseMove={handleMove} onMouseLeave={handleLeave} onClick={handleClick}
          onTouchStart={handleTouch} onTouchMove={handleTouch} />
      </div>

      {/* Desktop Tooltip */}
      {!isMobile && <div ref={tipRef} style={TIP_STYLE} />}

      {/* Mobile Bottom Sheet */}
      {isMobile && (
        <BottomSheet item={mobileItem} onClose={closeMobileSheet} sheetRef={sheetRef}
          onNavigate={mobileItem ? () => navigate(`/shoe/${mobileItem.slug}`) : null}>
          {mobileItem && (() => {
            const d = mobileItem;
            const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
            const sOpt = sizeAxis !== "none" ? AXIS_MAP[sizeAxis] : null;
            const shown = new Set([xAxis, yAxis, ...(sizeAxis !== "none" ? [sizeAxis] : [])]);
            const stats = [
              [xOpt.label, xOpt.fmt(d[xAxis])],
              [yOpt.label, yOpt.fmt(d[yAxis])],
              ...(sOpt && d[sizeAxis] != null ? [[sOpt.label, sOpt.fmt(d[sizeAxis])]] : []),
              ...(!shown.has("_edging") ? [["Edging", pct(d._edging)]] : []),
              ...(!shown.has("_sensitivity") ? [["Sensitivity", pct(d._sensitivity)]] : []),
            ].slice(0, 5);
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: getColor(d), flexShrink: 0 }} />
                  <b style={{ color: T.text, fontSize: "13px" }}>{d.brand} {d.model}</b>
                  <span style={{ fontSize: "10px", color: T.muted, marginLeft: "auto", flexShrink: 0 }}>
                    {d.closure} · {d.downturn}{d.price_uvp_eur ? ` · €${d.price_uvp_eur}` : ""}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: "2px 8px" }}>
                  {stats.map(([lbl, val]) => (
                    <div key={lbl} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: T.muted }}>{lbl}</div>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>{val}</div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </BottomSheet>
      )}      {/* Legends */}
      {colorBy === "skill" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {Object.entries(SKILL_GROUP_COLORS).map(([k, c]) => (
            <Pill key={k} color={c} label={SKILL_GROUP_LABELS[k]} />
          ))}
        </div>
      )}
      {colorBy === "closure" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {closureKeys.map(k => (
            <Pill key={k} color={CLOSURE_COLORS[k]} label={k.charAt(0).toUpperCase() + k.slice(1)}
              hidden={hiddenClosure.has(k)} onClick={() => toggleHidden(setHiddenClosure, k)} />
          ))}
        </div>
      )}
      {colorBy === "level" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {LEVEL_ORDER.map(k => (
            <Pill key={k} color={LEVEL_COLORS[k]} label={LEVEL_LABELS[k]}
              hidden={hiddenLevels.has(k)} onClick={() => toggleHidden(setHiddenLevels, k)} />
          ))}
        </div>
      )}
      {colorBy === "brand" && (
        <LegendRow
          items={BRAND_LIST.map(b => ({ key: b, color: BRAND_COLORS[b], label: b }))}
          hiddenSet={hiddenBrands}
          onToggle={(k) => toggleHidden(setHiddenBrands, k)}
          onClearAll={() => setHiddenBrands(prev => prev.size === BRAND_LIST.length ? new Set() : new Set(BRAND_LIST))}
        />
      )}

      {/* Zone guide (only in insights mode when edging_sensitivity + zones visible) */}
      {insightsMode && isEdgingSensitivity && showZones && (
        <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "8px" }}>
          {ZONE_POLYS.map(z => {
            const isAdv = z.side === "adv";
            const bandColor = isAdv ? "#c98a42" : "#34d399";
            return (
              <div key={z.id} style={{
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: "8px",
                padding: "10px 12px", borderLeft: `3px solid ${bandColor}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "14px" }}>{z.emoji}</span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: T.text }}>{z.label}</span>
                  <span style={{
                    fontSize: "9px", fontWeight: 600, padding: "1px 6px", borderRadius: "4px", marginLeft: "auto",
                    background: isAdv ? "rgba(201,138,66,0.15)" : "rgba(52,211,153,0.15)",
                    color: isAdv ? "#c98a42" : "#34d399",
                  }}>{isAdv ? "Advanced–Elite" : "Beginner–Intermediate"}</span>
                </div>
                <div style={{ fontSize: "11px", color: T.muted, lineHeight: 1.6 }}>
                  {ZONE_DESCRIPTIONS[z.id]}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: "6px", textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          {isMobile ? "Tap a dot for specs · Tap legend to filter" : "Click a dot for specs & detail link · Click legend to filter"}
        </span>
        <a href="/methodology" style={{ fontSize: "10px", color: T.accent, textDecoration: "none", fontWeight: 600 }}>How we score →</a>
      </div>
    </ChartContainer>
  );
}