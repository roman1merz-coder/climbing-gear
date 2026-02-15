import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import ROPE_SEED from "./rope_seed_data.json";
import { ChartContainer, Pill, LegendRow, BottomSheet, buildTipHTML, positionTip, TIP_STYLE, getEventCoords, toggleHidden, chartPad, chartH, drawChartArea, drawGrid, drawTicks, drawCountBadge, jitter, drawClusterBadges, drawCrosshair, hex2rgb, rrect } from "./ChartShared.jsx";

/* ─── Color palettes ─── */
const TYPE_COLORS = { single: "#60a5fa", half: "#ed64a6", twin: "#34d399", static: "#ecc94b" };
const DRY_COLORS = { none: "#94a3b8", sheath: "#60a5fa", sheath_only: "#60a5fa", core: "#a78bfa", core_and_sheath: "#34d399", full_impregnation: "#E8734A" };
const BRAND_PAL = [
  "#63b3ed","#ed64a6","#48bb78","#ecc94b","#ed8936","#9f7aea","#38b2ac","#fc8181",
  "#f6ad55","#68d391","#d53f8c","#4fd1c5","#b794f4","#90cdf4","#feb2b2","#fbd38d",
  "#81e6d9","#c4b5fd","#fca5a5","#bef264","#e879f9","#67e8f9",
];

/* Pre-filter ropes */
const ALL_ROPES = ROPE_SEED.filter(r => r.diameter_mm && r.weight_per_meter_g)
  .map(r => ({
    brand: r.brand, model: r.model, slug: r.slug,
    dia: r.diameter_mm, falls: r.uiaa_falls, gm: r.weight_per_meter_g,
    impact: r.impact_force_kn, breakStr: r.breaking_strength_kn,
    dry: r.dry_treatment || "none",
    triple: !!r.triple_rated, sheath: r.sheath_percentage,
    type: r.rope_type || "single",
  }));

/* Polynomial curve data for single ropes (pre-computed) */
const CX=[7.5,7.6,7.7,7.8,7.9,8.0,8.1,8.2,8.3,8.4,8.5,8.6,8.7,8.8,8.9,9.0,9.1,9.2,9.3,9.4,9.5,9.6,9.7,9.8,9.9,10.0,10.1,10.2,10.3,10.4,10.5,10.6,10.7,10.8,10.9,11.0,11.1,11.2,11.3,11.4];
const CF=[2.585,2.949,3.288,3.601,3.892,4.163,4.415,4.651,4.872,5.082,5.281,5.472,5.657,5.838,6.018,6.197,6.379,6.565,6.757,6.958,7.169,7.393,7.631,7.886,8.16,8.454,8.771,9.114,9.483,9.881,10.311,10.773,11.271,11.806,12.38,12.996,13.655,14.36,15.113,15.915];
const CG=[41.154,41.905,42.67,43.449,44.243,45.05,45.872,46.707,47.557,48.421,49.3,50.192,51.098,52.019,52.954,53.903,54.866,55.843,56.835,57.84,58.86,59.894,60.942,62.004,63.08,64.171,65.275,66.394,67.527,68.674,69.835,71.01,72.2,73.404,74.621,75.853,77.099,78.36,79.634,80.923];
const SF=1.316, SG=1.660;

