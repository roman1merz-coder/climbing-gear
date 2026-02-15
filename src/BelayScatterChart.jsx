import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import BELAY_SEED from "./belay_seed_data.json";
import { ChartContainer, Pill, LegendRow, BottomSheet, buildTipHTML, positionTip, TIP_STYLE, getEventCoords, toggleHidden } from "./ChartShared.jsx";

/* ─── Device type styling ─── */
const TYPE_COLORS = {
  active_assisted: "#E8734A", passive_assisted: "#60a5fa",
  tube_guide: "#34d399", tube: "#a78bfa", tubular: "#a78bfa", figure_eight: "#94a3b8",
};
const TYPE_LABELS = {
  active_assisted: "Cam (Active)", passive_assisted: "Passive Assisted",
  tube_guide: "Tube Guide", tube: "Tube", tubular: "Tube", figure_eight: "Figure 8",
};

/* Discipline colors */
const DISC_COLORS = {
  gym: "#60a5fa", sport_single: "#E8734A", sport_multi: "#ed64a6",
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

/* ─── Main Component ─── */
export default function BelayScatterChart({ isMobile }) {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const hovRef = useRef(null);
  const pinnedRef = useRef(null);
  const [mobileItem, setMobileItem] = useState(null);

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

  /* Apply filters */
  const filtered = useMemo(() => ALL_BELAYS.filter(d => {
    if (!enabledTypes.has(d.type)) return false;
    if (hiddenBrands.has(d.brand)) return false;
    return true;
  }), [enabledTypes, hiddenBrands]);

  /* Color function */
  const getColor = useCallback((d) => {
    if (colorBy === "type") return TYPE_COLORS[d.type] || "#94a3b8";
    if (colorBy === "brand") return BRAND_COLORS[d.brand] || "#94a3b8";
    const uc = d.useCases[0];
    return DISC_COLORS[uc] || "#94a3b8";
  }, [colorBy, BRAND_COLORS]);

  /* Axis config */
  const axisBounds = useMemo(() => {
    if (!filtered.length) return { wMin: 50, wMax: 500, pMin: 10, pMax: 200 };
    const ws = filtered.map(d => d.weight);
    const ps = filtered.map(d => d.price);
    return {
      wMin: Math.floor(Math.min(...ws) / 25) * 25 - 25,
      wMax: Math.ceil(Math.max(...ws) / 25) * 25 + 25,
      pMin: Math.floor(Math.min(...ps) / 10) * 10 - 10,
      pMax: Math.ceil(Math.max(...ps) / 10) * 10 + 10,
    };
  }, [filtered]);

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

    const { wMin, wMax, pMin, pMax } = axisBounds;
    const sx = x => PAD.l + (x - wMin) / (wMax - wMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - pMin) / (pMax - pMin) * (H - PAD.t - PAD.b);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    const wStep = (wMax - wMin) > 300 ? 50 : 25;
    const pStep = (pMax - pMin) > 150 ? 20 : 10;
    for (let x = Math.ceil(wMin / wStep) * wStep; x <= wMax; x += wStep) {
      ctx.beginPath(); ctx.moveTo(sx(x), PAD.t); ctx.lineTo(sx(x), H - PAD.b); ctx.stroke();
    }
    for (let y = Math.ceil(pMin / pStep) * pStep; y <= pMax; y += pStep) {
      ctx.beginPath(); ctx.moveTo(PAD.l, sy(y)); ctx.lineTo(W - PAD.r, sy(y)); ctx.stroke();
    }

    // Ticks
    ctx.fillStyle = "#4a5568"; ctx.font = "10px system-ui"; ctx.textAlign = "center";
    for (let x = Math.ceil(wMin / wStep) * wStep; x <= wMax; x += wStep) ctx.fillText(x + "g", sx(x), H - PAD.b + 14);
    ctx.textAlign = "right";
    for (let y = Math.ceil(pMin / pStep) * pStep; y <= pMax; y += pStep) ctx.fillText("€" + y, PAD.l - 6, sy(y) + 3);

    ctx.fillStyle = "#64748b"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText("Weight (g)", W / 2, H - 6);
    ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("Price (€)", 0, 0); ctx.restore();

    // Dots
    const hovered = hovRef.current;
    const dotR = isMobile ? 6 : 5;
    filtered.filter(d => d !== hovered).forEach(d => {
      const px = sx(d.weight), py = sy(d.price);
      const hex = getColor(d);
      const [cr, cg, cb] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      ctx.beginPath(); ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.7)`; ctx.fill();
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.3)`; ctx.lineWidth = 0.8; ctx.stroke();
    });
    if (hovered && filtered.includes(hovered)) {
      const px = sx(hovered.weight), py = sy(hovered.price);
      const hex = getColor(hovered);
      const [cr, cg, cb] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      ctx.beginPath(); ctx.arc(px, py, dotR + 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},1)`; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    }
  }, [isMobile, filtered, axisBounds, getColor]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { const h = () => draw(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [draw]);

  const findClosest = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { clientX, clientY } = getEventCoords(e);
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const W = rect.width, H = isMobile ? 300 : 400;
    const PAD = { t: 20, r: 20, b: 44, l: 52 };
    const { wMin, wMax, pMin, pMax } = axisBounds;
    const sx = x => PAD.l + (x - wMin) / (wMax - wMin) * (W - PAD.l - PAD.r);
    const sy = y => H - PAD.b - (y - pMin) / (pMax - pMin) * (H - PAD.t - PAD.b);
    let closest = null, best = Infinity;
    const threshold = isMobile ? 30 : 20;
    filtered.forEach(d => {
      const dx = sx(d.weight) - mx, dy = sy(d.price) - my, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < threshold && dist < best) { closest = d; best = dist; }
    });
    return closest;
  }, [isMobile, filtered, axisBounds]);

  /* Desktop tooltip */
  const showTip = useCallback((d, x, y, pinned) => {
    const tip = tipRef.current;
    if (!tip) return;
    const typeLabel = TYPE_LABELS[d.type] || d.type;
    const features = [d.antiPanic && "Anti-panic", d.guideMode && "Guide mode"].filter(Boolean).join(", ");
    const stats = [
      { label: "Weight", value: d.weight + " g" },
      { label: "Price", value: "€" + d.price.toFixed(2) },
    ];
    if (d.ropeSlots) stats.push({ label: "Rope slots", value: String(d.ropeSlots) });
    if (d.material) stats.push({ label: "Material", value: d.material });

    tip.innerHTML = buildTipHTML({
      name: `${d.brand} ${d.model}`,
      color: getColor(d),
      stats,
      details: `${typeLabel}${features ? " · " + features : ""}`,
      link: `/belay/${d.slug}`,
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
      if (a && a.getAttribute("href")?.startsWith("/belay/")) { e.preventDefault(); navigate(a.getAttribute("href")); }
    };
    tip.addEventListener("click", onClick);
    return () => tip.removeEventListener("click", onClick);
  }, [navigate]);

  /* ─── Styles ─── */
  const filterBtn = (active) => ({
    padding: "3px 8px", fontSize: "10px", fontWeight: 600, borderRadius: "4px", border: "none", cursor: "pointer",
    background: active ? "rgba(255,255,255,.1)" : "transparent", color: active ? T.text : T.muted,
  });

  const TYPE_LIST = ["active_assisted", "passive_assisted", "tube_guide", "tube", "figure_eight"];

  return (
    <ChartContainer title="Price vs Weight" subtitle={`${filtered.length} belay devices`}>
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
          onNavigate={mobileItem ? () => navigate(`/belay/${mobileItem.slug}`) : null}>
          {mobileItem && (() => {
            const d = mobileItem;
            const typeLabel = TYPE_LABELS[d.type] || d.type;
            const features = [d.antiPanic && "Anti-panic", d.guideMode && "Guide mode"].filter(Boolean).join(", ");
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: getColor(d), flexShrink: 0 }} />
                  <b style={{ color: T.text, fontSize: "14px" }}>{d.brand} {d.model}</b>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginBottom: "6px" }}>
                  <div><span style={{ fontSize: "10px", color: T.muted }}>Weight</span><div style={{ fontSize: "14px", fontWeight: 600 }}>{d.weight} g</div></div>
                  <div><span style={{ fontSize: "10px", color: T.muted }}>Price</span><div style={{ fontSize: "14px", fontWeight: 600 }}>€{d.price.toFixed(2)}</div></div>
                  <div><span style={{ fontSize: "10px", color: T.muted }}>Type</span><div style={{ fontSize: "14px", fontWeight: 600 }}>{typeLabel}</div></div>
                  {d.material && <div><span style={{ fontSize: "10px", color: T.muted }}>Material</span><div style={{ fontSize: "14px", fontWeight: 600 }}>{d.material}</div></div>}
                </div>
                {features && <div style={{ fontSize: "11px", color: "#64748b" }}>{features}</div>}
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
      {colorBy === "discipline" && (
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

      <div style={{ marginTop: "6px", textAlign: "center" }}>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          {isMobile ? "Tap a dot for specs · Tap legend to filter" : "Click a dot for specs & detail link · Click legend to filter"}
        </span>
      </div>
    </ChartContainer>
  );
}
