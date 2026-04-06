/**
 * JWT配置文件
 */

export const JWT_CONFIG = {
  // JWT密钥（生产环境应该从环境变量读取）
  secret:
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
      ? 'dev-local-jwt-secret'
      : ''),

  // 访问令牌有效期（7天）
  accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d',

  // 令牌签发者
  issuer: 'construction-management-system',

  // 令牌受众
  audience: 'api-users',

  // Cookie配置
  cookie: {
    name: 'auth_token',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
    path: '/',
  },
};
