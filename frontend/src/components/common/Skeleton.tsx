import type { CSSProperties } from 'react'

interface SkeletonProps {
  className?: string
  width?: string
  height?: string
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  const style = {
    ...(width ? { '--skeleton-width': width } : {}),
    ...(height ? { '--skeleton-height': height } : {}),
  } as CSSProperties
  return <span className={`cv-skeleton ${className}`.trim()} style={style} aria-hidden="true" />
}

export function SkeletonText({ lines = 2 }: { lines?: number }) {
  return <span className="cv-skeleton-text" aria-hidden="true">{Array.from({ length: lines }, (_, index) => <Skeleton key={index} width={index === lines - 1 ? '62%' : '100%'} />)}</span>
}

export function SkeletonList({ rows = 5, label = 'Chargement du contenu' }: { rows?: number; label?: string }) {
  return <div className="cv-skeleton-list" role="status" aria-live="polite" aria-label={label} aria-busy="true">
    {Array.from({ length: rows }, (_, index) => <div className="cv-skeleton-row" key={index}><Skeleton className="cv-skeleton-avatar" /><SkeletonText /></div>)}
  </div>
}

export function SkeletonGallery({ items = 6, label = 'Chargement des médias' }: { items?: number; label?: string }) {
  return <div className="cv-skeleton-gallery" role="status" aria-live="polite" aria-label={label} aria-busy="true">
    {Array.from({ length: items }, (_, index) => <div className="cv-skeleton-gallery-item" key={index}><Skeleton className="cv-skeleton-thumbnail" /><SkeletonText lines={1} /></div>)}
  </div>
}
