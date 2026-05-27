/**
 * Read-only catalog endpoint for authenticated client portal users.
 * Returns active items for building onboarding quotes.
 */
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { catalogItems } from "@/lib/db/schema"
import { eq, ilike, or, and, sql } from "drizzle-orm"

export async function GET(req: NextRequest) {
  // Any authenticated user can browse the catalog
  const userId = req.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") ?? ""
  const category = searchParams.get("category") ?? ""
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200)

  const conditions = [eq(catalogItems.isActive, true)]
  if (search) {
    conditions.push(
      or(
        ilike(catalogItems.name, `%${search}%`),
        ilike(catalogItems.sku, `%${search}%`),
        ilike(catalogItems.category, `%${search}%`),
      )!
    )
  }
  if (category) conditions.push(ilike(catalogItems.category, category))

  const rows = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      description: catalogItems.description,
      sku: catalogItems.sku,
      category: catalogItems.category,
      supplier: catalogItems.supplier,
      unitPrice: catalogItems.unitPrice,
      currency: catalogItems.currency,
    })
    .from(catalogItems)
    .where(and(...conditions))
    .orderBy(catalogItems.category, catalogItems.name)
    .limit(limit)

  return NextResponse.json({ success: true, data: rows })
}
