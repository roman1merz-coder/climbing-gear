import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import CRASHPAD_SEED from "./crashpad_seed_data.json";

/* ─── Data ─── */
const PADS = CRASHPAD_SEED.filter(p => p.length_open_cm && p.width_open_cm && p.weight_kg && p.current_price_eur)
  .map(p => {
    const area = (p.length_open_cm * p.width_open_cm) / 10000; // m²
    const vol = area * (p.thickness_cm || 10) / 100; // m³
    const eurM2 = Math.round(p.current_price_eur / area);
    return {
      brand: p.brand, model: p.model, slug: p.slug,
      area, vol, weight: p.weight_kg, price: p.current_price_eur,
      eurM2, layers: p.foam_layers || 0, fold: p.fold_style || "unknown",
      thickness: p.thickness_cm || 10,
    };
  });

/* Color coding by foam layers */
const LAYER_COLORS = {
  0: "#94a3b8", 1: "#60a5fa", 2: "#22c55e", 3: "#E8734A", 4: "#ef4444", 5: "#a78bfa", 7: "#eab308",
};
const FOLD_COLORS = {
  taco: "#E8734A", hinge: "#60a5fa", tri_fold: "#22c55e", hybrid: "#a78bfa",
  inflatable: "#eab308", baffled: "#94a3b8", unknown: "#6b7280",
};

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

