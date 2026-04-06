import { useMemo } from 'react'

import { apiDelete, apiGet, apiPut } from '../lib/apiClient'

export function useApi() {
  // Keep a stable reference so page-level effects don't retrigger on every render.
  return useMemo(
    () => ({
      get: apiGet,
      put: apiPut,
      delete: apiDelete,
    }),
    [],
  )
}
