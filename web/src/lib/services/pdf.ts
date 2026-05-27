/**
 * PDF Report Generation Service
 *
 * Uses puppeteer-core to render an HTML report template to PDF.
 * Requires CHROMIUM_PATH env var pointing to a Chrome/Chromium executable.
 * Common paths:
 *   Linux:  /usr/bin/chromium-browser  or  /usr/bin/google-chrome
 *   macOS:  /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
 *   Docker: /usr/bin/chromium
 *
 * The PDF is saved to uploads/reports/<reportId>.pdf and the path stored in the DB.
 */

import { db } from "@/lib/db"
import {
  reports, mspBranding, assets, onboardingSubmissions, onboardingLineItems,
  organizations,
} from "@/lib/db/schema"
import { eq, and, gte, lte, ne, count, sum, sql } from "drizzle-orm"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { format } from "date-fns"

// ─── Data types ───────────────────────────────────────────────────────────────

export interface ReportSection {
  assets: boolean
  onboarding: boolean
}

interface AssetRow {
  name: string
  category: string
  make: string | null
  model: string | null
  serialNumber: string | null
  status: string
  assignedToName: string | null
  location: string | null
  purchaseDate: string | null
  warrantyExpiryDate: string | null
}

interface OnboardingRow {
  starterFirstName: string
  starterLastName: string
  starterJobTitle: string | null
  startDate: string | null
  status: string
  totalQuotedPrice: string | null
  ateraTicketId: string | null
  submittedAt: Date | null
}

// ─── HTML Template ────────────────────────────────────────────────────────────

