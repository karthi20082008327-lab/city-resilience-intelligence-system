export interface Role {
  id: string
  name: string
  description?: string | null
}

export interface User {
  id: string
  email: string
  username: string
  full_name: string
  role?: Role | null
  department?: string | null
  avatar_url?: string | null
  is_active?: boolean
  is_verified?: boolean
  phone?: string | null
  last_login?: string | null
  created_at?: string
}

export type IncidentCategory =
  | 'accident'
  | 'water_leak'
  | 'fire'
  | 'power_outage'
  | 'road_damage'
  | 'flood'
  | 'gas_leak'
  | 'building_collapse'
  | 'other'

export type IncidentStatus = 'reported' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed'
export type IncidentPriority = 'critical' | 'high' | 'medium' | 'low'

export interface IncidentMedia {
  id: string
  file_path: string
  file_type: string
  file_size?: number
  created_at?: string
}

export interface Incident {
  id: string
  incident_id: string
  category: IncidentCategory
  title: string
  description?: string | null
  status: IncidentStatus
  priority: IncidentPriority
  latitude?: number | null
  longitude?: number | null
  location_address?: string | null
  assigned_department?: string | null
  assigned_to?: string | null
  reporter_name?: string | null
  reporter_phone?: string | null
  ai_risk_score?: number | null
  ai_recommendation?: string | null
  camera_name?: string | null
  snapshot_url?: string | null
  video_url?: string | null
  detection_type?: string | null
  media?: IncidentMedia[]
  created_at?: string
  updated_at?: string
}

export interface IncidentCreate {
  category: string
  title: string
  description?: string
  latitude?: number | null
  longitude?: number | null
  location_address?: string
  reporter_name?: string
  reporter_phone?: string
  reporter_email?: string
  camera_name?: string
  snapshot_base64?: string
  video_base64?: string
}

export interface IncidentUpdate {
  status?: string
  priority?: string
  assigned_department?: string
  assigned_to?: string
  description?: string
}

export interface IncidentListResponse {
  incidents: Incident[]
  total: number
  page: number
  per_page: number
}

export interface IncidentStatsResponse {
  total: number
  reported: number
  acknowledged: number
  in_progress: number
  resolved: number
  closed: number
  critical: number
  high: number
  medium: number
  low: number
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  expires_in?: number
  token_type?: string
  user?: User
}

export interface WeatherData {
  temperature: number
  humidity: number
  wind_speed: number
  pressure: number
  description: string
  icon: string
  rain_probability: number
  uv_index: number
  air_quality: number
  city: string
  country: string
}

export interface WeatherRisk {
  city: string
  flood_risk: number
  uv_risk: number
  wind_risk: number
  overall_risk: number
  recommendation: string
  weather: WeatherData
}

export interface UserListResponse {
  users: User[]
  total: number
  page: number
  per_page: number
}
