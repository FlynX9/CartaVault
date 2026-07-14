export const MAX_PHOTO_SIZE = 20 * 1024 * 1024
export const ACCEPTED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function validatePhotoFile(file: File): string | null {
  if (!ACCEPTED_PHOTO_TYPES.has(file.type)) return 'Formats acceptés : JPEG, PNG ou WebP.'
  if (file.size === 0) return 'Le fichier est vide.'
  if (file.size > MAX_PHOTO_SIZE) return 'Le fichier dépasse 20 Mio.'
  return null
}
