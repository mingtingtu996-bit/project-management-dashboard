import assert from 'node:assert/strict'
import test from 'node:test'
import pg from 'pg'

import { cleanupWizardDiagnosticProject } from '../../scripts/wizard-diagnostic-project-cleanup.mjs'

const projectRef = 'xemqmqpifsstkovbkatp'
const projectId = '9e2e92b4-7662-4956-aeed-3725fc721164'
const companyId = '11111111-1111-4111-8111-111111111111'
const runTimestampMs = 1_786_358_909_751
const diagnosticRunId = `staging-baseline-${runTimestampMs}`
const projectName = `Disposable Residential Baseline ${diagnosticRunId}`
const connectionString = `postgresql://postgres.${projectRef}:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`

function buildHarness(overrides = {}, options = {}) {
  const calls = []
  const clientConfigs = []
  let projectRow = options.projectPresent === false
    ? null
    : {
        id: projectId,
        company_id: companyId,
        name: projectName,
        metadata: {
          diagnosticRunId,
          diagnosticSource: 'wizard_baseline_revision_live_probe',
          diagnosticProjectName: projectName,
          diagnosticReleaseSha: '5d5c8f57f4584560bd3c7d0932dfca364bcaa5ab',
        },
        created_at: new Date(runTimestampMs + 5_000).toISOString(),
        ...overrides,
      }
  let deletedProject = null
  const client = {
    connect: async () => {
      calls.push(['CONNECT'])
    },
    query: async (sql, values = []) => {
      calls.push([String(sql), values])
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.includes('from public.projects') && normalized.includes('for update')) {
        return { rows: projectRow ? [projectRow] : [], rowCount: projectRow ? 1 : 0 }
      }
      if (normalized.startsWith('delete from public.projects')) {
        const deleted = projectRow
        deletedProject = deleted
        projectRow = null
        return { rows: deleted ? [{ id: deleted.id }] : [], rowCount: deleted ? 1 : 0 }
      }
      if (normalized.startsWith('insert into public.operation_logs') && options.failAudit === true) {
        throw new Error('audit insert failed')
      }
      if (normalized === 'rollback' && deletedProject) {
        projectRow = deletedProject
        deletedProject = null
      }
      if (normalized.startsWith('select id from public.projects')) {
        return { rows: projectRow ? [{ id: projectRow.id }] : [], rowCount: projectRow ? 1 : 0 }
      }
      return { rows: [], rowCount: 1 }
    },
    end: async () => {
      calls.push(['END'])
    },
  }
  return {
    calls,
    clientConfigs,
    createClient: (config) => {
      clientConfigs.push(config)
      return client
    },
    isProjectPresent: () => projectRow !== null,
  }
}

function cleanupInput() {
  return {
    connectionString,
    expectedProjectRef: projectRef,
    targetEnvironment: 'staging',
    projectId,
    companyId,
    diagnosticRunId,
    projectName,
    releaseSha: '5d5c8f57f4584560bd3c7d0932dfca364bcaa5ab',
    actorUsername: 'staging-smoke@example.com',
    now: new Date(runTimestampMs + 60_000),
  }
}

test('physically deletes only the exact disposable wizard diagnostic project and audits it', async () => {
  const harness = buildHarness()

  const result = await cleanupWizardDiagnosticProject(cleanupInput(), {
    createClient: harness.createClient,
  })

  assert.deepEqual(result, {
    status: 'pass',
    strategy: 'migration_connection_guarded_diagnostic_cleanup',
    databaseProjectRefVerified: true,
    projectPhysicallyDeleted: true,
    projectUnreadable: true,
    entityAlreadyAbsent: false,
  })
  assert.ok(harness.calls.some(([sql]) => String(sql).includes('DELETE FROM public.projects')))
  const auditCall = harness.calls.find(([sql]) => String(sql).includes('INSERT INTO public.operation_logs'))
  assert.ok(auditCall)
  assert.deepEqual(JSON.parse(String(auditCall[1][4])), {
    companyId,
    diagnosticRunId,
    diagnosticSource: 'wizard_baseline_revision_live_probe',
    targetEnvironment: 'staging',
    releaseSha: '5d5c8f57f4584560bd3c7d0932dfca364bcaa5ab',
    cleanupPolicy: 'guarded_migration_connection_same_transaction',
  })
  assert.deepEqual(harness.clientConfigs[0]?.ssl, { rejectUnauthorized: true })
})

