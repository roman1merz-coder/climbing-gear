#!/usr/bin/env python3
"""
Build foot visualization from scratch.
Zero legacy code. Every line justified from data.

=== DATA CONTRACT ===
roman_real_contours.json:
  contour_top.contour_smooth: [[x,y], ...] normalized [0,1]
    x: 0=left edge (medial/big toe side), 1=right edge (lateral)
    y: 0=top (toes), 1=bottom (heel)
    Closed loop, ~250 points
  
  contour_side.contour_smooth: [[x,y], ...] normalized [0,1]
    x: 0=toe tip, 1=heel back  
    y: 0=top of ankle, 1=ground
    Goes: toe-upper → along dorsum → heel-top → heel-back → sole → toe-bottom
    Upper profile = pts 0..max_x_idx, Lower profile = pts max_x_idx..end
    ~250 points
  
  width_ratio:  0.358  (forefoot width / foot length)
  heel_ratio:   0.527  (heel width / forefoot width)  
  arch_ratio:   0.771  (heel-to-ball distance / total foot length)
  instep_ratio: 0.224  (instep height / total foot length)
  side_aspect:  0.5561 (side view height / side view width)

side_template_paths.json:
  FOOT_SIDE_OUTLINE: SVG path string (traced from user's reference PNG)
    Coordinates in absolute pixel space: x=[90..645], y=[428..730]
    toe_x=90, heel_x=645, ground_y=730, top_y=428.4
  FOOT_SIDE_ANKLE: SVG path (ankle bone detail) — USE AS SINGLE COMBINED OUTLINE

TOP template: Egyptian foot SVG path (hardcoded below)
  Coordinates: x=[657..917], y=[170..774]
  Toes at top (y≈170), heel at bottom (y≈774)
  Big toe at left-center, lateral toes at right

=== MEASUREMENT DEFINITIONS ===
W (width):     Horizontal line at the widest forefoot point of the RED contour
H (heel):      Horizontal line at the widest heel point of the RED contour  
A (arch):      From HEEL to BALL along ground. arch_ratio = heel_to_ball / total_length
I (instep):    Vertical from ground to dorsum. instep_ratio = instep_height / total_length
               Placed at x where the red contour height equals instep_height

=== AVERAGES ===
AVG_WR = 0.383, AVG_HR = 0.655, AVG_AR = 0.760, AVG_IR = 0.235
"""

import json

# ═══════════════════════════════════════════════════════════
# Load data
# ═══════════════════════════════════════════════════════════
with open('/home/user/workspace/roman_real_contours.json') as f:
    D = json.load(f)
with open('/home/user/workspace/side_template_paths.json') as f:
    TMPL = json.load(f)

# ═══════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════
AVG_WR, AVG_HR, AVG_AR, AVG_IR = 0.383, 0.655, 0.760, 0.235

# Top template (Egyptian foot) — path and bounding box
TOP_OUTER = "M705.555 173.171C728.345 169.976 743.955 182.522 750.755 203.497C760.895 186.157 781.28 184.489 796.085 197.455C802.77 203.307 803.395 212.2 803.345 220.596C808.83 216.353 814.4 214.436 821.425 214.984C827.865 215.439 833.845 218.492 837.99 223.442C845.82 232.705 845.565 243.317 844.71 254.598C847.825 253.009 850.435 251.575 854.005 251.436C876.77 250.543 880.285 271.279 881.425 287.68C882.345 287.234 883.83 286.506 884.81 286.17C889.255 284.637 894.14 285.03 898.285 287.256C913.095 295.258 916.435 327.812 914.165 342.256C911.335 360.205 912.885 366.809 915.15 384.466C916.635 395.791 916.735 407.253 915.45 418.602C913.175 438.84 905.715 463.472 900.58 483.357C895.095 504.85 889.795 526.39 884.67 547.97C880.66 564.88 876.79 580.705 873.76 597.85C871.38 610.8 869.69 623.87 868.695 636.995C866.32 670.57 867.73 700.265 850.92 731.24C849.275 734.255 847.465 737.175 845.5 739.995C834.265 756.28 816.905 767.305 797.385 770.55C775.94 774.075 751.335 770.155 733.83 756.8C688.29 722.065 698.84 662.01 698.465 612.865C698.23 569.2 693.54 525.67 684.475 482.954C681.43 468.607 677.995 453.635 674.1 439.501C668.025 418.161 661.21 397.191 659.14 375.02C656.685 348.716 665.395 324.276 666.845 298.422C667.505 286.694 662.83 271.752 661.05 259.619C657.435 234.941 664.55 209.205 678.76 188.839C685.26 179.777 694.585 174.732 705.555 173.171Z"

