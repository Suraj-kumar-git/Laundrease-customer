// lib/s3-support.ts
// S3 utilities specifically for support ticket attachments.
// Follows the same pattern as lib/s3.ts (careers) and lib/s3-profile.ts.
// Uses a dedicated bucket: AWS_S3_BUCKET_SUPPORT (falls back to AWS_S3_BUCKET)

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

// ─── S3 client ────────────────────────────────────────────────────────────────

function getS3Client(): S3Client {
  const region          = process.env.AWS_REGION
  const accessKeyId     = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing AWS S3 configuration. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.'
    )
  }

  const config: ConstructorParameters<typeof S3Client>[0] = {
    region,
    credentials: { accessKeyId, secretAccessKey },
  }

  if (process.env.AWS_S3_ENDPOINT) {
    config.endpoint      = process.env.AWS_S3_ENDPOINT
    config.forcePathStyle = true
  }

  return new S3Client(config)
}

const BUCKET = process.env.AWS_S3_BUCKET_SUPPORT
           || process.env.AWS_S3_BUCKET
           || 'laundrease-support'

const SIGNED_URL_EXPIRY = parseInt(
  process.env.AWS_S3_SIGNED_URL_EXPIRY_SUPPORT || '3600',  // 1 hour default
  10
)

// ─── Upload ───────────────────────────────────────────────────────────────────

interface UploadParams {
  buffer:       Buffer
  filename:     string
  contentType:  string
  uploaderRole: string   // 'laundry' | 'customer' | 'delivery' | etc.
  uploaderId:   number
}

interface UploadResult {
  storageKey: string
  url:        string   // signed URL valid for SIGNED_URL_EXPIRY seconds
}

/**
 * Upload a support ticket attachment to S3.
 * Key format: support-attachments/{role}/{uploaderId}/{timestamp}-{random}-{sanitized-filename}
 */
export async function uploadSupportAttachment(params: UploadParams): Promise<UploadResult> {
  const client     = getS3Client()
  const random     = crypto.randomBytes(6).toString('hex')
  const safeName   = params.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  const storageKey = `support-attachments/${params.uploaderRole}/${params.uploaderId}/${Date.now()}-${random}-${safeName}`

  await client.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         storageKey,
    Body:        params.buffer,
    ContentType: params.contentType,
    // Server-side encryption
    ServerSideEncryption: 'AES256',
    // Metadata for audit
    Metadata: {
      'uploader-role': params.uploaderRole,
      'uploader-id':   String(params.uploaderId),
      'original-name': params.filename,
    },
  }))

  // Generate a signed URL for immediate use (e.g. show preview after upload)
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key:    storageKey,
      ResponseContentDisposition: `inline; filename="${safeName}"`,
    }),
    { expiresIn: SIGNED_URL_EXPIRY }
  )

  return { storageKey, url }
}

// ─── Signed URL for reading ───────────────────────────────────────────────────

/**
 * Generate a time-limited signed URL to read a support attachment.
 * Returns null if the key no longer exists.
 */
export async function getSupportAttachmentUrl(storageKey: string): Promise<string | null> {
  if (!storageKey) return null
  try {
    const client = getS3Client()
    const url    = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: BUCKET,
        Key:    storageKey,
        ResponseContentDisposition: `inline; filename="${storageKey.split('/').pop()}"`,
      }),
      { expiresIn: SIGNED_URL_EXPIRY }
    )
    return url
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey') return null
    throw err
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Permanently delete a support attachment from S3.
 * Call this when an attachment record is deleted from the DB.
 */
export async function deleteSupportAttachment(storageKey: string): Promise<void> {
  if (!storageKey) return
  const client = getS3Client()
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey }))
}
