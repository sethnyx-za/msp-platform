import { NextRequest, NextResponse } from "next/server"
import { getOnboardingOptions } from "@/lib/services/onboarding"

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const orgId = req.headers.get("x-org-id")
  if (!orgId) return NextResponse.json({ success: false, error: "No org context" }, { status: 400 })

  const options = await getOnboardingOptions(orgId)
  return NextResponse.json({ success: true, data: options })
}
