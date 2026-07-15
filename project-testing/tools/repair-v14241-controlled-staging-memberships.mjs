#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function parseEnv(text) {
  const env = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const key = line.slice(0, line.indexOf('=')).trim()
    const value = line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')
    env[key] = value
  }
  return env
}

function requireEnv(env, key) {
  const value = String(env[key] ?? '').trim()
  if (!value) throw new Error(`Missing required env key: ${key}`)
  return value
}

function assertNoSecretLikeText(value) {
  const text = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password\s*[=:]|service[_-]?role|StrongPass/i.test(text)) {
    throw new Error('refusing_to_write_membership_repair_report_with_secret_like_text')
  }
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function writeJson(path, payload) {
  assertNoSecretLikeText(payload)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function maybeSingleOrNull(query) {
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ?? null
}

function accountSpecs(refs) {
  return [
    {
      accountKey: 'project_admin',
      username: refs.V14241_STAGING_OWNER_USERNAME,
      companyRole: 'regular',
      projectRoleByKey: {
        standardProject: 'owner',
        largeProject: 'owner',
      },
    },
    {
      accountKey: 'editor',
      username: refs.V14241_STAGING_EDITOR_USERNAME,
      companyRole: 'regular',
      projectRoleByKey: {
        standardProject: 'editor',
        largeProject: 'editor',
      },
    },
    {
      accountKey: 'outsider',
      username: refs.V14241_STAGING_OUTSIDER_USERNAME,
      companyRole: 'regular',
      projectRoleByKey: {},
      removeProjectMembershipByKey: ['standardProject', 'largeProject', 'emptyProject'],
    },
  ].filter((item) => item.username)
}

async function readMembershipState(supabase, { companyId, projects, accounts }) {
  const rows = []
  for (const account of accounts) {
    const user = await maybeSingleOrNull(
      supabase
        .from('users')
        .select('id, last_active_company_id')
        .eq('username', account.username),
    )
    const companyMember = user
      ? await maybeSingleOrNull(
        supabase
          .from('company_members')
          .select('id, role, status')
          .eq('company_id', companyId)
          .eq('user_id', user.id),
      )
      : null
    const projectMemberships = {}
    for (const [projectKey, projectId] of Object.entries(projects)) {
      projectMemberships[projectKey] = user && projectId
        ? await maybeSingleOrNull(
          supabase
            .from('project_members')
            .select('id, permission_level, is_active')
            .eq('project_id', projectId)
            .eq('user_id', user.id),
        )
        : null
    }
    rows.push({
      accountKey: account.accountKey,
      userId: user?.id ?? null,
      hasUser: Boolean(user),
      lastActiveCompanyMatches: user?.last_active_company_id === companyId,
      companyMember: companyMember ? {
        present: true,
        role: companyMember.role ?? null,
        status: companyMember.status ?? null,
      } : { present: false },
      projectMemberships: Object.fromEntries(Object.entries(projectMemberships).map(([projectKey, member]) => [
        projectKey,
        member ? {
          present: true,
          permissionLevel: member.permission_level ?? null,
          isActive: member.is_active !== false,
        } : { present: false },
      ])),
    })
  }
  return rows
}

async function upsertCompanyMember(supabase, { companyId, userId, role, now }) {
  const existing = await maybeSingleOrNull(
    supabase
      .from('company_members')
      .select('id')
      .eq('company_id', companyId)
      .eq('user_id', userId),
  )
  if (existing?.id) {
    const { error } = await supabase
      .from('company_members')
      .update({ role, status: 'active', updated_at: now })
      .eq('id', existing.id)
      .eq('company_id', companyId)
      .eq('user_id', userId)
    if (error) throw error
    return 'updated'
  }

  const { error } = await supabase
    .from('company_members')
    .insert({ company_id: companyId, user_id: userId, role, status: 'active', updated_at: now })
  if (error) throw error
  return 'inserted'
}

async function upsertProjectMember(supabase, { projectId, userId, permissionLevel, now }) {
  const existing = await maybeSingleOrNull(
    supabase
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId),
  )
  if (existing?.id) {
    const { error } = await supabase
      .from('project_members')
      .update({ permission_level: permissionLevel, is_active: true, joined_at: now })
      .eq('id', existing.id)
      .eq('project_id', projectId)
      .eq('user_id', userId)
    if (error) throw error
    return 'updated'
  }

  const { error } = await supabase
    .from('project_members')
    .insert({ project_id: projectId, user_id: userId, permission_level: permissionLevel, is_active: true, joined_at: now })
  if (error) throw error
  return 'inserted'
}

async function removeProjectMember(supabase, { projectId, userId }) {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)
  if (error) throw error
  return 'removed_if_present'
}

