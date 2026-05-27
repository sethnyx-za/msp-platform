import { authenticator } from "otplib"
import QRCode from "qrcode"
import { encrypt, decrypt } from "@/lib/encryption"

// ─── TOTP configuration ───────────────────────────────────────────────────────
// Standard RFC 6238 settings — compatible with 1Password, Google Authenticator,
// Authy, and any TOTP-compatible app.

authenticator.options = {
  step: 30,    // 30-second window (standard)
  digits: 6,   // 6-digit codes (standard)
  window: 1,   // Allow 1 step drift (±30s) to account for clock skew
}

/**
 * Generate a new TOTP secret for a user.
 * Returns the raw secret (not encrypted) — encrypt before storing in DB.
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret()
}

/**
 * Generate the otpauth:// URI for QR code generation.
 * The issuer is the MSP app name shown in the authenticator app.
 */
export function generateTotpUri(secret: string, email: string, issuer = "MSP Platform"): string {
  return authenticator.keyuri(email, issuer, secret)
}

/**
 * Generate a QR code PNG as a base64 data URL.
 * Returns a string like "data:image/png;base64,..."
 */
export async function generateTotpQrCode(
  secret: string,
  email: string,
  issuer?: string
): Promise<string> {
  const uri = generateTotpUri(secret, email, issuer)
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: "M",
    width: 256,
    margin: 2,
  })
}

/**
 * Verify a 6-digit TOTP code against a raw (unencrypted) secret.
 */
export function verifyTotpCode(code: string, rawSecret: string): boolean {
  try {
    return authenticator.verify({ token: code, secret: rawSecret })
  } catch {
    return false
  }
}

/**
 * Encrypt a TOTP secret for storage in the database.
 */
export function encryptTotpSecret(rawSecret: string): string {
  return encrypt(rawSecret)
}

/**
 * Decrypt a TOTP secret retrieved from the database.
 */
export function decryptTotpSecret(encryptedSecret: string): string {
  return decrypt(encryptedSecret)
}

/**
 * Verify a code against an encrypted secret (as stored in DB).
 */
export function verifyTotpCodeEncrypted(code: string, encryptedSecret: string): boolean {
  try {
    const rawSecret = decryptTotpSecret(encryptedSecret)
    return verifyTotpCode(code, rawSecret)
  } catch {
    return false
  }
}
