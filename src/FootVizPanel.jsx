import { T } from "./tokens.js";

// ═══════════════════════════════════════════════════════════════
// AVERAGE TEMPLATE SVG PATHS
// ═══════════════════════════════════════════════════════════════

// Top template: Egyptian foot (most common ~50%)
// Coordinates: x=[657..917], y=[170..774]
// Toes at top (y≈170), heel at bottom (y≈774), big toe left-center
const FOOT_TOP_OUTER = "M705.555 173.171C728.345 169.976 743.955 182.522 750.755 203.497C760.895 186.157 781.28 184.489 796.085 197.455C802.77 203.307 803.395 212.2 803.345 220.596C808.83 216.353 814.4 214.436 821.425 214.984C827.865 215.439 833.845 218.492 837.99 223.442C845.82 232.705 845.565 243.317 844.71 254.598C847.825 253.009 850.435 251.575 854.005 251.436C876.77 250.543 880.285 271.279 881.425 287.68C882.345 287.234 883.83 286.506 884.81 286.17C889.255 284.637 894.14 285.03 898.285 287.256C913.095 295.258 916.435 327.812 914.165 342.256C911.335 360.205 912.885 366.809 915.15 384.466C916.635 395.791 916.735 407.253 915.45 418.602C913.175 438.84 905.715 463.472 900.58 483.357C895.095 504.85 889.795 526.39 884.67 547.97C880.66 564.88 876.79 580.705 873.76 597.85C871.38 610.8 869.69 623.87 868.695 636.995C866.32 670.57 867.73 700.265 850.92 731.24C849.275 734.255 847.465 737.175 845.5 739.995C834.265 756.28 816.905 767.305 797.385 770.55C775.94 774.075 751.335 770.155 733.83 756.8C688.29 722.065 698.84 662.01 698.465 612.865C698.23 569.2 693.54 525.67 684.475 482.954C681.43 468.607 677.995 453.635 674.1 439.501C668.025 418.161 661.21 397.191 659.14 375.02C656.685 348.716 665.395 324.276 666.845 298.422C667.505 286.694 662.83 271.752 661.05 259.619C657.435 234.941 664.55 209.205 678.76 188.839C685.26 179.777 694.585 174.732 705.555 173.171Z";

const FOOT_TOP_TOES = [
  "M747.805 253.36C749.975 258.689 749.75 300.809 740.295 299.282C734.185 284.755 742.555 267.206 747.805 253.36Z",
  "M793.745 265.916L794.23 266.424C796.055 273.242 796 286.879 794.57 293.773L794.06 293.798C791.94 290.653 793.26 270.941 793.745 265.916Z",
  "M835.255 295.388C837.17 299.653 836.705 311.337 835.69 316.111L835.01 315.436C833.6 310.997 834.615 300.078 835.255 295.388Z",
  "M872.815 330.171C874.455 333.459 873.415 342.115 872.585 345.79C870.345 341.918 872 334.498 872.815 330.171Z",
];

// ═══════════════════════════════════════════════════════════════
// Side template: User's standard model SVG
// Coordinates: toe_x=90, heel_x=645, ground_y=730, top_y≈428
// Toes LEFT (x=90), heel RIGHT (x=645) - NO mirror needed
// This path is loaded from side_template_paths.json at build time
// and injected as SIDE_OUTLINE_PATH prop or imported.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Population averages (from anthropometric literature)
// ═══════════════════════════════════════════════════════════════
const AVG_WR = 0.383;
const AVG_AR = 0.760;
const AVG_IR = 0.235;
const AVG_HR = 0.655;

// ═══════════════════════════════════════════════════════════════
// TOP VIEW GEOMETRY
// Template bbox from the Egyptian foot path
// ═══════════════════════════════════════════════════════════════
const TOP = {
  xMin: 657, xMax: 917, yMin: 170, yMax: 774,
};
TOP.cx = (TOP.xMin + TOP.xMax) / 2;  // 787
TOP.w = TOP.xMax - TOP.xMin;          // 260
TOP.h = TOP.yMax - TOP.yMin;          // 604