TOP_TOES = [
    "M747.805 253.36C749.975 258.689 749.75 300.809 740.295 299.282C734.185 284.755 742.555 267.206 747.805 253.36Z",
    "M793.745 265.916L794.23 266.424C796.055 273.242 796 286.879 794.57 293.773L794.06 293.798C791.94 290.653 793.26 270.941 793.745 265.916Z",
    "M835.255 295.388C837.17 299.653 836.705 311.337 835.69 316.111L835.01 315.436C833.6 310.997 834.615 300.078 835.255 295.388Z",
    "M872.815 330.171C874.455 333.459 873.415 342.115 872.585 345.79C870.345 341.918 872 334.498 872.815 330.171Z",
]

# Template bounding box
TMPL_TOP = {"xMin": 657, "xMax": 917, "yMin": 170, "yMax": 774}
TMPL_TOP["cx"] = (TMPL_TOP["xMin"] + TMPL_TOP["xMax"]) / 2
TMPL_TOP["w"] = TMPL_TOP["xMax"] - TMPL_TOP["xMin"]
TMPL_TOP["h"] = TMPL_TOP["yMax"] - TMPL_TOP["yMin"]

# Side template
SIDE_TOE_X = TMPL["toe_x"]       # 90
SIDE_HEEL_X = TMPL["heel_x"]     # 645
SIDE_GROUND_Y = TMPL["ground_y"] # 730
SIDE_TOP_Y = TMPL["top_y"]       # 428.4
SIDE_LEN = SIDE_HEEL_X - SIDE_TOE_X  # 555

# ═══════════════════════════════════════════════════════════
# Map contour points to display coordinates  
# ═══════════════════════════════════════════════════════════

# TOP: scale user contour to fit within the template bbox, 
# adjusted by width_ratio vs average
def map_top(pts, wr):
    ws = wr / AVG_WR  # width scale relative to average
    uw = TMPL_TOP["w"] * ws
    return [[TMPL_TOP["cx"] - uw/2 + nx * uw, TMPL_TOP["yMin"] + ny * TMPL_TOP["h"]] for nx, ny in pts]

# SIDE: map normalized [0,1] to template pixel space
def map_side(pts, side_aspect):
    real_h = SIDE_LEN * side_aspect
    top_y = SIDE_GROUND_Y - real_h
    return [[SIDE_TOE_X + nx * SIDE_LEN, top_y + ny * real_h] for nx, ny in pts]

# ═══════════════════════════════════════════════════════════
# Compute measurement positions from ACTUAL contour data
# ═══════════════════════════════════════════════════════════

def find_widest_y(mapped_pts, y_lo_frac, y_hi_frac):
    """Find the y-coordinate where the contour is widest, within a y-range fraction."""
    ys = [p[1] for p in mapped_pts]
    y_min, y_max = min(ys), max(ys)
    y_range = y_max - y_min
    y_lo = y_min + y_lo_frac * y_range
    y_hi = y_min + y_hi_frac * y_range
    
    best_w, best_y = 0, (y_lo + y_hi) / 2
    for step in range(200):
        y = y_lo + (y_hi - y_lo) * step / 200
        band = y_range / 150
        xs_in_band = [p[0] for p in mapped_pts if abs(p[1] - y) < band]
        if len(xs_in_band) >= 2:
            w = max(xs_in_band) - min(xs_in_band)
            if w > best_w:
                best_w = w
                best_y = y
    return round(best_y)

# Map contours
top_smooth = D["contour_top"]["contour_smooth"]
side_smooth = D["contour_side"]["contour_smooth"]
wr = D["width_ratio"]
hr = D["heel_ratio"]
ar = D["arch_ratio"]
ir = D["instep_ratio"]
side_aspect = D["side_aspect"]

