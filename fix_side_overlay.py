import re

# Read the ORIGINAL correct base64
with open('/Users/leonic_roman/Library/Mobile Documents/com~apple~CloudDocs/climbing-gear/graphics/side_overlay_b64.txt', 'r') as f:
    original_b64 = f.read().strip()
print(f"Original overlay base64: {len(original_b64)} chars")

# Read the HTML
with open('/tmp/cg-fix/public/scanner-test.html', 'r') as f:
    html = f.read()

# 1. Replace whatever base64 is in there with the original
pattern = r'(src="data:image/png;base64,)([A-Za-z0-9+/=\s]+)(" />)'
match = re.search(pattern, html)
if match:
    html = html[:match.start(2)] + original_b64 + html[match.end(2):]
    print(f"Restored original base64")
else:
    print("ERROR!")
    exit(1)

# 2. Fix the CSS for #side-guide-img
# Current (broken traced version): width: 100%; height: 100%; object-fit: fill;
# New: rotate 90deg CCW, scale up to fill viewport
# The PNG is 400x400 (square). We want it to fill most of the screen.
# rotate(-90deg) turns horizontal foot into vertical.
# Then scale it up so it's large enough.

old_css = """#side-guide-img {
  width: 100%; height: 100%;
  object-fit: fill;
  transition: filter 0.3s, opacity 0.3s;
  opacity: 0.8;
}"""

new_css = """#side-guide-img {
  width: 130vh; height: 130vh;
  max-width: none; max-height: none;
  object-fit: contain;
  transform: rotate(-90deg);
  transition: filter 0.3s, opacity 0.3s;
  opacity: 0.8;
}"""

html = html.replace(old_css, new_css)
print("Updated side overlay CSS: rotate(-90deg) + 130vh size")

# 3. Remove the scaleX(-1) on guide-overlay during side step
# because the overlay rotation already handles orientation
# Actually keep it — scaleX(-1) un-mirrors the front camera selfie mirror.
# The overlay needs to match what the camera shows.
# Let's keep it for now.

with open('/tmp/cg-fix/public/scanner-test.html', 'w') as f:
    f.write(html)
print(f"Written: {len(html)} chars")
