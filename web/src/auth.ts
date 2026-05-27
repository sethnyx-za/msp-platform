/**
 * Full server-side auth config
 *
 * Extends authConfig with the Credentials provider that uses ioredis +
 * bcryptjs.  Only import this from server components and API routes — never
 * from middleware (use authConfig directly there).
 */

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { authConfig } from "./auth.config"
import { db } from "@/lib/db"
import { users, userOrganizationMemberships, organizations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { redis, RedisKeys } from "@/lib/redis"

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      // The only credential NextAuth accepts is a one-time mfaBypassKey.
      // All password/TOTP verification happens in /api/auth/login and
      // /api/auth/verify-mfa BEFORE this point. This keeps the auth logic
      // centralised and prevents credential bypass.
      credentials: {
        mfaBypassKey: { type: "text" },
      },

      async authorize(credentials) {
        const { mfaBypassKey } = credentials as { mfaBypassKey?: string }
        if (!mfaBypassKey) return null

        // One-time Redis key set by /api/auth/login or /api/auth/verify-mfa
        const userId = await redis.getdel(RedisKeys.mfaBypass(mfaBypassKey))
        if (!userId) return null

        // Load user + primary membership + org
        const user = await db.query.users.findFirst({
          where: and(eq(users.id, userId), eq(users.isActive, true)),
        })
        if (!user) return null

        // Get primary org membership
        const membership = await db.query.userOrganizationMemberships.findFirst({
          where: and(
            eq(userOrganizationMemberships.userId, user.id),
            eq(userOrganizationMemberships.isActive, true),
            eq(userOrganizationMemberships.isPrimary, true)
          ),
          with: { organization: true },
        })

        // Fall back to any active membership if no primary set
        const anyMembership = membership ?? await db.query.userOrganizationMemberships.findFirst({
          where: and(
            eq(userOrganizationMemberships.userId, user.id),
            eq(userOrganizationMemberships.isActive, true)
          ),
          with: { organization: true },
        })

        if (!anyMembership) return null

        const org = anyMembership.organization as typeof organizations.$inferSelect

        // Get all accessible org IDs (for cross-org users)
        let accessibleOrgIds: string[] = [org.id]
        if (anyMembership.crossOrgAccess && org.isMaster) {
          const children = await db.query.organizations.findMany({
            where: eq(organizations.parentId, org.id),
            columns: { id: true },
          })
          accessibleOrgIds = [org.id, ...children.map((c) => c.id)]
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          role: anyMembership.role,
          isMspStaff: user.isMspStaff,
          organizationId: org.id,
          organizationName: org.name,
          organizationSlug: org.slug,
          organizationLogoUrl: org.logoUrl,
          crossOrgAccess: anyMembership.crossOrgAccess,
          accessibleOrgIds,
          theme: user.theme as "light" | "dark" | "system",
          colorSwatch: user.colorSwatch,
        }
      },
    }),
  ],
})
