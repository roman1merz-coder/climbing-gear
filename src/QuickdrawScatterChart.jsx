import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import { ChartContainer, Pill, LegendRow, BottomSheet, buildTipHTML, positionTip, TIP_STYLE, getEventCoords, toggleHidden, chartPad, chartH, drawChartArea, drawGrid, drawTicks, drawCountBadge, drawDot, jitter, drawClusterBadges, drawCrosshair, hex2rgb, drawLoessTrend } from "./ChartShared.jsx";

/* ─── Quickdraw type colors ─── */
const TYPE_COLORS = {
  sport: "#E8734A", alpine: "#3b82f6", trad: "#10b981",
};
const TYPE_LABELS = {
  sport: "Sport", alpine: "Alpine", trad: "Trad",
};

/* ─── Gate style colors (wire/solid/mixed) ─── */
const GATE_COLORS = {
  wire: "#60a5fa", solid: "#E8734A", mixed: "#a78bfa",
};
const GATE_LABELS = {
  wire: "Wire Gate", solid: "Solid Gate", mixed: "Mixed",
};

/* Brand palette */
const BRAND_PAL = [
  "#63b3ed","#ed64a6","#48bb78","#ecc94b","#ed8936","#9f7aea","#38b2ac","#fc8181",
  "#f6ad55","#68d391","#d53f8c","#4fd1c5","#b794f4","#90cdf4","#feb2b2","#fbd38d",
  "#81e6d9","#c4b5fd","#fca5a5","#bef264","#e879f9","#67e8f9",
];

/* ─── Data ─── */
const ALL_QUICKDRAWS = (function() {
  if (typeof QUICKDRAW_SEED === 'undefined') return [];
  return QUICKDRAW_SEED.filter(d => d.weight_g && d.price_uvp_eur)
    .map(d => {
      const gateStyle = (d.upper_gate_type || "").includes("wire") && (d.lower_gate_type || "").includes("wire") ? "wire"
                      : (d.upper_gate_type || "").includes("solid") && (d.lower_gate_type || "").includes("solid") ? "solid"
                      : "mixed";
      return {
        brand: d.brand,
        model: d.model,
        slug: d.slug,
        weight: d.weight_g,
        price: d.price_uvp_eur,
        type: d.quickdraw_type || "sport",
        strengthOpen: d.strength_open_kn,
        gateStyle,
        slingType: d.sling_type,
        hotForged: d.hot_forged,
      };
    });
})();

/* ─── Derive gate style helper ─── */
function getGateStyle(upperGate, lowerGate) {
  const upperWire = (upperGate || "").includes("wire");
  const lowerWire = (lowerGate || "").includes("wire");
  return (upperWire && lowerWire) ? "wire" : (!upperWire && !lowerWire) ? "solid" : "mixed";
}

