import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"

const schema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  colorSwatch: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
  if (parsed.data.theme !== undefined) updates.theme = parsed.data.theme
  if (parsed.data.colorSwatch !== undefined) updates.colorSwatch = parsed.data.colorSwatch

  await db.update(users).set(updates).where(eq(users.id, session.user.id))

  return NextResponse.json({ success: true })
}
