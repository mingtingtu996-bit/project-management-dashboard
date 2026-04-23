const esbuild = require('./node_modules/esbuild');
const fs = require('fs');

const content = fs.readFileSync('client/src/pages/GanttView.tsx', 'utf-8');
const lines = content.split('\n');
const total = lines.length;

// We need to find where the function body of GanttView ends prematurely according to esbuild
// The main function starts at line 254: export default function GanttView() {
// esbuild thinks this function ends BEFORE line 1501

// Key insight: 1500 lines is "OK" because esbuild sees an incomplete function
// 1501 lines shows Top-level return error  
// This means at exactly 1501 lines, esbuild has consumed the function's }

// Let's scan lines from 254 to 1502 and track brace depth
// Find where braces from function declaration unbalance

function countBraceDepth(lineIdx, lines) {
  // Count { and } in all preceding lines to find where function body ends
  let depth = 0;
  const funcStart = 253; // line 254 = index 253
  
  for (let i = funcStart; i < lineIdx && i < lines.length; i++) {
    const line = lines[i];
    // Skip string literals approximately (this is an approximation)
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;
    let prevChar = '';
    
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '/' && line[j+1] === '/') break; // line comment
      if (ch === "'" && !inDoubleQuote && !inTemplate && prevChar !== '\\') inSingleQuote = !inSingleQuote;
      if (ch === '"' && !inSingleQuote && !inTemplate && prevChar !== '\\') inDoubleQuote = !inDoubleQuote;
      if (ch === '`' && !inSingleQuote && !inDoubleQuote && prevChar !== '\\') inTemplate = !inTemplate;
      if (!inSingleQuote && !inDoubleQuote && !inTemplate) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      prevChar = ch;
    }
  }
  return depth;
}

// Find where the GanttView function body closes (depth goes to 0)
let depth = 0;
const funcStart = 253;
let prevDepth = 0;

console.log('Tracking function body depth from line 254...');
console.log('(showing lines where depth changes significantly or goes to 0)');

for (let i = funcStart; i < total; i++) {
  const line = lines[i];
  let lineDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = 0;
  let prevChar = '';
  
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '/' && j + 1 < line.length && line[j+1] === '/') break;
    if (!inSingleQuote && !inDoubleQuote && inTemplate === 0) {
      if (ch === '`') inTemplate++;
    } else if (inTemplate > 0) {
      if (ch === '`' && prevChar !== '\\') inTemplate--;
      else if (ch === '{' && prevChar === '$') inTemplate++;
      else if (ch === '}' && inTemplate > 1) inTemplate--;
    } else {
      if (ch === "'" && prevChar !== '\\') inSingleQuote = !inSingleQuote;
      else if (ch === '"' && prevChar !== '\\') inDoubleQuote = !inDoubleQuote;
    }
    
    if (!inSingleQuote && !inDoubleQuote && inTemplate <= 1) {
      if (ch === '{') lineDepth++;
      else if (ch === '}') lineDepth--;
    }
    prevChar = ch;
  }
  
  depth += lineDepth;
  
  if (depth <= 2 && i > funcStart + 100) {
    console.log(`  Line ${i+1}: depth=${depth} (${lineDepth > 0 ? '+' : ''}${lineDepth}): ${line.slice(0,80)}`);
  }
  
  if (depth === 0 && i > funcStart + 100) {
    console.log(`\n*** Function body closed at line ${i+1}! ***`);
    console.log('Lines around closure:');
    for (let k = Math.max(funcStart, i-5); k <= Math.min(total-1, i+5); k++) {
      console.log(`  ${k+1}: ${lines[k]}`);
    }
    break;
  }
}

console.log(`\nFinal depth at end of file: ${depth}`);
