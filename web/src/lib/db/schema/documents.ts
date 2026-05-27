import {
  pgTable, pgEnum, uuid, varchar, text, boolean, timestamp, integer,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { organizations } from "./organizations"
import { users } from "./auth"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const documentCategoryEnum = pgEnum("document_category", [
  "network_diagram",
  "contract",
  "nda",
  "report",
  "onboarding",
  "other",
])

export const documentVisibilityEnum = pgEnum("document_visibility", [
  "admin_only",         // client_admin and MSP staff only
  "all_client_users",  // all users in the org
])

// ─── Client Documents ─────────────────────────────────────────────────────────
// Secure file storage per client. Files are served through an authenticated
// API route — no direct public URLs. Network diagrams are admin_only.

export const clientDocuments = pgTable("client_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: documentCategoryEnum("category").default("other").notNull(),
  // Relative path within /app/uploads/ — never expose absolute paths
  filePath: text("file_path").notNull(),
  originalFilename: varchar("original_filename", { length: 255 }),
  mimeType: varchar("mime_type", { length: 100 }),
  fileSizeBytes: integer("file_size_bytes"),

  visibility: documentVisibilityEnum("visibility").default("admin_only").notNull(),
  isActive: boolean("is_active").default(true).notNull(),

  uploadedByUserId: uuid("uploaded_by_user_id")
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const clientDocumentsRelations = relations(clientDocuments, ({ one }) => ({
  organization: one(organizations, {
    fields: [clientDocuments.organizationId],
    references: [organizations.id],
  }),
  uploadedBy: one(users, {
    fields: [clientDocuments.uploadedByUserId],
    references: [users.id],
  }),
}))
