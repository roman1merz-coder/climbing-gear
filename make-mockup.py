#!/usr/bin/env python3
import os

# Read the base64 from the source file
b64_path = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/climbing-gear/graphics/side_overlay_b64.txt")
with open(b64_path, 'r') as f:
    b64 = f.read().strip()

# Read the partial HTML
with open('/tmp/cg-fix/side-view-mockup.html', 'r') as f:
    html = f.read()

# Append the image tag and closing HTML
html += f'''
    <img id="side-guide-img" src="data:image/png;base64,{b64}" alt="Side profile guide">
  </div>
  <div id="status-bar">Place your foot against a wall — match the outline</div>
</div>
</body>
</html>'''

with open('/tmp/cg-fix/side-view-mockup.html', 'w') as f:
    f.write(html)

print(f"Done! base64 length: {len(b64)}, total HTML size: {len(html)}")
