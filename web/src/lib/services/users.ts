import { db } from "@/lib/db"
import { users, userOrganizationMemberships, organizations } from "@/lib/db/schema"
import { eq, and, desc, ilike, or, sql, ne, inArray } from "drizzle-orm"
import bcrypt from "bcryptjs"
import type { PaginationParams, PaginatedResponse, UserRole } from "@/types"

export interface CreateUserInput {
  email: string
  password: string
  name?: string | null
  isMspStaff?: boolean
  mustChangePwd?: boolean
}

export interface UpdateUserInput {
  email?: string
  name?: string | null
  isMspStaff?: boolean
  isActive?: boolean
  mustChangePwd?: boolean
}

export interface CreateMembershipInput {
  userId: string
  organizationId: string
  role: UserRole
  isPrimary?: boolean
  crossOrgAccess?: boolean
}

export type UserWithMemberships = typeof users.$inferSelect & {
  memberships: Array<
    typeof userOrganizationMemberships.$inferSelect & {
      organization: typeof organizations.$inferSelect
    }
  >
}

export async function getUsers(
  params: PaginationParams & { search?: string; organizationId?: string; isMspStaff?: boolean }
): Promise<PaginatedResponse<UserWithMemberships>> {
  const { page = 1, limit = 20, search, organizationId, isMspStaff } = params
  const offset = (page - 1) * limit

  // Build conditions on users table
  const userConditions = []
  if (search) {
    userConditions.push(
      or(ilike(users.email, `%${search}%`), ilike(users.name, `%${search}%`))
    )
  }
  if (typeof isMspStaff === "boolean") {
    userConditions.push(eq(users.isMspStaff, isMspStaff))
  }

  const userWhere = userConditions.length > 0 ? and(...userConditions) : undefined

  let userIds: string[]

  if (organizationId) {
    // Get users who are members of this org
    const memberships = await db
      .select({ userId: userOrganizationMemberships.userId })
      .from(userOrganizationMemberships)
      .where(eq(userOrganizationMemberships.organizationId, organizationId))
    userIds = memberships.map((m) => m.userId)
    if (userIds.length === 0) return { data: [], total: 0, page, limit, totalPages: 0 }
  }

  const finalConditions = userWhere ? [userWhere] : []
  if (organizationId && userIds!.length > 0) {
    finalConditions.push(inArray(users.id, userIds!))
  }
  const finalWhere = finalConditions.length > 0 ? and(...finalConditions) : undefined

  const [rows, countResult] = await Promise.all([
    db.select().from(users).where(finalWhere).orderBy(desc(users.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(finalWhere),
  ])

  const total = countResult[0]?.count ?? 0

  // Load memberships for each user
  const allMemberships = rows.length > 0
    ? await db
        .select({
          membership: userOrganizationMemberships,
          organization: organizations,
        })
        .from(userOrganizationMemberships)
        .innerJoin(organizations, eq(userOrganizationMemberships.organizationId, organizations.id))
        .where(inArray(userOrganizationMemberships.userId, rows.map((r) => r.id)))
    : []

  const membershipsByUser = new Map<string, UserWithMemberships["memberships"]>()
  for (const { membership, organization } of allMemberships) {
    if (!membershipsByUser.has(membership.userId)) membershipsByUser.set(membership.userId, [])
    membershipsByUser.get(membership.userId)!.push({ ...membership, organization })
  }

  const data: UserWithMemberships[] = rows.map((u) => ({
    ...u,
    memberships: membershipsByUser.get(u.id) ?? [],
  }))

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getUserById(id: string): Promise<UserWithMemberships | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!user) return null

  const memberships = await db
    .select({ membership: userOrganizationMemberships, organization: organizations })
    .from(userOrganizationMemberships)
    .innerJoin(organizations, eq(userOrganizationMemberships.organizationId, organizations.id))
    .where(eq(userOrganizationMemberships.userId, id))

  return {
    ...user,
    memberships: memberships.map(({ membership, organization }) => ({ ...membership, organization })),
  }
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1)
  return user ?? null
}

export async function createUser(input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, 12)

  const [user] = await db
    .insert(users)
    .values({
      // id omitted — PostgreSQL generates UUID via defaultRandom()
      email: input.email.toLowerCase(),
      passwordHash,
      // users.name is NOT NULL in schema — use empty string as fallback
      name: input.name ?? "",
      isMspStaff: input.isMspStaff ?? false,
      mustChangePwd: input.mustChangePwd ?? false,
      isActive: true,
    })
    .returning()

  return user
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const updates: Record<string, unknown> = { updatedAt: new Date() }

  if (input.email !== undefined) updates.email = input.email.toLowerCase()
  if (input.name !== undefined) updates.name = input.name ?? ""
  if (input.isMspStaff !== undefined) updates.isMspStaff = input.isMspStaff
  if (input.isActive !== undefined) updates.isActive = input.isActive
  if (input.mustChangePwd !== undefined) updates.mustChangePwd = input.mustChangePwd

  const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning()
  return updated ?? null
}

export async function resetUserPassword(id: string, newPassword: string, mustChangePwd = true) {
  const passwordHash = await bcrypt.hash(newPassword, 12)
  const [updated] = await db
    .update(users)
    .set({ passwordHash, mustChangePwd, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()
  return updated ?? null
}

export async function deactivateUser(id: string) {
  return updateUser(id, { isActive: false })
}

export async function reactivateUser(id: string) {
  return updateUser(id, { isActive: true })
}

export async function disableMfa(id: string) {
  const [updated] = await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()
  return updated ?? null
}

// Memberships

export async function addMembership(input: CreateMembershipInput) {
  if (input.isPrimary) {
    // Clear existing primary flag for this user
    await db
      .update(userOrganizationMemberships)
      .set({ isPrimary: false })
      .where(eq(userOrganizationMemberships.userId, input.userId))
  }

  const [membership] = await db
    .insert(userOrganizationMemberships)
    .values({
      // id omitted — PostgreSQL generates UUID via defaultRandom()
      userId: input.userId,
      organizationId: input.organizationId,
      role: input.role,
      isPrimary: input.isPrimary ?? false,
      crossOrgAccess: input.crossOrgAccess ?? false,
    })
    .onConflictDoUpdate({
      target: [userOrganizationMemberships.userId, userOrganizationMemberships.organizationId],
      set: {
        role: input.role,
        isPrimary: input.isPrimary ?? false,
        crossOrgAccess: input.crossOrgAccess ?? false,
        updatedAt: new Date(),
      },
    })
    .returning()

  return membership
}

export async function removeMembership(userId: string, organizationId: string) {
  await db
    .delete(userOrganizationMemberships)
    .where(
      and(
        eq(userOrganizationMemberships.userId, userId),
        eq(userOrganizationMemberships.organizationId, organizationId)
      )
    )
}

export async function updateMembershipRole(userId: string, organizationId: string, role: UserRole) {
  const [updated] = await db
    .update(userOrganizationMemberships)
    .set({ role, updatedAt: new Date() })
    .where(
      and(
        eq(userOrganizationMemberships.userId, userId),
        eq(userOrganizationMemberships.organizationId, organizationId)
      )
    )
    .returning()
  return updated ?? null
}

export async function checkEmailAvailable(email: string, excludeId?: string) {
  const normalized = email.toLowerCase()
  const conditions = [eq(users.email, normalized)]
  if (excludeId) conditions.push(ne(users.id, excludeId))
  const [existing] = await db.select({ id: users.id }).from(users).where(and(...conditions)).limit(1)
  return !existing
}
