export type GlobalRole = 'company_admin' | 'regular'

export type ProjectPermissionLevel = 'owner' | 'editor' | 'viewer'

export interface JWTPayload {
  userId: string
  username: string
  role?: string
  globalRole?: GlobalRole
  iat?: number
  exp?: number
}

export interface LoginRequest {
  username: string
  password: string
}

export interface AuthUserView {
  id: string
  username: string
  display_name: string
  email?: string | null
  role?: string
  globalRole: GlobalRole
  joined_at?: string | null
  last_active?: string | null
}

export interface AuthSessionData {
  token?: string
  user: AuthUserView
}

export interface AuthStatusData {
  authenticated: boolean
  user: AuthUserView | null
}

export interface AuthMessageData {
  message: string
}

export interface PasswordResetData extends AuthMessageData {
  temporaryPassword: string
}

export interface AuthUser {
  id: string
  username: string
  display_name: string
  email?: string | null
  role?: string
  globalRole: GlobalRole
}

export interface AuthRequest extends Request {
  user?: JWTPayload
}
