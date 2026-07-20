import pg from 'pg'

const { Client } = pg

type EffectiveConnectionParameters = {
  database: string
  host: string
  port: number
  user: string
}

export type PostgresConnectionTargetIdentity = EffectiveConnectionParameters

export function isSupabasePoolerHost(value: string | undefined): boolean {
  const host = String(value ?? '').trim().toLowerCase().replace(/\.$/u, '')
  return /(?:^|\.)pooler\.supabase\.(?:com|co)$/u.test(host)
}

function decodeUrlComponent(value: string, label: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error(`PostgreSQL connection ${label} is not valid percent-encoding`)
  }
}

function validateConnectionSearchParams(url: URL): void {
  const entries = [...url.searchParams.entries()]
  const unsupported = entries.find(([name]) => name !== 'sslmode')
  if (unsupported) {
    throw new Error(`PostgreSQL connection query parameter ${unsupported[0]} is not allowed`)
  }

  const sslModes = url.searchParams.getAll('sslmode')
  if (sslModes.length > 0 && (entries.length !== 1 || sslModes[0] !== 'require')) {
    throw new Error('PostgreSQL connection sslmode must appear once and equal require')
  }
}

export function parseStrictPostgresConnectionTarget(
  connectionString: string,
): PostgresConnectionTargetIdentity {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    throw new Error('PostgreSQL connection string is invalid')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) {
    throw new Error('PostgreSQL connection string must use postgres or postgresql without a fragment')
  }

  validateConnectionSearchParams(url)

  const authority = {
    database: decodeUrlComponent(url.pathname.replace(/^\//u, ''), 'database'),
    host: url.hostname.toLowerCase(),
    port: Number.parseInt(url.port || '5432', 10),
    user: decodeUrlComponent(url.username, 'username'),
  }
  if (!authority.database || !authority.host || !authority.user || !Number.isInteger(authority.port)) {
    throw new Error('PostgreSQL connection authority must include host, user, port, and database')
  }

  const effectiveParseUrl = new URL(url.toString())
  if (effectiveParseUrl.searchParams.get('sslmode') === 'require') {
    effectiveParseUrl.searchParams.set('sslmode', 'verify-full')
  }
  const client = new Client({ connectionString: effectiveParseUrl.toString() }) as InstanceType<typeof Client> & {
    connectionParameters: EffectiveConnectionParameters
  }
  const effective = {
    database: client.connectionParameters.database,
    host: client.connectionParameters.host.toLowerCase(),
    port: client.connectionParameters.port,
    user: client.connectionParameters.user,
  }

  if (
    effective.database !== authority.database
    || effective.host !== authority.host
    || effective.port !== authority.port
    || effective.user !== authority.user
  ) {
    throw new Error('PostgreSQL connection effective target does not match URL authority')
  }

  return effective
}
