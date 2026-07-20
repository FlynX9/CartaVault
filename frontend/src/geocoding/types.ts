export interface GeocodingBoundingBox { west: number; south: number; east: number; north: number }
export interface GeocodingResult { id: string; name: string; formattedAddress: string; latitude: number; longitude: number; countryCode?: string; countryName?: string; region?: string; locality?: string; postalCode?: string; layer?: string; source: string; confidence?: number; boundingBox?: GeocodingBoundingBox }
export interface GeocodingSearchOptions { signal?: AbortSignal; limit?: number; focus?: [number, number]; countryCode?: string }
export interface Geocoder { search(query: string, options?: GeocodingSearchOptions): Promise<GeocodingResult[]>; reverse(latitude: number, longitude: number, options?: GeocodingSearchOptions): Promise<GeocodingResult[]> }
