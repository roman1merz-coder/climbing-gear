import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import ROPE_SEED from "./rope_seed_data.json";

/* ─── Color palettes ─── */
const TYPE_COLORS = { single: "#60a5fa", half: "#ed64a6", twin: "#34d399", static: "#ecc94b" };
const DRY_COLORS = { none: "#94a3b8", sheath: "#60a5fa", sheath_only: "#60a5fa", core: "#a78bfa", core_and_sheath: "#34d399", full_impregnation: "#E8734A" };
const BRAND_PAL = [
  "#63b3ed","#ed64a6","#48bb78","#ecc94b","#ed8936","#9f7aea","#38b2ac","#fc8181",
  "#f6ad55","#68d391","#d53f8c","#4fd1c5","#b794f4","#90cdf4","#feb2b2","#fbd38d",
  "#81e6d9","#c4b5fd","#fca5a5","#bef264","#e879f9","#67e8f9",
];

/* Pre-filter ropes that have the minimum data for charting */
const ALL_ROPES = ROPE_SEED.filter(r => r.diameter_mm && r.weight_per_meter_g)
  .map(r => ({
    brand: r.brand, model: r.model, slug: r.slug,
    dia: r.diameter_mm, falls: r.uiaa_falls, gm: r.weight_per_meter_g,
    impact: r.impact_force_kn, dry: r.dry_treatment || "none",
    triple: !!r.triple_rated, sheath: r.sheath_percentage,
    type: r.rope_type || "single",
  }));

/* Polynomial curve data for single ropes (pre-computed) */
const CX=[7.5,7.6,7.7,7.8,7.9,8.0,8.1,8.2,8.3,8.4,8.5,8.6,8.7,8.8,8.9,9.0,9.1,9.2,9.3,9.4,9.5,9.6,9.7,9.8,9.9,10.0,10.1,10.2,10.3,10.4,10.5,10.6,10.7,10.8,10.9,11.0,11.1,11.2,11.3,11.4];
const CF=[2.585,2.949,3.288,3.601,3.892,4.163,4.415,4.651,4.872,5.082,5.281,5.472,5.657,5.838,6.018,6.197,6.379,6.565,6.757,6.958,7.169,7.393,7.631,7.886,8.16,8.454,8.771,9.114,9.483,9.881,10.311,10.773,11.271,11.806,12.38,12.996,13.655,14.36,15.113,15.915];
const CG=[41.154,41.905,42.67,43.449,44.243,45.05,45.872,46.707,47.557,48.421,49.3,50.192,51.098,52.019,52.954,53.903,54.866,55.843,56.835,57.84,58.86,59.894,60.942,62.004,63.08,64.171,65.275,66.394,67.527,68.674,69.835,71.01,72.2,73.404,74.621,75.853,77.099,78.36,79.634,80.923];
const SF=1.316, SG=1.660;

/* ─── Chart Container ─── */
function ChartContainer({ title, subtitle, children, style }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "24px", ...style }}>
      {title && <div style={{ fontSize: "15px", fontWeight: 700, color: T.text, marginBottom: subtitle ? "4px" : "16px" }}>{title}</div>}
      {subtitle && <div style={{ fontSize: "12px", color: T.muted, marginBottom: "16px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}

/* ─── Reusable pill ─── */
function Pill({ color, label, hidden, onClick, shape }) {
  return (
    <span onClick={onClick} style={{
      fontSize: "10px", color: hidden ? "#4a5568" : T.muted, display: "flex", alignItems: "center", gap: "4px",
      cursor: "pointer", padding: "2px 8px", borderRadius: "10px", userSelect: "none",
      background: hidden ? "transparent" : "rgba(255,255,255,.04)",
      border: `1px solid ${hidden ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.1)"}`,
      opacity: hidden ? 0.4 : 1, textDecoration: hidden ? "line-through" : "none",
      transition: "all .15s",
    }}>
      {shape === "diamond" ? (
        <span style={{ width: "8px", height: "8px", background: color, display: "inline-block", opacity: hidden ? 0.3 : 1, transform: "rotate(45deg)", borderRadius: "1px" }} />
      ) : shape === "triangle" ? (
        <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: `8px solid ${color}`, display: "inline-block", opacity: hidden ? 0.3 : 1 }} />
      ) : (
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, display: "inline-block", opacity: hidden ? 0.3 : 1 }} />
      )}
      {label}
    </span>
  );
}

