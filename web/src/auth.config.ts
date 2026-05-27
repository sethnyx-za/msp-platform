/**
 * Edge-safe auth configuration
 *
 * Contains only JWT/session callbacks and page config — no Node.js-only
 * imports (no ioredis, bcryptjs, etc.).  This file is used by middleware.ts
 * which runs on the Edge runtime.
 *
 * The full server-side config (with the Credentials provider + Redis) lives
 * in src/auth.ts and is only imported from server components / API routes.
 */

import type { NextAuthConfig } from "next-auth"
import type { UserRole } from "@/types"

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt", maxAge: Number(process.env.SESSION_MAX_AGE ?? 28800) },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    // ── Enrich JWT with user profile + org context ────────────────────────
    async jwt({ token, user }) {
      if (user) {
        token.id            = user.id
        token.role          = user.role
        token.isMspStaff    = user.isMspStaff
        token.organizationId     = user.organizationId
        token.organizationName   = user.organizationName
        token.organizationSlug   = user.organizationSlug
        token.organizationLogoUrl = user.organizationLogoUrl
        token.crossOrgAccess     = user.crossOrgAccess
        token.accessibleOrgIds   = user.accessibleOrgIds
        token.theme        = user.theme
        token.colorSwatch  = user.colorSwatch
      }
      return token
    },

    // ── Expose JWT fields on the session object ───────────────────────────
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id:                  token.id                  as string,
        role:                token.role                as UserRole,
        isMspStaff:          token.isMspStaff          as boolean,
        organizationId:      token.organizationId      as string,
        organizationName:    token.organizationName    as string,
        organizationSlug:    token.organizationSlug    as string,
        organizationLogoUrl: token.organizationLogoUrl as string | null,
        crossOrgAccess:      token.crossOrgAccess      as boolean,
        accessibleOrgIds:    token.accessibleOrgIds    as string[],
        theme:               token.theme               as "light" | "dark" | "system",
        colorSwatch:         token.colorSwatch         as string | null,
      }
      return session
    },
  },

  // Providers are added in auth.ts (server-only)
  providers: [],
}
