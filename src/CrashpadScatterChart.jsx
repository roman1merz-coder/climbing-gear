import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import CRASHPAD_SEED from "./crashpad_seed_data.json";
import { ChartContainer, Pill, LegendRow, BottomSheet, buildTipHTML, positionTip, TIP_STYLE, getEventCoords, toggleHidden, chartPad, chartH, drawChartArea, drawGrid, drawTicks, drawCountBadge, drawDot, jitter, drawClusterBadges, drawCrosshair, hex2rgb, drawLinearTrend } from "./ChartShared.jsx";

/* Thickness groups */
const THICK_GROUPS = [
  { key: "≤5", label: "≤5 cm", min: 0, max: 5.9, color: "#60a5fa" },
  { key: "6–9", label: "6–9 cm", min: 6, max: 9.9, color: "#22c55e" },
  { key: "10–11", label: "10–11 cm", min: 10, max: 11.9, color: "#c98a42" },
  { key: "12–15", label: "12–15 cm", min: 12, max: 99, color: "#a78bfa" },
];
const thickGroup = cm => THICK_GROUPS.find(g => cm >= g.min && cm <= g.max)?.key || "10–11";
const THICK_COLORS = Object.fromEntries(THICK_GROUPS.map(g => [g.key, g.color]));

/* ─── Data transform (shared by seed fallback + live prop) ─── */
function buildPads(raw) {
  return raw.filter(p => p.length_open_cm && p.width_open_cm && p.weight_kg && p.current_price_eur)
    .map(p => {
      const area = (p.length_open_cm * p.width_open_cm) / 10000;
      const vol = area * (p.thickness_cm || 10) / 100;
      const eurM2 = Math.round(p.current_price_eur / area);
      return {
        brand: p.brand, model: p.model, slug: p.slug,
        area, vol, weight: p.weight_kg, price: p.current_price_eur,
        eurM2, layers: p.foam_layers || 0, fold: p.fold_style || "unknown",
        thickness: p.thickness_cm || 10, tGroup: thickGroup(p.thickness_cm || 10),
        length: p.length_open_cm, width: p.width_open_cm,
        portability: p.portability_score || null,
      };
    });
}
/* Seed fallback (used when no live data prop is passed) */
const SEED_PADS = buildPads(CRASHPAD_SEED);

/* Color palettes */
const LAYER_COLORS = {
  0: "#94a3b8", 1: "#60a5fa", 2: "#22c55e", 3: "#c98a42", 4: "#ef4444", 5: "#a78bfa", 7: "#eab308",
};
const FOLD_COLORS = {
  taco: "#c98a42", hinge: "#60a5fa", tri_fold: "#22c55e", hybrid: "#a78bfa",
  inflatable: "#eab308", baffled: "#94a3b8", unknown: "#6b7280",
};
const BRAND_PAL = ["#63b3ed","#ed64a6","#48bb78","#ecc94b","#ed8936","#9f7aea","#38b2ac","#fc8181","#f6ad55","#68d391","#d53f8c","#4fd1c5","#b794f4","#90cdf4","#feb2b2","#fbd38d","#81e6d9","#c4b5fd","#fca5a5","#bef264"];
function buildBrandColors(pads) {
  const list = [...new Set(pads.map(d => d.brand))].sort();
  return { list, colors: Object.fromEntries(list.map((b, i) => [b, BRAND_PAL[i % BRAND_PAL.length]])) };
}

