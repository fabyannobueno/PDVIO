-- Add delivery_areas JSONB column to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS delivery_areas JSONB DEFAULT '[]'::jsonb;