test('enforces TLS certificate verification even when the supplied URL requests no verification', async () => {
  const harness = buildHarness({}, { projectPresent: false })

  await cleanupWizardDiagnosticProject({
    ...cleanupInput(),
    connectionString: `${connectionString}?sslmode=require`,
  }, {
    createClient: harness.createClient,
  })

  assert.deepEqual(harness.clientConfigs[0]?.ssl, { rejectUnauthorized: true })
  assert.equal(new URL(harness.clientConfigs[0]?.connectionString).searchParams.has('sslmode'), false)
  const effectiveClient = new pg.Client(harness.clientConfigs[0])
  assert.deepEqual(effectiveClient.connectionParameters.ssl, { rejectUnauthorized: true })
})

test('rejects connection-string options that could redirect or downgrade the cleanup connection', async () => {
  for (const option of [
    'host=other.supabase.co',
    'port=5432',
    'user=postgres.otherproject',
    'ssl=no-verify',
    'ssl=0',
    'sslmode=',
    'sslmode=no-verify',
  ]) {
    const harness = buildHarness({}, { projectPresent: false })
    await assert.rejects(
      cleanupWizardDiagnosticProject({
        ...cleanupInput(),
        connectionString: `${connectionString}?${option}`,
      }, {
        createClient: harness.createClient,
      }),
      /database URL (query option is not allowed|must use sslmode=require or sslmode=verify-full)/i,
      option,
    )
    assert.equal(harness.clientConfigs.length, 0, option)
  }
})

test('refuses a project whose persisted diagnostic identity does not match before any delete', async () => {
  const harness = buildHarness({
    metadata: {
      diagnosticRunId: 'staging-baseline-1786358909752',
      diagnosticSource: 'wizard_baseline_revision_live_probe',
      diagnosticProjectName: projectName,
    },
  })

  await assert.rejects(
    cleanupWizardDiagnosticProject(cleanupInput(), { createClient: harness.createClient }),
    /diagnostic.*identity does not match/i,
  )

  assert.equal(harness.calls.some(([sql]) => String(sql).includes('DELETE FROM public.projects')), false)
  assert.equal(harness.calls.some(([sql]) => String(sql).trim() === 'ROLLBACK'), true)
})

test('refuses a diagnostic project stamped for a different release before any delete', async () => {
  const harness = buildHarness({
    metadata: {
      diagnosticRunId,
      diagnosticSource: 'wizard_baseline_revision_live_probe',
      diagnosticProjectName: projectName,
      diagnosticReleaseSha: 'a'.repeat(40),
    },
  })

  await assert.rejects(
    cleanupWizardDiagnosticProject(cleanupInput(), { createClient: harness.createClient }),
    /diagnostic.*identity does not match/i,
  )

  assert.equal(harness.calls.some(([sql]) => String(sql).includes('DELETE FROM public.projects')), false)
})

test('refuses a cleanup connection for a different Supabase project before connecting', async () => {
  let createClientCalled = false

  await assert.rejects(
    cleanupWizardDiagnosticProject({
      ...cleanupInput(),
      expectedProjectRef: 'wwdrkjnbvcbfytwnnyvs',
    }, {
      createClient: () => {
        createClientCalled = true
        throw new Error('must not connect')
      },
    }),
    /database project ref does not match/i,
  )

  assert.equal(createClientCalled, false)
})

test('proves an already-absent diagnostic project without issuing delete statements', async () => {
  const harness = buildHarness({}, { projectPresent: false })

  const result = await cleanupWizardDiagnosticProject(cleanupInput(), {
    createClient: harness.createClient,
  })

  assert.equal(result.entityAlreadyAbsent, true)
  assert.equal(result.projectPhysicallyDeleted, true)
  assert.equal(harness.calls.some(([sql]) => String(sql).startsWith('DELETE FROM public.')), false)
  assert.equal(harness.calls.some(([sql]) => String(sql).includes('INSERT INTO public.operation_logs')), false)
})

test('rolls back the project deletion when the same-transaction audit write fails', async () => {
  const harness = buildHarness({}, { failAudit: true })

  await assert.rejects(
    cleanupWizardDiagnosticProject(cleanupInput(), { createClient: harness.createClient }),
    /audit insert failed/i,
  )

  assert.equal(harness.calls.some(([sql]) => String(sql).trim() === 'ROLLBACK'), true)
  assert.equal(harness.calls.some(([sql]) => String(sql).trim() === 'COMMIT'), false)
  assert.equal(harness.isProjectPresent(), true)
})
