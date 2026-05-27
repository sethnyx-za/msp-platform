import {
  pgTable, pgEnum, uuid, varchar, text, boolean,
  timestamp, date, numeric, integer, jsonb,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { organizations } from "./organizations"
import { users } from "./auth"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const assetCategoryEnum = pgEnum("asset_category", [
  "computer",
  "screen",
  "printer",
  "server",
  "network_equipment",
  "other",
])

export const assetStatusEnum = pgEnum("asset_status", [
  "active",
  "inactive",
  "in_maintenance",
  "retired",
  "disposed",
  "missing",
])

// ─── Assets ───────────────────────────────────────────────────────────────────
// Manual + Atera-synced asset registry per client organisation.
// Fields prefixed with "atera_" are populated/updated by the Atera sync job.
// If the user manually edits an atera_ field, syncOverride = true for that field.

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  // Core identity
  category: assetCategoryEnum("category").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  make: varchar("make", { length: 100 }),
  model: varchar("model", { length: 255 }),
  serialNumber: varchar("serial_number", { length: 255 }),

  // Status
  status: assetStatusEnum("status").default("active").notNull(),

  // Financial
  purchaseDate: date("purchase_date"),
  purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }),
  warrantyExpiryDate: date("warranty_expiry_date"),

  // Location / assignment
  assignedToName: varchar("assigned_to_name", { length: 255 }),
  location: varchar("location", { length: 255 }),

  // Atera agent data (computers/servers only)
  ateraAgentId: varchar("atera_agent_id", { length: 100 }),
  ateraDeviceGuid: varchar("atera_device_guid", { length: 100 }),
  osName: varchar("os_name", { length: 100 }),
  osVersion: varchar("os_version", { length: 100 }),
  diskUsagePercent: integer("disk_usage_percent"),     // 0–100
  diskTotalGb: numeric("disk_total_gb", { precision: 8, scale: 2 }),
  diskFreeGb: numeric("disk_free_gb", { precision: 8, scale: 2 }),
  ramGb: integer("ram_gb"),
  cpuName: varchar("cpu_name", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 45 }),   // IPv4 or IPv6
  macAddress: varchar("mac_address", { length: 17 }),
  lastSeenAt: timestamp("last_seen_at"),               // From Atera agent
  patchStatus: varchar("patch_status", { length: 50 }),
  avStatus: varchar("av_status", { length: 50 }),
  avDefinitionDate: date("av_definition_date"),

  // Sync metadata
  ateraSyncedAt: timestamp("atera_synced_at"),
  // JSON map of which fields have been manually overridden
  syncOverrides: jsonb("sync_overrides").default({}).notNull(),

  notes: text("notes"),
  createdByUserId: uuid("created_by_user_id")
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const assetsRelations = relations(assets, ({ one }) => ({
  organization: one(organizations, {
    fields: [assets.organizationId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [assets.createdByUserId],
    references: [users.id],
  }),
}))
