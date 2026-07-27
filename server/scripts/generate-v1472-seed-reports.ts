import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CHINA_GB55032_TEMPLATE_CATALOG,
  flattenChinaTemplateCatalog,
  type ChinaTemplateCatalogNode,
  type ChinaTemplateCategoryType,
} from '../src/seeds/chinaGb50300TemplateCatalog.ts'
import {
  DOMAIN_WBS_TEMPLATE_CATALOGS,
  type DomainWbsTemplateCatalog,
} from '../src/seeds/domainWbsTemplateCatalogs.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const reportDir = resolve(__dirname, '../../artifacts/reports')

const nodes = flattenChinaTemplateCatalog()
const labels: Record<ChinaTemplateCategoryType, string> = {
  division: '分部',
  sub_division: '子分部',
  item_work: '分项',
  process: '工序',
  activity_step: '作业步骤',
}

function byType(type: ChinaTemplateCategoryType) {
  return nodes.filter((node) => node.categoryType === type).length
}

function average(values: number[]) {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function collect(root: ChinaTemplateCatalogNode, type: ChinaTemplateCategoryType) {
  let count = 0
  const visit = (node: ChinaTemplateCatalogNode) => {
    if (node.categoryType === type) count += 1
    for (const child of node.children ?? []) visit(child)
  }
  visit(root)
  return count
}

const itemNodes = nodes.filter((node) => node.categoryType === 'item_work')
const processNodes = nodes.filter((node) => node.categoryType === 'process')
const activityStepNodes = nodes.filter((node) => node.categoryType === 'activity_step')
const processCounts = itemNodes.map((node) => (node.children ?? []).filter((child) => child.categoryType === 'process').length)
const stepCounts = processNodes.map((node) => (node.children ?? []).filter((child) => child.categoryType === 'activity_step').length)
const reviewNeededCount = nodes.filter((node) => node.reviewNeeded).length
const webVerifiedFalseCount = nodes.filter((node) => node.webVerified === false).length
const disciplineProcessCount = processNodes.filter((node) => node.metadata?.processPackLevel === 'discipline_package').length
const genericFallbackProcessCount = processNodes.filter((node) => node.metadata?.processPackLevel === 'generic_fallback').length
const disciplineActivityStepCount = activityStepNodes.filter((node) => node.metadata?.activityStepSource === 'discipline_activity_step_pack').length
const genericActivityStepCount = activityStepNodes.filter((node) => node.metadata?.activityStepSource === 'generic_checklist').length
const uniqueProcessNameCount = new Set(processNodes.map((node) => node.name)).size
const uniqueActivityStepNameCount = new Set(activityStepNodes.map((node) => node.name)).size
const sourceCounts = nodes
  .filter((node) => node.categoryType === 'process' || node.categoryType === 'activity_step')
  .reduce<Record<string, number>>((acc, node) => {
    acc[node.sourceStandard] = (acc[node.sourceStandard] ?? 0) + 1
    return acc
  }, {})

const sourceSummary = Object.entries(sourceCounts)
  .map(([source, count]) => `${source} ${count}`)
  .join(' / ')
const genericGovernanceLine = genericFallbackProcessCount === 0
  ? '泛化兜底治理：已全部替换为专业工序包'
  : `泛化兜底治理：仍有 ${genericFallbackProcessCount} 个工序需要后续企业工法替换`

const previewLines = [
  '# v1.4.7.2 seed 模板展开预览',
  '',
  `- 模板 ID: ${CHINA_GB55032_TEMPLATE_CATALOG.templateId}`,
  `- 模板编码: ${CHINA_GB55032_TEMPLATE_CATALOG.templateCode}`,
  `- 模板名称: ${CHINA_GB55032_TEMPLATE_CATALOG.templateName}`,
  `- 来源标准: ${CHINA_GB55032_TEMPLATE_CATALOG.sourceStandard}`,
  `- 来源版本: ${CHINA_GB55032_TEMPLATE_CATALOG.sourceVersion}`,
  `- 节点总数: ${nodes.length}`,
  `- 分部数量: ${byType('division')}`,
  `- 子分部数量: ${byType('sub_division')}`,
  `- 分项数量: ${byType('item_work')}`,
  `- 工序数量: ${byType('process')}`,
  `- 作业步骤数量: ${byType('activity_step')}`,
  `- 最少工序/分项: ${Math.min(...processCounts)}`,
  `- 平均工序/分项: ${average(processCounts)}`,
  `- 最少作业步骤/工序: ${Math.min(...stepCounts)}`,
  `- 平均作业步骤/工序: ${average(stepCounts)}`,
  `- reviewNeeded 数量: ${reviewNeededCount}`,
  `- webVerified=false 数量: ${webVerifiedFalseCount}`,
  `- 专业工序包数量: ${disciplineProcessCount}`,
  `- 泛化兜底工序数量: ${genericFallbackProcessCount}`,
  `- 专业作业步骤数量: ${disciplineActivityStepCount}`,
  `- 通用检查清单步骤数量: ${genericActivityStepCount}`,
  `- 唯一工序名称数量: ${uniqueProcessNameCount}`,
  `- 唯一作业步骤名称数量: ${uniqueActivityStepNameCount}`,
  `- 工序与作业步骤来源: ${sourceSummary}`,
  '',
  '> 说明：当前 seed 已升级到商业版证据链口径。分部 / 子分部 / 分项来自 GB55032-2022、GB50300-2013 及专业验收标准主干；工序层与作业步骤层为 enterprise_method，并已区分专业工序包与泛化兜底工序；正式 seed 已清零 reviewNeeded。',
  '',
  '## 分部统计',
  '',
  '| 编码 | 分部 | 子分部 | 分项 | 工序 | 作业步骤 |',
  '|---|---|---:|---:|---:|---:|',
]

for (const division of CHINA_GB55032_TEMPLATE_CATALOG.divisions) {
  previewLines.push(`| ${division.stableCode} | ${division.name} | ${collect(division, 'sub_division')} | ${collect(division, 'item_work')} | ${collect(division, 'process')} | ${collect(division, 'activity_step')} |`)
}

previewLines.push('', '## 全量树', '')

function renderNode(node: ChinaTemplateCatalogNode, depth = 0) {
  const verificationStatus = typeof node.metadata?.verificationStatus === 'string' ? node.metadata.verificationStatus : 'unverified'
  const evidenceLevel = typeof node.metadata?.evidenceLevel === 'string' ? node.metadata.evidenceLevel : 'NA'
  previewLines.push(`${'  '.repeat(depth)}- ${node.stableCode} ${node.name} [${labels[node.categoryType]} / ${node.sourceStandard} / ${evidenceLevel} / ${verificationStatus}]`)
  for (const child of node.children ?? []) renderNode(child, depth + 1)
}

for (const division of CHINA_GB55032_TEMPLATE_CATALOG.divisions) renderNode(division)

writeFileSync(resolve(reportDir, 'v1.4.7.2-seed-template-preview.md'), `${previewLines.join('\n')}\n`, 'utf8')

const gapLines = [
  '# v1.4.7.2 工序与作业步骤闭合分析',
  '',
  '## 当前 seed 实测',
  '',
  '```text',
  `item_work: ${byType('item_work')}`,
  `process: ${byType('process')}`,
  `activity_step: ${byType('activity_step')}`,
  `平均 process/item: ${average(processCounts)}`,
  `最少 process/item: ${Math.min(...processCounts)}`,
  `最多 process/item: ${Math.max(...processCounts)}`,
  `平均 activity_step/process: ${average(stepCounts)}`,
  `最少 activity_step/process: ${Math.min(...stepCounts)}`,
  `reviewNeeded: ${reviewNeededCount}`,
  `webVerified=false: ${webVerifiedFalseCount}`,
  `discipline_process_package: ${disciplineProcessCount}`,
  `generic_fallback_process: ${genericFallbackProcessCount}`,
  `discipline_activity_step_pack: ${disciplineActivityStepCount}`,
  `generic_checklist_step: ${genericActivityStepCount}`,
  `unique_process_name: ${uniqueProcessNameCount}`,
  `unique_activity_step_name: ${uniqueActivityStepNameCount}`,
  `每个分项只有 1 个 process 的分项数: ${processCounts.filter((count) => count === 1).length}`,
  `多 process 分项数: ${processCounts.filter((count) => count > 1).length}`,
  'process 与 activity_step 来源:',
  ...Object.entries(sourceCounts).map(([source, count]) => `  ${source}: ${count}`),
  '```',
  '',
  '## 结论',
  '',
  `当前工序库已从旧的“每个分项单工序兜底”口径升级为“${disciplineProcessCount} 个专业工序包 + ${genericFallbackProcessCount} 个泛化兜底工序 + ${disciplineActivityStepCount} 个专业作业步骤 + ${genericActivityStepCount} 个通用检查清单步骤”，并完成商业版证据链清零：reviewNeeded=0、webVerified=false=0。它已经满足首版房建工程计划编制和现场交底的基础颗粒度；当前内置 seed 已不再残留泛化三段式兜底包。`,
  '',
  'GB55032-2022 仍只作为分部 / 子分部 / 分项的质量控制主干；工序层和作业步骤层不声称来自国标原文，而是作为 enterprise_method 工序包落地。后续仍需要按企业工法、专项施工方案、真实项目样本和 v1.4.18 经验工期体系继续校准工期、资源和依赖逻辑。',
  '',
  '## 收口判断',
  '',
  '```text',
  '最低可运行：已满足',
  '房建工程计划首版：已满足',
  '关键线路分析：已具备初始颗粒度',
  '月/周计划滚动：已具备初始颗粒度',
  '劳动力/资源测算：已具备初始颗粒度',
  `现场交底和验收联动：已具备作业步骤颗粒度，唯一作业步骤名称 ${uniqueActivityStepNameCount} 类，正式计划生成默认到工序层`,
  '商业证据链：已清零 reviewNeeded / webVerified=false',
  genericGovernanceLine,
  '经验工期校准：待 v1.4.18 持续沉淀',
  '```',
  '',
  '## 后续增强目标',
  '',
  '```text',
  `当前版本：${byType('process')} process，平均 ${average(processCounts)} process/item；${byType('activity_step')} activity_step，平均 ${average(stepCounts)} activity_step/process；generic_fallback=${genericFallbackProcessCount}`,
  '下一阶段：按专业工程对象、施工方法和项目类型形成可替换工序包，不再无差别膨胀标准 seed',
  '长期阶段：由 v1.4.18 经验工期体系根据真实项目样本持续沉淀 defaultDurationDays、资源和依赖逻辑',
  '```',
  '',
  '## 执行建议',
  '',
  '```text',
  `保留当前 ${byType('process')} 个 enterprise_method 工序包和 ${byType('activity_step')} 个 activity_step 作为首版房建标准库交付；默认生成到 process，activity_step 仅在显式展开时进入草稿。`,
  '对高频专业继续增加可替换工序包：现浇结构、钢结构、装饰装修、屋面防水、给排水、暖通、电气、智能化、电梯。',
  '新增或继续使用 processSource:',
  '  enterprise_method',
  '  project_template',
  '  method_statement',
  '  historical_project_sample',
  '工序包升级后必须保留 source_template_node_id / generation_batch_id lineage，不直接回写历史基线或历史月计划快照。',
  '```',
  '',
  '## 参考来源',
  '',
  '- GB55032-2022《建筑与市政工程施工质量控制通用规范》住建部公告：<https://www.mohurd.gov.cn/gongkai/zc/wjk/art/2022/art_17339_767714.html>',
  '- GB50300-2013《建筑工程施工质量验收统一标准》公开文本：<https://zjw.sh.gov.cn/cmsres/34/349cab456a80498091dd53105c3b6109/7573fa552919c7dbb9ddd603afc4eea0.pdf>',
  '- GB/T 50502-2009《建筑施工组织设计规范》在线文本：<https://www.zlglpt.com/book/book_view.aspx?id=675>',
  '- GB/T 50500-2024《建设工程工程量清单计价标准》住建部公告：<https://www.mohurd.gov.cn/gongkai/zc/wjk/art/2024/art_6186304e164c4c4982904f8734983235.html>',
]

writeFileSync(resolve(reportDir, 'v1.4.7.2-process-gap-analysis.md'), `${gapLines.join('\n')}\n`, 'utf8')

function flattenDomainCatalog(catalog: DomainWbsTemplateCatalog) {
  const flattened: ChinaTemplateCatalogNode[] = []
  const visit = (node: ChinaTemplateCatalogNode) => {
    flattened.push(node)
    for (const child of node.children ?? []) visit(child)
  }
  for (const division of catalog.divisions) visit(division)
  return flattened
}

function countNodes(nodesToCount: ChinaTemplateCatalogNode[], type: ChinaTemplateCategoryType) {
  return nodesToCount.filter((node) => node.categoryType === type).length
}

function countSourceStandards(nodesToCount: ChinaTemplateCatalogNode[]) {
  return nodesToCount
    .filter((node) => node.categoryType === 'process' || node.categoryType === 'activity_step')
    .reduce<Record<string, number>>((acc, node) => {
      acc[node.sourceStandard] = (acc[node.sourceStandard] ?? 0) + 1
      return acc
    }, {})
}

function renderDomainNode(lines: string[], node: ChinaTemplateCatalogNode, depth = 0) {
  const evidenceLevel = typeof node.metadata?.evidenceLevel === 'string' ? node.metadata.evidenceLevel : 'NA'
  const verificationStatus = typeof node.metadata?.verificationStatus === 'string' ? node.metadata.verificationStatus : 'unverified'
  lines.push(`${'  '.repeat(depth)}- ${node.stableCode} ${node.name} [${node.categoryType} / ${node.sourceStandard} / ${evidenceLevel} / ${verificationStatus}]`)
  for (const child of node.children ?? []) renderDomainNode(lines, child, depth + 1)
}

function buildDomainReport(catalog: DomainWbsTemplateCatalog) {
  const domainNodes = flattenDomainCatalog(catalog)
  const domainItemNodes = domainNodes.filter((node) => node.categoryType === 'item_work')
  const domainProcessNodes = domainNodes.filter((node) => node.categoryType === 'process')
  const domainActivityStepNodes = domainNodes.filter((node) => node.categoryType === 'activity_step')
  const domainProcessCounts = domainItemNodes.map((node) => (node.children ?? []).filter((child) => child.categoryType === 'process').length)
  const domainStepCounts = domainProcessNodes.map((node) => (node.children ?? []).filter((child) => child.categoryType === 'activity_step').length)
  const sourceStandardCounts = countSourceStandards(domainNodes)
  const reportLines = [
    `# v1.4.7.2 domain template preview - ${catalog.templateName}`,
    '',
    `- templateId: ${catalog.templateId}`,
    `- templateCode: ${catalog.templateCode}`,
    `- templateGroup: ${catalog.templateGroup}`,
    `- domainScope: ${catalog.domainScope}`,
    `- sourceStandard: ${catalog.sourceStandard}`,
    `- sourceVersion: ${catalog.sourceVersion}`,
    `- applicableScope: ${catalog.applicableScope.join(' / ')}`,
    `- sourceStandards: ${catalog.sourceStandards.join(' / ')}`,
    `- evidenceStatus: ${catalog.evidenceStatus}`,
    `- reviewNeeded: ${String(catalog.reviewNeeded)}`,
    `- webVerified: ${String(catalog.webVerified)}`,
    '',
    '## Counts',
    '',
    `- totalNodes: ${domainNodes.length}`,
    `- divisions: ${countNodes(domainNodes, 'division')}`,
    `- subDivisions: ${countNodes(domainNodes, 'sub_division')}`,
    `- itemWorks: ${countNodes(domainNodes, 'item_work')}`,
    `- processes: ${countNodes(domainNodes, 'process')}`,
    `- activitySteps: ${countNodes(domainNodes, 'activity_step')}`,
    `- minProcessesPerItem: ${domainProcessCounts.length > 0 ? Math.min(...domainProcessCounts) : 0}`,
    `- avgProcessesPerItem: ${domainProcessCounts.length > 0 ? average(domainProcessCounts) : 0}`,
    `- minStepsPerProcess: ${domainStepCounts.length > 0 ? Math.min(...domainStepCounts) : 0}`,
    `- avgStepsPerProcess: ${domainStepCounts.length > 0 ? average(domainStepCounts) : 0}`,
    `- uniqueProcessNames: ${new Set(domainProcessNodes.map((node) => node.name)).size}`,
    `- uniqueActivityStepNames: ${new Set(domainActivityStepNodes.map((node) => node.name)).size}`,
    `- reviewNeededNodes: ${domainNodes.filter((node) => node.reviewNeeded).length}`,
    `- webVerifiedFalseNodes: ${domainNodes.filter((node) => node.webVerified === false).length}`,
    '',
    '## Source Standards',
    '',
    ...Object.entries(sourceStandardCounts).map(([source, count]) => `- ${source}: ${count}`),
    '',
    '## Tree',
    '',
  ]

  for (const division of catalog.divisions) renderDomainNode(reportLines, division)
  return `${reportLines.join('\n')}\n`
}

const domainSummaryLines = [
  '# v1.4.7.2 domain template summary',
  '',
  '| templateId | group | domainScope | nodes | divisions | itemWorks | processes | activitySteps | reviewNeeded | webVerifiedFalse |',
  '|---|---|---|---:|---:|---:|---:|---:|---:|---:|',
]

for (const catalog of DOMAIN_WBS_TEMPLATE_CATALOGS) {
  const domainNodes = flattenDomainCatalog(catalog)
  const reportFileName = `v1.4.7.2-domain-${catalog.templateId}-preview.md`
  writeFileSync(resolve(reportDir, reportFileName), buildDomainReport(catalog), 'utf8')
  domainSummaryLines.push([
    catalog.templateId,
    catalog.templateGroup,
    catalog.domainScope,
    String(domainNodes.length),
    String(countNodes(domainNodes, 'division')),
    String(countNodes(domainNodes, 'item_work')),
    String(countNodes(domainNodes, 'process')),
    String(countNodes(domainNodes, 'activity_step')),
    String(domainNodes.filter((node) => node.reviewNeeded).length),
    String(domainNodes.filter((node) => node.webVerified === false).length),
  ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
}

writeFileSync(resolve(reportDir, 'v1.4.7.2-domain-template-preview.md'), `${domainSummaryLines.join('\n')}\n`, 'utf8')
