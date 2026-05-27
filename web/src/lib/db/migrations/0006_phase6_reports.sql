-- Phase 6: Reporting
-- Creates report, report_source_files, report_schedules, and report_delivery_logs tables
-- if they don't already exist (idempotent).

CREATE TYPE IF NOT EXISTS report_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE IF NOT EXISTS report_frequency AS ENUM ('weekly', 'monthly', 'quarterly', 'on_demand');

CREATE TABLE IF NOT EXISTS reports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title                varchar(255) NOT NULL,
  period_start         date NOT NULL,
  period_end           date NOT NULL,
  status               report_status NOT NULL DEFAULT 'draft',
  includes_sub_orgs    boolean NOT NULL DEFAULT false,
  pdf_path             text,
  data_snapshot        jsonb,
  source_file_count    integer NOT NULL DEFAULT 0,
  generated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  generated_at         timestamp,
  published_at         timestamp,
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_source_files (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id            uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  original_filename    varchar(255) NOT NULL,
  file_path            text NOT NULL,
  file_type            varchar(50),
  row_count            integer,
  parsed_data          jsonb,
  uploaded_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at          timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_schedules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  frequency            report_frequency NOT NULL,
  scheduled_day        integer NOT NULL DEFAULT 1,
  recipient_user_ids   jsonb NOT NULL DEFAULT '[]',
  includes_sub_orgs    boolean NOT NULL DEFAULT false,
  is_active            boolean NOT NULL DEFAULT true,
  last_run_at          timestamp,
  next_run_at          timestamp,
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_delivery_logs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id            uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  recipient_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  recipient_email      varchar(255),
  status               varchar(20) NOT NULL,
  error_message        text,
  sent_at              timestamp NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_org_id ON reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_report_source_files_report_id ON report_source_files(report_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_org_id ON report_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run ON report_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_report_delivery_logs_report_id ON report_delivery_logs(report_id);
