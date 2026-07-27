import { describe, expect, it, vi } from 'vitest'

import { PdfRenderPool } from '../services/pdfRenderPool.js'

function createBrowser(options: { blockPdf?: boolean } = {}) {
  const pages: any[] = []
  const browser = {
    isConnected: vi.fn(() => true),
    on: vi.fn(),
    newPage: vi.fn(async () => {
      const page = {
        setDefaultTimeout: vi.fn(),
        setContent: vi.fn(async () => undefined),
        pdf: vi.fn(async (): Promise<Buffer> => options.blockPdf
          ? new Promise<Buffer>(() => {})
          : Buffer.from('%PDF-test')),
        close: vi.fn(async () => undefined),
      }
      pages.push(page)
      return page
    }),
    close: vi.fn(async () => undefined),
  }
  return { browser, pages }
}

describe('PdfRenderPool', () => {
  it('reuses one browser and closes each request page', async () => {
    const { browser, pages } = createBrowser()
    const launch = vi.fn(async () => browser)
    const pool = new PdfRenderPool({ launch, concurrency: 1, maxQueue: 2, timeoutMs: 500 })

    await expect(pool.render('<html>one</html>')).resolves.toEqual(Buffer.from('%PDF-test'))
    await expect(pool.render('<html>two</html>')).resolves.toEqual(Buffer.from('%PDF-test'))

    expect(launch).toHaveBeenCalledOnce()
    expect(browser.newPage).toHaveBeenCalledTimes(2)
    expect(pages.every((page) => page.close.mock.calls.length === 1)).toBe(true)
  })

  it('rejects work beyond the configured active and queued capacity', async () => {
    let releaseFirst!: () => void
    const { browser } = createBrowser()
    browser.newPage.mockImplementationOnce(async () => ({
      setDefaultTimeout: vi.fn(),
      setContent: vi.fn(async () => undefined),
      pdf: vi.fn(() => new Promise<Buffer>((resolve) => { releaseFirst = () => resolve(Buffer.from('%PDF-first')) })),
      close: vi.fn(async () => undefined),
    }))
    const pool = new PdfRenderPool({
      launch: vi.fn(async () => browser),
      concurrency: 1,
      maxQueue: 1,
      timeoutMs: 1_000,
    })

    const first = pool.render('<html>first</html>')
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf('function'))
    const second = pool.render('<html>second</html>')
    await expect(pool.render('<html>overflow</html>')).rejects.toMatchObject({
      code: 'PDF_RENDER_QUEUE_FULL',
      statusCode: 503,
    })

    releaseFirst()
    await first
    await second
  })

  it('times out a stalled render and closes its page', async () => {
    const { browser, pages } = createBrowser({ blockPdf: true })
    const pool = new PdfRenderPool({
      launch: vi.fn(async () => browser),
      concurrency: 1,
      maxQueue: 0,
      timeoutMs: 20,
    })

    await expect(pool.render('<html>stalled</html>')).rejects.toMatchObject({
      code: 'PDF_RENDER_TIMEOUT',
      statusCode: 504,
    })
    expect(pages[0].close).toHaveBeenCalledOnce()
  })
})
