# Price Crawlers

## Overview

44 retailer-specific Python crawlers in `crawlers/` that scrape product prices and feed them into Supabase price tables. Each crawler is a standalone script targeting one retailer.

## Retailers Covered

8a.nu, 9cclimbing, Alpinstore, Bananafingers, Barrabes, Basislager, Bergfreunde, Bergzeit, Camp4, Chalkr, Decathlon, Deporvillage, Epictv, Funktionelles, Gigasport, Globetrotter, Hardloop, Kletterbude, Naturzeit, Oliunid, Outdoor-Climbing, Reusch, Schrader, Sportiva-Store, Stein, and more.

## How They Work

Each crawler:
1. Fetches product listing pages from the retailer
2. Extracts product URLs, names, prices, sizes, stock status
3. Normalizes brand/model naming to match our slug convention
4. Handles pagination for large catalogs
5. Upserts data to the appropriate Supabase price table via REST API

## Running Crawlers

```bash
# Run all crawlers:
python3 run_all_crawlers.py

# Run a specific crawler:
python3 crawlers/crawl_bergfreunde.py
```

## Automated Fetching

Vercel cron job at `/api/fetch-prices?limit=50` runs daily at 4 AM UTC (configured in vercel.json). The serverless function `api/fetch-prices.js` handles this with a 60-second max duration.

## Configuration

- `crawlers/CLAUDE-README.md` - Dev notes
- `crawlers/CRAWLER_CONFIG.md` - Configuration guide
- `crawlers/VERIFY_CRAWLER_PROMPT.md` - Validation instructions

## Price Tables

Crawled data goes into category-specific tables: `shoe_prices`, `rope_prices`, `crashpad_prices`, `belay_prices`, `quickdraw_prices`. Historical snapshots appended to `price_history`.

## Match Confidence

Each price row has a `match_confidence` field indicating how certain the crawler is that the product matches our slug. This helps filter out mismatches in the UI.
