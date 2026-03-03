import { T } from "./tokens.js";

// ═══════════════════════════════════════════════════════════════
// AVERAGE TEMPLATE SVG PATHS (Figma export — Egyptian toe shape)
// These represent the "average" foot that we overlay the user's
// measured contour against.
// ═══════════════════════════════════════════════════════════════
const FOOT_TOP_OUTER = "M705.555 173.171C728.345 169.976 743.955 182.522 750.755 203.497C760.895 186.157 781.28 184.489 796.085 197.455C802.77 203.307 803.395 212.2 803.345 220.596C808.83 216.353 814.4 214.436 821.425 214.984C827.865 215.439 833.845 218.492 837.99 223.442C845.82 232.705 845.565 243.317 844.71 254.598C847.825 253.009 850.435 251.575 854.005 251.436C876.77 250.543 880.285 271.279 881.425 287.68C882.345 287.234 883.83 286.506 884.81 286.17C889.255 284.637 894.14 285.03 898.285 287.256C913.095 295.258 916.435 327.812 914.165 342.256C911.335 360.205 912.885 366.809 915.15 384.466C916.635 395.791 916.735 407.253 915.45 418.602C913.175 438.84 905.715 463.472 900.58 483.357C895.095 504.85 889.795 526.39 884.67 547.97C880.66 564.88 876.79 580.705 873.76 597.85C871.38 610.8 869.69 623.87 868.695 636.995C866.32 670.57 867.73 700.265 850.92 731.24C849.275 734.255 847.465 737.175 845.5 739.995C834.265 756.28 816.905 767.305 797.385 770.55C775.94 774.075 751.335 770.155 733.83 756.8C688.29 722.065 698.84 662.01 698.465 612.865C698.23 569.2 693.54 525.67 684.475 482.954C681.43 468.607 677.995 453.635 674.1 439.501C668.025 418.161 661.21 397.191 659.14 375.02C656.685 348.716 665.395 324.276 666.845 298.422C667.505 286.694 662.83 271.752 661.05 259.619C657.435 234.941 664.55 209.205 678.76 188.839C685.26 179.777 694.585 174.732 705.555 173.171Z";
const FOOT_TOP_INNER = "M697.11 512.005C693.79 490.069 688.515 466.615 682.97 445.13C677.02 422.055 668.19 397.711 666.145 373.874C664.75 357.608 667.855 341.285 670.61 325.428C672.205 316.277 674.665 303.662 673.975 294.799C671.7 268.05 661.29 245.859 671.915 218.892C675.89 208.809 677.28 203.665 683.75 194.135C694.3 178.591 715.985 175.22 731.165 185.879C747.175 197.121 747.285 224.778 743.305 242.167C742.275 246.604 741.02 250.986 739.545 255.297C734.63 269.693 728.58 281.408 731.955 297.39C734.38 308.893 747.395 309.277 750.995 300.349C762.875 270.923 747.88 235.468 757.715 205.854C759.08 201.884 763.915 198.375 768.105 197.072C774.24 195.155 780.895 195.863 786.485 199.029C803.495 208.434 793.97 231.934 790.775 246.575C788.31 257.874 780.58 295.253 791.205 302.388C792.48 303.258 794.09 303.478 795.555 302.983C797.91 302.165 799.985 298.923 800.875 296.409C808.46 275.06 789.03 238.075 811.63 223.65C819.365 218.712 832.28 224.251 835.66 232.857C839.605 242.919 837.95 254.596 835.57 264.974C832.395 278.21 827.845 291.169 827.45 304.918C827.265 311.305 826.68 321.664 833.72 324.629C838.56 326.666 841.58 321.117 842.445 317.357C845.95 302.159 838.41 287.205 841.68 272.027C844.88 255.573 862.315 253.928 870.055 267.522C874.595 275.489 874.835 284.142 874.005 292.987C873.65 298.772 872.21 301.84 871.18 307.646C869.255 318.5 857.735 346.385 870.525 353.446C874.93 355.876 879.88 348.484 880.4 343.022C881.545 330.987 877.295 319.478 878.59 307.468C879.09 303.478 880.42 296.964 883.9 294.91C901.005 284.806 905.65 310.995 906.805 321.694C908.265 335.243 906.92 344.204 905.49 357.212C904.39 367.488 907.425 378.524 908.475 388.754C912.43 420.814 900.795 452.218 893.23 482.918C884.64 518.95 874.35 555.255 867.64 591.665C864.925 605.825 862.98 620.115 861.82 634.485C859.83 661.035 860.48 684.305 852.235 710.115C839.475 750.06 807.22 771.36 765.215 762.895C747.33 759.375 731.635 748.775 721.69 733.5C696.4 695.125 707.375 644.86 705.45 601.47C704.115 571.365 702.345 542.12 697.2 512.32Z";
const FOOT_TOP_TOES = [
  "M747.805 253.36C749.975 258.689 749.75 300.809 740.295 299.282C734.185 284.755 742.555 267.206 747.805 253.36Z",
  "M793.745 265.916L794.23 266.424C796.055 273.242 796 286.879 794.57 293.773L794.06 293.798C791.94 290.653 793.26 270.941 793.745 265.916Z",
  "M835.255 295.388C837.17 299.653 836.705 311.337 835.69 316.111L835.01 315.436C833.6 310.997 834.615 300.078 835.255 295.388Z",
  "M872.815 330.171C874.455 333.459 873.415 342.115 872.585 345.79C870.345 341.918 872 334.498 872.815 330.171Z",
];

