ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS delivery_email           TEXT,
  ADD COLUMN IF NOT EXISTS delivery_website         TEXT,
  ADD COLUMN IF NOT EXISTS delivery_twitter         TEXT,
  ADD COLUMN IF NOT EXISTS delivery_tiktok          TEXT,
  ADD COLUMN IF NOT EXISTS delivery_youtube         TEXT,
  ADD COLUMN IF NOT EXISTS delivery_linkedin        TEXT,
  ADD COLUMN IF NOT EXISTS delivery_threads         TEXT,
  ADD COLUMN IF NOT EXISTS delivery_kwai            TEXT,
  ADD COLUMN IF NOT EXISTS delivery_google_business TEXT;
