import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import ROPE_SEED from "./rope_seed_data.json";

/* ─── Data ─── */
const SINGLES = ROPE_SEED.filter(r => r.rope_type === "single" && r.diameter_mm && r.uiaa_falls && r.weight_per_meter_g)
  .map(r => ({ brand: r.brand, model: r.model, slug: r.slug, dia: r.diameter_mm, falls: r.uiaa_falls, gm: r.weight_per_meter_g, impact: r.impact_force_kn, dry: r.dry_treatment || "none", triple: !!r.triple_rated, sheath: r.sheath_percentage }));
const HALVES = ROPE_SEED.filter(r => r.rope_type === "half" && r.diameter_mm && r.weight_per_meter_g)
  .map(r => ({ brand: r.brand, model: r.model, slug: r.slug, dia: r.diameter_mm, falls: r.uiaa_falls, gm: r.weight_per_meter_g }));

/* Polynomial curve data (pre-computed) */
const CX=[7.5,7.6,7.7,7.8,7.9,8.0,8.1,8.2,8.3,8.4,8.5,8.6,8.7,8.8,8.9,9.0,9.1,9.2,9.3,9.4,9.5,9.6,9.7,9.8,9.9,10.0,10.1,10.2,10.3,10.4,10.5,10.6,10.7,10.8,10.9,11.0,11.1,11.2,11.3,11.4];
const CF=[2.585,2.949,3.288,3.601,3.892,4.163,4.415,4.651,4.872,5.082,5.281,5.472,5.657,5.838,6.018,6.197,6.379,6.565,6.757,6.958,7.169,7.393,7.631,7.886,8.16,8.454,8.771,9.114,9.483,9.881,10.311,10.773,11.271,11.806,12.38,12.996,13.655,14.36,15.113,15.915];
const CG=[41.154,41.905,42.67,43.449,44.243,45.05,45.872,46.707,47.557,48.421,49.3,50.192,51.098,52.019,52.954,53.903,54.866,55.843,56.835,57.84,58.86,59.894,60.942,62.004,63.08,64.171,65.275,66.394,67.527,68.674,69.835,71.01,72.2,73.404,74.621,75.853,77.099,78.36,79.634,80.923];
const SF=1.316, SG=1.660;

const BRAND_PAL=['#63b3ed','#ed64a6','#48bb78','#ecc94b','#ed8936','#9f7aea','#38b2ac','#fc8181','#f6ad55','#68d391','#d53f8c','#4fd1c5','#b794f4','#90cdf4','#feb2b2','#fbd38d'];
const BRAND_LIST=[...new Set(SINGLES.map(r=>r.brand))].sort();
const BRAND_COLOR=Object.fromEntries(BRAND_LIST.map((b,i)=>[b,BRAND_PAL[i%BRAND_PAL.length]]));

