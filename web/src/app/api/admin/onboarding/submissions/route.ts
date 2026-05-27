import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { onboardingSubmissions, organizations, users } from "@/lib/db/schema"
import { eq, desc, and, ilike, or, sql } from "drizzle-orm"

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") ?? ""
  const status = searchParams.get("status") ?? ""
  const organizationId = searchParams.get("organizationId") ?? ""
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "25", 10), 100)
  const offset = (page - 1) * limit

  const conditions = []
  if (status) conditions.push(eq(onboardingSubmissions.status, status as typeof onboardingSubmissions.status._.data))
  if (organizationId) conditions.push(eq(onboardingSubmissions.organizationId, organizationId))
  if (search) {
    conditions.push(
      or(
        ilike(onboardingSubmissions.starterFirstName, `%${search}%`),
        ilike(onboardingSubmissions.starterLastName, `%${search}%`),
        ilike(onboardingSubmissions.starterEmail, `%${search}%`),
        ilike(onboardingSubmissions.starterJobTitle, `%${search}%`),
      )
    )
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: onboardingSubmissions.id,
        organizationId: onboardingSubmissions.organizationId,
        organizationName: organizations.name,
        submittedByUserId: onboardingSubmissions.submittedByUserId,
        submittedByName: users.name,
        status: onboardingSubmissions.status,
        starterFirstName: onboardingSubmissions.starterFirstName,
        starterLastName: onboardingSubmissions.starterLastName,
        starterEmail: onboardingSubmissions.starterEmail,
        starterJobTitle: onboardingSubmissions.starterJobTitle,
        startDate: onboardingSubmissions.startDate,
        totalQuotedPrice: onboardingSubmissions.totalQuotedPrice,
        currency: onboardingSubmissions.currency,
        ateraTicketId: onboardingSubmissions.ateraTicketId,
        submittedAt: onboardingSubmissions.submittedAt,
        createdAt: onboardingSubmissions.createdAt,
        updatedAt: onboardingSubmissions.updatedAt,
      })
      .from(onboardingSubmissions)
      .leftJoin(organizations, eq(onboardingSubmissions.organizationId, organizations.id))
      .leftJoin(users, eq(onboardingSubmissions.submittedByUserId, users.id))
      .where(where)
      .orderBy(desc(onboardingSubmissions.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(onboardingSubmissions).where(where),
  ])

  return NextResponse.json({
    success: true,
    data: rows,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
  })
}
