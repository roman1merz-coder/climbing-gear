#!/usr/bin/env python3
"""
run_all_crawlers.py — Master scheduler for climbing-gear price crawlers.

Runs all crawlers in parallel, snapshots prices to history, then detects
major price drops (>10%) compared to the previous snapshot.

Usage:
  python3 run_all_crawlers.py                          # Run all crawlers
  python3 run_all_crawlers.py bergzeit naturzeit       # Run specific crawlers only
  python3 run_all_crawlers.py --drops-only             # Skip crawling, just check drops

Schedule: every 6 hours via cron (00:00, 06:00, 12:00, 18:00 CET).
"""

import subprocess
import sys
import os
import time
import datetime
import json
import urllib.request
import urllib.parse

CRAWL_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.expanduser("~/crawl_logs")
PYTHON = os.path.join(os.path.dirname(sys.executable), "python3") if sys.executable else "python3"

SUPABASE_URL = "https://wsjsuhvpgupalwgcjatp.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SECRET_KEY"]  # set in ~/.cgkeys, not committed
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Threshold for flagging a price drop (fraction, e.g. 0.10 = 10%)
DROP_THRESHOLD = 0.10

ALL_CRAWLERS = [
    "crawl_8a", "crawl_9cclimbing", "crawl_alpinstore", "crawl_bananafingers",
    "crawl_barrabes", "crawl_basislager", "crawl_bergfreunde", "crawl_bergzeit",
    "crawl_camp4", "crawl_chalkr", "crawl_decathlon", "crawl_deporvillage",
    "crawl_epictv", "crawl_funktionelles", "crawl_gigasport", "crawl_globetrotter",
    "crawl_hardloop", "crawl_kletterbude", "crawl_naturzeit", "crawl_oliunid",
    "crawl_outdoor_climbing", "crawl_rockrun", "crawl_snowleader",
    "crawl_sport_conrad", "crawl_sportokay", "crawl_tapir",
]

# ── Price tables and their key columns ──────────────────────────────────────
# (live_table, slug_col_or_id, name_col)
PRICE_TABLES = [
    ("shoe_prices",      "product_slug", "product_name"),
    ("rope_prices",      "product_slug", "product_name"),
    ("belay_prices",     "product_slug", "product_name"),
    ("crashpad_prices",  "product_slug", "product_name"),
    ("quickdraw_prices", "product_slug", "product_name"),
    ("helmet_prices",    "product_slug", "product_name"),
    ("harness_prices",   "product_slug", "product_name"),
    ("jacket_prices",    "product_slug", "product_name"),
]


def supabase_get(table, select="*", params=""):
    """Fetch all rows from a Supabase table (handles pagination)."""
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


# ── Crawl orchestration ────────────────────────────────────────────────────

def run_crawlers(selected):
    """Launch selected crawlers in parallel, wait for completion, return error set."""
    os.makedirs(LOG_DIR, exist_ok=True)

    print(f"\n{'=' * 60}")
    print(f"  Running {len(selected)} crawlers — {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'=' * 60}\n")

    processes = {}
    for crawler in selected:
        script = os.path.join(CRAWL_DIR, f"{crawler}.py")
        if not os.path.exists(script):
            print(f"  ✗ {crawler}.py not found, skipping")
            continue
        log_file = os.path.join(LOG_DIR, f"{crawler}.log")
        with open(log_file, "w") as log:
            proc = subprocess.Popen(
                [PYTHON, "-u", script],
                stdout=log, stderr=subprocess.STDOUT,
                cwd=CRAWL_DIR,
            )
            processes[crawler] = proc
            print(f"  ▶ {crawler} started (PID {proc.pid})")

    print(f"\n  Waiting for all {len(processes)} crawlers to finish...\n")

    completed = set()
    errors = set()
    while len(completed) < len(processes):
        for name, proc in processes.items():
            if name in completed:
                continue
            ret = proc.poll()
            if ret is not None:
                completed.add(name)
                status = "✓" if ret == 0 else "✗"
                if ret != 0:
                    errors.add(name)
                print(f"  {status} {name} finished (exit {ret}) [{len(completed)}/{len(processes)}]")
        time.sleep(2)

    print(f"\n{'=' * 60}")
    print(f"  Crawl complete: {len(completed) - len(errors)} OK, {len(errors)} errors")
    if errors:
        print(f"  Failed: {', '.join(sorted(errors))}")
    print(f"{'=' * 60}")
    return errors


# ── Price drop detection ───────────────────────────────────────────────────

def _get_previous_prices_shoes():
    """Get the most recent history snapshot for shoes (legacy schema).

    Returns dict: (shoe_slug, retailer) → price_eur
    """
    # Get the most recent recorded_at timestamp
    latest = supabase_get(
        "price_history",
        select="recorded_at",
        params="&order=recorded_at.desc&limit=1",
    )
    if not latest:
        return {}

    latest_ts = urllib.parse.quote(latest[0]["recorded_at"], safe="")
    rows = supabase_get(
        "price_history",
        select="shoe_slug,retailer,price_eur",
        params=f"&recorded_at=eq.{latest_ts}",
    )
    return {
        (r["shoe_slug"], r["retailer"]): r["price_eur"]
        for r in rows
        if r["price_eur"] is not None
    }