const FOOT_SIDE_OUTER = "M482.106 710.725C418.681 733.79 342.858 692.625 277.77 692.01C231.455 691.575 185.605 709.76 141.055 690.535C126.973 684.335 117.964 674.065 112.62 659.83C100.497 627.53 113.651 602.035 124.277 572.41C128.248 561.605 131.321 550.49 133.465 539.18C142.51 491.473 139.386 452.336 134.523 404.437C131.63 376.866 128.011 349.376 123.671 321.996C123.259 319.315 121.364 310.177 121.862 308.201C122.932 306.734 122.851 306.683 124.555 305.848C127.658 306.132 128.791 308.849 129.301 311.678C130.809 320.043 131.725 328.652 132.988 337.05C137.226 363.979 140.571 391.041 143.018 418.192C146.734 458.665 148.474 491.173 142.043 531.575C140.048 544.535 136.962 557.305 132.82 569.75C126.306 588.9 116.613 607.22 115.364 627.43C112.99 665.85 132.34 685.92 169.237 690.975C198.451 694.975 218.507 689.505 246.511 686.45C261.54 684.77 276.696 684.545 291.768 685.78C350.195 690.52 421.652 723.365 476.613 705.33C473.776 703.485 469.498 701.645 468.702 698.755C469.375 696.995 468.827 697.69 470.459 696.64C474.382 696.45 483.925 703.505 487.753 705.725C495.726 710.345 502.315 711.695 511.465 712.065L513.93 711.815C518.265 711.425 524.935 709.63 527.105 705.5C530.89 698.31 524.675 692.965 521.105 688.155C512.845 676.78 501.08 673.92 488.115 670.89C484.871 670.135 475.946 667.925 474.912 664.575C475.414 663.485 475.652 663.08 476.916 662.695C478.724 662.15 507.65 670.8 511.065 672.325C511.955 670.465 511.54 663.525 511.495 661.01C507.96 660.12 500.605 658.325 498.876 655.07C499.188 653.425 498.779 654.07 500.185 653.095C504.35 652.525 515.445 656.735 520.665 658.175C523.6 658.88 533.49 661.65 536.03 663.51C545.69 670.575 556.585 679.05 565.625 686.915C568.26 689.205 567.835 696.19 567.5 699.46C574.245 699.615 582.11 698.55 585.86 692.435C588.825 687.6 587.915 683.295 583.43 680.185C572.735 672.77 561.51 666.1 550.7 658.85C548.895 657.64 545.4 656.765 543.36 655.91C537.41 653.485 515.325 652.865 513.43 646.51C515.43 644.375 524.625 646.64 527.58 647.42C532.185 648.635 542.55 651.195 547.035 653.035C551.2 654.75 558.41 659.415 562.075 662.5C566.89 666.545 576.49 675.765 582.38 677.295L584.35 677.695C588.45 677.555 591.47 674.88 593.695 671.54C596.25 667.7 593.56 662.505 590.605 659.445C579.25 647.685 563.805 637.595 549.06 631.375C544.8 629.495 540.22 628.375 535.655 627.22L524.88 624.275C524.88 624.275 524.245 621.125 525.18 619.895C526.865 617.695 530.485 619.675 533.235 620.38C536.54 621.23 546.575 624.545 550.305 625.725C556.29 627.615 567.2 632.43 572.465 636.255C577.19 639.69 583.16 644.755 587.47 648.815L588.6 649.965C594.37 655.795 603.025 665.92 610.015 668.545C614.52 670.235 619.555 663.335 618.685 658.95C617.62 653.625 610.315 647.055 606.725 643.155C597.82 633.455 587.435 624.385 576.705 617.225C571.3 613.62 558.96 607.64 551.035 607.19C546.62 606.94 535.475 607.865 531.965 606.09C530.825 605.52 530.285 604.19 530.705 603.005C531.96 599.38 539.4 601.045 541.855 601.71C549.895 604.095 556.945 607.63 564.335 611.58C572.86 616.14 581.12 621.63 588.325 628.25L589.235 629.075C596.735 636.375 607.06 649.11 616.575 652.245C620.17 653.435 627.03 649.905 627.92 646.275C631.855 630.205 598.665 603.32 589.955 595.835L589.2 595.17C585.445 591.735 575.915 584.52 571.73 581.715L570.81 581.14C561.115 575.455 530.91 564.76 528.785 556.71C527.69 552.56 530.785 548.44 534.175 546.8L534.38 546.7C541.935 543.555 563.295 558.21 569.785 563.29C579.3 570.74 587.835 579.14 596.155 587.85C599.745 591.6 603.33 596.22 607.455 599.34C610.16 601.41 619.095 602.55 621.735 599.83C625.165 596.29 619.925 587.73 617.84 584.805C610.48 574.475 600.385 563.215 590.39 555.025C580.225 546.695 566.435 540.345 554.28 534.645C545.045 530.31 535.37 526.905 525.565 524.06C486.525 512.68 439.86 517.635 399.81 516.555C348.42 515.17 272.05 506.235 224.36 484.875C211.68 479.295 200.48 472.27 192.43 460.655C189.705 456.7 187.655 452.345 186.34 447.73C181.325 430.05 190.32 407.87 204.33 396.315C211.195 390.63 220.525 388.17 229.4 386.51C262.3 380.375 285.715 397.665 316.77 399.465C320.72 399.4 325.92 399.165 329.69 398.505L333.815 397.44C337.185 396.2 340.15 393.88 344.53 391.665C351.35 388.195 359.305 385.115 367.595 383.78C387.455 380.59 402.245 382.425 418.985 392.7C440.005 405.595 444.275 425.835 449.065 448.575C455.59 479.56 466.3 510.55 483.035 537.79C495.805 558.59 515.465 579.73 540.745 587.445C539.87 580.57 539.225 573.665 538.815 566.74L538.685 564.305C536.785 527.355 538.12 491.84 540.91 454.655L540.765 454.7C539.615 453.82 540.125 453.385 540.995 452.855C543.585 449.655 544.255 443.33 545.535 439.235C549.24 427.33 554.66 416.005 561.625 405.665C576.705 383.085 597.13 365.01 619.045 350.275C636.515 338.52 655.005 328.155 674.31 319.46C693.545 310.77 713.165 303.555 732.93 296.98L731.975 297.19C738.565 294.71 752.11 291.015 756.285 285.34C761.53 278.195 756.545 263.215 753.445 256.075C749.15 246.175 732.68 228.745 722.005 225.91C715.885 224.285 709.37 225.18 703.585 227.845C695.795 231.445 689.815 238.155 684.465 244.95C676.845 254.62 668.89 271.83 667.34 283.745C665.395 298.665 664.385 313.735 663.85 328.825C663.5 338.665 662.69 349.025 660.165 358.635C649.92 397.575 604.6 418.05 571.11 434.545C551.475 444.185 533.12 450.83 541.45 479.265C543.68 486.875 545.91 509.715 545.235 518.495C544.065 533.645 541.475 548.7 539.815 563.8C537.245 587.17 536.715 610.555 540.205 633.965C543.195 653.96 548.065 672.72 561.23 688.99C563.3 691.54 565.635 693.88 568.185 695.97L567.5 699.46C574.245 699.615 582.11 698.55 585.86 692.435L586.065 691.72C588.85 687.38 587.835 683.175 583.43 680.185C572.735 672.77 561.51 666.1 550.7 658.85C548.895 657.64 545.4 656.765 543.36 655.91C537.41 653.485 515.325 652.865 513.43 646.51C515.43 644.375 524.625 646.64 527.58 647.42C532.185 648.635 542.55 651.195 547.035 653.035C551.2 654.75 558.41 659.415 562.075 662.5C566.89 666.545 576.49 675.765 582.38 677.295L584.35 677.695C588.45 677.555 591.47 674.88 593.695 671.54C596.25 667.7 593.56 662.505 590.605 659.445C579.25 647.685 563.805 637.595 549.06 631.375C544.8 629.495 540.22 628.375 535.655 627.22L524.88 624.275C524.88 624.275 524.245 621.125 525.18 619.895C526.865 617.695 530.485 619.675 533.235 620.38C536.54 621.23 546.575 624.545 550.305 625.725C556.29 627.615 567.2 632.43 572.465 636.255C577.19 639.69 583.16 644.755 587.47 648.815L588.6 649.965C594.37 655.795 603.025 665.92 610.015 668.545C614.52 670.235 619.555 663.335 618.685 658.95C617.62 653.625 610.315 647.055 606.725 643.155C597.82 633.455 587.435 624.385 576.705 617.225C571.3 613.62 558.96 607.64 551.035 607.19C546.62 606.94 535.475 607.865 531.965 606.09C530.825 605.52 530.285 604.19 530.705 603.005C531.96 599.38 539.4 601.045 541.855 601.71C549.895 604.095 556.945 607.63 564.335 611.58C572.86 616.14 581.12 621.63 588.325 628.25L589.235 629.075C596.735 636.375 607.06 649.11 616.575 652.245C620.17 653.435 627.03 649.905 627.92 646.275C631.855 630.205 598.665 603.32 589.955 595.835L589.2 595.17C585.445 591.735 575.915 584.52 571.73 581.715L570.81 581.14C561.115 575.455 530.91 564.76 528.785 556.71C527.69 552.56 530.785 548.44 534.175 546.8L534.38 546.7C541.935 543.555 563.295 558.21 569.785 563.29C579.3 570.74 587.835 579.14 596.155 587.85C599.745 591.6 603.33 596.22 607.455 599.34C610.16 601.41 619.095 602.55 621.735 599.83C625.165 596.29 619.925 587.73 617.84 584.805C610.48 574.475 600.385 563.215 590.39 555.025C580.225 546.695 566.435 540.345 554.28 534.645C545.045 530.31 535.37 526.905 525.565 524.06C486.525 512.68 439.86 517.635 399.81 516.555C348.42 515.17 272.05 506.235 224.36 484.875C211.68 479.295 200.48 472.27 192.43 460.655C189.705 456.7 187.655 452.345 186.34 447.73C181.325 430.05 190.32 407.87 204.33 396.315C211.195 390.63 220.525 388.17 229.4 386.51C262.3 380.375 285.715 397.665 316.77 399.465C320.72 399.4 325.92 399.165 329.69 398.505L333.815 397.44C337.185 396.2 340.15 393.88 344.53 391.665C351.35 388.195 359.305 385.115 367.595 383.78C387.455 380.59 402.245 382.425 418.985 392.7C440.005 405.595 444.275 425.835 449.065 448.575C455.59 479.56 466.3 510.55 483.035 537.79C495.805 558.59 515.465 579.73 540.745 587.445C539.87 580.57 539.225 573.665 538.815 566.74L538.685 564.305C536.785 527.355 538.12 491.84 540.91 454.655L540.765 454.7C539.615 453.82 540.125 453.385 540.995 452.855C543.585 449.655 544.255 443.33 545.535 439.235C549.24 427.33 554.66 416.005 561.625 405.665C576.705 383.085 597.13 365.01 619.045 350.275C636.515 338.52 655.005 328.155 674.31 319.46C693.545 310.77 713.165 303.555 732.93 296.98L731.975 297.19C738.565 294.71 752.11 291.015 756.285 285.34C761.53 278.195 756.545 263.215 753.445 256.075C749.15 246.175 732.68 228.745 722.005 225.91C715.885 224.285 709.37 225.18 703.585 227.845C695.795 231.445 689.815 238.155 684.465 244.95C676.845 254.62 668.89 271.83 667.34 283.745C665.395 298.665 664.385 313.735 663.85 328.825C663.5 338.665 662.69 349.025 660.165 358.635C649.92 397.575 604.6 418.05 571.11 434.545C551.475 444.185 533.12 450.83 541.45 479.265C543.68 486.875 545.91 509.715 545.235 518.495C544.065 533.645 541.475 548.7 539.815 563.8C537.245 587.17 536.715 610.555 540.205 633.965C543.195 653.96 548.065 672.72 561.23 688.99C563.3 691.54 565.635 693.88 568.185 695.97L567.5 699.46";
const FOOT_SIDE_TOE = "M511.495 661.01L512.445 661.385L519.62 663.34C523.8 664.55 528.52 665.585 532.425 667.555C535.77 669.235 559.77 688.375 560.975 690.735C562.1 692.94 562.67 695.785 561.835 698.175C560.81 701.125 557.66 702.99 554.955 704.16C547.915 707.215 540.695 706.33 533.58 704.2C534.075 695.66 531.985 692.205 526.405 685.665C522.35 680.915 517.415 676.525 512.12 673.19L511.065 672.325C511.955 670.465 511.54 663.525 511.495 661.01Z";
const FOOT_SIDE_ARCH = "M179.783 488.181C180.472 488.368 181.392 488.538 182.006 488.89C186.883 491.685 180.443 519.845 179.518 525.58C178.895 529.44 178.402 533.35 178.402 537.265C178.402 542.53 179.778 548.195 181.874 553.01C185.882 562.215 192.072 568.09 201.27 571.865C202.815 572.5 203.33 573.235 203.97 574.79C203.66 576.99 203.75 576.315 202.236 578.295C186.341 576.26 174.19 557.015 172.778 542.265C171.557 529.505 174.726 518.005 177.155 505.585C178.184 500.33 176.575 492.295 179.783 488.181Z";

