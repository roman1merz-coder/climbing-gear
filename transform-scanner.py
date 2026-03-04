#!/usr/bin/env python3
"""Transform scanner-test.html to add instruction + review screens."""

import re

with open('/tmp/cg-fix/public/scanner-test.html', 'r') as f:
    html = f.read()

# ── 1. Add new CSS before </style> ──
new_css = """
/* ── Instruction Screens ── */
.instruction-screen {
  display: none; position: relative;
  width: 100vw; min-height: 100vh; min-height: 100dvh;
  background: #f5f0e8; overflow-y: auto;
  padding: 2rem 1.5rem; padding-bottom: max(2rem, env(safe-area-inset-bottom));
  text-align: center;
}
.instruction-screen h2 { font-size: 1.4rem; font-weight: 800; margin-bottom: 0.3rem; }
.step-badge {
  display: inline-block; background: #c98a42; color: #fff;
  font-size: 0.75rem; font-weight: 700; padding: 4px 14px;
  border-radius: 20px; margin-bottom: 1rem; letter-spacing: 0.5px;
}
.instruction-img {
  width: 85%; max-width: 340px; border-radius: 16px;
  margin-bottom: 1.2rem; border: 1px solid #d5cdbf;
}
.instruction-text {
  max-width: 340px; margin: 0 auto 1.5rem;
  font-size: 0.95rem; color: #7a7462; line-height: 1.6; text-align: left;
}
.instruction-text strong { color: #2c3227; }

/* ── Review Screens ── */
.review-screen {
  display: none; position: relative;
  width: 100vw; min-height: 100vh; min-height: 100dvh;
  background: #f5f0e8; overflow-y: auto;
  padding: 1.5rem; padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
  text-align: center;
}
.review-screen h2 { font-size: 1.3rem; font-weight: 800; margin-bottom: 1rem; }
.review-img-wrap {
  width: 70%; max-width: 300px; margin: 0 auto 1.2rem;
  border-radius: 14px; overflow: hidden; border: 1px solid #d5cdbf;
  background: #fff;
}
.review-img { width: 100%; display: block; }
.checklist {
  max-width: 340px; margin: 0 auto 1.5rem;
  text-align: left; list-style: none; padding: 0;
}
.check-item {
  display: flex; align-items: flex-start; gap: 10px;
  margin-bottom: 10px; font-size: 0.92rem; color: #5a5347; line-height: 1.4;
}
.check-icon { color: #3d7a52; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
.btn-row-review { display: flex; gap: 10px; max-width: 360px; margin: 0 auto; width: 100%; }
.btn-secondary {
  flex: 1; background: #fff; color: #2c3227; border: 1px solid #d5cdbf;
  padding: 14px; border-radius: 10px; font-size: 1rem; font-weight: 600;
  cursor: pointer; font-family: inherit;
}
.btn-primary {
  flex: 1; background: #c98a42; color: #fff; border: none;
  padding: 14px; border-radius: 10px; font-size: 1rem; font-weight: 600;
  cursor: pointer; font-family: inherit;
}
"""

html = html.replace('</style>', new_css + '</style>')

