/**
 * Email Configuration Service
 *
 * Loads the active email configuration from the database and builds a
 * nodemailer transporter. Falls back to SMTP_* env vars if no DB config exists.
 *
 * Supported providers:
 *   smtp   — generic SMTP (host, port, user, password)
 *   zoho   — Zoho Mail SMTP (smtp.zoho.com:465 TLS)
 *   gmail  — Google OAuth2 via nodemailer OAuth2 transport
 *   m365   — Microsoft 365 OAuth2 via nodemailer OAuth2 transport
 *
 * For OAuth2 providers, credentials are stored encrypted in email_configs.
 * The OAuth2 flow must be completed externally (the refresh_token is pasted in
 * the admin settings). Phase 8+ could add a full OAuth callback UI.
 */

import nodemailer from "nodemailer"
import { db } from "@/lib/db"
import { emailConfigs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { decryptNullable } from "@/lib/encryption"

export type EmailProvider = "smtp" | "zoho" | "gmail" | "m365"

export interface EmailConfigRow {
  id: string
  provider: string
  smtpHost: string | null
  smtpPort: number | null
  smtpUser: string | null
  smtpPasswordEncrypted: string | null
  smtpSecure: boolean | null
  fromName: string | null
  fromAddress: string | null
  oauthClientId: string | null
  oauthClientSecretEncrypted: string | null
  oauthRefreshTokenEncrypted: string | null
  oauthTenantId: string | null
  imapHost: string | null
  imapPort: number | null
  imapUser: string | null
  imapPasswordEncrypted: string | null
  imapTls: boolean | null
  imapMailbox: string | null
  isActive: boolean
}

// ─── Load active config from DB ───────────────────────────────────────────────

let _cached: EmailConfigRow | null | undefined = undefined // undefined = not loaded yet

export async function getActiveEmailConfig(): Promise<EmailConfigRow | null> {
  if (_cached !== undefined) return _cached

  const [row] = await db
    .select()
    .from(emailConfigs)
    .where(eq(emailConfigs.isActive, true))
    .limit(1)

  _cached = row ?? null
  // Clear cache after 60 seconds so config changes are picked up
  setTimeout(() => { _cached = undefined }, 60_000)
  return _cached
}

export function clearEmailConfigCache() {
  _cached = undefined
}

// ─── Build nodemailer transporter ─────────────────────────────────────────────

export async function buildTransporter(): Promise<nodemailer.Transporter | null> {
  const config = await getActiveEmailConfig()

  if (config) {
    return buildTransporterFromConfig(config)
  }

  // Fall back to env vars
  const smtpHost = process.env.SMTP_HOST
  if (!smtpHost) return null

  return nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

function buildTransporterFromConfig(config: EmailConfigRow): nodemailer.Transporter | null {
  const provider = config.provider as EmailProvider

  if (provider === "gmail") {
    const clientId = config.oauthClientId
    const clientSecret = decryptNullable(config.oauthClientSecretEncrypted)
    const refreshToken = decryptNullable(config.oauthRefreshTokenEncrypted)

    if (!clientId || !clientSecret || !refreshToken) {
      console.warn("[EmailConfig] Gmail OAuth2 provider missing credentials")
      return null
    }

    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: config.smtpUser ?? config.fromAddress ?? "",
        clientId,
        clientSecret,
        refreshToken,
      },
    })
  }

  if (provider === "m365") {
    const clientId = config.oauthClientId
    const clientSecret = decryptNullable(config.oauthClientSecretEncrypted)
    const refreshToken = decryptNullable(config.oauthRefreshTokenEncrypted)
    const tenantId = config.oauthTenantId ?? "common"

    if (!clientId || !clientSecret || !refreshToken) {
      console.warn("[EmailConfig] M365 OAuth2 provider missing credentials")
      return null
    }

    return nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        type: "OAuth2",
        user: config.smtpUser ?? config.fromAddress ?? "",
        clientId,
        clientSecret,
        refreshToken,
        accessUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      },
    })
  }

  if (provider === "zoho") {
    const password = decryptNullable(config.smtpPasswordEncrypted)
    return nodemailer.createTransport({
      host: config.smtpHost ?? "smtp.zoho.com",
      port: config.smtpPort ?? 465,
      secure: true,
      auth: {
        user: config.smtpUser ?? "",
        pass: password ?? "",
      },
    })
  }

  // Default: generic SMTP
  const password = decryptNullable(config.smtpPasswordEncrypted)
  if (!config.smtpHost) return null

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort ?? 587,
    secure: config.smtpSecure ?? false,
    auth: config.smtpUser
      ? { user: config.smtpUser, pass: password ?? "" }
      : undefined,
  })
}

// ─── From address ─────────────────────────────────────────────────────────────

export async function getFromAddress(): Promise<string> {
  const config = await getActiveEmailConfig()
  if (config?.fromAddress) {
    const name = config.fromName ?? "MSP Platform"
    return `${name} <${config.fromAddress}>`
  }
  return process.env.EMAIL_FROM ?? "MSP Platform <noreply@localhost>"
}

// ─── IMAP connection config ───────────────────────────────────────────────────

export interface ImapConnectionConfig {
  host: string
  port: number
  secure: boolean
  auth: { user: string; pass: string }
  mailbox: string
}

export async function getImapConfig(): Promise<ImapConnectionConfig | null> {
  const config = await getActiveEmailConfig()
  if (!config?.imapHost) return null

  const password = decryptNullable(config.imapPasswordEncrypted)
  if (!config.imapUser || !password) return null

  return {
    host: config.imapHost,
    port: config.imapPort ?? 993,
    secure: config.imapTls ?? true,
    auth: { user: config.imapUser, pass: password },
    mailbox: config.imapMailbox ?? "INBOX",
  }
}

// ─── Test connections ─────────────────────────────────────────────────────────

export async function testSmtpConnection(configId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const config = await db
      .select()
      .from(emailConfigs)
      .where(eq(emailConfigs.id, configId))
      .limit(1)
      .then((rows) => rows[0])

    if (!config) return { ok: false, error: "Config not found" }

    const transporter = buildTransporterFromConfig(config as EmailConfigRow)
    if (!transporter) return { ok: false, error: "Could not build transporter — check credentials" }

    await transporter.verify()
    clearEmailConfigCache()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function testImapConnection(configId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const config = await db
      .select()
      .from(emailConfigs)
      .where(eq(emailConfigs.id, configId))
      .limit(1)
      .then((rows) => rows[0])

    if (!config?.imapHost) return { ok: false, error: "IMAP not configured" }

    const password = decryptNullable(config.imapPasswordEncrypted)
    if (!config.imapUser || !password) return { ok: false, error: "IMAP credentials missing" }

    const { ImapFlow } = await import("imapflow")
    const client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort ?? 993,
      secure: config.imapTls ?? true,
      auth: { user: config.imapUser, pass: password },
      logger: false,
    })

    await client.connect()
    await client.logout()
    clearEmailConfigCache()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