// ═══════════════════════════════════════════════════════════════
// Population averages (from anthropometric literature)
// ═══════════════════════════════════════════════════════════════
const AVG_WIDTH_RATIO = 0.383;
const AVG_ARCH_RATIO = 0.760;
const AVG_INSTEP_RATIO = 0.235;
const AVG_HEEL_RATIO = 0.655;

// Top-view geometry (SVG coordinate space)
const TOP_BALL_Y = 483;
const TOP_BALL_MEDIAL_X = 684;
const TOP_BALL_LATERAL_X = 916;
const TOP_BALL_CENTER_X = 787;
const TOP_DEFAULT_WIDTH_SPAN = TOP_BALL_LATERAL_X - TOP_BALL_MEDIAL_X; // 232px
const TOP_HEEL_Y = 735;
const TOP_HEEL_MEDIAL_X = 715;
const TOP_HEEL_LATERAL_X = 855;

// Side-view geometry (SVG coordinate space)
const SIDE_HEEL_X = 131;
const SIDE_TOE_X = 609;
const SIDE_TOTAL_LEN = SIDE_TOE_X - SIDE_HEEL_X; // 478px
const SIDE_GROUND_Y = 730;

// ═══════════════════════════════════════════════════════════════
// HELPER: Convert user contour to SVG polyline
// The user contour comes as normalized [0,1] coords from the
// ML pipeline. We need to map it into the SVG coordinate space,
// aligning toe-to-heel with the template.
// ═══════════════════════════════════════════════════════════════
function contourToSvgPoints(contour, viewBox) {
  // contour: array of [x, y] in [0, 1] normalized space
  // viewBox: { x, y, w, h } — the SVG coordinate rect to map into
  if (!contour || contour.length === 0) return "";
  return contour
    .map(([nx, ny]) => {
      const sx = viewBox.x + nx * viewBox.w;
      const sy = viewBox.y + ny * viewBox.h;
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(" ");
}

// ═══════════════════════════════════════════════════════════════
// FOOT VISUALIZATION PANEL
// ═══════════════════════════════════════════════════════════════
export default function FootVizPanel({ result, isMobile }) {
  const wr = result.width_ratio || AVG_WIDTH_RATIO;
  const ar = result.arch_ratio || AVG_ARCH_RATIO;
  const ir = result.instep_ratio || AVG_INSTEP_RATIO;
  const hr = result.heel_ratio || AVG_HEEL_RATIO;

  // User contour data from ML pipeline (optional — falls back to ratio-only lines)
  const hasContour = result.contour_top && result.contour_side;
  const contourTop = result.contour_top; // { contour: [[x,y],...], stats: {...} }
  const contourSide = result.contour_side; // { contour: [[x,y],...], stats: { aspect_ratio, ... } }

  // ── Top view: width & heel lines ──────────────────────────────
  const userWidthPx = (wr / AVG_WIDTH_RATIO) * TOP_DEFAULT_WIDTH_SPAN;
  const userWidthLeft = Math.round(TOP_BALL_CENTER_X - userWidthPx / 2);
  const userWidthRight = Math.round(TOP_BALL_CENTER_X + userWidthPx / 2);

  const avgWidthPx = TOP_DEFAULT_WIDTH_SPAN;
  const avgWidthLeft = Math.round(TOP_BALL_CENTER_X - avgWidthPx / 2);
  const avgWidthRight = Math.round(TOP_BALL_CENTER_X + avgWidthPx / 2);

  // Heel: width derived from heel_ratio × ball_width (heel photo measurement,
  // mapped onto the top-view template position)
  const userHeelWidthPx = hr * userWidthPx;
  const userHeelLeft = Math.round(TOP_BALL_CENTER_X - userHeelWidthPx / 2);
  const userHeelRight = Math.round(TOP_BALL_CENTER_X + userHeelWidthPx / 2);

  const avgHeelPx = AVG_HEEL_RATIO * avgWidthPx;
  const avgHeelLeft = Math.round(TOP_BALL_CENTER_X - avgHeelPx / 2);
  const avgHeelRight = Math.round(TOP_BALL_CENTER_X + avgHeelPx / 2);

  // ── Side view: arch & instep ──────────────────────────────────
  const userBallX = Math.round(SIDE_HEEL_X + ar * SIDE_TOTAL_LEN);
  const avgBallX = Math.round(SIDE_HEEL_X + AVG_ARCH_RATIO * SIDE_TOTAL_LEN);

  const instepX = 380;
  const userInstepTopY = Math.round(SIDE_GROUND_Y - ir * SIDE_TOTAL_LEN);
  const avgInstepTopY = Math.round(SIDE_GROUND_Y - AVG_INSTEP_RATIO * SIDE_TOTAL_LEN);
  const userInstepTopYClamped = Math.max(300, Math.min(userInstepTopY, SIDE_GROUND_Y - 40));
  const avgInstepTopYClamped = Math.max(300, Math.min(avgInstepTopY, SIDE_GROUND_Y - 40));

  // ── Top view: user contour mapped to SVG space ────────────────
  // The template foot occupies roughly: x=[659, 916], y=[173, 771]
  // We map the user contour into the same bounding box, but scaled
  // by width_ratio to show the actual width difference.
  const TOP_TEMPLATE_X_MIN = 659;
  const TOP_TEMPLATE_X_MAX = 916;
  const TOP_TEMPLATE_Y_MIN = 173;
  const TOP_TEMPLATE_Y_MAX = 771;
  const TOP_TEMPLATE_W = TOP_TEMPLATE_X_MAX - TOP_TEMPLATE_X_MIN; // 257px
  const TOP_TEMPLATE_H = TOP_TEMPLATE_Y_MAX - TOP_TEMPLATE_Y_MIN; // 598px
  const TOP_TEMPLATE_CX = (TOP_TEMPLATE_X_MIN + TOP_TEMPLATE_X_MAX) / 2; // 787.5

  // Scale factor: user width / template width
  const topWidthScale = (wr / AVG_WIDTH_RATIO);
  const topContourW = TOP_TEMPLATE_W * topWidthScale;
  const topContourViewBox = {
    x: TOP_TEMPLATE_CX - topContourW / 2,
    y: TOP_TEMPLATE_Y_MIN,
    w: topContourW,
    h: TOP_TEMPLATE_H,
  };

  // ── Side view: user contour mapped to SVG space ───────────────
  // Side template spans roughly: x=[112, 627], y=[286, 730]
  const SIDE_TEMPLATE_X_MIN = 112;
  const SIDE_TEMPLATE_X_MAX = 627;
  const SIDE_TEMPLATE_Y_MIN = 286;
  const SIDE_TEMPLATE_Y_MAX = 730;
  const SIDE_TEMPLATE_W = SIDE_TEMPLATE_X_MAX - SIDE_TEMPLATE_X_MIN; // 515px
  const SIDE_TEMPLATE_H = SIDE_TEMPLATE_Y_MAX - SIDE_TEMPLATE_Y_MIN; // 444px

  // For the side view, map the contour to the full template width.
  // The contour's y-axis uses the REAL aspect ratio (from extraction),
  // anchored at the ground line. The `side_aspect` field encodes how
  // tall the contour is relative to its width.
  const sideAspect = contourSide?.stats?.aspect_ratio || 0.556;
  const sideRealH = SIDE_TEMPLATE_W * sideAspect;
  const sideContourViewBox = {
    x: SIDE_TEMPLATE_X_MIN,
    y: SIDE_GROUND_Y - sideRealH,
    w: SIDE_TEMPLATE_W,
    h: sideRealH,
  };

  // Arch comparison text
  const archDiff = ar - AVG_ARCH_RATIO;
  let archCompare = "flex point alignment is average";
  if (archDiff < -0.03) archCompare = "short arch — ball is notably further forward (long toes)";
  else if (archDiff < -0.01) archCompare = "ball is slightly further forward than average";
  else if (archDiff > 0.03) archCompare = "long arch — ball is notably further back (short toes)";
  else if (archDiff > 0.01) archCompare = "ball is slightly further back than average";

  // Shared styles
  const panelBg = `${T.text}06`;
  const avgStroke = T.border;
  const innerFill = T.bg;
  const detailFill = `${T.border}60`;
  const avgLineMuted = T.muted;
  const userContourColor = T.red; // Red for user's measured contour

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
          <div style={{
            fontSize: "9px", fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.8px", color: T.muted, fontFamily: T.font,
            alignSelf: "flex-start", marginBottom: "10px",
          }}>Top View — Width &amp; Heel</div>

          <svg
            viewBox="645 155 285 640"
            style={{ width: "100%", maxWidth: "200px", height: "auto" }}
          >
            <defs>
              <linearGradient id="fvTopGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.muted} stopOpacity="0.08" />
                <stop offset="100%" stopColor={T.muted} stopOpacity="0.03" />
              </linearGradient>
              <linearGradient id="fvTopUserGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={userContourColor} stopOpacity="0.12" />
                <stop offset="100%" stopColor={userContourColor} stopOpacity="0.04" />
              </linearGradient>
            </defs>

            {/* Average template foot (gray dashed outline) */}
            <path d={FOOT_TOP_OUTER} fill="url(#fvTopGrad)"
              stroke={T.muted} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" />
            <path d={FOOT_TOP_INNER} fill={innerFill} opacity="0.3" />
            {FOOT_TOP_TOES.map((d, i) => (
              <path key={i} d={d} fill={detailFill} opacity="0.3" />
            ))}

            {/* User's measured contour (red solid) */}
            {hasContour && contourTop?.contour && (
              <polygon
                points={contourToSvgPoints(contourTop.contour, topContourViewBox)}
                fill="url(#fvTopUserGrad)"
                stroke={userContourColor}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            )}

            {/* ── W: Width line at ball of foot ── */}
            {/* Average (dashed) */}
            <line
              x1={avgWidthLeft} y1={TOP_BALL_Y + 3}
              x2={avgWidthRight} y2={TOP_BALL_Y + 3}
              stroke={avgLineMuted} strokeWidth="1.2"
              strokeDasharray="5 3" strokeLinecap="round" opacity="0.45"
            />
            {/* User (solid) */}
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

            {/* ── H: Heel width line ── */}
            {/* Average (dashed) */}
            <line
              x1={avgHeelLeft} y1={TOP_HEEL_Y + 3}
              x2={avgHeelRight} y2={TOP_HEEL_Y + 3}
              stroke={avgLineMuted} strokeWidth="1.2"
              strokeDasharray="5 3" strokeLinecap="round" opacity="0.45"
            />
            {/* User (solid) */}
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
            display: "flex", gap: "12px", marginTop: "10px",
            fontSize: "10px", color: T.muted, fontFamily: T.font,
            flexWrap: "wrap", justifyContent: "center",
          }}>
            {hasContour && (
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{
                  width: "16px", height: "3px", borderRadius: "2px",
                  background: userContourColor, display: "inline-block",
                }} />
                Your foot
              </span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{
                width: "16px", height: "0px", borderRadius: "2px",
                display: "inline-block",
                borderTop: `2px dashed ${T.muted}`,
              }} />
              Average
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{
                width: "12px", height: "3px", borderRadius: "2px",
                background: T.accent, display: "inline-block",
              }} />
              W
              <span style={{
                width: "12px", height: "3px", borderRadius: "2px",
                background: T.purple, display: "inline-block", marginLeft: "6px",
              }} />
              H
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
          <div style={{
            fontSize: "9px", fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.8px", color: T.muted, fontFamily: T.font,
            alignSelf: "flex-start", marginBottom: "10px",
          }}>Side Profile — Arch &amp; Instep</div>

          <svg
            viewBox="90 290 555 490"
            style={{ width: "100%", maxWidth: "320px", height: "auto" }}
          >
            <defs>
              <linearGradient id="fvSideGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.muted} stopOpacity="0.08" />
                <stop offset="100%" stopColor={T.muted} stopOpacity="0.03" />
              </linearGradient>
              <linearGradient id="fvSideUserGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={userContourColor} stopOpacity="0.10" />
                <stop offset="100%" stopColor={userContourColor} stopOpacity="0.03" />
              </linearGradient>
            </defs>

            {/* Average template foot (gray dashed outline) */}
            <path d={FOOT_SIDE_OUTER} fill="url(#fvSideGrad)"
              stroke={T.muted} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" />
            <path d={FOOT_SIDE_TOE} fill={innerFill} opacity="0.3" />
            <path d={FOOT_SIDE_ARCH} fill={detailFill} opacity="0.3" />

            {/* User's measured contour (red solid) */}
            {hasContour && contourSide?.contour && (
              <polygon
                points={contourToSvgPoints(contourSide.contour, sideContourViewBox)}
                fill="url(#fvSideUserGrad)"
                stroke={userContourColor}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            )}

            {/* Ground line */}
            <line
              x1="105" y1={SIDE_GROUND_Y}
              x2="625" y2={SIDE_GROUND_Y}
              stroke={T.border} strokeWidth="0.5" opacity="0.4"
            />

            {/* Total length baseline */}
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

            {/* ── A: Arch length (heel to ball, horizontal) ── */}
            {/* Average (dashed) */}
            <line
              x1={SIDE_HEEL_X} y1={SIDE_GROUND_Y + 5}
              x2={avgBallX} y2={SIDE_GROUND_Y + 5}
              stroke={avgLineMuted} strokeWidth="1.2"
              strokeDasharray="4 3" strokeLinecap="round" opacity="0.5"
            />
            {/* User */}
            <g opacity="0.85">
              <line
                x1={SIDE_HEEL_X} y1={SIDE_GROUND_Y}
                x2={userBallX} y2={SIDE_GROUND_Y}
                stroke={T.blue} strokeWidth="2.5" strokeLinecap="round"
              />
              <circle cx={SIDE_HEEL_X} cy={SIDE_GROUND_Y} r="3" fill={T.blue} opacity="0.6" />
              <circle cx={userBallX} cy={SIDE_GROUND_Y} r="3.5" fill="none" stroke={T.blue} strokeWidth="1.5" />
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

            {/* ── I: Instep height (vertical) ── */}
            {/* Average (dashed) */}
            <line
              x1={instepX + 6} y1={avgInstepTopYClamped}
              x2={instepX + 6} y2={SIDE_GROUND_Y}
              stroke={avgLineMuted} strokeWidth="1.2"
              strokeDasharray="4 3" strokeLinecap="round" opacity="0.45"
            />
            {/* User */}
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

          {/* Arch + Instep info cards */}
          <div style={{
            display: "flex", gap: "8px", marginTop: "10px",
            maxWidth: "320px", width: "100%",
          }}>
            {/* Arch ratio card */}
            <div style={{
              flex: 1, padding: "8px 12px",
              background: `${T.blue}0d`,
              border: `1px solid ${T.blue}25`,
              borderRadius: T.radiusSm,
            }}>
              <div style={{
                fontWeight: 700, fontSize: "16px", color: T.blue,
                fontVariantNumeric: "tabular-nums", fontFamily: T.mono,
              }}>{ar.toFixed(2)}</div>
              <div style={{ fontSize: "9px", color: T.muted, fontFamily: T.font }}>
                Arch ratio
              </div>
              <div style={{ fontSize: "9px", color: T.blue, marginTop: "2px", lineHeight: 1.3, fontFamily: T.font }}>
                {archCompare}
              </div>
            </div>

            {/* Instep ratio card */}
            <div style={{
              flex: 1, padding: "8px 12px",
              background: `${T.green}0d`,
              border: `1px solid ${T.green}25`,
              borderRadius: T.radiusSm,
            }}>
              <div style={{
                fontWeight: 700, fontSize: "16px", color: T.green,
                fontVariantNumeric: "tabular-nums", fontFamily: T.mono,
              }}>{ir.toFixed(3)}</div>
              <div style={{ fontSize: "9px", color: T.muted, fontFamily: T.font }}>
                Instep ratio
              </div>
              <div style={{ fontSize: "9px", color: T.green, marginTop: "2px", lineHeight: 1.3, fontFamily: T.font }}>
                Avg {AVG_INSTEP_RATIO.toFixed(3)}
              </div>
            </div>
          </div>

          {/* Side legend */}
          {hasContour && (
            <div style={{
              display: "flex", gap: "12px", marginTop: "8px",
              fontSize: "10px", color: T.muted, fontFamily: T.font,
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{
                  width: "16px", height: "3px", borderRadius: "2px",
                  background: userContourColor, display: "inline-block",
                }} />
                Your foot
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{
                  width: "16px", height: "0px",
                  display: "inline-block",
                  borderTop: `2px dashed ${T.muted}`,
                }} />
                Average
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
