/**
 * Atera API client (MSP-level API key from env)
 * Atera Grow plan: REST API at https://app.atera.com/api/v3/
 */

const ATERA_BASE = "https://app.atera.com/api/v3"

function getApiKey(): string {
  const key = process.env.ATERA_API_KEY
  if (!key) throw new Error("ATERA_API_KEY is not configured")
  return key
}

async function ateraFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${ATERA_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-API-KEY": getApiKey(),
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Atera API error ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ---- Customer endpoints ----

export interface AteraCustomer {
  CustomerID: number
  CustomerName: string
  CreatedOn: string
  LastModified: string
  BusinessNumber?: string
  Domain?: string
  Address?: string
  City?: string
  Country?: string
  Phone?: string
  PrimaryContact?: string
  PrimaryEmail?: string
  IsActive?: boolean
}

export async function listAteraCustomers(): Promise<AteraCustomer[]> {
  const data = await ateraFetch<{ items: AteraCustomer[]; itemsInPage: number; totalPages: number }>(
    "/customers?itemsInPage=100&page=1"
  )
  return data.items
}

export async function getAteraCustomer(customerId: number): Promise<AteraCustomer> {
  return ateraFetch<AteraCustomer>(`/customers/${customerId}`)
}

// ---- Agent/Device endpoints ----

export interface AteraAgent {
  AgentID: number
  AgentName: string
  CustomerID: number
  CustomerName: string
  MachineName: string
  DomainName?: string
  OSType?: string
  OSName?: string
  OSBits?: number
  OSVersion?: string
  IPPublic?: string
  IPAddressV4?: string
  IPAddressV6?: string
  SystemManufacturer?: string
  SystemModel?: string
  SystemSerialNumber?: string
  ProcessorCores?: number
  TotalPhysicalMemory?: number
  AvailableMemory?: number
  TotalDiskSpace?: number
  FreeDiskSpace?: number
  DiskUsagePercent?: number
  AgentStatus?: "Online" | "Offline"
  LastModified?: string
  LastLoggedUser?: string
  AntivirusStatus?: string
  PatchStatus?: string
}

export async function listAteraAgents(customerId?: number): Promise<AteraAgent[]> {
  const path = customerId
    ? `/agents/customer/${customerId}?itemsInPage=100&page=1`
    : `/agents?itemsInPage=100&page=1`
  const data = await ateraFetch<{ items: AteraAgent[]; itemsInPage: number; totalPages: number }>(path)
  return data.items
}

export async function getAteraAgent(agentId: number): Promise<AteraAgent> {
  return ateraFetch<AteraAgent>(`/agents/${agentId}`)
}

// ---- Ticket endpoints ----

export interface CreateAteraTicketInput {
  TicketTitle: string
  Description: string
  CustomerID: number
  ContactName?: string
  ContactEmail?: string
  TicketType?: "Problem" | "Incident" | "ServiceRequest" | "Alert"
  Priority?: "Low" | "Medium" | "High" | "Critical"
  ImpactLevel?: "Minor" | "Moderate" | "Major"
  TechnicianContactID?: number
}

export interface AteraTicket {
  ActionID: number
  TicketID: number
  TicketTitle: string
  TicketStatus: string
  CustomerID: number
  CustomerName: string
  Priority: string
  TicketType: string
  CreatedOn: string
}

export async function createAteraTicket(input: CreateAteraTicketInput): Promise<AteraTicket> {
  return ateraFetch<AteraTicket>("/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function getAteraTicket(ticketId: number): Promise<AteraTicket> {
  return ateraFetch<AteraTicket>(`/tickets/${ticketId}`)
}

export async function listAteraTickets(customerId?: number): Promise<AteraTicket[]> {
  const path = customerId
    ? `/tickets/customer/${customerId}?itemsInPage=50&page=1`
    : `/tickets?itemsInPage=50&page=1`
  const data = await ateraFetch<{ items: AteraTicket[]; itemsInPage: number; totalPages: number }>(path)
  return data.items
}

// ---- Test connection ----

export async function testAteraConnection(): Promise<{ ok: boolean; customerCount?: number; error?: string }> {
  try {
    const customers = await listAteraCustomers()
    return { ok: true, customerCount: customers.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
