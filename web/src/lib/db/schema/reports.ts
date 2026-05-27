import {
  pgTable, pgEnum, uuid, varchar, text, boolean,
  timestamp, date, jsonb, integer,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { organizations } from "./organizations"
import { users } from "./auth"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const reportStatusEnum = pgEnum("report_status", [
  "draft",
  "published",
  "archived",
])

export const reportFrequencyEnum = pgEnum("report_frequency", [
  "weekly",
  "monthly",
  "quarterly",
  "on_demand",
])

// ─── Reports ──────────────────────────────────────────────────────────────────

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: reportStatusEnum("status").default("draft").notNull(),
  // Whether child org data was rolled up into this report
  includesSubOrgs: boolean("includes_sub_orgs").default(false).notNull(),
  // Path to generated PDF in uploads/reports/
  pdfPath: text("pdf_path"),
  // Snapshot of all analytics data at generation time (for re-rendering)
  dataSnapshot: jsonb("data_snapshot"),
  // Source CSV files that were imported to generate this report
  sourceFileCount: integer("source_file_count").default(0).notNull(),
  generatedByUserId: uuid("generated_by_user_id")
    .references(() => users.id, { onDelete: "set null" }),
  generatedAt: timestamp("generated_at"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Report Source Files (imported CSVs) ──────────────────────────────────────

export const reportSourceFiles = pgTable("report_source_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  filePath: text("file_path").notNull(),
  fileType: varchar("file_type", { length: 50 }),  // "atera_tickets", "atera_agents", etc.
  rowCount: integer("row_count"),
  parsedData: jsonb("parsed_data"),   // Normalised data after parsing
  uploadedByUserId: uuid("uploaded_by_user_id")
    .references(() => users.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
})

// ─── Report Schedules ─────────────────────────────────────────────────────────

export const reportSchedules = pgTable("report_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  frequency: reportFrequencyEnum("frequency").notNull(),
  // Day of month (1–28) for monthly, day of week (1–7) for weekly
  scheduledDay: integer("scheduled_day").default(1).notNull(),
  // Comma-separated user IDs to email the report to
  recipientUserIds: jsonb("recipient_user_ids").default([]).notNull(),
  includesSubOrgs: boolean("includes_sub_orgs").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Report Delivery Log ──────────────────────────────────────────────────────

export const reportDeliveryLogs = pgTable("report_delivery_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  recipientUserId: uuid("recipient_user_id")
    .references(() => users.id, { onDelete: "set null" }),
  recipientEmail: varchar("recipient_email", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull(), // "sent" | "failed" | "bounced"
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const reportsRelations = relations(reports, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [reports.organizationId],
    references: [organizations.id],
  }),
  generatedBy: one(users, {
    fields: [reports.generatedByUserId],
    references: [users.id],
  }),
  sourceFiles: many(reportSourceFiles),
  deliveryLogs: many(reportDeliveryLogs),
}))

export const reportSchedulesRelations = relations(reportSchedules, ({ one }) => ({
  organization: one(organizations, {
    fields: [reportSchedules.organizationId],
    references: [organizations.id],
  }),
}))