// ═══════════════════════════════════════════════════════════════
// SIDE VIEW GEOMETRY
// From the user's standard model SVG (toes LEFT, heel RIGHT)
// ═══════════════════════════════════════════════════════════════
const SIDE_TOE_X = 90;
const SIDE_HEEL_X = 645;
const SIDE_LEN = SIDE_HEEL_X - SIDE_TOE_X;  // 555
const SIDE_GROUND_Y = 730;

// ═══════════════════════════════════════════════════════════════
// CONTOUR MAPPING
// ═══════════════════════════════════════════════════════════════

/**
 * Map top-view contour (normalized [0,1]) to SVG coordinates.
 * Width is scaled by wr / AVG_WR to show actual width difference.
 */
function mapTopContour(pts, wr) {
  const ws = wr / AVG_WR;
  const uw = TOP.w * ws;
  return pts.map(([nx, ny]) => [
    TOP.cx - uw / 2 + nx * uw,
    TOP.yMin + ny * TOP.h,
  ]);
}

/**
 * Map side-view contour (normalized [0,1]) to SVG coordinates.
 * Height is set by real aspect ratio anchored at ground.
 */
function mapSideContour(pts, sideAspect) {
  const realH = SIDE_LEN * sideAspect;
  const topY = SIDE_GROUND_Y - realH;
  return pts.map(([nx, ny]) => [
    SIDE_TOE_X + nx * SIDE_LEN,
    topY + ny * realH,
  ]);
}

/**
 * Catmull-Rom spline through points → SVG path "d" string.
 */
function smoothPath(pts) {
  const n = pts.length;
  if (n < 4) return "";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + " Z";
}

/**
 * Find y-coordinate where the contour is widest, within a y-range fraction.
 * Used to position W and H measurement lines on the TOP view.
 */
function findWidestY(mappedPts, yLoFrac, yHiFrac) {
  const ys = mappedPts.map(p => p[1]);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const yRange = yMax - yMin;
  const yLo = yMin + yLoFrac * yRange;
  const yHi = yMin + yHiFrac * yRange;

  let bestW = 0, bestY = (yLo + yHi) / 2;
  const band = yRange / 150;
  for (let step = 0; step < 200; step++) {
    const y = yLo + (yHi - yLo) * step / 200;
    const xsInBand = mappedPts
      .filter(p => Math.abs(p[1] - y) < band)
      .map(p => p[0]);
    if (xsInBand.length >= 2) {
      const w = Math.max(...xsInBand) - Math.min(...xsInBand);
      if (w > bestW) { bestW = w; bestY = y; }
    }
  }
  return Math.round(bestY);
}

/**
 * Find x-position where the upper contour reaches instep height.
 * Walk the upper profile and find where y crosses the target.
 */
