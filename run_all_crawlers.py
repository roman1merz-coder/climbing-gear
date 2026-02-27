#!/usr/bin/env python3
"""
run_all_crawlers.py — Run all price crawlers in parallel, then snapshot prices to history.

Usage:
  python3 run_all_crawlers.py              # Run all crawlers
  python3 run_all_crawlers.py bergzeit naturzeit   # Run specific crawlers only
"""

import subprocess
import sys
import os
import time
import datetime

CRAWL_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.expanduser("~/crawl_logs")

ALL_CRAWLERS = [
    "crawl_8a", "crawl_9cclimbing", "crawl_alpinstore", "crawl_bananafingers",
    "crawl_barrabes", "crawl_basislager", "crawl_bergfreunde", "crawl_bergzeit",
    "crawl_camp4", "crawl_chalkr", "crawl_decathlon", "crawl_deporvillage",
    "crawl_epictv", "crawl_funktionelles", "crawl_globetrotter", "crawl_hardloop",
    "crawl_kletterbude", "crawl_naturzeit", "crawl_oliunid", "crawl_outdoor_climbing",
    "crawl_rockrun", "crawl_snowleader", "crawl_sport_conrad", "crawl_sportokay",
    "crawl_tapir",
]


def main():
    os.makedirs(LOG_DIR, exist_ok=True)

    # Determine which crawlers to run
    if len(sys.argv) > 1:
        selected = [f"crawl_{name}" if not name.startswith("crawl_") else name for name in sys.argv[1:]]
    else:
        selected = ALL_CRAWLERS

    print(f"\n{'='*60}")
    print(f"  Running {len(selected)} crawlers — {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}\n")

    # Launch all crawlers in parallel
    processes = {}
    for crawler in selected:
        script = os.path.join(CRAWL_DIR, f"{crawler}.py")
        if not os.path.exists(script):
            print(f"  ✗ {crawler}.py not found, skipping")
            continue
        log_file = os.path.join(LOG_DIR, f"{crawler}.log")
        with open(log_file, "w") as log:
            proc = subprocess.Popen(
                ["python3", "-u", script],
                stdout=log, stderr=subprocess.STDOUT,
                cwd=CRAWL_DIR,
            )
            processes[crawler] = proc
            print(f"  ▶ {crawler} started (PID {proc.pid}, log: {log_file})")

    print(f"\n  Waiting for all {len(processes)} crawlers to finish...\n")

    # Wait for all to finish, report as they complete
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

    # Summary
    print(f"\n{'='*60}")
    print(f"  Crawl complete: {len(completed) - len(errors)} OK, {len(errors)} errors")
    if errors:
        print(f"  Failed: {', '.join(sorted(errors))}")
    print(f"{'='*60}")

    # Snapshot prices to history
    print("\n  Recording price history snapshot...")
    from snapshot_prices import snapshot_all
    snapshot_all()

    print("  Done!")


if __name__ == "__main__":
    main()
