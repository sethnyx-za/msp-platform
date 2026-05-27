import {
  pgTable, pgEnum, uuid, varchar, text, timestamp, jsonb,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { organizations } from "./organizations"
import { users } from "./auth"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "pending_customer",
  "resolved",
  "closed",
])

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "low",
  "medium",
  "high",
  "critical",
])

// ─── Support Tickets ──────────────────────────────────────────────────────────
// Submitted by client users via the portal.
// On creation, a ticket is created in Atera via API.
// Atera sync job keeps status updated.

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  submittedByUserId: uuid("submitted_by_user_id")
    .references(() => users.id, { onDelete: "set null" }),

  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  status: ticketStatusEnum("status").default("open").notNull(),
  priority: ticketPriorityEnum("priority").default("medium").notNull(),

  // Atera integration
  ateraTicketId: varchar("atera_ticket_id", { length: 100 }),
  ateraAssigneeName: varchar("atera_assignee_name", { length: 255 }),
  ateraSyncedAt: timestamp("atera_synced_at"),
  // Raw atera ticket data snapshot
  ateraData: jsonb("atera_data"),

  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
  organization: one(organizations, {
    fields: [supportTickets.organizationId],
    references: [organizations.id],
  }),
  submittedBy: one(users, {
    fields: [supportTickets.submittedByUserId],
    references: [users.id],
  }),
}))
