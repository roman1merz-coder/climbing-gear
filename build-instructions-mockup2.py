#!/usr/bin/env python3
import base64, os

# Image 1 (22:30:58) = person standing, foot raised = SIDE instruction
# Image 2 (22:30:55) = person bending, phone on ground = SOLE instruction
img_side_path = os.path.expanduser("~/Library/Containers/ru.keepcoder.Telegram/Data/tmp/IMAGE 2026-03-04 22:30:58.jpg")
img_sole_path = os.path.expanduser("~/Library/Containers/ru.keepcoder.Telegram/Data/tmp/IMAGE 2026-03-04 22:30:55.jpg")

with open(img_sole_path, 'rb') as f:
    sole_b64 = base64.b64encode(f.read()).decode()
with open(img_side_path, 'rb') as f:
    side_b64 = base64.b64encode(f.read()).decode()

html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Scanner Instructions Mockup</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{
  font-family: 'DM Sans', -apple-system, system-ui, sans-serif;
  background: #f5f0e8; color: #2c3227;
  min-height: 100vh;
}}
.instruction-screen {{
  display: flex; flex-direction: column; align-items: center;
  justify-content: center;
  min-height: 100vh; padding: 2rem 1.5rem; text-align: center;
}}
.instruction-screen h2 {{
  font-size: 1.3rem; font-weight: 800; letter-spacing: -0.3px;
  margin-bottom: 0.3rem;
}}
.step-badge {{
  display: inline-block;
  background: #c98a42; color: #fff;
  font-size: 0.75rem; font-weight: 700;
  padding: 4px 12px; border-radius: 20px;
  margin-bottom: 0.8rem; letter-spacing: 0.5px;
}}
.instruction-img {{
  width: 85%; max-width: 320px;
  border-radius: 16px;
  margin: 1rem 0;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
}}
.instruction-text {{
  color: #7a7462; font-size: 0.95rem;
  line-height: 1.5; max-width: 300px;
  margin-bottom: 1.5rem;
}}
.instruction-text strong {{ color: #2c3227; }}
.start-btn {{
  background: #c98a42; color: #fff; border: none;
  padding: 14px 44px; border-radius: 12px;
  font-size: 1.05rem; font-weight: 700; cursor: pointer;
  font-family: inherit;
}}
.divider {{
  width: 100%; height: 4px; background: #c98a42;
  margin: 0;
}}
</style>
</head>
<body>

<!-- SOLE INSTRUCTION -->
<div class="instruction-screen">
  <span class="step-badge">STEP 1 OF 2</span>
  <h2>Scan Your Sole</h2>
  <img class="instruction-img" src="data:image/jpeg;base64,{sole_b64}" alt="How to scan your sole">
  <p class="instruction-text">
    <strong>Lay your phone flat on the ground</strong>, screen up, and lift your foot above the camera. Spread your toes and keep your foot steady — the scanner will snap automatically. Aim to hold the foot in the same plane as the camera and aligned with the outline on the screen.
  </p>
  <button class="start-btn" onclick="this.closest('.instruction-screen').style.display='none'; document.getElementById('side-instruction').style.display='flex';">
    Start Sole Scan &rarr;
  </button>
</div>

<div class="divider"></div>

<!-- SIDE INSTRUCTION -->
<div class="instruction-screen" id="side-instruction" style="display:none;">
  <span class="step-badge">STEP 2 OF 2</span>
  <h2>Scan Your Side Profile</h2>
  <img class="instruction-img" src="data:image/jpeg;base64,{side_b64}" alt="How to scan your side profile">
  <p class="instruction-text">
    <strong>Lean your phone against a wall</strong> with the camera facing your foot. Stand naturally and position your foot so the side profile matches the outline on screen.
  </p>
  <button class="start-btn">
    Start Side Scan &rarr;
  </button>
</div>

</body>
</html>'''

with open('/tmp/cg-fix/instructions-mockup.html', 'w') as f:
    f.write(html)

with open('/tmp/cg-fix/instructions-mockup.html', 'w') as f:
    f.write(html)

print(f"Done — {len(html)} chars")
