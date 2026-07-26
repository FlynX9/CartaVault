export interface DashboardSummary {
  places: number
  maps: number
  countries: number
  trips: number
  visited_places: number
  unvisited_places: number
  favorites: number
  media: number
  places_without_photos: number
  planned_trips: number
  completed_trips: number
}

export interface DashboardNamedCount {
  id: string | null
  name: string
  count: number
  icon: string | null
  country_code: string | null
}

export interface DashboardStatusItem {
  id: string
  name: string
  color: string
  count: number
}

export interface DashboardRecentPlace {
  id: string
  map_id: string
  map_name: string
  name: string
  country_name: string
  country_code: string
  region: string | null
  status_name: string
  status_color: string
  is_favorite: boolean
  primary_photo_id: string | null
  updated_at: string
}

export interface DashboardRecentTrip {
  id: string
  map_id: string
  map_name: string
  name: string
  status: string
  start_date: string | null
  end_date: string | null
  day_count: number
  route_distance_meters: number
  route_duration_seconds: number
  updated_at: string
}

export interface DashboardAttention {
  without_photos: number
  without_categories: number
  without_coordinates: number
  without_region: number
  possible_duplicates: number
  stale_routes: number
  incomplete_map_metadata: number
}

export interface DashboardMapPoint {
  latitude: number
  longitude: number
  count: number
}

export interface DashboardActivityItem {
  id: string
  place_id: string
  place_name: string
  action: string
  created_at: string
}

export interface Dashboard {
  summary: DashboardSummary
  statuses: DashboardStatusItem[]
  top_countries: DashboardNamedCount[]
  top_categories: DashboardNamedCount[]
  recent_places: DashboardRecentPlace[]
  recent_trips: DashboardRecentTrip[]
  attention: DashboardAttention
  map_points: DashboardMapPoint[]
  activity: DashboardActivityItem[]
}
