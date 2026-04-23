import { execFileSync } from 'node:child_process'

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function parseGitHubRemote(remoteUrl) {
  const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/)
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] }
  }

  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/)
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] }
  }

  throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`)
}

function getRepoCoordinates() {
  const remoteUrl = run('git', ['remote', 'get-url', 'origin'])
  return parseGitHubRemote(remoteUrl)
}

function ensureGhAuth() {
  try {
    run('gh', ['auth', 'status'])
  } catch {
    throw new Error('GitHub CLI is not authenticated. Run "gh auth login" first.')
  }
}

function buildProtectionPayload(requiredChecks) {
  return JSON.stringify({
    required_status_checks: {
      strict: true,
      contexts: requiredChecks,
    },
    enforce_admins: false,
    required_pull_request_reviews: null,
    restrictions: null,
    required_conversation_resolution: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_linear_history: true,
    lock_branch: false,
    allow_fork_syncing: true,
  })
}

function updateRequiredChecks(owner, repo, branch, requiredChecks) {
  const endpoint = `repos/${owner}/${repo}/branches/${branch}/protection/required_status_checks`
  const payload = JSON.stringify({
    strict: true,
    contexts: requiredChecks,
  })

  execFileSync('gh', [
    'api',
    '--method',
    'PATCH',
    endpoint,
    '--header',
    'Accept: application/vnd.github+json',
    '--input',
    '-',
  ], {
    input: payload,
    stdio: ['pipe', 'inherit', 'inherit'],
  })
}

function configureBranch(owner, repo, branch, requiredChecks) {
  const endpoint = `repos/${owner}/${repo}/branches/${branch}/protection`
  const payload = buildProtectionPayload(requiredChecks)

  execFileSync('gh', [
    'api',
    '--method',
    'PUT',
    endpoint,
    '--header',
    'Accept: application/vnd.github+json',
    '--input',
    '-',
  ], {
    input: payload,
    stdio: ['pipe', 'inherit', 'inherit'],
  })
}

function main() {
  const branch = process.argv[2] || 'main'
  const requiredChecks = (process.env.REQUIRED_CHECKS || 'Deploy Workflow Contract')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  ensureGhAuth()
  const { owner, repo } = getRepoCoordinates()
  try {
    updateRequiredChecks(owner, repo, branch, requiredChecks)
  } catch {
    configureBranch(owner, repo, branch, requiredChecks)
  }
  console.log(`Configured branch protection for ${owner}/${repo}:${branch}`)
  console.log(`Required checks: ${requiredChecks.join(', ')}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}