/* ─── Main Component ─── */
export default function RopeScatterChart({ isMobile }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);

  const [metric, setMetric] = useState("falls");
  const [colorBy, setColorBy] = useState("type");

  /* Filter state — rope type toggles (single & half default ON, twin & static default OFF) */
  const [enabledTypes, setEnabledTypes] = useState(new Set(["single", "half"]));
  const [hiddenBrands, setHiddenBrands] = useState(new Set());
  const [hiddenDry, setHiddenDry] = useState(new Set());

  const toggleType = (t) => setEnabledTypes(prev => {
    const next = new Set(prev);
    next.has(t) ? next.delete(t) : next.add(t);
    return next;
  });
  const toggleHidden = (setter, key) => setter(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  /* Brand list & colors (dynamic based on visible ropes) */
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
    // For falls metric, need falls data (static ropes have none)
    if (metric === "falls" && !r.falls) return false;
    return true;
  }), [enabledTypes, hiddenBrands, hiddenDry, metric]);

  /* Dynamic axis bounds */
  const axisBounds = useMemo(() => {
    if (!filtered.length) return { diaMin: 7.3, diaMax: 11.3, fallsMax: 18, gmMin: 20, gmMax: 82 };
    const dias = filtered.map(r => r.dia);
    const diaMin = Math.floor(Math.min(...dias) * 2 - 1) / 2;
    const diaMax = Math.ceil(Math.max(...dias) * 2 + 1) / 2;
    const falls = filtered.filter(r => r.falls).map(r => r.falls);
    const gms = filtered.map(r => r.gm);
    return {
      diaMin: Math.max(5, diaMin), diaMax: Math.min(14, diaMax),
      fallsMax: Math.ceil((Math.max(...falls, 4)) / 2) * 2 + 2,
      gmMin: Math.floor(Math.min(...gms) / 5) * 5 - 5,
      gmMax: Math.ceil(Math.max(...gms) / 5) * 5 + 5,
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
  }), [filtered.length, axisBounds]);
  const cfg = cfgs[metric];

  /* Color function */
  const getColor = useCallback((r) => {
    if (colorBy === "type") return TYPE_COLORS[r.type] || "#94a3b8";
    if (colorBy === "dry") return DRY_COLORS[r.dry] || "#94a3b8";
    return BRAND_COLORS[r.brand] || "#94a3b8";
  }, [colorBy, BRAND_COLORS]);

  /* Shape: circle for single, diamond for half, triangle for twin, square for static */
  const drawShape = useCallback((ctx, r, px, py, size, isHovered) => {
    const hex = getColor(r);
    const [cr, cg, cb] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const fill = `rgba(${cr},${cg},${cb},${isHovered ? 1 : 0.7})`;
    const stroke = isHovered ? "#fff" : `rgba(${cr},${cg},${cb},0.3)`;
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = isHovered ? 2 : 0.8;

    if (r.type === "half") {
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
      const s = isHovered ? size * 1.3 : size * 0.85;
      ctx.beginPath(); ctx.rect(-s, -s, s * 2, s * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    } else if (r.type === "twin") {
      const s = isHovered ? size * 1.5 : size;
      ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s, py + s * 0.7); ctx.lineTo(px - s, py + s * 0.7); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (r.type === "static") {
      const s = isHovered ? size * 1.3 : size * 0.85;
      ctx.beginPath(); ctx.rect(px - s, py - s, s * 2, s * 2); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(px, py, isHovered ? size * 1.6 : size, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }, [getColor]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width, H = isMobile ? 300 : 400;
    const PAD = { t: 20, r: 20, b: 44, l: 50 };
    canvas.width = W * 2; canvas.height = H * 2;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { yField, yMin, yMax, yStep, curveY, std } = cfg;
    const xMin = axisBounds.diaMin, xMax = axisBounds.diaMax;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    const xStep = (xMax - xMin) > 4 ? 1 : 0.5;
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      ctx.beginPath(); ctx.moveTo(sx(x), PAD.t); ctx.lineTo(sx(x), H - PAD.b); ctx.stroke();
    }
    for (let y = yMin; y <= yMax; y += yStep) {
      ctx.beginPath(); ctx.moveTo(PAD.l, sy(y)); ctx.lineTo(W - PAD.r, sy(y)); ctx.stroke();
    }
    // Ticks
    ctx.fillStyle = "#4a5568"; ctx.font = "10px system-ui"; ctx.textAlign = "center";
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) ctx.fillText(x.toFixed(1), sx(x), H - PAD.b + 14);
    ctx.textAlign = "right";
    for (let y = yMin; y <= yMax; y += yStep) ctx.fillText(y, PAD.l - 6, sy(y) + 3);
    ctx.fillStyle = "#64748b"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText("Diameter (mm)", W / 2, H - 6);
    ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(cfg.yLabel, 0, 0); ctx.restore();

    // Only show trend line for single ropes and when singles are enabled
    if (enabledTypes.has("single") && curveY) {
      // ±2σ band
      ctx.beginPath();
      for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i] + 2 * std); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      for (let i = CX.length - 1; i >= 0; i--) ctx.lineTo(sx(CX[i]), sy(curveY[i] - 2 * std));
      ctx.closePath(); ctx.fillStyle = "rgba(99,179,237,.03)"; ctx.fill();
      // ±1σ band
      ctx.beginPath();
      for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i] + std); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      for (let i = CX.length - 1; i >= 0; i--) ctx.lineTo(sx(CX[i]), sy(curveY[i] - std));
      ctx.closePath(); ctx.fillStyle = "rgba(99,179,237,.07)"; ctx.fill();
      // Curve line
      ctx.strokeStyle = "rgba(99,179,237,.5)"; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath();
      for (let i = 0; i < CX.length; i++) { const px = sx(CX[i]), py = sy(curveY[i]); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();
    }

    // Draw dots (non-hovered first, then hovered on top)
    const hovered = hovRef.current;
    filtered.filter(r => r !== hovered).forEach(r => {
      const px = sx(r.dia), py = sy(r[yField]);
      drawShape(ctx, r, px, py, 4, false);
    });
    if (hovered && filtered.includes(hovered)) {
      const px = sx(hovered.dia), py = sy(hovered[yField]);
      drawShape(ctx, hovered, px, py, 4, true);
    }
  }, [metric, isMobile, cfg, filtered, axisBounds, enabledTypes, drawShape]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);

  const findClosest = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = rect.width, H = isMobile ? 300 : 400;
    const PAD = { t: 20, r: 20, b: 44, l: 50 };
    const xMin = axisBounds.diaMin, xMax = axisBounds.diaMax;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - cfg.yMin) / (cfg.yMax - cfg.yMin) * (H - PAD.t - PAD.b);
    let closest = null, best = Infinity;
    filtered.forEach(r => {
      const dx = sx(r.dia) - mx, dy = sy(r[cfg.yField]) - my, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 20 && d < best) { closest = r; best = d; }
    });
    return closest;
  }, [isMobile, cfg, filtered, axisBounds]);

  const showTip = useCallback((r, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    const dry = (r.dry || "none").replace(/_/g, " ");
    const typeLabel = r.type.charAt(0).toUpperCase() + r.type.slice(1);
    const fallsLine = r.falls ? ` · ${r.falls} falls` : "";
    const impactLine = r.impact ? ` · Impact: ${r.impact}kN` : "";
    const sheathLine = r.sheath ? ` · Sheath: ${r.sheath}%` : "";
    tip.innerHTML = `<b style="color:${T.accent}">${r.brand} ${r.model}</b><br/><span style="color:${TYPE_COLORS[r.type]}">${typeLabel}</span> · ∅ ${r.dia}mm · ${r.gm}g/m${fallsLine}${impactLine}${sheathLine}<br/><span style="color:#64748b;font-size:11px">Dry: ${dry}${r.triple ? " · Triple rated" : ""}</span>`
      + (pinned ? `<br/><a href="/rope/${r.slug}" style="display:inline-block;margin-top:6px;padding:3px 10px;background:${T.accentSoft};color:${T.accent};border-radius:4px;font-size:11px;font-weight:600;text-decoration:none">View full specs →</a>` : "");
    tip.style.opacity = "1";
    tip.style.pointerEvents = pinned ? "auto" : "none";
    tip.style.borderColor = pinned ? T.accent : "rgba(99,179,237,.35)";
    let tx = x + 14, ty = y - 10;
    if (tx + 280 > window.innerWidth) tx = x - 290;
    if (ty + 130 > window.innerHeight) ty = y - 130;
    tip.style.left = tx + "px"; tip.style.top = ty + "px";
  }, []);

  const hideTip = useCallback(() => {
    const tip = tipRef.current;
    if (tip) { tip.style.opacity = "0"; tip.style.pointerEvents = "none"; }
  }, []);

  const handleMove = useCallback((e) => {
    if (pinnedRef.current) return;
    const r = findClosest(e);
    const prev = hovRef.current;
    if (r !== prev) { hovRef.current = r; draw(); }
    if (r) showTip(r, e.clientX, e.clientY, false); else hideTip();
  }, [findClosest, draw, showTip, hideTip]);

  const handleLeave = useCallback(() => {
    if (pinnedRef.current) return;
    hovRef.current = null; draw(); hideTip();
  }, [draw, hideTip]);

  const handleClick = useCallback((e) => {
    const r = findClosest(e);
    if (pinnedRef.current === r) {
      pinnedRef.current = null; hovRef.current = null; draw(); hideTip();
    } else if (r) {
      pinnedRef.current = r; hovRef.current = r; draw();
      showTip(r, e.clientX, e.clientY, true);
    } else {
      pinnedRef.current = null; hovRef.current = null; draw(); hideTip();
    }
  }, [findClosest, draw, showTip, hideTip]);

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

  /* Shape legend items */
  const TYPE_SHAPES = { single: "circle", half: "diamond", twin: "triangle", static: "square" };

  return (
    <ChartContainer title="Rope Diameter Deep Dive" subtitle={cfg.sub}>
      {/* Metric buttons */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
        {Object.entries({ falls: { label: "UIAA Falls", color: T.accent }, gm: { label: "Weight (g/m)", color: T.blue } }).map(([k, c]) => (
          <button key={k} onClick={() => { setMetric(k); pinnedRef.current = null; hovRef.current = null; hideTip(); }}
            style={btnStyle(metric === k, c.color)}>{c.label}</button>
        ))}
      </div>

      {/* Rope type filter */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
        {/* Reset all */}
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

      {/* Color-by toggle */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: T.muted }}>Color by:</span>
        {[["type", "Rope Type"], ["dry", "Treatment"], ["brand", "Brand"]].map(([k, l]) => (
          <button key={k} onClick={() => setColorBy(k)} style={{
            padding: "3px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "5px", border: "none", cursor: "pointer",
            background: colorBy === k ? "rgba(255,255,255,.1)" : "transparent", color: colorBy === k ? T.text : T.muted,
          }}>{l}</button>
        ))}
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} style={{ display: "block", cursor: "crosshair", width: "100%" }}
        onMouseMove={handleMove} onMouseLeave={handleLeave} onClick={handleClick} />

      {/* Tooltip */}
      <div ref={tipRef} style={{
        position: "fixed", pointerEvents: "none", background: "rgba(15,17,25,.95)", border: "1px solid rgba(99,179,237,.35)",
        borderRadius: "8px", padding: "10px 14px", fontSize: "12px", lineHeight: 1.5, color: T.text,
        boxShadow: "0 8px 24px rgba(0,0,0,.6)", zIndex: 999, opacity: 0, transition: "opacity .1s", maxWidth: "280px",
      }} />

      {/* Legends */}
      {colorBy === "type" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {Object.entries(TYPE_COLORS).filter(([k]) => enabledTypes.has(k)).map(([k, c]) => (
            <Pill key={k} color={c} label={k.charAt(0).toUpperCase() + k.slice(1)} shape={TYPE_SHAPES[k]} hidden={false} onClick={() => toggleType(k)} />
          ))}
        </div>
      )}
      {colorBy === "dry" && (
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {DRY_LIST.map(k => (
            <Pill key={k} color={DRY_COLORS[k] || "#94a3b8"} label={DRY_LABELS[k] || k}
              hidden={hiddenDry.has(k)} onClick={() => toggleHidden(setHiddenDry, k)} />
          ))}
        </div>
      )}
      {colorBy === "brand" && (
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {BRAND_LIST.map(b => (
            <Pill key={b} color={BRAND_COLORS[b]} label={b}
              hidden={hiddenBrands.has(b)} onClick={() => toggleHidden(setHiddenBrands, b)} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          Click a dot for specs & link · Click legend to filter
          {enabledTypes.has("single") && " · Trend line = single ropes only"}
        </span>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          {enabledTypes.has("half") && "◇ Half"}{enabledTypes.has("half") && enabledTypes.has("twin") && " · "}{enabledTypes.has("twin") && "△ Twin"}{(enabledTypes.has("half") || enabledTypes.has("twin")) && enabledTypes.has("static") && " · "}{enabledTypes.has("static") && "□ Static"}
        </span>
      </div>
    </ChartContainer>
  );
}
