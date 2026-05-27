import {
  pgTable, pgEnum, text, boolean, timestamp, varchar, uuid,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { userOrganizationMemberships } from "./memberships"
import { auditLogs } from "./audit"
import { onboardingApprovals } from "./onboarding"
import { notificationLogs } from "./notifications"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userThemeEnum = pgEnum("user_theme", ["light", "dark", "system"])

// ─── Users ────────────────────────────────────────────────────────────────────
// Central user table. MSP staff and client users share this table,
// distinguished by is_msp_staff and their memberships.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash"),            // null for future OAuth users
  totpSecret: text("totp_secret"),                // AES-256 encrypted
  totpEnabled: boolean("totp_enabled").default(false).notNull(),
  avatarUrl: text("avatar_url"),
  theme: userThemeEnum("theme").default("system").notNull(),
  colorSwatch: varchar("color_swatch", { length: 7 }),  // hex e.g. #3B82F6
  isMspStaff: boolean("is_msp_staff").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  mustChangePwd: boolean("must_change_password").default(false).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ─── Password reset tokens ────────────────────────────────────────────────────

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(), // SHA-256 of the actual token
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ─── OAuth accounts (for Phase 7 Google / M365 / Zoho) ───────────────────────
// Stub table — populated when OAuth providers are enabled

export const oauthAccounts = pgTable("oauth_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),   // "google" | "microsoft" | "zoho"
  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(userOrganizationMemberships),
  auditLogs: many(auditLogs),
  approvals: many(onboardingApprovals),
  notifications: many(notificationLogs),
  oauthAccounts: many(oauthAccounts),
  passwordResetTokens: many(passwordResetTokens),
}))
