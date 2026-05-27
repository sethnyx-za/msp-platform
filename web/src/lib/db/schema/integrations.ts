import {
  pgTable, pgEnum, uuid, varchar, text, boolean,
  timestamp, integer, jsonb,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { organizations } from "./organizations"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const integrationTypeEnum = pgEnum("integration_type", [
  "atera",
  "unifi",
  "uisp",
  "shopify",
])

export const integrationStatusEnum = pgEnum("integration_status", [
  "connected",
  "error",
  "disabled",
  "never_synced",
])

// ─── Integration Configs ──────────────────────────────────────────────────────
// Stored at MSP org level. Credentials are AES-256 encrypted before storage.

export const integrationConfigs = pgTable("integration_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  type: integrationTypeEnum("type").notNull(),
  // Encrypted JSON blob: { apiKey?, username?, password?, baseUrl?, ... }
  credentialsEncrypted: text("credentials_encrypted"),
  syncEnabled: boolean("sync_enabled").default(false).notNull(),
  syncIntervalMinutes: integer("sync_interval_minutes").default(5).notNull(),
  status: integrationStatusEnum("status").default("never_synced").notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  lastErrorMessage: text("last_error_message"),
  consecutiveErrors: integer("consecutive_errors").default(0).notNull(),
  // Circuit breaker: stop syncing if too many consecutive errors
  circuitBroken: boolean("circuit_broken").default(false).notNull(),
  circuitBrokenAt: timestamp("circuit_broken_at"),
  metadata: jsonb("metadata"),  // Extra config per integration type
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Atera Customer Mappings ──────────────────────────────────────────────────
// Links an Atera customer ID to a client organisation.

export const ateraMappings = pgTable("atera_customer_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  ateraCustomerId: varchar("atera_customer_id", { length: 100 }).notNull(),
  ateraCustomerName: varchar("atera_customer_name", { length: 255 }),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ─── Unifi Site Mappings ──────────────────────────────────────────────────────
// Links a Unifi site to a client organisation.
//
// FABRIC NOTE (2025+): Unifi now supports Fabrics — customer groups each with
// their own scoped API key. Each client org maps to one Fabric. The API key
// and fabricId are stored in integration_configs.credentialsEncrypted for the
// client's "unifi" integration row. Sites discovered from that fabric are
// stored here with fabricId for reference.

export const unifiSiteMappings = pgTable("unifi_site_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  unifiSiteId: varchar("unifi_site_id", { length: 100 }).notNull(),
  unifiSiteName: varchar("unifi_site_name", { length: 255 }),
  // Fabric this site belongs to (from Unifi Site Manager)
  fabricId: varchar("fabric_id", { length: 100 }),
  fabricName: varchar("fabric_name", { length: 255 }),
  // "site_manager" (cloud/fabric) or "uisp" (self-hosted)
  source: varchar("source", { length: 20 }).default("site_manager").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ─── Sync Cache ───────────────────────────────────────────────────────────────
// Stores raw synced data per integration to serve the UI without hitting APIs
// on every request. Invalidated on next sync.

export const integrationSyncCache = pgTable("integration_sync_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  integrationType: integrationTypeEnum("integration_type").notNull(),
  dataKey: varchar("data_key", { length: 100 }).notNull(), // e.g. "devices", "alerts", "tickets"
  data: jsonb("data").notNull(),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const integrationConfigsRelations = relations(integrationConfigs, ({ one }) => ({
  organization: one(organizations, {
    fields: [integrationConfigs.organizationId],
    references: [organizations.id],
  }),
}))

export const ateraMappingsRelations = relations(ateraMappings, ({ one }) => ({
  organization: one(organizations, {
    fields: [ateraMappings.organizationId],
    references: [organizations.id],
  }),
}))

export const unifiSiteMappingsRelations = relations(unifiSiteMappings, ({ one }) => ({
  organization: one(organizations, {
    fields: [unifiSiteMappings.organizationId],
    references: [organizations.id],
  }),
}))
