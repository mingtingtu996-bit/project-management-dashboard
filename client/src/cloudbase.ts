import cloudbase from '@cloudbase/js-sdk';

// CloudBase configuration
const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID || 'project-management-8d1l147388982';

// 防御性初始化：若 envId 无效则跳过，避免初始化崩溃
let app: ReturnType<typeof cloudbase.init> | null = null;
let auth: ReturnType<(typeof app)['auth']> | null = null;
let db: ReturnType<(typeof app)['database']> | null = null;

try {
  app = cloudbase.init({ env: envId });
  auth = app.auth();
  db = app.database();
} catch (e) {
  console.warn('[CloudBase] 初始化失败，CloudBase 功能不可用:', e);
}

// Initialize storage
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storage = (app as any)?.uploadFile ? app : null;

// Cloud function call helper
export async function callFunction<T = any>(name: string, data?: any): Promise<T> {
  if (!app) throw new Error('CloudBase 未初始化');
  const result = await app.callFunction({ name, data });
  return result.result as T;
}

// Check if user is logged in
export async function checkLogin(): Promise<boolean> {
  if (!auth) return false;
  const loginState = await auth.getLoginState();
  return !!loginState;
}

// Anonymous login
export async function anonymousLogin(): Promise<void> {
  if (!auth) throw new Error('CloudBase 未初始化');
  await auth.anonymousAuthProvider().signIn();
}

export { app, auth, db, storage };
export default app;

