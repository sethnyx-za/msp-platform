import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import { users, userOrganizationMemberships, organizations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { redis, RedisKeys } from "@/lib/redis"
import type { UserRole } from "@/types"

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: Number(process.env.SESSION_MAX_AGE ?? 28800) },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    // ── Enrich JWT with user profile + org context ────────────────────────
    async jwt({ token, user }) {
      if (user) {
        // On sign-in, copy all custom fields from the User object to the token
        token.id = user.id
        token.role = user.role
        token.isMspStaff = user.isMspStaff
        token.organizationId = user.organizationId
        token.organizationName = user.organizationName
        token.organizationSlug = user.organizationSlug
        token.organizationLogoUrl = user.organizationLogoUrl
        token.crossOrgAccess = user.crossOrgAccess
        token.accessibleOrgIds = user.accessibleOrgIds
        token.theme = user.theme
        token.colorSwatch = user.colorSwatch
      }
      return token
    },

    // ── Expose JWT fields on the session object ───────────────────────────
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id as string,
        role: token.role as UserRole,
        isMspStaff: token.isMspStaff as boolean,
        organizationId: token.organizationId as string,
        organizationName: token.organizationName as string,
        organizationSlug: token.organizationSlug as string,
        organizationLogoUrl: token.organizationLogoUrl as string | null,
        crossOrgAccess: token.crossOrgAccess as boolean,
        accessibleOrgIds: token.accessibleOrgIds as string[],
        theme: token.theme as "light" | "dark" | "system",
        colorSwatch: token.colorSwatch as string | null,
      }
      return session
    },
  },

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
          role: anyMembership.role as UserRole,
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
