// ============================================================
// Add these to lib/s3.ts alongside the existing getJdSignedUrl
// ============================================================

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'

const USER_ASSETS_BUCKET = process.env.AWS_S3_COMMON_BUCKET || 'laundrease'

/**
 * Upload a profile photo to S3.
 * Stored at: profile-images/{userId}/{timestamp}.{ext}
 * Returns the public S3 URL (bucket must have public-read on profile-images/*)
 * or a signed URL if the bucket is private.
 *
 * In production, set up a CloudFront distribution in front of the bucket
 * and return the CloudFront URL instead.
 */
export async function uploadProfilePhoto(
  userId: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS credentials for profile photo upload')
  }

  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  const key = `profile-images/${userId}/${Date.now()}.${ext}`

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    ...(process.env.AWS_S3_ENDPOINT
      ? { endpoint: process.env.AWS_S3_ENDPOINT, forcePathStyle: true }
      : {}),
  })

  await client.send(
    new PutObjectCommand({
      Bucket: USER_ASSETS_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Remove ACL if bucket doesn't support it — use bucket policy instead
      // ACL: 'public-read',
    })
  )

  // Return the S3 URL
  // If using CloudFront: return `https://{CF_DOMAIN}/${key}`
  return `https://${USER_ASSETS_BUCKET}.s3.${region}.amazonaws.com/${key}`
}

/**
 * Delete an old profile photo from S3 when user uploads a new one.
 * Pass the full S3 URL — we extract the key from it.
 */
export async function deleteProfilePhoto(s3Url: string): Promise<void> {
  try {
    const region = process.env.AWS_REGION!
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID!
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!

    // Extract key from URL: https://bucket.s3.region.amazonaws.com/key
    const url = new URL(s3Url)
    const key = url.pathname.slice(1) // remove leading /

    if (!key.startsWith('profile-images/')) return // safety: only delete profile images

    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })

    await client.send(
      new DeleteObjectCommand({ Bucket: USER_ASSETS_BUCKET, Key: key })
    )
  } catch {
    // Non-fatal — log but don't throw
    console.warn('[deleteProfilePhoto] Failed to delete old photo:', s3Url)
  }
}
