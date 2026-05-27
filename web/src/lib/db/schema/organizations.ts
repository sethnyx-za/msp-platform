import {
  pgTable, uuid, varchar, text, boolean, timestamp, integer,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { userOrganizationMemberships } from "./memberships"
import { ateraMappings, unifiSiteMappings } from "./integrations"
import { assets } from "./assets"
import { onboardingSubmissions, onboardingLocations, onboardingSharedResources } from "./onboarding"
import { reports, reportSchedules } from "./reports"
import { supportTickets } from "./tickets"
import { clientDocuments } from "./documents"

// ─── Organizations ────────────────────────────────────────────────────────────
// Represents both MSP clients and the MSP itself.
// Parent/child hierarchy: Acme Holdings → Acme Cape Town, Acme JHB, etc.
// The MSP organisation is identified by having no parent and isMspOrg = true.

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(), // URL-safe identifier
  parentId: uuid("parent_id").references((): AnyPgColumn => organizations.id, {
    onDelete: "set null",
  }),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 7 }).default("#3B82F6"),
  secondaryColor: varchar("secondary_color", { length: 7 }).default("#1E40AF"),
  isMspOrg: boolean("is_msp_org").default(false).notNull(),   // true for the MSP itself
  isMaster: boolean("is_master").default(false).notNull(),    // true for parent companies
  isActive: boolean("is_active").default(true).notNull(),
  // Contact details
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  website: varchar("website", { length: 255 }),
  // SLA reference (defined at master level, inherited by children)
  slaHoursResponse: integer("sla_hours_response"),
  slaHoursResolution: integer("sla_hours_resolution"),
  notes: text("notes"),                                        // internal MSP notes
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  parent: one(organizations, {
    fields: [organizations.parentId],
    references: [organizations.id],
    relationName: "parent_child",
  }),
  children: many(organizations, { relationName: "parent_child" }),
  memberships: many(userOrganizationMemberships),
  ateraMappings: many(ateraMappings),
  unifiSiteMappings: many(unifiSiteMappings),
  assets: many(assets),
  onboardingSubmissions: many(onboardingSubmissions),
  onboardingLocations: many(onboardingLocations),
  onboardingSharedResources: many(onboardingSharedResources),
  reports: many(reports),
  reportSchedules: many(reportSchedules),
  supportTickets: many(supportTickets),
  clientDocuments: many(clientDocuments),
}))
