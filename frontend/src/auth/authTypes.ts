export interface AuthUser {
  id: string
  email: string
  display_name: string
  is_admin: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  last_login_at: string | null
  csrf_token: string
  avatar_url?: string | null
}

export interface LoginPayload {
  email: string
  password: string
}
