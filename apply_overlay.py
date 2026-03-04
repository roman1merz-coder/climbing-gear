import re

# Read the traced overlay base64
with open('/tmp/cg-fix/traced_overlay_b64.txt', 'r') as f:
    new_b64 = f.read().strip()
print(f"New overlay base64: {len(new_b64)} chars")

# Read the HTML
with open('/tmp/cg-fix/public/scanner-test.html', 'r') as f:
    html = f.read()

# 1. Replace the base64 in the img tag
pattern = r'(src="data:image/png;base64,)([A-Za-z0-9+/=\s]+)(" />)'
match = re.search(pattern, html)
if match:
    old_len = len(match.group(2))
    html = html[:match.start(2)] + new_b64 + html[match.end(2):]
    print(f"Replaced base64: {old_len} -> {len(new_b64)}")
else:
    print("ERROR: base64 pattern not found!")
    exit(1)

# 2. Update side overlay CSS: fill the viewport since overlay is now pre-positioned
# Old CSS:
#   #side-guide-img { width: 70%; max-height: 75%; object-fit: contain; ...}
# New: fill viewport, the PNG itself has correct proportions
html = html.replace(
    'width: 70%; max-height: 75%;',
    'width: 100%; height: 100%;'
)
html = html.replace(
    'object-fit: contain;',
    'object-fit: fill;'
)
print("Updated side overlay CSS to fill viewport")

# Write
with open('/tmp/cg-fix/public/scanner-test.html', 'w') as f:
    f.write(html)
print(f"Written: {len(html)} chars")
