import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiGet } from '@/lib/apiClient'
import { usePlanningFieldRegistry } from '../usePlanningFieldRegistry'
import { Button } from '@/components/ui/button'

vi.mock('@/lib/apiClient', () => ({
  apiGet: vi.fn(),
}))

const mockedApiGet = vi.mocked(apiGet)

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function buildRegistry(registryVersion: string) {
  const now = '2026-05-13T00:00:00.000Z'
  return {
    registryVersion,
    surface: 'baseline' as const,
    generatedAt: now,
    updatedAt: now,
    groups: [],
    fields: [],
  }
}

function RegistryProbe({ projectId }: { projectId: string }) {
  const registry = usePlanningFieldRegistry(projectId, 'baseline')

  return (
    <Button unstyled type="button" data-testid="registry-version" onClick={() => void registry.refetch()}>
      {registry.registry?.registryVersion ?? 'loading'}
    </Button>
  )
}

describe('usePlanningFieldRegistry', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockedApiGet.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('bypasses the short-lived cache when callers explicitly refetch', async () => {
    mockedApiGet
      .mockResolvedValueOnce(buildRegistry('v1.4.7.1'))
      .mockResolvedValueOnce(buildRegistry('v1.4.7.2'))

    act(() => {
      root.render(<RegistryProbe projectId="project-refetch-cache-test" />)
    })

    await act(async () => {
      await flush()
    })

    expect(container.textContent).toContain('v1.4.7.1')

    const button = container.querySelector('[data-testid="registry-version"]') as HTMLButtonElement | null
    await act(async () => {
      button?.click()
      await flush()
    })

    expect(mockedApiGet).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('v1.4.7.2')
  })
})