async function main() {
  const envFile = resolve(argValue('--env-file', 'deploy/env/staging.env'))
  const refsFile = resolve(argValue('--refs-env-file', '.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env'))
  const fixtureRefsFile = resolve(argValue('--fixture-refs-file', '.tmp/v14241-controlled-staging/fixture-refs.sanitized.json'))
  const output = resolve(argValue('--output', 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-controlled-staging-membership-repair.json'))
  const allowWrite = hasFlag('--allow-write')
  const env = parseEnv(await readFile(envFile, 'utf8'))
  const refs = parseEnv(await readFile(refsFile, 'utf8'))
  const fixtureRefs = await readJsonIfExists(fixtureRefsFile)

  const supabaseUrl = requireEnv(env, 'SUPABASE_URL')
  const supabaseServiceKey = requireEnv(env, 'SUPABASE_SERVICE_KEY')
  const companyId = requireEnv(refs, 'V14241_STAGING_COMPANY_ID')
  const projects = {
    standardProject: requireEnv(refs, 'V14241_STAGING_PROJECT_ID'),
    largeProject: requireEnv(refs, 'V14241_STAGING_REAL_UAT_05_TARGET_REFS_LARGE_PROJECT_REF'),
    ...(fixtureRefs?.targetRefs?.emptyProjectId ? { emptyProject: fixtureRefs.targetRefs.emptyProjectId } : {}),
  }
  const accounts = accountSpecs(refs)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const now = new Date().toISOString()

  const projectRows = []
  for (const [projectKey, projectId] of Object.entries(projects)) {
    const project = await maybeSingleOrNull(
      supabase
        .from('projects')
        .select('id, company_id')
        .eq('id', projectId),
    )
    projectRows.push({
      projectKey,
      projectId,
      exists: Boolean(project),
      companyIdMatches: project?.company_id === companyId,
    })
  }

  const before = await readMembershipState(supabase, { companyId, projects, accounts })
  const actions = []
  if (allowWrite) {
    for (const account of accounts) {
      const user = await maybeSingleOrNull(
        supabase
          .from('users')
          .select('id')
          .eq('username', account.username),
      )
      if (!user?.id) {
        actions.push({ accountKey: account.accountKey, action: 'skipped_missing_user' })
        continue
      }

      const companyAction = await upsertCompanyMember(supabase, {
        companyId,
        userId: user.id,
        role: account.companyRole,
        now,
      })
      const userUpdate = await supabase
        .from('users')
        .update({ last_active_company_id: companyId })
        .eq('id', user.id)
      if (userUpdate.error) throw userUpdate.error

      const projectActions = []
      for (const [projectKey, permissionLevel] of Object.entries(account.projectRoleByKey)) {
        const projectId = projects[projectKey]
        if (!projectId) continue
        projectActions.push({
          projectKey,
          action: await upsertProjectMember(supabase, {
            projectId,
            userId: user.id,
            permissionLevel,
            now,
          }),
          permissionLevel,
        })
      }
      for (const projectKey of account.removeProjectMembershipByKey ?? []) {
        const projectId = projects[projectKey]
        if (!projectId) continue
        projectActions.push({
          projectKey,
          action: await removeProjectMember(supabase, { projectId, userId: user.id }),
          permissionLevel: null,
        })
      }

      actions.push({
        accountKey: account.accountKey,
        userId: user.id,
        companyMemberAction: companyAction,
        projectActions,
      })
    }
  }

  const after = await readMembershipState(supabase, { companyId, projects, accounts })
  const report = {
    schemaVersion: 'workbuddy/v14241-controlled-staging-membership-repair/v1',
    generatedAt: now,
    status: after.every((account) => account.companyMember.present && account.lastActiveCompanyMatches)
      && after.find((account) => account.accountKey === 'project_admin')?.projectMemberships?.largeProject?.present
      && after.find((account) => account.accountKey === 'project_admin')?.projectMemberships?.standardProject?.present
      && Object.values(after.find((account) => account.accountKey === 'outsider')?.projectMemberships ?? {})
        .every((membership) => membership.present === false)
      ? 'pass'
      : 'blocked',
    environment: 'controlled-staging-local',
    allowWrite,
    envFile,
    refsFile,
    rawSecretsWritten: false,
    targetRefs: {
      companyId,
      projects,
    },
    projectRows,
    before,
    actions,
    after,
    mutationBoundary: allowWrite
      ? 'Controlled staging fixture membership repair only; upserts canonical company/project memberships, removes outsider project memberships, and updates users.last_active_company_id for test actors; no task, plan, WBS, publication, rollback, schema, or production writes.'
      : 'Read-only membership inspection; no database writes executed.',
  }

  await writeJson(output, report)
  console.log(JSON.stringify({
    status: report.status,
    allowWrite,
    actionCount: actions.length,
    output,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
