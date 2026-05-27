import { db } from "@/lib/db"
import { organizations } from "@/lib/db/schema"
import { eq, and, isNull, desc, ilike, or, sql, ne } from "drizzle-orm"
import { nanoid } from "nanoid"
import { slugify } from "@/lib/utils"
import type { PaginationParams, PaginatedResponse } from "@/types"

export interface CreateOrganizationInput {
  name: string
  slug?: string
  parentId?: string | null
  isMspOrg?: boolean
  isMaster?: boolean
  address?: string | null
  phone?: string | null
  website?: string | null
  logoUrl?: string | null
  primaryColor?: string | null
  slaHoursResponse?: number | null
  slaHoursResolution?: number | null
}

export interface UpdateOrganizationInput extends Partial<CreateOrganizationInput> {}

export async function getOrganizations(
  params: PaginationParams & { search?: string; parentId?: string | null; isMspOrg?: boolean }
): Promise<PaginatedResponse<typeof organizations.$inferSelect>> {
  const { page = 1, limit = 20, search, parentId, isMspOrg } = params
  const offset = (page - 1) * limit

  const conditions = []
  if (search) {
    conditions.push(
      or(
        ilike(organizations.name, `%${search}%`),
        ilike(organizations.slug, `%${search}%`)
      )
    )
  }
  if (typeof isMspOrg === "boolean") {
    conditions.push(eq(organizations.isMspOrg, isMspOrg))
  }
  if (parentId !== undefined) {
    conditions.push(parentId === null ? isNull(organizations.parentId) : eq(organizations.parentId, parentId))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(organizations)
      .where(where)
      .orderBy(desc(organizations.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(organizations).where(where),
  ])

  const total = countResult[0]?.count ?? 0
  return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getOrganizationById(id: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1)
  return org ?? null
}

export async function getOrganizationBySlug(slug: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1)
  return org ?? null
}

export async function getClientOrganizations(
  params: PaginationParams & { search?: string; parentId?: string | null }
) {
  return getOrganizations({ ...params, isMspOrg: false })
}

export async function getChildOrganizations(parentId: string) {
  return db.select().from(organizations).where(eq(organizations.parentId, parentId)).orderBy(organizations.name)
}

export async function createOrganization(input: CreateOrganizationInput) {
  const slug = input.slug ?? slugify(input.name) + "-" + nanoid(6)

  const [org] = await db
    .insert(organizations)
    .values({
      // id omitted — PostgreSQL generates UUID via defaultRandom()
      name: input.name,
      slug,
      parentId: input.parentId ?? null,
      isMspOrg: input.isMspOrg ?? false,
      isMaster: input.isMaster ?? false,
      address: input.address ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      logoUrl: input.logoUrl ?? null,
      primaryColor: input.primaryColor ?? null,
      slaHoursResponse: input.slaHoursResponse ?? null,
      slaHoursResolution: input.slaHoursResolution ?? null,
    })
    .returning()

  return org
}

export async function updateOrganization(id: string, input: UpdateOrganizationInput) {
  const updates: Record<string, unknown> = { updatedAt: new Date() }

  if (input.name !== undefined) updates.name = input.name
  if (input.slug !== undefined) updates.slug = input.slug
  if (input.parentId !== undefined) updates.parentId = input.parentId
  if (input.address !== undefined) updates.address = input.address
  if (input.phone !== undefined) updates.phone = input.phone
  if (input.website !== undefined) updates.website = input.website
  if (input.logoUrl !== undefined) updates.logoUrl = input.logoUrl
  if (input.primaryColor !== undefined) updates.primaryColor = input.primaryColor
  if (input.slaHoursResponse !== undefined) updates.slaHoursResponse = input.slaHoursResponse
  if (input.slaHoursResolution !== undefined) updates.slaHoursResolution = input.slaHoursResolution

  const [updated] = await db.update(organizations).set(updates).where(eq(organizations.id, id)).returning()
  return updated ?? null
}

export async function deactivateOrganization(id: string) {
  const [updated] = await db
    .update(organizations)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(organizations.id, id))
    .returning()
  return updated ?? null
}

export async function reactivateOrganization(id: string) {
  const [updated] = await db
    .update(organizations)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(organizations.id, id))
    .returning()
  return updated ?? null
}

export async function checkSlugAvailable(slug: string, excludeId?: string) {
  const conditions = [eq(organizations.slug, slug)]
  if (excludeId) {
    conditions.push(ne(organizations.id, excludeId))
  }
  const [existing] = await db.select({ id: organizations.id }).from(organizations).where(and(...conditions)).limit(1)
  return !existing
}