/* ─── Chart Container (local) ─── */
function ChartContainer({ title, subtitle, children, style }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "24px", ...style }}>
      {title && <div style={{ fontSize: "15px", fontWeight: 700, color: T.text, marginBottom: subtitle ? "4px" : "16px" }}>{title}</div>}
      {subtitle && <div style={{ fontSize: "12px", color: T.muted, marginBottom: "16px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}

/* ─── Main Component ─── */
export default function RopeScatterChart({ isMobile }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const [metric, setMetric] = useState("falls");
  const [showH, setShowH] = useState(false);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);

  const cfgs = {
    falls: { yField: "falls", yLabel: "UIAA Falls", yMin: 0, yMax: 18, yStep: 2, curveY: CF, std: SF, sub: "Cubic fit · R² = 0.575", color: T.accent },
    gm:    { yField: "gm",    yLabel: "Weight (g/m)", yMin: 40, yMax: 82, yStep: 5, curveY: CG, std: SG, sub: "Quadratic fit · R² = 0.919", color: T.blue },
  };
  const cfg = cfgs[metric];

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
    const xMin = 7.3, xMax = 11.3;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    for (let x = 8; x <= 11; x += 0.5) { ctx.beginPath(); ctx.moveTo(sx(x), PAD.t); ctx.lineTo(sx(x), H - PAD.b); ctx.stroke(); }
    for (let y = yMin; y <= yMax; y += yStep) { ctx.beginPath(); ctx.moveTo(PAD.l, sy(y)); ctx.lineTo(W - PAD.r, sy(y)); ctx.stroke(); }
    // Ticks
    ctx.fillStyle = "#4a5568"; ctx.font = "10px system-ui"; ctx.textAlign = "center";
    for (let x = 8; x <= 11; x += 0.5) ctx.fillText(x.toFixed(1), sx(x), H - PAD.b + 14);
    ctx.textAlign = "right";
    for (let y = yMin; y <= yMax; y += yStep) ctx.fillText(y, PAD.l - 6, sy(y) + 3);
    ctx.fillStyle = "#64748b"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText("Diameter (mm)", W / 2, H - 6);
    ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(cfg.yLabel, 0, 0); ctx.restore();

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

    // Half ropes
    if (showH) {
      HALVES.filter(r => r.falls != null && r[yField] != null).forEach(r => {
        ctx.save(); ctx.translate(sx(r.dia), sy(r[yField])); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "rgba(237,100,166,.2)"; ctx.strokeStyle = "rgba(237,100,166,.4)"; ctx.lineWidth = 1;
        ctx.fillRect(-4, -4, 8, 8); ctx.strokeRect(-4, -4, 8, 8); ctx.restore();
      });
    }

    // Single rope dots
    const hovered = hovRef.current;
    SINGLES.forEach(r => {
      const px = sx(r.dia), py = sy(r[yField]);
      const isH = hovered === r;
      const hex = BRAND_COLOR[r.brand] || "#a0aec0";
      const [cr, cg, cb] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      ctx.beginPath(); ctx.arc(px, py, isH ? 6.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${isH ? 1 : 0.7})`; ctx.fill();
      ctx.strokeStyle = isH ? "#fff" : `rgba(${cr},${cg},${cb},0.3)`; ctx.lineWidth = isH ? 2 : 0.8; ctx.stroke();
    });
  }, [metric, showH, isMobile, cfg]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);

  const findClosest = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = rect.width, H = isMobile ? 300 : 400;
    const PAD = { t: 20, r: 20, b: 44, l: 50 };
    const xMin = 7.3, xMax = 11.3;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - cfg.yMin) / (cfg.yMax - cfg.yMin) * (H - PAD.t - PAD.b);
    let closest = null, best = Infinity;
    SINGLES.forEach(r => { const dx = sx(r.dia) - mx, dy = sy(r[cfg.yField]) - my, d = Math.sqrt(dx * dx + dy * dy); if (d < 20 && d < best) { closest = r; best = d; } });
    return closest;
  }, [isMobile, cfg]);

  const showTip = useCallback((r, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    const dry = (r.dry || "none").replace(/_/g, " ");
    tip.innerHTML = `<b style="color:${T.accent}">${r.brand} ${r.model}</b><br/>∅ ${r.dia}mm · ${r.gm}g/m · ${r.falls} falls<br/>Impact: ${r.impact}kN · Sheath: ${r.sheath}%<br/><span style="color:#64748b;font-size:11px">Dry: ${dry}${r.triple ? " · Triple rated" : ""}</span>`
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
    if (r) { showTip(r, e.clientX, e.clientY, false); }
    else { hideTip(); }
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
      const canvas = canvasRef.current;
      const tip = tipRef.current;
      if (canvas && canvas.contains(e.target)) return;
      if (tip && tip.contains(e.target)) return;
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

  return (
    <ChartContainer title="Rope Diameter Deep Dive" subtitle={`106 single ropes · ${cfg.sub}`}>
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(cfgs).map(([k, c]) => (
          <button key={k} onClick={() => setMetric(k)} style={{
            padding: "5px 16px", fontSize: "12px", fontWeight: 600, borderRadius: "6px", border: "none", cursor: "pointer",
            background: metric === k ? c.color : T.surface, color: metric === k ? "#fff" : T.muted,
          }}>{c.yLabel}</button>
        ))}
        <label style={{ fontSize: "12px", color: T.muted, display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", marginLeft: "auto" }}>
          <input type="checkbox" checked={showH} onChange={e => setShowH(e.target.checked)} style={{ accentColor: T.accent, width: "14px", height: "14px" }} /> Half ropes
        </label>
      </div>
      <canvas ref={canvasRef} style={{ display: "block", cursor: "crosshair", width: "100%" }}
        onMouseMove={handleMove} onMouseLeave={handleLeave} onClick={handleClick} />
      <div ref={tipRef} style={{
        position: "fixed", pointerEvents: "none", background: "rgba(15,17,25,.95)", border: "1px solid rgba(99,179,237,.35)",
        borderRadius: "8px", padding: "10px 14px", fontSize: "12px", lineHeight: 1.5, color: T.text,
        boxShadow: "0 8px 24px rgba(0,0,0,.6)", zIndex: 999, opacity: 0, transition: "opacity .1s", maxWidth: "280px",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>Shaded band = ±1σ / ±2σ · Click a dot for specs & link · Trend line = single ropes only</span>
        {showH && <span style={{ fontSize: "10px", color: "#4a5568" }}>◇ = half ropes (55kg test)</span>}
      </div>
    </ChartContainer>
  );
}
