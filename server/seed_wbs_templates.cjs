const { readFileSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { pathToFileURL } = require('node:url')

const { createClient } = require('@supabase/supabase-js')
const ts = require('typescript')

require('dotenv').config({ path: join(__dirname, '.env') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

const LEGACY_TEMPLATE_NAMES = [
  '住宅标准WBS模板',
  '商业综合体WBS模板',
  '工业厂房WBS模板',
  '市政道路WBS模板',
]

async function loadBuiltInTemplatePresets() {
  const sourcePath = join(__dirname, 'src', 'services', 'wbsTemplatePresets.ts')
  const sourceCode = readFileSync(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(sourceCode, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText

  const tempDir = mkdtempSync(join(tmpdir(), 'wbs-presets-'))
  const modulePath = join(tempDir, 'wbsTemplatePresets.mjs')
  writeFileSync(modulePath, transpiled, 'utf8')

  try {
    const module = await import(pathToFileURL(modulePath).href)
    return module.getBuiltInWbsTemplatePresets()
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

async function run() {
  const presets = await loadBuiltInTemplatePresets()
  const newNames = presets.map((preset) => preset.templateName)
  const allNames = [...LEGACY_TEMPLATE_NAMES, ...newNames]

  console.log('=== Step 1: 清理旧模板 ===')
  const { error: deleteError } = await supabase
    .from('wbs_templates')
    .delete()
    .is('created_by', null)
    .in('template_name', allNames)

  if (deleteError) {
    throw deleteError
  }

  console.log('=== Step 2: 插入新版模板 ===')
  for (const preset of presets) {
    const { error } = await supabase.from('wbs_templates').insert({
      template_name: preset.templateName,
      template_type: preset.templateType,
      description: preset.description,
      wbs_nodes: preset.nodes,
      is_default: true,
      created_by: null,
    })

    if (error) {
      throw error
    }

    console.log(`已写入: ${preset.templateName}`)
  }

  console.log('=== Step 3: 验证结果 ===')
  const { data, error } = await supabase
    .from('wbs_templates')
    .select('template_name, template_type, is_default')
    .in('template_name', newNames)
    .order('template_type', { ascending: true })

  if (error) {
    throw error
  }

  console.log(JSON.stringify(data, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
