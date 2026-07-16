import { sendJson } from './client'
import { API_BASE_URL } from '../config'

export interface KmzExportOptions { category_ids?: string[]; status_ids?: string[]; fields: string[]; include_custom_fields: boolean; include_images: boolean }
export interface KmzExportCreated { export_id: string; file_name: string; download_url: string; expires_at: string; report: { exported_places: number; filtered_places: number; skipped_places: number; included_images: number; skipped_images: number; custom_fields_count: number; file_size: number; warnings: string[] } }

export async function createKmzExport(mapId: string, options: KmzExportOptions): Promise<KmzExportCreated> {
  return sendJson(`/maps/${encodeURIComponent(mapId)}/exports/kmz`, 'POST', options) as Promise<KmzExportCreated>
}

export async function downloadKmzExport(url: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${url}`, { credentials: 'include' })
  if (!response.ok) throw new Error('Le fichier KMZ a expiré ou est indisponible.')
  return response.blob()
}