function findInstepX(upperNorm, instepRatio, sideAspect) {
  const realH = SIDE_LEN * sideAspect;
  const topY = SIDE_GROUND_Y - realH;
  const instepTopPx = SIDE_GROUND_Y - instepRatio * SIDE_LEN;
  const targetYNorm = (instepTopPx - topY) / realH;

  for (let i = 0; i < upperNorm.length - 1; i++) {
    const [x0, y0] = upperNorm[i];
    const [x1, y1] = upperNorm[i + 1];
    if ((y0 >= targetYNorm && targetYNorm >= y1) ||
        (y0 <= targetYNorm && targetYNorm <= y1)) {
      if (Math.abs(y1 - y0) < 0.0001) continue;
      const t = (targetYNorm - y0) / (y1 - y0);
      return x0 + t * (x1 - x0);
    }
  }
  return 0.5; // fallback
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

/**
 * FootVizPanel - overlays user's measured contour on average template.
 *
 * Props:
 *   result: {
 *     width_ratio, arch_ratio, instep_ratio, heel_ratio,
 *     contour_top:  { contour_smooth: [[x,y],...] },
 *     contour_side: { contour_smooth: [[x,y],...], stats: { aspect_ratio } },
 *     side_outline_path: string  // SVG d-path for the grey template
 *   }
 *   isMobile: boolean
 */
export default function FootVizPanel({ result, isMobile }) {
  const wr = result.width_ratio || AVG_WR;
  const ar = result.arch_ratio || AVG_AR;
  const ir = result.instep_ratio || AVG_IR;
  const hr = result.heel_ratio || AVG_HR;

  // Side contour aspect ratio
  const sideAspect = result.contour_side?.stats?.aspect_ratio || 0.5561;

  // Side outline path for grey template
  const sideOutlinePath = result.side_outline_path || "";

  // Contour data
  const topSmooth = result.contour_top?.contour_smooth;
  const sideSmooth = result.contour_side?.contour_smooth;
  const hasContour = topSmooth && sideSmooth;

  // ── Map contours to display coordinates ─────────────────────
  const topMapped = hasContour ? mapTopContour(topSmooth, wr) : [];
  const sideMapped = hasContour ? mapSideContour(sideSmooth, sideAspect) : [];

  // Flatten sole: clamp y > 0.95 to 1.0 for clean ground line
  const sideSmoothFlat = sideSmooth
    ? sideSmooth.map(([x, y]) => [x, y > 0.95 ? Math.min(y, 1.0) : y])
    : [];
  const sideMappedFlat = hasContour ? mapSideContour(sideSmoothFlat, sideAspect) : [];

  // ── TOP: W and H y-positions from actual contour ────────────
  // Fallback to fixed positions if no contour data
  const topWY = hasContour ? findWidestY(topMapped, 0.15, 0.50) : 310;
  const topHY = hasContour ? findWidestY(topMapped, 0.75, 0.95) : 666;

  // W line endpoints (user's width scaled, centered at template center)
  const uWpx = (wr / AVG_WR) * TOP.w;
  const uWL = Math.round(TOP.cx - uWpx / 2);
  const uWR = Math.round(TOP.cx + uWpx / 2);
  const aWL = Math.round(TOP.cx - TOP.w / 2);
  const aWR = Math.round(TOP.cx + TOP.w / 2);

  // H line endpoints (heel width = hr × forefoot width)
  const uHpx = hr * uWpx;
  const uHL = Math.round(TOP.cx - uHpx / 2);
  const uHR = Math.round(TOP.cx + uHpx / 2);
  const aHpx = AVG_HR * TOP.w;
  const aHL = Math.round(TOP.cx - aHpx / 2);
  const aHR = Math.round(TOP.cx + aHpx / 2);

  // ── SIDE: Arch from HEEL to BALL ────────────────────────────
  // arch_ratio = heel_to_ball / total_length
  // ball_x = heel_x - arch_ratio × total_length
  const sideBallX = Math.round(SIDE_HEEL_X - ar * SIDE_LEN);
  const sideAvgBallX = Math.round(SIDE_HEEL_X - AVG_AR * SIDE_LEN);

  // ── SIDE: Instep - find x where upper contour reaches instep height ──
  let instepXPx, avgInstepXPx, instepTopPx, avgInstepTopPx;

  if (hasContour) {
    // Get upper profile (points 0..max_x_idx)
    const maxXIdx = sideSmooth.reduce(
      (best, pt, i) => pt[0] > sideSmooth[best][0] ? i : best, 0
    );
    const upperNorm = sideSmooth.slice(0, maxXIdx + 1);

    const instepXNorm = findInstepX(upperNorm, ir, sideAspect);
    const avgInstepXNorm = findInstepX(upperNorm, AVG_IR, sideAspect);

    instepXPx = Math.round(SIDE_TOE_X + instepXNorm * SIDE_LEN);
    avgInstepXPx = Math.round(SIDE_TOE_X + avgInstepXNorm * SIDE_LEN);
  } else {
    // Fallback: place instep at ~33% from toe
    instepXPx = Math.round(SIDE_TOE_X + 0.33 * SIDE_LEN);
    avgInstepXPx = instepXPx + 6;
  }

  instepTopPx = Math.round(SIDE_GROUND_Y - ir * SIDE_LEN);
  avgInstepTopPx = Math.round(SIDE_GROUND_Y - AVG_IR * SIDE_LEN);

  // SVG path strings for contours
  const topPath = hasContour ? smoothPath(topMapped) : "";
  const sidePath = hasContour ? smoothPath(sideMappedFlat) : "";

  // Colors
  const C = {
    red: T.red,
    accent: T.accent,
    purple: T.purple,
    blue: T.blue,
    green: T.green,
    muted: T.muted,
    border: T.border,
  };

  return (
    <div style={{
      background: T.card,
      border: `1.5px solid ${T.border}`,
      borderRadius: T.radius,
      marginBottom: "16px",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: 0,
      }}>

        {/* ─── Top View Panel ─── */}
        <div style={{
          flex: isMobile ? "none" : "0 0 45%",
          background: `${T.text}06`,
          padding: isMobile ? "20px 16px 12px" : "24px 20px 16px",
          borderRight: isMobile ? "none" : `1px solid ${T.border}`,
          borderBottom: isMobile ? `1px solid ${T.border}` : "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}>
          <div style={{
            fontSize: "9px", fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.8px", color: T.muted, fontFamily: T.font,
            alignSelf: "flex-start", marginBottom: "10px",
          }}>Top View - Width &amp; Heel</div>

          <svg viewBox="645 155 285 640" style={{ width: "100%", maxWidth: "200px", height: "auto" }}>
            <defs>
              <linearGradient id="fvTopGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.muted} stopOpacity="0.08" />
                <stop offset="100%" stopColor={C.muted} stopOpacity="0.03" />
              </linearGradient>
              <linearGradient id="fvTopUserGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.red} stopOpacity="0.14" />
                <stop offset="100%" stopColor={C.red} stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* Grey dashed average template */}
            <path d={FOOT_TOP_OUTER} fill="url(#fvTopGrad)"
              stroke={C.muted} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" />
            {FOOT_TOP_TOES.map((d, i) => (
              <path key={i} d={d} fill={`${C.border}60`} opacity="0.3" />
            ))}

            {/* Red user contour */}
            {hasContour && (
              <path d={topPath} fill="url(#fvTopUserGrad)"
                stroke={C.red} strokeWidth="2" strokeLinejoin="round" />
            )}

            {/* W measurement (forefoot width) */}
            <line
              x1={aWL} y1={topWY + 3} x2={aWR} y2={topWY + 3}
              stroke={C.muted} strokeWidth="1.2"
              strokeDasharray="5 3" strokeLinecap="round" opacity="0.45"
            />
            <g opacity="0.9">
              <line
                x1={uWL} y1={topWY} x2={uWR} y2={topWY}
                stroke={C.accent} strokeWidth="2.5" strokeLinecap="round"
              />
              <circle cx={uWL} cy={topWY} r="3" fill={C.accent} opacity="0.7" />
              <circle cx={uWR} cy={topWY} r="3.5" fill="none" stroke={C.accent} strokeWidth="1.5" />
              <text
                x="648" y={topWY + 5}
                fill={C.accent} fontSize="13" fontWeight="700"
                fontFamily={T.font} textAnchor="end"
              >W</text>
            </g>

            {/* H measurement (heel width) */}
            <line
              x1={aHL} y1={topHY + 3} x2={aHR} y2={topHY + 3}
              stroke={C.muted} strokeWidth="1.2"
              strokeDasharray="5 3" strokeLinecap="round" opacity="0.45"
            />
            <g opacity="0.9">
              <line
                x1={uHL} y1={topHY} x2={uHR} y2={topHY}
                stroke={C.purple} strokeWidth="2.5" strokeLinecap="round"
              />
              <circle cx={uHL} cy={topHY} r="3" fill={C.purple} opacity="0.7" />
              <circle cx={uHR} cy={topHY} r="3.5" fill="none" stroke={C.purple} strokeWidth="1.5" />
              <text
                x="648" y={topHY + 5}
                fill={C.purple} fontSize="13" fontWeight="700"
                fontFamily={T.font} textAnchor="end"
              >H</text>
            </g>
          </svg>

          {/* Legend */}
          <div style={{
            display: "flex", gap: "12px", marginTop: "10px",
            fontSize: "10px", color: T.muted, fontFamily: T.font,
            flexWrap: "wrap", justifyContent: "center",
          }}>
            {hasContour && (
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{
                  width: "16px", height: "3px", borderRadius: "2px",
                  background: C.red, display: "inline-block",
                }} />
                Your foot
              </span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{
                width: "16px", height: "0px",
                display: "inline-block",
                borderTop: `2px dashed ${C.muted}`,
              }} />
              Average
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{
                width: "12px", height: "3px", borderRadius: "2px",
                background: C.accent, display: "inline-block",
              }} />
              W
              <span style={{
                width: "12px", height: "3px", borderRadius: "2px",
                background: C.purple, display: "inline-block", marginLeft: "6px",
              }} />
              H
            </span>
          </div>
        </div>

        {/* ─── Side Profile Panel ─── */}
        <div style={{
          flex: 1,
          background: `${T.text}06`,
          padding: isMobile ? "16px 16px 12px" : "24px 20px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}>
          <div style={{
            fontSize: "9px", fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.8px", color: T.muted, fontFamily: T.font,
            alignSelf: "flex-start", marginBottom: "10px",
          }}>Side Profile - Arch &amp; Instep</div>

          <svg viewBox="50 380 640 420" style={{ width: "100%", maxWidth: "340px", height: "auto" }}>
            <defs>
              <linearGradient id="fvSideGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.muted} stopOpacity="0.08" />
                <stop offset="100%" stopColor={C.muted} stopOpacity="0.03" />
              </linearGradient>
              <linearGradient id="fvSideUserGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.red} stopOpacity="0.12" />
                <stop offset="100%" stopColor={C.red} stopOpacity="0.04" />
              </linearGradient>
            </defs>

            {/* Grey dashed average template - user's standard model SVG
                NO mirror transform. Path already has toes LEFT, heel RIGHT. */}
            {sideOutlinePath && (
              <path d={sideOutlinePath} fill="url(#fvSideGrad)"
                stroke={C.muted} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" />
            )}

            {/* Red user contour */}
            {hasContour && (
              <path d={sidePath} fill="url(#fvSideUserGrad)"
                stroke={C.red} strokeWidth="2" strokeLinejoin="round" />
            )}

            {/* Ground line */}
            <line
              x1="55" y1={SIDE_GROUND_Y} x2="680" y2={SIDE_GROUND_Y}
              stroke={C.border} strokeWidth="0.5" opacity="0.4"
            />

            {/* Total length indicator */}
            <g opacity="0.35">
              <line
                x1={SIDE_TOE_X} y1="755" x2={SIDE_HEEL_X} y2="755"
                stroke={C.muted} strokeWidth="1" strokeLinecap="round"
              />
              <line x1={SIDE_TOE_X} y1="751" x2={SIDE_TOE_X} y2="759" stroke={C.muted} strokeWidth="1" />
              <line x1={SIDE_HEEL_X} y1="751" x2={SIDE_HEEL_X} y2="759" stroke={C.muted} strokeWidth="1" />
              <text
                x={Math.round((SIDE_TOE_X + SIDE_HEEL_X) / 2)} y="768"
                fill={C.muted} fontSize="8" fontFamily={T.font} textAnchor="middle"
              >total length</text>
            </g>

            {/* A: Arch length - from HEEL to BALL along ground */}
            <line
              x1={sideAvgBallX} y1={SIDE_GROUND_Y + 5}
              x2={SIDE_HEEL_X} y2={SIDE_GROUND_Y + 5}
              stroke={C.muted} strokeWidth="1.2"
              strokeDasharray="4 3" strokeLinecap="round" opacity="0.5"
            />
            <g opacity="0.85">
              <line
                x1={sideBallX} y1={SIDE_GROUND_Y}
                x2={SIDE_HEEL_X} y2={SIDE_GROUND_Y}
                stroke={C.blue} strokeWidth="2.5" strokeLinecap="round"
              />
              <circle cx={sideBallX} cy={SIDE_GROUND_Y} r="3.5" fill="none" stroke={C.blue} strokeWidth="1.5" />
              <circle cx={SIDE_HEEL_X} cy={SIDE_GROUND_Y} r="3" fill={C.blue} opacity="0.6" />
              <line
                x1={sideBallX} y1={SIDE_GROUND_Y}
                x2={sideBallX} y2={SIDE_GROUND_Y - 14}
                stroke={C.blue} strokeWidth="1" strokeDasharray="2 2" opacity="0.5"
              />
              <text
                x={Math.round((sideBallX + SIDE_HEEL_X) / 2)} y={SIDE_GROUND_Y - 5}
                fill={C.blue} fontSize="14" fontWeight="700"
                fontFamily={T.font} textAnchor="middle"
              >A</text>
              <text
                x={Math.round((sideBallX + SIDE_HEEL_X) / 2)} y={SIDE_GROUND_Y - 17}
                fill={C.blue} fontSize="9" fontFamily={T.font}
                textAnchor="middle" opacity="0.6"
              >arch length</text>
            </g>

            {/* I: Instep height - vertical from ground to upper contour */}
            <line
              x1={avgInstepXPx + 6} y1={avgInstepTopPx}
              x2={avgInstepXPx + 6} y2={SIDE_GROUND_Y}
              stroke={C.muted} strokeWidth="1.2"
              strokeDasharray="4 3" strokeLinecap="round" opacity="0.45"
            />
            <g opacity="0.85">
              <line
                x1={instepXPx} y1={instepTopPx}
                x2={instepXPx} y2={SIDE_GROUND_Y}
                stroke={C.green} strokeWidth="2" strokeLinecap="round"
              />
              <circle cx={instepXPx} cy={instepTopPx} r="3.5" fill="none" stroke={C.green} strokeWidth="1.5" />
              <circle cx={instepXPx} cy={SIDE_GROUND_Y} r="3.5" fill="none" stroke={C.green} strokeWidth="1.5" />
              <text
                x={instepXPx - 10} y={Math.round((instepTopPx + SIDE_GROUND_Y) / 2) - 6}
                fill={C.green} fontSize="14" fontWeight="700"
                fontFamily={T.font} textAnchor="end"
              >I</text>
              <text
                x={instepXPx - 10} y={Math.round((instepTopPx + SIDE_GROUND_Y) / 2) + 8}
                fill={C.green} fontSize="9" fontFamily={T.font}
                textAnchor="end" opacity="0.6"
              >instep</text>
            </g>

            {/* Labels */}
            <text
              x={SIDE_TOE_X} y="775"
              fill={C.muted} fontSize="9" fontFamily={T.font} textAnchor="middle"
            >toe</text>
            <text
              x={sideBallX} y="775"
              fill={C.blue} fontSize="9" fontFamily={T.font}
              textAnchor="middle" opacity="0.8"
            >ball</text>
            <text
              x={SIDE_HEEL_X} y="775"
              fill={C.muted} fontSize="9" fontFamily={T.font} textAnchor="end"
            >heel</text>
          </svg>

          {/* Arch + Instep info cards */}
          <div style={{
            display: "flex", gap: "8px", marginTop: "10px",
            maxWidth: "320px", width: "100%",
          }}>
            <div style={{
              flex: 1, padding: "8px 12px",
              background: `${C.blue}0d`,
              border: `1px solid ${C.blue}25`,
              borderRadius: T.radiusSm,
            }}>
              <div style={{
                fontWeight: 700, fontSize: "16px", color: C.blue,
                fontVariantNumeric: "tabular-nums", fontFamily: T.mono,
              }}>{ar.toFixed(2)}</div>
              <div style={{ fontSize: "9px", color: T.muted, fontFamily: T.font }}>
                Arch ratio
              </div>
              <div style={{ fontSize: "9px", color: C.blue, marginTop: "2px", lineHeight: 1.3, fontFamily: T.font }}>
                heel-to-ball / length
              </div>
            </div>

            <div style={{
              flex: 1, padding: "8px 12px",
              background: `${C.green}0d`,
              border: `1px solid ${C.green}25`,
              borderRadius: T.radiusSm,
            }}>
              <div style={{
                fontWeight: 700, fontSize: "16px", color: C.green,
                fontVariantNumeric: "tabular-nums", fontFamily: T.mono,
              }}>{ir.toFixed(3)}</div>
              <div style={{ fontSize: "9px", color: T.muted, fontFamily: T.font }}>
                Instep ratio
              </div>
              <div style={{ fontSize: "9px", color: C.green, marginTop: "2px", lineHeight: 1.3, fontFamily: T.font }}>
                Avg {AVG_IR.toFixed(3)}
              </div>
            </div>
          </div>

          {/* Side legend */}
          <div style={{
            display: "flex", gap: "12px", marginTop: "8px",
            fontSize: "10px", color: T.muted, fontFamily: T.font,
          }}>
            {hasContour && (
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{
                  width: "16px", height: "3px", borderRadius: "2px",
                  background: C.red, display: "inline-block",
                }} />
                Your foot
              </span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{
                width: "16px", height: "0px",
                display: "inline-block",
                borderTop: `2px dashed ${C.muted}`,
              }} />
              Average
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
