# Climbing Gear Price Crawler Configuration

## Storage Location
All crawlers, the master scheduler, and the price snapshot script live in:
```
crawlers/
├── run_all_crawlers.py     # Master scheduler — runs all crawlers in parallel
├── snapshot_prices.py      # Copies live prices → history tables (called by scheduler)
├── crawl_*.py              # 25 individual retailer crawlers
└── CRAWLER_CONFIG.md       # This file
```

## Crawling Rules

### What we crawl:
- **Prices** — current price in EUR
- **Sizes** — available sizes per product (where supported)
- **All products** — including those NOT yet in the reference database (shoes, ropes, etc.)
  - Reason: We want historical price data ready when products are added to the master DB

### Future features (not yet implemented):
- Show available sizes to users
- Size availability alerts

### Matching behavior:
- Products are matched to reference tables (shoes, ropes, etc.) via `product_slug`
- Unmatched products have `product_slug = NULL` but are still stored
- Match rates vary by retailer (typically 70-90%)

## Schedule (Every 6 hours via Mac Mini cron)

The master scheduler (`run_all_crawlers.py`) launches all 26 crawlers in parallel,
snapshots prices to history tables, then detects major price drops (>10% vs previous run).
Each crawler has a built-in 1.5s sleep between page requests to be polite to retailers.

**Recommended cron entry (4× daily):**
```
0 0,6,12,18 * * * cd /path/to/crawlers && python3 run_all_crawlers.py >> ~/crawl_logs/scheduler.log 2>&1
```

**Runs at:** 00:00, 06:00, 12:00, 18:00 CET.
The snapshot dedup guard (4h window) prevents duplicate history entries if a run is retried.

### Post-crawl pipeline:
1. All 25 crawlers run in parallel (~25 min total)
2. `snapshot_prices.py` records a history snapshot (skipped if one exists within 4h)
3. Price drop detection compares live prices vs previous snapshot, flags drops >10%
4. Drops are printed to stdout and appended to `~/crawl_logs/price_drops.log`

## Crawlers (26 total)

| Crawler | Retailer | Country | Special Requirements |
|---------|----------|---------|---------------------|
| crawl_8a.py | 8a.nu | International | — |
| crawl_9cclimbing.py | 9cclimbing.com | UK | — |
| crawl_alpinstore.py | alpinstore.com | FR | — |
| crawl_bananafingers.py | bananafingers.co.uk | UK | — |
| crawl_barrabes.py | barrabes.com | ES | — |
| crawl_basislager.py | basislager.de | DE | — |
| crawl_bergfreunde.py | bergfreunde.de | DE | — |
| crawl_bergzeit.py | bergzeit.de | DE | `playwright` (JS-rendered) |
| crawl_camp4.py | camp4.de | DE | — |
| crawl_chalkr.py | chalkr.de | DE | — |
| crawl_decathlon.py | decathlon.de | DE | `curl_cffi` (Cloudflare bypass) |
| crawl_deporvillage.py | deporvillage.com | ES | — |
| crawl_epictv.py | epictv.com | International | — |
| crawl_funktionelles.py | funktionelles.de | DE | — |
| crawl_gigasport.py | gigasport.at | AT | AWIN API feed (shoes, ropes, belays, quickdraws) |
| crawl_globetrotter.py | globetrotter.de | DE | — |
| crawl_hardloop.py | hardloop.de | DE | — |
| crawl_kletterbude.py | kletterbude.de | DE | — |
| crawl_naturzeit.py | naturzeit.com | DE | `playwright` (JS-rendered) |
| crawl_oliunid.py | oliunid.com | IT | — |
| crawl_outdoor_climbing.py | outdoor-climbing.de | DE | Static size extraction (no browser) |
| crawl_rockrun.py | rockrun.com | UK | — |
| crawl_snowleader.py | snowleader.com | FR | — |
| crawl_sport_conrad.py | sport-conrad.com | DE | — |
| crawl_sportokay.py | sportokay.com | AT | — |
| crawl_tapir.py | tapir-store.de | DE | — |

## Database Tables

### Price tables (one per category):
- `shoe_prices`, `rope_prices`, `belay_prices`, `quickdraw_prices`
- `crashpad_prices`, `helmet_prices`, `harness_prices`, `jacket_prices`

### History tables (one per category):
- `shoe_price_history` (legacy schema: shoe_slug + retailer + price_eur)
- `rope_price_history`, `crashpad_price_history`, `belay_price_history`
- `quickdraw_price_history`, `helmet_price_history`, `harness_price_history`, `jacket_price_history`

### Key fields:
- `retailer` — retailer domain
- `product_url` — unique product page URL
- `product_slug` — FK to reference table (NULL if unmatched)
- `price_eur` — current price
- `sizes_available` — JSON array of available sizes
- `in_stock` — boolean
- `last_seen` — timestamp of last crawl

## Usage

```bash
# Run ALL crawlers in parallel + snapshot + drop detection
python3 crawlers/run_all_crawlers.py

# Run specific crawlers only
python3 crawlers/run_all_crawlers.py bergzeit naturzeit

# Skip crawling, just check for price drops vs last snapshot
python3 crawlers/run_all_crawlers.py --drops-only

# Run a single crawler directly
python3 crawlers/crawl_chalkr.py
python3 crawlers/crawl_chalkr.py shoes
python3 crawlers/crawl_chalkr.py shoes ropes helmets

# Snapshot prices to history (standalone, dedup-safe)
python3 crawlers/snapshot_prices.py
```

## Size Extraction

Shoe sizes are fetched from product detail pages (shoes only). Three approaches:

| Crawler | Method | Notes |
|---------|--------|-------|
| outdoor_climbing | **Static HTTP** | Sizes in HTML buttons/spans; no browser needed |
| kletterbude | crawl4ai (Chromium) | Shopware 6 SPA, sizes in JS-rendered `<select>` |
| funktionelles | crawl4ai (Chromium) | Sizes in JS-rendered `<select>` |
| snowleader | crawl4ai (Chromium) | Cloudflare + JS-rendered size buttons |

`crawl4ai_sizes.py` creates a **fresh browser per request** (no singleton) to prevent
the corrupted-browser-after-timeout bug that caused the original 4-crawler hangs.

## Dependencies

- Python 3 (stdlib only for most crawlers)
- `curl_cffi` for Decathlon (Cloudflare bypass): `pip3 install curl_cffi`
- `playwright` for bergzeit + naturzeit (JS-rendered): `pip3 install playwright && playwright install chromium`
- `crawl4ai` for kletterbude, funktionelles, snowleader (size extraction): `pip3 install crawl4ai`

---
Last updated: 2026-03-09
