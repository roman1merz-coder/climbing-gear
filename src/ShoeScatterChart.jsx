import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import { buildPercentileMap } from "./utils/comfort.js";
import { ChartContainer, Pill, LegendRow, BottomSheet, buildTipHTML, positionTip, TIP_STYLE, getEventCoords, toggleHidden, chartPad, chartH, drawChartArea, drawGrid, drawTicks, drawCountBadge, drawDot, jitter, drawClusterBadges, drawCrosshair, hex2rgb } from "./ChartShared.jsx";

/* ─── Color palettes ─── */
const CLOSURE_COLORS = { lace: "#60a5fa", velcro: "#E8734A", slipper: "#34d399" };
const LEVEL_ORDER = ["beginner", "hobby", "intermediate", "advanced", "expert", "elite"];
const LEVEL_COLORS = { beginner: "#34d399", hobby: "#60a5fa", intermediate: "#a78bfa", advanced: "#ecc94b", expert: "#E8734A", elite: "#ed64a6" };
const LEVEL_LABELS = { beginner: "Beginner", hobby: "Hobby", intermediate: "Intermediate", advanced: "Advanced", expert: "Expert", elite: "Elite" };
function topLevel(shoe) {
  const lvls = shoe.skill_level || [];
  for (let i = LEVEL_ORDER.length - 1; i >= 0; i--) if (lvls.includes(LEVEL_ORDER[i])) return LEVEL_ORDER[i];
  return "intermediate";
}
const BRAND_PAL = [
  "#63b3ed","#ed64a6","#48bb78","#ecc94b","#ed8936","#9f7aea","#38b2ac","#fc8181",
  "#f6ad55","#68d391","#d53f8c","#4fd1c5","#b794f4","#90cdf4","#feb2b2","#fbd38d",
  "#81e6d9","#c4b5fd","#fca5a5","#bef264","#e879f9","#67e8f9",
];