top_mapped = map_top(top_smooth, wr)
side_mapped = map_side(side_smooth, side_aspect)

# Top view: find W and H y-positions
top_W_y = find_widest_y(top_mapped, 0.15, 0.50)  # forefoot
top_H_y = find_widest_y(top_mapped, 0.75, 0.95)  # heel

# Side view: arch from HEEL  
side_ball_x = round(SIDE_HEEL_X - ar * SIDE_LEN)
side_avg_ball_x = round(SIDE_HEEL_X - AVG_AR * SIDE_LEN)

# Side view: instep — find x where upper contour height = instep measurement
def find_instep_x(upper_pts_norm, instep_ratio, side_aspect):
    """Find normalized x where the upper profile y equals the instep height."""
    # instep_height in normalized space
    real_h = side_aspect  # because total width is normalized to 1
    instep_h_norm = instep_ratio  # instep_height / total_length
    # In our norm space: ground is at y_ground_norm, top is at y_top_norm
    # y_ground_norm corresponds to y=1.0 in the contour only if sole is at y=1
    # Actually: instep_top_px = GROUND_Y - instep_ratio * SIDE_LEN
    # In norm space: target_y_norm = (instep_top_px - top_y) / real_h_px
    real_h_px = SIDE_LEN * side_aspect
    top_y_px = SIDE_GROUND_Y - real_h_px
    instep_top_px = SIDE_GROUND_Y - instep_ratio * SIDE_LEN
    target_y_norm = (instep_top_px - top_y_px) / real_h_px
    
    # Walk upper profile and find where y crosses target
    for i in range(len(upper_pts_norm) - 1):
        x0, y0 = upper_pts_norm[i]
        x1, y1 = upper_pts_norm[i+1]
        if (y0 >= target_y_norm >= y1) or (y0 <= target_y_norm <= y1):
            if abs(y1 - y0) < 0.0001:
                continue
            t = (target_y_norm - y0) / (y1 - y0)
            return x0 + t * (x1 - x0)
    return 0.5  # fallback

# Get upper profile (before max x)
max_x_idx = max(range(len(side_smooth)), key=lambda i: side_smooth[i][0])
upper_norm = side_smooth[:max_x_idx + 1]

instep_x_norm = find_instep_x(upper_norm, ir, side_aspect)
avg_instep_x_norm = find_instep_x(upper_norm, AVG_IR, side_aspect)

instep_x_px = round(SIDE_TOE_X + instep_x_norm * SIDE_LEN)
avg_instep_x_px = round(SIDE_TOE_X + avg_instep_x_norm * SIDE_LEN)
instep_top_px = round(SIDE_GROUND_Y - ir * SIDE_LEN)
avg_instep_top_px = round(SIDE_GROUND_Y - AVG_IR * SIDE_LEN)

print(f"=== Computed Measurements ===")
print(f"Top W line at y={top_W_y}")
print(f"Top H line at y={top_H_y}")
print(f"Side ball at x={side_ball_x} (from heel)")
print(f"Side avg ball at x={side_avg_ball_x}")
print(f"Instep at x={instep_x_px}, top_y={instep_top_px}")
print(f"Avg instep at x={avg_instep_x_px}, top_y={avg_instep_top_px}")

# ═══════════════════════════════════════════════════════════
# Width/Heel measurement line endpoints
# ═══════════════════════════════════════════════════════════
# W line: user's actual width scaled, centered at template center
uWpx = (wr / AVG_WR) * TMPL_TOP["w"]
uWL = round(TMPL_TOP["cx"] - uWpx / 2)
uWR = round(TMPL_TOP["cx"] + uWpx / 2)
# Average W line
aWL = round(TMPL_TOP["cx"] - TMPL_TOP["w"] / 2)
aWR = round(TMPL_TOP["cx"] + TMPL_TOP["w"] / 2)
# H line
uHpx = hr * uWpx
uHL = round(TMPL_TOP["cx"] - uHpx / 2)
uHR = round(TMPL_TOP["cx"] + uHpx / 2)
aHpx = AVG_HR * TMPL_TOP["w"]
aHL = round(TMPL_TOP["cx"] - aHpx / 2)
aHR = round(TMPL_TOP["cx"] + aHpx / 2)

