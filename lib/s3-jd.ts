import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ============================================================
// S3 Client — Careers JD Downloads
// ============================================================

const getS3Client = (): S3Client => {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS S3 configuration. Check AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY env vars.')
  }

  const config: ConstructorParameters<typeof S3Client>[0] = {
    region,
    credentials: { accessKeyId, secretAccessKey },
  }

  // Support local development with LocalStack or MinIO
  if (process.env.AWS_S3_ENDPOINT) {
    config.endpoint = process.env.AWS_S3_ENDPOINT
    config.forcePathStyle = true
  }

  return new S3Client(config)
}

const BUCKET = process.env.AWS_S3_BUCKET_CAREERS || 'laundrease-careers'
const SIGNED_URL_EXPIRY = parseInt(process.env.AWS_S3_SIGNED_URL_EXPIRY || '300', 10)

/**
 * Generate a pre-signed S3 URL for a JD PDF download.
 * URL is valid for SIGNED_URL_EXPIRY seconds (default 5 minutes).
 * Returns null if the key does not exist in the bucket.
 */
export async function getJdSignedUrl(s3Key: string): Promise<string | null> {
  try {
    const client = getS3Client()

    // Verify the object exists before generating a signed URL
    await client.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: s3Key })
    )

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ResponseContentDisposition: `attachment; filename="${s3Key.split('/').pop()}"`,
      ResponseContentType: 'application/pdf',
    })

    return await getSignedUrl(client, command, { expiresIn: SIGNED_URL_EXPIRY })
  } catch (error: any) {
    // Object does not exist (NoSuchKey / NotFound) or credentials issue
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
      return null
    }
    // Re-throw unexpected errors so the caller can handle them
    throw error
  }
}
