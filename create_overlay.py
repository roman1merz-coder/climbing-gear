from PIL import Image, ImageDraw
import base64, io
import numpy as np

# Load the original overlay
with open('/Users/leonic_roman/Library/Mobile Documents/com~apple~CloudDocs/climbing-gear/graphics/side_overlay_b64.txt', 'r') as f:
    b64 = f.read().strip()

img_data = base64.b64decode(b64)
overlay = Image.open(io.BytesIO(img_data)).convert('RGBA')
print(f"Original overlay: {overlay.size}")

# Find the bounding box of the foot outline (non-transparent pixels)
pixels = np.array(overlay)
alpha = pixels[:, :, 3]
rows_with_content = np.any(alpha > 30, axis=1)
cols_with_content = np.any(alpha > 30, axis=0)

row_min = np.argmax(rows_with_content)
row_max = len(rows_with_content) - np.argmax(rows_with_content[::-1]) - 1
col_min = np.argmax(cols_with_content)
col_max = len(cols_with_content) - np.argmax(cols_with_content[::-1]) - 1

print(f"Foot bounding box: rows {row_min}-{row_max}, cols {col_min}-{col_max}")
print(f"Foot size: {col_max - col_min}x{row_max - row_min}")

# Crop to just the foot with small padding
pad = 5
cropped = overlay.crop((max(0, col_min - pad), max(0, row_min - pad),
                         min(overlay.width, col_max + pad), min(overlay.height, row_max + pad)))
print(f"Cropped: {cropped.size}")

# Now analyze where the foot sits in the reference photo (960x1280)
ref = Image.open('/tmp/cg-fix/side-reference.jpg')
ref_small = ref.resize((96, 128))
ref_arr = np.array(ref_small)
brightness = ref_arr.mean(axis=2)

# Find foot (dark region) bounding box in reference
dark_mask = brightness < 120
ref_rows = np.any(dark_mask, axis=1)
ref_cols = np.any(dark_mask, axis=0)
ref_row_min = np.argmax(ref_rows)
ref_row_max = len(ref_rows) - np.argmax(ref_rows[::-1]) - 1
ref_col_min = np.argmax(ref_cols)
ref_col_max = len(ref_cols) - np.argmax(ref_cols[::-1]) - 1

print(f"\nReference foot position (in 96x128):")
print(f"  rows {ref_row_min}-{ref_row_max} ({ref_row_min/128*100:.0f}%-{ref_row_max/128*100:.0f}%)")
print(f"  cols {ref_col_min}-{ref_col_max} ({ref_col_min/96*100:.0f}%-{ref_col_max/96*100:.0f}%)")

# Target canvas: 3:4 ratio (matching 960x1280 video)
canvas_w, canvas_h = 480, 640

# The foot in reference fills roughly:
# rows: ~0% to ~100% of height (it fills almost everything)
# cols: ~0% to ~80% of width
# So in our 480x640 canvas, foot should occupy similar area

# Scale the cropped foot to fill the target area
foot_w = cropped.size[0]
foot_h = cropped.size[1]

# Target size in canvas: ~75% width, ~65% height (to match reference)
target_w = int(canvas_w * 0.78)
target_h = int(canvas_h * 0.52)

# Scale while preserving aspect ratio
scale_x = target_w / foot_w
scale_y = target_h / foot_h
scale = min(scale_x, scale_y)

new_w = int(foot_w * scale)
new_h = int(foot_h * scale)
scaled_foot = cropped.resize((new_w, new_h), Image.LANCZOS)
print(f"\nScaled foot: {scaled_foot.size}")

# Position: center horizontally, push down to ~30% from top (matching reference)
pos_x = (canvas_w - new_w) // 2
pos_y = int(canvas_h * 0.18)

# Create canvas and paste
canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
canvas.paste(scaled_foot, (pos_x, pos_y), scaled_foot)

# Verify with ASCII art
small_verify = canvas.resize((40, 53))
print(f"\nNew overlay ({canvas_w}x{canvas_h}):")
for y in range(53):
    row = ''
    for x in range(40):
        r, g, b, a = small_verify.getpixel((x, y))
        if a > 128:
            row += '#'
        elif a > 30:
            row += '+'
        else:
            row += '.'
    print(f'{y:2d} {row}')

# Save as base64
buf = io.BytesIO()
canvas.save(buf, format='PNG', optimize=True)
new_b64 = base64.b64encode(buf.getvalue()).decode('ascii')
print(f"\nNew base64 length: {len(new_b64)}")

# Save base64 to file
with open('/tmp/cg-fix/new_side_overlay_b64.txt', 'w') as f:
    f.write(new_b64)
print("Saved to /tmp/cg-fix/new_side_overlay_b64.txt")
