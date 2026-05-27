import {
  pgTable, uuid, varchar, text, boolean, timestamp, jsonb,
} from "drizzle-orm/pg-core"

// ─── MSP Branding ─────────────────────────────────────────────────────────────
// Single row table — the MSP's global branding applied across all client portals.

export const mspBranding = pgTable("msp_branding", {
  id: uuid("id").primaryKey().defaultRandom(),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  companyName: varchar("company_name", { length: 255 }).notNull().default("My MSP"),
  primaryColor: varchar("primary_color", { length: 7 }).default("#3B82F6"),
  accentColor: varchar("accent_color", { length: 7 }).default("#1E40AF"),
  defaultTheme: varchar("default_theme", { length: 10 }).default("system"),
  // Report branding
  reportHeaderHtml: text("report_header_html"),
  reportFooterHtml: text("report_footer_html"),
  reportLogoUrl: text("report_logo_url"),
  // Email branding
  emailFooterHtml: text("email_footer_html"),
  emailLogoUrl: text("email_logo_url"),
  // Contact info shown in portal footer
  supportEmail: varchar("support_email", { length: 255 }),
  supportPhone: varchar("support_phone", { length: 50 }),
  websiteUrl: varchar("website_url", { length: 500 }),
  // Custom CSS (advanced — injected into portal <head>)
  customCss: text("custom_css"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── MSP Settings ─────────────────────────────────────────────────────────────
// Key-value store for platform-wide settings not covered by other tables.

export const mspSettings = pgTable("msp_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: jsonb("value"),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Onboarding Ticket Routing ────────────────────────────────────────────────
// Configures where Atera tickets go when an onboarding is approved.

export const onboardingTicketConfigs = pgTable("onboarding_ticket_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  // null = global default; set organizationId for per-client override
  organizationId: uuid("organization_id"),
  ateraQueueId: varchar("atera_queue_id", { length: 100 }),
  ateraQueueName: varchar("atera_queue_name", { length: 255 }),
  ateraAssigneeTechnicianId: varchar("atera_assignee_technician_id", { length: 100 }),
  ateraAssigneeName: varchar("atera_assignee_name", { length: 255 }),
  // Ticket template
  ticketTitleTemplate: varchar("ticket_title_template", { length: 500 })
    .default("New Starter Onboarding: {{starter_name}}"),
  ticketPriority: varchar("ticket_priority", { length: 20 }).default("medium"),
  isDefault: boolean("is_default").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
