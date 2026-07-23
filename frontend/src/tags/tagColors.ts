import type { CSSProperties } from 'react'

export const DEFAULT_TAG_COLOR = '#0FA68A'

const TAG_COLOR_PATTERN = /^#[0-9A-F]{6}$/i

export function normalizeTagColor(color?: string | null): string {
  return color && TAG_COLOR_PATTERN.test(color) ? color.toUpperCase() : DEFAULT_TAG_COLOR
}

export function getTagColorStyle(color?: string | null): CSSProperties {
  const normalized = normalizeTagColor(color)
  const red = Number.parseInt(normalized.slice(1, 3), 16)
  const green = Number.parseInt(normalized.slice(3, 5), 16)
  const blue = Number.parseInt(normalized.slice(5, 7), 16)
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000

  return {
    backgroundColor: normalized,
    borderColor: normalized,
    color: luminance > 155 ? '#0D1B2A' : '#FFFFFF',
  }
}
