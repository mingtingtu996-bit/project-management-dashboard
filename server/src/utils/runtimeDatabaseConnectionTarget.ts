export function deriveRuntimeSupabaseProjectRefFromRawUrl(
  value: string | undefined,
): string | null {
  return String(value ?? '').match(/^https:\/\/([^.]+)\.supabase\.co$/u)?.[1] ?? null
}
