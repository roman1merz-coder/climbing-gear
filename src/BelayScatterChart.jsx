import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import BELAY_SEED from "./belay_seed_data.json";
import { ChartContainer, Pill, LegendRow, BottomSheet, buildTipHTML, positionTip, TIP_STYLE, getEventCoords, toggleHidden, chartPad, chartH, drawChartArea, drawGrid, drawTicks, drawCountBadge, drawDot, jitter, drawClusterBadges, drawCrosshair, hex2rgb, drawLinearTrend } from "./ChartShared.jsx";

/* ─── Device type styling ─── */
const TYPE_COLORS = {
  active_assisted: "#c98a42", passive_assisted: "#60a5fa",
  tube_guide: "#34d399", tube: "#a78bfa", tubular: "#a78bfa", figure_eight: "#94a3b8",
};
const TYPE_LABELS = {
  active_assisted: "Cam (Active)", passive_assisted: "Passive Assisted",
  tube_guide: "Tube Guide", tube: "Tube", tubular: "Tube", figure_eight: "Figure 8",
};

/* Discipline colors */
const DISC_COLORS = {
  gym: "#60a5fa", sport_single: "#c98a42", sport_multi: "#ed64a6",
  trad: "#34d399", trad_multi: "#22c55e", alpine: "#ecc94b",
  ice_mixed: "#38b2ac", ice: "#38b2ac", ice_climbing: "#38b2ac",
  big_wall: "#9f7aea", top_rope: "#f59e0b", mountaineering: "#6b7280",
  projecting: "#fc8181", guiding: "#d53f8c", rescue: "#ef4444",
  multi_pitch: "#ed64a6", rappelling: "#b794f4", rigging: "#94a3b8",
};

/* Brand palette */
const BRAND_PAL = [
  "#63b3ed","#ed64a6","#48bb78","#ecc94b","#ed8936","#9f7aea","#38b2ac","#fc8181",
  "#f6ad55","#68d391","#d53f8c","#4fd1c5","#b794f4","#90cdf4","#feb2b2","#fbd38d",
  "#81e6d9","#c4b5fd","#fca5a5","#bef264","#e879f9","#67e8f9",
];

/* ─── Data ─── */
const ALL_BELAYS = BELAY_SEED.filter(d => d.price_uvp_eur && d.weight_g)
  .map(d => ({
    brand: d.brand, model: d.model, slug: d.slug,
    price: d.price_uvp_eur, weight: d.weight_g,
    type: d.device_type === "tubular" ? "tube" : d.device_type,
    useCases: d.best_use_cases || [],
    antiPanic: d.anti_panic, guideMode: d.guide_mode,
    ropeSlots: d.rope_slots, material: d.material,
  }));

/* ─── Axis options for free-choice dropdowns ─── */
const AXIS_OPTIONS = [
  { key: "weight",    label: "Weight (g)",     unit: "g",  fmt: v => String(Math.round(v)) },
  { key: "price",     label: "Price (€)",      unit: "€",  fmt: v => "€" + v.toFixed(0) },
  { key: "ropeSlots", label: "Rope Slots",     unit: "",   fmt: v => String(v) },
];
const AXIS_MAP = Object.fromEntries(AXIS_OPTIONS.map(a => [a.key, a]));

