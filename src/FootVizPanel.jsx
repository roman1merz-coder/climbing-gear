import { T } from "./tokens.js";

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

// ═══════════════════════════════════════════════════════════════
// Population averages
// ═══════════════════════════════════════════════════════════════
const AVG_WIDTH_RATIO = 0.386;
const AVG_ARCH_RATIO = 0.73;
const AVG_INSTEP_RATIO = 0.34;
const AVG_HEEL_RATIO = 0.65;

// Side-profile geometry
const SIDE_HEEL_X = 131;
const SIDE_TOE_X = 609;
const SIDE_TOTAL_LEN = SIDE_TOE_X - SIDE_HEEL_X; // 478px
const SIDE_GROUND_Y = 730;

// Top-view geometry
const TOP_BALL_Y = 483;
const TOP_BALL_MEDIAL_X = 684;
const TOP_BALL_LATERAL_X = 916;
const TOP_BALL_CENTER_X = 787;
const TOP_DEFAULT_WIDTH_SPAN = TOP_BALL_LATERAL_X - TOP_BALL_MEDIAL_X; // 232px
const TOP_HEEL_Y = 735;
const TOP_HEEL_MEDIAL_X = 715;
const TOP_HEEL_LATERAL_X = 855;

// ═══════════════════════════════════════════════════════════════
// FOOT VISUALIZATION PANEL
// ═══════════════════════════════════════════════════════════════
export default function FootVizPanel({ result, isMobile }) {
  const wr = result.width_ratio || AVG_WIDTH_RATIO;
  const ar = result.arch_ratio || AVG_ARCH_RATIO;
  const ir = result.instep_ratio || AVG_INSTEP_RATIO;
  const hr = result.heel_ratio || AVG_HEEL_RATIO;

  // ── Top view: width & heel lines ──────────────────────────────
  // User width span (px), centered on x=787
  const userWidthPx = (wr / AVG_WIDTH_RATIO) * TOP_DEFAULT_WIDTH_SPAN;
  const userWidthLeft = Math.round(TOP_BALL_CENTER_X - userWidthPx / 2);
  const userWidthRight = Math.round(TOP_BALL_CENTER_X + userWidthPx / 2);

  // Average width span, centered on x=787
  const avgWidthPx = TOP_DEFAULT_WIDTH_SPAN; // AVG_WIDTH_RATIO / AVG_WIDTH_RATIO * 232
  const avgWidthLeft = Math.round(TOP_BALL_CENTER_X - avgWidthPx / 2);
  const avgWidthRight = Math.round(TOP_BALL_CENTER_X + avgWidthPx / 2);

  // User heel span, scaled relative to user width
  const userHeelPx = (hr / AVG_HEEL_RATIO) * userWidthPx;
  const userHeelLeft = Math.round(TOP_BALL_CENTER_X - userHeelPx / 2);
  const userHeelRight = Math.round(TOP_BALL_CENTER_X + userHeelPx / 2);

  // Average heel span
  const avgHeelPx = AVG_HEEL_RATIO * avgWidthPx; // = 0.65 * 232 = 150.8
  const avgHeelLeft = Math.round(TOP_BALL_CENTER_X - avgHeelPx / 2);
  const avgHeelRight = Math.round(TOP_BALL_CENTER_X + avgHeelPx / 2);

  // ── Side view: arch & instep ──────────────────────────────────
  const userBallX = Math.round(SIDE_HEEL_X + ar * SIDE_TOTAL_LEN);
  const avgBallX = Math.round(SIDE_HEEL_X + AVG_ARCH_RATIO * SIDE_TOTAL_LEN);

  // Instep vertical line — fixed x≈380 (mid-dorsum), height driven by instep_ratio
  const instepX = 380;
  const userInstepTopY = Math.round(SIDE_GROUND_Y - ir * SIDE_TOTAL_LEN);
  const avgInstepTopY = Math.round(SIDE_GROUND_Y - AVG_INSTEP_RATIO * SIDE_TOTAL_LEN);
  // Clamp: don't let it float above the viewBox top (y=290)
  const userInstepTopYClamped = Math.max(300, Math.min(userInstepTopY, SIDE_GROUND_Y - 40));
  const avgInstepTopYClamped = Math.max(300, Math.min(avgInstepTopY, SIDE_GROUND_Y - 40));

  // Arch comparison text
  const archDiff = ar - AVG_ARCH_RATIO;
  let archCompare = "flex point alignment is average";
  if (archDiff < -0.03) archCompare = "short arch — ball is notably further forward (long toes)";
  else if (archDiff < -0.01) archCompare = "ball is slightly further forward than average";
  else if (archDiff > 0.03) archCompare = "long arch — ball is notably further back (short toes)";
  else if (archDiff > 0.01) archCompare = "ball is slightly further back than average";

  // Shared style values
  const panelBg = `${T.text}06`;
  const avgStroke = T.border;
  const innerFill = T.bg;
  const detailFill = `${T.border}60`;
  const avgLineMuted = T.muted;

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
          background: panelBg,
          padding: isMobile ? "20px 16px 12px" : "24px 20px 16px",
          borderRight: isMobile ? "none" : `1px solid ${T.border}`,
          borderBottom: isMobile ? `1px solid ${T.border}` : "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}>
          {/* Panel label */}
          <div style={{
            fontSize: "9px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
            color: T.muted,
            fontFamily: T.font,
            alignSelf: "flex-start",
            marginBottom: "10px",
          }}>Top View</div>

          {/* Top-view SVG */}
          <svg
            viewBox="645 155 285 640"
            style={{ width: "100%", maxWidth: "200px", height: "auto" }}
          >
            <defs>
              <linearGradient id="fvTopGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.accent} stopOpacity="0.20" />
                <stop offset="100%" stopColor={T.accent} stopOpacity="0.06" />
              </linearGradient>
            </defs>

            {/* User's foot outline */}
            <path d={FOOT_TOP_OUTER} fill="url(#fvTopGrad)" stroke={T.accent} strokeWidth="2" />
            <path d={FOOT_TOP_INNER} fill={innerFill} />
            {FOOT_TOP_TOES.map((d, i) => (
              <path key={i} d={d} fill={detailFill} />
            ))}

            {/* ── Width line W — ball of foot y=483 ── */}
            {/* Average line (dashed, slightly below) */}
            <line
              x1={avgWidthLeft} y1={TOP_BALL_Y + 3}
              x2={avgWidthRight} y2={TOP_BALL_Y + 3}
              stroke={avgLineMuted} strokeWidth="1.2"
              strokeDasharray="5 3" strokeLinecap="round"
              opacity="0.45"
            />
            {/* User line */}
            <g opacity="0.9">
              <line
                x1={userWidthLeft} y1={TOP_BALL_Y}
                x2={userWidthRight} y2={TOP_BALL_Y}
                stroke={T.accent} strokeWidth="2.5" strokeLinecap="round"
              />
              <circle cx={userWidthLeft} cy={TOP_BALL_Y} r="3" fill={T.accent} opacity="0.7" />
              <circle cx={userWidthRight} cy={TOP_BALL_Y} r="3.5" fill="none" stroke={T.accent} strokeWidth="1.5" />
              <text
                x="645" y={TOP_BALL_Y + 6}
                fill={T.accent} fontSize="14" fontWeight="700"
                fontFamily={T.font} textAnchor="end"
              >W</text>
            </g>

            {/* ── Heel line H — y=735 ── */}
            {/* Average line (dashed, slightly below) */}
            <line
              x1={avgHeelLeft} y1={TOP_HEEL_Y + 3}
              x2={avgHeelRight} y2={TOP_HEEL_Y + 3}
              stroke={avgLineMuted} strokeWidth="1.2"
              strokeDasharray="5 3" strokeLinecap="round"
              opacity="0.45"
            />
            {/* User line */}
            <g opacity="0.9">
              <line
                x1={userHeelLeft} y1={TOP_HEEL_Y}
                x2={userHeelRight} y2={TOP_HEEL_Y}
                stroke={T.purple} strokeWidth="2.5" strokeLinecap="round"
              />
              <circle cx={userHeelLeft} cy={TOP_HEEL_Y} r="3" fill={T.purple} opacity="0.7" />
              <circle cx={userHeelRight} cy={TOP_HEEL_Y} r="3.5" fill="none" stroke={T.purple} strokeWidth="1.5" />
              <text
                x="645" y={TOP_HEEL_Y + 6}
                fill={T.purple} fontSize="14" fontWeight="700"
                fontFamily={T.font} textAnchor="end"
              >H</text>
            </g>
          </svg>

          {/* Legend */}
          <div style={{
            display: "flex",
            gap: "16px",
            marginTop: "10px",
            fontSize: "10px",
            color: T.muted,
            fontFamily: T.font,
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{
                width: "16px", height: "3px", borderRadius: "2px",
                background: T.accent, display: "inline-block",
              }} />
              Your foot
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{
                width: "16px", height: "0px", borderRadius: "2px",
                display: "inline-block",
                borderTop: `2px dashed ${T.muted}`,
              }} />
              Average
            </span>
          </div>
        </div>

        {/* ─── Side Profile Panel ─── */}
        <div style={{
          flex: 1,
          background: panelBg,
          padding: isMobile ? "16px 16px 12px" : "24px 20px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}>
          {/* Panel label */}
          <div style={{
            fontSize: "9px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
            color: T.muted,
            fontFamily: T.font,
            alignSelf: "flex-start",
            marginBottom: "10px",
          }}>Side Profile — Arch &amp; Instep</div>

          {/* Side-view SVG */}
          <svg
            viewBox="90 290 555 490"
            style={{ width: "100%", maxWidth: "320px", height: "auto" }}
          >
            <defs>
              <linearGradient id="fvSideGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.accent} stopOpacity="0.16" />
                <stop offset="100%" stopColor={T.accent} stopOpacity="0.04" />
              </linearGradient>
            </defs>

            {/* User's foot outline */}
            <path d={FOOT_SIDE_OUTER} fill="url(#fvSideGrad)" stroke={T.accent} strokeWidth="2" />
            <path d={FOOT_SIDE_TOE} fill={innerFill} />
            <path d={FOOT_SIDE_ARCH} fill={detailFill} />

            {/* Ground line */}
            <line
              x1="105" y1={SIDE_GROUND_Y}
              x2="625" y2={SIDE_GROUND_Y}
              stroke={T.border} strokeWidth="0.5" opacity="0.4"
            />

            {/* Total length baseline (subtle reference) */}
            <g opacity="0.35">
              <line
                x1={SIDE_HEEL_X} y1="742"
                x2={SIDE_TOE_X} y2="742"
                stroke={T.muted} strokeWidth="1" strokeLinecap="round"
              />
              <line x1={SIDE_HEEL_X} y1="738" x2={SIDE_HEEL_X} y2="746" stroke={T.muted} strokeWidth="1" />
              <line x1={SIDE_TOE_X} y1="738" x2={SIDE_TOE_X} y2="746" stroke={T.muted} strokeWidth="1" />
              <text
                x={Math.round((SIDE_HEEL_X + SIDE_TOE_X) / 2)} y="755"
                fill={T.muted} fontSize="8" fontFamily={T.font} textAnchor="middle"
              >total length</text>
            </g>

            {/* ── Arch length (A) — heel to ball of foot, horizontal ── */}
            {/* Average arch line (dashed, slightly below user line) */}
            <line
              x1={SIDE_HEEL_X} y1={SIDE_GROUND_Y + 5}
              x2={avgBallX} y2={SIDE_GROUND_Y + 5}
              stroke={avgLineMuted} strokeWidth="1.2"
              strokeDasharray="4 3" strokeLinecap="round"
              opacity="0.5"
            />
            {/* User arch line */}
            <g opacity="0.85">
              <line
                x1={SIDE_HEEL_X} y1={SIDE_GROUND_Y}
                x2={userBallX} y2={SIDE_GROUND_Y}
                stroke={T.blue} strokeWidth="2.5" strokeLinecap="round"
              />
              <circle cx={SIDE_HEEL_X} cy={SIDE_GROUND_Y} r="3" fill={T.blue} opacity="0.6" />
              <circle cx={userBallX} cy={SIDE_GROUND_Y} r="3.5" fill="none" stroke={T.blue} strokeWidth="1.5" />
              {/* Vertical tick up from ball */}
              <line
                x1={userBallX} y1={SIDE_GROUND_Y}
                x2={userBallX} y2={SIDE_GROUND_Y - 14}
                stroke={T.blue} strokeWidth="1" strokeDasharray="2 2" opacity="0.5"
              />
              <text
                x={Math.round((SIDE_HEEL_X + userBallX) / 2)} y={SIDE_GROUND_Y - 5}
                fill={T.blue} fontSize="14" fontWeight="700"
                fontFamily={T.font} textAnchor="middle"
              >A</text>
              <text
                x={Math.round((SIDE_HEEL_X + userBallX) / 2)} y={SIDE_GROUND_Y - 17}
                fill={T.blue} fontSize="9" fontFamily={T.font}
                textAnchor="middle" opacity="0.6"
              >arch length</text>
            </g>

            {/* ── Instep height (I) — vertical at x≈380 ── */}
            {/* Average instep line (dashed) */}
            <line
              x1={instepX + 6} y1={avgInstepTopYClamped}
              x2={instepX + 6} y2={SIDE_GROUND_Y}
              stroke={avgLineMuted} strokeWidth="1.2"
              strokeDasharray="4 3" strokeLinecap="round"
              opacity="0.45"
            />
            {/* User instep line */}
            <g opacity="0.85">
              <line
                x1={instepX} y1={userInstepTopYClamped}
                x2={instepX} y2={SIDE_GROUND_Y}
                stroke={T.green} strokeWidth="2" strokeLinecap="round"
              />
              <circle cx={instepX} cy={userInstepTopYClamped} r="3.5" fill="none" stroke={T.green} strokeWidth="1.5" />
              <circle cx={instepX} cy={SIDE_GROUND_Y} r="3.5" fill="none" stroke={T.green} strokeWidth="1.5" />
              <text
                x={instepX + 10} y={Math.round((userInstepTopYClamped + SIDE_GROUND_Y) / 2) - 6}
                fill={T.green} fontSize="14" fontWeight="700"
                fontFamily={T.font} textAnchor="start"
              >I</text>
              <text
                x={instepX + 10} y={Math.round((userInstepTopYClamped + SIDE_GROUND_Y) / 2) + 8}
                fill={T.green} fontSize="9" fontFamily={T.font}
                textAnchor="start" opacity="0.6"
              >instep</text>
            </g>

            {/* Landmark labels */}
            <text
              x={SIDE_HEEL_X} y="762"
              fill={T.muted} fontSize="9" fontFamily={T.font} textAnchor="middle"
            >heel</text>
            <text
              x={userBallX} y="762"
              fill={T.blue} fontSize="9" fontFamily={T.font}
              textAnchor="middle" opacity="0.8"
            >ball</text>
            <text
              x={SIDE_TOE_X} y="762"
              fill={T.muted} fontSize="9" fontFamily={T.font} textAnchor="middle"
            >toe</text>
          </svg>

          {/* Arch ratio info card */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "8px 14px",
            marginTop: "10px",
            background: `${T.blue}0d`,
            border: `1px solid ${T.blue}25`,
            borderRadius: T.radiusSm,
            maxWidth: "320px",
            width: "100%",
          }}>
            <div>
              <div style={{
                fontWeight: 700,
                fontSize: "16px",
                color: T.blue,
                fontVariantNumeric: "tabular-nums",
                fontFamily: T.mono,
              }}>
                {ar.toFixed(2)}
              </div>
              <div style={{ fontSize: "9px", color: T.muted, fontFamily: T.font }}>
                Arch ratio
              </div>
            </div>
            <div style={{ flex: 1, fontSize: "10px", color: T.muted, lineHeight: 1.4, fontFamily: T.font }}>
              Ball-to-heel ÷ total length. Avg{" "}
              <strong style={{ color: T.text }}>{AVG_ARCH_RATIO.toFixed(2)}</strong>
              {" — "}
              <span style={{ color: T.blue }}>{archCompare}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
