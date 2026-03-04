from PIL import Image, ImageDraw, ImageFilter
import base64, io
import numpy as np
from scipy.ndimage import binary_fill_holes, binary_dilation, binary_erosion

# Load the reference photo
ref = Image.open('/tmp/cg-fix/side-reference.jpg')
print(f"Reference: {ref.size}")

# Convert to grayscale, find the foot (dark region)
gray = np.array(ref.convert('L'))

# Threshold: foot is dark (< 130 brightness)
mask = gray < 130

# Clean up: fill holes, smooth edges
mask = binary_fill_holes(mask)
mask = binary_erosion(mask, iterations=3)
mask = binary_dilation(mask, iterations=3)

# Find the outline (edge of the mask)
eroded = binary_erosion(mask, iterations=6)
outline = mask & ~eroded

# Create overlay: orange outline on transparent background
# Same dimensions as the reference (960x1280 = 3:4 portrait)
canvas = np.zeros((ref.size[1], ref.size[0], 4), dtype=np.uint8)
canvas[outline, 0] = 232  # R
canvas[outline, 1] = 115  # G
canvas[outline, 2] = 74   # B
canvas[outline, 3] = 220  # A (mostly opaque)

overlay = Image.fromarray(canvas)

# Downscale to 480x640 for smaller file size
overlay_small = overlay.resize((480, 640), Image.LANCZOS)

# Verify
small = overlay_small.resize((40, 53))
print(f"\nTraced overlay from reference photo:")
for y in range(53):
    row = ''
    for x in range(40):
        r, g, b, a = small.getpixel((x, y))
        row += '#' if a > 100 else ('+' if a > 20 else '.')
    print(f'{y:2d} {row}')

# Also show reference for comparison
ref_small = ref.resize((40, 53))
print(f"\nReference photo:")
for y in range(53):
    row = ''
    for x in range(40):
        px = ref_small.getpixel((x, y))
        b = sum(px[:3]) / 3
        row += '#' if b < 80 else ('+' if b < 150 else '.')
    print(f'{y:2d} {row}')

# Save as base64
buf = io.BytesIO()
overlay_small.save(buf, format='PNG', optimize=True)
new_b64 = base64.b64encode(buf.getvalue()).decode('ascii')
print(f"\nBase64 length: {len(new_b64)}")

with open('/tmp/cg-fix/traced_overlay_b64.txt', 'w') as f:
    f.write(new_b64)
print("Saved!")
