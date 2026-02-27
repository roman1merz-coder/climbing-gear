#!/usr/bin/env python3
"""
snapshot_prices.py — Copy current prices from live tables into history tables.

Run after crawlers finish to record a daily price snapshot.
Can be run standalone or imported and called from crawlers.

History table schemas:
  - price_history (shoes): shoe_slug, retailer, price_eur, recorded_at
  - {category}_price_history: {category}_price_id, price_eur, original_price_eur, in_stock, recorded_at
"""

import json
import urllib.request
import datetime

SUPABASE_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SERVICE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ."
    "6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4"
)
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def supabase_get(table, select="*", params=""):
    """Fetch all rows from a table (handles pagination)."""
    all_rows = []
    offset = 0
    batch = 1000
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}&limit={batch}&offset={offset}{params}"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req) as resp:
            rows = json.loads(resp.read())
        all_rows.extend(rows)
        if len(rows) < batch:
            break
        offset += batch
    return all_rows


def supabase_insert(table, rows):
    """Insert rows into a table in batches of 200."""
    total = 0
    errors = 0
    for i in range(0, len(rows), 200):
        batch = rows[i:i+200]
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        data = json.dumps(batch).encode()
        req = urllib.request.Request(url, data=data, headers=HEADERS, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                resp.read()
            total += len(batch)
        except urllib.error.HTTPError as e:
            body = e.read().decode() if e.fp else ""
            print(f"    ✗ Batch {i//200+1} error ({e.code}): {body[:200]}")
            errors += 1
    if errors:
        print(f"    ⚠ {errors} batch(es) failed")
    return total


def snapshot_shoes():
    """Snapshot shoe_prices → price_history (legacy schema: shoe_slug, retailer, price_eur)."""
    print("  Snapshotting shoes...")
    now = datetime.datetime.utcnow().isoformat() + "+00:00"

    # Get current prices — for per-size shoes, take the cheapest per slug+retailer
    live = supabase_get("shoe_prices", select="product_slug,retailer,price_eur", params="&price_eur=not.is.null&product_slug=not.is.null")

    # Deduplicate: keep cheapest price per (slug, retailer)
    best = {}
    for r in live:
        key = (r["product_slug"], r["retailer"])
        if key not in best or (r["price_eur"] and r["price_eur"] < best[key]):
            best[key] = r["price_eur"]

    rows = [
        {"shoe_slug": slug, "retailer": retailer, "price_eur": price, "recorded_at": now}
        for (slug, retailer), price in best.items()
        if price is not None
    ]
    n = supabase_insert("price_history", rows)
    print(f"    → {n} shoe price snapshots recorded")
    return n


def snapshot_category(category):
    """Snapshot {category}_prices → {category}_price_history.

    Schema: {category}_price_id, price_eur, original_price_eur, in_stock, recorded_at
    """
    live_table = f"{category}_prices"
    hist_table = f"{category}_price_history"
    id_col = f"{category}_price_id"

    print(f"  Snapshotting {category}...")
    now = datetime.datetime.utcnow().isoformat() + "+00:00"

    live = supabase_get(live_table, select="id,price_eur,original_price_eur,in_stock", params="&price_eur=not.is.null")

    rows = [
        {
            id_col: r["id"],
            "price_eur": r["price_eur"],
            "original_price_eur": r.get("original_price_eur"),
            "in_stock": r.get("in_stock", True),
            "recorded_at": now,
        }
        for r in live
        if r["price_eur"] is not None
    ]
    n = supabase_insert(hist_table, rows)
    print(f"    → {n} {category} price snapshots recorded")
    return n


def snapshot_all():
    """Snapshot all price tables into their history tables."""
    print(f"\n{'='*60}")
    print(f"  Price History Snapshot — {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*60}")

    total = 0
    total += snapshot_shoes()
    for cat in ["rope", "crashpad", "harness", "helmet", "belay", "quickdraw"]:
        try:
            total += snapshot_category(cat)
        except Exception as e:
            print(f"    ✗ Error snapshotting {cat}: {e}")

    print(f"\n  Total: {total} price snapshots recorded across all categories")
    print(f"{'='*60}\n")
    return total


if __name__ == "__main__":
    snapshot_all()
