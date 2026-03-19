/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE_MODE: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// 声明缺失的模块
declare module '@sentry/react' {
  export function init(config: any): void
  export function captureException(error: any): void
  export function captureMessage(message: string): void
  export const BrowserTracing: any
}
