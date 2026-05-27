// ─── Role types ───────────────────────────────────────────────────────────────

export type UserRole =
  | "msp_super_admin"
  | "msp_technician"
  | "client_admin"
  | "client_user"
  | "client_approver"

// ─── Session user (stored in JWT) ─────────────────────────────────────────────

export interface SessionUser {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  role: UserRole
  isMspStaff: boolean
  organizationId: string          // Primary org
  organizationName: string
  organizationSlug: string
  organizationLogoUrl?: string | null
  crossOrgAccess: boolean
  accessibleOrgIds?: string[]     // All org IDs this user can access
  theme?: "light" | "dark" | "system"
  colorSwatch?: string | null
}

// ─── API response wrapper ─────────────────────────────────────────────────────

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
