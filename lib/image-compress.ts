// lib/image-compress.ts
// Client-side only. Downscales + re-encodes photo uploads before they ever
// reach the network — used by every partner document-upload flow (laundry
// registration, delivery onboarding, and both reupload pages).
//
// Root cause this addresses: iPhone camera photos are commonly 3-10MB
// (vs. a few hundred KB from a typical Android gallery pick or a laptop's
// resized upload), and HEIC photos report as content_type 'image/heic',
// which the delivery upload-url route didn't allow. Bundling several such
// files into one request (laundry's step-3 multipart POST) or sending them
// over a slow mobile connection (delivery's presigned S3 PUT) was tripping
// upstream size/timeout limits — surfacing to the partner as a generic
// "Network error" with no indication that the real cause was file size.
// Compressing (and always re-encoding to JPEG) before upload fixes both:
// it shrinks the payload regardless of source format, and it means the
// upload always carries a plain 'image/jpeg' content-type.
//
// Never throws — falls back to the original file on any failure, so a
// compression bug can never block a partner from completing onboarding.

const MAX_DIMENSION    = 1920
const JPEG_QUALITY     = 0.82
const SKIP_BELOW_BYTES = 900 * 1024 // not worth recompressing small files

export async function compressImageFile(
  file: File,
  // `force` re-encodes even a small file. Callers whose images must be
  // *viewable later by someone else* need it: the size skip below lets a small
  // HEIC through untouched, and HEIC only renders in Safari — so a photo that
  // uploaded fine from an iPhone would show as a broken image to a provider on
  // Chrome. Where the upload is only ever an archive, the skip is still the
  // right default.
  opts: { force?: boolean } = {}
): Promise<File> {
  if (typeof window === 'undefined') return file
  if (!isCompressibleImage(file)) return file
  if (!opts.force && file.size <= SKIP_BELOW_BYTES) return file

  try {
    const source = await loadDrawable(file)
    const { width, height } = scaledSize(
      (source as any).width, (source as any).height, MAX_DIMENSION
    )

    const canvas = document.createElement('canvas')
    canvas.width  = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    )
    if (!blob || blob.size >= file.size) return file // compression didn't help — keep original

    const newName = file.name.replace(/\.[^./\\]+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

// image/heic and image/heif are included since iPhones store camera photos
// in HEIC by default — Safari (desktop + iOS) can decode these onto a
// canvas, converting them to a normal JPEG in the process.
function isCompressibleImage(file: File): boolean {
  if (file.type) {
    return file.type.startsWith('image/') && file.type !== 'image/svg+xml'
  }
  // Some pickers hand back an empty MIME type — fall back to the extension.
  const ext = file.name.split('.').pop()?.toLowerCase()
  return !!ext && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)
}

async function loadDrawable(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as any)
    } catch {
      // Some browsers can't decode HEIC via createImageBitmap — try <img> below.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve()
      img.onerror = () => reject(new Error('Image failed to decode'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function scaledSize(w: number, h: number, max: number) {
  if (!w || !h || (w <= max && h <= max)) return { width: w, height: h }
  const ratio = w > h ? max / w : max / h
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) }
}
