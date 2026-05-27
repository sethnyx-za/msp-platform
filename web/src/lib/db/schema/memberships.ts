import {
  pgTable, pgEnum, uuid, boolean, timestamp, unique,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { users } from "./auth"
import { organizations } from "./organizations"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "msp_super_admin",   // Full platform access
  "msp_technician",    // Access to assigned clients only
  "client_admin",      // Full access to their org + upload docs
  "client_user",       // Read-only access to their org
  "client_approver",   // Can approve onboarding + read access
])

// ─── User–Organisation Memberships ───────────────────────────────────────────
// A user can belong to multiple organisations with different roles.
// e.g. a cross-org approver belongs to the parent org with client_approver role
// and has cross_org_access = true to act on all child orgs.

export const userOrganizationMemberships = pgTable(
  "user_organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    // Cross-org: if true, this membership grants access to all child orgs
    // Typically used for parent-company approvers and MSP technicians
    crossOrgAccess: boolean("cross_org_access").default(false).notNull(),
    // Primary org: the org shown first when user logs in
    isPrimary: boolean("is_primary").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // A user can only have one membership per organisation
    uniqueUserOrg: unique("uq_user_org").on(table.userId, table.organizationId),
  })
)

// ─── Relations ────────────────────────────────────────────────────────────────

export const membershipRelations = relations(userOrganizationMemberships, ({ one }) => ({
  user: one(users, {
    fields: [userOrganizationMemberships.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userOrganizationMemberships.organizationId],
    references: [organizations.id],
  }),
}))
