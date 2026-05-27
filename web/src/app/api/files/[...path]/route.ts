/**
 * Authenticated file serving
 * Replaces direct public URL access — all files go through this authenticated route.
 * nginx rewrites /uploads/:path* → /api/files/:path*
 */

import { NextRequest, NextResponse } from "next/server"
import { readUploadAsBuffer, getUploadMimeType } from "@/lib/upload"
import { db } from "@/lib/db"
import { clientDocuments } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import path from "path"

interface RouteContext {
  params: Promise<{ path: string[] }>
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const userId = req.headers.get("x-user-id")
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const { path: pathSegments } = await params
  const relativePath = pathSegments.join("/")

  // Check if this is a document that requires admin_only visibility
  const [doc] = await db
    .select()
    .from(clientDocuments)
    .where(eq(clientDocuments.filePath, relativePath))
    .limit(1)

  if (doc?.visibility === "admin_only") {
    const role = req.headers.get("x-user-role")
    const isMspStaff = req.headers.get("x-is-msp-staff") === "true"
    const isAdmin = isMspStaff || role === "client_admin"
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  try {
    const buffer = await readUploadAsBuffer(relativePath)
    const mimeType = await getUploadMimeType(relativePath)
    const filename = path.basename(relativePath)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
