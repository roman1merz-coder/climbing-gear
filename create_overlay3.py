from PIL import Image, ImageDraw, ImageFilter
import base64, io
import numpy as np

# Load the original overlay
with open('/Users/leonic_roman/Library/Mobile Documents/com~apple~CloudDocs/climbing-gear/graphics/side_overlay_b64.txt', 'r') as f:
    b64 = f.read().strip()

img_data = base64.b64decode(b64)
overlay = Image.open(io.BytesIO(img_data)).convert('RGBA')

# Crop to foot bounding box
pixels = np.array(overlay)
alpha = pixels[:, :, 3]
rows_with = np.any(alpha > 20, axis=1)
cols_with = np.any(alpha > 20, axis=0)
r_min = np.argmax(rows_with)
r_max = len(rows_with) - np.argmax(rows_with[::-1]) - 1
c_min = np.argmax(cols_with)
c_max = len(cols_with) - np.argmax(cols_with[::-1]) - 1
cropped = overlay.crop((c_min, r_min, c_max + 1, r_max + 1))
print(f"Cropped: {cropped.size}")

# Rotate 90° CCW (toes go up, heel at bottom — matching how a side profile
# appears when phone is landscape with long edge on bottom)
rotated = cropped.rotate(90, expand=True)
print(f"Rotated: {rotated.size}")

# Target: portrait canvas matching video aspect (3:4)
canvas_w, canvas_h = 480, 640

# Scale foot to fill almost the entire canvas
foot_w, foot_h = rotated.size
# Fill 90% width, 90% height — whichever constrains first
scale = min((canvas_w * 0.90) / foot_w, (canvas_h * 0.90) / foot_h)
new_w = int(foot_w * scale)
new_h = int(foot_h * scale)
scaled = rotated.resize((new_w, new_h), Image.LANCZOS)
print(f"Scaled to fill frame: {scaled.size}")

# Thicken the outline so it's more visible as a guide
# Dilate the alpha channel
arr = np.array(scaled)
alpha_ch = arr[:, :, 3]
# Simple dilation: for each pixel, if any neighbor has alpha > 0, set alpha
from scipy.ndimage import maximum_filter
thick_alpha = maximum_filter(alpha_ch, size=5)
# Keep original color where original alpha > 0, extend with same color nearby
# Just use the orange color everywhere
orange = np.array([232, 115, 74, 0], dtype=np.uint8)  # #E8734A
result = np.zeros_like(arr)
result[:, :, 0] = 232  # R
result[:, :, 1] = 115  # G
result[:, :, 2] = 74   # B
result[:, :, 3] = np.minimum(thick_alpha * 2, 255).astype(np.uint8)
scaled_thick = Image.fromarray(result)

# Position: roughly centered, slightly shifted to match reference
pos_x = (canvas_w - new_w) // 2
pos_y = (canvas_h - new_h) // 2

canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
canvas.paste(scaled_thick, (pos_x, pos_y), scaled_thick)

# Also create a version WITHOUT rotation for comparison
# (in case phone camera handles landscape differently)
scale_nr = min((canvas_w * 0.90) / cropped.size[0], (canvas_h * 0.50) / cropped.size[1])
no_rot_w = int(cropped.size[0] * scale_nr)
no_rot_h = int(cropped.size[1] * scale_nr)
scaled_nr = cropped.resize((no_rot_w, no_rot_h), Image.LANCZOS)

canvas_nr = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
pos_nr_x = (canvas_w - no_rot_w) // 2
pos_nr_y = (canvas_h - no_rot_h) // 2 + int(canvas_h * 0.15)  # lower third
canvas_nr.paste(scaled_nr, (pos_nr_x, pos_nr_y), scaled_nr)

# Verify both
for label, c in [("ROTATED 90° (vertical foot)", canvas), ("NOT ROTATED (horizontal foot)", canvas_nr)]:
    small = c.resize((30, 40))
    print(f"\n{label}:")
    for y in range(40):
        row = ''
        for x in range(30):
            r, g, b, a = small.getpixel((x, y))
            row += '#' if a > 100 else ('+' if a > 20 else '.')
        print(f'{y:2d} {row}')

# Save both versions
for name, c in [("rotated", canvas), ("horizontal", canvas_nr)]:
    buf = io.BytesIO()
    c.save(buf, format='PNG', optimize=True)
    b = base64.b64encode(buf.getvalue()).decode('ascii')
    with open(f'/tmp/cg-fix/overlay_{name}_b64.txt', 'w') as f:
        f.write(b)
    print(f"\n{name}: base64 length {len(b)}")
