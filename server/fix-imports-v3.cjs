const fs = require('fs');
const path = require('path');

function fixImports(directory) {
  const files = fs.readdirSync(directory, { withFileTypes: true });
  
  files.forEach(file => {
    const filePath = path.join(directory, file.name);
    
    if (file.isDirectory()) {
      fixImports(filePath);
    } else if (file.name.endsWith('.ts')) {
      console.log('Processing:', filePath);
      let content = fs.readFileSync(filePath, 'utf-8');
      let modified = false;
      let originalContent = content;
      
      // 先修复重复的扩展名（.js.ts -> .ts）
      content = content.replace(/from ['"]([^'"]+)\.js\.ts['"]/g, (match, importPath) => {
        modified = true;
        return `from '${importPath}.ts'`;
      });
      
      // 再添加缺失的.ts扩展名（from '...' 但不以.js或.ts结尾）
      content = content.replace(
        /from ['"](\.\.\/[^'"]+)['"](\s*)$/gm,
        (match, importPath, whitespace) => {
          // 如果不以.js或.ts结尾，则添加.ts
          if (!importPath.endsWith('.js') && !importPath.endsWith('.ts')) {
            modified = true;
            return `from '${importPath}.ts'${whitespace}`;
          }
          return match;
        }
      );
      
      if (modified && content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log('  ✅ Fixed imports');
      }
    }
  });
}

// 修复src目录
fixImports(path.join(__dirname, 'src'));
console.log('\n✅ All imports fixed!');
