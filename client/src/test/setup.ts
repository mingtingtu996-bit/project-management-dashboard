import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { createRequire } from 'node:module'
import type * as ReactTypes from 'react'
import { afterEach, vi } from 'vitest'

const require = createRequire(import.meta.url)
const React = require('react') as typeof ReactTypes

vi.mock('react', () => ({
  ...React,
  default: React,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  function MemoryRouterWithFutureFlags(
    props: React.ComponentProps<typeof actual.MemoryRouter>,
  ) {
    const { future, ...rest } = props
    return React.createElement(actual.MemoryRouter, {
      ...rest,
      future: {
        v7_startTransition: true,
        v7_relativeSplatPath: true,
        ...(future ?? {}),
      },
    })
  }

  return {
    ...actual,
    MemoryRouter: MemoryRouterWithFutureFlags,
  }
})

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const originalConsoleWarn = console.warn.bind(console)
const originalConsoleError = console.error.bind(console)

console.warn = (...args: unknown[]) => {
  const message = args.map((arg) => String(arg)).join(' ')
  if (message.includes('React Router Future Flag Warning')) {
    return
  }
  originalConsoleWarn(...args as Parameters<typeof console.warn>)
}

console.error = (...args: unknown[]) => {
  const message = args.map((arg) => String(arg)).join(' ')
  if (message.includes('not wrapped in act(...)')) {
    return
  }
  originalConsoleError(...args as Parameters<typeof console.error>)
}

if (!HTMLCanvasElement.prototype.getContext) {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => null),
  })
} else {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
}

afterEach(() => {
  cleanup()
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))
