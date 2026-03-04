from PIL import Image, ImageDraw
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
rows_with = np.any(alpha > 30, axis=1)
cols_with = np.any(alpha > 30, axis=0)
r_min, r_max = np.argmax(rows_with), len(rows_with) - np.argmax(rows_with[::-1]) - 1
c_min, c_max = np.argmax(cols_with), len(cols_with) - np.argmax(cols_with[::-1]) - 1
cropped = overlay.crop((c_min, r_min, c_max + 1, r_max + 1))
print(f"Cropped foot: {cropped.size} (w x h)")

# The overlay has the foot HORIZONTAL (wide, toes right)
# But in the portrait video feed, the foot appears VERTICAL
# So rotate 90 degrees counter-clockwise: toes go to top, heel to bottom
rotated = cropped.rotate(90, expand=True)
print(f"After 90deg rotation: {rotated.size}")

# Target: 3:4 portrait canvas (matching 960x1280 video)
canvas_w, canvas_h = 480, 640

# Scale the rotated foot to fill most of the canvas
foot_w, foot_h = rotated.size
# Foot should fill ~70% of width and ~75% of height
scale_x = (canvas_w * 0.70) / foot_w
scale_y = (canvas_h * 0.75) / foot_h
scale = min(scale_x, scale_y)
new_w = int(foot_w * scale)
new_h = int(foot_h * scale)
scaled = rotated.resize((new_w, new_h), Image.LANCZOS)
print(f"Scaled: {scaled.size}")

# Position: center horizontally, vertically centered slightly lower
pos_x = (canvas_w - new_w) // 2
pos_y = (canvas_h - new_h) // 2 + int(canvas_h * 0.02)

canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
canvas.paste(scaled, (pos_x, pos_y), scaled)

# ASCII verify
small = canvas.resize((30, 40))
print(f"\nNew overlay ({canvas_w}x{canvas_h}):")
for y in range(40):
    row = ''
    for x in range(30):
        r, g, b, a = small.getpixel((x, y))
        row += '#' if a > 128 else ('+' if a > 30 else '.')
    print(f'{y:2d} {row}')

# Compare with reference
ref = Image.open('/tmp/cg-fix/side-reference.jpg').resize((30, 40))
print(f"\nReference photo:")
for y in range(40):
    row = ''
    for x in range(30):
        px = ref.getpixel((x, y))
        b = sum(px[:3]) / 3
        row += '#' if b < 80 else ('+' if b < 150 else '.')
    print(f'{y:2d} {row}')

# Save
buf = io.BytesIO()
canvas.save(buf, format='PNG', optimize=True)
new_b64 = base64.b64encode(buf.getvalue()).decode('ascii')
print(f"\nBase64 length: {len(new_b64)}")
with open('/tmp/cg-fix/new_side_overlay_b64.txt', 'w') as f:
    f.write(new_b64)
print("Saved!")
