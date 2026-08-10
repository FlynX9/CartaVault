import { getMediaUploadPolicy, uploadMedia } from '../api/media'
import { compressImage, readImageLocation } from './imageUpload'

/** Runs only after the browser has supplied one or more image files. */
export async function uploadPreparedMedia(files: File[], mapId: string): Promise<void> {
  const policy = await getMediaUploadPolicy()
  for (const source of files) {
    const [coordinates, compressed] = await Promise.all([
      readImageLocation(source),
      compressImage(source, policy.max_image_dimension),
    ])
    if (compressed.size > policy.max_upload_bytes) {
      throw new Error(`« ${source.name} » dépasse la limite d’import de ${(policy.max_upload_bytes / 1024 / 1024).toLocaleString('fr-FR')} Mo.`)
    }
    await uploadMedia(compressed, mapId, coordinates, undefined, source)
  }
}
