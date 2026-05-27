/**
 * CSV Import Service
 *
 * Parses CSV exports from Atera and normalises them into
 * structured data stored in reportSourceFiles.parsedData.
 *
 * Supported file types:
 *  - "atera_agents"  → Atera agent/device export
 *  - "atera_tickets" → Atera ticket export
 *  - "generic"       → Any CSV (raw rows)
 */

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Minimal RFC-4180 compliant CSV parser.
 * Returns an array of objects keyed by the header row.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  if (lines.length < 2) return []

  const headers = parseCsvRow(lines[0])
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = parseCsvRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h.trim()] = cells[idx]?.trim() ?? ""
    })
    rows.push(row)
  }

  return rows
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

// ─── Normalisation helpers ────────────────────────────────────────────────────

export interface NormalisedAgent {
  ateraAgentId?: string
  ateraDeviceGuid?: string
  name?: string
  osType?: string
  osVersion?: string
  ipAddress?: string
  lastLoggedInUser?: string
  lastSeen?: string
  diskUsagePercent?: number
  diskTotalGb?: number
  diskFreeGb?: number
  ramGb?: number
  cpuName?: string
  make?: string
  model?: string
  serialNumber?: string
}

export interface NormalisedTicket {
  ticketId?: string
  title?: string
  status?: string
  priority?: string
  type?: string
  assigneeName?: string
  createdDate?: string
  closedDate?: string
  slaFirstResponseBreach?: boolean
  slaResolutionBreach?: boolean
}

export type ParsedFileData =
  | { type: "atera_agents"; rows: NormalisedAgent[]; rowCount: number }
  | { type: "atera_tickets"; rows: NormalisedTicket[]; rowCount: number }
  | { type: "generic"; headers: string[]; rows: Record<string, string>[]; rowCount: number }

/**
 * Detect and normalise a CSV file.
 * Returns structured data plus a detected fileType.
 */
export function normaliseCsv(text: string): ParsedFileData {
  const rows = parseCsv(text)
  if (rows.length === 0) return { type: "generic", headers: [], rows: [], rowCount: 0 }

  const headers = Object.keys(rows[0])

  // Detect Atera agent export
  if (headers.some((h) => /agent\s*id|device\s*id/i.test(h))) {
    const normalised: NormalisedAgent[] = rows.map((r) => ({
      ateraAgentId: r["Agent ID"] ?? r["Device ID"] ?? r["agent_id"],
      ateraDeviceGuid: r["Device GUID"] ?? r["device_guid"],
      name: r["Agent Name"] ?? r["Computer Name"] ?? r["name"],
      osType: r["OS Type"] ?? r["os_type"],
      osVersion: r["OS Version"] ?? r["os_version"],
      ipAddress: r["IP Address"] ?? r["ip_address"],
      lastLoggedInUser: r["Last Logged In User"],
      lastSeen: r["Last Seen"] ?? r["last_seen"],
      diskUsagePercent: toNum(r["Disk Usage (%)"] ?? r["disk_usage_percent"]),
      diskTotalGb: toNum(r["Disk Size (GB)"] ?? r["disk_total_gb"]),
      diskFreeGb: toNum(r["Disk Free (GB)"] ?? r["disk_free_gb"]),
      ramGb: toNum(r["RAM (GB)"] ?? r["ram_gb"]),
      cpuName: r["CPU Name"] ?? r["cpu_name"],
      make: r["Make"] ?? r["Manufacturer"] ?? r["make"],
      model: r["Model"] ?? r["model"],
      serialNumber: r["Serial Number"] ?? r["serial_number"],
    }))
    return { type: "atera_agents", rows: normalised, rowCount: normalised.length }
  }

  // Detect Atera ticket export
  if (headers.some((h) => /ticket\s*id|ticket\s*title|ticketid/i.test(h))) {
    const normalised: NormalisedTicket[] = rows.map((r) => ({
      ticketId: r["Ticket ID"] ?? r["TicketID"] ?? r["ticket_id"],
      title: r["Title"] ?? r["Ticket Title"] ?? r["ticket_title"],
      status: r["Status"] ?? r["status"],
      priority: r["Priority"] ?? r["priority"],
      type: r["Type"] ?? r["Ticket Type"] ?? r["type"],
      assigneeName: r["Assignee"] ?? r["Assigned Technician"] ?? r["assignee"],
      createdDate: r["Created Date"] ?? r["Created At"] ?? r["created_at"],
      closedDate: r["Closed Date"] ?? r["Closed At"] ?? r["closed_at"],
      slaFirstResponseBreach: toBool(r["SLA First Response Breach"]),
      slaResolutionBreach: toBool(r["SLA Resolution Breach"]),
    }))
    return { type: "atera_tickets", rows: normalised, rowCount: normalised.length }
  }

  // Generic
  return { type: "generic", headers, rows, rowCount: rows.length }
}

function toNum(val: string | undefined): number | undefined {
  if (!val || val.trim() === "" || val.trim() === "N/A") return undefined
  const n = parseFloat(val.replace(/,/g, ""))
  return isNaN(n) ? undefined : n
}

function toBool(val: string | undefined): boolean | undefined {
  if (!val) return undefined
  return val.toLowerCase() === "yes" || val === "1" || val.toLowerCase() === "true"
}

// ─── Analytics from parsed data ───────────────────────────────────────────────

export interface TicketAnalytics {
  total: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  slaBreachCount: number
  avgResolutionDays?: number
}

export function analyseTickets(rows: NormalisedTicket[]): TicketAnalytics {
  const byStatus: Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  let slaBreachCount = 0
  let totalResolutionDays = 0
  let resolvedCount = 0

  for (const row of rows) {
    if (row.status) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
    if (row.priority) byPriority[row.priority] = (byPriority[row.priority] ?? 0) + 1
    if (row.slaResolutionBreach) slaBreachCount++

    if (row.createdDate && row.closedDate) {
      const created = new Date(row.createdDate).getTime()
      const closed = new Date(row.closedDate).getTime()
      if (!isNaN(created) && !isNaN(closed) && closed > created) {
        totalResolutionDays += (closed - created) / (1000 * 60 * 60 * 24)
        resolvedCount++
      }
    }
  }

  return {
    total: rows.length,
    byStatus,
    byPriority,
    slaBreachCount,
    avgResolutionDays: resolvedCount > 0 ? totalResolutionDays / resolvedCount : undefined,
  }
}
