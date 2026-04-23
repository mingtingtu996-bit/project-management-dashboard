import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

describe('repository hygiene', () => {
  it('removes obsolete one-off server maintenance scripts that reference retired compatibility layers', () => {
    const staleFiles = [
      'check-jobs-logic.ts',
      'fix-import-extensions.ts',
      'fix-template-strings.cjs',
      'fix-template-strings-v2.cjs',
      'fix-template-strings-final.cjs',
      'run-migrations-036-037.ts',
      'test-acceptance-timeline.ts',
      'test-e2e-full.ts',
      'test-phase2-apis.ts',
      'test-syntax.ts',
      'tsc-output.txt',
      'verify-tasks.ts',
      'check-admin.js',
      'check-migration.mjs',
      'db-check.ts',
      'add-test-risks.js',
      'test-preMilestone-warning.ts',
      'test-preMilestone-warning-simple.ts',
      'test-preMilestone-warning-api.ts',
      'test-password-verify.js',
      'test-login-query.cjs',
      'test-db-connection.js',
      'verify-warnings-table-v2.ts',
    ]

    for (const filename of staleFiles) {
      expect(existsSync(resolve(serverRoot, filename))).toBe(false)
    }
  })

  it('removes obsolete one-off root diagnostics and browser check artifacts', () => {
    const staleFiles = [
      'debug-login.ts',
      'diagnose-login.ts',
      'check-project-members.ts',
      'check-rls.ts',
      'check-users.ts',
      'debug-auth.ts',
      'diagnose-condition-insert.ts',
      'test-password.ts',
      'check-acceptance.png',
      'check-company.png',
      'check-dashboard-links.png',
      'check-dashboard-responsibility-entry.png',
      'check-dashboard.png',
      'check-drawings.png',
      'check-gantt.png',
      'check-notifications.png',
      'check-pre-milestones.png',
      'check-responsibility-page.png',
      'check-responsibility-route-dump.png',
      'check-task-summary-button-dump.png',
      'check-task-summary-responsibility-split.png',
      'tmp-company.png',
      'tmp-dashboard-links.json',
      'tmp-responsibility-browser-check.json',
      'tmp-responsibility-route-dump.json',
      'tmp-task-summary-button-dump.json',
      'tmp-task-summary-check.png',
      'tmp-task-summary-final.png',
      'tmp-task-summary-fixed.png',
      'tmp_docx_extract.txt',
      'tmp_four_cert_flow.pdf',
      'tmp_gantt_panel_snippet.txt',
    ]

    for (const filename of staleFiles) {
      expect(existsSync(resolve(workspaceRoot, filename))).toBe(false)
    }

    expect(existsSync(resolve(workspaceRoot, 'tmp-browser-checks'))).toBe(false)
  })

  it('keeps the acceptance implementation document aligned with the current runtime shape', () => {
    const document = readFileSync(
      resolve(workspaceRoot, 'docs', 'plans', '验收流程轴实施专项方案_20260408.md'),
      'utf8',
    )

    expect(document).toContain('主视图已经切到流程板 + 台账 + 详情抽屉的结构')
    expect(document).toContain('标准状态枚举为准')
    expect(document).not.toContain('主视图依赖 `ForceDirectedGraph`')
    expect(document).not.toContain('validationService.ts) 的旧口径兼容')
  })

  it('uses neutral fallback wording in the critical path service logs', () => {
    const source = readFileSync(
      resolve(serverRoot, 'src', 'services', 'projectCriticalPathService.ts'),
      'utf8',
    )

    expect(source).toContain('deterministic fallback ordering')
    expect(source).not.toContain('compatibility fallback ordering')
  })

  it('keeps current-facing client copy neutral and historical mappings explicit', () => {
    const teamMembers = readFileSync(
      resolve(workspaceRoot, 'client', 'src', 'pages', 'TeamMembers.tsx'),
      'utf8',
    )
    const tokensDoc = readFileSync(
      resolve(workspaceRoot, 'client', 'DESIGN_TOKENS.md'),
      'utf8',
    )
    const tailwindConfig = readFileSync(
      resolve(workspaceRoot, 'client', 'tailwind.config.js'),
      'utf8',
    )

    expect(teamMembers).toContain('独立页面作为辅助入口保留')
    expect(teamMembers).not.toContain('保留为兼容入口')
    expect(tokensDoc).toContain('12px（历史映射）')
    expect(tokensDoc).not.toContain('12px（兼容旧代码）')
    expect(tailwindConfig).not.toContain('兼容历史 rounded-2xl')
  })

  it('does not hardcode live project identifiers into current runtime and helper guidance', () => {
    const runtimeDb = readFileSync(resolve(serverRoot, 'src', 'database.ts'), 'utf8')
    const migrationHelper = readFileSync(resolve(serverRoot, 'run-clean-migration.mjs'), 'utf8')
    const startScript = readFileSync(resolve(workspaceRoot, '启动登录系统.bat'), 'utf8')
    const schedulerReport = readFileSync(
      resolve(workspaceRoot, 'docs', 'reports', '定时任务验证报告.md'),
      'utf8',
    )
    const schedulerFullReport = readFileSync(
      resolve(workspaceRoot, 'docs', 'reports', '定时任务验证完整报告.md'),
      'utf8',
    )

    expect(runtimeDb).not.toContain('db.wwdrkjnbvcbfytwnnyvs.supabase.co')
    expect(migrationHelper).toContain('db.<project-ref>.supabase.co')
    expect(startScript).toContain('选择项目: ^<project-ref^>')
    expect(schedulerReport).toContain('选择项目: `<project-ref>`')
    expect(schedulerFullReport).toContain('Supabase URL: `https://<project-ref>.supabase.co`')
    expect(schedulerFullReport).toContain('项目名称: `<project-ref>`')
  })
})
