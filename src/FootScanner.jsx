import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";
import useIsMobile from "./useIsMobile.js";
import usePageMeta from "./usePageMeta.js";

// ═══════════════════════════════════════════════════════════════
// FOOT SCANNER — AI foot shape analysis for climbing shoe fitting
//
// Flow:
//   Step 0: Welcome
//   Step 1: Shoe size (EU)
//   Step 2: Photo capture with instruction overlays (top, side, heel)
//   Step 3: Analyzing (loading animation)
//   Step 4: Results with continuous sliders + CTA → ShoeFinder
//
// Research-backed anthropometric references:
//   Width/length: mean 0.386 ±0.022 (IOSR Journal)
//   Arch Height Index: standing mean 0.340 ±0.031 (PMC3396578)
//   Arch-to-total ratio: ~0.73 avg (Brannock)
//   Heel-to-forefoot width: ~0.65 avg
// ═══════════════════════════════════════════════════════════════

const EU_SIZES = [];
for (let s = 34; s <= 50; s += 0.5) EU_SIZES.push(s);

// ─── Resize image client-side ──────────────────────────────────
function resizeImage(file, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height / width) * maxDim); width = maxDim; }
          else { width = Math.round((width / height) * maxDim); height = maxDim; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82).split(",")[1]);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Photo instruction config ──────────────────────────────────
const PHOTO_STEPS = [
  {
    key: "top",
    title: "Top View",
    headline: "Look straight down",
    instructions: [
      "Stand barefoot on a plain, single-color floor",
      "Hold your phone directly above your foot",
      "Camera should point straight down — no angle",
      "Keep toes relaxed and spread naturally",
      "Capture the entire foot from heel to toes",
    ],
    icon: "\u{1F441}\u{FE0F}\u200D\u{1F5E8}\u{FE0F}",
    cameraLabel: "top-down",
  },
  {
    key: "side",
    title: "Side View",
    headline: "Camera at ankle height",
    instructions: [
      "Place phone on the floor or hold at ankle height",
      "Position it to the side, perpendicular to your foot",
      "Capture the full silhouette: heel, arch, and toes",
      "Keep your foot flat and weight evenly distributed",
      "The arch and instep should be clearly visible",
    ],
    icon: "\u{1F4F7}",
    cameraLabel: "side profile",
  },
  {
    key: "heel",
    title: "Heel View",
    headline: "From directly behind",
    instructions: [
      "Place phone on the floor behind you, or have someone help",
      "Camera should be at ankle height, looking at the back of your foot",
      "Center the heel in the frame",
      "The heel width and achilles area should be clear",
      "Both sides of the heel should be visible",
    ],
    icon: "\u{1F9B6}",
    cameraLabel: "rear heel",
  },
];

