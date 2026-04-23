import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import StandardProcessDrawer from '../StandardProcessDrawer'

describe('StandardProcessDrawer', () => {
  const categories = [
    { key: 'all', label: '全部' },
    { key: 'civil', label: '土建' },
    { key: 'mep', label: '机电安装' },
  ]

  const processes = [
    {
      id: 'proc-civil',
      name: '钢筋绑扎',
      category: 'civil',
      description: '主体结构钢筋施工',
      reference_days: 5,
      tags: ['结构'],
      sort_order: 1,
    },
    {
      id: 'proc-mep',
      name: '桥架安装',
      category: 'mep',
      description: '机电桥架与线槽安装',
      reference_days: 3,
      tags: ['机电'],
      sort_order: 2,
    },
  ]

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('/api/standard-processes/categories')) {
      return {
        json: async () => ({ success: true, data: categories }),
      } as Response
    }

    if (url.includes('/api/standard-processes?')) {
      const parsed = new URL(url, 'http://localhost')
      const query = parsed.searchParams.get('q')?.trim() ?? ''
      const category = parsed.searchParams.get('category') ?? 'all'
      const filtered = processes.filter((item) => {
        const matchesCategory = category === 'all' || item.category === category
        const matchesQuery = !query || item.name.includes(query) || item.description.includes(query)
        return matchesCategory && matchesQuery
      })
      return {
        json: async () => ({ success: true, data: filtered }),
      } as Response
    }

    throw new Error(`unexpected fetch url: ${url}`)
  })

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockClear()
  })

  it('loads categories, filters by category and supports selecting a process', async () => {
    const onClose = vi.fn()
    const onSelect = vi.fn()

    render(<StandardProcessDrawer open onClose={onClose} onSelect={onSelect} />)

    await waitFor(() => {
      expect(screen.getByText('钢筋绑扎')).toBeInTheDocument()
      expect(screen.getByText('桥架安装')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /机电安装/ }))
    await waitFor(() => {
      expect(screen.queryByText('钢筋绑扎')).not.toBeInTheDocument()
      expect(screen.getByText('桥架安装')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '引用' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'proc-mep', name: '桥架安装' }))
  })

  it('debounces keyword search before issuing the next query', async () => {
    render(<StandardProcessDrawer open onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('钢筋绑扎')).toBeInTheDocument()
    })

    await new Promise((resolve) => setTimeout(resolve, 350))
    fetchMock.mockClear()

    const input = screen.getByPlaceholderText('搜索工序名称...')
    fireEvent.change(input, { target: { value: '桥架' } })

    expect(fetchMock).not.toHaveBeenCalled()

    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(fetchMock).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/standard-processes?q=%E6%A1%A5%E6%9E%B6'))
      expect(screen.getByText('桥架安装')).toBeInTheDocument()
      expect(screen.queryByText('钢筋绑扎')).not.toBeInTheDocument()
    }, { timeout: 1000 })
  })
})
