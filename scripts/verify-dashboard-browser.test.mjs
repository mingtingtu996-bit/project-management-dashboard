import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('verify-dashboard-browser.mjs', import.meta.url), 'utf8')

test('dashboard forecast timing excludes unrelated quality-dialog interactions', () => {
  const timingStart = source.indexOf('const forecastDefaultStartedAt = firstScreenCutoff')
  const forecastWait = source.indexOf("await page.getByTestId('dashboard-project-remaining-forecast').waitFor", timingStart)
  const qualityDialog = source.indexOf("const qualityTrigger = page.getByTestId('dashboard-data-quality-detail-trigger')", timingStart)

  assert(timingStart >= 0, 'forecast timing start must exist')
  assert(forecastWait > timingStart, 'forecast readiness must be measured after timing starts')
  assert(qualityDialog > forecastWait, 'quality-dialog interactions must run after forecast readiness is measured')
})