# ═══════════════════════════════════════════════════════════
# Flatten sole of side contour for cleaner rendering
# ═══════════════════════════════════════════════════════════
# Clamp bottom portion to y=1.0 so sole renders as flat line at ground
side_smooth_flat = [[x, min(y, 1.0) if y > 0.95 else y] for x, y in side_smooth]

# ═══════════════════════════════════════════════════════════
# Build the HTML
# ═══════════════════════════════════════════════════════════

# We'll embed all data and do Catmull-Rom smoothing in JS
# But first, prepare JSON payload
payload = {
    "top_smooth": top_smooth,
    "side_smooth": side_smooth_flat,
    "wr": wr, "hr": hr, "ar": ar, "ir": ir,
    "side_aspect": side_aspect,
    # Pre-computed measurement positions
    "top_W_y": top_W_y,
    "top_H_y": top_H_y,
    "uWL": uWL, "uWR": uWR, "aWL": aWL, "aWR": aWR,
    "uHL": uHL, "uHR": uHR, "aHL": aHL, "aHR": aHR,
    "side_ball_x": side_ball_x,
    "side_avg_ball_x": side_avg_ball_x,
    "instep_x": instep_x_px,
    "avg_instep_x": avg_instep_x_px,
    "instep_top": instep_top_px,
    "avg_instep_top": avg_instep_top_px,
    # Side template
    "side_outline": TMPL["FOOT_SIDE_OUTLINE"],
    "side_toe_x": SIDE_TOE_X,
    "side_heel_x": SIDE_HEEL_X,
    "side_ground_y": SIDE_GROUND_Y,
}

