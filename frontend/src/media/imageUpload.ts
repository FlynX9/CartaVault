import { gps, parse } from 'exifr'

export const DEFAULT_MAX_DIMENSION = 2560

export interface ImageLocation { latitude: number; longitude: number }

function validCoordinates(latitude: unknown, longitude: unknown): ImageLocation | null {
  const lat = typeof latitude === 'number' ? latitude : Number(latitude)
  const lon = typeof longitude === 'number' ? longitude : Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { latitude: lat, longitude: lon }
}

/**
 * Read EXIF/XMP GPS metadata from the original file before canvas compression
 * deliberately strips metadata. exifr handles the JPEG variants emitted by
 * Android and iOS cameras, as well as PNG/HEIC sources where supported.
 */
export async function readImageLocation(file: File): Promise<ImageLocation | null> {
  try {
    const coordinates = await gps(file)
    const direct = validCoordinates(coordinates?.latitude, coordinates?.longitude)
    if (direct) return direct

    // Some Android editors write location in XMP rather than in the EXIF GPS IFD.
    // The full parser exposes these fields while `gps()` deliberately only reads
    // the compact EXIF GPS block.
    const metadata = await parse(file, true) as Record<string, unknown> | undefined
    return validCoordinates(
      metadata?.latitude ?? metadata?.GPSLatitude,
      metadata?.longitude ?? metadata?.GPSLongitude,
    )
  } catch {
    // A photograph without metadata remains a valid media upload.
    return null
  }
}

export async function compressImage(file: File, maxDimension = DEFAULT_MAX_DIMENSION): Promise<File> {
  if (!file.type.startsWith('image/') || !('createImageBitmap' in window)) return file
  const bitmap = await createImageBitmap(file)
  const safeDimension = Math.max(1, Number.isFinite(maxDimension) ? Math.round(maxDimension) : DEFAULT_MAX_DIMENSION)
  const scale = Math.min(1, safeDimension / Math.max(bitmap.width, bitmap.height)); const width = Math.max(1, Math.round(bitmap.width * scale)); const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height); bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', .84))
  return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp', lastModified: file.lastModified }) : file
}
