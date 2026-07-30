import { memo, useState } from 'react'

import { getPhotoFileUrl } from '../../api/photos'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'

interface PlaceListThumbnailProps {
  photoId: string | null | undefined
  statusColor: string
  categoryIcon?: string
}

/** A stable, list-sized thumbnail that falls back without retrying a broken image. */
export const PlaceListThumbnail = memo(function PlaceListThumbnail({
  photoId,
  statusColor,
  categoryIcon,
}: PlaceListThumbnailProps) {
  const [failedPhotoId, setFailedPhotoId] = useState<string | null>(null)

  if (photoId && failedPhotoId !== photoId) {
    return (
      <img
        src={getPhotoFileUrl(photoId)}
        alt=""
        width={78}
        height={78}
        loading="lazy"
        decoding="async"
        onError={() => setFailedPhotoId(photoId)}
      />
    )
  }

  return (
    <span
      className="place-list-category-bubble"
      style={{ backgroundColor: statusColor, borderColor: statusColor }}
    >
      <CategoryIconPreview iconId={categoryIcon} size={22} showLabel={false} />
    </span>
  )
})
