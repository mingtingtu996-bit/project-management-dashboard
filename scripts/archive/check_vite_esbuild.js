const pkg = require('./node_modules/vite/package.json');
const deps = pkg.dependencies || {};
const opt = pkg.optionalDependencies || {};
console.log('esbuild in deps:', deps.esbuild);
console.log('esbuild in opt:', opt.esbuild);
// Check if vite allows newer esbuild
const peerDeps = pkg.peerDependencies || {};
console.log('peerDeps:', JSON.stringify(peerDeps));
