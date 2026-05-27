import {
  pgTable, pgEnum, uuid, varchar, text, boolean, timestamp, integer, jsonb,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { users } from "./auth"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const notificationTypeEnum = pgEnum("notification_type", [
  "onboarding_submitted",
  "onboarding_approved",
  "onboarding_rejected",
  "report_ready",
  "ticket_created",
  "ticket_status_update",
  "alert_threshold",
  "warranty_expiry",
  "backup_completed",
  "backup_failed",
  "integration_error",
  "system",
])

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
  "skipped",
])

// ─── Email Config ─────────────────────────────────────────────────────────────
// Stored at MSP level. Credentials encrypted at rest.
// Provider options: "smtp" | "gmail" | "m365" | "zoho"
// For OAuth2 providers (gmail, m365): store OAuth2 tokens encrypted.
// For SMTP providers (smtp, zoho): use smtpUser + smtpPasswordEncrypted.

export const emailConfigs = pgTable("email_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Provider type
  provider: varchar("provider", { length: 20 }).default("smtp").notNull(),
  // SMTP outbound
  smtpHost: varchar("smtp_host", { length: 255 }),
  smtpPort: integer("smtp_port").default(587),
  smtpUser: varchar("smtp_user", { length: 255 }),
  smtpPasswordEncrypted: text("smtp_password_encrypted"),
  smtpSecure: boolean("smtp_secure").default(false),  // true = TLS on connect
  fromName: varchar("from_name", { length: 255 }),
  fromAddress: varchar("from_address", { length: 255 }),
  // OAuth2 fields (gmail / m365)
  oauthClientId: varchar("oauth_client_id", { length: 255 }),
  oauthClientSecretEncrypted: text("oauth_client_secret_encrypted"),
  oauthRefreshTokenEncrypted: text("oauth_refresh_token_encrypted"),
  oauthTenantId: varchar("oauth_tenant_id", { length: 255 }),  // M365 tenant ID
  // IMAP inbound (for parsing approval replies etc.)
  imapHost: varchar("imap_host", { length: 255 }),
  imapPort: integer("imap_port").default(993),
  imapUser: varchar("imap_user", { length: 255 }),
  imapPasswordEncrypted: text("imap_password_encrypted"),
  imapTls: boolean("imap_tls").default(true),
  // Which IMAP mailbox to poll for replies (default INBOX)
  imapMailbox: varchar("imap_mailbox", { length: 100 }).default("INBOX"),
  isActive: boolean("is_active").default(false).notNull(),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestSuccess: boolean("last_test_success"),
  lastTestError: text("last_test_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Notification Logs ────────────────────────────────────────────────────────

export const notificationLogs = pgTable("notification_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientUserId: uuid("recipient_user_id")
    .references(() => users.id, { onDelete: "set null" }),
  recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
  type: notificationTypeEnum("type").notNull(),
  subject: varchar("subject", { length: 500 }),
  status: notificationStatusEnum("status").default("pending").notNull(),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),   // { orgId, resourceId, resourceType, ... }
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ─── Notification Preferences ─────────────────────────────────────────────────

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  emailEnabled: boolean("email_enabled").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const notificationLogsRelations = relations(notificationLogs, ({ one }) => ({
  recipient: one(users, {
    fields: [notificationLogs.recipientUserId],
    references: [users.id],
  }),
}))
