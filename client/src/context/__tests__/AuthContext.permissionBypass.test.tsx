import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'

function installStorage(values: Record<string, string> = {}) {
  const storage = new Map<string, string>(Object.entries(values))
  vi.mocked(window.localStorage.getItem).mockImplementation((key) => storage.get(key) ?? null)
  vi.mocked(window.localStorage.setItem).mockImplementation((key, value) => {
    storage.set(key, String(value))
  })
  vi.mocked(window.localStorage.removeItem).mockImplementation((key) => {
    storage.delete(key)
  })
  vi.mocked(window.localStorage.clear).mockImplementation(() => {
    storage.clear()
  })
  return storage
}

describe('AuthContext permission-bypass company context', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('VITE_DISABLE_PERMISSION_SYSTEM', 'true')
    vi.stubEnv('VITE_DEV_GLOBAL_ROLE', 'company_admin')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('hydrates the permission-bypass user from the persisted current company id', async () => {
    installStorage({ current_company_id: 'company-persisted' })
    const { AuthProvider, useAuth } = await import('../AuthContext')

    function Probe() {
      const { user } = useAuth()
      return <output data-testid="auth-user">{JSON.stringify(user)}</output>
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      const user = JSON.parse(screen.getByTestId('auth-user').textContent || '{}')
      expect(user.currentCompanyId).toBe('company-persisted')
      expect(user.currentCompanyRole).toBe('company_admin')
    })
  })

  it('syncs and persists the created company context in permission-bypass mode', async () => {
    const storage = installStorage()
    const { AuthProvider, useAuth } = await import('../AuthContext')

    function Probe() {
      const { user, syncCurrentCompanyContext } = useAuth()
      return (
        <>
          <Button
            type="button"
            unstyled
            onClick={() => syncCurrentCompanyContext({ companyId: 'company-created', role: 'company_admin' })}
          >
            sync
          </Button>
          <output data-testid="auth-user">{JSON.stringify(user)}</output>
        </>
      )
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'sync' }))

    await waitFor(() => {
      const user = JSON.parse(screen.getByTestId('auth-user').textContent || '{}')
      expect(user.currentCompanyId).toBe('company-created')
      expect(user.currentCompanyRole).toBe('company_admin')
      expect(storage.get('current_company_id')).toBe('company-created')
    })
  })
})
