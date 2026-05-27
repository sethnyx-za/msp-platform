import type { UserRole, SessionUser } from "@/types"

// ─── Role hierarchy ───────────────────────────────────────────────────────────
// Higher index = more permissions.

const ROLE_HIERARCHY: UserRole[] = [
  "client_user",
  "client_approver",
  "client_admin",
  "msp_technician",
  "msp_super_admin",
]

/**
 * Check if a role has at least the required minimum role.
 */
export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(minRole)
}

/**
 * Check if a user is MSP staff.
 */
export function isMspStaff(user: SessionUser): boolean {
  return user.isMspStaff === true
}

/**
 * Check if a user is an MSP super admin.
 */
export function isSuperAdmin(user: SessionUser): boolean {
  return user.role === "msp_super_admin"
}

/**
 * Check if a user can manage a given organisation.
 * MSP staff can manage any client. Clients can only manage their own org.
 * Users with crossOrgAccess can manage child orgs of their primary org.
 */
export function canManageOrg(user: SessionUser, targetOrgId: string): boolean {
  if (isMspStaff(user)) return true
  if (user.organizationId === targetOrgId) return true
  if (user.crossOrgAccess && user.accessibleOrgIds?.includes(targetOrgId)) return true
  return false
}

/**
 * Check if a user can approve onboarding for an organisation.
 */
export function canApproveOnboarding(user: SessionUser, targetOrgId: string): boolean {
  if (isMspStaff(user)) return true
  if (!canManageOrg(user, targetOrgId)) return false
  return user.role === "client_approver" || user.role === "client_admin"
}

/**
 * Check if a user can view sensitive documents (network diagrams etc.).
 */
export function canViewSensitiveDocuments(user: SessionUser, targetOrgId: string): boolean {
  if (isMspStaff(user)) return true
  if (!canManageOrg(user, targetOrgId)) return false
  return user.role === "client_admin"
}

/**
 * Check if a user can upload documents.
 */
export function canUploadDocuments(user: SessionUser, targetOrgId: string): boolean {
  if (isMspStaff(user)) return true
  if (!canManageOrg(user, targetOrgId)) return false
  return user.role === "client_admin"
}

/**
 * Return all org IDs a user has access to (own org + cross-org children).
 */
export function getAccessibleOrgIds(user: SessionUser): string[] {
  const ids = new Set<string>()
  if (user.organizationId) ids.add(user.organizationId)
  if (user.crossOrgAccess && user.accessibleOrgIds) {
    user.accessibleOrgIds.forEach((id) => ids.add(id))
  }
  return Array.from(ids)
}

// ─── Route-level permission map ───────────────────────────────────────────────
// Used by middleware to determine which roles can access which route prefixes.

export const ROUTE_PERMISSIONS: Record<string, UserRole> = {
  "/admin":            "msp_technician",   // MSP staff only
  "/admin/settings":   "msp_super_admin",  // Super admin only
  "/admin/users":      "msp_super_admin",
  "/admin/branding":   "msp_super_admin",
  "/dashboard":        "client_user",      // Any authenticated user
  "/onboarding":       "client_user",
  "/assets":           "client_user",
  "/reports":          "client_user",
  "/status":           "client_user",
  "/tickets":          "client_user",
  "/documents":        "client_user",
  "/profile":          "client_user",
}

/**
 * Determine the required role for a given pathname.
 * Returns null if the route requires no role (public).
 */
export function getRequiredRole(pathname: string): UserRole | null {
  // Find the most specific matching prefix
  const match = Object.entries(ROUTE_PERMISSIONS)
    .filter(([prefix]) => pathname.startsWith(prefix))
    .sort(([a], [b]) => b.length - a.length)[0]

  return match ? match[1] : null
}