/* ─── Compute linear trend on the fly ─── */
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
/* ─── Dynamic axis bounds ─── */
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
export default function BelayScatterChart({ isMobile }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);
  const [mobileItem, setMobileItem] = useState(null);

  const [xAxis, setXAxis] = useState("weight");
  const [yAxis, setYAxis] = useState("price");
  const [sizeAxis, setSizeAxis] = useState("none");
  const [colorBy, setColorBy] = useState("type");
  /* Filter state */
  const [enabledTypes, setEnabledTypes] = useState(new Set(["active_assisted", "passive_assisted", "tube_guide", "tube", "figure_eight"]));
  const [hiddenBrands, setHiddenBrands] = useState(new Set());

  const toggleType = (t) => setEnabledTypes(prev => {
    const next = new Set(prev);
    next.has(t) ? next.delete(t) : next.add(t);
    return next;
  });

  /* Brand list & colors */
  const BRAND_LIST = useMemo(() => [...new Set(ALL_BELAYS.map(d => d.brand))].sort(), []);
  const BRAND_COLORS = useMemo(() => Object.fromEntries(BRAND_LIST.map((b, i) => [b, BRAND_PAL[i % BRAND_PAL.length]])), [BRAND_LIST]);

  /* Discipline list */
  const DISC_LIST = useMemo(() => {
    const s = new Set();
    ALL_BELAYS.forEach(d => d.useCases.forEach(uc => s.add(uc)));
    return [...s].sort();
  }, []);

  /* Bubble-size scaler */
  const sizeScale = useMemo(() => {
    if (sizeAxis === "none") return null;
    const vals = ALL_BELAYS.filter(r => r[sizeAxis] != null).map(r => r[sizeAxis]);
    if (!vals.length) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const range = hi - lo || 1;
    const minR = isMobile ? 2 : 3, maxR = isMobile ? 12 : 16;
    return (v) => v == null ? (minR + maxR) / 2 : minR + ((v - lo) / range) * (maxR - minR);
  }, [sizeAxis, isMobile]);
  /* Apply filters */
  const filtered = useMemo(() => ALL_BELAYS.filter(d => {
    if (!enabledTypes.has(d.type)) return false;
    if (hiddenBrands.has(d.brand)) return false;
    if (d[xAxis] == null || d[yAxis] == null) return false;
    return true;
  }), [enabledTypes, hiddenBrands, xAxis, yAxis]);

  /* Color function */
  const getColor = useCallback((d) => {
    if (colorBy === "type") return TYPE_COLORS[d.type] || "#94a3b8";
    if (colorBy === "brand") return BRAND_COLORS[d.brand] || "#94a3b8";
    const uc = d.useCases[0];
    return DISC_COLORS[uc] || "#94a3b8";
  }, [colorBy, BRAND_COLORS]);

  /* Dynamic axis config */
  const cfg = useMemo(() => {
    const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
    const xb = fieldBounds(filtered, xAxis);
    const yb = fieldBounds(filtered, yAxis);
    return {
      xField: xAxis, xLabel: xOpt.label, xMin: xb.min, xMax: xb.max, xStep: xb.step,
      yField: yAxis, yLabel: yOpt.label, yMin: yb.min, yMax: yb.max, yStep: yb.step,
      sub: `${filtered.length} belay devices · ${xOpt.label} vs ${yOpt.label}${sizeAxis !== "none" ? ` · size = ${AXIS_MAP[sizeAxis]?.label}` : ""}`,
    };
  }, [filtered, xAxis, yAxis, sizeAxis]);

  /* Dynamic trend */
  const trend = useMemo(() => computeTrend(filtered, xAxis, yAxis), [filtered, xAxis, yAxis]);
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

    const { xField, xLabel, xMin, xMax, xStep, yField, yLabel, yMin, yMax, yStep } = cfg;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    drawChartArea(ctx, PAD, W, H);
    drawGrid(ctx, PAD, W, H, xMin, xMax, yMin, xStep, yStep, { yMax, fn: sy });

    const xFmt = AXIS_MAP[xField]?.fmt || (x => String(x));
    const yFmt = AXIS_MAP[yField]?.fmt || (y => String(y));
    const firstX = Math.ceil(xMin / xStep) * xStep;
    drawTicks(ctx, PAD, W, H, isMobile, { xMin: firstX, xMax, yMin, yMax, xStep, yStep, xFmt, yFmt, xLabel, yLabel, sxFn: sx, syFn: sy });

    drawCountBadge(ctx, PAD, W, filtered.length, "devices");

    /* Trend line */
    if (trend) {
      const r2Str = trend.r2 > 0.01 ? ` · R²=${trend.r2.toFixed(2)}` : "";
      drawLinearTrend(ctx, sx, sy, trend.slope, trend.intercept, trend.std, xMin, xMax, yMin, yMax, { color: "#c8cdd8", label: `Trend (all devices)${r2Str}` });
    }
    /* Crosshair */
    const hovered = hovRef.current;
    if (hovered && filtered.includes(hovered)) {
      const hpx = sx(hovered[xField]), hpy = sy(hovered[yField]);
      drawCrosshair(ctx, hpx, hpy, PAD, W, H, xFmt(hovered[xField]), yFmt(hovered[yField]));
    }

    /* Dots */
    const baseR = isMobile ? 3.5 : 5;
    const pixelPts = [];
    filtered.forEach((d, i) => {
      if (d === hovered) return;
      const j = jitter(i);
      const px = sx(d[xField]) + j.dx, py = sy(d[yField]) + j.dy;
      pixelPts.push({ px, py });
      const sz = sizeScale ? sizeScale(d[sizeAxis]) : baseR;
      drawDot(ctx, px, py, sz, getColor(d), false);
    });

    if (!sizeScale) drawClusterBadges(ctx, pixelPts);

    if (hovered && filtered.includes(hovered)) {
      const px = sx(hovered[xField]), py = sy(hovered[yField]);
      const sz = sizeScale ? sizeScale(hovered[sizeAxis]) : baseR;
      drawDot(ctx, px, py, sz, getColor(hovered), true);
    }
  }, [isMobile, filtered, cfg, getColor, trend, sizeAxis, sizeScale]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);
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
    const threshold = isMobile ? 30 : 20;
    filtered.forEach(d => {
      const dx = sx(d[xField]) - mx, dy = sy(d[yField]) - my, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < threshold && dist < best) { closest = d; best = dist; }
    });
    return closest;
  }, [isMobile, filtered, cfg]);

  /* Desktop tooltip */
  const showTip = useCallback((d, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    const typeLabel = TYPE_LABELS[d.type] || d.type;
    const features = [d.antiPanic && "Anti-panic", d.guideMode && "Guide mode"].filter(Boolean).join(", ");
    const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
    const sOpt = sizeAxis !== "none" ? AXIS_MAP[sizeAxis] : null;
    const stats = [
      { label: xOpt.label.split(" (")[0], value: xOpt.fmt(d[xAxis]) + (xOpt.unit ? " " + xOpt.unit : "") },
      { label: yOpt.label.split(" (")[0], value: yOpt.fmt(d[yAxis]) + (yOpt.unit ? " " + yOpt.unit : "") },
    ];
    if (sOpt && d[sizeAxis] != null) stats.push({ label: sOpt.label.split(" (")[0], value: sOpt.fmt(d[sizeAxis]) + (sOpt.unit ? " " + sOpt.unit : "") });    const shown = new Set([xAxis, yAxis, ...(sizeAxis !== "none" ? [sizeAxis] : [])]);
    if (!shown.has("weight")) stats.push({ label: "Weight", value: d.weight + " g" });
    if (!shown.has("price")) stats.push({ label: "Price", value: "€" + d.price.toFixed(2) });
    if (d.ropeSlots && !shown.has("ropeSlots")) stats.push({ label: "Rope slots", value: String(d.ropeSlots) });
    if (d.material) stats.push({ label: "Material", value: d.material });

    tip.innerHTML = buildTipHTML({
      name: `${d.brand} ${d.model}`,
      color: getColor(d),
      stats: stats.slice(0, 6),
      details: `${typeLabel}${features ? " · " + features : ""}`,
      link: `/belay/${d.slug}`,
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
      if (a && a.getAttribute("href")?.startsWith("/belay/")) { e.preventDefault(); navigate(a.getAttribute("href")); }
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

  const TYPE_LIST = ["active_assisted", "passive_assisted", "tube_guide", "tube", "figure_eight"];
  return (
    <ChartContainer title="Belay Device Deep Dive" subtitle={cfg.sub} isMobile={isMobile}>
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
      {/* Device type filter */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
        {(hiddenBrands.size > 0 || enabledTypes.size !== 5) && (
          <button onClick={() => { setEnabledTypes(new Set(["active_assisted", "passive_assisted", "tube_guide", "tube", "figure_eight"])); setHiddenBrands(new Set()); }}
            style={{ padding: "3px 10px", fontSize: "10px", fontWeight: 700, borderRadius: "5px", border: `1px solid ${T.accent}`, cursor: "pointer", background: "transparent", color: T.accent, letterSpacing: "0.5px" }}>
            ✕ Reset filters
          </button>
        )}
        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: T.muted, marginRight: "2px" }}>Type:</span>
          {TYPE_LIST.map(k => (
            <button key={k} onClick={() => toggleType(k)} style={filterBtn(enabledTypes.has(k))}>
              {TYPE_LABELS[k] || k}
            </button>
          ))}
        </div>
      </div>

      {/* Color-by toggle + count */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: T.muted }}>Color by:</span>
        {[["type", "Device Type"], ["discipline", "Discipline"], ["brand", "Brand"]].map(([k, l]) => (
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
          onNavigate={mobileItem ? () => navigate(`/belay/${mobileItem.slug}`) : null}>
          {mobileItem && (() => {
            const d = mobileItem;
            const typeLabel = TYPE_LABELS[d.type] || d.type;
            const features = [d.antiPanic && "Anti-panic", d.guideMode && "Guide mode"].filter(Boolean).join(" · ");
            const xOpt = AXIS_MAP[xAxis], yOpt = AXIS_MAP[yAxis];
            const sOpt = sizeAxis !== "none" ? AXIS_MAP[sizeAxis] : null;
            const shown = new Set([xAxis, yAxis, ...(sizeAxis !== "none" ? [sizeAxis] : [])]);
            const stats = [
              [xOpt.label.split(" (")[0], xOpt.fmt(d[xAxis]) + (xOpt.unit ? " " + xOpt.unit : "")],
              [yOpt.label.split(" (")[0], yOpt.fmt(d[yAxis]) + (yOpt.unit ? " " + yOpt.unit : "")],
              ...(sOpt && d[sizeAxis] != null ? [[sOpt.label.split(" (")[0], sOpt.fmt(d[sizeAxis]) + (sOpt.unit ? " " + sOpt.unit : "")]] : []),
              ...(!shown.has("weight") ? [["Weight", `${d.weight} g`]] : []),
              ...(!shown.has("price") ? [["Price", `€${d.price.toFixed(2)}`]] : []),
            ].slice(0, 5);            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: getColor(d), flexShrink: 0 }} />
                  <b style={{ color: T.text, fontSize: "13px" }}>{d.brand} {d.model}</b>
                  <span style={{ fontSize: "10px", color: T.muted, marginLeft: "auto", flexShrink: 0 }}>
                    {typeLabel}{features ? ` · ${features}` : ""}
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
      {colorBy === "type" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {TYPE_LIST.filter(k => enabledTypes.has(k)).map(k => (
            <Pill key={k} color={TYPE_COLORS[k] || "#94a3b8"} label={TYPE_LABELS[k] || k}
              hidden={false} onClick={() => toggleType(k)} />
          ))}
        </div>
      )}      {colorBy === "discipline" && (
        DISC_LIST.length > 5 ? (
          <LegendRow
            items={DISC_LIST.map(k => ({ key: k, color: DISC_COLORS[k] || "#94a3b8", label: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) }))}
            hiddenSet={new Set()}
            onToggle={() => {}}
            onClearAll={() => {}}
          />
        ) : (
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
            {DISC_LIST.map(k => (
              <Pill key={k} color={DISC_COLORS[k] || "#94a3b8"} label={k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                hidden={false} onClick={() => {}} />
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