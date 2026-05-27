import {
  pgTable, uuid, varchar, text, timestamp, jsonb, index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { users } from "./auth"

// ─── Audit Logs ───────────────────────────────────────────────────────────────
// Immutable append-only log of every significant action in the system.
// Never update or delete rows — add new rows only.
// Retention controlled by data_retention_configs table.

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Who did it (null = system/background job)
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userEmail: varchar("user_email", { length: 255 }),  // denormalised for retention
    // What org context the action happened in
    organizationId: uuid("organization_id"),
    // What happened
    action: varchar("action", { length: 100 }).notNull(),
    // e.g. "user.login", "asset.create", "onboarding.approve", "report.export"
    resourceType: varchar("resource_type", { length: 100 }),
    resourceId: uuid("resource_id"),
    resourceLabel: varchar("resource_label", { length: 255 }),  // human-readable
    // Change data
    previousValue: jsonb("previous_value"),
    newValue: jsonb("new_value"),
    // Request context
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    // Extra context
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Indexes for common query patterns
    userIdx: index("audit_logs_user_idx").on(table.userId),
    orgIdx: index("audit_logs_org_idx").on(table.organizationId),
    actionIdx: index("audit_logs_action_idx").on(table.action),
    createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  })
)

// ─── Relations ────────────────────────────────────────────────────────────────

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}))
