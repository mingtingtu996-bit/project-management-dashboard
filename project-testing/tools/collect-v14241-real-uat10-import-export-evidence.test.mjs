import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assertNoSecretLikeText,
  buildImportWorkbookBuffer,
  buildUat10ImportRows,
  validatePdfBuffer,
  validateWorkbookBuffer,
} from './collect-v14241-real-uat10-import-export-evidence.mjs'

test('builds a real import workbook sample and validates workbook reader output', () => {
  const rows = buildUat10ImportRows()

  assert.equal(rows.length, 4)
  assert.equal(rows.filter((row) => row.title || row.name || row['任务名称']).length, 3)
  assert.ok(rows.some((row) => row.unmapped_cost_code))

  const workbook = buildImportWorkbookBuffer(rows)
  const validation = validateWorkbookBuffer(workbook)

  assert.equal(validation.status, 'pass')
  assert.equal(validation.sheetCount, 1)
  assert.equal(validation.firstSheetRowCount, 5)
  assert.ok(validation.firstRowColumnCount >= 7)
})

test('validates pdf signature and blocks secret-like report text', () => {
  assert.equal(validatePdfBuffer(Buffer.from('%PDF-1.7\nbody')).status, 'pass')
  assert.equal(validatePdfBuffer(Buffer.from('not-a-pdf')).status, 'blocked')

  assert.throws(
    () => assertNoSecretLikeText({ token: 'eyJabc.def.ghi', note: 'x' }, ['unused']),
    /refusing_to_write_real_uat10_report_with_secret_like_text/,
  )
})
