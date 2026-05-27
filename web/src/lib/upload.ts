import path from "path"
import fs from "fs/promises"
import { nanoid } from "nanoid"

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "/app/uploads"
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

export type UploadCategory = "logos" | "documents" | "reports" | "onboarding"

const ALLOWED_MIME: Record<UploadCategory, string[]> = {
  logos: ["image/png", "image/jpeg", "image/svg+xml", "image/webp"],
  documents: ["application/pdf", "image/png", "image/jpeg", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  reports: ["application/pdf"],
  onboarding: ["application/pdf", "image/png", "image/jpeg"],
}

export interface UploadResult {
  relativePath: string   // stored in DB — never expose absolute path
  filename: string
  mimeType: string
  sizeBytes: number
}

export async function ensureUploadDir(category: UploadCategory) {
  const dir = path.join(UPLOADS_DIR, category)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export async function saveUpload(
  file: File,
  category: UploadCategory,
  organizationId: string
): Promise<UploadResult> {
  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`)
  }

  // Validate MIME type
  const allowed = ALLOWED_MIME[category]
  if (!allowed.includes(file.type)) {
    throw new Error(`File type "${file.type}" is not allowed for ${category}. Allowed: ${allowed.join(", ")}`)
  }

  const ext = getExtension(file.name, file.type)
  const safeFilename = `${nanoid(16)}${ext}`
  const subDir = path.join(category, organizationId)
  const dir = path.join(UPLOADS_DIR, subDir)
  const absolutePath = path.join(dir, safeFilename)
  const relativePath = path.join(subDir, safeFilename).replace(/\\/g, "/")

  await fs.mkdir(dir, { recursive: true })

  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(absolutePath, buffer)

  return {
    relativePath,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  }
}

export async function deleteUpload(relativePath: string) {
  // Prevent path traversal
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "")
  const absolutePath = path.join(UPLOADS_DIR, normalized)

  // Ensure it's within uploads dir
  if (!absolutePath.startsWith(UPLOADS_DIR)) {
    throw new Error("Invalid file path")
  }

  try {
    await fs.unlink(absolutePath)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    // File already gone — that's fine
  }
}

export async function readUploadAsBuffer(relativePath: string): Promise<Buffer> {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "")
  const absolutePath = path.join(UPLOADS_DIR, normalized)

  if (!absolutePath.startsWith(UPLOADS_DIR)) {
    throw new Error("Invalid file path")
  }

  return fs.readFile(absolutePath)
}

export async function getUploadMimeType(relativePath: string): Promise<string> {
  const ext = path.extname(relativePath).toLowerCase()
  const mimeMap: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }
  return mimeMap[ext] ?? "application/octet-stream"
}

function getExtension(filename: string, mimeType: string): string {
  // Try from filename first
  const fromFilename = path.extname(filename).toLowerCase()
  if (fromFilename) return fromFilename

  // Fall back to MIME type
  const mimeToExt: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  }
  return mimeToExt[mimeType] ?? ".bin"
}
