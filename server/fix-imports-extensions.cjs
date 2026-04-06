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
      
      // 修复本地导入（from '../...' 或 from './...'）
      content = content.replace(
        /from ['"](\.\.\/[^'"]+)['"](\s*)$/gm,
        (match, importPath, whitespace) => {
          if (!importPath.endsWith('.ts')) {
            modified = true;
            return `from '${importPath}.ts'${whitespace}`;
          }
          return match;
        }
      );
      
      if (modified) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log('  ✅ Fixed imports');
      }
    }
  });
}

// 修复src目录
fixImports(path.join(__dirname, 'src'));
console.log('\n✅ All imports fixed!');