# ── 2. Add instruction + review screen HTML before <script> ──
new_screens = """
<!-- ── Sole Instruction Screen ── -->
<div id="sole-instruction" class="instruction-screen">
  <span class="step-badge">STEP 1 OF 2</span>
  <h2>Sole Photo</h2>
  <img class="instruction-img" src="https://wsjsuhvpgupalwgcjatp.supabase.co/storage/v1/object/public/foot-scans/scans/instruction-sole.jpg" alt="How to take sole photo" />
  <p class="instruction-text">
    <strong>Lay your phone flat on the ground</strong>, screen up, and lift your foot above the camera.
    Spread your toes and keep your foot steady &mdash; the scanner will snap automatically.
    Aim to hold the foot in the same plane as the camera and aligned with the outline on the screen.
  </p>
  <button class="btn-primary" id="start-sole-scan" style="max-width:360px;width:100%">Start Sole Scan</button>
</div>

<!-- ── Sole Review Screen ── -->
<div id="sole-review" class="review-screen">
  <h2>Check Your Sole Photo</h2>
  <div class="review-img-wrap">
    <img class="review-img" id="review-sole-img" />
  </div>
  <ul class="checklist">
    <li class="check-item"><span class="check-icon">&#10003;</span> Entire sole is visible, no toes cut off</li>
    <li class="check-item"><span class="check-icon">&#10003;</span> Foot is roughly centered and fills the frame</li>
    <li class="check-item"><span class="check-icon">&#10003;</span> Foot is flat and not twisted or angled</li>
    <li class="check-item"><span class="check-icon">&#10003;</span> Image is sharp, not blurry</li>
  </ul>
  <div class="btn-row-review">
    <button class="btn-secondary" id="retake-sole-review">Retake</button>
    <button class="btn-primary" id="approve-sole">Looks Good</button>
  </div>
</div>

<!-- ── Side Instruction Screen ── -->
<div id="side-instruction" class="instruction-screen">
  <span class="step-badge">STEP 2 OF 2</span>
  <h2>Side Profile Photo</h2>
  <img class="instruction-img" src="https://wsjsuhvpgupalwgcjatp.supabase.co/storage/v1/object/public/foot-scans/scans/instruction-side.jpg" alt="How to take side photo" />
  <p class="instruction-text">
    <strong>Hold your phone horizontally on the ground</strong>, screen facing the inside of your right foot
    so the camera captures your side profile. Keep your foot flat on the ground and stay still,
    it will snap automatically. Try to align your foot with the outline on the screen.
  </p>
  <button class="btn-primary" id="start-side-scan" style="max-width:360px;width:100%">Start Side Scan</button>
</div>

<!-- ── Side Review Screen ── -->
<div id="side-review" class="review-screen">
  <h2>Check Your Side Photo</h2>
  <div class="review-img-wrap">
    <img class="review-img" id="review-side-img" />
  </div>
  <ul class="checklist">
    <li class="check-item"><span class="check-icon">&#10003;</span> Full side profile visible from heel to toes</li>
    <li class="check-item"><span class="check-icon">&#10003;</span> Arch shape is clearly defined</li>
    <li class="check-item"><span class="check-icon">&#10003;</span> Foot is flat and not twisted or angled</li>
    <li class="check-item"><span class="check-icon">&#10003;</span> Image is sharp, not blurry</li>
  </ul>
  <div class="btn-row-review">
    <button class="btn-secondary" id="retake-side-review">Retake</button>
    <button class="btn-primary" id="approve-side">Save &amp; Upload</button>
  </div>
  <div id="save-status-side" style="text-align:center;font-size:0.85rem;color:#3d7a52;margin-top:8px;min-height:1.2em"></div>
</div>

"""

html = html.replace('<script>', new_screens + '<script>')

# ── 3. Update showScreen to include new screens ──
old_show = """function showScreen(id) {
  ['start-screen','scanner','transition-screen','result-screen'].forEach(s => {
    document.getElementById(s).style.display = 'none';
  });"""

new_show = """function showScreen(id) {
  ['start-screen','scanner','transition-screen','result-screen','sole-instruction','sole-review','side-instruction','side-review'].forEach(s => {
    document.getElementById(s).style.display = 'none';
  });"""

html = html.replace(old_show, new_show)

# ── 4. Update start-btn to go to sole-instruction instead of directly starting scanner ──
old_start = "document.getElementById('start-btn').addEventListener('click', () => startScanner('sole'));"
new_start = "document.getElementById('start-btn').addEventListener('click', () => showScreen('sole-instruction'));"
html = html.replace(old_start, new_start)

# ── 5. Add new event listeners after existing ones ──
old_listeners_end = "document.getElementById('save-btn').addEventListener('click', saveResult);"
new_listeners = """document.getElementById('save-btn').addEventListener('click', saveResult);

/* New instruction + review screen listeners */
document.getElementById('start-sole-scan').addEventListener('click', () => startScanner('sole'));
document.getElementById('retake-sole-review').addEventListener('click', () => showScreen('sole-instruction'));
document.getElementById('approve-sole').addEventListener('click', () => showScreen('side-instruction'));
document.getElementById('start-side-scan').addEventListener('click', () => startScanner('side'));
document.getElementById('retake-side-review').addEventListener('click', () => showScreen('side-instruction'));
document.getElementById('approve-side').addEventListener('click', saveFromReview);"""