def _get_previous_prices_category(category):
    """Get the most recent history snapshot for a category.

    Returns dict: price_row_id → price_eur
    """
    hist_table = f"{category}_price_history"
    id_col = f"{category}_price_id"

    latest = supabase_get(
        hist_table,
        select="recorded_at",
        params="&order=recorded_at.desc&limit=1",
    )
    if not latest:
        return {}

    latest_ts = urllib.parse.quote(latest[0]["recorded_at"], safe="")
    rows = supabase_get(
        hist_table,
        select=f"{id_col},price_eur",
        params=f"&recorded_at=eq.{latest_ts}",
    )
    return {
        r[id_col]: r["price_eur"]
        for r in rows
        if r["price_eur"] is not None
    }


def detect_price_drops():
    """Compare current live prices against previous snapshot. Flag drops > threshold.

    IMPORTANT: Only considers in-stock products. A price drop on an unavailable
    product is useless to the user — they can't buy it.

    Returns list of dicts with drop details.
    """
    drops = []

    # ── Shoes (legacy schema: keyed by slug+retailer) ──
    print("  Checking shoes...")
    prev_shoes = _get_previous_prices_shoes()
    if prev_shoes:
        live_shoes = supabase_get(
            "shoe_prices",
            select="product_slug,retailer,price_eur,product_name,in_stock",
            params="&price_eur=not.is.null&product_slug=not.is.null&in_stock=eq.true",
        )
        # Keep cheapest per (slug, retailer)
        current = {}
        names = {}
        for r in live_shoes:
            key = (r["product_slug"], r["retailer"])
            if key not in current or (r["price_eur"] and r["price_eur"] < current[key]):
                current[key] = r["price_eur"]
                names[key] = r.get("product_name") or r["product_slug"]

        for key, new_price in current.items():
            old_price = prev_shoes.get(key)
            if old_price and new_price and old_price > 0:
                pct = (old_price - new_price) / old_price
                if pct >= DROP_THRESHOLD:
                    drops.append({
                        "category": "shoes",
                        "product": names.get(key, key[0]),
                        "retailer": key[1],
                        "old_price": old_price,
                        "new_price": new_price,
                        "drop_pct": round(pct * 100, 1),
                    })
    else:
        print("    (no previous shoe snapshot to compare)")

    # ── Other categories (keyed by price row id) ──
    for live_table, slug_col, name_col in PRICE_TABLES:
        if live_table == "shoe_prices":
            continue
        category = live_table.replace("_prices", "")
        print(f"  Checking {category}...")

        prev = _get_previous_prices_category(category)
        if not prev:
            print(f"    (no previous {category} snapshot to compare)")
            continue

        live = supabase_get(
            live_table,
            select=f"id,{slug_col},{name_col},retailer,price_eur,in_stock",
            params="&price_eur=not.is.null&in_stock=eq.true",
        )

        for r in live:
            old_price = prev.get(r["id"])
            new_price = r["price_eur"]
            if old_price and new_price and old_price > 0:
                pct = (old_price - new_price) / old_price
                if pct >= DROP_THRESHOLD:
                    drops.append({
                        "category": category,
                        "product": r.get(name_col) or r.get(slug_col) or str(r["id"]),
                        "retailer": r.get("retailer", "?"),
                        "old_price": old_price,
                        "new_price": new_price,
                        "drop_pct": round(pct * 100, 1),
                    })

    return drops


def report_drops(drops):
    """Print and log price drops."""
    if not drops:
        print("\n  No major price drops detected (threshold: >{:.0f}%)".format(DROP_THRESHOLD * 100))
        return

    # Sort by drop percentage descending
    drops.sort(key=lambda d: d["drop_pct"], reverse=True)

    print(f"\n{'=' * 60}")
    print(f"  🔻 {len(drops)} PRICE DROP(S) DETECTED (>{DROP_THRESHOLD * 100:.0f}%)")
    print(f"{'=' * 60}")
    for d in drops:
        print(
            f"  {d['category']:12s} │ {d['product'][:40]:40s} │ "
            f"{d['retailer']:25s} │ €{d['old_price']:.2f} → €{d['new_price']:.2f} "
            f"(-{d['drop_pct']}%)"
        )
    print(f"{'=' * 60}")

    # Append to persistent log file
    log_file = os.path.join(LOG_DIR, "price_drops.log")
    os.makedirs(LOG_DIR, exist_ok=True)
    with open(log_file, "a") as f:
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        f.write(f"\n--- {ts} ---\n")
        for d in drops:
            f.write(
                f"  {d['category']} | {d['product']} | {d['retailer']} | "
                f"€{d['old_price']:.2f} → €{d['new_price']:.2f} (-{d['drop_pct']}%)\n"
            )
    print(f"  Drops logged to {log_file}")


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    drops_only = "--drops-only" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    if not drops_only:
        # Determine which crawlers to run
        if args:
            selected = [f"crawl_{name}" if not name.startswith("crawl_") else name for name in args]
        else:
            selected = ALL_CRAWLERS

        # Run crawlers
        run_crawlers(selected)

        # Snapshot prices to history
        print("\n  Recording price history snapshot...")
        from snapshot_prices import snapshot_all
        snapshot_all()

    # Detect and report price drops
    print(f"\n{'=' * 60}")
    print(f"  Price Drop Detection (threshold: >{DROP_THRESHOLD * 100:.0f}%)")
    print(f"{'=' * 60}")
    drops = detect_price_drops()
    report_drops(drops)

    # Append one-line summary to run log
    os.makedirs(LOG_DIR, exist_ok=True)
    run_log = os.path.join(LOG_DIR, "run_history.log")
    with open(run_log, "a") as f:
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        f.write(f"{ts} | drops={len(drops)}\n")

    print("\n  Done!")


if __name__ == "__main__":
    main()
