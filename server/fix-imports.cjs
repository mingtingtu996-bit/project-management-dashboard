const fs = require('fs');
const path = require('path');

const routesDir = 'src/routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));

let fixedCount = 0;

files.forEach(file => {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // 修复 .js 扩展名为.ts扩展名
  const patterns = [
    ["from '../supabase.js'", "from '../services/supabaseService.ts'"],
    ["from '../middleware/asyncHandler.js'", "from '../middleware/asyncHandler.ts'"],
    ["from '../utils/logger.js'", "from '../utils/logger.ts'"],
    ["from '../utils/validation.js'", "from '../utils/validation.ts'"],
    ["from '../services/warningService.js'", "from '../services/warningService.ts'"],
  ];

  patterns.forEach(function(pattern) {
    if (content.includes(pattern[0])) {
      content = content.replace(new RegExp(pattern[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), pattern[1]);
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    fixedCount++;
    console.log('✅ Fixed:', file);
  }
});

console.log(`\n📊 Total files fixed: ${fixedCount}/${files.length}`);
