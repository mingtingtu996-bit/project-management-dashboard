import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const files = {
  clientEnv: resolve(projectRoot, 'client', '.env'),
  clientEnvLocal: resolve(projectRoot, 'client', '.env.local'),
  serverEnv: resolve(projectRoot, 'server', '.env'),
};

const profile = process.argv[2];
const args = process.argv.slice(3);

function parseOptions(argv) {
  const options = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [rawKey, ...rest] = item.slice(2).split('=');
    const key = rawKey.trim();
    const value = rest.join('=').trim();
    if (key) {
      options[key] = value;
    }
  }
  return options;
}

function ensureFileExists(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`缺少配置文件：${filePath}`);
  }
}

function readEnv(filePath) {
  ensureFileExists(filePath);
  const content = readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    env[key] = value;
  }
  return env;
}

function upsertEnv(filePath, updates) {
  ensureFileExists(filePath);
  const content = readFileSync(filePath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const written = new Set();

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      return line;
    }

    const key = match[1];
    if (!(key in updates)) {
      return line;
    }

    written.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!written.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  writeFileSync(filePath, nextLines.join(eol), 'utf8');
}

function printStatus() {
  const clientEnv = readEnv(files.clientEnv);
  const clientEnvLocal = readEnv(files.clientEnvLocal);
  const serverEnv = readEnv(files.serverEnv);

  console.log('当前环境状态：');
  console.log(`- client/.env       VITE_STORAGE_MODE=${clientEnv.VITE_STORAGE_MODE || '(未设置)'}`);
  console.log(`- client/.env       VITE_API_BASE_URL=${clientEnv.VITE_API_BASE_URL || '(未设置)'}`);
  console.log(`- client/.env.local VITE_APP_ENV=${clientEnvLocal.VITE_APP_ENV || '(未设置)'}`);
  console.log(`- client/.env.local VITE_DEBUG_MODE=${clientEnvLocal.VITE_DEBUG_MODE || '(未设置)'}`);
  console.log(`- server/.env       NODE_ENV=${serverEnv.NODE_ENV || '(未设置)'}`);
  console.log(`- server/.env       CORS_ORIGIN=${serverEnv.CORS_ORIGIN || '(未设置)'}`);
}

function switchToLocal() {
  upsertEnv(files.clientEnv, {
    VITE_STORAGE_MODE: 'backend',
    VITE_API_BASE_URL: '/api',
    VITE_APP_ENV: 'development',
  });

  upsertEnv(files.clientEnvLocal, {
    VITE_STORAGE_MODE: 'backend',
    VITE_API_BASE_URL: '/api',
    VITE_APP_ENV: 'development',
    VITE_DEBUG_MODE: 'true',
  });

  upsertEnv(files.serverEnv, {
    NODE_ENV: 'development',
    CORS_ORIGIN: 'http://localhost:5173,http://127.0.0.1:5173',
  });

  console.log('✅ 已切换到本地联调模式');
  console.log('   前端统一走 /api 代理，后端放行 localhost 与 127.0.0.1');
}

function switchToProduction(options) {
  const serverEnv = readEnv(files.serverEnv);
  const origin = options.origin || (serverEnv.CORS_ORIGIN && !serverEnv.CORS_ORIGIN.includes('localhost') && !serverEnv.CORS_ORIGIN.includes('127.0.0.1')
    ? serverEnv.CORS_ORIGIN
    : '');
  const apiBase = options.api || '/api';

  if (!origin) {
    throw new Error('生产模式必须提供 --origin=https://你的前端域名，或先把 server/.env 中的 CORS_ORIGIN 改成正式域名');
  }

  upsertEnv(files.clientEnv, {
    VITE_STORAGE_MODE: 'backend',
    VITE_API_BASE_URL: apiBase,
    VITE_APP_ENV: 'production',
  });

  upsertEnv(files.clientEnvLocal, {
    VITE_STORAGE_MODE: 'backend',
    VITE_API_BASE_URL: apiBase,
    VITE_APP_ENV: 'production',
    VITE_DEBUG_MODE: 'false',
  });

  upsertEnv(files.serverEnv, {
    NODE_ENV: 'production',
    CORS_ORIGIN: origin,
  });

  console.log('✅ 已切换到上线模式');
  console.log(`   前端 API 基地址：${apiBase}`);
  console.log(`   后端 CORS 放行域名：${origin}`);
}

if (!profile || !['local', 'production', 'status'].includes(profile)) {
  console.log('用法：');
  console.log('  node scripts/switch-env.mjs local');
  console.log('  node scripts/switch-env.mjs production --origin=https://app.example.com --api=/api');
  console.log('  node scripts/switch-env.mjs status');
  process.exit(1);
}

const options = parseOptions(args);

if (profile === 'status') {
  printStatus();
} else if (profile === 'local') {
  switchToLocal();
} else {
  switchToProduction(options);
}
