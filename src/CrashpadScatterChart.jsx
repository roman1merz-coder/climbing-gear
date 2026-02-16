import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import CRASHPAD_SEED from "./crashpad_seed_data.json";
import { ChartContainer, Pill, LegendRow, BottomSheet, buildTipHTML, positionTip, TIP_STYLE, getEventCoords, toggleHidden, chartPad, chartH, drawChartArea, drawGrid, drawTicks, drawCountBadge, drawDot, jitter, drawClusterBadges, drawCrosshair, hex2rgb, drawLinearTrend } from "./ChartShared.jsx";

/* Thickness groups */
const THICK_GROUPS = [
  { key: "≤5", label: "≤5 cm", min: 0, max: 5.9, color: "#60a5fa" },
  { key: "6–9", label: "6–9 cm", min: 6, max: 9.9, color: "#22c55e" },
  { key: "10–11", label: "10–11 cm", min: 10, max: 11.9, color: "#E8734A" },
  { key: "12–15", label: "12–15 cm", min: 12, max: 99, color: "#a78bfa" },
];
const thickGroup = cm => THICK_GROUPS.find(g => cm >= g.min && cm <= g.max)?.key || "10–11";
const THICK_COLORS = Object.fromEntries(THICK_GROUPS.map(g => [g.key, g.color]));

/* ─── Data ─── */
const PADS = CRASHPAD_SEED.filter(p => p.length_open_cm && p.width_open_cm && p.weight_kg && p.current_price_eur)
  .map(p => {
    const area = (p.length_open_cm * p.width_open_cm) / 10000;
    const vol = area * (p.thickness_cm || 10) / 100;
    const eurM2 = Math.round(p.current_price_eur / area);
    return {
      brand: p.brand, model: p.model, slug: p.slug,
      area, vol, weight: p.weight_kg, price: p.current_price_eur,
      eurM2, layers: p.foam_layers || 0, fold: p.fold_style || "unknown",
      thickness: p.thickness_cm || 10, tGroup: thickGroup(p.thickness_cm || 10),
    };
  });

/* ─── Pre-computed linear regressions ─── */
function linReg(data, xFn, yFn) {
  const n = data.length;
  const mx = data.reduce((s, d) => s + xFn(d), 0) / n;
  const my = data.reduce((s, d) => s + yFn(d), 0) / n;
  let num = 0, den = 0;
  data.forEach(d => { num += (xFn(d) - mx) * (yFn(d) - my); den += (xFn(d) - mx) ** 2; });
  const slope = num / den, intercept = my - slope * mx;
  const std = Math.sqrt(data.reduce((s, d) => s + (yFn(d) - (slope * xFn(d) + intercept)) ** 2, 0) / (n - 2));
  return { slope, intercept, std };
}
const PAD_TREND_WEIGHT = linReg(PADS, d => d.area, d => d.weight);
const PAD_TREND_PRICE = linReg(PADS, d => d.area, d => d.price);

/* Color palettes */
const LAYER_COLORS = {
  0: "#94a3b8", 1: "#60a5fa", 2: "#22c55e", 3: "#E8734A", 4: "#ef4444", 5: "#a78bfa", 7: "#eab308",
};
const FOLD_COLORS = {
  taco: "#E8734A", hinge: "#60a5fa", tri_fold: "#22c55e", hybrid: "#a78bfa",
  inflatable: "#eab308", baffled: "#94a3b8", unknown: "#6b7280",
};
const BRAND_PAL = ["#63b3ed","#ed64a6","#48bb78","#ecc94b","#ed8936","#9f7aea","#38b2ac","#fc8181","#f6ad55","#68d391","#d53f8c","#4fd1c5","#b794f4","#90cdf4","#feb2b2","#fbd38d","#81e6d9","#c4b5fd","#fca5a5","#bef264"];
const BRAND_LIST = [...new Set(PADS.map(d => d.brand))].sort();
const BRAND_COLORS = Object.fromEntries(BRAND_LIST.map((b, i) => [b, BRAND_PAL[i % BRAND_PAL.length]]));

