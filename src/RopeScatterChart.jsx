import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import ROPE_SEED from "./rope_seed_data.json";
import { ChartContainer, Pill, LegendRow, BottomSheet, buildTipHTML, positionTip, TIP_STYLE, getEventCoords, toggleHidden, chartPad, chartH, drawChartArea, drawGrid, drawTicks, drawCountBadge, jitter, drawClusterBadges, drawCrosshair, hex2rgb, rrect, drawLinearTrend } from "./ChartShared.jsx";

/* ─── Color palettes ─── */
const TYPE_COLORS = { single: "#60a5fa", half: "#ed64a6", twin: "#34d399", static: "#ecc94b" };
const DRY_COLORS = { none: "#94a3b8", sheath: "#60a5fa", sheath_only: "#60a5fa", core: "#a78bfa", core_and_sheath: "#34d399", full_impregnation: "#c98a42" };
const DIA_GROUPS = [
  { key: "≤8.7", label: "≤8.7mm", min: 0, max: 8.74, color: "#a78bfa" },
  { key: "8.8–9.1", label: "8.8–9.1mm", min: 8.75, max: 9.14, color: "#60a5fa" },
  { key: "9.1–9.4", label: "9.1–9.4mm", min: 9.15, max: 9.44, color: "#38bdf8" },
  { key: "9.5–9.8", label: "9.5–9.8mm", min: 9.45, max: 9.84, color: "#22c55e" },
  { key: "9.9–10.2", label: "9.9–10.2mm", min: 9.85, max: 10.24, color: "#c98a42" },
  { key: "≥10.3", label: "≥10.3mm", min: 10.25, max: 99, color: "#ef4444" },
];
const diaGroup = mm => DIA_GROUPS.find(g => mm >= g.min && mm <= g.max)?.key || "9.5–9.8";
const DIA_COLORS = Object.fromEntries(DIA_GROUPS.map(g => [g.key, g.color]));
const BRAND_PAL = [
  "#63b3ed","#ed64a6","#48bb78","#ecc94b","#ed8936","#9f7aea","#38b2ac","#fc8181",
  "#f6ad55","#68d391","#d53f8c","#4fd1c5","#b794f4","#90cdf4","#feb2b2","#fbd38d",
  "#81e6d9","#c4b5fd","#fca5a5","#bef264","#e879f9","#67e8f9",
];

/* Pre-filter ropes — static ropes excluded from frontend for now */
const ALL_ROPES = ROPE_SEED.filter(r => r.diameter_mm && r.weight_per_meter_g && r.rope_type !== "static")
  .map(r => ({
    brand: r.brand, model: r.model, slug: r.slug,
    dia: r.diameter_mm, falls: r.uiaa_falls, gm: r.weight_per_meter_g,
    impact: r.impact_force_kn, breakStr: r.breaking_strength_kn,
    staticElong: r.static_elongation_pct || null,
    dynElong: r.dynamic_elongation_pct || null,
    dry: r.dry_treatment || "none",
    triple: !!r.triple_rated, sheath: r.sheath_percentage,
    type: r.rope_type || "single",
    price: r.price_per_meter_eur_min || null,
    fpg: (r.uiaa_falls && r.weight_per_meter_g) ? r.uiaa_falls / r.weight_per_meter_g : null,
    eurPerM: r.price_per_meter_eur_min || null,
  }));

