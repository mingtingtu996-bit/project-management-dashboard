import { AsyncLocalStorage } from 'node:async_hooks'

export type JobLeaseFenceContext = {
  jobName: string
  fenceToken: string
  generation: number
}

const jobLeaseFenceStorage = new AsyncLocalStorage<JobLeaseFenceContext>()

export function getJobLeaseFenceContext() {
  return jobLeaseFenceStorage.getStore() ?? null
}

export function runWithJobLeaseFenceContext<T>(
  context: JobLeaseFenceContext,
  runner: () => Promise<T>,
) {
  return jobLeaseFenceStorage.run(context, runner)
}

export function getJobLeaseFenceRequestHeaders() {
  const context = getJobLeaseFenceContext()
  if (!context) return null

  return {
    'x-workbuddy-job-name': context.jobName,
    'x-workbuddy-job-fence-token': context.fenceToken,
    'x-workbuddy-job-fence-generation': String(context.generation),
  }
}

export function createJobLeaseFencedFetch(baseFetch: typeof fetch = globalThis.fetch) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const leaseHeaders = getJobLeaseFenceRequestHeaders()
    if (!leaseHeaders) return baseFetch(input, init)

    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    for (const [key, value] of Object.entries(leaseHeaders)) {
      headers.set(key, value)
    }

    return baseFetch(input, {
      ...init,
      headers,
    })
  }
}
