import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET = process.env.AWS_S3_COMMON_BUCKET || 'laundrease'
const EXPIRY = parseInt(process.env.AWS_S3_SIGNED_URL_EXPIRY || '300', 10)

function getS3Client(): S3Client {
  const region          = process.env.AWS_REGION
  const accessKeyId     = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS S3 config.')
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

export async function getDocSignedUrl(s3Key: string): Promise<string | null> {
  try {
    const client = getS3Client()
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: s3Key }))
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key:    s3Key,
      ResponseContentDisposition: `inline; filename="${s3Key.split('/').pop()}"`,
    })
    return await getSignedUrl(client, command, { expiresIn: EXPIRY })
  } catch (err: any) {
    if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return null
    throw err
  }
}

export async function getDocUploadUrl(
  s3Key:       string,
  contentType: string,
  role: string,
  maxBytes:    number = 10 * 1024 * 1024  // 10 MB
): Promise<string> {
  const client  = getS3Client()
  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         s3Key,
    ContentType: contentType,
    ContentLength: maxBytes,
    Metadata:    { 'x-uploaded-by': `${role}-upload` },
  })
  return await getSignedUrl(client, command, { expiresIn: 900 })
}

export function buildDocKey(
  profileId: number | string,
  docKey:            string,
  version:           number,
  filename:          string,
  role:              string
): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${role}/${profileId}/${docKey}/v${version}/${Date.now()}_${sanitized}`
}