// ═══════════════════════════════════════════════════════════════
// RESULT SLIDER — continuous spectrum with marker
// ═══════════════════════════════════════════════════════════════
function ResultSlider({ label, value, min, max, avgValue, avgLabel, lowLabel, highLabel, lowThresh, highThresh, description, color }) {
  const pct = ((value - min) / (max - min)) * 100;
  const avgPct = ((avgValue - min) / (max - min)) * 100;
  const lowPct = ((lowThresh - min) / (max - min)) * 100;
  const highPct = ((highThresh - min) / (max - min)) * 100;

  // Determine zone
  const zone = value < lowThresh ? "low" : value > highThresh ? "high" : "mid";
  const zoneLabel = zone === "low" ? lowLabel : zone === "high" ? highLabel : avgLabel;
  const zoneColor = color || (zone === "low" ? T.blue : zone === "high" ? T.accent : T.green);

  return (
    <div style={{
      background: T.card, border: `1.5px solid ${T.border}`, borderRadius: T.radius,
      padding: "16px 18px", marginBottom: "12px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {label}
        </div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: zoneColor }}>{zoneLabel}</div>
      </div>

      {/* Slider track */}
      <div style={{ position: "relative", height: "24px", marginBottom: "6px" }}>
        {/* Background gradient bar */}
        <div style={{
          position: "absolute", top: "9px", left: 0, right: 0, height: "6px",
          borderRadius: "3px", background: `linear-gradient(90deg, ${T.blue}40, ${T.green}40, ${T.accent}40)`,
        }} />

        {/* Zone regions */}
        <div style={{
          position: "absolute", top: "9px", left: 0, width: `${lowPct}%`, height: "6px",
          borderRadius: "3px 0 0 3px", background: `${T.blue}25`,
        }} />
        <div style={{
          position: "absolute", top: "9px", left: `${highPct}%`, right: 0, height: "6px",
          borderRadius: "0 3px 3px 0", background: `${T.accent}25`,
        }} />

        {/* Average marker (thin line) */}
        <div style={{
          position: "absolute", top: "6px", left: `${avgPct}%`, width: "1.5px", height: "12px",
          background: T.muted, opacity: 0.35, transform: "translateX(-50%)",
        }} />

        {/* User's value marker */}
        <div style={{
          position: "absolute", top: "4px",
          left: `${Math.min(97, Math.max(3, pct))}%`,
          transform: "translateX(-50%)",
        }}>
          <div style={{
            width: "16px", height: "16px", borderRadius: "50%",
            background: zoneColor, border: "2.5px solid #fff",
            boxShadow: `0 1px 6px ${zoneColor}50`,
          }} />
        </div>
      </div>

      {/* Labels below */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: T.muted }}>
        <span>{lowLabel}</span>
        <span style={{ opacity: 0.5 }}>avg</span>
        <span>{highLabel}</span>
      </div>

      {/* Description */}
      {description && (
        <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.4, marginTop: "8px" }}>
          {description}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SVG FOOT PATHS (from Figma vector export)
// ═══════════════════════════════════════════════════════════════
const FOOT_TOP_OUTER = "M705.555 173.171C728.345 169.976 743.955 182.522 750.755 203.497C760.895 186.157 781.28 184.489 796.085 197.455C802.77 203.307 803.395 212.2 803.345 220.596C808.83 216.353 814.4 214.436 821.425 214.984C827.865 215.439 833.845 218.492 837.99 223.442C845.82 232.705 845.565 243.317 844.71 254.598C847.825 253.009 850.435 251.575 854.005 251.436C876.77 250.543 880.285 271.279 881.425 287.68C882.345 287.234 883.83 286.506 884.81 286.17C889.255 284.637 894.14 285.03 898.285 287.256C913.095 295.258 916.435 327.812 914.165 342.256C911.335 360.205 912.885 366.809 915.15 384.466C916.635 395.791 916.735 407.253 915.45 418.602C913.175 438.84 905.715 463.472 900.58 483.357C895.095 504.85 889.795 526.39 884.67 547.97C880.66 564.88 876.79 580.705 873.76 597.85C871.38 610.8 869.69 623.87 868.695 636.995C866.32 670.57 867.73 700.265 850.92 731.24C849.275 734.255 847.465 737.175 845.5 739.995C834.265 756.28 816.905 767.305 797.385 770.55C775.94 774.075 751.335 770.155 733.83 756.8C688.29 722.065 698.84 662.01 698.465 612.865C698.23 569.2 693.54 525.67 684.475 482.954C681.43 468.607 677.995 453.635 674.1 439.501C668.025 418.161 661.21 397.191 659.14 375.02C656.685 348.716 665.395 324.276 666.845 298.422C667.505 286.694 662.83 271.752 661.05 259.619C657.435 234.941 664.55 209.205 678.76 188.839C685.26 179.777 694.585 174.732 705.555 173.171Z";
const FOOT_TOP_INNER = "M697.11 512.005C693.79 490.069 688.515 466.615 682.97 445.13C677.02 422.055 668.19 397.711 666.145 373.874C664.75 357.608 667.855 341.285 670.61 325.428C672.205 316.277 674.665 303.662 673.975 294.799C671.7 268.05 661.29 245.859 671.915 218.892C675.89 208.809 677.28 203.665 683.75 194.135C694.3 178.591 715.985 175.22 731.165 185.879C747.175 197.121 747.285 224.778 743.305 242.167C742.275 246.604 741.02 250.986 739.545 255.297C734.63 269.693 728.58 281.408 731.955 297.39C734.38 308.893 747.395 309.277 750.995 300.349C762.875 270.923 747.88 235.468 757.715 205.854C759.08 201.884 763.915 198.375 768.105 197.072C774.24 195.155 780.895 195.863 786.485 199.029C803.495 208.434 793.97 231.934 790.775 246.575C788.31 257.874 780.58 295.253 791.205 302.388C792.48 303.258 794.09 303.478 795.555 302.983C797.91 302.165 799.985 298.923 800.875 296.409C808.46 275.06 789.03 238.075 811.63 223.65C819.365 218.712 832.28 224.251 835.66 232.857C839.605 242.919 837.95 254.596 835.57 264.974C832.395 278.21 827.845 291.169 827.45 304.918C827.265 311.305 826.68 321.664 833.72 324.629C838.56 326.666 841.58 321.117 842.445 317.357C845.95 302.159 838.41 287.205 841.68 272.027C844.88 255.573 862.315 253.928 870.055 267.522C874.595 275.489 874.835 284.142 874.005 292.987C873.65 298.772 872.21 301.84 871.18 307.646C869.255 318.5 857.735 346.385 870.525 353.446C874.93 355.876 879.88 348.484 880.4 343.022C881.545 330.987 877.295 319.478 878.59 307.468C879.09 303.478 880.42 296.964 883.9 294.91C901.005 284.806 905.65 310.995 906.805 321.694C908.265 335.243 906.92 344.204 905.49 357.212C904.39 367.488 907.425 378.524 908.475 388.754C912.43 420.814 900.795 452.218 893.23 482.918C884.64 518.95 874.35 555.255 867.64 591.665C864.925 605.825 862.98 620.115 861.82 634.485C859.83 661.035 860.48 684.305 852.235 710.115C839.475 750.06 807.22 771.36 765.215 762.895C747.33 759.375 731.635 748.775 721.69 733.5C696.4 695.125 707.375 644.86 705.45 601.47C704.115 571.365 702.345 542.12 697.29 512.325L697.11 512.005Z";
const FOOT_TOP_TOES = [
  "M747.805 253.36C749.975 258.689 749.75 300.809 740.295 299.282C734.185 284.755 742.555 267.206 747.805 253.36Z",
  "M793.745 265.916L794.23 266.424C796.055 273.242 796 286.879 794.57 293.773L794.06 293.798C791.94 290.653 793.26 270.941 793.745 265.916Z",
  "M835.255 295.388C837.17 299.653 836.705 311.337 835.69 316.111L835.01 315.436C833.6 310.997 834.615 300.078 835.255 295.388Z",
  "M872.815 330.171C874.455 333.459 873.415 342.115 872.585 345.79C870.345 341.918 872 334.498 872.815 330.171Z",
];

const FOOT_SIDE_OUTER = "M482.106 710.725C418.681 733.79 342.858 692.625 277.77 692.01C231.455 691.575 185.605 709.76 141.055 690.535C126.973 684.335 117.964 674.065 112.62 659.83C100.497 627.53 113.651 602.035 124.277 572.41C128.248 561.605 131.321 550.49 133.465 539.18C142.51 491.473 139.386 452.336 134.523 404.437C131.63 376.866 128.011 349.376 123.671 321.996C123.259 319.315 121.364 310.177 121.862 308.201C122.932 306.734 122.851 306.683 124.555 305.848C127.658 306.132 128.791 308.849 129.301 311.678C130.809 320.043 131.725 328.652 132.988 337.05C137.226 363.979 140.571 391.041 143.018 418.192C146.734 458.665 148.474 491.173 142.043 531.575C140.048 544.535 136.962 557.305 132.82 569.75C126.306 588.9 116.613 607.22 115.364 627.43C112.99 665.85 132.34 685.92 169.237 690.975C198.451 694.975 218.507 689.505 246.511 686.45C261.54 684.77 276.696 684.545 291.768 685.78C350.195 690.52 421.652 723.365 476.613 705.33C473.776 703.485 469.498 701.645 468.702 698.755C469.375 696.995 468.827 697.69 470.459 696.64C474.382 696.45 483.925 703.505 487.753 705.725C495.726 710.345 502.315 711.695 511.465 712.065L513.93 711.815C518.265 711.425 524.935 709.63 527.105 705.5C530.89 698.31 524.675 692.965 521.105 688.155C512.845 676.78 501.08 673.92 488.115 670.89C484.871 670.135 475.946 667.925 474.912 664.575C475.414 663.485 475.652 663.08 476.916 662.695C478.724 662.15 507.65 670.8 511.065 672.325C511.955 670.465 511.54 663.525 511.495 661.01C507.96 660.12 500.605 658.325 498.876 655.07C499.188 653.425 498.779 654.07 500.185 653.095C504.35 652.525 515.445 656.735 520.665 658.175C523.6 658.88 533.49 661.65 536.03 663.51C545.69 670.575 556.585 679.05 565.625 686.915C568.26 689.205 567.835 696.19 567.5 699.46C574.245 699.615 582.11 698.55 585.86 692.435C588.825 687.6 587.915 683.295 583.43 680.185C572.735 672.77 561.51 666.1 550.7 658.85C548.895 657.64 545.4 656.765 543.36 655.91C537.41 653.485 515.325 652.865 513.43 646.51C515.43 644.375 524.625 646.64 527.58 647.42C532.185 648.635 542.9 649.195 546.82 651.17C561.17 658.405 574.935 668.12 588.56 676.72C592.865 679.455 593.02 683.29 593.62 687.71C600.605 684.435 606.6 680.135 609.35 672.53C612.315 664.34 611.255 654.695 601.2 652.88C592.73 651.025 582.04 652.585 573.7 650.99C553.375 647.105 532.145 641.36 512.505 635.105L511.925 634.62C506.665 633.745 499.557 630.39 494.442 628.47C454.949 613.65 423 586.125 388.129 563.55C359.666 545.125 331.575 533 312.587 503.065C297.507 479.29 290.561 452.599 286.723 424.908C281.679 386.949 279.421 347.488 279.767 309.185C279.778 307.943 280.939 306.482 282.004 305.87C283.677 305.737 283.598 305.852 285.112 306.666C287.064 311.106 286.865 327.366 287.044 333.209C287.414 346.719 287.993 360.222 288.78 373.714C289.568 385.523 290.64 397.312 291.995 409.069C296.972 455.103 307.101 498.526 345.898 528.415C355.314 535.67 365.802 541.625 376.004 547.72C385.428 553.27 394.652 559.15 403.661 565.35C431.274 584.255 456.462 604.21 487.412 617.76C514.78 630.165 544.335 637.37 573.53 643.83C587.165 646.845 609.36 640.615 615.635 656.185C622.57 673.395 611.085 688.28 595.615 694.48C594.585 694.89 593.55 695.29 592.515 695.685C584.15 706.155 576.98 706.76 564.56 706.385C553.335 715.065 544.345 714.67 531.415 711.07C517.71 724.38 496.973 718.3 482.106 710.725Z";
const FOOT_SIDE_TOE = "M511.495 661.01L512.445 661.385L519.62 663.34C523.8 664.55 528.52 665.585 532.425 667.555C535.77 669.235 559.77 688.375 560.975 690.735C562.1 692.94 562.67 695.785 561.835 698.175C560.81 701.125 557.66 702.99 554.955 704.16C547.915 707.215 540.695 706.33 533.58 704.2C534.075 695.66 531.985 692.205 526.405 685.665C522.35 680.915 517.415 676.525 512.12 673.19L511.065 672.325C511.955 670.465 511.54 663.525 511.495 661.01Z";
const FOOT_SIDE_ARCH = "M179.783 488.181C180.472 488.368 181.392 488.538 182.006 488.89C186.883 491.685 180.443 519.845 179.518 525.58C178.895 529.44 178.402 533.35 178.402 537.265C178.402 542.53 179.778 548.195 181.874 553.01C185.882 562.215 192.072 568.09 201.27 571.865C202.815 572.5 203.33 573.235 203.97 574.79C203.66 576.99 203.75 576.315 202.236 578.295C186.341 576.26 174.19 557.015 172.778 542.265C171.557 529.505 174.726 518.005 177.155 505.585C178.184 500.33 176.575 492.295 179.783 488.181Z";

// Side-profile geometry constants
const SIDE_HEEL_X = 131;
const SIDE_TOE_X = 609;
const SIDE_TOTAL_LEN = SIDE_TOE_X - SIDE_HEEL_X; // 478px

// Population averages for visualization
const AVG_WIDTH_RATIO = 0.386;
const AVG_ARCH_RATIO = 0.73;

// ═══════════════════════════════════════════════════════════════
// FOOT VISUALIZATION PANEL — SVG top-down + side-profile diagrams
// ═══════════════════════════════════════════════════════════════
function FootVizPanel({ result, isMobile }) {
  const widthScale = AVG_WIDTH_RATIO / (result.width_ratio || AVG_WIDTH_RATIO);
  const userBallX = Math.round(SIDE_HEEL_X + (result.arch_ratio || AVG_ARCH_RATIO) * SIDE_TOTAL_LEN);
  const avgBallX = Math.round(SIDE_HEEL_X + AVG_ARCH_RATIO * SIDE_TOTAL_LEN);

  // Arch comparison text
  const archDiff = (result.arch_ratio || AVG_ARCH_RATIO) - AVG_ARCH_RATIO;
  let archCompare = "flex point alignment is average";
  if (archDiff < -0.03) archCompare = "short arch — ball is notably further forward (long toes)";
  else if (archDiff < -0.01) archCompare = "ball is slightly further forward than average";
  else if (archDiff > 0.03) archCompare = "long arch — ball is notably further back (short toes)";
  else if (archDiff > 0.01) archCompare = "ball is slightly further back than average";

  const panelBg = `${T.text}06`; // very subtle tint
  const avgStroke = T.border;
  const innerFill = T.bg;
  const detailFill = `${T.border}60`;

  return (
    <div style={{
      background: T.card, border: `1.5px solid ${T.border}`, borderRadius: T.radius,
      marginBottom: "16px", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", flexDirection: isMobile ? "column" : "row",
        gap: 0,
      }}>
        {/* ─── Top View ─── */}
        <div style={{
          flex: isMobile ? "none" : "0 0 45%", background: panelBg,
          padding: isMobile ? "20px 16px 12px" : "24px 20px 16px",
          borderRight: isMobile ? "none" : `1px solid ${T.border}`,
          borderBottom: isMobile ? `1px solid ${T.border}` : "none",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <div style={{
            fontSize: "9px", fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.8px", color: T.muted, alignSelf: "flex-start", marginBottom: "10px",
          }}>Top View</div>

          <svg viewBox="645 155 285 640" style={{ width: "100%", maxWidth: "200px", height: "auto" }}>
            <defs>
              <linearGradient id="fvTopGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.accent} stopOpacity="0.20" />
                <stop offset="100%" stopColor={T.accent} stopOpacity="0.06" />
              </linearGradient>
            </defs>

            {/* Average foot (grey dashed, scaled) */}
            <g opacity="0.45" style={{ transformOrigin: "787px 465px", transform: `scaleX(${widthScale.toFixed(3)})` }}>
              <path d={FOOT_TOP_OUTER} fill="none" stroke={avgStroke} strokeWidth="1.5" strokeDasharray="6 4" />
            </g>

            {/* User's foot */}
            <path d={FOOT_TOP_OUTER} fill="url(#fvTopGrad)" stroke={T.accent} strokeWidth="2" />
            <path d={FOOT_TOP_INNER} fill={innerFill} />
            {FOOT_TOP_TOES.map((d, i) => <path key={i} d={d} fill={detailFill} />)}

            {/* Width line W — at ball of foot y≈483, with endpoint ticks */}
            <g opacity="0.7">
              <line x1="684" y1="483" x2="916" y2="483" stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
              <circle cx="684" cy="483" r="3" fill={T.accent} opacity="0.6" />
              <circle cx="916" cy="483" r="3.5" fill="none" stroke={T.accent} strokeWidth="1.5" />
              <text x="648" y="487" fill={T.accent} fontSize="9" fontWeight="600" fontFamily={T.font} textAnchor="end">W</text>
            </g>

            {/* Heel line H — y≈735, with endpoint ticks */}
            <g opacity="0.7">
              <line x1="715" y1="735" x2="855" y2="735" stroke={T.purple} strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
              <circle cx="715" cy="735" r="3" fill={T.purple} opacity="0.6" />
              <circle cx="855" cy="735" r="3.5" fill="none" stroke={T.purple} strokeWidth="1.5" />
              <text x="648" y="739" fill={T.purple} fontSize="9" fontWeight="600" fontFamily={T.font} textAnchor="end">H</text>
            </g>
          </svg>

          {/* Legend */}
          <div style={{ display: "flex", gap: "16px", marginTop: "10px", fontSize: "10px", color: T.muted }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "16px", height: "3px", borderRadius: "2px", background: T.accent, display: "inline-block" }} />
              Your foot
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "16px", height: "2px", borderRadius: "2px", background: avgStroke, display: "inline-block", borderTop: `1.5px dashed ${T.muted}` }} />
              Average
            </span>
          </div>
        </div>

        {/* ─── Side Profile ─── */}
        <div style={{
          flex: 1, background: panelBg,
          padding: isMobile ? "16px 16px 12px" : "24px 20px 16px",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <div style={{
            fontSize: "9px", fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.8px", color: T.muted, alignSelf: "flex-start", marginBottom: "10px",
          }}>Side Profile — Arch & Instep</div>

          <svg viewBox="90 290 555 490" style={{ width: "100%", maxWidth: "320px", height: "auto" }}>
            <defs>
              <linearGradient id="fvSideGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.accent} stopOpacity="0.16" />
                <stop offset="100%" stopColor={T.accent} stopOpacity="0.04" />
              </linearGradient>
            </defs>

            {/* Average side (dashed) */}
            <g opacity="0.4">
              <path d={FOOT_SIDE_OUTER} fill="none" stroke={avgStroke} strokeWidth="1.5" strokeDasharray="6 4" />
            </g>

            {/* User's side profile */}
            <path d={FOOT_SIDE_OUTER} fill="url(#fvSideGrad)" stroke={T.accent} strokeWidth="2" />
            <path d={FOOT_SIDE_TOE} fill={innerFill} />
            <path d={FOOT_SIDE_ARCH} fill={detailFill} />

            {/* Ground line */}
            <line x1="105" y1="730" x2="625" y2="730" stroke={T.border} strokeWidth="0.5" opacity="0.4" />

            {/* Total length baseline */}
            <g opacity="0.45">
              <line x1="131" y1="742" x2="609" y2="742" stroke={T.muted} strokeWidth="1" strokeLinecap="round" />
              <line x1="131" y1="738" x2="131" y2="746" stroke={T.muted} strokeWidth="1" />
              <line x1="609" y1="738" x2="609" y2="746" stroke={T.muted} strokeWidth="1" />
              <text x="370" y="753" fill={T.muted} fontSize="7" fontFamily={T.font} textAnchor="middle">total length</text>
            </g>

            {/* Arch length (A) — heel to ball of foot (HORIZONTAL) */}
            <g opacity="0.85">
              <line x1="131" y1="730" x2={userBallX} y2="730" stroke={T.blue} strokeWidth="2.5" strokeLinecap="round" />
              <line x1="131" y1="735" x2={avgBallX} y2="735" stroke={T.muted} strokeWidth="1.2" strokeDasharray="4 3" strokeLinecap="round" />
              <circle cx="131" cy="730" r="3" fill={T.blue} opacity="0.6" />
              <circle cx={userBallX} cy="730" r="3.5" fill="none" stroke={T.blue} strokeWidth="1.5" />
              <line x1={userBallX} y1="730" x2={userBallX} y2="716" stroke={T.blue} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
              <text x={Math.round((131 + userBallX) / 2)} y="727" fill={T.blue} fontSize="9" fontWeight="600" fontFamily={T.font} textAnchor="middle">A</text>
              <text x={Math.round((131 + userBallX) / 2)} y="717" fill={T.blue} fontSize="6.5" fontFamily={T.font} textAnchor="middle" opacity="0.5">arch length</text>
            </g>

            {/* Instep (I) — vertical at navicular x≈330 */}
            <g opacity="0.8">
              <line x1="330" y1="504" x2="330" y2="700" stroke={T.green} strokeWidth="2" strokeLinecap="round" />
              <circle cx="330" cy="504" r="3.5" fill="none" stroke={T.green} strokeWidth="1.5" />
              <circle cx="330" cy="700" r="3.5" fill="none" stroke={T.green} strokeWidth="1.5" />
              <text x="342" y="598" fill={T.green} fontSize="9" fontWeight="600" fontFamily={T.font} textAnchor="start">I</text>
              <text x="342" y="609" fill={T.green} fontSize="6.5" fontFamily={T.font} textAnchor="start" opacity="0.5">instep</text>
            </g>

            {/* Landmark labels */}
            <text x="131" y="760" fill={T.muted} fontSize="6" fontFamily={T.font} textAnchor="middle">heel</text>
            <text x={userBallX} y="760" fill={T.blue} fontSize="6" fontFamily={T.font} textAnchor="middle" opacity="0.6">ball</text>
            <text x="609" y="760" fill={T.muted} fontSize="6" fontFamily={T.font} textAnchor="middle">toe</text>
          </svg>

          {/* Arch ratio info card */}
          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "8px 14px", marginTop: "10px",
            background: `${T.blue}0d`, border: `1px solid ${T.blue}25`,
            borderRadius: T.radiusSm, maxWidth: "320px", width: "100%",
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "16px", color: T.blue, fontVariantNumeric: "tabular-nums", fontFamily: T.mono }}>
                {(result.arch_ratio || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: "9px", color: T.muted }}>Arch ratio</div>
            </div>
            <div style={{ flex: 1, fontSize: "10px", color: T.muted, lineHeight: 1.4 }}>
              Ball-to-heel ÷ total length. Avg <strong style={{ color: T.text }}>0.73</strong> — <span style={{ color: T.blue }}>{archCompare}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function FootScanner() {
  usePageMeta({
    title: "Foot Scanner — AI Foot Shape Analysis | climbing-gear.com",
    description: "Scan your foot with 3 photos and discover your exact foot shape for the perfect climbing shoe fit.",
  });

  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [step, setStep] = useState(0);
  const [shoeSize, setShoeSize] = useState(42);
  const [photos, setPhotos] = useState({ top: null, side: null, heel: null });
  const [previews, setPreviews] = useState({ top: null, side: null, heel: null });
  const [photoStep, setPhotoStep] = useState(0); // which of the 3 photos we're on
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef();

  // ─── Photo handling ──────────────────────────────────────────
  const handlePhoto = useCallback(async (viewKey, file) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPreviews(prev => ({ ...prev, [viewKey]: previewUrl }));
    try {
      const base64 = await resizeImage(file);
      setPhotos(prev => ({ ...prev, [viewKey]: base64 }));
    } catch {
      setError("Failed to process image. Please try a different photo.");
    }
  }, []);

  const allPhotosReady = photos.top && photos.side && photos.heel;

  // ─── Store scan result in Supabase (fire-and-forget) ────────
  const storeScanResult = useCallback(async (data, size) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/foot_scans`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          shoe_size_eu: size,
          toe_shape: data.toe_shape,
          toe_confidence: data.toe_confidence,
          width_ratio: data.width_ratio,
          instep_ratio: data.instep_ratio,
          heel_ratio: data.heel_ratio,
          arch_ratio: data.arch_ratio,
          volume: data.volume,
          width: data.width,
          heel_width: data.heel_width,
          confidence: data.confidence,
          notes: data.notes,
        }),
      });
    } catch {
      // Silent — storage failure should never block the user experience
    }
  }, []);

  // ─── API call ────────────────────────────────────────────────
  const analyzePhotos = useCallback(async () => {
    setStep(3);
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-foot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: { top: photos.top, side: photos.side, heel: photos.heel },
          shoe_size_eu: shoeSize,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Server error: ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
      setStep(4);
      // Store result in Supabase (non-blocking)
      storeScanResult(data, shoeSize);
    } catch (err) {
      setError(err.message || "Analysis failed. Please try again.");
      setStep(2);
    } finally {
      setAnalyzing(false);
    }
  }, [photos, shoeSize, storeScanResult]);

  // ─── Navigate to ShoeFinder ──────────────────────────────────
  const goToFinder = useCallback(() => {
    if (!result) return;
    const p = new URLSearchParams();
    if (result.toe_shape) p.set("tf", result.toe_shape);
    if (result.volume) p.set("v", result.volume);
    if (result.width) p.set("wd", result.width);
    if (result.heel_width) p.set("hl", result.heel_width);
    navigate(`/find?${p.toString()}`);
  }, [result, navigate]);

  // ─── Shared components ───────────────────────────────────────
  const Wrap = ({ children, narrow }) => (
    <div style={{
      minHeight: "100vh", background: T.bg, fontFamily: T.font,
      padding: isMobile ? "16px 16px 100px" : "32px 24px 100px",
    }}>
      <div style={{ maxWidth: narrow ? "520px" : "680px", margin: "0 auto" }}>{children}</div>
    </div>
  );

  const Badge = ({ text }) => (
    <span style={{
      display: "inline-block", fontSize: "10px", fontWeight: 700,
      letterSpacing: "0.8px", textTransform: "uppercase",
      color: T.accent, background: T.accentSoft,
      padding: "4px 10px", borderRadius: "12px", marginBottom: "12px", fontFamily: T.mono,
    }}>{text}</span>
  );

  const Btn = ({ onClick, children, disabled, primary = true, full = false }) => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: primary ? "13px 32px" : "10px 24px",
      borderRadius: T.radiusSm, fontFamily: T.font,
      fontSize: primary ? "15px" : "14px", fontWeight: primary ? 700 : 600,
      cursor: disabled ? "default" : "pointer", transition: "all 0.2s",
      border: primary ? "none" : `1px solid ${T.border}`,
      background: disabled ? T.border : primary ? T.accent : "transparent",
      color: disabled ? T.muted : primary ? "#fff" : T.muted,
      opacity: disabled ? 0.6 : 1,
      width: full ? "100%" : "auto", textAlign: "center",
    }}>{children}</button>
  );

  // ═══════════════════════════════════════════════════════════
  // STEP 0 — Welcome
  // ═══════════════════════════════════════════════════════════
  if (step === 0) return (
    <Wrap narrow>
      <div style={{ textAlign: "center", paddingTop: isMobile ? "16px" : "32px" }}>
        <Badge text="Beta" />
        <h1 style={{
          fontSize: isMobile ? "26px" : "34px", fontWeight: 800,
          letterSpacing: "-0.5px", color: T.text, marginBottom: "12px", lineHeight: 1.2,
        }}>Discover your foot shape</h1>
        <p style={{
          fontSize: "15px", color: T.muted, lineHeight: 1.6,
          maxWidth: "420px", margin: "0 auto 28px",
        }}>
          Take 3 quick photos and we'll map your toe shape, volume, width, heel, and arch
          proportions — then match you to climbing shoes that fit.
        </p>

        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius,
          padding: isMobile ? "16px" : "22px 26px", textAlign: "left", marginBottom: "28px",
        }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: T.text, marginBottom: "14px" }}>What you'll need</div>
          {[
            "Bare feet — no socks",
            "Plain floor (one color, good lighting)",
            "Your street shoe size (EU)",
            "~60 seconds of your time",
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "8px", fontSize: "13px", color: T.muted }}>
              <span style={{ color: T.green, fontWeight: 700, flexShrink: 0 }}>{"\u2713"}</span>{t}
            </div>
          ))}
        </div>

        <Btn onClick={() => setStep(1)} full={isMobile}>{"Let's scan"}</Btn>

        <div style={{ fontSize: "11px", color: T.muted, marginTop: "14px", lineHeight: 1.5 }}>
          Photos are analyzed in real-time and never stored. No account needed.
        </div>
      </div>
    </Wrap>
  );

  // ═══════════════════════════════════════════════════════════
  // STEP 1 — Shoe Size
  // ═══════════════════════════════════════════════════════════
  if (step === 1) return (
    <Wrap narrow>
      <Badge text="Step 1 of 3" />
      <h2 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.3px", marginBottom: "8px", color: T.text }}>
        Your street shoe size
      </h2>
      <p style={{ fontSize: "13px", color: T.muted, marginBottom: "20px", lineHeight: 1.5 }}>
        This anchors the proportions from your photos. Use your everyday shoe size, not your climbing shoe size.
      </p>

      <div style={{
        background: T.card, border: `1.5px solid ${T.border}`, borderRadius: T.radius,
        padding: "20px", marginBottom: "20px",
      }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: T.muted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>EU Size</div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <input type="range" min="34" max="50" step="0.5" value={shoeSize}
            onChange={e => setShoeSize(Number(e.target.value))}
            style={{ flex: 1, accentColor: T.accent, height: "6px" }} />
          <div style={{ fontFamily: T.mono, fontSize: "24px", fontWeight: 700, color: T.accent, minWidth: "52px", textAlign: "right" }}>
            {shoeSize % 1 === 0 ? shoeSize : shoeSize.toFixed(1)}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "14px" }}>
          {[37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49].map(s => (
            <span key={s} onClick={() => setShoeSize(s)} style={{
              fontSize: "12px", padding: "5px 12px", borderRadius: "16px",
              border: `1.5px solid ${shoeSize === s ? T.accent : T.border}`,
              background: shoeSize === s ? T.accentSoft : "transparent",
              color: shoeSize === s ? T.accent : T.muted,
              cursor: "pointer", fontFamily: T.mono, fontWeight: 600, transition: "all 0.15s",
            }}>{s}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px" }}>
        <Btn onClick={() => setStep(0)} primary={false}>Back</Btn>
        <Btn onClick={() => setStep(2)}>Continue</Btn>
      </div>
    </Wrap>
  );

  // ═══════════════════════════════════════════════════════════
  // STEP 2 — Photo Capture (one at a time, fullscreen instruction)
  // ═══════════════════════════════════════════════════════════
  if (step === 2) {
    const currentPhoto = PHOTO_STEPS[photoStep];
    const hasCurrentPhoto = !!previews[currentPhoto?.key];
    const completedCount = [previews.top, previews.side, previews.heel].filter(Boolean).length;

    return (
      <Wrap>
        <Badge text="Step 2 of 3 — Photos" />

        {/* Progress dots */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {PHOTO_STEPS.map((ps, i) => (
            <div key={ps.key} style={{
              flex: 1, height: "4px", borderRadius: "2px",
              background: previews[ps.key] ? T.accent : i === photoStep ? `${T.accent}50` : T.border,
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        {error && (
          <div style={{
            background: T.redSoft, border: `1px solid ${T.red}30`, borderRadius: T.radiusSm,
            padding: "10px 14px", marginBottom: "12px", fontSize: "13px", color: T.red,
          }}>{error}</div>
        )}

        {/* Current photo card */}
        {currentPhoto && (
          <div style={{
            background: T.card, border: `1.5px solid ${hasCurrentPhoto ? T.green : T.border}`,
            borderRadius: T.radius, overflow: "hidden", marginBottom: "16px",
          }}>
            {/* Photo area / preview */}
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                height: isMobile ? "260px" : "300px",
                background: hasCurrentPhoto ? "#000" : "rgba(44,50,39,0.03)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", position: "relative",
              }}
            >
              {hasCurrentPhoto ? (
                <>
                  <img src={previews[currentPhoto.key]} alt={currentPhoto.title}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  <div style={{
                    position: "absolute", top: "10px", right: "10px",
                    width: "30px", height: "30px", borderRadius: "50%",
                    background: T.green, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "16px", fontWeight: 700,
                  }}>{"\u2713"}</div>
                  <div style={{
                    position: "absolute", bottom: "10px", right: "10px",
                    background: "rgba(0,0,0,0.65)", color: "#fff",
                    padding: "6px 14px", borderRadius: "14px",
                    fontSize: "12px", fontWeight: 600,
                  }}>Tap to retake</div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "20px" }}>
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>{currentPhoto.icon}</div>
                  <div style={{
                    fontSize: "16px", fontWeight: 700, color: T.text, marginBottom: "4px",
                  }}>{currentPhoto.headline}</div>
                  <div style={{
                    fontSize: "13px", color: T.accent, fontWeight: 600, marginTop: "12px",
                    padding: "8px 24px", borderRadius: "20px",
                    border: `1.5px solid ${T.accent}`, display: "inline-block",
                  }}>
                    {isMobile ? "Tap to take photo" : "Click to upload photo"}
                  </div>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "10px" }}>
                {currentPhoto.title} — {currentPhoto.headline}
              </div>
              {currentPhoto.instructions.map((inst, i) => (
                <div key={i} style={{
                  display: "flex", gap: "8px", marginBottom: "5px",
                  fontSize: "12px", color: T.muted, lineHeight: 1.4,
                }}>
                  <span style={{ color: T.accent, fontWeight: 600, flexShrink: 0, fontFamily: T.mono, fontSize: "10px" }}>{i + 1}</span>
                  {inst}
                </div>
              ))}
            </div>

            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              style={{ display: "none" }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handlePhoto(currentPhoto.key, f);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {/* Thumbnail strip of all 3 */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {PHOTO_STEPS.map((ps, i) => (
            <div key={ps.key}
              onClick={() => setPhotoStep(i)}
              style={{
                flex: 1, height: "64px", borderRadius: T.radiusSm,
                border: `2px solid ${i === photoStep ? T.accent : previews[ps.key] ? T.green : T.border}`,
                overflow: "hidden", cursor: "pointer", position: "relative",
                background: previews[ps.key] ? "#000" : T.surface,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {previews[ps.key] ? (
                <img src={previews[ps.key]} alt={ps.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }} />
              ) : (
                <span style={{ fontSize: "10px", color: T.muted, fontWeight: 600 }}>{ps.title}</span>
              )}
              {previews[ps.key] && (
                <div style={{
                  position: "absolute", top: "3px", right: "3px",
                  width: "16px", height: "16px", borderRadius: "50%",
                  background: T.green, color: "#fff", fontSize: "9px",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
                }}>{"\u2713"}</div>
              )}
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", gap: "10px" }}>
          <Btn onClick={() => {
            if (photoStep > 0) setPhotoStep(photoStep - 1);
            else setStep(1);
          }} primary={false}>Back</Btn>

          {hasCurrentPhoto && photoStep < 2 && (
            <Btn onClick={() => setPhotoStep(photoStep + 1)}>Next photo</Btn>
          )}

          {completedCount === 3 && (
            <Btn onClick={analyzePhotos}>
              Analyze my foot {"\u2192"}
            </Btn>
          )}

          {!hasCurrentPhoto && completedCount > 0 && photoStep < 2 && (
            <Btn onClick={() => setPhotoStep(photoStep + 1)} primary={false}>Skip for now</Btn>
          )}
        </div>
      </Wrap>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 3 — Analyzing
  // ═══════════════════════════════════════════════════════════
  if (step === 3) return (
    <Wrap narrow>
      <div style={{ textAlign: "center", paddingTop: isMobile ? "48px" : "80px" }}>
        <div style={{
          width: "72px", height: "72px", borderRadius: "50%",
          background: T.accentSoft, margin: "0 auto 20px",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "pulse 2s ease-in-out infinite",
        }}>
          <svg viewBox="0 0 40 40" width="32" height="32" style={{ animation: "spin 3s linear infinite" }}>
            <path d="M12,35 Q10,28 12,18 Q14,10 20,7 Q26,10 28,18 Q30,28 28,35 Z"
              fill="none" stroke={T.accent} strokeWidth="1.5" />
            <circle cx="20" cy="7" r="2" fill={T.accent} opacity="0.5" />
          </svg>
        </div>

        <h2 style={{ fontSize: "20px", fontWeight: 700, color: T.text, marginBottom: "8px" }}>
          Analyzing your foot
        </h2>
        <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.5, marginBottom: "28px" }}>
          AI is examining toe shape, instep height, width, heel profile, and arch proportions...
        </p>

        <div style={{ maxWidth: "260px", margin: "0 auto" }}>
          {["Detecting foot outline", "Classifying toe shape", "Measuring proportions", "Calculating ratios", "Building your profile"].map((label, i) => (
            <div key={i} style={{
              display: "flex", gap: "10px", alignItems: "center",
              padding: "5px 0", fontSize: "12px", color: T.muted,
              opacity: 0, animation: `fadeUp 0.4s ease ${i * 0.3}s forwards`,
            }}>
              <div style={{
                width: "14px", height: "14px", borderRadius: "50%",
                border: `1.5px solid ${T.accent}30`,
                animation: `fillDot 0.2s ease ${i * 0.3 + 1}s forwards`,
              }} />
              {label}
            </div>
          ))}
        </div>

        <style>{`
          @keyframes fillDot { to { background: ${T.accent}; border-color: ${T.accent}; } }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </Wrap>
  );

  // ═══════════════════════════════════════════════════════════
  // STEP 4 — Results with sliders
  // ═══════════════════════════════════════════════════════════
  if (step === 4 && result) {
    const toeInfo = {
      egyptian: { label: "Egyptian", desc: "Big toe longest, smooth taper. Fits most asymmetric climbing shoes well." },
      greek: { label: "Greek (Morton's)", desc: "Second toe longer. Needs extra toe box room — avoid heavily downturned shoes that crush the 2nd toe." },
      roman: { label: "Roman (Square)", desc: "First 2–3 toes roughly equal. Benefits from wider, more symmetric toe boxes." },
    };
    const toe = toeInfo[result.toe_shape] || toeInfo.egyptian;

    return (
      <Wrap>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Badge text="Your Foot Profile" />
          <h2 style={{
            fontSize: isMobile ? "24px" : "30px", fontWeight: 800,
            letterSpacing: "-0.5px", color: T.text, marginBottom: "8px",
          }}>Here's your foot shape</h2>
          <p style={{ fontSize: "14px", color: T.muted }}>Based on your photos and EU {shoeSize}</p>
        </div>

        {/* Foot visualization — SVG diagrams with measurement overlays */}
        <FootVizPanel result={result} isMobile={isMobile} />

        {/* Toe shape — special card (categorical, not slider) */}
        <div style={{
          background: T.card, border: `1.5px solid ${T.border}`, borderRadius: T.radius,
          padding: "16px 18px", marginBottom: "12px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.4px" }}>Toe Shape</div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: T.accent }}>{toe.label}</div>
          </div>
          {/* Toe type selector visual */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            {["egyptian", "greek", "roman"].map(t => (
              <div key={t} style={{
                flex: 1, padding: "6px", borderRadius: T.radiusXs, textAlign: "center",
                background: result.toe_shape === t ? T.accentSoft : "transparent",
                border: `1px solid ${result.toe_shape === t ? T.accent : T.border}`,
                fontSize: "11px", fontWeight: result.toe_shape === t ? 700 : 500,
                color: result.toe_shape === t ? T.accent : T.muted,
                textTransform: "capitalize",
              }}>{t}</div>
            ))}
          </div>
          <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.4 }}>{toe.desc}</div>
          {result.toe_confidence < 0.7 && (
            <div style={{ fontSize: "11px", color: T.yellow, marginTop: "4px" }}>
              Confidence is moderate — a clearer top-down photo would improve accuracy.
            </div>
          )}
        </div>

        {/* Continuous sliders for all ratio-based measurements */}
        <ResultSlider
          label="Forefoot Width"
          value={result.width_ratio}
          min={0.30} max={0.48} avgValue={0.386} avgLabel="Average"
          lowLabel="Narrow" highLabel="Wide"
          lowThresh={0.365} highThresh={0.405}
          description={
            result.width_ratio < 0.365
              ? "Slimmer forefoot — European-lasted shoes tend to fit well. Look for models described as 'narrow.'"
              : result.width_ratio > 0.405
              ? "Wider forefoot — prioritize shoes with generous toe boxes. Lace closures give extra adjustability."
              : "Average width — most shoes should fit well. You have the widest selection available."
          }
        />

        <ResultSlider
          label="Forefoot Volume (Instep)"
          value={result.instep_ratio}
          min={0.24} max={0.44} avgValue={0.340} avgLabel="Standard"
          lowLabel="Low Volume" highLabel="High Volume"
          lowThresh={0.310} highThresh={0.360}
          description={
            result.instep_ratio < 0.310
              ? "Flat instep profile — look for women's or LV (low-volume) models for the best fit. Standard shoes may gap above the forefoot."
              : result.instep_ratio > 0.360
              ? "Pronounced instep — avoid snug LV models. Shoes with generous forefoot depth will be more comfortable."
              : "Standard volume — most unisex shoes will accommodate your instep well."
          }
        />

        <ResultSlider
          label="Heel Width"
          value={result.heel_ratio}
          min={0.45} max={0.85} avgValue={0.65} avgLabel="Medium"
          lowLabel="Narrow" highLabel="Wide"
          lowThresh={0.58} highThresh={0.72}
          description={
            result.heel_ratio < 0.58
              ? "Narrow heel relative to forefoot — classic 'fin shape.' You may experience heel slip in standard shoes. Prioritize shoes with snug heel cups."
              : result.heel_ratio > 0.72
              ? "Broad heel — lace-up closures give the most adjustability. Avoid shoes with very narrow heel cups."
              : "Proportional heel — standard heel cups should work well across most models."
          }
        />

        <ResultSlider
          label="Arch-to-Length Ratio"
          value={result.arch_ratio}
          min={0.64} max={0.82} avgValue={0.73} avgLabel="Average"
          lowLabel="Long toes" highLabel="Short toes"
          lowThresh={0.71} highThresh={0.75}
          description={
            result.arch_ratio < 0.71
              ? "Your toes are longer than average. Look for shoes with a forward flex point — the shoe should bend where your foot naturally bends."
              : result.arch_ratio > 0.75
              ? "Your toes are shorter than average. Shoes with a standard or rearward flex point will align better with your natural bend."
              : "Average proportion — most shoes will flex in the right spot for your foot."
          }
        />

        {/* AI notes */}
        {result.notes && (
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
            padding: "12px 14px", display: "flex", gap: "10px", alignItems: "flex-start",
            marginBottom: "20px",
          }}>
            <span style={{ fontSize: "14px", flexShrink: 0 }}>{"\uD83E\uDD16"}</span>
            <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.5 }}>
              <strong style={{ color: T.text, fontWeight: 600 }}>AI note:</strong> {result.notes}
            </div>
          </div>
        )}

        {/* Confidence */}
        <div style={{
          fontSize: "11px", color: T.muted, marginBottom: "24px",
          display: "flex", alignItems: "center", gap: "6px",
        }}>
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: result.confidence === "high" ? T.green : result.confidence === "medium" ? T.yellow : T.red,
          }} />
          Analysis confidence: {result.confidence}
          {result.confidence !== "high" && " — better lighting or angle may improve accuracy"}
        </div>

        {/* CTAs */}
        <div style={{
          display: "flex", flexDirection: isMobile ? "column" : "row",
          gap: "10px", marginBottom: "20px",
        }}>
          <button onClick={goToFinder} style={{
            padding: "14px 28px", borderRadius: T.radiusSm, fontFamily: T.font,
            fontSize: "15px", fontWeight: 700, cursor: "pointer", border: "none",
            background: `linear-gradient(135deg, ${T.accent}, #d4613a)`,
            color: "#fff", boxShadow: `0 4px 16px ${T.accent}40`,
            transition: "all 0.2s", textAlign: "center", width: isMobile ? "100%" : "auto",
          }}>
            Find matching shoes {"\u2192"}
          </button>
          <Btn onClick={() => {
            setStep(0); setPhotoStep(0);
            setPhotos({ top: null, side: null, heel: null });
            setPreviews({ top: null, side: null, heel: null });
            setResult(null);
          }} primary={false}>Scan again</Btn>
        </div>

        <div style={{
          fontSize: "11px", color: T.muted, lineHeight: 1.5,
          borderTop: `1px solid ${T.border}`, paddingTop: "14px",
        }}>
          AI-powered estimate based on photos. For the most accurate fit, try shoes on in person.
          Foot shape is one factor — climbing style and preference matter too.
        </div>
      </Wrap>
    );
  }

  return null;
}
