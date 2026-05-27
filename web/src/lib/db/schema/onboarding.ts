import {
  pgTable, pgEnum, uuid, varchar, text, boolean,
  timestamp, date, numeric, integer,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { organizations } from "./organizations"
import { users } from "./auth"
import { catalogItems } from "./catalog"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "completed",
  "cancelled",
])

export const lineItemCategoryEnum = pgEnum("line_item_category", [
  "computer",
  "peripheral",
  "monitor",
  "license",
  "service",
  "other",
])

// ─── MSP-configured options (global, not per-client) ─────────────────────────

// Building access locations the MSP manages
export const onboardingLocations = pgTable("onboarding_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")           // MSP org or specific client org
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// Shared resources (file shares, drives, applications, printers)
export const onboardingSharedResources = pgTable("onboarding_shared_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ─── Onboarding Submissions ───────────────────────────────────────────────────

export const onboardingSubmissions = pgTable("onboarding_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  submittedByUserId: uuid("submitted_by_user_id")
    .references(() => users.id, { onDelete: "set null" }),

  status: onboardingStatusEnum("status").default("draft").notNull(),

  // New starter details
  starterFirstName: varchar("starter_first_name", { length: 100 }).notNull(),
  starterLastName: varchar("starter_last_name", { length: 100 }).notNull(),
  starterEmail: varchar("starter_email", { length: 255 }),
  starterPhone: varchar("starter_phone", { length: 50 }),
  starterJobTitle: varchar("starter_job_title", { length: 255 }),
  startDate: date("start_date"),
  phoneExtension: varchar("phone_extension", { length: 20 }),

  // Quote
  totalQuotedPrice: numeric("total_quoted_price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("ZAR"),
  quoteNotes: text("quote_notes"),

  // Atera integration: ticket created after approval
  ateraTicketId: varchar("atera_ticket_id", { length: 100 }),

  // Rejection reason
  rejectionReason: text("rejection_reason"),

  submittedAt: timestamp("submitted_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Line Items (equipment / services on the quote) ──────────────────────────

export const onboardingLineItems = pgTable("onboarding_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => onboardingSubmissions.id, { onDelete: "cascade" }),
  catalogItemId: uuid("catalog_item_id")
    .references(() => catalogItems.id, { onDelete: "set null" }),

  category: lineItemCategoryEnum("category").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  supplier: varchar("supplier", { length: 255 }),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
})

// ─── Building Access Selections ───────────────────────────────────────────────

export const onboardingAccessSelections = pgTable("onboarding_access_selections", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => onboardingSubmissions.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => onboardingLocations.id, { onDelete: "cascade" }),
  granted: boolean("granted").default(false).notNull(),
})

// ─── Shared Resource Selections ───────────────────────────────────────────────

export const onboardingResourceSelections = pgTable("onboarding_resource_selections", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => onboardingSubmissions.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id")
    .notNull()
    .references(() => onboardingSharedResources.id, { onDelete: "cascade" }),
  granted: boolean("granted").default(false).notNull(),
})

// ─── Approvals ────────────────────────────────────────────────────────────────

export const onboardingApprovals = pgTable("onboarding_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => onboardingSubmissions.id, { onDelete: "cascade" }),
  approvedByUserId: uuid("approved_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  action: varchar("action", { length: 10 }).notNull(), // "approved" | "rejected"
  notes: text("notes"),
  approvedAt: timestamp("approved_at").defaultNow().notNull(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const submissionsRelations = relations(onboardingSubmissions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [onboardingSubmissions.organizationId],
    references: [organizations.id],
  }),
  submittedBy: one(users, {
    fields: [onboardingSubmissions.submittedByUserId],
    references: [users.id],
  }),
  lineItems: many(onboardingLineItems),
  accessSelections: many(onboardingAccessSelections),
  resourceSelections: many(onboardingResourceSelections),
  approvals: many(onboardingApprovals),
}))

export const approvalsRelations = relations(onboardingApprovals, ({ one }) => ({
  submission: one(onboardingSubmissions, {
    fields: [onboardingApprovals.submissionId],
    references: [onboardingSubmissions.id],
  }),
  approvedBy: one(users, {
    fields: [onboardingApprovals.approvedByUserId],
    references: [users.id],
  }),
}))
