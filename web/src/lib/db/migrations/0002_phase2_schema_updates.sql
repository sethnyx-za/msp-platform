-- Phase 2 schema updates
-- Adds contact fields to organizations, converts SLA columns to integer,
-- updates msp_branding report fields to html, and removes old text columns.

-- ─── organizations: add contact fields ────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone varchar(50),
  ADD COLUMN IF NOT EXISTS website varchar(255);

-- ─── organizations: convert SLA columns to integer ────────────────────────────
-- First add new integer columns
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS sla_hours_response_int integer,
  ADD COLUMN IF NOT EXISTS sla_hours_resolution_int integer;

-- Copy existing varchar values (if any) to the new integer columns
UPDATE organizations
  SET sla_hours_response_int = sla_hours_response::integer
  WHERE sla_hours_response IS NOT NULL AND sla_hours_response ~ '^\d+$';

UPDATE organizations
  SET sla_hours_resolution_int = sla_hours_resolution::integer
  WHERE sla_hours_resolution IS NOT NULL AND sla_hours_resolution ~ '^\d+$';

-- Drop old varchar columns
ALTER TABLE organizations
  DROP COLUMN IF EXISTS sla_hours_response,
  DROP COLUMN IF EXISTS sla_hours_resolution;

-- Rename new columns
ALTER TABLE organizations
  RENAME COLUMN sla_hours_response_int TO sla_hours_response;
ALTER TABLE organizations
  RENAME COLUMN sla_hours_resolution_int TO sla_hours_resolution;

-- ─── msp_branding: rename report text → html fields ──────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'msp_branding' AND column_name = 'report_header_text'
  ) THEN
    ALTER TABLE msp_branding RENAME COLUMN report_header_text TO report_header_html;
    ALTER TABLE msp_branding RENAME COLUMN report_footer_text TO report_footer_html;
  ELSE
    -- Columns were already named correctly (fresh install)
    ALTER TABLE msp_branding
      ADD COLUMN IF NOT EXISTS report_header_html text,
      ADD COLUMN IF NOT EXISTS report_footer_html text;
  END IF;
END $$;
