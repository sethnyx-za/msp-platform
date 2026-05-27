import {
  pgTable, pgEnum, uuid, varchar, text, boolean, timestamp, integer, jsonb,
} from "drizzle-orm/pg-core"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const backupDestinationTypeEnum = pgEnum("backup_destination_type", [
  "local",
  "s3",
  "sftp",
  "onedrive",
  "google_drive",
])

export const backupStatusEnum = pgEnum("backup_status", [
  "success",
  "failed",
  "running",
  "partial",
])

// ─── Backup Destination Configs ───────────────────────────────────────────────
// Each row is one rclone destination. Credentials encrypted at rest.
// The backup container reads from rclone.conf directly; this table drives
// the admin UI and rclone.conf regeneration.

export const backupDestinations = pgTable("backup_destinations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),   // human label e.g. "Backblaze B2"
  type: backupDestinationTypeEnum("type").notNull(),
  rcloneRemoteName: varchar("rclone_remote_name", { length: 50 }).notNull(),
  // Encrypted JSON of the rclone config fields for this remote
  configEncrypted: text("config_encrypted"),
  isActive: boolean("is_active").default(true).notNull(),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestSuccess: boolean("last_test_success"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Backup Run Logs ──────────────────────────────────────────────────────────

export const backupLogs = pgTable("backup_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: backupStatusEnum("status").notNull(),
  dbFilePath: text("db_file_path"),
  dbFileSizeBytes: integer("db_file_size_bytes"),
  uploadsFilePath: text("uploads_file_path"),
  uploadFileSizeBytes: integer("upload_file_size_bytes"),
  destinationsSynced: jsonb("destinations_synced").default([]),  // [{name, success, error}]
  errorMessage: text("error_message"),
  durationSeconds: integer("duration_seconds"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
})

// ─── Data Retention Config ────────────────────────────────────────────────────

export const dataRetentionConfigs = pgTable("data_retention_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  resourceType: varchar("resource_type", { length: 100 }).notNull().unique(),
  // e.g. "audit_logs", "reports", "support_tickets", "notification_logs"
  retentionDays: integer("retention_days").default(365).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
