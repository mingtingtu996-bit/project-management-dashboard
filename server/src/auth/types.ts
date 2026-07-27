export type GlobalRole = 'company_admin' | 'regular'

export type ProjectPermissionLevel = 'owner' | 'editor'

export interface JWTPayload {
  userId: string
  username: string
  globalRole?: GlobalRole
  currentCompanyRole?: GlobalRole
  tokenVersion?: number
  passwordResetRequired?: boolean
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
  globalRole: GlobalRole
  currentCompanyId?: string | null
  currentCompanyRole?: GlobalRole | null
  tokenVersion?: number
  passwordResetRequired?: boolean
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

export interface PasswordChangeData extends AuthMessageData {
  token: string
}

export interface AuthUser {
  id: string
  username: string
  display_name: string
  email?: string | null
  globalRole: GlobalRole
  currentCompanyRole?: GlobalRole | null
  tokenVersion?: number
  passwordResetRequired?: boolean
}

export interface AuthRequest extends Request {
  user?: JWTPayload
}
