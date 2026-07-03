// lib/s3.ts
// Single shared S3 client + helpers for every file-upload/-download flow in
// the project (order invoices, laundry/delivery documents, profile photos,
// support ticket attachments, careers JD downloads). Everything reads and
// writes the one bucket: AWS_S3_COMMON_BUCKET.

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

const BUCKET = process.env.AWS_S3_COMMON_BUCKET || 'laundrease'
const DEFAULT_EXPIRY = parseInt(process.env.AWS_S3_SIGNED_URL_EXPIRY || '300', 10)

// ─── Client ─────────────────────────────────────────────────────────────────

function getS3Client(): S3Client {
  const region          = process.env.AWS_REGION
  const accessKeyId     = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS S3 config. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.')
  }

  const config: ConstructorParameters<typeof S3Client>[0] = {
    region,
    credentials: { accessKeyId, secretAccessKey },
  }
  if (process.env.AWS_S3_ENDPOINT) {
    config.endpoint       = process.env.AWS_S3_ENDPOINT
    config.forcePathStyle = true
  }
  return new S3Client(config)
}

// ─── Generic low-level helpers ──────────────────────────────────────────────

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getS3Client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch (err: any) {
    if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return false
    throw err
  }
}

export async function uploadBuffer(
  key:         string,
  buffer:      Buffer,
  contentType: string,
  opts: { metadata?: Record<string, string>; contentDisposition?: string } = {}
): Promise<void> {
  await getS3Client().send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
    ...(opts.metadata           ? { Metadata: opts.metadata }                     : {}),
    ...(opts.contentDisposition ? { ContentDisposition: opts.contentDisposition } : {}),
  }))
}

export async function getSignedDownloadUrl(
  key: string,
  opts: { expiresIn?: number; filename?: string; contentType?: string; disposition?: 'inline' | 'attachment' } = {}
): Promise<string> {
  const filename = opts.filename ?? key.split('/').pop()
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: BUCKET,
      Key:    key,
      ResponseContentDisposition: `${opts.disposition ?? 'inline'}; filename="${filename}"`,
      ...(opts.contentType ? { ResponseContentType: opts.contentType } : {}),
    }),
    { expiresIn: opts.expiresIn ?? DEFAULT_EXPIRY }
  )
}

export async function getSignedUploadUrl(
  key:         string,
  contentType: string,
  opts: { expiresIn?: number; maxBytes?: number; metadata?: Record<string, string> } = {}
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket:        BUCKET,
    Key:           key,
    ContentType:   contentType,
    ...(opts.maxBytes  ? { ContentLength: opts.maxBytes } : {}),
    ...(opts.metadata  ? { Metadata: opts.metadata }      : {}),
  })
  return getSignedUrl(getS3Client(), command, { expiresIn: opts.expiresIn ?? 900 })
}

export async function deleteObject(key: string): Promise<void> {
  if (!key) return
  await getS3Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// ─── Laundry / delivery documents (was lib/s3.ts) ──────────────────────────

export async function getDocSignedUrl(s3Key: string): Promise<string | null> {
  if (!(await objectExists(s3Key))) return null
  return getSignedDownloadUrl(s3Key, { disposition: 'inline' })
}

export async function getDocUploadUrl(
  s3Key:       string,
  contentType: string,
  role:        string,
  maxBytes:    number = 10 * 1024 * 1024  // 10 MB
): Promise<string> {
  return getSignedUploadUrl(s3Key, contentType, {
    expiresIn: 900,
    maxBytes,
    metadata: { 'x-uploaded-by': `${role}-upload` },
  })
}

export function buildDocKey(
  profileId: number | string,
  docKey:    string,
  version:   number,
  filename:  string,
  role:      string
): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${role}/${profileId}/${docKey}/v${version}/${Date.now()}_${sanitized}`
}

// ─── Laundry provider documents (was lib/s3-provider.ts) ───────────────────

const PROVIDER_DOC_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'image/heic', 'image/heif', // iPhone camera default format
])
const PROVIDER_DOC_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

/** Upload a provider document. Returns the S3 key (stored in laundry_profiles.documents JSONB). */
export async function uploadProviderDocument(
  file:       File,
  providerId: string,
  docType:    string
): Promise<string> {
  if (!PROVIDER_DOC_ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WEBP, PDF, HEIC, HEIF`)
  }
  if (file.size > PROVIDER_DOC_MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large (max 10 MB): ${file.name}`)
  }

  const ext   = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const uuid  = crypto.randomUUID()
  const s3Key = `laundry/${providerId}/${docType}/${uuid}.${ext}`

  await uploadBuffer(s3Key, Buffer.from(await file.arrayBuffer()), file.type, {
    metadata: {
      provider_id: providerId,
      doc_type:    docType,
      original:    file.name,
    },
  })

  return s3Key
}

// ─── Profile photos (was lib/s3-profile.ts) ────────────────────────────────

/**
 * Upload a profile photo. Stored at: profile-images/{userId}/{timestamp}.{ext}
 * Returns the public S3 URL (bucket must have public-read on profile-images/*,
 * or front it with CloudFront and swap the returned URL accordingly).
 */
export async function uploadProfilePhoto(
  userId:   string,
  buffer:   Buffer,
  mimeType: string
): Promise<string> {
  const region = process.env.AWS_REGION
  if (!region) throw new Error('Missing AWS_REGION for profile photo upload')

  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  const key = `profile-images/${userId}/${Date.now()}.${ext}`

  await uploadBuffer(key, buffer, mimeType)

  return `https://${BUCKET}.s3.${region}.amazonaws.com/${key}`
}

