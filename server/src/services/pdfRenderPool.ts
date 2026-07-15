import { chromium } from 'playwright'

type PdfPage = {
  setDefaultTimeout?: (timeoutMs: number) => void
  setContent: (html: string, options: { waitUntil: 'load'; timeout?: number }) => Promise<unknown>
  pdf: (options: Record<string, unknown>) => Promise<Uint8Array | Buffer>
  close: () => Promise<unknown>
}

type PdfBrowser = {
  newPage: () => Promise<PdfPage>
  isConnected?: () => boolean
  on?: (event: 'disconnected', listener: () => void) => unknown
  close: () => Promise<unknown>
}

export class PdfRenderError extends Error {
  constructor(
    public readonly code: 'PDF_RENDER_QUEUE_FULL' | 'PDF_RENDER_QUEUE_TIMEOUT' | 'PDF_RENDER_TIMEOUT' | 'PDF_RENDER_INPUT_TOO_LARGE',
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'PdfRenderError'
  }
}

type QueueWaiter = {
  resolve: (release: () => void) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class PdfRenderPool {
  private active = 0

  private readonly queue: QueueWaiter[] = []

  private browserPromise: Promise<PdfBrowser> | null = null

  private readonly launch: () => Promise<PdfBrowser>

  private readonly concurrency: number

  private readonly maxQueue: number

  private readonly timeoutMs: number

  private readonly maxHtmlBytes: number

  constructor(options: {
    launch: () => Promise<PdfBrowser>
    concurrency?: number
    maxQueue?: number
    timeoutMs?: number
    maxHtmlBytes?: number
  }) {
    this.launch = options.launch
    this.concurrency = positiveInteger(options.concurrency, 2)
    this.maxQueue = nonNegativeInteger(options.maxQueue, 10)
    this.timeoutMs = positiveInteger(options.timeoutMs, 30_000)
    this.maxHtmlBytes = positiveInteger(options.maxHtmlBytes, 2 * 1024 * 1024)
  }

  private releaseSlot = () => {
    const next = this.queue.shift()
    if (!next) {
      this.active = Math.max(0, this.active - 1)
      return
    }
    clearTimeout(next.timer)
    next.resolve(this.releaseSlot)
  }

  private acquireSlot() {
    if (this.active < this.concurrency) {
      this.active += 1
      return Promise.resolve(this.releaseSlot)
    }
    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(new PdfRenderError(
        'PDF_RENDER_QUEUE_FULL',
        'PDF render capacity is currently full; retry later',
        503,
      ))
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter: QueueWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.queue.indexOf(waiter)
          if (index >= 0) this.queue.splice(index, 1)
          reject(new PdfRenderError(
            'PDF_RENDER_QUEUE_TIMEOUT',
            'PDF render queue wait timed out',
            503,
          ))
        }, this.timeoutMs),
      }
      waiter.timer.unref?.()
      this.queue.push(waiter)
    })
  }

  private async getBrowser() {
    if (this.browserPromise) {
      const current = await this.browserPromise
      if (current.isConnected?.() !== false) return current
      this.browserPromise = null
    }

    const launched = this.launch()
    this.browserPromise = launched
    try {
      const browser = await launched
      browser.on?.('disconnected', () => {
        if (this.browserPromise === launched) this.browserPromise = null
      })
      return browser
    } catch (error) {
      if (this.browserPromise === launched) this.browserPromise = null
      throw error
    }
  }

  private async renderWithDeadline(html: string) {
    let page: PdfPage | null = null
    const operation = (async () => {
      const browser = await this.getBrowser()
      page = await browser.newPage()
      page.setDefaultTimeout?.(this.timeoutMs)
      await page.setContent(html, { waitUntil: 'load', timeout: this.timeoutMs })
      return Buffer.from(await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
        timeout: this.timeoutMs,
      }))
    })()
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new PdfRenderError(
            'PDF_RENDER_TIMEOUT',
            'PDF rendering timed out',
            504,
          )), this.timeoutMs)
          timer.unref?.()
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
      await page?.close().catch(() => undefined)
    }
  }

  async render(html: string) {
    if (Buffer.byteLength(html, 'utf8') > this.maxHtmlBytes) {
      throw new PdfRenderError(
        'PDF_RENDER_INPUT_TOO_LARGE',
        'PDF report content exceeds the synchronous rendering limit',
        413,
      )
    }

    const release = await this.acquireSlot()
    try {
      return await this.renderWithDeadline(html)
    } finally {
      release()
    }
  }

  async close() {
    const browserPromise = this.browserPromise
    this.browserPromise = null
    if (browserPromise) {
      await browserPromise.then((browser) => browser.close()).catch(() => undefined)
    }
  }
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback
}

function nonNegativeInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) >= 0 ? Math.floor(Number(value)) : fallback
}

const defaultPdfRenderPool = new PdfRenderPool({
  launch: () => chromium.launch({ headless: true }) as unknown as Promise<PdfBrowser>,
  concurrency: Number(process.env.PDF_RENDER_CONCURRENCY),
  maxQueue: Number(process.env.PDF_RENDER_MAX_QUEUE),
  timeoutMs: Number(process.env.PDF_RENDER_TIMEOUT_MS),
  maxHtmlBytes: Number(process.env.PDF_RENDER_MAX_HTML_BYTES),
})

export function renderPdfBuffer(html: string) {
  return defaultPdfRenderPool.render(html)
}

export function closePdfRenderPool() {
  return defaultPdfRenderPool.close()
}
