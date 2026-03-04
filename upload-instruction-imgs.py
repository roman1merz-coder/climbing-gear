#!/usr/bin/env python3
import requests, os

SB_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4"

headers = {
    "Authorization": f"Bearer {SB_KEY}",
    "apikey": SB_KEY,
    "Content-Type": "image/jpeg",
    "x-upsert": "true",
}

# Sole instruction image (person bending, phone on ground)
sole_path = os.path.expanduser("~/Library/Containers/ru.keepcoder.Telegram/Data/tmp/IMAGE 2026-03-04 22:30:55.jpg")
# Side instruction image (person standing)
side_path = os.path.expanduser("~/Library/Containers/ru.keepcoder.Telegram/Data/tmp/IMAGE 2026-03-04 22:30:58.jpg")

for name, path in [("instruction-sole.jpg", sole_path), ("instruction-side.jpg", side_path)]:
    with open(path, 'rb') as f:
        data = f.read()
    url = f"{SB_URL}/storage/v1/object/foot-scans/scans/{name}"
    r = requests.post(url, headers=headers, data=data)
    pub = f"{SB_URL}/storage/v1/object/public/foot-scans/scans/{name}"
    print(f"{name}: {r.status_code} -> {pub}")
