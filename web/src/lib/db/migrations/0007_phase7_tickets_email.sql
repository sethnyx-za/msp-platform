-- Phase 7: Support Tickets + Email
-- Adds OAuth2/provider fields to email_configs, creates support_tickets table.

-- ─── email_configs: add provider + OAuth2 columns ─────────────────────────────
ALTER TABLE email_configs
  ADD COLUMN IF NOT EXISTS provider varchar(20) NOT NULL DEFAULT 'smtp',
  ADD COLUMN IF NOT EXISTS oauth_client_id varchar(255),
  ADD COLUMN IF NOT EXISTS oauth_client_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS oauth_tenant_id varchar(255),
  ADD COLUMN IF NOT EXISTS imap_mailbox varchar(100) DEFAULT 'INBOX',
  ADD COLUMN IF NOT EXISTS last_test_error text;

-- ─── support_tickets ──────────────────────────────────────────────────────────
CREATE TYPE IF NOT EXISTS ticket_status AS ENUM (
  'open', 'in_progress', 'pending_customer', 'resolved', 'closed'
);
CREATE TYPE IF NOT EXISTS ticket_priority AS ENUM (
  'low', 'medium', 'high', 'critical'
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submitted_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  title                 varchar(500) NOT NULL,
  description           text,
  category              varchar(100),
  status                ticket_status NOT NULL DEFAULT 'open',
  priority              ticket_priority NOT NULL DEFAULT 'medium',
  atera_ticket_id       varchar(100),
  atera_assignee_name   varchar(255),
  atera_synced_at       timestamp,
  atera_data            jsonb,
  resolved_at           timestamp,
  closed_at             timestamp,
  created_at            timestamp NOT NULL DEFAULT now(),
  updated_at            timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_org_id ON support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_atera_id ON support_tickets(atera_ticket_id) WHERE atera_ticket_id IS NOT NULL;