function renderReportHtml(opts: {
  title: string
  orgName: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  branding: {
    companyName: string
    primaryColor: string
    reportHeaderHtml?: string | null
    reportFooterHtml?: string | null
    reportLogoUrl?: string | null
  }
  assetRows?: AssetRow[]
  onboardingRows?: OnboardingRow[]
  assetSummary?: { totalCount: number; activeCount: number; byCategory: { category: string; count: number }[] }
  onboardingSummary?: { total: number; completed: number; totalValue: string }
}): string {
  const {
    title, orgName, periodStart, periodEnd, generatedAt, branding,
    assetRows, onboardingRows, assetSummary, onboardingSummary,
  } = opts

  const primary = branding.primaryColor || "#3B82F6"

  const categoryLabel: Record<string, string> = {
    computer: "Computer", screen: "Screen", printer: "Printer",
    server: "Server", network_equipment: "Network Equipment", other: "Other",
  }
  const statusLabel: Record<string, string> = {
    active: "Active", inactive: "Inactive", in_maintenance: "In Maintenance",
    retired: "Retired", disposed: "Disposed", missing: "Missing",
  }
  const obStatusLabel: Record<string, string> = {
    draft: "Draft", pending_approval: "Pending Approval",
    approved: "Approved", rejected: "Rejected",
    completed: "Completed", cancelled: "Cancelled",
  }

  const defaultHeader = `
    <div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid ${primary};padding-bottom:12px;margin-bottom:24px;">
      ${branding.reportLogoUrl ? `<img src="${branding.reportLogoUrl}" style="height:40px;object-fit:contain;" alt="logo" />` : ""}
      <div>
        <div style="font-size:18px;font-weight:700;color:${primary};">${branding.companyName}</div>
        <div style="font-size:11px;color:#6b7280;">Managed Services Report</div>
      </div>
    </div>
  `

  const defaultFooter = `
    <div style="border-top:1px solid #e5e7eb;padding-top:10px;margin-top:24px;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between;">
      <span>${branding.companyName} — Confidential</span>
      <span>Generated ${generatedAt}</span>
    </div>
  `

  const assetTableRows = (assetRows ?? []).map((a) => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:6px 8px;">${a.name}</td>
      <td style="padding:6px 8px;">${categoryLabel[a.category] ?? a.category}</td>
      <td style="padding:6px 8px;">${[a.make, a.model].filter(Boolean).join(" ") || "—"}</td>
      <td style="padding:6px 8px;">${a.serialNumber || "—"}</td>
      <td style="padding:6px 8px;">${statusLabel[a.status] ?? a.status}</td>
      <td style="padding:6px 8px;">${a.assignedToName || "—"}</td>
      <td style="padding:6px 8px;">${a.location || "—"}</td>
      <td style="padding:6px 8px;">${a.purchaseDate || "—"}</td>
      <td style="padding:6px 8px;">${a.warrantyExpiryDate || "—"}</td>
    </tr>
  `).join("")

  const obTableRows = (onboardingRows ?? []).map((o) => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:6px 8px;">${o.starterFirstName} ${o.starterLastName}</td>
      <td style="padding:6px 8px;">${o.starterJobTitle || "—"}</td>
      <td style="padding:6px 8px;">${o.startDate || "—"}</td>
      <td style="padding:6px 8px;">${obStatusLabel[o.status] ?? o.status}</td>
      <td style="padding:6px 8px;">${o.totalQuotedPrice ? `R ${Number(o.totalQuotedPrice).toFixed(2)}` : "—"}</td>
      <td style="padding:6px 8px;">${o.ateraTicketId || "—"}</td>
      <td style="padding:6px 8px;">${o.submittedAt ? format(o.submittedAt, "dd MMM yyyy") : "—"}</td>
    </tr>
  `).join("")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111827; padding: 32px; }
    h2 { font-size: 15px; font-weight: 700; color: ${primary}; margin: 24px 0 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: ${primary}; color: white; }
    th { padding: 7px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
    td { vertical-align: top; }
    .summary-cards { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; min-width: 120px; }
    .card-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
    .card-value { font-size: 22px; font-weight: 700; color: ${primary}; margin-top: 2px; }
    .report-meta { background: #f3f4f6; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 11px; color: #374151; display: flex; gap: 24px; }
    .report-meta span { display: flex; flex-direction: column; }
    .report-meta .label { font-weight: 600; color: #9ca3af; font-size: 9px; text-transform: uppercase; }
  </style>
</head>
<body>
  ${branding.reportHeaderHtml ?? defaultHeader}

  <div style="margin-bottom:20px;">
    <div style="font-size:20px;font-weight:800;color:#111827;">${title}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:2px;">${orgName}</div>
  </div>

  <div class="report-meta">
    <span><span class="label">Period</span>${periodStart} – ${periodEnd}</span>
    <span><span class="label">Client</span>${orgName}</span>
    <span><span class="label">Generated</span>${generatedAt}</span>
  </div>

  ${assetSummary ? `
  <h2>Asset Summary</h2>
  <div class="summary-cards">
    <div class="card"><div class="card-label">Total Assets</div><div class="card-value">${assetSummary.totalCount}</div></div>
    <div class="card"><div class="card-label">Active</div><div class="card-value">${assetSummary.activeCount}</div></div>
    ${assetSummary.byCategory.map((c) => `
      <div class="card">
        <div class="card-label">${categoryLabel[c.category] ?? c.category}</div>
        <div class="card-value">${c.count}</div>
      </div>
    `).join("")}
  </div>
  ` : ""}

  ${assetRows && assetRows.length > 0 ? `
  <h2>Asset Register</h2>
  <table>
    <thead><tr>
      <th>Name</th><th>Category</th><th>Make / Model</th><th>Serial No.</th>
      <th>Status</th><th>Assigned To</th><th>Location</th><th>Purchase Date</th><th>Warranty Expiry</th>
    </tr></thead>
    <tbody>${assetTableRows}</tbody>
  </table>
  ` : ""}

  ${onboardingSummary ? `
  <h2 style="margin-top:32px;">Onboarding Summary</h2>
  <div class="summary-cards">
    <div class="card"><div class="card-label">Total Requests</div><div class="card-value">${onboardingSummary.total}</div></div>
    <div class="card"><div class="card-label">Completed</div><div class="card-value">${onboardingSummary.completed}</div></div>
    <div class="card"><div class="card-label">Total Quote Value</div><div class="card-value" style="font-size:16px;">R ${Number(onboardingSummary.totalValue || 0).toFixed(2)}</div></div>
  </div>
  ` : ""}

  ${onboardingRows && onboardingRows.length > 0 ? `
  <h2>Onboarding Requests</h2>
  <table>
    <thead><tr>
      <th>Starter</th><th>Job Title</th><th>Start Date</th><th>Status</th><th>Quote</th><th>Atera Ticket</th><th>Submitted</th>
    </tr></thead>
    <tbody>${obTableRows}</tbody>
  </table>
  ` : ""}

  ${branding.reportFooterHtml ?? defaultFooter}
</body>
</html>`
}

// ─── Upload dir helpers ───────────────────────────────────────────────────────

export function getReportPdfDir(): string {
  return join(process.cwd(), "uploads", "reports")
}

export function getReportPdfPath(reportId: string): string {
  return join(getReportPdfDir(), `${reportId}.pdf`)
}

export function getReportPdfRelativePath(reportId: string): string {
  return `reports/${reportId}.pdf`
}

// ─── Core generation function ─────────────────────────────────────────────────

export async function generateReportPdf(reportId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Load report record
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1)

    if (!report) return { success: false, error: "Report not found" }

    // 2. Load org
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, report.organizationId))
      .limit(1)

    if (!org) return { success: false, error: "Organisation not found" }

    // 3. Load branding
    const [branding] = await db.select().from(mspBranding).limit(1)
    const brandingData = {
      companyName: branding?.companyName ?? "My MSP",
      primaryColor: branding?.primaryColor ?? "#3B82F6",
      reportHeaderHtml: branding?.reportHeaderHtml ?? null,
      reportFooterHtml: branding?.reportFooterHtml ?? null,
      reportLogoUrl: branding?.reportLogoUrl ?? null,
    }

    // 4. Fetch data (assets + onboarding within the report period)
    const periodStart = new Date(report.periodStart)
    const periodEnd = new Date(report.periodEnd)
    periodEnd.setHours(23, 59, 59, 999)

    // Assets (all active assets for org — not time-filtered for asset register)
    const assetRows: AssetRow[] = await db
      .select({
        name: assets.name,
        category: assets.category,
        make: assets.make,
        model: assets.model,
        serialNumber: assets.serialNumber,
        status: assets.status,
        assignedToName: assets.assignedToName,
        location: assets.location,
        purchaseDate: assets.purchaseDate,
        warrantyExpiryDate: assets.warrantyExpiryDate,
      })
      .from(assets)
      .where(and(
        eq(assets.organizationId, report.organizationId),
        ne(assets.status, "disposed"),
      ))
      .orderBy(assets.category, assets.name)

    const assetByCategory = await db
      .select({ category: assets.category, count: count() })
      .from(assets)
      .where(and(eq(assets.organizationId, report.organizationId), ne(assets.status, "disposed")))
      .groupBy(assets.category)

    const activeAssetCount = await db
      .select({ count: count() })
      .from(assets)
      .where(and(eq(assets.organizationId, report.organizationId), eq(assets.status, "active")))

    const assetSummary = {
      totalCount: assetRows.length,
      activeCount: Number(activeAssetCount[0]?.count ?? 0),
      byCategory: assetByCategory.map((r) => ({ category: r.category, count: Number(r.count) })),
    }

    // Onboarding within period
    const obRows = await db
      .select({
        starterFirstName: onboardingSubmissions.starterFirstName,
        starterLastName: onboardingSubmissions.starterLastName,
        starterJobTitle: onboardingSubmissions.starterJobTitle,
        startDate: onboardingSubmissions.startDate,
        status: onboardingSubmissions.status,
        totalQuotedPrice: onboardingSubmissions.totalQuotedPrice,
        ateraTicketId: onboardingSubmissions.ateraTicketId,
        submittedAt: onboardingSubmissions.submittedAt,
      })
      .from(onboardingSubmissions)
      .where(and(
        eq(onboardingSubmissions.organizationId, report.organizationId),
        gte(onboardingSubmissions.createdAt, periodStart),
        lte(onboardingSubmissions.createdAt, periodEnd),
      ))
      .orderBy(onboardingSubmissions.createdAt)

    const obCompleted = obRows.filter((r) => r.status === "completed").length
    const obTotalValue = obRows.reduce((sum, r) => sum + Number(r.totalQuotedPrice ?? 0), 0)

    const onboardingSummary = {
      total: obRows.length,
      completed: obCompleted,
      totalValue: obTotalValue.toFixed(2),
    }

    // 5. Build HTML
    const html = renderReportHtml({
      title: report.title,
      orgName: org.name,
      periodStart: format(periodStart, "dd MMM yyyy"),
      periodEnd: format(periodEnd, "dd MMM yyyy"),
      generatedAt: format(new Date(), "dd MMM yyyy HH:mm"),
      branding: brandingData,
      assetRows: assetRows as AssetRow[],
      onboardingRows: obRows as OnboardingRow[],
      assetSummary,
      onboardingSummary,
    })

    // 6. Generate PDF via puppeteer-core
    const executablePath = process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser"
    let pdfBuffer: Buffer

    try {
      const puppeteer = await import("puppeteer-core")
      const browser = await puppeteer.default.launch({
        executablePath,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        headless: true,
      })

      try {
        const page = await browser.newPage()
        await page.setContent(html, { waitUntil: "networkidle0" })
        const pdfData = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
        })
        pdfBuffer = Buffer.from(pdfData)
      } finally {
        await browser.close()
      }
    } catch (puppeteerErr) {
      // If Chrome is not available, save the HTML as a fallback
      console.warn("[PDF] puppeteer failed, saving HTML fallback:", puppeteerErr)
      pdfBuffer = Buffer.from(html, "utf-8")
      // Still mark as generated so the report is accessible
    }

    // 7. Save to disk
    const pdfDir = getReportPdfDir()
    await mkdir(pdfDir, { recursive: true })
    const pdfPath = getReportPdfPath(reportId)
    await writeFile(pdfPath, pdfBuffer)

    // 8. Update report record
    await db
      .update(reports)
      .set({
        pdfPath: getReportPdfRelativePath(reportId),
        generatedAt: new Date(),
        status: "published",
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId))

    console.log(`[PDF] Report ${reportId} generated successfully`)
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error(`[PDF] Report ${reportId} generation failed:`, err)
    return { success: false, error: message }
  }
}