/* ─── Axis options for free-choice dropdowns ─── */
const AXIS_OPTIONS = [
  { key: "area",       label: "Landing Area (m²)",   unit: "m²",  fmt: v => v.toFixed(2) },
  { key: "weight",     label: "Weight (kg)",          unit: "kg",  fmt: v => v.toFixed(1) },
  { key: "price",      label: "Price (€)",            unit: "€",   fmt: v => "€" + Math.round(v) },
  { key: "eurM2",      label: "Price per m² (€/m²)",  unit: "€/m²",fmt: v => "€" + Math.round(v) },
  { key: "thickness",  label: "Thickness (cm)",       unit: "cm",  fmt: v => v.toFixed(1) },
  { key: "vol",        label: "Volume (m³)",          unit: "m³",  fmt: v => v.toFixed(4) },
  { key: "length",     label: "Length (cm)",           unit: "cm",  fmt: v => String(Math.round(v)) },
  { key: "width",      label: "Width (cm)",            unit: "cm",  fmt: v => String(Math.round(v)) },
  { key: "layers",     label: "Foam Layers",           unit: "",    fmt: v => String(v) },
  { key: "portability",label: "Portability Score",     unit: "",    fmt: v => v.toFixed(1) },
];
const AXIS_MAP = Object.fromEntries(AXIS_OPTIONS.map(a => [a.key, a]));

/* Map old metric keys → x/y pairs for backward-compat initialMetric prop */
const METRIC_TO_AXES = {
  area_weight: { x: "area", y: "weight" },
  area_price:  { x: "area", y: "price" },
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
  const rawStep = range / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  const step = niceSteps.map(s => s * mag).find(s => s >= rawStep) || mag * 10;
  const min = Math.floor(lo / step) * step - step;
  const max = Math.ceil(hi / step) * step + step;
  return { min, max, step };
}