/** Delete an old profile photo when the user uploads a new one. Pass the full S3 URL. */
export async function deleteProfilePhoto(s3Url: string): Promise<void> {
  try {
    const key = new URL(s3Url).pathname.slice(1) // strip leading '/'
    if (!key.startsWith('profile-images/')) return // safety: only delete profile images
    await deleteObject(key)
  } catch {
    console.warn('[deleteProfilePhoto] Failed to delete old photo:', s3Url)
  }
}

const PROFILE_IMAGE_SIGNED_URL_EXPIRY = 3600 // 1 hour — re-signed fresh on every read

/**
 * Resolve whatever's stored in `users.profile_image` (a raw S3 URL, in the
 * format produced by uploadProfilePhoto above) into a signed, browser-loadable
 * URL. The bucket has no public-read policy, so the raw URL alone 404s/403s —
 * every read path that surfaces profile_image to a client must go through
 * this. Safe to call with non-S3 URLs (e.g. OAuth provider avatars) — those
 * are returned unchanged.
 */
export async function resolveProfileImageUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null
  let key: string
  try {
    const parsed = new URL(stored)
    if (!parsed.hostname.endsWith('.amazonaws.com')) return stored // external (e.g. OAuth) avatar — pass through
    key = parsed.pathname.slice(1)
  } catch {
    return stored
  }
  if (!key.startsWith('profile-images/')) return stored
  try {
    if (!(await objectExists(key))) return null
    return await getSignedDownloadUrl(key, { expiresIn: PROFILE_IMAGE_SIGNED_URL_EXPIRY, disposition: 'inline' })
  } catch {
    return null
  }
}

// ─── Careers JD downloads (was lib/s3-jd.ts) ───────────────────────────────

/** Pre-signed download URL for a careers JD PDF. Returns null if the key doesn't exist. */
export async function getJdSignedUrl(s3Key: string): Promise<string | null> {
  if (!(await objectExists(s3Key))) return null
  return getSignedDownloadUrl(s3Key, { disposition: 'attachment', contentType: 'application/pdf' })
}

// ─── Item-protection claim photos ──────────────────────────────────────────

const CLAIM_PHOTO_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const CLAIM_PHOTO_MAX_SIZE = 8 * 1024 * 1024 // 8 MB

/** Upload a claim evidence photo. Returns the S3 key (stored in garment_claims.photo_urls). */
export async function uploadClaimPhoto(
  file:    File,
  orderId: number,
  claimId: number
): Promise<string> {
  if (!CLAIM_PHOTO_ALLOWED_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WEBP, HEIC, HEIF`)
  }
  if (file.size > CLAIM_PHOTO_MAX_SIZE) {
    throw new Error('File too large (max 8 MB)')
  }

  const ext   = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const key   = `claims/${orderId}/${claimId}/${crypto.randomUUID()}.${ext}`

  await uploadBuffer(key, Buffer.from(await file.arrayBuffer()), file.type, {
    metadata: { order_id: String(orderId), claim_id: String(claimId) },
  })

  return key
}

/** Time-limited signed URL to view a claim photo (support/admin review). */
export async function getClaimPhotoUrl(s3Key: string): Promise<string | null> {
  if (!(await objectExists(s3Key))) return null
  return getSignedDownloadUrl(s3Key, { disposition: 'inline' })
}

// ─── Support ticket attachments (was lib/s3-support.ts) ────────────────────

const SUPPORT_SIGNED_URL_EXPIRY = parseInt(
  process.env.AWS_S3_SIGNED_URL_EXPIRY_SUPPORT || '3600',  // 1 hour default
  10
)

interface SupportUploadParams {
  buffer:       Buffer
  filename:     string
  contentType:  string
  uploaderRole: string   // 'laundry' | 'customer' | 'delivery' | etc.
  uploaderId:   number
}

interface SupportUploadResult {
  storageKey: string
  url:        string   // signed URL valid for SUPPORT_SIGNED_URL_EXPIRY seconds
}

/**
 * Upload a support ticket attachment.
 * Key format: support-attachments/{role}/{uploaderId}/{timestamp}-{random}-{sanitized-filename}
 */
export async function uploadSupportAttachment(params: SupportUploadParams): Promise<SupportUploadResult> {
  const random     = crypto.randomBytes(6).toString('hex')
  const safeName   = params.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  const storageKey = `support-attachments/${params.uploaderRole}/${params.uploaderId}/${Date.now()}-${random}-${safeName}`

  await getS3Client().send(new PutObjectCommand({
    Bucket:               BUCKET,
    Key:                  storageKey,
    Body:                 params.buffer,
    ContentType:          params.contentType,
    ServerSideEncryption: 'AES256',
    Metadata: {
      'uploader-role': params.uploaderRole,
      'uploader-id':   String(params.uploaderId),
      'original-name': params.filename,
    },
  }))

  const url = await getSignedDownloadUrl(storageKey, {
    expiresIn: SUPPORT_SIGNED_URL_EXPIRY,
    filename:  safeName,
    disposition: 'inline',
  })

  return { storageKey, url }
}

/** Time-limited signed URL to read a support attachment. Returns null if the key no longer exists. */
export async function getSupportAttachmentUrl(storageKey: string): Promise<string | null> {
  if (!storageKey) return null
  if (!(await objectExists(storageKey))) return null
  return getSignedDownloadUrl(storageKey, { expiresIn: SUPPORT_SIGNED_URL_EXPIRY, disposition: 'inline' })
}

/** Permanently delete a support attachment — call when its DB record is deleted. */
export async function deleteSupportAttachment(storageKey: string): Promise<void> {
  await deleteObject(storageKey)
}
