// lib/encryption.ts
// AES-256-GCM symmetric encryption for storing sensitive config (payment gateway keys) in DB.
// Master key comes from env — never stored in DB.
// Encrypted format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"

import crypto from 'crypto'
const ALGORITHM = 'aes-256-gcm'

/**
 * Get the 32-byte master encryption key from env.
 * Must be a 64-char hex string (32 bytes).
 */
const ENCRYPTION_KEY = process.env.ENCRYPTION_MASTER_KEY || process.env.JWT_SECRET || ''
 
function getKeyBuffer(): Buffer {
  // Derive a 32-byte key from the env variable using SHA-256
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
}

/**
 * Encrypt a plaintext string.
 * Returns: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */
export function encrypt(plaintext: string): string {
  const key = getKeyBuffer()
  const iv  = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag   = cipher.getAuthTag()
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

/**
 * Decrypt a value previously encrypted with encrypt().
 * Returns the original plaintext string.
 */
export function decrypt(stored: string): string {
  try {
    const [ivB64, tagB64, cipherB64] = stored.split(':')
    const key    = getKeyBuffer()
    const iv     = Buffer.from(ivB64,    'base64')
    const tag    = Buffer.from(tagB64,   'base64')
    const cipher = Buffer.from(cipherB64,'base64')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(cipher).toString('utf8') + decipher.final('utf8')
  } catch {
    return ''
  }
}

/**
 * Safely decrypt — returns null if value is null/empty or decryption fails.
 * Use this when reading gateway keys from DB.
 */
export function safeDecrypt(encryptedValue: string | null | undefined): string | null {
  if (!encryptedValue) return null
  try {
    return decrypt(encryptedValue)
  } catch {
    console.error('[encryption] Failed to decrypt value')
    return null
  }
}