payload_json = json.dumps(payload)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Foot Viz — Clean Rebuild</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #f5f0e8; color: #2c3227; font-family: 'DM Sans', system-ui, sans-serif; padding: 24px; }}
  h1 {{ font-size: 18px; margin-bottom: 4px; text-align: center; }}
  .subtitle {{ font-size: 13px; color: #7a7462; text-align: center; margin-bottom: 20px; }}
  .panel-wrap {{
    background: #ffffff; border: 1.5px solid #d5cdbf; border-radius: 14px;
    overflow: hidden; max-width: 720px; margin: 0 auto;
  }}
  .panels {{ display: flex; }}
  .panel {{ padding: 24px 20px 16px; display: flex; flex-direction: column; align-items: center; }}
  .panel-left {{ flex: 0 0 45%; background: rgba(44,50,39,0.024); border-right: 1px solid #d5cdbf; }}
  .panel-right {{ flex: 1; background: rgba(44,50,39,0.024); }}
  .panel-label {{ font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #7a7462; align-self: flex-start; margin-bottom: 10px; }}
  .legend {{ display: flex; gap: 12px; margin-top: 10px; font-size: 10px; color: #7a7462; flex-wrap: wrap; justify-content: center; }}
  .legend-item {{ display: flex; align-items: center; gap: 5px; }}
  .legend-line {{ width: 16px; height: 3px; border-radius: 2px; display: inline-block; }}
  .legend-dash {{ width: 16px; height: 0; display: inline-block; border-top: 2px dashed #7a7462; }}
  .info-row {{ display: flex; gap: 8px; margin-top: 10px; max-width: 320px; width: 100%; }}
  .info-card {{ flex: 1; padding: 8px 12px; border-radius: 10px; }}
  .info-val {{ font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums; font-family: 'JetBrains Mono', monospace; }}
  .info-label {{ font-size: 9px; color: #7a7462; }}
  .info-note {{ font-size: 9px; margin-top: 2px; line-height: 1.3; }}
</style>
</head>
<body>

<h1>Your Foot Profile</h1>
<p class="subtitle">Based on your photos and EU 45</p>

<div class="panel-wrap">
  <div class="panels">
    <div class="panel panel-left">
      <div class="panel-label">Top View &mdash; Width &amp; Heel</div>
      <svg id="topSvg" viewBox="645 155 285 640" style="width:100%;max-width:200px;height:auto"></svg>
      <div class="legend">
        <span class="legend-item"><span class="legend-line" style="background:#c0392b"></span> Your foot</span>
        <span class="legend-item"><span class="legend-dash"></span> Average</span>
        <span class="legend-item">
          <span class="legend-line" style="background:#c98a42;width:12px"></span> W
          <span class="legend-line" style="background:#7c5cbf;width:12px;margin-left:6px"></span> H
        </span>
      </div>
    </div>
    <div class="panel panel-right">
      <div class="panel-label">Side Profile &mdash; Arch &amp; Instep</div>
      <svg id="sideSvg" viewBox="50 380 640 420" style="width:100%;max-width:340px;height:auto"></svg>
      <div class="info-row">
        <div class="info-card" style="background:rgba(74,127,181,0.05);border:1px solid rgba(74,127,181,0.15)">
          <div class="info-val" style="color:#4a7fb5">0.77</div>
          <div class="info-label">Arch ratio</div>
          <div class="info-note" style="color:#4a7fb5">heel-to-ball / length</div>
        </div>
        <div class="info-card" style="background:rgba(61,122,82,0.05);border:1px solid rgba(61,122,82,0.15)">
          <div class="info-val" style="color:#3d7a52">{ir}</div>
          <div class="info-label">Instep ratio</div>
          <div class="info-note" style="color:#3d7a52">Avg 0.235</div>
        </div>
      </div>
      <div class="legend" style="margin-top:8px">
        <span class="legend-item"><span class="legend-line" style="background:#c0392b"></span> Your foot</span>
        <span class="legend-item"><span class="legend-dash"></span> Average</span>
      </div>
    </div>
  </div>
</div>

<script>
const P = {payload_json};

const C = {{
  accent: "#c98a42", purple: "#7c5cbf", blue: "#4a7fb5", 
  green: "#3d7a52", red: "#c0392b", muted: "#7a7462", border: "#d5cdbf"
}};

// ═══ Catmull-Rom to smooth SVG path ═══
function smoothPath(pts) {{
  const n = pts.length;
  if (n < 4) return "";
  let d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
  for (let i = 0; i < n; i++) {{
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += " C" + cp1x.toFixed(1) + " " + cp1y.toFixed(1) + " " + cp2x.toFixed(1) + " " + cp2y.toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
  }}
  return d + " Z";
}}

// ═══ Map top contour to display coords ═══
const TMPL_CX = {TMPL_TOP["cx"]:.1f}, TMPL_W = {TMPL_TOP["w"]:.1f}, TMPL_YMIN = {TMPL_TOP["yMin"]}, TMPL_H = {TMPL_TOP["h"]};
const ws = P.wr / {AVG_WR};
const uw = TMPL_W * ws;
const topPts = P.top_smooth.map(([nx, ny]) => [TMPL_CX - uw/2 + nx * uw, TMPL_YMIN + ny * TMPL_H]);
const topPath = smoothPath(topPts);

// ═══ Map side contour to display coords ═══
const SL = {SIDE_LEN};
const realH = SL * P.side_aspect;
const sTopY = {SIDE_GROUND_Y} - realH;
const sidePts = P.side_smooth.map(([nx, ny]) => [{SIDE_TOE_X} + nx * SL, sTopY + ny * realH]);
const sidePath = smoothPath(sidePts);

// ═══ Build TOP SVG ═══
const TOP_OUTER = `{TOP_OUTER}`;
const TOP_TOES = {json.dumps(TOP_TOES)};

document.getElementById("topSvg").innerHTML = `
  <defs>
    <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${{C.muted}}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${{C.muted}}" stop-opacity="0.03"/>
    </linearGradient>
    <linearGradient id="tu" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${{C.red}}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${{C.red}}" stop-opacity="0.05"/>
    </linearGradient>
  </defs>

  <!-- Grey dashed average template -->
  <path d="${{TOP_OUTER}}" fill="url(#tg)" stroke="${{C.muted}}" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.5"/>
  ${{TOP_TOES.map(d => `<path d="${{d}}" fill="${{C.border}}60" opacity="0.3"/>`).join("")}}

  <!-- Red user contour -->
  <path d="${{topPath}}" fill="url(#tu)" stroke="${{C.red}}" stroke-width="2" stroke-linejoin="round"/>

  <!-- W measurement (forefoot width) -->
  <line x1="${{P.aWL}}" y1="${{P.top_W_y+3}}" x2="${{P.aWR}}" y2="${{P.top_W_y+3}}" stroke="${{C.muted}}" stroke-width="1.2" stroke-dasharray="5 3" stroke-linecap="round" opacity="0.45"/>
  <g opacity="0.9">
    <line x1="${{P.uWL}}" y1="${{P.top_W_y}}" x2="${{P.uWR}}" y2="${{P.top_W_y}}" stroke="${{C.accent}}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${{P.uWL}}" cy="${{P.top_W_y}}" r="3" fill="${{C.accent}}" opacity="0.7"/>
    <circle cx="${{P.uWR}}" cy="${{P.top_W_y}}" r="3.5" fill="none" stroke="${{C.accent}}" stroke-width="1.5"/>
    <text x="648" y="${{P.top_W_y+5}}" fill="${{C.accent}}" font-size="13" font-weight="700" font-family="'DM Sans'" text-anchor="end">W</text>
  </g>

  <!-- H measurement (heel width) -->
  <line x1="${{P.aHL}}" y1="${{P.top_H_y+3}}" x2="${{P.aHR}}" y2="${{P.top_H_y+3}}" stroke="${{C.muted}}" stroke-width="1.2" stroke-dasharray="5 3" stroke-linecap="round" opacity="0.45"/>
  <g opacity="0.9">
    <line x1="${{P.uHL}}" y1="${{P.top_H_y}}" x2="${{P.uHR}}" y2="${{P.top_H_y}}" stroke="${{C.purple}}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${{P.uHL}}" cy="${{P.top_H_y}}" r="3" fill="${{C.purple}}" opacity="0.7"/>
    <circle cx="${{P.uHR}}" cy="${{P.top_H_y}}" r="3.5" fill="none" stroke="${{C.purple}}" stroke-width="1.5"/>
    <text x="648" y="${{P.top_H_y+5}}" fill="${{C.purple}}" font-size="13" font-weight="700" font-family="'DM Sans'" text-anchor="end">H</text>
  </g>
`;

// ═══ Build SIDE SVG ═══
document.getElementById("sideSvg").innerHTML = `
  <defs>
    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${{C.muted}}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${{C.muted}}" stop-opacity="0.03"/>
    </linearGradient>
    <linearGradient id="su" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${{C.red}}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${{C.red}}" stop-opacity="0.04"/>
    </linearGradient>
  </defs>

  <!-- Grey dashed average template (single outline, no ankle detail) -->
  <path d="${{P.side_outline}}" fill="url(#sg)" stroke="${{C.muted}}" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.5"/>

  <!-- Red user contour -->
  <path d="${{sidePath}}" fill="url(#su)" stroke="${{C.red}}" stroke-width="2" stroke-linejoin="round"/>

  <!-- Ground line -->
  <line x1="55" y1="${{P.side_ground_y}}" x2="680" y2="${{P.side_ground_y}}" stroke="${{C.border}}" stroke-width="0.5" opacity="0.4"/>

  <!-- Total length indicator -->
  <g opacity="0.35">
    <line x1="${{P.side_toe_x}}" y1="755" x2="${{P.side_heel_x}}" y2="755" stroke="${{C.muted}}" stroke-width="1" stroke-linecap="round"/>
    <line x1="${{P.side_toe_x}}" y1="751" x2="${{P.side_toe_x}}" y2="759" stroke="${{C.muted}}" stroke-width="1"/>
    <line x1="${{P.side_heel_x}}" y1="751" x2="${{P.side_heel_x}}" y2="759" stroke="${{C.muted}}" stroke-width="1"/>
    <text x="${{Math.round((P.side_toe_x + P.side_heel_x) / 2)}}" y="768" fill="${{C.muted}}" font-size="8" font-family="'DM Sans'" text-anchor="middle">total length</text>
  </g>

  <!-- A: arch length (HEEL to BALL) -->
  <line x1="${{P.side_avg_ball_x}}" y1="${{P.side_ground_y+5}}" x2="${{P.side_heel_x}}" y2="${{P.side_ground_y+5}}" stroke="${{C.muted}}" stroke-width="1.2" stroke-dasharray="4 3" stroke-linecap="round" opacity="0.5"/>
  <g opacity="0.85">
    <line x1="${{P.side_ball_x}}" y1="${{P.side_ground_y}}" x2="${{P.side_heel_x}}" y2="${{P.side_ground_y}}" stroke="${{C.blue}}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${{P.side_ball_x}}" cy="${{P.side_ground_y}}" r="3.5" fill="none" stroke="${{C.blue}}" stroke-width="1.5"/>
    <circle cx="${{P.side_heel_x}}" cy="${{P.side_ground_y}}" r="3" fill="${{C.blue}}" opacity="0.6"/>
    <line x1="${{P.side_ball_x}}" y1="${{P.side_ground_y}}" x2="${{P.side_ball_x}}" y2="${{P.side_ground_y-14}}" stroke="${{C.blue}}" stroke-width="1" stroke-dasharray="2 2" opacity="0.5"/>
    <text x="${{Math.round((P.side_ball_x + P.side_heel_x) / 2)}}" y="${{P.side_ground_y-5}}" fill="${{C.blue}}" font-size="14" font-weight="700" font-family="'DM Sans'" text-anchor="middle">A</text>
    <text x="${{Math.round((P.side_ball_x + P.side_heel_x) / 2)}}" y="${{P.side_ground_y-17}}" fill="${{C.blue}}" font-size="9" font-family="'DM Sans'" text-anchor="middle" opacity="0.6">arch length</text>
  </g>

  <!-- I: instep height (vertical) -->
  <line x1="${{P.avg_instep_x+6}}" y1="${{P.avg_instep_top}}" x2="${{P.avg_instep_x+6}}" y2="${{P.side_ground_y}}" stroke="${{C.muted}}" stroke-width="1.2" stroke-dasharray="4 3" stroke-linecap="round" opacity="0.45"/>
  <g opacity="0.85">
    <line x1="${{P.instep_x}}" y1="${{P.instep_top}}" x2="${{P.instep_x}}" y2="${{P.side_ground_y}}" stroke="${{C.green}}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="${{P.instep_x}}" cy="${{P.instep_top}}" r="3.5" fill="none" stroke="${{C.green}}" stroke-width="1.5"/>
    <circle cx="${{P.instep_x}}" cy="${{P.side_ground_y}}" r="3.5" fill="none" stroke="${{C.green}}" stroke-width="1.5"/>
    <text x="${{P.instep_x-10}}" y="${{Math.round((P.instep_top + P.side_ground_y) / 2) - 6}}" fill="${{C.green}}" font-size="14" font-weight="700" font-family="'DM Sans'" text-anchor="end">I</text>
    <text x="${{P.instep_x-10}}" y="${{Math.round((P.instep_top + P.side_ground_y) / 2) + 8}}" fill="${{C.green}}" font-size="9" font-family="'DM Sans'" text-anchor="end" opacity="0.6">instep</text>
  </g>

  <!-- Labels -->
  <text x="${{P.side_toe_x}}" y="775" fill="${{C.muted}}" font-size="9" font-family="'DM Sans'" text-anchor="middle">toe</text>
  <text x="${{P.side_ball_x}}" y="775" fill="${{C.blue}}" font-size="9" font-family="'DM Sans'" text-anchor="middle" opacity="0.8">ball</text>
  <text x="${{P.side_heel_x}}" y="775" fill="${{C.muted}}" font-size="9" font-family="'DM Sans'" text-anchor="end">heel</text>
`;
</script>
</body>
</html>"""

# ═══════════════════════════════════════════════════════════
# Write output
# ═══════════════════════════════════════════════════════════
import os
out_dir = "/home/user/workspace/foot_viz_v2"
os.makedirs(out_dir, exist_ok=True)
with open(f"{out_dir}/index.html", "w") as f:
    f.write(html)

print(f"\nWritten to {out_dir}/index.html ({len(html)} bytes)")
print("Done.")