/* ─── Main Component ─── */
export default function CrashpadScatterChart({ isMobile }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const [metric, setMetric] = useState("area_weight"); // 4 views
  const [colorBy, setColorBy] = useState("layers"); // "layers" | "fold"
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);

  const cfgs = {
    area_weight: {
      xField: "area", yField: "weight", xLabel: "Landing Area (m²)", yLabel: "Weight (kg)",
      xMin: 0.3, xMax: 2.5, yMin: 0, yMax: 11, xStep: 0.5, yStep: 2,
      label: "Area vs Weight", sub: `${PADS.length} crashpads — bigger = heavier, but by how much?`,
    },
    area_price: {
      xField: "area", yField: "price", xLabel: "Landing Area (m²)", yLabel: "Price (€)",
      xMin: 0.3, xMax: 2.5, yMin: 0, yMax: 650, xStep: 0.5, yStep: 100,
      label: "Area vs Price", sub: `${PADS.length} crashpads — what does more landing zone cost?`,
    },
    area_eurm2: {
      xField: "area", yField: "eurM2", xLabel: "Landing Area (m²)", yLabel: "€ / m²",
      xMin: 0.3, xMax: 2.5, yMin: 30, yMax: 420, xStep: 0.5, yStep: 50,
      label: "Area vs €/m²", sub: `${PADS.length} crashpads — value density across the market`,
    },
    eurm2_weight: {
      xField: "eurM2", yField: "weight", xLabel: "€ / m²", yLabel: "Weight (kg)",
      xMin: 30, xMax: 420, yMin: 0, yMax: 11, xStep: 50, yStep: 2,
      label: "€/m² vs Weight", sub: `${PADS.length} crashpads — cheap AND light is the sweet spot`,
    },
  };
  const cfg = cfgs[metric];

  const getColor = useCallback((d) => {
    if (colorBy === "fold") return FOLD_COLORS[d.fold] || FOLD_COLORS.unknown;
    return LAYER_COLORS[d.layers] || "#94a3b8";
  }, [colorBy]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width, H = isMobile ? 300 : 400;
    const PAD = { t: 20, r: 20, b: 44, l: 55 };
    canvas.width = W * 2; canvas.height = H * 2;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { xField, yField, xMin, xMax, yMin, yMax, xStep, yStep } = cfg;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    for (let x = xMin + xStep; x <= xMax; x += xStep) {
      ctx.beginPath(); ctx.moveTo(sx(x), PAD.t); ctx.lineTo(sx(x), H - PAD.b); ctx.stroke();
    }
    for (let y = yMin; y <= yMax; y += yStep) {
      ctx.beginPath(); ctx.moveTo(PAD.l, sy(y)); ctx.lineTo(W - PAD.r, sy(y)); ctx.stroke();
    }

    // Tick labels
    ctx.fillStyle = "#4a5568"; ctx.font = "10px system-ui"; ctx.textAlign = "center";
    for (let x = xMin + xStep; x <= xMax; x += xStep) {
      const label = cfg.xLabel.includes("m²") ? x.toFixed(1) : Math.round(x);
      ctx.fillText(label, sx(x), H - PAD.b + 14);
    }
    ctx.textAlign = "right";
    for (let y = yMin; y <= yMax; y += yStep) {
      const label = cfg.yLabel.includes("€") ? "€" + y : y;
      ctx.fillText(label, PAD.l - 6, sy(y) + 3);
    }
    ctx.fillStyle = "#64748b"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(cfg.xLabel, W / 2, H - 6);
    ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(cfg.yLabel, 0, 0); ctx.restore();

    // Sweet spot zone for area_eurm2 view
    if (metric === "area_eurm2") {
      const x1 = sx(1.0), x2 = sx(1.7), y1 = sy(220), y2 = sy(150);
      ctx.fillStyle = "rgba(34,197,94,.06)"; ctx.strokeStyle = "rgba(34,197,94,.3)";
      ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.roundRect(x1, y1, x2 - x1, y2 - y1, 6); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(34,197,94,.6)"; ctx.font = "bold 9px system-ui";
      ctx.fillText("Sweet Spot", (x1 + x2) / 2, y1 + 12);
    }

    // Dots
    const hovered = hovRef.current;
    PADS.forEach(d => {
      const px = sx(Math.max(xMin, Math.min(xMax, d[xField])));
      const py = sy(Math.max(yMin, Math.min(yMax, d[yField])));
      const isH = hovered === d;
      const hex = getColor(d);
      const [cr, cg, cb] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

      // Size dot by area (bigger pad = bigger dot)
      const r = Math.max(3.5, Math.min(7, d.area * 3.5));
      ctx.beginPath(); ctx.arc(px, py, isH ? r + 2 : r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${isH ? 1 : 0.7})`; ctx.fill();
      ctx.strokeStyle = isH ? "#fff" : `rgba(${cr},${cg},${cb},0.3)`; ctx.lineWidth = isH ? 2 : 0.8; ctx.stroke();
    });
  }, [metric, colorBy, isMobile, cfg, getColor]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);

  const findClosest = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = rect.width, H = isMobile ? 300 : 400;
    const PAD_C = { t: 20, r: 20, b: 44, l: 55 };
    const { xField, yField, xMin, xMax, yMin, yMax } = cfg;
    const sx = x => PAD_C.l + (x - xMin) / (xMax - xMin) * (W - PAD_C.l - PAD_C.r);
    const sy = y => H - PAD_C.b - (y - yMin) / (yMax - yMin) * (H - PAD_C.t - PAD_C.b);
    let closest = null, best = Infinity;
    PADS.forEach(d => {
      const dx = sx(d[xField]) - mx, dy = sy(d[yField]) - my, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 24 && dist < best) { closest = d; best = dist; }
    });
    return closest;
  }, [isMobile, cfg]);

  const showTip = useCallback((d, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.innerHTML = `<b style="color:${T.accent}">${d.brand} ${d.model}</b><br/>`
      + `${d.area.toFixed(2)}m² · ${d.weight}kg · €${d.price}<br/>`
      + `€${d.eurM2}/m² · ${d.layers} foam layers · ${d.fold}<br/>`
      + `<span style="color:#64748b;font-size:11px">${d.thickness}cm thick</span>`
      + (pinned ? `<br/><a href="/crashpad/${d.slug}" style="display:inline-block;margin-top:6px;padding:3px 10px;background:${T.accentSoft};color:${T.accent};border-radius:4px;font-size:11px;font-weight:600;text-decoration:none">View full specs →</a>` : "");
    tip.style.opacity = "1";
    tip.style.pointerEvents = pinned ? "auto" : "none";
    tip.style.borderColor = pinned ? T.accent : "rgba(99,179,237,.35)";
    let tx = x + 14, ty = y - 10;
    if (tx + 280 > window.innerWidth) tx = x - 290;
    if (ty + 140 > window.innerHeight) ty = y - 140;
    tip.style.left = tx + "px"; tip.style.top = ty + "px";
  }, []);

  const hideTip = useCallback(() => {
    const tip = tipRef.current;
    if (tip) { tip.style.opacity = "0"; tip.style.pointerEvents = "none"; }
  }, []);

  const handleMove = useCallback((e) => {
    if (pinnedRef.current) return;
    const d = findClosest(e);
    if (d !== hovRef.current) { hovRef.current = d; draw(); }
    if (d) showTip(d, e.clientX, e.clientY, false);
    else hideTip();
  }, [findClosest, draw, showTip, hideTip]);

  const handleLeave = useCallback(() => {
    if (pinnedRef.current) return;
    hovRef.current = null; draw(); hideTip();
  }, [draw, hideTip]);

  const handleClick = useCallback((e) => {
    const d = findClosest(e);
    if (pinnedRef.current === d) {
      pinnedRef.current = null; hovRef.current = null; draw(); hideTip();
    } else if (d) {
      pinnedRef.current = d; hovRef.current = d; draw();
      showTip(d, e.clientX, e.clientY, true);
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
      if (a && a.getAttribute("href")?.startsWith("/crashpad/")) { e.preventDefault(); navigate(a.getAttribute("href")); }
    };
    tip.addEventListener("click", onClick);
    return () => tip.removeEventListener("click", onClick);
  }, [navigate]);

  const metricButtons = [
    { key: "area_weight", label: "Area vs Weight", color: T.accent },
    { key: "area_price", label: "Area vs Price", color: T.blue },
    { key: "area_eurm2", label: "Area vs €/m²", color: T.green },
    { key: "eurm2_weight", label: "€/m² vs Weight", color: "#a78bfa" },
  ];

  const legendItems = colorBy === "layers"
    ? [1, 2, 3, 4, 5].map(l => ({ color: LAYER_COLORS[l], label: `${l} layer${l > 1 ? "s" : ""}` }))
    : Object.entries(FOLD_COLORS).filter(([k]) => k !== "unknown").map(([k, c]) => ({ color: c, label: k.replace("_", "-") }));

  return (
    <ChartContainer title={cfg.label} subtitle={cfg.sub}>
      {/* Metric buttons */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "10px", flexWrap: "wrap" }}>
        {metricButtons.map(m => (
          <button key={m.key} onClick={() => { setMetric(m.key); pinnedRef.current = null; hovRef.current = null; hideTip(); }} style={{
            padding: "4px 12px", fontSize: "11px", fontWeight: 600, borderRadius: "6px", border: "none", cursor: "pointer",
            background: metric === m.key ? m.color : T.surface, color: metric === m.key ? "#fff" : T.muted,
          }}>{isMobile ? m.label.replace(" vs ", "/") : m.label}</button>
        ))}
      </div>
      {/* Color toggle */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: T.muted }}>Color by:</span>
        {["layers", "fold"].map(k => (
          <button key={k} onClick={() => setColorBy(k)} style={{
            padding: "3px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "5px", border: "none", cursor: "pointer",
            background: colorBy === k ? "rgba(255,255,255,.1)" : "transparent", color: colorBy === k ? T.text : T.muted,
          }}>{k === "layers" ? "Foam Layers" : "Fold Style"}</button>
        ))}
      </div>
      <canvas ref={canvasRef} style={{ display: "block", cursor: "crosshair", width: "100%" }}
        onMouseMove={handleMove} onMouseLeave={handleLeave} onClick={handleClick} />
      <div ref={tipRef} style={{
        position: "fixed", pointerEvents: "none", background: "rgba(15,17,25,.95)", border: "1px solid rgba(99,179,237,.35)",
        borderRadius: "8px", padding: "10px 14px", fontSize: "12px", lineHeight: 1.5, color: T.text,
        boxShadow: "0 8px 24px rgba(0,0,0,.6)", zIndex: 999, opacity: 0, transition: "opacity .1s", maxWidth: "280px",
      }} />
      {/* Legend */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
        {legendItems.map(l => (
          <span key={l.label} style={{ fontSize: "10px", color: T.muted, display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: l.color, display: "inline-block" }} />{l.label}
          </span>
        ))}
      </div>
      <div style={{ marginTop: "6px", textAlign: "center" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>Click a dot for specs & detail link · Dot size = landing area</span>
      </div>
    </ChartContainer>
  );
}