/* ─── Axis options for free-choice dropdowns ─── */
const AXIS_OPTIONS = [
  { key: "dia",         label: "Diameter (mm)",            unit: "mm",  fmt: v => v.toFixed(1) },
  { key: "gm",          label: "Weight (g/m)",             unit: "g/m", fmt: v => String(Math.round(v)) },
  { key: "falls",       label: "UIAA Falls",               unit: "",    fmt: v => String(v) },
  { key: "impact",      label: "Impact Force (kN)",         unit: "kN",  fmt: v => v.toFixed(1) },
  { key: "staticElong", label: "Static Elongation (%)",     unit: "%",   fmt: v => v.toFixed(1) },
  { key: "dynElong",    label: "Dynamic Elongation (%)",    unit: "%",   fmt: v => v.toFixed(1) },
  { key: "sheath",      label: "Sheath (%)",                unit: "%",   fmt: v => String(Math.round(v)) },
  { key: "eurPerM",     label: "Price (€/m)",               unit: "€/m", fmt: v => "€" + v.toFixed(2) },
  { key: "fpg",         label: "Falls per g/m",             unit: "",    fmt: v => v.toFixed(3) },
  { key: "breakStr",    label: "Break Strength (kN)",       unit: "kN",  fmt: v => v.toFixed(1) },
];
const AXIS_MAP = Object.fromEntries(AXIS_OPTIONS.map(a => [a.key, a]));

/* Map old metric keys → x/y pairs for backward-compat initialMetric prop */
const METRIC_TO_AXES = {
  fpgVsPrice: { x: "eurPerM", y: "falls" },
  fpgVsCpg:   { x: "eurPerM", y: "fpg" },
  fallsVsGm:  { x: "gm",     y: "falls" },
  falls:      { x: "dia",    y: "falls" },
  gm:         { x: "dia",    y: "gm" },
  breakStr:   { x: "dia",    y: "breakStr" },
};

