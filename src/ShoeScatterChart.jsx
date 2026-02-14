import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import { computeEdging, computeSensitivity, computeSupport, getComfortScore } from "./utils/comfort.js";

/* ─── Color palettes ─── */
const CLOSURE_COLORS = { lace: "#60a5fa", velcro: "#E8734A", slipper: "#34d399" };
const VEGAN_COLORS = { true: "#34d399", false: "#a78bfa" };
const BRAND_PAL = [
  "#63b3ed","#ed64a6","#48bb78","#ecc94b","#ed8936","#9f7aea","#38b2ac","#fc8181",
  "#f6ad55","#68d391","#d53f8c","#4fd1c5","#b794f4","#90cdf4","#feb2b2","#fbd38d",
  "#81e6d9","#c4b5fd","#fca5a5","#bef264","#e879f9","#67e8f9",
];

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
function Pill({ color, label, hidden, onClick }) {
  return (
    <span onClick={onClick} style={{
      fontSize: "10px", color: hidden ? "#4a5568" : T.muted, display: "flex", alignItems: "center", gap: "4px",
      cursor: "pointer", padding: "2px 8px", borderRadius: "10px", userSelect: "none",
      background: hidden ? "transparent" : "rgba(255,255,255,.04)",
      border: `1px solid ${hidden ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.1)"}`,
      opacity: hidden ? 0.4 : 1, textDecoration: hidden ? "line-through" : "none",
      transition: "all .15s",
    }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, display: "inline-block", opacity: hidden ? 0.3 : 1 }} />
      {label}
    </span>
  );
}

