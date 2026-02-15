import { useState } from "react";
import { T } from "./tokens.js";

/* ─── Chart Container ─── */
export function ChartContainer({ title, subtitle, children, style, isMobile }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: isMobile ? "14px 10px 16px" : "24px", overflow: "hidden", minWidth: 0, maxWidth: "100%", position: "relative", ...style }}>
      {title && <div style={{ fontSize: "15px", fontWeight: 700, color: T.text, marginBottom: subtitle ? "4px" : "16px" }}>{title}</div>}
      {subtitle && <div style={{ fontSize: "12px", color: T.muted, marginBottom: "16px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}

/* ─── Pill ─── */
export function Pill({ color, label, hidden, onClick, shape }) {
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

/* ─── Legend Row with hide-all/show-all and collapsible ─── */
export function LegendRow({ items, hiddenSet, onToggle, onClearAll, threshold = 5, initialShow = 8 }) {
  const [expanded, setExpanded] = useState(false);
  const showClearAll = items.length > threshold;
  const showCollapse = items.length > initialShow;
  const visible = showCollapse && !expanded ? items.slice(0, initialShow) : items;
  const remaining = items.length - initialShow;
  const allHidden = hiddenSet.size === items.length;

  return (
    <div style={{ marginTop: "10px" }}>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
        {showClearAll && (
          <button onClick={onClearAll} style={{
            fontSize: "9px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px",
            border: `1px solid ${allHidden ? T.accent : T.border}`, background: allHidden ? T.accentSoft : "transparent",
            color: allHidden ? T.accent : T.muted, cursor: "pointer", letterSpacing: "0.3px",
            height: "22px", lineHeight: "22px", display: "flex", alignItems: "center",
          }}>
            {allHidden ? "Show all" : "Hide all"}
          </button>
        )}
        {visible.map(item => (
          <Pill key={item.key} color={item.color} label={item.label}
            hidden={hiddenSet.has(item.key)} onClick={() => onToggle(item.key)}
            shape={item.shape} />
        ))}
        {showCollapse && !expanded && remaining > 0 && (
          <span onClick={() => setExpanded(true)} style={{
            fontSize: "10px", color: T.accent, cursor: "pointer", padding: "2px 8px",
            borderRadius: "10px", border: `1px dashed ${T.border}`, userSelect: "none",
            display: "flex", alignItems: "center",
          }}>+{remaining} more</span>
        )}
        {showCollapse && expanded && (
          <span onClick={() => setExpanded(false)} style={{
            fontSize: "10px", color: T.muted, cursor: "pointer", padding: "2px 8px",
            borderRadius: "10px", border: `1px dashed ${T.border}`, userSelect: "none",
            display: "flex", alignItems: "center",
          }}>Show less</span>
        )}
      </div>
    </div>
  );
}

/* ─── Mobile Bottom Sheet ─── */
export function BottomSheet({ item, onClose, onNavigate, children, sheetRef }) {
  if (!item) return null;
  return (
    <div ref={sheetRef} onClick={(e) => e.stopPropagation()} style={{
      marginTop: "8px", background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: "10px", padding: "10px 12px",
      animation: "sheetFade .2s ease-out",
      maxWidth: "100%", boxSizing: "border-box",
    }}>
      {children}
      {onNavigate && (
        <button onClick={onNavigate} style={{
          display: "block", width: "100%", marginTop: "8px", padding: "6px", borderRadius: "6px",
          background: T.accentSoft, color: T.accent, border: "none", cursor: "pointer",
          fontSize: "11px", fontWeight: 600, textAlign: "center",
        }}>View full specs →</button>
      )}
      <style>{`@keyframes sheetFade { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </div>
  );
}

/* ─── Structured desktop tooltip HTML builder ─── */
export function buildTipHTML({ name, color, stats, details, link, pinned }) {
  const statsHtml = stats.map(s => (
    `<div style="min-width:0"><div style="font-size:10px;color:#717889;margin-bottom:1px">${s.label}</div><div style="font-size:13px;font-weight:600;color:${s.color || T.text}">${s.value}</div></div>`
  )).join("");
  const detailHtml = details ? `<div style="color:#64748b;font-size:11px;margin-top:4px">${details}</div>` : "";
  const linkHtml = pinned && link ? `<a href="${link}" style="display:inline-block;margin-top:8px;padding:4px 12px;background:${T.accentSoft};color:${T.accent};border-radius:6px;font-size:11px;font-weight:600;text-decoration:none;width:100%;text-align:center;box-sizing:border-box">View full specs →</a>` : "";
  return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span><b style="color:${T.text};font-size:13px;line-height:1.2">${name}</b></div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:3px 14px">${statsHtml}</div>${detailHtml}${linkHtml}`;
}

/* ─── Position desktop tooltip safely ─── */
export function positionTip(tip, x, y, pinned) {
  tip.style.opacity = "1";
  tip.style.pointerEvents = pinned ? "auto" : "none";
  tip.style.borderColor = pinned ? T.accent : "rgba(99,179,237,.35)";
  const tipW = 300, tipH = 200;
  let tx = x + 14, ty = y - 10;
  if (tx + tipW > window.innerWidth - 8) tx = x - tipW - 14;
  if (tx < 8) tx = 8;
  if (ty < 8) ty = 8;
  if (ty + tipH > window.innerHeight - 8) ty = window.innerHeight - tipH - 8;
  tip.style.left = tx + "px";
  tip.style.top = ty + "px";
}

/* ─── Desktop tooltip style ─── */
export const TIP_STYLE = {
  position: "fixed", pointerEvents: "none",
  background: "rgba(15,17,25,.97)", border: "1px solid rgba(99,179,237,.35)",
  borderRadius: "10px", padding: "12px 14px", fontSize: "12px", lineHeight: 1.5, color: T.text,
  boxShadow: "0 8px 32px rgba(0,0,0,.6)", zIndex: 999, opacity: 0, transition: "opacity .15s",
  maxWidth: "300px",
};

/* ─── Touch-aware event coordinate extractor ─── */
export function getEventCoords(e) {
  if (e.touches && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  if (e.changedTouches && e.changedTouches.length > 0) {
    return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
  }
  return { clientX: e.clientX, clientY: e.clientY };
}

/* ─── toggleHidden helper ─── */
export const toggleHidden = (setter, key) => setter(prev => {
  const next = new Set(prev);
  next.has(key) ? next.delete(key) : next.add(key);
  return next;
});

/* ═══════════════════════════════════════════════════════
   Canvas drawing helpers — shared across all 4 charts
   ═══════════════════════════════════════════════════════ */

const FONT = "'Instrument Sans', system-ui";

/* ─── roundRect path (no beginPath — caller decides fill/stroke) ─── */
export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ─── Responsive padding ─── */
export function chartPad(isMobile, overrides) {
  const base = isMobile
    ? { t: 34, r: 16, b: 50, l: 46 }   // top: room for y-label; left: no rotated text
    : { t: 22, r: 22, b: 48, l: 56 };
  return { ...base, ...overrides };
}

/* ─── Chart height ─── */
export function chartH(isMobile) { return isMobile ? 360 : 520; }

/* ─── Draw inset chart area background + axis border lines ─── */
export function drawChartArea(ctx, P, W, H) {
  const grad = ctx.createLinearGradient(P.l, P.t, P.l, H - P.b);
  grad.addColorStop(0, "rgba(0,0,0,.25)");
  grad.addColorStop(1, "rgba(0,0,0,.15)");
  ctx.fillStyle = grad;
  rrect(ctx, P.l, P.t, W - P.l - P.r, H - P.t - P.b, 4); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(P.l, P.t); ctx.lineTo(P.l, H - P.b); ctx.lineTo(W - P.r, H - P.b);
  ctx.stroke();
}

/* ─── Draw grid (dashed, 8 %, baseline emphasis) ─── */
export function drawGrid(ctx, P, W, H, xMin, xMax, yMin, xStep, yStep, ySy) {
  ctx.lineWidth = 1;
  for (let x = xMin + xStep; x <= xMax + 0.001; x += xStep) {
    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(P.l + (x - xMin) / (xMax - xMin) * (W - P.l - P.r), P.t);
    ctx.lineTo(P.l + (x - xMin) / (xMax - xMin) * (W - P.l - P.r), H - P.b); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Horizontal grid — emphasise baseline (yMin)
  const yLines = [];
  for (let y = yMin; y <= ySy.yMax + 0.001; y += yStep) yLines.push(y);
  yLines.forEach(y => {
    const isBase = Math.abs(y - yMin) < 0.001;
    ctx.strokeStyle = isBase ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.08)";
    ctx.lineWidth = isBase ? 1.5 : 1;
    if (!isBase) ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(P.l, ySy.fn(y)); ctx.lineTo(W - P.r, ySy.fn(y)); ctx.stroke();
    ctx.setLineDash([]);
  });
}

/* ─── Tick labels + axis labels ─── */
export function drawTicks(ctx, P, W, H, isMobile, {
  xMin, xMax, yMin, yMax, xStep, yStep,
  xFmt, yFmt, xLabel, yLabel, sxFn, syFn,
}) {
  const tickFont = isMobile ? `500 12px ${FONT}` : `500 11px ${FONT}`;
  const axisFont = isMobile ? `600 12px ${FONT}` : `600 12px ${FONT}`;

  // X ticks
  ctx.fillStyle = "#5a6478"; ctx.font = tickFont; ctx.textAlign = "center";
  for (let x = xMin; x <= xMax + 0.001; x += xStep) {
    ctx.fillText(xFmt(x), sxFn(x), H - P.b + (isMobile ? 18 : 16));
  }
  // Y ticks
  ctx.textAlign = "right";
  for (let y = yMin; y <= yMax + 0.001; y += yStep) {
    ctx.fillText(yFmt(y), P.l - 7, syFn(y) + 4);
  }
  // Axis labels
  ctx.fillStyle = "#6b7a8e"; ctx.font = axisFont; ctx.textAlign = "center";
  ctx.fillText(xLabel, W / 2, H - 6);
  // Y label: horizontal on top for mobile, rotated for desktop
  if (isMobile) {
    ctx.textAlign = "left";
    ctx.fillText(yLabel, P.l, P.t - 10);
  } else {
    ctx.save(); ctx.translate(13, H / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0); ctx.restore();
  }
}

/* ─── Data count badge (top-right inside chart area) ─── */
export function drawCountBadge(ctx, P, W, count, unit) {
  ctx.font = `600 10px ${FONT}`;
  const txt = `${count} ${unit}`;
  const tw = ctx.measureText(txt).width + 14;
  ctx.fillStyle = "rgba(232,115,74,.12)";
  rrect(ctx, W - P.r - tw - 6, P.t + 6, tw, 18, 9); ctx.fill();
  ctx.fillStyle = T.accent; ctx.textAlign = "center";
  ctx.fillText(txt, W - P.r - tw / 2 - 6, P.t + 18);
}

/* ─── Parse hex → [r, g, b] ─── */
export function hex2rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/* ─── Draw a single dot with glow ─── */
export function drawDot(ctx, px, py, r, hex, isHovered) {
  const [cr, cg, cb] = hex2rgb(hex);
  if (isHovered) {
    // glow
    ctx.shadowColor = `rgba(${cr},${cg},${cb},0.6)`; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},1)`; ctx.fill();
    ctx.shadowBlur = 0;
    // white ring
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, r + 4, 0, Math.PI * 2); ctx.stroke();
    // outer subtle ring
    ctx.strokeStyle = "rgba(255,255,255,.15)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py, r + 8, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.shadowColor = `rgba(${cr},${cg},${cb},0.35)`; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.85)`; ctx.fill();
    ctx.shadowBlur = 0;
  }
}

/* ─── Deterministic jitter offset ─── */
export function jitter(index) {
  const angle = ((index * 2654435761) % 360) * Math.PI / 180;
  return { dx: Math.cos(angle) * 2.5, dy: Math.sin(angle) * 2.5 };
}

/* ─── Draw cluster count badges ─── */
export function drawClusterBadges(ctx, pts) {
  // pts: [{px, py}]
  const visited = new Set();
  const clusters = [];
  pts.forEach((p, i) => {
    if (visited.has(i)) return;
    let cnt = 1, sx = p.px, sy = p.py;
    pts.forEach((q, j) => {
      if (i === j || visited.has(j)) return;
      if (Math.abs(p.px - q.px) < 8 && Math.abs(p.py - q.py) < 8) {
        cnt++; visited.add(j); sx += q.px; sy += q.py;
      }
    });
    if (cnt >= 3) clusters.push({ px: sx / cnt, py: sy / cnt, cnt });
  });
  clusters.forEach(c => {
    ctx.font = `700 9px ${FONT}`;
    const t = String(c.cnt);
    const tw = ctx.measureText(t).width + 8;
    ctx.fillStyle = "rgba(15,17,25,.85)";
    rrect(ctx, c.px - tw / 2, c.py - 20, tw, 14, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 0.5;
    rrect(ctx, c.px - tw / 2, c.py - 20, tw, 14, 7); ctx.stroke();
    ctx.fillStyle = "#e8e9ec"; ctx.textAlign = "center";
    ctx.fillText(t, c.px, c.py - 10);
  });
}

/* ─── Linear trend line with confidence bands ─── */
export function drawLinearTrend(ctx, sx, sy, slope, intercept, std, xMin, xMax, yMin, yMax, { color = "rgba(200,205,216,1)", label = "Trend", steps = 40 } = {}) {
  const [cr, cg, cb] = hex2rgb(color.startsWith("rgba") ? "#c8cdd8" : color);
  const rgba = (a) => `rgba(${cr},${cg},${cb},${a})`;

  const xs = [];
  for (let i = 0; i <= steps; i++) xs.push(xMin + (xMax - xMin) * i / steps);
  const ys = xs.map(x => slope * x + intercept);

  // 2σ band (gradient)
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) { const px = sx(xs[i]), py = sy(Math.max(yMin, Math.min(yMax, ys[i] + 2 * std))); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(sx(xs[i]), sy(Math.max(yMin, Math.min(yMax, ys[i] - 2 * std))));
  ctx.closePath();
  const g2 = ctx.createLinearGradient(0, sy(yMax), 0, sy(yMin));
  g2.addColorStop(0, rgba(.06)); g2.addColorStop(0.5, rgba(.04)); g2.addColorStop(1, rgba(.01));
  ctx.fillStyle = g2; ctx.fill();

  // 1σ band
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) { const px = sx(xs[i]), py = sy(Math.max(yMin, Math.min(yMax, ys[i] + std))); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(sx(xs[i]), sy(Math.max(yMin, Math.min(yMax, ys[i] - std))));
  ctx.closePath(); ctx.fillStyle = rgba(.08); ctx.fill();

  // 1σ edge lines
  ctx.strokeStyle = rgba(.2); ctx.lineWidth = 0.8; ctx.setLineDash([3, 4]);
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) { const px = sx(xs[i]), py = sy(Math.max(yMin, Math.min(yMax, ys[i] + std))); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) { const px = sx(xs[i]), py = sy(Math.max(yMin, Math.min(yMax, ys[i] - std))); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.stroke(); ctx.setLineDash([]);

  // Main trend line
  ctx.strokeStyle = rgba(.5); ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) { const px = sx(xs[i]), py = sy(Math.max(yMin, Math.min(yMax, ys[i]))); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.stroke();

  // Inline label
  const li = Math.floor(xs.length * 0.65);
  const lx = sx(xs[li]), ly = sy(Math.min(yMax, ys[li] + std + (yMax - yMin) * 0.04));
  ctx.font = `600 10px ${FONT}`;
  const lw = ctx.measureText(label).width + 10;
  ctx.fillStyle = "rgba(15,17,25,.8)";
  rrect(ctx, lx - lw / 2, ly - 8, lw, 16, 3); ctx.fill();
  ctx.fillStyle = rgba(.8); ctx.textAlign = "center";
  ctx.fillText(label, lx, ly + 3);
}

/* ─── Crosshair guides for hovered dot ─── */
export function drawCrosshair(ctx, px, py, P, W, H, xStr, yStr) {
  ctx.strokeStyle = "rgba(232,115,74,.25)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(px, py + 8); ctx.lineTo(px, H - P.b); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(P.l, py); ctx.lineTo(px - 8, py); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `600 10px ${FONT}`;
  // X value pill
  const xTw = ctx.measureText(xStr).width + 10;
  ctx.fillStyle = "rgba(15,17,25,.85)";
  rrect(ctx, px - xTw / 2, H - P.b + 1, xTw, 16, 3); ctx.fill();
  ctx.strokeStyle = T.accent; ctx.lineWidth = 1;
  rrect(ctx, px - xTw / 2, H - P.b + 1, xTw, 16, 3); ctx.stroke();
  ctx.fillStyle = T.accent; ctx.textAlign = "center";
  ctx.fillText(xStr, px, H - P.b + 12);
  // Y value pill
  const yTw = ctx.measureText(yStr).width + 10;
  ctx.fillStyle = "rgba(15,17,25,.85)";
  rrect(ctx, P.l - yTw - 4, py - 8, yTw, 16, 3); ctx.fill();
  ctx.strokeStyle = T.accent; ctx.lineWidth = 1;
  rrect(ctx, P.l - yTw - 4, py - 8, yTw, 16, 3); ctx.stroke();
  ctx.fillStyle = T.accent; ctx.textAlign = "center";
  ctx.fillText(yStr, P.l - yTw / 2 - 4, py + 3);
}
