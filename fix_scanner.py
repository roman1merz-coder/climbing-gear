import re

# Read the correct base64
with open('/Users/leonic_roman/Library/Mobile Documents/com~apple~CloudDocs/climbing-gear/graphics/side_overlay_b64.txt', 'r') as f:
    correct_b64 = f.read().strip()
print(f"Correct base64 length: {len(correct_b64)}")

# Read the HTML
with open('/tmp/cg-fix/public/scanner-test.html', 'r') as f:
    html = f.read()

# Find and replace the corrupted base64 in the img tag
pattern = r'(src="data:image/png;base64,)([A-Za-z0-9+/=\s]+)(" />)'
match = re.search(pattern, html)
if match:
    old_b64 = match.group(2)
    print(f"Old base64 length: {len(old_b64)}")
    html = html[:match.start(2)] + correct_b64 + html[match.end(2):]
    print("Base64 replaced successfully")
else:
    print("Pattern not found!")

# Also make sole SVG larger: width 60% -> 75%, height 82% -> 88%
html = html.replace('width: 60%; height: 82%;', 'width: 75%; height: 88%;')
# Update the zone in JS to match larger guide
print("Sole SVG enlarged")

# Write the fixed HTML
with open('/tmp/cg-fix/public/scanner-test.html', 'w') as f:
    f.write(html)
print("File written successfully")

# Verify
with open('/tmp/cg-fix/public/scanner-test.html', 'r') as f:
    verify = f.read()
new_match = re.search(pattern, verify)
if new_match:
    print(f"Verified new base64 length: {len(new_match.group(2))}")
print(f"Total file length: {len(verify)} chars")
