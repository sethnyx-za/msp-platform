/**
 * UISP (Ubiquiti ISP Management) API client
 * Used for ISP-grade equipment: airMAX, airFiber, EdgeRouter, etc.
 *
 * Credentials stored MSP-level in integration_configs OR per-client.
 * Base URL is configurable (self-hosted UISP instance).
 *
 * API: https://{host}/nms/api/v2.1/
 * Auth: X-Auth-Token header
 */

export interface UispCredentials {
  host: string      // e.g. "uisp.yourmsp.com"
  apiToken: string
  useTls?: boolean  // default true
}

function buildBaseUrl(creds: UispCredentials): string {
  const proto = creds.useTls !== false ? "https" : "http"
  return `${proto}://${creds.host}/nms/api/v2.1`
}

async function uispFetch<T>(
  path: string,
  creds: UispCredentials,
  options: RequestInit = {}
): Promise<T> {
  const url = `${buildBaseUrl(creds)}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-Auth-Token": creds.apiToken,
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    // Allow self-signed certs in dev — in production use proper cert
    // @ts-expect-error Node fetch supports this via undici
    dispatcher: undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`UISP API error ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ---- Device endpoints ----

export interface UispDevice {
  identification: {
    id: string
    name: string
    hostname?: string
    mac: string
    model?: string
    type?: string
    category?: string
    firmwareVersion?: string
    serialNumber?: string
  }
  ipAddress?: string
  overview: {
    status?: "active" | "inactive" | "disconnected" | "unauthorized"
    uptime?: number
    lastSeen?: string
    cpu?: number
    ram?: number
    voltage?: number
    transmitPower?: number
  }
  site?: {
    id: string
    name: string
    type?: string
  }
}

export async function listUispDevices(creds: UispCredentials): Promise<UispDevice[]> {
  return uispFetch<UispDevice[]>("/devices", creds)
}

export async function getUispDevice(creds: UispCredentials, deviceId: string): Promise<UispDevice> {
  return uispFetch<UispDevice>(`/devices/${deviceId}`, creds)
}

// ---- Site endpoints ----

export interface UispSite {
  id: string
  name: string
  type?: "site" | "tower" | "endpoint"
  description?: string
  address?: string
  parent?: { id: string; name: string }
  contactName?: string
  contactPhone?: string
  contactEmail?: string
}

export async function listUispSites(creds: UispCredentials): Promise<UispSite[]> {
  return uispFetch<UispSite[]>("/sites", creds)
}

// ---- Statistics ----

export interface UispDeviceStat {
  deviceId: string
  timestamp: string
  signal?: number
  signalRemote?: number
  rxRate?: number
  txRate?: number
  rxBytes?: number
  txBytes?: number
  cpuUsage?: number
  ramUsage?: number
  uptime?: number
}

export async function getUispDeviceStats(
  creds: UispCredentials,
  deviceId: string,
  period: "hour" | "day" | "week" = "hour"
): Promise<UispDeviceStat[]> {
  return uispFetch<UispDeviceStat[]>(`/devices/${deviceId}/statistics?period=${period}`, creds)
}

// ---- Test connection ----

export async function testUispConnection(
  creds: UispCredentials
): Promise<{ ok: boolean; deviceCount?: number; error?: string }> {
  try {
    const devices = await listUispDevices(creds)
    return { ok: true, deviceCount: devices.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
