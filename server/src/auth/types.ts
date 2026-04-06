/**
 * 认证相关类型定义
 */

export interface JWTPayload {
  userId: string;
  username: string;
  role: 'owner' | 'member';
  iat?: number;
  exp?: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    username: string;
    display_name: string;
    email?: string;
    role: string;
  };
  message?: string;
}

export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
  email?: string;
  role: 'owner' | 'member';
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}
