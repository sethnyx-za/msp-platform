import type { UserRole, SessionUser } from "./index"

declare module "next-auth" {
  interface Session {
    user: SessionUser
  }

  interface User {
    id: string
    email: string
    name: string
    avatarUrl?: string | null
    role: UserRole
    isMspStaff: boolean
    organizationId: string
    organizationName: string
    organizationSlug: string
    organizationLogoUrl?: string | null
    crossOrgAccess: boolean
    accessibleOrgIds?: string[]
    theme?: "light" | "dark" | "system"
    colorSwatch?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: UserRole
    isMspStaff: boolean
    organizationId: string
    organizationName: string
    organizationSlug: string
    organizationLogoUrl?: string | null
    crossOrgAccess: boolean
    accessibleOrgIds?: string[]
    theme?: "light" | "dark" | "system"
    colorSwatch?: string | null
  }
}