html = html.replace(old_listeners_end, new_listeners)

# ── 6. Update capture() to route to review screens instead of transition/result ──
old_capture_timeout = """setTimeout(() => {
    if (currentStep === 'sole') {
      soleDataUrl = dataUrl;
      document.getElementById('sole-preview').src = soleDataUrl;
      showScreen('transition-screen');
    } else {
      sideDataUrl = dataUrl;
      document.getElementById('result-sole-img').src = soleDataUrl;
      document.getElementById('result-side-img').src = sideDataUrl;
      document.getElementById('save-status').textContent = '';
      document.getElementById('save-btn').disabled = false;
      document.getElementById('save-btn').textContent = 'Save & Upload';
      showScreen('result-screen');
    }
  }, 200);"""

new_capture_timeout = """setTimeout(() => {
    if (currentStep === 'sole') {
      soleDataUrl = dataUrl;
      document.getElementById('review-sole-img').src = soleDataUrl;
      showScreen('sole-review');
    } else {
      sideDataUrl = dataUrl;
      document.getElementById('review-side-img').src = sideDataUrl;
      showScreen('side-review');
    }
  }, 200);"""

html = html.replace(old_capture_timeout, new_capture_timeout)

# ── 7. Add saveFromReview function before retakeAll ──
save_from_review = """
async function saveFromReview() {
  if (!soleDataUrl || !sideDataUrl) return;
  const btn = document.getElementById('approve-side');
  const status = document.getElementById('save-status-side');
  btn.disabled = true; btn.textContent = 'Uploading…'; status.textContent = '';

  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const id = 'scan-' + ts;

    const soleBlob = await (await fetch(soleDataUrl)).blob();
    const sideBlob = await (await fetch(sideDataUrl)).blob();

    const headers = {
      'Authorization': `Bearer ${SB_KEY}`,
      'apikey': SB_KEY,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    };

    const [upSole, upSide] = await Promise.all([
      fetch(`${SB_URL}/storage/v1/object/foot-scans/scans/${id}-sole.jpg`, {
        method: 'POST', headers, body: soleBlob,
      }),
      fetch(`${SB_URL}/storage/v1/object/foot-scans/scans/${id}-side.jpg`, {
        method: 'POST', headers, body: sideBlob,
      }),
    ]);

    if (upSole.ok && upSide.ok) {
      const soleUrl = `${SB_URL}/storage/v1/object/public/foot-scans/scans/${id}-sole.jpg`;
      const sideUrl = `${SB_URL}/storage/v1/object/public/foot-scans/scans/${id}-side.jpg`;
      status.innerHTML = `Uploaded ✓ <a href="${soleUrl}" target="_blank" style="color:#c98a42;font-weight:600">Sole</a> · <a href="${sideUrl}" target="_blank" style="color:#c98a42;font-weight:600">Side</a>`;
      btn.textContent = 'Saved ✓';
    } else {
      throw new Error('Upload failed');
    }
  } catch(e) {
    console.error(e);
    status.textContent = 'Upload failed — downloading locally…';
    const a1 = document.createElement('a');
    a1.href = soleDataUrl; a1.download = 'foot-scan-sole.jpg'; a1.click();
    const a2 = document.createElement('a');
    a2.href = sideDataUrl; a2.download = 'foot-scan-side.jpg';
    setTimeout(() => a2.click(), 500);
    btn.textContent = 'Downloaded';
    status.textContent = 'Saved to device';
  }
}

"""

html = html.replace('function retakeAll()', save_from_review + 'function retakeAll()')

with open('/tmp/cg-fix/public/scanner-test.html', 'w') as f:
    f.write(html)

print("✅ scanner-test.html transformed successfully!")
