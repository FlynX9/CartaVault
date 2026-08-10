import { gps } from 'exifr'

const MAX_DIMENSION = 2560

export interface ImageLocation { latitude: number; longitude: number }

/**
 * Read EXIF/XMP GPS metadata from the original file before canvas compression
 * deliberately strips metadata. exifr handles the JPEG variants emitted by
 * Android and iOS cameras, as well as PNG/HEIC sources where supported.
 */
export async function readImageLocation(file: File): Promise<ImageLocation | null> {
  try {
    const coordinates = await gps(file)
    const latitude = coordinates?.latitude
    const longitude = coordinates?.longitude
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    ) return null
    return { latitude, longitude }
  } catch {
    // A photograph without metadata remains a valid media upload.
    return null
  }
}

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || !('createImageBitmap' in window)) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)); const width = Math.max(1, Math.round(bitmap.width * scale)); const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height); bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', .84))
  return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp', lastModified: file.lastModified }) : file
}