/* ─── Main Component ─── */
export default function ShoeScatterChart({ shoes = [], isMobile }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);

  const [metric, setMetric] = useState("edging_sensitivity");
  const [colorBy, setColorBy] = useState("closure");

  /* Filter state */
  const [hideKids, setHideKids] = useState(true);
  const [genderFilter, setGenderFilter] = useState("all"); // all | unisex | womens | mens
  const [footShape, setFootShape] = useState("all"); // all | egyptian | roman | greek
  const [hiddenClosure, setHiddenClosure] = useState(new Set());
  const [hiddenBrands, setHiddenBrands] = useState(new Set());
  const [hiddenVegan, setHiddenVegan] = useState(new Set());

  const toggleHidden = (setter, key) => setter(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  /* Compute scores once per shoe set */
  const scored = useMemo(() => shoes.map(s => ({
    ...s,
    _edging: computeEdging(s),
    _sensitivity: computeSensitivity(s),
    _support: computeSupport(s),
    _comfort: getComfortScore(s),
    _price: s.price_uvp_eur || 0,
    _vegan: s.vegan ? "true" : "false",
  })), [shoes]);

  /* Brand list & colors */
  const BRAND_LIST = useMemo(() => [...new Set(scored.map(d => d.brand))].sort(), [scored]);
  const BRAND_COLORS = useMemo(() => Object.fromEntries(BRAND_LIST.map((b, i) => [b, BRAND_PAL[i % BRAND_PAL.length]])), [BRAND_LIST]);

  /* Apply filters */
  const filtered = useMemo(() => scored.filter(d => {
    if (hideKids && d.kids_friendly) return false;
    if (genderFilter !== "all" && d.gender !== genderFilter) return false;
    if (footShape !== "all" && d.toe_form !== footShape) return false;
    if (hiddenClosure.has(d.closure)) return false;
    if (hiddenBrands.has(d.brand)) return false;
    if (hiddenVegan.has(d._vegan)) return false;
    return true;
  }), [scored, hideKids, genderFilter, footShape, hiddenClosure, hiddenBrands, hiddenVegan]);

  /* ─── Axis configurations ─── */
  const cfgs = useMemo(() => ({
    edging_sensitivity: {
      xField: "_edging", yField: "_sensitivity",
      xLabel: "Edging", yLabel: "Sensitivity",
      xMin: 0, xMax: 1, yMin: 0, yMax: 1, xStep: 0.2, yStep: 0.2,
      pctAxis: true,
      label: "Edging vs Sensitivity",
      sub: `${filtered.length} shoes — stiff precision vs soft feedback`,
    },
    edging_comfort: {
      xField: "_edging", yField: "_comfort",
      xLabel: "Edging", yLabel: "Comfort",
      xMin: 0, xMax: 1, yMin: 0, yMax: 1, xStep: 0.2, yStep: 0.2,
      pctAxis: true,
      label: "Edging vs Comfort",
      sub: `${filtered.length} shoes — the classic trade-off`,
    },
    support_sensitivity: {
      xField: "_support", yField: "_sensitivity",
      xLabel: "Support", yLabel: "Sensitivity",
      xMin: 0, xMax: 1, yMin: 0, yMax: 1, xStep: 0.2, yStep: 0.2,
      pctAxis: true,
      label: "Support vs Sensitivity",
      sub: `${filtered.length} shoes — rigid structure vs rock feel`,
    },
    edging_price: {
      xField: "_edging", yField: "_price",
      xLabel: "Edging", yLabel: "Price (€)",
      xMin: 0, xMax: 1, yMin: 20, yMax: 210, xStep: 0.2, yStep: 30,
      pctAxis: false, xPct: true,
      label: "Edging vs Price",
      sub: `${filtered.length} shoes — does expensive mean better edging?`,
    },
    sensitivity_price: {
      xField: "_sensitivity", yField: "_price",
      xLabel: "Sensitivity", yLabel: "Price (€)",
      xMin: 0, xMax: 1, yMin: 20, yMax: 210, xStep: 0.2, yStep: 30,
      pctAxis: false, xPct: true,
      label: "Sensitivity vs Price",
      sub: `${filtered.length} shoes — feel more for less?`,
    },
    support_price: {
      xField: "_support", yField: "_price",
      xLabel: "Support", yLabel: "Price (€)",
      xMin: 0, xMax: 1, yMin: 20, yMax: 210, xStep: 0.2, yStep: 30,
      pctAxis: false, xPct: true,
      label: "Support vs Price",
      sub: `${filtered.length} shoes — stiffness at every price point`,
    },
  }), [filtered.length]);
  const cfg = cfgs[metric];

  /* Color function */
  const getColor = useCallback((d) => {
    if (colorBy === "closure") return CLOSURE_COLORS[d.closure] || "#94a3b8";
    if (colorBy === "vegan") return VEGAN_COLORS[d._vegan] || "#94a3b8";
    return BRAND_COLORS[d.brand] || "#94a3b8";
  }, [colorBy, BRAND_COLORS]);

  /* ─── Draw ─── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width, H = isMobile ? 300 : 400;
    const PAD = { t: 20, r: 20, b: 44, l: 52 };
    canvas.width = W * 2; canvas.height = H * 2;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { xField, yField, xMin, xMax, yMin, yMax, xStep, yStep, pctAxis, xPct } = cfg;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    for (let x = xMin + xStep; x <= xMax + 0.001; x += xStep) {
      ctx.beginPath(); ctx.moveTo(sx(x), PAD.t); ctx.lineTo(sx(x), H - PAD.b); ctx.stroke();
    }
    for (let y = yMin; y <= yMax + 0.001; y += yStep) {
      ctx.beginPath(); ctx.moveTo(PAD.l, sy(y)); ctx.lineTo(W - PAD.r, sy(y)); ctx.stroke();
    }

    // Tick labels
    ctx.fillStyle = "#4a5568"; ctx.font = "10px system-ui"; ctx.textAlign = "center";
    for (let x = xMin; x <= xMax + 0.001; x += xStep) {
      const lbl = (pctAxis || xPct) ? Math.round(x * 100) + "%" : x.toFixed(1);
      ctx.fillText(lbl, sx(x), H - PAD.b + 14);
    }
    ctx.textAlign = "right";
    for (let y = yMin; y <= yMax + 0.001; y += yStep) {
      const lbl = pctAxis ? Math.round(y * 100) + "%" : cfg.yLabel.includes("€") ? "€" + Math.round(y) : Math.round(y);
      ctx.fillText(lbl, PAD.l - 6, sy(y) + 3);
    }
    ctx.fillStyle = "#64748b"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(cfg.xLabel, W / 2, H - 6);
    ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(cfg.yLabel, 0, 0); ctx.restore();

    // "Best of both" zone for edging_comfort (top-right quadrant)
    if (metric === "edging_comfort") {
      const x1 = sx(0.6), x2 = sx(1.0), y1 = sy(1.0), y2 = sy(0.6);
      ctx.fillStyle = "rgba(34,197,94,.06)"; ctx.strokeStyle = "rgba(34,197,94,.3)";
      ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.roundRect(x1, y1, x2 - x1, y2 - y1, 6); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(34,197,94,.6)"; ctx.font = "bold 9px system-ui";
      ctx.fillText("Best of both", (x1 + x2) / 2, y1 + 12);
    }

    // Dots
    const hovered = hovRef.current;
    filtered.forEach(d => {
      const xv = d[xField], yv = d[yField];
      if (xv == null || yv == null) return;
      const px = sx(Math.max(xMin, Math.min(xMax, xv)));
      const py = sy(Math.max(yMin, Math.min(yMax, yv)));
      const isH = hovered === d;
      const hex = getColor(d);
      const [cr, cg, cb] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      const r = 4;
      ctx.beginPath(); ctx.arc(px, py, isH ? r + 2.5 : r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${isH ? 1 : 0.7})`; ctx.fill();
      ctx.strokeStyle = isH ? "#fff" : `rgba(${cr},${cg},${cb},0.3)`; ctx.lineWidth = isH ? 2 : 0.8; ctx.stroke();
    });
  }, [metric, cfg, isMobile, getColor, filtered]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);

  /* ─── Hover / Click ─── */
  const findClosest = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = rect.width, H = isMobile ? 300 : 400;
    const PAD_C = { t: 20, r: 20, b: 44, l: 52 };
    const { xField, yField, xMin, xMax, yMin, yMax } = cfg;
    const sx = x => PAD_C.l + (x - xMin) / (xMax - xMin) * (W - PAD_C.l - PAD_C.r);
    const sy = y => H - PAD_C.b - (y - yMin) / (yMax - yMin) * (H - PAD_C.t - PAD_C.b);
    let closest = null, best = Infinity;
    filtered.forEach(d => {
      const xv = d[xField], yv = d[yField];
      if (xv == null || yv == null) return;
      const dx = sx(xv) - mx, dy = sy(yv) - my, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 22 && dist < best) { closest = d; best = dist; }
    });
    return closest;
  }, [isMobile, cfg, filtered]);

  const pct = v => v != null ? Math.round(v * 100) + "%" : "–";

  const showTip = useCallback((d, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.innerHTML = `<b style="color:${T.accent}">${d.brand} ${d.model}</b><br/>`
      + `Edging ${pct(d._edging)} · Sensitivity ${pct(d._sensitivity)}<br/>`
      + `Comfort ${pct(d._comfort)} · Support ${pct(d._support)}<br/>`
      + `<span style="color:#64748b;font-size:11px">${d.closure} · ${d.downturn} · ${d.feel} feel`
      + `${d.price_uvp_eur ? " · €" + d.price_uvp_eur : ""}`
      + `${d.vegan ? " · 🌱" : ""}</span>`
      + (pinned ? `<br/><a href="/shoe/${d.slug}" style="display:inline-block;margin-top:6px;padding:3px 10px;background:${T.accentSoft};color:${T.accent};border-radius:4px;font-size:11px;font-weight:600;text-decoration:none">View full specs →</a>` : "");
    tip.style.opacity = "1";
    tip.style.pointerEvents = pinned ? "auto" : "none";
    tip.style.borderColor = pinned ? T.accent : "rgba(99,179,237,.35)";
    let tx = x + 14, ty = y - 10;
    if (tx + 280 > window.innerWidth) tx = x - 290;
    if (ty + 160 > window.innerHeight) ty = y - 160;
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
    if (d) showTip(d, e.clientX, e.clientY, false); else hideTip();
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
      if (a && a.getAttribute("href")?.startsWith("/shoe/")) { e.preventDefault(); navigate(a.getAttribute("href")); }
    };
    tip.addEventListener("click", onClick);
    return () => tip.removeEventListener("click", onClick);
  }, [navigate]);

  /* ─── Legend data ─── */
  const closureKeys = ["lace", "velcro", "slipper"];
  const veganKeys = ["true", "false"];

  const metricButtons = [
    { key: "edging_sensitivity", label: "Edging vs Sensitivity", short: "Edg/Sens", color: T.accent },
    { key: "edging_comfort", label: "Edging vs Comfort", short: "Edg/Comf", color: T.blue },
    { key: "support_sensitivity", label: "Support vs Sensitivity", short: "Sup/Sens", color: T.green },
    { key: "edging_price", label: "Edging vs Price", short: "Edg/€", color: "#ecc94b" },
    { key: "sensitivity_price", label: "Sensitivity vs Price", short: "Sens/€", color: "#a78bfa" },
    { key: "support_price", label: "Support vs Price", short: "Sup/€", color: "#38b2ac" },
  ];

  const btnStyle = (active, color) => ({
    padding: "4px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "6px", border: "none", cursor: "pointer",
    background: active ? color : T.surface, color: active ? "#fff" : T.muted,
    whiteSpace: "nowrap",
  });

  const filterBtn = (active) => ({
    padding: "3px 8px", fontSize: "10px", fontWeight: 600, borderRadius: "4px", border: "none", cursor: "pointer",
    background: active ? "rgba(255,255,255,.1)" : "transparent", color: active ? T.text : T.muted,
  });

  return (
    <ChartContainer title={cfg.label} subtitle={cfg.sub}>
      {/* Metric buttons */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "10px", flexWrap: "wrap" }}>
        {metricButtons.map(m => (
          <button key={m.key} onClick={() => { setMetric(m.key); pinnedRef.current = null; hovRef.current = null; hideTip(); }}
            style={btnStyle(metric === m.key, m.color)}>
            {isMobile ? m.short : m.label}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
        {/* Kids toggle */}
        <label style={{ fontSize: "11px", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
          <input type="checkbox" checked={hideKids} onChange={e => setHideKids(e.target.checked)}
            style={{ accentColor: T.accent, width: "13px", height: "13px" }} />
          Hide kids
        </label>

        {/* Gender */}
        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: T.muted, marginRight: "2px" }}>Gender:</span>
          {[["all", "All"], ["unisex", "Unisex"], ["womens", "Women"], ["mens", "Men"]].map(([k, l]) => (
            <button key={k} onClick={() => setGenderFilter(k)} style={filterBtn(genderFilter === k)}>{l}</button>
          ))}
        </div>

        {/* Foot shape */}
        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: T.muted, marginRight: "2px" }}>Toe:</span>
          {[["all", "All"], ["egyptian", "Egyptian"], ["roman", "Roman"], ["greek", "Greek"]].map(([k, l]) => (
            <button key={k} onClick={() => setFootShape(k)} style={filterBtn(footShape === k)}>{l}</button>
          ))}
        </div>
      </div>

      {/* Color-by toggle */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: T.muted }}>Color by:</span>
        {[["closure", "Closure"], ["vegan", "Vegan"], ["brand", "Brand"]].map(([k, l]) => (
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
      {colorBy === "closure" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {closureKeys.map(k => (
            <Pill key={k} color={CLOSURE_COLORS[k]} label={k.charAt(0).toUpperCase() + k.slice(1)}
              hidden={hiddenClosure.has(k)} onClick={() => toggleHidden(setHiddenClosure, k)} />
          ))}
        </div>
      )}
      {colorBy === "vegan" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {veganKeys.map(k => (
            <Pill key={k} color={VEGAN_COLORS[k]} label={k === "true" ? "🌱 Vegan" : "Non-vegan"}
              hidden={hiddenVegan.has(k)} onClick={() => toggleHidden(setHiddenVegan, k)} />
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

      <div style={{ marginTop: "6px", textAlign: "center" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>Click a dot for specs & detail link · Click legend to filter</span>
      </div>
    </ChartContainer>
  );
}
