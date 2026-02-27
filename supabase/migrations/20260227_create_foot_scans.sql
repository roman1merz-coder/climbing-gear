-- Foot scan results — collected from the /scan AI foot scanner
-- Stores derived ratios and categories (never raw photos)

CREATE TABLE foot_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),

  -- User input
  shoe_size_eu numeric(3,1) NOT NULL,

  -- AI-derived continuous ratios
  toe_shape text NOT NULL CHECK (toe_shape IN ('egyptian', 'greek', 'roman')),
  toe_confidence numeric(3,2),
  width_ratio numeric(4,3),       -- forefoot width / length (~0.30–0.48)
  instep_ratio numeric(4,3),      -- arch height index (~0.24–0.44)
  heel_ratio numeric(4,3),        -- heel width / forefoot width (~0.45–0.85)
  arch_ratio numeric(4,3),        -- ball-to-heel / total length (~0.64–0.82)

  -- Derived categories (for ShoeFinder matching)
  volume text CHECK (volume IN ('low', 'standard', 'high')),
  width text CHECK (width IN ('narrow', 'medium', 'wide')),
  heel_width text CHECK (heel_width IN ('narrow', 'medium', 'wide')),

  -- Metadata
  confidence text CHECK (confidence IN ('high', 'medium', 'low')),
  notes text
);

-- RLS: public insert (anon can write), public read for aggregate stats
ALTER TABLE foot_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert foot scans" ON foot_scans FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read foot scans" ON foot_scans FOR SELECT USING (true);

-- Index for analytics queries
CREATE INDEX idx_foot_scans_created ON foot_scans(created_at);
CREATE INDEX idx_foot_scans_toe ON foot_scans(toe_shape);
CREATE INDEX idx_foot_scans_size ON foot_scans(shoe_size_eu);
