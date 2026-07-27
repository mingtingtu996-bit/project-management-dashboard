import { performance } from 'node:perf_hooks'
import { getProjectExecutionSummary, getAllProjectExecutionSummaries } from '../../server/src/services/projectExecutionSummaryService.ts'

const projectId = '8d0be02c-1e79-4272-a234-48792b2f32c0'
async function time(label: string, fn: () => Promise<unknown>) {
  const start = performance.now()
  try {
    const result = await fn()
    console.log(JSON.stringify({ label, ok: true, ms: Math.round(performance.now() - start), shape: Array.isArray(result) ? { length: result.length } : { hasResult: Boolean(result) } }))
  } catch (error) {
    console.log(JSON.stringify({ label, ok: false, ms: Math.round(performance.now() - start), error: error instanceof Error ? error.message : String(error) }))
  }
}
async function main() {
  await time('getProjectExecutionSummary', () => getProjectExecutionSummary(projectId))
  await time('getAllProjectExecutionSummaries-single', () => getAllProjectExecutionSummaries({ projectIds: [projectId] }))
}
main().catch((error) => { console.error(error); process.exit(1) })