/* ─── Main Component ─── */
export default function CrashpadScatterChart({ isMobile, highlightSlugs, initialMetric, compact, thicknessRange }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const [metric, setMetric] = useState(initialMetric || "area_weight");
  const [colorBy, setColorBy] = useState("layers");
  const hlSet = useMemo(() => new Set(highlightSlugs || []), [highlightSlugs]);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);
  const jitterMapRef = useRef(new Map()); // slug → {dx, dy} for hit detection
  const [mobileItem, setMobileItem] = useState(null);

  /* ─── Clickable legend filter state ─── */
  const [hiddenLayers, setHiddenLayers] = useState(new Set());
  const [hiddenFolds, setHiddenFolds] = useState(new Set());
  const [hiddenBrands, setHiddenBrands] = useState(new Set());
  const [hiddenThickness, setHiddenThickness] = useState(new Set());

  /* thicknessRange: optional [min, max] to filter pads by thickness (e.g. [10, 16]) */
  const basePads = useMemo(() => {
    if (!thicknessRange) return PADS;
    const [tMin, tMax] = thicknessRange;
    return PADS.filter(d => d.thickness >= tMin && d.thickness <= tMax);
  }, [thicknessRange]);

  const filteredPads = useMemo(() => basePads.filter(d =>
    !hiddenLayers.has(d.layers) && !hiddenFolds.has(d.fold) && !hiddenBrands.has(d.brand) && !hiddenThickness.has(d.tGroup)
  ), [basePads, hiddenLayers, hiddenFolds, hiddenBrands, hiddenThickness]);

  /* Recompute trend lines based on basePads (respects thickness filter) */
  const trendWeight = useMemo(() => linReg(basePads, d => d.area, d => d.weight), [basePads]);
  const trendPrice = useMemo(() => linReg(basePads, d => d.area, d => d.price), [basePads]);

  const thickLabel = thicknessRange ? ` (${thicknessRange[0]}–${thicknessRange[1]}cm)` : "";
  const cfgs = {
    area_weight: {
      xField: "area", yField: "weight", xLabel: "Landing Area (m²)", yLabel: "Weight (kg)",
      xMin: 0.3, xMax: 3.5, yMin: 0, yMax: 16, xStep: 0.5, yStep: 2,
      label: `Area vs Weight${thickLabel}`, sub: `${filteredPads.length} pads${thickLabel} — bigger = heavier, but by how much?`,
    },
    area_price: {
      xField: "area", yField: "price", xLabel: "Landing Area (m²)", yLabel: "Price (€)",
      xMin: 0.3, xMax: 3.5, yMin: 0, yMax: 650, xStep: 0.5, yStep: 100,
      label: `Area vs Price${thickLabel}`, sub: `${filteredPads.length} pads${thickLabel} — what does more landing zone cost?`,
    },
  };
  const cfg = cfgs[metric];

  const getColor = useCallback((d) => {
    if (colorBy === "thickness") return THICK_COLORS[d.tGroup] || "#94a3b8";
    if (colorBy === "brand") return BRAND_COLORS[d.brand] || "#94a3b8";
    if (colorBy === "fold") return FOLD_COLORS[d.fold] || FOLD_COLORS.unknown;
    return LAYER_COLORS[d.layers] || "#94a3b8";
  }, [colorBy]);

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

    const { xField, yField, xMin, xMax, yMin, yMax, xStep, yStep } = cfg;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    // Chart area frame
    drawChartArea(ctx, PAD, W, H);

    // Grid
    drawGrid(ctx, PAD, W, H, xMin, xMax, yMin, xStep, yStep, { yMax, fn: sy });

    // Ticks + axis labels
    const xFmt = x => cfg.xLabel.includes("m²") ? x.toFixed(1) : String(Math.round(x));
    const yFmt = y => cfg.yLabel.includes("€") ? "€" + y : String(y);
    drawTicks(ctx, PAD, W, H, isMobile, { xMin: xMin + xStep, xMax, yMin, yMax, xStep, yStep, xFmt, yFmt, xLabel: cfg.xLabel, yLabel: cfg.yLabel, sxFn: sx, syFn: sy });

    // Data count badge
    drawCountBadge(ctx, PAD, W, filteredPads.length, "pads");

    // Trend lines for area_weight and area_price (uses thickness-filtered base)
    if (metric === "area_weight") {
      drawLinearTrend(ctx, sx, sy, trendWeight.slope, trendWeight.intercept, trendWeight.std, xMin, xMax, yMin, yMax, { color: "#60a5fa", label: thicknessRange ? `Trend (${thicknessRange[0]}–${thicknessRange[1]}cm pads)` : "Trend (all pads)" });
    } else if (metric === "area_price") {
      drawLinearTrend(ctx, sx, sy, trendPrice.slope, trendPrice.intercept, trendPrice.std, xMin, xMax, yMin, yMax, { color: "#60a5fa", label: thicknessRange ? `Trend (${thicknessRange[0]}–${thicknessRange[1]}cm pads)` : "Trend (all pads)" });
    }

    // Crosshair for hovered dot
    const hovered = hovRef.current;
    if (hovered) {
      const hpx = sx(Math.max(xMin, Math.min(xMax, hovered[xField])));
      const hpy = sy(Math.max(yMin, Math.min(yMax, hovered[yField])));
      drawCrosshair(ctx, hpx, hpy, PAD, W, H, xFmt(hovered[xField]), yFmt(hovered[yField]));
    }

    // Dots with glow + jitter (area-based sizing preserved)
    const pixelPts = [];
    const jMap = new Map();
    const hlDots = []; // highlighted dots drawn on top
    filteredPads.forEach((d, i) => {
      if (d === hovered) return;
      const r = isMobile ? Math.max(4.5, Math.min(8, d.area * 4)) : Math.max(3.5, Math.min(7, d.area * 3.5));
      const j = jitter(i);
      jMap.set(d.slug, j);
      const px = sx(Math.max(xMin, Math.min(xMax, d[xField]))) + j.dx;
      const py = sy(Math.max(yMin, Math.min(yMax, d[yField]))) + j.dy;
      pixelPts.push({ px, py });
      if (hlSet.size > 0 && hlSet.has(d.slug)) {
        hlDots.push({ d, px, py, r }); // defer highlighted dots
      } else {
        drawDot(ctx, px, py, r, hlSet.size > 0 ? "#4a5568" : getColor(d), false);
      }
    });
    jitterMapRef.current = jMap;

    // Cluster badges
    drawClusterBadges(ctx, pixelPts);

    // Draw highlighted dots on top with glow + label
    const HL_COLOR = "#eab308";
    // First pass: draw all highlighted dots
    hlDots.forEach(({ d, px, py, r }) => {
      // Outer glow
      ctx.save();
      ctx.shadowColor = "rgba(234,179,8,0.5)";
      ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(px, py, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(234,179,8,0.2)"; ctx.fill();
      ctx.restore();
      // White ring
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2); ctx.stroke();
      // Solid dot
      ctx.beginPath(); ctx.arc(px, py, r + 1, 0, Math.PI * 2);
      ctx.fillStyle = HL_COLOR; ctx.fill();
    });
    // Second pass: position labels with collision avoidance (all shadow state cleared)
    ctx.save();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    const labelBoxes = [];
    // Also treat each highlighted dot as an occupied box so labels don't overlap dots
    hlDots.forEach(({ px, py, r }) => {
      labelBoxes.push({ x: px - r - 2, y: py - r - 2, w: (r + 2) * 2, h: (r + 2) * 2 });
    });
    const fontSize = isMobile ? 10 : 12;
    ctx.font = `600 ${fontSize}px 'Instrument Sans', Inter, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    const padX = 7, padY = 4;
    hlDots.forEach(({ d, px, py, r }) => {
      const label = `${d.brand} ${d.model}`;
      const tw = ctx.measureText(label).width;
      const boxW = tw + padX * 2, boxH = fontSize + padY * 2;
      // 12 candidate positions for better collision avoidance
      const gap = 10;
      const candidates = [
        { bx: px + r + gap,            by: py - boxH / 2 },           // right
        { bx: px - boxW / 2,           by: py - r - gap - boxH },     // above
        { bx: px - r - gap - boxW,     by: py - boxH / 2 },           // left
        { bx: px - boxW / 2,           by: py + r + gap },             // below
        { bx: px + r + gap,            by: py - r - gap - boxH },     // above-right
        { bx: px - r - gap - boxW,     by: py - r - gap - boxH },     // above-left
        { bx: px + r + gap,            by: py + r + gap },             // below-right
        { bx: px - r - gap - boxW,     by: py + r + gap },             // below-left
        { bx: px + r + gap,            by: py - boxH - gap * 2 },     // far above-right
        { bx: px + r + gap,            by: py + gap * 2 },             // far below-right
        { bx: px - r - gap - boxW,     by: py - boxH - gap * 2 },     // far above-left
        { bx: px - r - gap - boxW,     by: py + gap * 2 },             // far below-left
      ];
      const rectsOverlap = (a, b) => !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
      let best = null;
      for (const c of candidates) {
        const rect = { x: c.bx, y: c.by, w: boxW, h: boxH };
        if (!labelBoxes.some(b => rectsOverlap(rect, b))) { best = c; break; }
      }
      // If all positions overlap, nudge vertically until clear
      if (!best) {
        best = candidates[0];
        let nudge = 0;
        for (let step = 1; step <= 8; step++) {
          const up = { x: candidates[0].bx, y: candidates[0].by - step * (boxH + 4), w: boxW, h: boxH };
          if (!labelBoxes.some(b => rectsOverlap(up, b))) { best = { bx: up.x, by: up.y }; nudge = step; break; }
          const dn = { x: candidates[0].bx, y: candidates[0].by + step * (boxH + 4), w: boxW, h: boxH };
          if (!labelBoxes.some(b => rectsOverlap(dn, b))) { best = { bx: dn.x, by: dn.y }; nudge = step; break; }
        }
      }
      const box = { x: best.bx, y: best.by, w: boxW, h: boxH };
      labelBoxes.push(box);
      // Connector line from dot to label edge
      const labelCx = box.x + box.w / 2, labelCy = box.y + box.h / 2;
      ctx.strokeStyle = "rgba(234,179,8,0.5)"; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(labelCx, labelCy); ctx.stroke(); ctx.setLineDash([]);
      // Label background (manual rounded rect for compatibility)
      const brd = 4;
      ctx.fillStyle = "rgba(12,14,22,0.92)";
      ctx.beginPath();
      ctx.moveTo(box.x + brd, box.y);
      ctx.lineTo(box.x + box.w - brd, box.y);
      ctx.quadraticCurveTo(box.x + box.w, box.y, box.x + box.w, box.y + brd);
      ctx.lineTo(box.x + box.w, box.y + box.h - brd);
      ctx.quadraticCurveTo(box.x + box.w, box.y + box.h, box.x + box.w - brd, box.y + box.h);
      ctx.lineTo(box.x + brd, box.y + box.h);
      ctx.quadraticCurveTo(box.x, box.y + box.h, box.x, box.y + box.h - brd);
      ctx.lineTo(box.x, box.y + brd);
      ctx.quadraticCurveTo(box.x, box.y, box.x + brd, box.y);
      ctx.closePath(); ctx.fill();
      // Gold border
      ctx.strokeStyle = "rgba(234,179,8,0.6)"; ctx.lineWidth = 1.5;
      ctx.stroke();
      // Label text — bright yellow for readability
      ctx.fillStyle = "#fde68a";
      ctx.fillText(label, box.x + padX, box.y + padY);
    });
    ctx.restore();

    // Hovered dot on top
    if (hovered) {
      const r = isMobile ? Math.max(4.5, Math.min(8, hovered.area * 4)) : Math.max(3.5, Math.min(7, hovered.area * 3.5));
      const hpx = sx(Math.max(xMin, Math.min(xMax, hovered[xField])));
      const hpy = sy(Math.max(yMin, Math.min(yMax, hovered[yField])));
      drawDot(ctx, hpx, hpy, r, getColor(hovered), true);
    }
  }, [metric, colorBy, isMobile, cfg, getColor, filteredPads, hlSet, trendWeight, trendPrice, thicknessRange]);

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

  /* Desktop tooltip */
  const showTip = useCallback((d, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.innerHTML = buildTipHTML({
      name: `${d.brand} ${d.model}`,
      color: getColor(d),
      stats: [
        { label: "Area", value: d.area.toFixed(2) + " m²" },
        { label: "Weight", value: d.weight + " kg" },
        { label: "Price", value: "€" + d.price },
        { label: "€/m²", value: "€" + d.eurM2 },
      ],
      details: `${d.layers} foam layers · ${d.fold.replace("_", "-")} · ${d.thickness}cm thick`,
      link: `/crashpad/${d.slug}`,
      pinned,
    });
    positionTip(tip, x, y, pinned);
  }, [getColor]);

  const hideTip = useCallback(() => {
    const tip = tipRef.current;
    if (tip) { tip.style.opacity = "0"; tip.style.pointerEvents = "none"; }
  }, []);

  /* Mouse handlers (desktop) */
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

  /* Touch handlers (mobile) */
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

  /* Close desktop tooltip on outside click */
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

  const metricButtons = [
    { key: "area_weight", label: "Area vs Weight", color: T.accent },
    { key: "area_price", label: "Area vs Price", color: T.blue },
  ];

  return (
    <ChartContainer title={cfg.label} subtitle={cfg.sub} isMobile={isMobile}>
      {/* Metric buttons */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "10px", flexWrap: "wrap" }}>
        {metricButtons.map(m => (
          <button key={m.key} onClick={() => { setMetric(m.key); pinnedRef.current = null; hovRef.current = null; hideTip(); setMobileItem(null); }} style={{
            padding: "4px 12px", fontSize: "11px", fontWeight: 600, borderRadius: "6px", border: "none", cursor: "pointer",
            background: metric === m.key ? m.color : T.surface, color: metric === m.key ? "#fff" : T.muted,
          }}>{isMobile ? m.label.replace(" vs ", "/") : m.label}</button>
        ))}
      </div>

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
            background: colorBy === k ? "rgba(255,255,255,.1)" : "transparent", color: colorBy === k ? T.text : T.muted,
          }}>{{ layers: "Foam Layers", fold: "Fold Style", thickness: "Thickness", brand: "Brand" }[k]}</button>
        ))}
        <span style={{ fontSize: "10px", color: T.muted, marginLeft: "auto" }}>{filteredPads.length} shown</span>
      </div>}
      {compact && hlSet.size > 0 && (
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
          {mobileItem && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: getColor(mobileItem), flexShrink: 0 }} />
                <b style={{ color: T.text, fontSize: "13px" }}>{mobileItem.brand} {mobileItem.model}</b>
                <span style={{ fontSize: "10px", color: T.muted, marginLeft: "auto", flexShrink: 0 }}>
                  {mobileItem.layers} layers · {mobileItem.fold.replace("_", "-")}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "2px 8px" }}>
                {[["Area", `${mobileItem.area.toFixed(2)} m²`], ["Weight", `${mobileItem.weight} kg`], ["Price", `€${mobileItem.price}`], ["€/m²", `€${mobileItem.eurM2}`]].map(([lbl, val]) => (
                  <div key={lbl} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "9px", color: T.muted }}>{lbl}</div>
                    <div style={{ fontSize: "13px", fontWeight: 600 }}>{val}</div>
                  </div>
                ))}
              </div>
            </>
          )}
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

      <div style={{ marginTop: "6px", textAlign: "center" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          {isMobile ? "Tap a dot for specs · Tap legend to filter · Dot size = landing area" : "Click a dot for specs & detail link · Click legend to filter · Dot size = landing area"}
        </span>
      </div>
    </ChartContainer>
  );
}
