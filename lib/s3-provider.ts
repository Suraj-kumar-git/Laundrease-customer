import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import crypto from 'crypto'
 
// ============================================================
// S3 Provider Document Upload
// Bucket: process.env.AWS_S3_BUCKET_PROVIDERS (e.g. laundrease-providers)
// Key pattern: providers/{provider_id}/{doc_type}/{uuid}.{ext}
// ============================================================
 
function getS3Client(): S3Client {
  const region          = process.env.AWS_REGION
  const accessKeyId     = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
 
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS S3 configuration')
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
 
const BUCKET = process.env.AWS_S3_COMMON_BUCKET ?? 'laundrease'
 
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])
 
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
 
/**
* Upload a provider document to S3.
* Returns the S3 key (stored in laundry_profiles.documents JSONB).
*/
export async function uploadProviderDocument(
  file: File,
  providerId: string,
  docType: string
): Promise<string> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WEBP, PDF`)
  }
 
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large (max 10 MB): ${file.name}`)
  }
 
  const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const uuid     = crypto.randomUUID()
  const s3Key    = `laundry/${providerId}/${docType}/${uuid}.${ext}`
 
  const buffer   = Buffer.from(await file.arrayBuffer())
  const client   = getS3Client()
 
  await client.send(
    new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         s3Key,
      Body:        buffer,
      ContentType: file.type,
      // Documents are private — no public ACL
      Metadata: {
        provider_id: providerId,
        doc_type:    docType,
        original:    file.name,
      },
    })
  )
 
  return s3Key
}