/* ─── Compute linear trend on the fly for any x/y combo ─── */
function computeTrend(data, xKey, yKey) {
  const pts = data.filter(r => r[xKey] != null && r[yKey] != null);
  if (pts.length < 4) return null;
  const n = pts.length;
  const mx = pts.reduce((s, r) => s + r[xKey], 0) / n;
  const my = pts.reduce((s, r) => s + r[yKey], 0) / n;
  let num = 0, den = 0;
  pts.forEach(r => { num += (r[xKey] - mx) * (r[yKey] - my); den += (r[xKey] - mx) ** 2; });
  if (Math.abs(den) < 1e-10) return null;
  const slope = num / den, intercept = my - slope * mx;
  const ss = pts.reduce((s, r) => s + (r[yKey] - (slope * r[xKey] + intercept)) ** 2, 0);
  const std = Math.sqrt(ss / (n - 2));
  // R² for label
  const ssTot = pts.reduce((s, r) => s + (r[yKey] - my) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ss / ssTot : 0;
  return { slope, intercept, std, r2 };
}

/* ─── Dynamic axis bounds for a given field ─── */
function fieldBounds(data, key) {
  const vals = data.filter(r => r[key] != null).map(r => r[key]);
  if (!vals.length) return { min: 0, max: 10, step: 1 };
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || 1;
  // Pick a nice step
  const rawStep = range / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  const step = niceSteps.map(s => s * mag).find(s => s >= rawStep) || mag * 10;
  const min = Math.floor(lo / step) * step - step;
  const max = Math.ceil(hi / step) * step + step;
  return { min, max, step };
}

/* ─── Main Component ─── */
export default function RopeScatterChart({ isMobile, initialMetric, initialColorBy }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);

  /* Convert legacy initialMetric to x/y axes */
  const initAxes = METRIC_TO_AXES[initialMetric] || { x: "dynElong", y: "impact" };
  const [xAxis, setXAxis] = useState(initAxes.x);
  const [yAxis, setYAxis] = useState(initAxes.y);
  const [sizeAxis, setSizeAxis] = useState("none"); // optional bubble size
  const [colorBy, setColorBy] = useState(initialColorBy || "type");
  const [mobileItem, setMobileItem] = useState(null);

  /* Filter state */
  const [enabledTypes, setEnabledTypes] = useState(new Set(["single"]));
  const onlyStatic = false; // static ropes excluded from frontend
  const hasStatic = false;

  const [hiddenBrands, setHiddenBrands] = useState(new Set());
  const [hiddenDry, setHiddenDry] = useState(new Set());
  const [hiddenDia, setHiddenDia] = useState(new Set());

  const toggleType = (t) => setEnabledTypes(prev => {
    const next = new Set(prev);
    next.has(t) ? next.delete(t) : next.add(t);
    return next;
  });

  /* Brand list & colors */
  const BRAND_LIST = useMemo(() => [...new Set(ALL_ROPES.map(r => r.brand))].sort(), []);
  const BRAND_COLORS = useMemo(() => Object.fromEntries(BRAND_LIST.map((b, i) => [b, BRAND_PAL[i % BRAND_PAL.length]])), [BRAND_LIST]);

  /* Dry treatment labels */
  const DRY_LABELS = { none: "Untreated", sheath: "Sheath", sheath_only: "Sheath", core: "Core", core_and_sheath: "Core + Sheath", full_impregnation: "Full" };
  const DRY_LIST = useMemo(() => [...new Set(ALL_ROPES.map(r => r.dry))].sort(), []);

  /* Bubble-size scaler: maps field value → radius in [minR, maxR] */
  const sizeScale = useMemo(() => {
    if (sizeAxis === "none") return null;
    const vals = ALL_ROPES.filter(r => r[sizeAxis] != null).map(r => r[sizeAxis]);
    if (!vals.length) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const range = hi - lo || 1;
    const minR = isMobile ? 2 : 3, maxR = isMobile ? 12 : 16;
    return (v) => v == null ? (minR + maxR) / 2 : minR + ((v - lo) / range) * (maxR - minR);
  }, [sizeAxis, isMobile]);

  /* Apply filters — exclude ropes missing either axis value */
  const filtered = useMemo(() => ALL_ROPES.filter(r => {
    if (!enabledTypes.has(r.type)) return false;
    if (hiddenBrands.has(r.brand)) return false;
    if (hiddenDry.has(r.dry)) return false;
    if (hiddenDia.has(diaGroup(r.dia))) return false;
    if (r[xAxis] == null || r[yAxis] == null) return false;
    return true;
  }), [enabledTypes, hiddenBrands, hiddenDry, hiddenDia, xAxis, yAxis]);

  /* Dynamic axis config from selections */
  const cfg = useMemo(() => {
    const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
    const xb = fieldBounds(filtered, xAxis);
    const yb = fieldBounds(filtered, yAxis);
    return {
      xField: xAxis, xLabel: xOpt.label, xMin: xb.min, xMax: xb.max, xStep: xb.step,
      yField: yAxis, yLabel: yOpt.label, yMin: yb.min, yMax: yb.max, yStep: yb.step,
      sub: `${filtered.length} ropes · ${xOpt.label} vs ${yOpt.label}${sizeAxis !== "none" ? ` · size = ${AXIS_MAP[sizeAxis]?.label}` : ""}`,
    };
  }, [filtered, xAxis, yAxis, sizeAxis]);

  /* Linear trend for single ropes */
  const trend = useMemo(() => {
    const singles = filtered.filter(r => r.type === "single");
    return computeTrend(singles, xAxis, yAxis);
  }, [filtered, xAxis, yAxis]);

  /* Color function */
  const getColor = useCallback((r) => {
    if (colorBy === "diameter") return DIA_COLORS[diaGroup(r.dia)] || "#94a3b8";
    if (colorBy === "type") return TYPE_COLORS[r.type] || "#94a3b8";
    if (colorBy === "dry") return DRY_COLORS[r.dry] || "#94a3b8";
    return BRAND_COLORS[r.brand] || "#94a3b8";
  }, [colorBy, BRAND_COLORS]);

  /* Shape: circle=single, diamond=half, triangle=twin, square=static — with glow */
  const drawShape = useCallback((ctx, r, px, py, size, isHovered) => {
    const hex = getColor(r);
    const [cr, cg, cb] = hex2rgb(hex);

    // Glow
    ctx.shadowColor = `rgba(${cr},${cg},${cb},${isHovered ? 0.6 : 0.35})`;
    ctx.shadowBlur = isHovered ? 14 : 6;

    const fill = `rgba(${cr},${cg},${cb},${isHovered ? 1 : 0.85})`;
    ctx.fillStyle = fill;

    if (isHovered) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    }

    if (r.type === "half") {
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
      const s = isHovered ? size * 1.3 : size * 0.85;
      ctx.beginPath(); ctx.rect(-s, -s, s * 2, s * 2); ctx.fill();
      if (isHovered) ctx.stroke();
      ctx.restore();
    } else if (r.type === "twin") {
      const s = isHovered ? size * 1.5 : size;
      ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s, py + s * 0.7); ctx.lineTo(px - s, py + s * 0.7); ctx.closePath();
      ctx.fill(); if (isHovered) ctx.stroke();
    } else if (r.type === "static") {
      const s = isHovered ? size * 1.3 : size * 0.85;
      ctx.beginPath(); ctx.rect(px - s, py - s, s * 2, s * 2); ctx.fill();
      if (isHovered) ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(px, py, isHovered ? size * 1.6 : (isMobile ? size * 1.2 : size), 0, Math.PI * 2);
      ctx.fill(); if (isHovered) ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // Extra hover rings for single (circle) type
    if (isHovered && r.type === "single") {
      ctx.strokeStyle = "rgba(44,50,39,.12)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, size * 1.6 + 5, 0, Math.PI * 2); ctx.stroke();
    }
  }, [getColor, isMobile]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width, H = chartH(isMobile);
    const PAD = chartPad(isMobile, { l: isMobile ? 50 : 58 });
    canvas.width = W * 2; canvas.height = H * 2;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { xField, xLabel, xMin, xMax, xStep, yField, yMin, yMax, yStep } = cfg;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    // Chart area frame
    drawChartArea(ctx, PAD, W, H);

    // Grid
    drawGrid(ctx, PAD, W, H, xMin, xMax, yMin, xStep, yStep, { yMax, fn: sy });

    // Ticks + axis labels
    const xFmt = AXIS_MAP[xField]?.fmt || (x => String(x));
    const yFmt = AXIS_MAP[yField]?.fmt || (y => String(y));
    const firstX = Math.ceil(xMin / xStep) * xStep;
    drawTicks(ctx, PAD, W, H, isMobile, { xMin: firstX, xMax, yMin, yMax, xStep, yStep, xFmt, yFmt, xLabel, yLabel: cfg.yLabel, sxFn: sx, syFn: sy });

    // Data count badge
    drawCountBadge(ctx, PAD, W, filtered.length, "ropes");

    // Linear trend for single ropes (computed dynamically for any axis combo)
    if (enabledTypes.has("single") && trend) {
      const r2Str = trend.r2 > 0.01 ? ` · R²=${trend.r2.toFixed(2)}` : "";
      drawLinearTrend(ctx, sx, sy, trend.slope, trend.intercept, trend.std, xMin, xMax, yMin, yMax, { color: T.accent, label: `Trend (single)${r2Str}` });
    }

    // Crosshair for hovered dot
    const hovered = hovRef.current;
    if (hovered && filtered.includes(hovered)) {
      const hpx = sx(hovered[xField]), hpy = sy(hovered[yField]);
      drawCrosshair(ctx, hpx, hpy, PAD, W, H, xFmt(hovered[xField]), yFmt(hovered[yField]));
    }

    // Dots with glow + jitter — size driven by optional bubble axis
    const baseSize = isMobile ? 3 : 4;
    const pixelPts = [];
    filtered.filter(r => r !== hovered).forEach((r, i) => {
      const j = jitter(i);
      const px = sx(r[xField]) + j.dx, py = sy(r[yField]) + j.dy;
      pixelPts.push({ px, py });
      const sz = sizeScale ? sizeScale(r[sizeAxis]) : baseSize;
      drawShape(ctx, r, px, py, sz, false);
    });

    // Cluster badges (only when bubbles are uniform)
    if (!sizeScale) drawClusterBadges(ctx, pixelPts);

    // Hovered dot on top
    if (hovered && filtered.includes(hovered)) {
      const px = sx(hovered[xField]), py = sy(hovered[yField]);
      const sz = sizeScale ? sizeScale(hovered[sizeAxis]) : baseSize;
      drawShape(ctx, hovered, px, py, sz, true);
    }
  }, [xAxis, yAxis, sizeAxis, sizeScale, isMobile, cfg, filtered, enabledTypes, trend, drawShape]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);

  const findClosest = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { clientX, clientY } = getEventCoords(e);
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const W = rect.width, H = chartH(isMobile);
    const P = chartPad(isMobile, { l: isMobile ? 50 : 58 });
    const sx = x => P.l + (x - cfg.xMin) / (cfg.xMax - cfg.xMin) * (W - P.l - P.r);
    const sy = y => H - P.b - (y - cfg.yMin) / (cfg.yMax - cfg.yMin) * (H - P.t - P.b);
    let closest = null, best = Infinity;
    const threshold = isMobile ? 30 : 20;
    filtered.forEach(r => {
      const dx = sx(r[cfg.xField]) - mx, dy = sy(r[cfg.yField]) - my, d = Math.sqrt(dx * dx + dy * dy);
      if (d < threshold && d < best) { closest = r; best = d; }
    });
    return closest;
  }, [isMobile, cfg, filtered]);

  /* Desktop tooltip — shows axis-selected fields prominently + core specs */
  const showTip = useCallback((r, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    const typeLabel = r.type.charAt(0).toUpperCase() + r.type.slice(1);
    const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
    const sOpt = sizeAxis !== "none" ? AXIS_MAP[sizeAxis] : null;
    const stats = [
      { label: xOpt.label.split(" (")[0], value: xOpt.fmt(r[xAxis]) + (xOpt.unit ? " " + xOpt.unit : "") },
      { label: yOpt.label.split(" (")[0], value: yOpt.fmt(r[yAxis]) + (yOpt.unit ? " " + yOpt.unit : "") },
    ];
    if (sOpt && r[sizeAxis] != null) stats.push({ label: sOpt.label.split(" (")[0], value: sOpt.fmt(r[sizeAxis]) + (sOpt.unit ? " " + sOpt.unit : "") });
    // Add core specs not already shown
    const shown = new Set([xAxis, yAxis, ...(sizeAxis !== "none" ? [sizeAxis] : [])]);
    if (!shown.has("dia")) stats.push({ label: "Diameter", value: r.dia + " mm" });
    if (!shown.has("gm")) stats.push({ label: "Weight", value: r.gm + " g/m" });
    if (!shown.has("falls") && r.falls) stats.push({ label: "Falls", value: String(r.falls) });
    if (!shown.has("eurPerM") && r.eurPerM) stats.push({ label: "€/m", value: "€" + r.eurPerM.toFixed(2) });

    const dry = (r.dry || "none").replace(/_/g, " ");
    tip.innerHTML = buildTipHTML({
      name: `${r.brand} ${r.model}`,
      color: getColor(r),
      stats: stats.slice(0, 6),
      details: `${typeLabel} · Dry: ${dry}${r.triple ? " · Triple rated" : ""}`,
      link: `/rope/${r.slug}`,
      pinned,
    });
    positionTip(tip, x, y, pinned);
  }, [getColor, xAxis, yAxis, sizeAxis]);

  const hideTip = useCallback(() => {
    const tip = tipRef.current;
    if (tip) { tip.style.opacity = "0"; tip.style.pointerEvents = "none"; }
  }, []);

  /* Mouse handlers (desktop) */
  const handleMove = useCallback((e) => {
    if (isMobile || pinnedRef.current) return;
    const r = findClosest(e);
    if (r !== hovRef.current) { hovRef.current = r; draw(); }
    if (r) showTip(r, e.clientX, e.clientY, false); else hideTip();
  }, [isMobile, findClosest, draw, showTip, hideTip]);

  const handleLeave = useCallback(() => {
    if (isMobile || pinnedRef.current) return;
    hovRef.current = null; draw(); hideTip();
  }, [isMobile, draw, hideTip]);

  const handleClick = useCallback((e) => {
    if (isMobile) return;
    const r = findClosest(e);
    if (pinnedRef.current === r) {
      pinnedRef.current = null; hovRef.current = null; draw(); hideTip();
    } else if (r) {
      pinnedRef.current = r; hovRef.current = r; draw();
      showTip(r, e.clientX, e.clientY, true);
    } else {
      pinnedRef.current = null; hovRef.current = null; draw(); hideTip();
    }
  }, [isMobile, findClosest, draw, showTip, hideTip]);

  /* Touch handlers (mobile) */
  const handleTouch = useCallback((e) => {
    if (!isMobile) return;
    e.preventDefault();
    const r = findClosest(e);
    if (r) { hovRef.current = r; draw(); setMobileItem(r); }
    else { hovRef.current = null; draw(); setMobileItem(null); }
  }, [isMobile, findClosest, draw]);

  const closeMobileSheet = useCallback(() => {
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
    const tip = tipRef.current;
    if (!tip) return;
    const onClick = (e) => {
      const a = e.target.closest("a");
      if (a && a.getAttribute("href")?.startsWith("/rope/")) { e.preventDefault(); navigate(a.getAttribute("href")); }
    };
    tip.addEventListener("click", onClick);
    return () => tip.removeEventListener("click", onClick);
  }, [navigate]);

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
  });

  const TYPE_SHAPES = { single: "circle", half: "diamond", twin: "triangle", static: "square" };

  return (
    <ChartContainer title="Rope Spec Deep Dive" subtitle={cfg.sub} isMobile={isMobile}>
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
            <option value="none">— None —</option>
            {AXIS_OPTIONS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>
      </div>

      {/* Rope type filter */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
        {(hiddenBrands.size > 0 || hiddenDry.size > 0 || hiddenDia.size > 0 || !(enabledTypes.has("single") && !enabledTypes.has("half") && !enabledTypes.has("twin"))) && (
          <button onClick={() => { setEnabledTypes(new Set(["single"])); setHiddenBrands(new Set()); setHiddenDry(new Set()); setHiddenDia(new Set()); }}
            style={{ padding: "3px 10px", fontSize: "10px", fontWeight: 700, borderRadius: "5px", border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, letterSpacing: "0.5px" }}>
            ✕ Reset filters
          </button>
        )}
        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: T.muted, marginRight: "2px" }}>Type:</span>
          {[["single", "Single"], ["half", "Half"], ["twin", "Twin"]].map(([k, l]) => (
            <button key={k} onClick={() => toggleType(k)} style={filterBtn(enabledTypes.has(k))}>{l}</button>
          ))}
        </div>
      </div>

      {/* Color-by toggle + count */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: T.muted }}>Color by:</span>
        {[["diameter", "Diameter"], ["type", "Rope Type"], ["dry", "Treatment"], ["brand", "Brand"]].map(([k, l]) => (
          <button key={k} onClick={() => setColorBy(k)} style={{
            padding: "3px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "5px", border: "none", cursor: "pointer",
            background: colorBy === k ? "rgba(44,50,39,.08)" : "transparent", color: colorBy === k ? T.text : T.muted,
          }}>{l}</button>
        ))}
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
        <BottomSheet item={mobileItem} onClose={closeMobileSheet}
          onNavigate={mobileItem ? () => navigate(`/rope/${mobileItem.slug}`) : null}>
          {mobileItem && (() => {
            const r = mobileItem;
            const typeLabel = r.type.charAt(0).toUpperCase() + r.type.slice(1);
            const dry = (r.dry || "none").replace(/_/g, " ");
            const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
            const sOpt = sizeAxis !== "none" ? AXIS_MAP[sizeAxis] : null;
            const shown = new Set([xAxis, yAxis, ...(sizeAxis !== "none" ? [sizeAxis] : [])]);
            const stats = [
              [xOpt.label.split(" (")[0], xOpt.fmt(r[xAxis]) + (xOpt.unit ? " " + xOpt.unit : "")],
              [yOpt.label.split(" (")[0], yOpt.fmt(r[yAxis]) + (yOpt.unit ? " " + yOpt.unit : "")],
              ...(sOpt && r[sizeAxis] != null ? [[sOpt.label.split(" (")[0], sOpt.fmt(r[sizeAxis]) + (sOpt.unit ? " " + sOpt.unit : "")]] : []),
              ...(!shown.has("dia") ? [["Dia", `${r.dia} mm`]] : []),
              ...(!shown.has("gm") ? [["Weight", `${r.gm} g/m`]] : []),
            ].slice(0, 5);
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: getColor(r), flexShrink: 0 }} />
                  <b style={{ color: T.text, fontSize: "13px" }}>{r.brand} {r.model}</b>
                  <span style={{ fontSize: "10px", color: T.muted, marginLeft: "auto", flexShrink: 0 }}>
                    {typeLabel} · {dry}{r.triple ? " · Triple" : ""}
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
      )}

      {/* Legends */}
      {colorBy === "diameter" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {DIA_GROUPS.map(g => (
            <Pill key={g.key} color={g.color} label={g.label}
              hidden={hiddenDia.has(g.key)} onClick={() => toggleHidden(setHiddenDia, g.key)} />
          ))}
        </div>
      )}
      {colorBy === "type" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {Object.entries(TYPE_COLORS).filter(([k]) => enabledTypes.has(k)).map(([k, c]) => (
            <Pill key={k} color={c} label={k.charAt(0).toUpperCase() + k.slice(1)} shape={TYPE_SHAPES[k]} hidden={false} onClick={() => toggleType(k)} />
          ))}
        </div>
      )}
      {colorBy === "dry" && (
        DRY_LIST.length > 5 ? (
          <LegendRow
            items={DRY_LIST.map(k => ({ key: k, color: DRY_COLORS[k] || "#94a3b8", label: DRY_LABELS[k] || k }))}
            hiddenSet={hiddenDry}
            onToggle={(k) => toggleHidden(setHiddenDry, k)}
            onClearAll={() => setHiddenDry(prev => prev.size === DRY_LIST.length ? new Set() : new Set(DRY_LIST))}
          />
        ) : (
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
            {DRY_LIST.map(k => (
              <Pill key={k} color={DRY_COLORS[k] || "#94a3b8"} label={DRY_LABELS[k] || k}
                hidden={hiddenDry.has(k)} onClick={() => toggleHidden(setHiddenDry, k)} />
            ))}
          </div>
        )
      )}
      {colorBy === "brand" && (
        <LegendRow
          items={BRAND_LIST.map(b => ({ key: b, color: BRAND_COLORS[b], label: b }))}
          hiddenSet={hiddenBrands}
          onToggle={(k) => toggleHidden(setHiddenBrands, k)}
          onClearAll={() => setHiddenBrands(prev => prev.size === BRAND_LIST.length ? new Set() : new Set(BRAND_LIST))}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", flexWrap: "wrap", gap: "4px" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          {isMobile ? "Tap a dot for specs · Tap legend to filter" : "Click a dot for specs & link · Click legend to filter"}
          {enabledTypes.has("single") && trend && " · Trend line = single ropes only"}
        </span>
        <span style={{ fontSize: "10px", color: "#4a5568", display: "flex", alignItems: "center", gap: "8px" }}>
          {enabledTypes.has("half") && "◇ Half"}{enabledTypes.has("half") && enabledTypes.has("twin") && " · "}{enabledTypes.has("twin") && "△ Twin"}
          <a href="/methodology" style={{ fontSize: "10px", color: T.accent, textDecoration: "none", fontWeight: 600 }}>How we score →</a>
        </span>
      </div>
    </ChartContainer>
  );
}
