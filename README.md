# 🧗 climbing-gear.com

AI-powered climbing shoe comparison engine.

## Local Development

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import the GitHub repo
4. Vercel auto-detects Vite — just click **Deploy**
5. Done! Your site is live.

## Architecture

- **Frontend:** React + Vite (static SPA)
- **Backend:** Supabase (Postgres + RPC functions)
- **Scoring:** Client-side JS mirrors the `search_shoes` SQL RPC
- **Data:** Falls back to embedded seed data if Supabase is unreachable

## Supabase

The app connects to Supabase using the anon key (public, read-only).
Database has 9 seeded climbing shoes with full Golden Record attributes.