/* ─── Main Component ─── */
export default function RopeScatterChart({ isMobile }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);

  const [metric, setMetric] = useState("falls");
  const [colorBy, setColorBy] = useState("type");
  const [mobileItem, setMobileItem] = useState(null);

  /* Filter state */
  const [enabledTypes, setEnabledTypes] = useState(new Set(["single", "half"]));
  const onlyStatic = enabledTypes.size === 1 && enabledTypes.has("static");
  const hasStatic = enabledTypes.has("static");

  useEffect(() => {
    if (onlyStatic && metric === "falls") setMetric("gm");
  }, [onlyStatic, metric]);

  const [hiddenBrands, setHiddenBrands] = useState(new Set());
  const [hiddenDry, setHiddenDry] = useState(new Set());

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

  /* Apply filters */
  const filtered = useMemo(() => ALL_ROPES.filter(r => {
    if (!enabledTypes.has(r.type)) return false;
    if (hiddenBrands.has(r.brand)) return false;
    if (hiddenDry.has(r.dry)) return false;
    if (metric === "falls" && !r.falls) return false;
    if (metric === "breakStr" && !r.breakStr) return false;
    return true;
  }), [enabledTypes, hiddenBrands, hiddenDry, metric]);

  /* Dynamic axis bounds */
  const axisBounds = useMemo(() => {
    if (!filtered.length) return { diaMin: 7.3, diaMax: 11.3, fallsMax: 18, gmMin: 20, gmMax: 82, bsMin: 15, bsMax: 40 };
    const dias = filtered.map(r => r.dia);
    const diaMin = Math.floor(Math.min(...dias) * 2 - 1) / 2;
    const diaMax = Math.ceil(Math.max(...dias) * 2 + 1) / 2;
    const falls = filtered.filter(r => r.falls).map(r => r.falls);
    const gms = filtered.map(r => r.gm);
    const bss = filtered.filter(r => r.breakStr).map(r => r.breakStr);
    return {
      diaMin: Math.max(5, diaMin), diaMax: Math.min(14, diaMax),
      fallsMax: Math.ceil((Math.max(...falls, 4)) / 2) * 2 + 2,
      gmMin: Math.floor(Math.min(...gms) / 5) * 5 - 5,
      gmMax: Math.ceil(Math.max(...gms) / 5) * 5 + 5,
      bsMin: bss.length ? Math.floor(Math.min(...bss) / 5) * 5 - 5 : 15,
      bsMax: bss.length ? Math.ceil(Math.max(...bss) / 5) * 5 + 5 : 40,
    };
  }, [filtered]);

  const cfgs = useMemo(() => ({
    falls: {
      yField: "falls", yLabel: "UIAA Falls", yMin: 0, yMax: axisBounds.fallsMax, yStep: 2,
      curveY: CF, std: SF, sub: `${filtered.length} ropes · Cubic fit · R² = 0.575`, color: T.accent,
    },
    gm: {
      yField: "gm", yLabel: "Weight (g/m)", yMin: axisBounds.gmMin, yMax: axisBounds.gmMax, yStep: 5,
      curveY: CG, std: SG, sub: `${filtered.length} ropes · Quadratic fit · R² = 0.919`, color: T.blue,
    },
    breakStr: {
      yField: "breakStr", yLabel: "Break Strength (kN)", yMin: axisBounds.bsMin, yMax: axisBounds.bsMax, yStep: 5,
      curveY: null, std: 0, sub: `${filtered.length} ropes · Static rope break strength`, color: "#ecc94b",
    },
  }), [filtered.length, axisBounds]);
  const cfg = cfgs[metric];

  /* Color function */
  const getColor = useCallback((r) => {
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
      ctx.strokeStyle = "rgba(255,255,255,.15)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, size * 1.6 + 5, 0, Math.PI * 2); ctx.stroke();
    }
  }, [getColor, isMobile]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width, H = chartH(isMobile);
    const PAD = chartPad(isMobile, { l: isMobile ? 46 : 54 });
    canvas.width = W * 2; canvas.height = H * 2;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { yField, yMin, yMax, yStep, curveY, std } = cfg;
    const xMin = axisBounds.diaMin, xMax = axisBounds.diaMax;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    // Chart area frame
    drawChartArea(ctx, PAD, W, H);

    // Grid
    const xStep = (xMax - xMin) > 4 ? 1 : 0.5;
    drawGrid(ctx, PAD, W, H, xMin, xMax, yMin, xStep, yStep, { yMax, fn: sy });

    // Ticks + axis labels
    const xFmt = x => x.toFixed(1);
    const yFmt = y => String(y);
    const firstX = Math.ceil(xMin / xStep) * xStep;
    drawTicks(ctx, PAD, W, H, isMobile, { xMin: firstX, xMax, yMin, yMax, xStep, yStep, xFmt, yFmt, xLabel: "Diameter (mm)", yLabel: cfg.yLabel, sxFn: sx, syFn: sy });

    // Data count badge
    drawCountBadge(ctx, PAD, W, filtered.length, "ropes");

    // Trend line for single ropes (polished)
    if (enabledTypes.has("single") && curveY) {
      // 2σ band with gradient
      ctx.beginPath();
      for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i] + 2 * std); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      for (let i = CX.length - 1; i >= 0; i--) ctx.lineTo(sx(CX[i]), sy(curveY[i] - 2 * std));
      ctx.closePath();
      const g2 = ctx.createLinearGradient(0, sy(yMax), 0, sy(yMin));
      g2.addColorStop(0, "rgba(99,179,237,.06)"); g2.addColorStop(0.5, "rgba(99,179,237,.04)"); g2.addColorStop(1, "rgba(99,179,237,.01)");
      ctx.fillStyle = g2; ctx.fill();

      // 1σ band
      ctx.beginPath();
      for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i] + std); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      for (let i = CX.length - 1; i >= 0; i--) ctx.lineTo(sx(CX[i]), sy(curveY[i] - std));
      ctx.closePath(); ctx.fillStyle = "rgba(99,179,237,.08)"; ctx.fill();

      // 1σ edge lines
      ctx.strokeStyle = "rgba(99,179,237,.2)"; ctx.lineWidth = 0.8; ctx.setLineDash([3, 4]);
      ctx.beginPath();
      for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i] + std); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i] - std); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke(); ctx.setLineDash([]);

      // Main trend line (thicker)
      ctx.strokeStyle = "rgba(99,179,237,.6)"; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i]); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();

      // Inline label
      const li = Math.floor(CX.length * 0.65);
      const lx = sx(CX[li]), ly = sy(curveY[li] + std + (yMax - yMin) * 0.04);
      ctx.font = "600 10px 'Instrument Sans', system-ui";
      const lbl = "Trend (single ropes)";
      const lw = ctx.measureText(lbl).width + 10;
      ctx.fillStyle = "rgba(15,17,25,.8)";
      rrect(ctx, lx - lw / 2, ly - 8, lw, 16, 3); ctx.fill();
      ctx.fillStyle = "rgba(99,179,237,.8)"; ctx.textAlign = "center";
      ctx.fillText(lbl, lx, ly + 3);
    }

    // Crosshair for hovered dot
    const hovered = hovRef.current;
    if (hovered && filtered.includes(hovered)) {
      const hpx = sx(hovered.dia), hpy = sy(hovered[yField]);
      drawCrosshair(ctx, hpx, hpy, PAD, W, H, xFmt(hovered.dia), yFmt(hovered[yField]));
    }

    // Dots with glow + jitter
    const pixelPts = [];
    filtered.filter(r => r !== hovered).forEach((r, i) => {
      const j = jitter(i);
      const px = sx(r.dia) + j.dx, py = sy(r[yField]) + j.dy;
      pixelPts.push({ px, py });
      drawShape(ctx, r, px, py, isMobile ? 5 : 4, false);
    });

    // Cluster badges
    drawClusterBadges(ctx, pixelPts);

    // Hovered dot on top
    if (hovered && filtered.includes(hovered)) {
      const px = sx(hovered.dia), py = sy(hovered[yField]);
      drawShape(ctx, hovered, px, py, isMobile ? 5 : 4, true);
    }
  }, [metric, isMobile, cfg, filtered, axisBounds, enabledTypes, drawShape]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);

  const findClosest = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { clientX, clientY } = getEventCoords(e);
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const W = rect.width, H = chartH(isMobile);
    const P = chartPad(isMobile, { l: isMobile ? 46 : 54 });
    const xMin = axisBounds.diaMin, xMax = axisBounds.diaMax;
    const sx = x => P.l + (x - xMin) / (xMax - xMin) * (W - P.l - P.r);
    const sy = y => H - P.b - (y - cfg.yMin) / (cfg.yMax - cfg.yMin) * (H - P.t - P.b);
    let closest = null, best = Infinity;
    const threshold = isMobile ? 30 : 20;
    filtered.forEach(r => {
      const dx = sx(r.dia) - mx, dy = sy(r[cfg.yField]) - my, d = Math.sqrt(dx * dx + dy * dy);
      if (d < threshold && d < best) { closest = r; best = d; }
    });
    return closest;
  }, [isMobile, cfg, filtered, axisBounds]);

  /* Desktop tooltip */
  const showTip = useCallback((r, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    const typeLabel = r.type.charAt(0).toUpperCase() + r.type.slice(1);
    const stats = [
      { label: "Diameter", value: r.dia + " mm" },
      { label: "Weight", value: r.gm + " g/m" },
    ];
    if (r.falls) stats.push({ label: "UIAA Falls", value: String(r.falls) });
    if (r.impact) stats.push({ label: "Impact", value: r.impact + " kN" });
    if (r.breakStr) stats.push({ label: "Break Str.", value: r.breakStr + " kN" });
    if (r.sheath) stats.push({ label: "Sheath", value: r.sheath + "%" });

    const dry = (r.dry || "none").replace(/_/g, " ");
    tip.innerHTML = buildTipHTML({
      name: `${r.brand} ${r.model}`,
      color: getColor(r),
      stats,
      details: `${typeLabel} · Dry: ${dry}${r.triple ? " · Triple rated" : ""}`,
      link: `/rope/${r.slug}`,
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
  const btnStyle = (active, color) => ({
    padding: "5px 16px", fontSize: "12px", fontWeight: 600, borderRadius: "6px", border: "none", cursor: "pointer",
    background: active ? color : T.surface, color: active ? "#fff" : T.muted,
  });
  const filterBtn = (active) => ({
    padding: "3px 8px", fontSize: "10px", fontWeight: 600, borderRadius: "4px", border: "none", cursor: "pointer",
    background: active ? "rgba(255,255,255,.1)" : "transparent", color: active ? T.text : T.muted,
  });

  const TYPE_SHAPES = { single: "circle", half: "diamond", twin: "triangle", static: "square" };

  return (
    <ChartContainer title="Rope Diameter Deep Dive" subtitle={cfg.sub}>
      {/* Metric buttons */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
        {Object.entries({
          ...(!onlyStatic ? { falls: { label: "UIAA Falls", color: T.accent } } : {}),
          gm: { label: "Weight (g/m)", color: T.blue },
          ...(hasStatic ? { breakStr: { label: "Break Strength (kN)", color: "#ecc94b" } } : {}),
        }).map(([k, c]) => (
          <button key={k} onClick={() => { setMetric(k); pinnedRef.current = null; hovRef.current = null; hideTip(); setMobileItem(null); }}
            style={btnStyle(metric === k, c.color)}>{c.label}</button>
        ))}
      </div>

      {/* Rope type filter */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
        {(hiddenBrands.size > 0 || hiddenDry.size > 0 || !(enabledTypes.has("single") && enabledTypes.has("half") && !enabledTypes.has("twin") && !enabledTypes.has("static"))) && (
          <button onClick={() => { setEnabledTypes(new Set(["single", "half"])); setHiddenBrands(new Set()); setHiddenDry(new Set()); }}
            style={{ padding: "3px 10px", fontSize: "10px", fontWeight: 700, borderRadius: "5px", border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, letterSpacing: "0.5px" }}>
            ✕ Reset filters
          </button>
        )}
        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: T.muted, marginRight: "2px" }}>Type:</span>
          {[["single", "Single"], ["half", "Half"], ["twin", "Twin"], ["static", "Static"]].map(([k, l]) => (
            <button key={k} onClick={() => toggleType(k)} style={filterBtn(enabledTypes.has(k))}>{l}</button>
          ))}
        </div>
      </div>

      {/* Color-by toggle + count */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: T.muted }}>Color by:</span>
        {[["type", "Rope Type"], ["dry", "Treatment"], ["brand", "Brand"]].map(([k, l]) => (
          <button key={k} onClick={() => setColorBy(k)} style={{
            padding: "3px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "5px", border: "none", cursor: "pointer",
            background: colorBy === k ? "rgba(255,255,255,.1)" : "transparent", color: colorBy === k ? T.text : T.muted,
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
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: getColor(r), flexShrink: 0 }} />
                  <b style={{ color: T.text, fontSize: "14px" }}>{r.brand} {r.model}</b>
                  <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 6px", borderRadius: "4px", background: `${TYPE_COLORS[r.type]}20`, color: TYPE_COLORS[r.type] }}>{typeLabel}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 12px", marginBottom: "6px" }}>
                  <div><span style={{ fontSize: "10px", color: T.muted }}>Diameter</span><div style={{ fontSize: "14px", fontWeight: 600 }}>{r.dia} mm</div></div>
                  <div><span style={{ fontSize: "10px", color: T.muted }}>Weight</span><div style={{ fontSize: "14px", fontWeight: 600 }}>{r.gm} g/m</div></div>
                  {r.falls && <div><span style={{ fontSize: "10px", color: T.muted }}>Falls</span><div style={{ fontSize: "14px", fontWeight: 600 }}>{r.falls}</div></div>}
                  {r.impact && <div><span style={{ fontSize: "10px", color: T.muted }}>Impact</span><div style={{ fontSize: "14px", fontWeight: 600 }}>{r.impact} kN</div></div>}
                  {r.breakStr && <div><span style={{ fontSize: "10px", color: T.muted }}>Break Str.</span><div style={{ fontSize: "14px", fontWeight: 600 }}>{r.breakStr} kN</div></div>}
                  {r.sheath && <div><span style={{ fontSize: "10px", color: T.muted }}>Sheath</span><div style={{ fontSize: "14px", fontWeight: 600 }}>{r.sheath}%</div></div>}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>
                  Dry: {dry}{r.triple ? " · Triple rated" : ""}
                </div>
              </>
            );
          })()}
        </BottomSheet>
      )}

      {/* Legends */}
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          {isMobile ? "Tap a dot for specs · Tap legend to filter" : "Click a dot for specs & link · Click legend to filter"}
          {enabledTypes.has("single") && " · Trend line = single ropes only"}
        </span>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          {enabledTypes.has("half") && "◇ Half"}{enabledTypes.has("half") && enabledTypes.has("twin") && " · "}{enabledTypes.has("twin") && "△ Twin"}{(enabledTypes.has("half") || enabledTypes.has("twin")) && enabledTypes.has("static") && " · "}{enabledTypes.has("static") && "□ Static"}
        </span>
      </div>
    </ChartContainer>
  );
}
