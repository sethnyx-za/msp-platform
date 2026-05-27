/**
 * AES-256-GCM encryption for sensitive fields stored in the database.
 * Used for: TOTP secrets, API keys, SMTP/IMAP passwords, integration credentials.
 *
 * The ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes).
 * Generate with: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16  // 128-bit auth tag

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is not set")
  if (key.length !== 64) throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)")
  return Buffer.from(key, "hex")
}

/**
 * Encrypt a plaintext string.
 * Returns: base64(iv + ciphertext + authTag)
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // Pack: iv (12) + tag (16) + ciphertext (variable)
  const packed = Buffer.concat([iv, tag, encrypted])
  return packed.toString("base64")
}

/**
 * Decrypt a value produced by encrypt().
 * Returns the original plaintext string.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey()
  const packed = Buffer.from(ciphertext, "base64")

  const iv = packed.subarray(0, IV_LENGTH)
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = packed.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return decipher.update(encrypted) + decipher.final("utf8")
}

/**
 * Encrypt only if the value is non-empty, otherwise return null.
 */
export function encryptNullable(value: string | null | undefined): string | null {
  if (!value) return null
  return encrypt(value)
}

/**
 * Decrypt only if the value is non-null, otherwise return null.
 */
export function decryptNullable(value: string | null | undefined): string | null {
  if (!value) return null
  return decrypt(value)
}
