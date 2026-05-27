import { NextRequest, NextResponse } from "next/server"
import { saveUpload, type UploadCategory } from "@/lib/upload"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const ALLOWED_CATEGORIES: UploadCategory[] = ["logos", "documents", "reports", "onboarding"]

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 })
  }

  const orgId = req.headers.get("x-org-id")
  if (!orgId) {
    return NextResponse.json({ success: false, error: "No organisation context" }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ success: false, error: "Expected multipart/form-data" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 })
  }

  const category = (formData.get("category") ?? "documents") as UploadCategory
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json({ success: false, error: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(", ")}` }, { status: 400 })
  }

  // Logo uploads — MSP staff only for logos category
  if (category === "logos" && req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Only MSP staff can upload logos" }, { status: 403 })
  }

  try {
    const result = await saveUpload(file, category, orgId)

    await writeAuditLog({
      userId,
      action: AuditAction.FILE_UPLOAD,
      resourceType: "file",
      newValue: { relativePath: result.relativePath, category, mimeType: result.mimeType, sizeBytes: result.sizeBytes },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    })

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ success: false, error: message }, { status: 422 })
  }
}
