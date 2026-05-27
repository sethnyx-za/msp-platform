import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  assets, onboardingSubmissions, reports, reportSchedules, organizations,
} from "@/lib/db/schema"
import { eq, and, ne, count, sum, gte, sql, desc } from "drizzle-orm"

export async function GET(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId") ?? undefined

  try {
    // ── Build WHERE clauses ────────────────────────────────────────────────────
    const assetWhere = organizationId
      ? and(eq(assets.organizationId, organizationId), ne(assets.status, "disposed"))
      : ne(assets.status, "disposed")

    const obWhere = organizationId
      ? eq(onboardingSubmissions.organizationId, organizationId)
      : undefined

    // ── Summary stats ──────────────────────────────────────────────────────────
    const [totalAssets] = await db
      .select({ count: count() })
      .from(assets)
      .where(assetWhere)

    const [activeAssets] = await db
      .select({ count: count() })
      .from(assets)
      .where(organizationId
        ? and(eq(assets.organizationId, organizationId), eq(assets.status, "active"))
        : eq(assets.status, "active"))

    const [pendingOb] = await db
      .select({ count: count() })
      .from(onboardingSubmissions)
      .where(obWhere
        ? and(obWhere, eq(onboardingSubmissions.status, "pending_approval"))
        : eq(onboardingSubmissions.status, "pending_approval"))

    const [completedOb] = await db
      .select({ count: count() })
      .from(onboardingSubmissions)
      .where(obWhere
        ? and(obWhere, eq(onboardingSubmissions.status, "completed"))
        : eq(onboardingSubmissions.status, "completed"))

    const [totalReports] = await db
      .select({ count: count() })
      .from(reports)
      .where(organizationId ? eq(reports.organizationId, organizationId) : undefined)

    const [activeSchedules] = await db
      .select({ count: count() })
      .from(reportSchedules)
      .where(organizationId
        ? and(eq(reportSchedules.organizationId, organizationId), eq(reportSchedules.isActive, true))
        : eq(reportSchedules.isActive, true))

    // ── Assets by category ─────────────────────────────────────────────────────
    const assetsByCategory = await db
      .select({ category: assets.category, count: count() })
      .from(assets)
      .where(assetWhere)
      .groupBy(assets.category)

    // ── Assets by status ───────────────────────────────────────────────────────
    const assetsByStatus = await db
      .select({ status: assets.status, count: count() })
      .from(assets)
      .where(organizationId ? eq(assets.organizationId, organizationId) : undefined)
      .groupBy(assets.status)

    // ── Onboarding by status ───────────────────────────────────────────────────
    const onboardingByStatus = await db
      .select({ status: onboardingSubmissions.status, count: count() })
      .from(onboardingSubmissions)
      .where(obWhere)
      .groupBy(onboardingSubmissions.status)

    // ── Onboarding 6-month trend ───────────────────────────────────────────────
    const trendRows = await db.execute(sql`
      SELECT
        DATE_TRUNC('month', created_at)::date AS month,
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed
      FROM onboarding_submissions
      WHERE
        created_at >= NOW() - INTERVAL '6 months'
        ${organizationId ? sql`AND organization_id = ${organizationId}` : sql``}
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `)

    // ── Top orgs by asset count (MSP-wide view only) ───────────────────────────
    let topOrganizations: { id: string; name: string; assetCount: number }[] | undefined
    if (!organizationId) {
      const topOrgs = await db.execute(sql`
        SELECT
          o.id,
          o.name,
          COUNT(a.id)::int AS asset_count
        FROM organizations o
        LEFT JOIN assets a ON a.organization_id = o.id AND a.status != 'disposed'
        WHERE o.is_msp_org = false AND o.is_active = true
        GROUP BY o.id, o.name
        ORDER BY asset_count DESC
        LIMIT 10
      `)
      topOrganizations = (topOrgs.rows ?? topOrgs as unknown as Record<string, unknown>[]).map((r: unknown) => {
        const row = r as { id: string; name: string; asset_count: number }
        return { id: row.id, name: row.name, assetCount: row.asset_count }
      })
    }

    // ── Onboarding quote value trend ───────────────────────────────────────────
    const quoteRows = await db.execute(sql`
      SELECT
        DATE_TRUNC('month', created_at)::date AS month,
        SUM(total_quoted_price)::numeric AS total_value
      FROM onboarding_submissions
      WHERE
        created_at >= NOW() - INTERVAL '6 months'
        AND total_quoted_price IS NOT NULL
        ${organizationId ? sql`AND organization_id = ${organizationId}` : sql``}
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `)

    // ── Normalise trend rows ───────────────────────────────────────────────────
    type TrendRow = { month: string | Date; total: number; completed: number }
    const trendData = ((trendRows.rows ?? trendRows) as unknown as TrendRow[]).map((r) => ({
      month: typeof r.month === "string" ? r.month.slice(0, 7) : String(r.month).slice(0, 7),
      total: Number(r.total),
      completed: Number(r.completed),
    }))

    type QuoteRow = { month: string | Date; total_value: string }
    const quoteData = ((quoteRows.rows ?? quoteRows) as unknown as QuoteRow[]).map((r) => ({
      month: typeof r.month === "string" ? r.month.slice(0, 7) : String(r.month).slice(0, 7),
      totalValue: Number(r.total_value),
    }))

    return NextResponse.json({
      summary: {
        totalAssets: Number(totalAssets.count),
        activeAssets: Number(activeAssets.count),
        pendingOnboarding: Number(pendingOb.count),
        completedOnboarding: Number(completedOb.count),
        totalReports: Number(totalReports.count),
        activeSchedules: Number(activeSchedules.count),
      },
      assetsByCategory: assetsByCategory.map((r) => ({
        category: r.category,
        count: Number(r.count),
      })),
      assetsByStatus: assetsByStatus.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      onboardingByStatus: onboardingByStatus.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      onboardingTrend: trendData,
      quoteTrend: quoteData,
      topOrganizations,
    })
  } catch (err) {
    console.error("[analytics] error:", err)
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 })
  }
}
