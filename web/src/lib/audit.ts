import { db } from "./db"
import { auditLogs } from "./db/schema"

export interface AuditLogEntry {
  userId?: string | null
  userEmail?: string | null
  organizationId?: string | null
  action: string
  resourceType?: string
  resourceId?: string
  resourceLabel?: string
  previousValue?: unknown
  newValue?: unknown
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

/**
 * Write an immutable audit log entry.
 * Call this after every significant mutation in the system.
 * Never throws — audit failures are logged but should not break operations.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      userEmail: entry.userEmail ?? null,
      organizationId: entry.organizationId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ? (entry.resourceId as string) : undefined,
      resourceLabel: entry.resourceLabel,
      previousValue: entry.previousValue ?? null,
      newValue: entry.newValue ?? null,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      metadata: entry.metadata ?? null,
    })
  } catch (err) {
    // Audit log failure should never crash the application
    console.error("[Audit] Failed to write audit log:", err)
  }
}

// ─── Pre-defined action constants ─────────────────────────────────────────────
// Use these instead of raw strings to keep the action space consistent.

export const AuditAction = {
  // Auth
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",
  USER_LOGIN_FAILED: "user.login_failed",
  USER_MFA_ENABLED: "user.mfa_enabled",
  USER_MFA_DISABLED: "user.mfa_disabled",
  USER_PASSWORD_CHANGED: "user.password_changed",
  USER_PASSWORD_RESET_REQUESTED: "user.password_reset_requested",

  // User management
  USER_CREATE: "user.created",
  USER_CREATED: "user.created",
  USER_UPDATE: "user.updated",
  USER_UPDATED: "user.updated",
  USER_DEACTIVATE: "user.deactivated",
  USER_DEACTIVATED: "user.deactivated",
  USER_ROLE_CHANGED: "user.role_changed",
  USER_PASSWORD_RESET: "user.password_reset",

  // Organisations
  ORG_CREATE: "org.created",
  ORG_CREATED: "org.created",
  ORG_UPDATE: "org.updated",
  ORG_UPDATED: "org.updated",
  ORG_DEACTIVATE: "org.deactivated",
  ORG_DEACTIVATED: "org.deactivated",

  // Assets
  ASSET_CREATED: "asset.created",
  ASSET_UPDATED: "asset.updated",
  ASSET_ARCHIVED: "asset.archived",
  ASSET_CSV_IMPORTED: "asset.csv_imported",
  ASSET_CSV_EXPORTED: "asset.csv_exported",

  // Onboarding
  ONBOARDING_SUBMITTED: "onboarding.submitted",
  ONBOARDING_APPROVED: "onboarding.approved",
  ONBOARDING_REJECTED: "onboarding.rejected",
  ONBOARDING_COMPLETED: "onboarding.completed",

  // Reports
  REPORT_GENERATED: "report.generated",
  REPORT_PUBLISHED: "report.published",
  REPORT_EXPORTED: "report.exported",
  REPORT_CSV_IMPORTED: "report.csv_imported",

  // Tickets
  TICKET_CREATED: "ticket.created",
  TICKET_UPDATED: "ticket.updated",

  // Documents
  DOCUMENT_UPLOADED: "document.uploaded",
  DOCUMENT_DOWNLOADED: "document.downloaded",
  DOCUMENT_DELETED: "document.deleted",

  // Settings
  INTEGRATION_CONFIGURED: "integration.configured",
  INTEGRATION_UPDATE: "integration.updated",
  SETTINGS_UPDATE: "settings.updated",
  BRANDING_UPDATED: "branding.updated",
  EMAIL_CONFIG_UPDATED: "email_config.updated",
  BACKUP_TRIGGERED: "backup.triggered",

  // Files
  FILE_UPLOAD: "file.uploaded",
} as const

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction]