/* ─── Main Component ─── */
export default function CrashpadScatterChart({ isMobile, highlightSlugs, initialMetric, compact, thicknessRange, data }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);
  const jitterMapRef = useRef(new Map());
  const [mobileItem, setMobileItem] = useState(null);

  /* Convert legacy initialMetric to x/y axes */
  const initAxes = METRIC_TO_AXES[initialMetric] || { x: "area", y: "weight" };
  const [xAxis, setXAxis] = useState(initAxes.x);
  const [yAxis, setYAxis] = useState(initAxes.y);
  const [sizeAxis, setSizeAxis] = useState("none");
  const [colorBy, setColorBy] = useState("layers");
  const hlSet = useMemo(() => new Set(highlightSlugs || []), [highlightSlugs]);

  /* ─── Clickable legend filter state ─── */
  const [hiddenLayers, setHiddenLayers] = useState(new Set());
  const [hiddenFolds, setHiddenFolds] = useState(new Set());
  const [hiddenBrands, setHiddenBrands] = useState(new Set());
  const [hiddenThickness, setHiddenThickness] = useState(new Set());

  /* Use live data prop (from Supabase via main.jsx) with seed fallback */
  const PADS = useMemo(() => {
    const src = (data && data.length) ? data : CRASHPAD_SEED;
    return buildPads(src);
  }, [data]);
  const { list: BRAND_LIST, colors: BRAND_COLORS } = useMemo(() => buildBrandColors(PADS), [PADS]);

  /* thicknessRange: optional [min, max] to filter pads by thickness */
  const basePads = useMemo(() => {
    if (!thicknessRange) return PADS;
    const [tMin, tMax] = thicknessRange;
    return PADS.filter(d => d.thickness >= tMin && d.thickness <= tMax);
  }, [thicknessRange]);

  const filteredPads = useMemo(() => basePads.filter(d =>
    !hiddenLayers.has(d.layers) && !hiddenFolds.has(d.fold) && !hiddenBrands.has(d.brand) && !hiddenThickness.has(d.tGroup)
    && d[xAxis] != null && d[yAxis] != null
  ), [basePads, hiddenLayers, hiddenFolds, hiddenBrands, hiddenThickness, xAxis, yAxis]);

  /* Bubble-size scaler */
  const sizeScale = useMemo(() => {
    if (sizeAxis === "none") return null;
    const vals = basePads.filter(r => r[sizeAxis] != null).map(r => r[sizeAxis]);
    if (!vals.length) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const range = hi - lo || 1;
    const minR = isMobile ? 2 : 3, maxR = isMobile ? 12 : 16;
    return (v) => v == null ? (minR + maxR) / 2 : minR + ((v - lo) / range) * (maxR - minR);
  }, [sizeAxis, isMobile, basePads]);

  /* Dynamic axis config from selections */
  const cfg = useMemo(() => {
    const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
    const xb = fieldBounds(filteredPads, xAxis);
    const yb = fieldBounds(filteredPads, yAxis);
    const thickLabel = thicknessRange ? ` (${thicknessRange[0]}–${thicknessRange[1]}cm)` : "";
    return {
      xField: xAxis, xLabel: xOpt.label, xMin: xb.min, xMax: xb.max, xStep: xb.step,
      yField: yAxis, yLabel: yOpt.label, yMin: yb.min, yMax: yb.max, yStep: yb.step,
      sub: `${filteredPads.length} pads${thickLabel} · ${xOpt.label} vs ${yOpt.label}${sizeAxis !== "none" ? ` · size = ${AXIS_MAP[sizeAxis]?.label}` : ""}`,
    };
  }, [filteredPads, xAxis, yAxis, sizeAxis, thicknessRange]);

  /* Dynamic trend */
  const trend = useMemo(() => computeTrend(filteredPads, xAxis, yAxis), [filteredPads, xAxis, yAxis]);

  const getColor = useCallback((d) => {
    if (colorBy === "thickness") return THICK_COLORS[d.tGroup] || "#94a3b8";
    if (colorBy === "brand") return BRAND_COLORS[d.brand] || "#94a3b8";
    if (colorBy === "fold") return FOLD_COLORS[d.fold] || FOLD_COLORS.unknown;
    return LAYER_COLORS[d.layers] || "#94a3b8";
  }, [colorBy, BRAND_COLORS]);
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width, H = chartH(isMobile);
    const PAD = chartPad(isMobile, { l: isMobile ? 48 : 58, r: isMobile ? 28 : 30 });
    canvas.width = W * 2; canvas.height = H * 2;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { xField, xLabel, xMin, xMax, xStep, yField, yLabel, yMin, yMax, yStep } = cfg;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    drawChartArea(ctx, PAD, W, H);
    drawGrid(ctx, PAD, W, H, xMin, xMax, yMin, xStep, yStep, { yMax, fn: sy });

    const xFmt = AXIS_MAP[xField]?.fmt || (x => String(x));
    const yFmt = AXIS_MAP[yField]?.fmt || (y => String(y));
    const firstX = Math.ceil(xMin / xStep) * xStep;
    drawTicks(ctx, PAD, W, H, isMobile, { xMin: firstX, xMax, yMin, yMax, xStep, yStep, xFmt, yFmt, xLabel, yLabel, sxFn: sx, syFn: sy });

    drawCountBadge(ctx, PAD, W, filteredPads.length, "pads");

    /* Trend line */
    if (trend) {
      const r2Str = trend.r2 > 0.01 ? ` · R²=${trend.r2.toFixed(2)}` : "";
      const tLabel = thicknessRange ? `Trend (${thicknessRange[0]}–${thicknessRange[1]}cm)${r2Str}` : `Trend (all pads)${r2Str}`;
      drawLinearTrend(ctx, sx, sy, trend.slope, trend.intercept, trend.std, xMin, xMax, yMin, yMax, { color: "#60a5fa", label: tLabel });
    }

    /* Crosshair */
    const hovered = hovRef.current;
    if (hovered) {
      const hpx = sx(Math.max(xMin, Math.min(xMax, hovered[xField])));
      const hpy = sy(Math.max(yMin, Math.min(yMax, hovered[yField])));
      drawCrosshair(ctx, hpx, hpy, PAD, W, H, xFmt(hovered[xField]), yFmt(hovered[yField]));
    }

    /* Dots */
    const baseSize = isMobile ? 3.5 : 4;
    const pixelPts = [];
    const jMap = new Map();
    const hlDots = [];
    filteredPads.forEach((d, i) => {
      if (d === hovered) return;
      const isHL = hlSet.size > 0 && hlSet.has(d.slug);
      const j = isHL ? { dx: 0, dy: 0 } : jitter(i);
      jMap.set(d.slug, j);
      const px = sx(Math.max(xMin, Math.min(xMax, d[xField]))) + j.dx;
      const py = sy(Math.max(yMin, Math.min(yMax, d[yField]))) + j.dy;
      pixelPts.push({ px, py });
      const sz = sizeScale ? sizeScale(d[sizeAxis]) : (hlSet.size > 0 ? baseSize : Math.max(baseSize, Math.min(7, d.area * 3.5)));
      if (isHL) {
        hlDots.push({ d, px, py, r: sz });
      } else {
        drawDot(ctx, px, py, sz, hlSet.size > 0 ? "#4a5568" : getColor(d), false);
      }
    });
    jitterMapRef.current = jMap;

    if (!sizeScale) drawClusterBadges(ctx, pixelPts);

    /* Highlighted dots */
    const HL_COLOR = "#eab308";
    hlDots.forEach(({ d, px, py, r }) => {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, r + 1, 0, Math.PI * 2);
      ctx.fillStyle = HL_COLOR; ctx.fill();
    });

    /* Hovered dot on top */
    if (hovered) {
      const sz = sizeScale ? sizeScale(hovered[sizeAxis]) : Math.max(baseSize, Math.min(7, hovered.area * 3.5));
      const hpx = sx(Math.max(xMin, Math.min(xMax, hovered[xField])));
      const hpy = sy(Math.max(yMin, Math.min(yMax, hovered[yField])));
      drawDot(ctx, hpx, hpy, sz, getColor(hovered), true);
    }
  }, [xAxis, yAxis, sizeAxis, sizeScale, isMobile, cfg, getColor, filteredPads, hlSet, trend, thicknessRange]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);
  const findClosest = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { clientX, clientY } = getEventCoords(e);
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const W = rect.width, H = chartH(isMobile);
    const P = chartPad(isMobile, { l: isMobile ? 48 : 58, r: isMobile ? 28 : 30 });
    const { xField, yField, xMin, xMax, yMin, yMax } = cfg;
    const sx = x => P.l + (x - xMin) / (xMax - xMin) * (W - P.l - P.r);
    const sy = y => H - P.b - (y - yMin) / (yMax - yMin) * (H - P.t - P.b);
    let closest = null, best = Infinity;
    const threshold = isMobile ? 30 : 24;
    const jMap = jitterMapRef.current;
    filteredPads.forEach(d => {
      const j = jMap.get(d.slug) || { dx: 0, dy: 0 };
      const dx = sx(d[xField]) + j.dx - mx, dy = sy(d[yField]) + j.dy - my, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < threshold && dist < best) { closest = d; best = dist; }
    });
    return closest;
  }, [isMobile, cfg, filteredPads]);

  /* Desktop tooltip — shows selected axis fields + core specs */
  const showTip = useCallback((d, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
    const sOpt = sizeAxis !== "none" ? AXIS_MAP[sizeAxis] : null;
    const stats = [
      { label: xOpt.label.split(" (")[0], value: xOpt.fmt(d[xAxis]) + (xOpt.unit ? " " + xOpt.unit : "") },
      { label: yOpt.label.split(" (")[0], value: yOpt.fmt(d[yAxis]) + (yOpt.unit ? " " + yOpt.unit : "") },
    ];
    if (sOpt && d[sizeAxis] != null) stats.push({ label: sOpt.label.split(" (")[0], value: sOpt.fmt(d[sizeAxis]) + (sOpt.unit ? " " + sOpt.unit : "") });
    const shown = new Set([xAxis, yAxis, ...(sizeAxis !== "none" ? [sizeAxis] : [])]);
    if (!shown.has("area")) stats.push({ label: "Area", value: d.area.toFixed(2) + " m²" });
    if (!shown.has("weight")) stats.push({ label: "Weight", value: d.weight + " kg" });
    if (!shown.has("price")) stats.push({ label: "Price", value: "€" + d.price });
    if (!shown.has("eurM2")) stats.push({ label: "€/m²", value: "€" + d.eurM2 });

    tip.innerHTML = buildTipHTML({
      name: `${d.brand} ${d.model}`,
      color: getColor(d),
      stats: stats.slice(0, 6),
      details: `${d.layers} foam layers · ${d.fold.replace("_", "-")} · ${d.thickness}cm thick`,
      link: `/crashpad/${d.slug}`,
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
      if (a && a.getAttribute("href")?.startsWith("/crashpad/")) { e.preventDefault(); navigate(a.getAttribute("href")); }
    };
    tip.addEventListener("click", onClick);
    return () => tip.removeEventListener("click", onClick);
  }, [navigate]);

  /* ─── Legend data ─── */
  const layerKeys = [...new Set(basePads.map(d => d.layers))].sort((a, b) => a - b);
  const foldKeys = [...new Set(basePads.map(d => d.fold))].filter(k => k !== "unknown").sort();

  /* ─── Styles ─── */
  const selectStyle = {
    padding: "5px 10px", fontSize: "12px", fontWeight: 600, borderRadius: "6px",
    border: `1px solid ${T.border}`, cursor: "pointer", background: T.surface, color: T.text,
    outline: "none", appearance: "none", WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237a7462'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", backgroundSize: "10px 6px",
    paddingRight: "24px", minWidth: isMobile ? "110px" : "140px",
  };

  return (
    <ChartContainer title="Crashpad Spec Deep Dive" subtitle={cfg.sub} isMobile={isMobile}>
      {/* Axis selectors — hidden in compact/highlight mode */}
      {!compact && (
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
      )}

      {/* Color-by toggle + count — hidden in compact/highlight mode */}
      {!compact && <div style={{ display: "flex", gap: "6px", marginBottom: "12px", alignItems: "center", flexWrap: "wrap" }}>
        {(hiddenLayers.size > 0 || hiddenFolds.size > 0 || hiddenBrands.size > 0 || hiddenThickness.size > 0) && (
          <button onClick={() => { setHiddenLayers(new Set()); setHiddenFolds(new Set()); setHiddenBrands(new Set()); setHiddenThickness(new Set()); }}
            style={{ padding: "3px 10px", fontSize: "10px", fontWeight: 700, borderRadius: "5px", border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, letterSpacing: "0.5px" }}>
            ✕ Reset filters
          </button>
        )}
        <span style={{ fontSize: "11px", color: T.muted }}>Color by:</span>
        {["layers", "fold", "thickness", "brand"].map(k => (
          <button key={k} onClick={() => setColorBy(k)} style={{
            padding: "3px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "5px", border: "none", cursor: "pointer",
            background: colorBy === k ? "rgba(44,50,39,.08)" : "transparent", color: colorBy === k ? T.text : T.muted,
          }}>{{ layers: "Foam Layers", fold: "Fold Style", thickness: "Thickness", brand: "Brand" }[k]}</button>
        ))}
        <span style={{ fontSize: "10px", color: T.muted, marginLeft: "auto" }}>{filteredPads.length} shown</span>
      </div>}      {compact && hlSet.size > 0 && (
        <div style={{ display: "flex", gap: "10px", marginBottom: "10px", alignItems: "center", justifyContent: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: T.muted }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4a5568", display: "inline-block" }} /> Foam pads
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#eab308", fontWeight: 600 }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#eab308", display: "inline-block", boxShadow: "0 0 6px rgba(234,179,8,0.5)" }} /> Inflatable
          </span>
          <span style={{ fontSize: "10px", color: T.muted }}>{filteredPads.length} pads</span>
        </div>
      )}

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
          onNavigate={mobileItem ? () => navigate(`/crashpad/${mobileItem.slug}`) : null}>
          {mobileItem && (() => {
            const d = mobileItem;
            const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
            const sOpt = sizeAxis !== "none" ? AXIS_MAP[sizeAxis] : null;
            const shown = new Set([xAxis, yAxis, ...(sizeAxis !== "none" ? [sizeAxis] : [])]);
            const stats = [
              [xOpt.label.split(" (")[0], xOpt.fmt(d[xAxis]) + (xOpt.unit ? " " + xOpt.unit : "")],
              [yOpt.label.split(" (")[0], yOpt.fmt(d[yAxis]) + (yOpt.unit ? " " + yOpt.unit : "")],
              ...(sOpt && d[sizeAxis] != null ? [[sOpt.label.split(" (")[0], sOpt.fmt(d[sizeAxis]) + (sOpt.unit ? " " + sOpt.unit : "")]] : []),
              ...(!shown.has("area") ? [["Area", `${d.area.toFixed(2)} m²`]] : []),
              ...(!shown.has("weight") ? [["Weight", `${d.weight} kg`]] : []),
            ].slice(0, 5);
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: getColor(d), flexShrink: 0 }} />
                  <b style={{ color: T.text, fontSize: "13px" }}>{d.brand} {d.model}</b>
                  <span style={{ fontSize: "10px", color: T.muted, marginLeft: "auto", flexShrink: 0 }}>
                    {d.layers} layers · {d.fold.replace("_", "-")}
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

      {/* Legends — hidden in compact mode */}
      {!compact && colorBy === "layers" && (
        layerKeys.length > 5 ? (
          <LegendRow
            items={layerKeys.map(l => ({ key: l, color: LAYER_COLORS[l] || "#94a3b8", label: `${l} layer${l !== 1 ? "s" : ""}` }))}
            hiddenSet={hiddenLayers}
            onToggle={(k) => toggleHidden(setHiddenLayers, k)}
            onClearAll={() => setHiddenLayers(prev => prev.size === layerKeys.length ? new Set() : new Set(layerKeys))}
          />
        ) : (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
            {layerKeys.map(l => (
              <Pill key={l} color={LAYER_COLORS[l] || "#94a3b8"} label={`${l} layer${l !== 1 ? "s" : ""}`}
                hidden={hiddenLayers.has(l)} onClick={() => toggleHidden(setHiddenLayers, l)} />
            ))}
          </div>
        )
      )}
      {!compact && colorBy === "fold" && (
        foldKeys.length > 5 ? (
          <LegendRow
            items={foldKeys.map(k => ({ key: k, color: FOLD_COLORS[k] || "#6b7280", label: k.replace("_", "-") }))}
            hiddenSet={hiddenFolds}
            onToggle={(k) => toggleHidden(setHiddenFolds, k)}
            onClearAll={() => setHiddenFolds(prev => prev.size === foldKeys.length ? new Set() : new Set(foldKeys))}
          />
        ) : (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
            {foldKeys.map(k => (
              <Pill key={k} color={FOLD_COLORS[k] || "#6b7280"} label={k.replace("_", "-")}
                hidden={hiddenFolds.has(k)} onClick={() => toggleHidden(setHiddenFolds, k)} />
            ))}
          </div>
        )
      )}

      {!compact && colorBy === "thickness" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {THICK_GROUPS.map(g => (
            <Pill key={g.key} color={g.color} label={g.label}
              hidden={hiddenThickness.has(g.key)} onClick={() => toggleHidden(setHiddenThickness, g.key)} />
          ))}
        </div>
      )}

      {!compact && colorBy === "brand" && (
        <LegendRow
          items={BRAND_LIST.map(b => ({ key: b, color: BRAND_COLORS[b], label: b }))}
          hiddenSet={hiddenBrands}
          onToggle={(k) => toggleHidden(setHiddenBrands, k)}
          onClearAll={() => setHiddenBrands(prev => prev.size === BRAND_LIST.length ? new Set() : new Set(BRAND_LIST))}
        />
      )}

      <div style={{ marginTop: "6px", textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          {isMobile ? "Tap a dot for specs · Tap legend to filter" : "Click a dot for specs & detail link · Click legend to filter"}
          {trend && ` · Trend R²=${trend.r2.toFixed(2)}`}
        </span>
        <a href="/methodology" style={{ fontSize: "10px", color: T.accent, textDecoration: "none", fontWeight: 600 }}>How we score →</a>
      </div>
    </ChartContainer>
  );
}