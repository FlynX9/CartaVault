import { sendFormData, sendJson } from './client'
import type { KmzImportReport, KmzPreview, KmzPreviewImage, KmzPreviewItem } from '../types/imports'
import { isRecord, readArray, readBoolean, readNumber, readString, readUuid } from './validation'

function parseImage(value: unknown): KmzPreviewImage {
  const context = "L'image KMZ"
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return { internal_id: readString(value, 'internal_id', context), original_name: readString(value, 'original_name', context), mime_type: readString(value, 'mime_type', context), size: readNumber(value, 'size', context), source_type: readString(value, 'source_type', context) as KmzPreviewImage['source_type'], host: typeof value.host === 'string' ? value.host : null }
}

function parseItem(value: unknown): KmzPreviewItem {
  const context = 'Le point KMZ'
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return {
    source_index: readNumber(value, 'source_index', context), selected_by_default: readBoolean(value, 'selected_by_default', context), name: typeof value.name === 'string' ? value.name : null,
    latitude: typeof value.latitude === 'number' ? value.latitude : null, longitude: typeof value.longitude === 'number' ? value.longitude : null, altitude: typeof value.altitude === 'number' ? value.altitude : null,
    mapped_fields: isRecord(value.mapped_fields) ? Object.fromEntries(Object.entries(value.mapped_fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {},
    custom_fields: isRecord(value.custom_fields) ? Object.fromEntries(Object.entries(value.custom_fields).filter((entry): entry is [string, string | string[]] => typeof entry[1] === 'string' || (Array.isArray(entry[1]) && entry[1].every((part) => typeof part === 'string')))) : {},
    images: readArray(value, 'images', context).map(parseImage), warnings: readArray(value, 'warnings', context).filter((warning): warning is string => typeof warning === 'string'), errors: readArray(value, 'errors', context).filter((error): error is string => typeof error === 'string'), importable: readBoolean(value, 'importable', context), already_imported: readBoolean(value, 'already_imported', context),
  }
}

function parsePreview(payload: unknown): KmzPreview {
  const context = "L'aperçu KMZ"
  if (!isRecord(payload)) throw new Error(`${context} est invalide.`)
  return { import_id: readUuid(payload, 'import_id', context), file_name: readString(payload, 'file_name', context), placemark_count: readNumber(payload, 'placemark_count', context), valid_count: readNumber(payload, 'valid_count', context), warning_count: readNumber(payload, 'warning_count', context), error_count: readNumber(payload, 'error_count', context), items: readArray(payload, 'items', context).map(parseItem), global_warnings: readArray(payload, 'global_warnings', context).filter((warning): warning is string => typeof warning === 'string') }
}

function parseReport(payload: unknown): KmzImportReport {
  const context = "Le rapport d'import KMZ"
  if (!isRecord(payload)) throw new Error(`${context} est invalide.`)
  return { created_count: readNumber(payload, 'created_count', context), skipped_count: readNumber(payload, 'skipped_count', context), error_count: readNumber(payload, 'error_count', context), images_added: readNumber(payload, 'images_added', context), embedded_images_added: readNumber(payload, 'embedded_images_added', context), remote_images_added: readNumber(payload, 'remote_images_added', context), remote_images_unavailable: readNumber(payload, 'remote_images_unavailable', context), created_place_ids: readArray(payload, 'created_place_ids', context).map((value) => typeof value === 'string' ? value : ''), failures: readArray(payload, 'failures', context).flatMap((value) => isRecord(value) && typeof value.source_index === 'number' && typeof value.message === 'string' ? [{ source_index: value.source_index, message: value.message }] : []), warnings: readArray(payload, 'warnings', context).filter((warning): warning is string => typeof warning === 'string') }
}

export async function previewKmzImport(mapId: string, file: File): Promise<KmzPreview> {
  const formData = new FormData(); formData.append('file', file)
  return parsePreview(await sendFormData(`/maps/${encodeURIComponent(mapId)}/imports/kmz/preview`, 'POST', formData))
}

export async function confirmKmzImport(
  mapId: string,
  importId: string,
  selectedSourceIndexes: number[],
  downloadRemoteImages = false,
  forceSourceIndexes: number[] = [],
): Promise<KmzImportReport> {
  return parseReport(await sendJson(`/maps/${encodeURIComponent(mapId)}/imports/kmz/confirm`, 'POST', {
    import_id: importId,
    selected_source_indexes: selectedSourceIndexes,
    download_remote_images: downloadRemoteImages,
    force_source_indexes: forceSourceIndexes,
  }))
}