/* ─── Main Component ─── */
export default function QuickdrawScatterChart({ isMobile, quickdraws = [] }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);
  const [mobileItem, setMobileItem] = useState(null);

  const [metric, setMetric] = useState("weight_price");
  const [colorBy, setColorBy] = useState("type");

  /* Filter state */
  const [enabledTypes, setEnabledTypes] = useState(new Set(["sport", "alpine", "trad"]));
  const [hiddenBrands, setHiddenBrands] = useState(new Set());

  const toggleType = (t) => setEnabledTypes(prev => {
    const next = new Set(prev);
    next.has(t) ? next.delete(t) : next.add(t);
    return next;
  });

  /* Use passed quickdraws or fallback to seed */
  const DATA = useMemo(() => {
    if (quickdraws && quickdraws.length > 0) {
      return quickdraws.filter(d => d.weight_g && d.price_uvp_eur)
        .map(d => {
          const gateStyle = getGateStyle(d.upper_gate_type, d.lower_gate_type);
          return {
            brand: d.brand,
            model: d.model,
            slug: d.slug,
            weight: d.weight_g,
            price: d.price_uvp_eur,
            type: d.quickdraw_type || "sport",
            strengthOpen: d.strength_open_kn,
            gateStyle,
            slingType: d.sling_type,
            hotForged: d.hot_forged,
          };
        });
    }
    return ALL_QUICKDRAWS;
  }, [quickdraws]);

  /* Brand list & colors */
  const BRAND_LIST = useMemo(() => [...new Set(DATA.map(d => d.brand))].sort(), [DATA]);
  const BRAND_COLORS = useMemo(() => Object.fromEntries(BRAND_LIST.map((b, i) => [b, BRAND_PAL[i % BRAND_PAL.length]])), [BRAND_LIST]);

  /* Apply filters */
  const filtered = useMemo(() => DATA.filter(d => {
    if (!enabledTypes.has(d.type)) return false;
    if (hiddenBrands.has(d.brand)) return false;
    return true;
  }), [DATA, enabledTypes, hiddenBrands]);

  /* Color function */
  const getColor = useCallback((d) => {
    if (colorBy === "type") return TYPE_COLORS[d.type] || "#94a3b8";
    if (colorBy === "gate") return GATE_COLORS[d.gateStyle] || "#94a3b8";
    if (colorBy === "brand") return BRAND_COLORS[d.brand] || "#94a3b8";
    return "#94a3b8";
  }, [colorBy, BRAND_COLORS]);

  /* Axis config per metric */
  const axisBounds = useMemo(() => {
    if (!filtered.length) {
      if (metric === "weight_price") return { xMin: 10, xMax: 35, yMin: 40, yMax: 125 };
      if (metric === "strength_weight") return { xMin: 40, xMax: 125, yMin: 6, yMax: 12 };
      if (metric === "value_strength") return { xMin: 10, xMax: 35, yMin: 60, yMax: 240 };
    }

    if (metric === "weight_price") {
      const prices = filtered.map(d => d.price);
      const weights = filtered.map(d => d.weight);
      return {
        xMin: Math.floor(Math.min(...prices) / 5) * 5 - 5,
        xMax: Math.ceil(Math.max(...prices) / 5) * 5 + 5,
        yMin: Math.floor(Math.min(...weights) / 10) * 10 - 10,
        yMax: Math.ceil(Math.max(...weights) / 10) * 10 + 10,
      };
    }

    if (metric === "strength_weight") {
      const weights = filtered.map(d => d.weight);
      const strengths = filtered.map(d => d.strengthOpen);
      return {
        xMin: Math.floor(Math.min(...weights) / 10) * 10 - 10,
        xMax: Math.ceil(Math.max(...weights) / 10) * 10 + 10,
        yMin: Math.floor(Math.min(...strengths) / 1) * 1 - 1,
        yMax: Math.ceil(Math.max(...strengths) / 1) * 1 + 1,
      };
    }

    if (metric === "value_strength") {
      const prices = filtered.map(d => d.price);
      const ratios = filtered.map(d => (d.strengthOpen / d.weight) * 1000);
      return {
        xMin: Math.floor(Math.min(...prices) / 5) * 5 - 5,
        xMax: Math.ceil(Math.max(...prices) / 5) * 5 + 5,
        yMin: Math.floor(Math.min(...ratios) / 20) * 20 - 20,
        yMax: Math.ceil(Math.max(...ratios) / 20) * 20 + 20,
      };
    }
  }, [filtered, metric]);

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

    const { xMin, xMax, yMin, yMax } = axisBounds;
    const sx = x => PAD.l + (x - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b);

    // Chart area frame
    drawChartArea(ctx, PAD, W, H);

    // Grid
    const xStep = metric === "weight_price" || metric === "value_strength" ? 5 : 10;
    const yStep = metric === "strength_weight" ? 1 : (metric === "value_strength" ? 20 : 10);
    const firstX = Math.ceil(xMin / xStep) * xStep;
    const firstY = Math.ceil(yMin / yStep) * yStep;
    drawGrid(ctx, PAD, W, H, xMin, xMax, yMin, xStep, yStep, { yMax, fn: sy });

    // Ticks + axis labels
    let xFmt, yFmt, xLabel, yLabel;
    if (metric === "weight_price") {
      xFmt = x => "€" + x;
      yFmt = y => y + "g";
      xLabel = "Price (€)";
      yLabel = "Weight (g)";
    } else if (metric === "strength_weight") {
      xFmt = x => x + "g";
      yFmt = y => y + "kN";
      xLabel = "Weight (g)";
      yLabel = "Open Gate (kN)";
    } else if (metric === "value_strength") {
      xFmt = x => "€" + x;
      yFmt = y => y + "kN/kg";
      xLabel = "Price (€)";
      yLabel = "Strength / Weight (kN/kg)";
    }

    drawTicks(ctx, PAD, W, H, isMobile, { xMin: firstX, xMax, yMin: firstY, yMax, xStep, yStep, xFmt, yFmt, xLabel, yLabel, sxFn: sx, syFn: sy });

    // Data count badge
    drawCountBadge(ctx, PAD, W, filtered.length, "quickdraws");

    // LOESS trend curve
    let xField, yField;
    if (metric === "weight_price") {
      xField = "price";
      yField = "weight";
    } else if (metric === "strength_weight") {
      xField = "weight";
      yField = "strengthOpen";
    } else if (metric === "value_strength") {
      xField = "price";
      yField = d => (d.strengthOpen / d.weight) * 1000;
    }

    if (metric === "value_strength") {
      const enriched = DATA.map(d => ({ ...d, valueRatio: (d.strengthOpen / d.weight) * 1000 }));
      drawLoessTrend(ctx, sx, sy, enriched, "price", "valueRatio", xMin, xMax, yMin, yMax, { color: "#c8cdd8", label: "Trend", bandwidth: 0.4 });
    } else {
      drawLoessTrend(ctx, sx, sy, DATA, xField, yField, xMin, xMax, yMin, yMax, { color: "#c8cdd8", label: "Trend", bandwidth: 0.4 });
    }

    // Crosshair for hovered dot
    const hovered = hovRef.current;
    if (hovered && filtered.includes(hovered)) {
      let xVal, yVal, xStr, yStr;
      if (metric === "weight_price") {
        xVal = hovered.price;
        yVal = hovered.weight;
        xStr = "€" + hovered.price.toFixed(0);
        yStr = hovered.weight + "g";
      } else if (metric === "strength_weight") {
        xVal = hovered.weight;
        yVal = hovered.strengthOpen;
        xStr = hovered.weight + "g";
        yStr = hovered.strengthOpen + "kN";
      } else if (metric === "value_strength") {
        xVal = hovered.price;
        yVal = (hovered.strengthOpen / hovered.weight) * 1000;
        xStr = "€" + hovered.price.toFixed(0);
        yStr = yVal.toFixed(0) + "kN/kg";
      }
      const hpx = sx(xVal), hpy = sy(yVal);
      drawCrosshair(ctx, hpx, hpy, PAD, W, H, xStr, yStr);
    }

    // Dots with glow + jitter
    const dotR = isMobile ? 6 : 5;
    const pixelPts = [];
    filtered.forEach((d, i) => {
      if (d === hovered) return;
      const j = jitter(i);
      let px, py;
      if (metric === "weight_price") {
        px = sx(d.price) + j.dx;
        py = sy(d.weight) + j.dy;
      } else if (metric === "strength_weight") {
        px = sx(d.weight) + j.dx;
        py = sy(d.strengthOpen) + j.dy;
      } else if (metric === "value_strength") {
        px = sx(d.price) + j.dx;
        py = sy((d.strengthOpen / d.weight) * 1000) + j.dy;
      }
      pixelPts.push({ px, py });
      drawDot(ctx, px, py, dotR, getColor(d), false);
    });

    // Cluster badges
    drawClusterBadges(ctx, pixelPts);

    // Hovered dot on top
    if (hovered && filtered.includes(hovered)) {
      let px, py;
      if (metric === "weight_price") {
        px = sx(hovered.price);
        py = sy(hovered.weight);
      } else if (metric === "strength_weight") {
        px = sx(hovered.weight);
        py = sy(hovered.strengthOpen);
      } else if (metric === "value_strength") {
        px = sx(hovered.price);
        py = sy((hovered.strengthOpen / hovered.weight) * 1000);
      }
      drawDot(ctx, px, py, dotR, getColor(hovered), true);
    }
  }, [isMobile, filtered, axisBounds, getColor, metric, DATA]);

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
    const { xMin, xMax, yMin, yMax } = axisBounds;
    const sx = x => P.l + (x - xMin) / (xMax - xMin) * (W - P.l - P.r);
    const sy = y => H - P.b - (y - yMin) / (yMax - yMin) * (H - P.t - P.b);

    let closest = null, best = Infinity;
    const threshold = isMobile ? 30 : 20;

    filtered.forEach(d => {
      let dx, dy;
      if (metric === "weight_price") {
        dx = sx(d.price) - mx;
        dy = sy(d.weight) - my;
      } else if (metric === "strength_weight") {
        dx = sx(d.weight) - mx;
        dy = sy(d.strengthOpen) - my;
      } else if (metric === "value_strength") {
        dx = sx(d.price) - mx;
        dy = sy((d.strengthOpen / d.weight) * 1000) - my;
      }
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < threshold && dist < best) { closest = d; best = dist; }
    });
    return closest;
  }, [isMobile, filtered, axisBounds, metric]);

  /* Desktop tooltip */
  const showTip = useCallback((d, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    const typeLabel = TYPE_LABELS[d.type] || d.type;
    const gateLabel = GATE_LABELS[d.gateStyle] || d.gateStyle;
    const details = `${typeLabel} · ${gateLabel}${d.slingType ? " · " + d.slingType : ""}${d.hotForged ? " · Hot forged" : ""}`;
    const stats = [
      { label: "Weight", value: d.weight + " g" },
      { label: "Price", value: "€" + d.price.toFixed(2) },
      { label: "Open Gate", value: d.strengthOpen + " kN" },
    ];

    tip.innerHTML = buildTipHTML({
      name: `${d.brand} ${d.model}`,
      color: getColor(d),
      stats,
      details,
      link: `/quickdraw/${d.slug}`,
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
      if (a && a.getAttribute("href")?.startsWith("/quickdraw/")) { e.preventDefault(); navigate(a.getAttribute("href")); }
    };
    tip.addEventListener("click", onClick);
    return () => tip.removeEventListener("click", onClick);
  }, [navigate]);

  /* ─── Styles ─── */
  const filterBtn = (active) => ({
    padding: "3px 8px", fontSize: "10px", fontWeight: 600, borderRadius: "4px", border: "none", cursor: "pointer",
    background: active ? "rgba(255,255,255,.1)" : "transparent", color: active ? T.text : T.muted,
  });

  const metricBtn = (active) => ({
    padding: "4px 10px", fontSize: "11px", fontWeight: 600, borderRadius: "5px", border: "none", cursor: "pointer",
    background: active ? "rgba(255,255,255,.1)" : "transparent", color: active ? T.text : T.muted,
  });

  const TYPE_LIST = ["sport", "alpine", "trad"];
  const GATE_LIST = ["wire", "solid", "mixed"];

  return (
    <ChartContainer title="Quickdraw Comparison" subtitle={`${filtered.length} quickdraws`} isMobile={isMobile}>
      {/* Metric selector */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", color: T.muted }}>Metric:</span>
        {[["weight_price", "Weight vs Price"], ["strength_weight", "Strength vs Weight"], ["value_strength", "Value vs Strength"]].map(([k, l]) => (
          <button key={k} onClick={() => setMetric(k)} style={metricBtn(metric === k)}>
            {l}
          </button>
        ))}
      </div>

      {/* Type filter + reset */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
        {(hiddenBrands.size > 0 || enabledTypes.size !== 3) && (
          <button onClick={() => { setEnabledTypes(new Set(["sport", "alpine", "trad"])); setHiddenBrands(new Set()); }}
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
        {[["type", "Type"], ["gate", "Gate Style"], ["brand", "Brand"]].map(([k, l]) => (
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
          onNavigate={mobileItem ? () => navigate(`/quickdraw/${mobileItem.slug}`) : null}>
          {mobileItem && (() => {
            const d = mobileItem;
            const typeLabel = TYPE_LABELS[d.type] || d.type;
            const gateLabel = GATE_LABELS[d.gateStyle] || d.gateStyle;
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: getColor(d), flexShrink: 0 }} />
                  <b style={{ color: T.text, fontSize: "13px" }}>{d.brand} {d.model}</b>
                  <span style={{ fontSize: "10px", color: T.muted, marginLeft: "auto", flexShrink: 0 }}>
                    {typeLabel} · {gateLabel}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2px 8px" }}>
                  <div style={{ textAlign: "center" }}><div style={{ fontSize: "9px", color: T.muted }}>Weight</div><div style={{ fontSize: "13px", fontWeight: 600 }}>{d.weight} g</div></div>
                  <div style={{ textAlign: "center" }}><div style={{ fontSize: "9px", color: T.muted }}>Price</div><div style={{ fontSize: "13px", fontWeight: 600 }}>€{d.price.toFixed(2)}</div></div>
                  <div style={{ textAlign: "center" }}><div style={{ fontSize: "9px", color: T.muted }}>Open Gate</div><div style={{ fontSize: "13px", fontWeight: 600 }}>{d.strengthOpen} kN</div></div>
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
      )}
      {colorBy === "gate" && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px", justifyContent: "center" }}>
          {GATE_LIST.map(k => (
            <Pill key={k} color={GATE_COLORS[k] || "#94a3b8"} label={GATE_LABELS[k] || k}
              hidden={false} onClick={() => {}} />
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

      <div style={{ marginTop: "6px", textAlign: "center" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          {isMobile ? "Tap a dot for specs · Tap legend to filter" : "Click a dot for specs & detail link · Click legend to filter"}
        </span>
      </div>
    </ChartContainer>
  );
}
