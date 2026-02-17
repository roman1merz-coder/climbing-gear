#!/bin/bash
# Regenerate seed files from Supabase
set -e

API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzanN1aHZwZ3VwYWx3Z2NqYXRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MDc5MSwiZXhwIjoyMDg2MTM2NzkxfQ.6cYE1ElsvX7-BTc1DD15zoPJyr4L3bN0_QyKRQmp3M4"
BASE_URL="https://wsjsuhvpgupalwgcjatp.supabase.co/rest/v1"

echo "Regenerating crashpad seed data..."
curl -s "$BASE_URL/crashpads?select=*&order=slug.asc" \
  -H "apikey: $API_KEY" \
  | jq 'map(del(.id, .created_at, .updated_at, .landing_area_sqm, .volume_l, .eur_per_area, .kg_per_area, .eur_per_liter, .kg_per_liter, .discount_pct))' \
  > src/crashpad_seed_data.json

echo "Regenerating shoe seed data..."
curl -s "$BASE_URL/shoes?select=*&order=slug.asc" \
  -H "apikey: $API_KEY" \
  | jq 'map(del(.id, .created_at, .updated_at))' \
  > src/seed_data.json

echo "Seed files regenerated successfully!"
