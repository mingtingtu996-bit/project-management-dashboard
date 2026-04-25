import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const content = fs.readFileSync(filePath, 'utf8')
  const result = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue

    let [, key, value] = match
    value = value.trim()

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

function requireValue(env, key, sourceLabel) {
  const value = env[key]
  if (!value) {
    throw new Error(`Missing ${key} in ${sourceLabel}`)
  }
  return value
}

function deriveProjectRef(supabaseUrl) {
  const match = supabaseUrl.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i)
  if (!match) {
    throw new Error(`Cannot derive project ref from SUPABASE_URL: ${supabaseUrl}`)
  }
  return match[1]
}

const rootEnvLocal = parseEnvFile(path.join(repoRoot, '.env.local'))
const clientEnv = {
  ...parseEnvFile(path.join(repoRoot, 'client', '.env')),
  ...parseEnvFile(path.join(repoRoot, 'client', '.env.local')),
}
const serverEnv = parseEnvFile(path.join(repoRoot, 'server', '.env'))

const supabaseUrl = requireValue(serverEnv, 'SUPABASE_URL', 'server/.env')
const supabaseServiceKey = requireValue(serverEnv, 'SUPABASE_SERVICE_KEY', 'server/.env')
const supabaseAnonKey = requireValue(serverEnv, 'SUPABASE_ANON_KEY', 'server/.env')
const viteSupabaseUrl = clientEnv.VITE_SUPABASE_URL || supabaseUrl
const viteSupabaseAnonKey =
  clientEnv.VITE_SUPABASE_ANON_KEY
  || rootEnvLocal.VITE_SUPABASE_ANON_KEY
  || supabaseAnonKey
const dbPassword =
  serverEnv.SUPABASE_PASSWORD
  || serverEnv.DB_PASSWORD
  || rootEnvLocal.SUPABASE_PASSWORD
  || rootEnvLocal.DB_PASSWORD

if (!dbPassword) {
  throw new Error('Missing DB password in server/.env or .env.local')
}

const projectRef = deriveProjectRef(supabaseUrl)

const bootstrapScript = `#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git openssl

sudo install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker

cd ~
rm -rf ~/project-management-dashboard
git clone https://github.com/mingtingtu996-bit/project-management-dashboard.git
cd ~/project-management-dashboard

SERVER_IP="$(curl -4 -fsSL https://ifconfig.me || curl -4 -fsSL https://api.ipify.org)"
JWT_SECRET="$(openssl rand -hex 32)"

mkdir -p deploy/env deploy/data/logs

cat > deploy/env/server.production.env <<'EOF'
WEB_PORT=80
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

SUPABASE_URL=${supabaseUrl}
SUPABASE_SERVICE_KEY=${supabaseServiceKey}
SUPABASE_ANON_KEY=${supabaseAnonKey}
VITE_SUPABASE_URL=${viteSupabaseUrl}
VITE_SUPABASE_ANON_KEY=${viteSupabaseAnonKey}

SUPABASE_HOST=db.${projectRef}.supabase.co
SUPABASE_PORT=5432
SUPABASE_DATABASE=postgres
SUPABASE_USER=postgres
SUPABASE_PASSWORD=${dbPassword}
DB_PASSWORD=${dbPassword}

CORS_ORIGIN=http://__SERVER_IP__
JWT_SECRET=__JWT_SECRET__
LOG_LEVEL=info
LOG_PERSIST=true
EOF

sed -i "s#__SERVER_IP__#$SERVER_IP#g" deploy/env/server.production.env
sed -i "s#__JWT_SECRET__#$JWT_SECRET#g" deploy/env/server.production.env

sudo docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml up -d --build --force-recreate

sudo docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml ps
sudo docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml logs --tail=120 api
sudo docker compose --env-file deploy/env/server.production.env -f deploy/docker-compose.lighthouse.yml logs --tail=120 web
curl -i http://127.0.0.1/api/health
`

const outDir = path.join(repoRoot, '.tmp')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'lighthouse-server-bootstrap.sh')
fs.writeFileSync(outPath, bootstrapScript, 'utf8')

console.log(outPath)