/* ─── Main Component ─── */
export default function ShoeScatterChart({ shoes = [], isMobile }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);
  const sheetRef = useRef(null);

  const [metric, setMetric] = useState("edging_sensitivity");
  const [colorBy, setColorBy] = useState("level");
  const [mobileItem, setMobileItem] = useState(null);

  /* Filter state */
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
        _support: pct.support ?? 0.5,
        _comfort: pct.comfort ?? 0.5,
        _price: s.price_uvp_eur || 0,
        _level: topLevel(s),
      };
    });
  }, [shoes]);

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
    if (hiddenLevels.has(d._level)) return false;
    return true;
  }), [scored, hideKids, genderFilter, footShape, hiddenClosure, hiddenBrands, hiddenLevels]);

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

    const { xField, yField, xMin, xMax, yMin, yMax, xStep, yStep, pctAxis, xPct } = cfg;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    // Chart area frame
    drawChartArea(ctx, PAD, W, H);

    // Grid (dashed, 8%, baseline emphasis)
    drawGrid(ctx, PAD, W, H, xMin, xMax, yMin, xStep, yStep, { yMax, fn: sy });

    // Tick labels + axis labels
    const xFmt = x => (pctAxis || xPct) ? Math.round(x * 100) + "%" : x.toFixed(1);
    const yFmt = y => pctAxis ? Math.round(y * 100) + "%" : cfg.yLabel.includes("€") ? "€" + Math.round(y) : Math.round(y);
    drawTicks(ctx, PAD, W, H, isMobile, { xMin, xMax, yMin, yMax, xStep, yStep, xFmt, yFmt, xLabel: cfg.xLabel, yLabel: cfg.yLabel, sxFn: sx, syFn: sy });

    // Data count badge
    drawCountBadge(ctx, PAD, W, filtered.length, "shoes");

    // Crosshair for hovered dot
    const hovered = hovRef.current;
    if (hovered && hovered[xField] != null && hovered[yField] != null) {
      const hpx = sx(Math.max(xMin, Math.min(xMax, hovered[xField])));
      const hpy = sy(Math.max(yMin, Math.min(yMax, hovered[yField])));
      drawCrosshair(ctx, hpx, hpy, PAD, W, H, xFmt(hovered[xField]), yFmt(hovered[yField]));
    }

    // Dots with glow + jitter
    const r = isMobile ? 5 : 4;
    const pixelPts = [];
    filtered.forEach((d, i) => {
      const xv = d[xField], yv = d[yField];
      if (xv == null || yv == null) return;
      if (d === hovered) return; // draw last
      const j = jitter(i);
      const px = sx(Math.max(xMin, Math.min(xMax, xv))) + j.dx;
      const py = sy(Math.max(yMin, Math.min(yMax, yv))) + j.dy;
      pixelPts.push({ px, py });
      drawDot(ctx, px, py, r, getColor(d), false);
    });

    // Cluster badges
    drawClusterBadges(ctx, pixelPts);

    // Hovered dot on top
    if (hovered && hovered[xField] != null && hovered[yField] != null) {
      const hpx = sx(Math.max(xMin, Math.min(xMax, hovered[xField])));
      const hpy = sy(Math.max(yMin, Math.min(yMax, hovered[yField])));
      drawDot(ctx, hpx, hpy, r, getColor(hovered), true);
    }
  }, [metric, cfg, isMobile, getColor, filtered]);

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
  }, [isMobile, cfg, filtered]);

  const pct = v => v != null ? Math.round(v * 100) + "%" : "–";

  /* Desktop tooltip */
  const showTip = useCallback((d, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.innerHTML = buildTipHTML({
      name: `${d.brand} ${d.model}`,
      color: getColor(d),
      stats: [
        { label: "Edging", value: pct(d._edging) },
        { label: "Sensitivity", value: pct(d._sensitivity) },
        { label: "Comfort", value: pct(d._comfort) },
        { label: "Support", value: pct(d._support) },
      ],
      details: `${d.closure} · ${d.downturn} · ${d.feel} feel${d.price_uvp_eur ? " · €" + d.price_uvp_eur : ""}${d.vegan ? " · 🌱" : ""}`,
      link: `/shoe/${d.slug}`,
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
    if (isMobile) return; // touch handled separately
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
    if (d) {
      hovRef.current = d; draw();
      setMobileItem(d);
    } else {
      hovRef.current = null; draw();
      setMobileItem(null);
    }
  }, [isMobile, findClosest, draw]);

  const closeMobileSheet = useCallback(() => {
    setMobileItem(null);
    hovRef.current = null;
    draw();
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

  /* Close mobile sheet on outside tap (not on canvas or sheet) */
  useEffect(() => {
    if (!isMobile) return;
    const onTouch = (e) => {
      if (!mobileItem) return;
      if (canvasRef.current?.contains(e.target)) return; // canvas handles its own
      if (sheetRef.current?.contains(e.target)) return;  // tapping sheet itself
      closeMobileSheet();
    };
    document.addEventListener("touchstart", onTouch, { passive: true });
    return () => document.removeEventListener("touchstart", onTouch);
  }, [isMobile, mobileItem, closeMobileSheet]);

  /* Navigate from tooltip link */
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
    <ChartContainer title={cfg.label} subtitle={cfg.sub} isMobile={isMobile}>
      {/* Metric buttons */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "10px", flexWrap: "wrap" }}>
        {metricButtons.map(m => (
          <button key={m.key} onClick={() => { setMetric(m.key); pinnedRef.current = null; hovRef.current = null; hideTip(); setMobileItem(null); }}
            style={btnStyle(metric === m.key, m.color)}>
            {isMobile ? m.short : m.label}
          </button>
        ))}
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
      </div>

      {/* Color-by toggle + count */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: T.muted }}>Color by:</span>
        {[["level", "Level"], ["closure", "Closure"], ["brand", "Brand"]].map(([k, l]) => (
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
        <BottomSheet item={mobileItem} onClose={closeMobileSheet} sheetRef={sheetRef}
          onNavigate={mobileItem ? () => navigate(`/shoe/${mobileItem.slug}`) : null}>
          {mobileItem && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: getColor(mobileItem), flexShrink: 0 }} />
                <b style={{ color: T.text, fontSize: "13px" }}>{mobileItem.brand} {mobileItem.model}</b>
                <span style={{ fontSize: "10px", color: T.muted, marginLeft: "auto", flexShrink: 0 }}>
                  {mobileItem.closure} · {mobileItem.feel}{mobileItem.price_uvp_eur ? ` · €${mobileItem.price_uvp_eur}` : ""}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "2px 8px" }}>
                {[["Edging", mobileItem._edging], ["Sensitivity", mobileItem._sensitivity], ["Comfort", mobileItem._comfort], ["Support", mobileItem._support]].map(([lbl, val]) => (
                  <div key={lbl} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "9px", color: T.muted }}>{lbl}</div>
                    <div style={{ fontSize: "13px", fontWeight: 600 }}>{pct(val)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </BottomSheet>
      )}

      {/* Legends */}
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

      <div style={{ marginTop: "6px", textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          {isMobile ? "Tap a dot for specs · Tap legend to filter" : "Click a dot for specs & detail link · Click legend to filter"}
        </span>
        <a href="/methodology" style={{ fontSize: "10px", color: T.accent, textDecoration: "none", fontWeight: 600 }}>How we score →</a>
      </div>
    </ChartContainer>
  );
}
