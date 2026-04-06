import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function walkDir(dir, callback) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (file.endsWith('.ts')) {
      callback(filePath);
    }
  }
}

function fixImports(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  const original = content;
  
  // 恢复相对路径导入中的 .ts 扩展名
  content = content.replace(/from\s+['"](\.\.\/[^'"]+?)['"]/g, "from '$1.ts'");
  
  if (content !== original) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
  }
}

// 处理 src 目录
const srcDir = join(__dirname, 'src');
walkDir(srcDir, fixImports);

console.log('\n✅ All imports reverted!');
