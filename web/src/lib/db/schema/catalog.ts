import {
  pgTable, uuid, varchar, text, boolean, timestamp, numeric,
} from "drizzle-orm/pg-core"

// ─── Catalog Items ────────────────────────────────────────────────────────────
// MSP product/service catalog used in onboarding quotes.
// Items can be manually entered or synced from Shopify (Phase 8).

export const catalogItems = pgTable("catalog_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sku: varchar("sku", { length: 100 }),
  category: varchar("category", { length: 100 }),   // computer, peripheral, license, etc.
  supplier: varchar("supplier", { length: 255 }),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("ZAR").notNull(),
  // Shopify sync (Phase 8)
  shopifyProductId: varchar("shopify_product_id", { length: 100 }),
  shopifyVariantId: varchar("shopify_variant_id", { length: 100 }),
  shopifySyncedAt: timestamp("shopify_synced_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
