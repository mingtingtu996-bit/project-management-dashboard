import {
  CHINA_GB55032_TEMPLATE_CATALOG,
  type ChinaTemplateCatalogNode,
  type ChinaTemplateCategoryType,
} from './chinaGb50300TemplateCatalog.js'
import {
  DOMAIN_WBS_TEMPLATE_CATALOGS,
  type WbsTemplateCatalogGroup,
  type WbsTemplateDomainGroup,
  type WbsTemplatePackType,
} from './domainWbsTemplateCatalogs.js'
import { DEPENDENCY_INTENT_REFERENCE_FIELDS } from './v1475DependencyIntentTemplates.js'
import { WBS_TEMPLATE_SEMANTIC_OVERRIDES } from './wbsTemplateSemanticOverrides.js'

export type WbsTemplateCatalogIndexEntry = {
  templateId: string
  templateCode: string
  templateName: string
  catalogGroup: WbsTemplateCatalogGroup
  templateGroup: WbsTemplateDomainGroup
  packType: WbsTemplatePackType
  stableCode: string
  name: string
  categoryType: ChinaTemplateCategoryType
  path: string
  parentStableCode: string | null
  metadata: Record<string, unknown>
}

type CatalogLike = {
  templateId: string
  templateCode: string
  templateName: string
  packType?: WbsTemplatePackType
  templateGroup?: WbsTemplateDomainGroup
  divisions: ChinaTemplateCatalogNode[]
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))]
  return String(value ?? '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeCatalogGroup(catalog: CatalogLike): WbsTemplateCatalogGroup {
  return catalog.templateId === CHINA_GB55032_TEMPLATE_CATALOG.templateId ? 'core_quality' : catalog.packType ?? 'specialty'
}

function normalizeTemplateGroup(catalog: CatalogLike): WbsTemplateDomainGroup {
  return catalog.templateGroup ?? 'building_main'
}

function walkCatalog(
  catalog: CatalogLike,
  node: ChinaTemplateCatalogNode,
  parentStableCode: string | null,
  path: string[],
  entries: WbsTemplateCatalogIndexEntry[],
) {
  const catalogGroup = normalizeCatalogGroup(catalog)
  const templateGroup = normalizeTemplateGroup(catalog)
  entries.push({
    templateId: catalog.templateId,
    templateCode: catalog.templateCode,
    templateName: catalog.templateName,
    catalogGroup,
    templateGroup,
    packType: catalogGroup,
    stableCode: node.stableCode,
    name: node.name,
    categoryType: node.categoryType,
    path: [...path, node.stableCode].join('/'),
    parentStableCode,
    metadata: { ...(node.metadata ?? {}) },
  })
  for (const child of node.children ?? []) {
    walkCatalog(catalog, child, node.stableCode, [...path, node.stableCode], entries)
  }
}

export function buildWbsTemplateCatalogIndex() {
  const catalogs: CatalogLike[] = [
    {
      templateId: CHINA_GB55032_TEMPLATE_CATALOG.templateId,
      templateCode: CHINA_GB55032_TEMPLATE_CATALOG.templateCode,
      templateName: CHINA_GB55032_TEMPLATE_CATALOG.templateName,
      packType: 'core_quality',
      templateGroup: 'building_main',
      divisions: CHINA_GB55032_TEMPLATE_CATALOG.divisions,
    },
    ...DOMAIN_WBS_TEMPLATE_CATALOGS,
  ]
  const entries: WbsTemplateCatalogIndexEntry[] = []
  for (const catalog of catalogs) {
    for (const division of catalog.divisions) {
      walkCatalog(catalog, division, null, [catalog.templateId], entries)
    }
  }

  const byStableCode = new Map<string, WbsTemplateCatalogIndexEntry[]>()
  const byTemplateId = new Map<string, WbsTemplateCatalogIndexEntry[]>()
  const byCatalogGroup = new Map<WbsTemplateCatalogGroup, WbsTemplateCatalogIndexEntry[]>()
  const byProjectType = new Map<string, WbsTemplateCatalogIndexEntry[]>()
  const byMethodVariant = new Map<string, WbsTemplateCatalogIndexEntry[]>()
  const backlinks = new Map<string, WbsTemplateCatalogIndexEntry[]>()

  for (const entry of entries) {
    const stableEntries = byStableCode.get(entry.stableCode) ?? []
    stableEntries.push(entry)
    byStableCode.set(entry.stableCode, stableEntries)

    const templateEntries = byTemplateId.get(entry.templateId) ?? []
    templateEntries.push(entry)
    byTemplateId.set(entry.templateId, templateEntries)

    const groupEntries = byCatalogGroup.get(entry.catalogGroup) ?? []
    groupEntries.push(entry)
    byCatalogGroup.set(entry.catalogGroup, groupEntries)

    for (const projectType of readStringList(entry.metadata.applicableProjectTypes ?? entry.metadata.projectTypeCodes)) {
      const rows = byProjectType.get(projectType) ?? []
      rows.push(entry)
      byProjectType.set(projectType, rows)
    }
    for (const methodVariant of readStringList(entry.metadata.applicableMethodVariantCodes ?? entry.metadata.methodVariantCodes)) {
      const rows = byMethodVariant.get(methodVariant) ?? []
      rows.push(entry)
      byMethodVariant.set(methodVariant, rows)
    }
    for (const { field } of DEPENDENCY_INTENT_REFERENCE_FIELDS) {
      for (const code of readStringList(entry.metadata[field])) {
        const rows = backlinks.get(code) ?? []
        rows.push(entry)
        backlinks.set(code, rows)
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    catalogs,
    entries,
    byStableCode,
    byTemplateId,
    byCatalogGroup,
    byProjectType,
    byMethodVariant,
    backlinks,
    semanticOverrideByStableCode: new Map(WBS_TEMPLATE_SEMANTIC_OVERRIDES.map((override) => [override.stableCode, override])),
  }
}

export const WBS_TEMPLATE_CATALOG_INDEX = buildWbsTemplateCatalogIndex()

export function collectWbsTemplateCatalogIndexReport() {
  const index = WBS_TEMPLATE_CATALOG_INDEX
  return {
    reportCode: 'wbs_template_catalog_index_report',
    generatedAt: new Date().toISOString(),
    purpose: 'Precompiled in-memory indexes for standard and domain template seeds; ordinary frontend does not consume this technical report.',
    catalogCount: index.catalogs.length,
    nodeCount: index.entries.length,
    stableCodeCount: index.byStableCode.size,
    templateIdCount: index.byTemplateId.size,
    catalogGroupCount: index.byCatalogGroup.size,
    projectTypeIndexKeyCount: index.byProjectType.size,
    methodVariantIndexKeyCount: index.byMethodVariant.size,
    backlinkTargetCount: index.backlinks.size,
    semanticOverrideCount: index.semanticOverrideByStableCode.size,
    indexes: {
      stableCode: 'stableCode -> node entries',
      templateId: 'templateId -> node entries',
      catalogGroup: 'catalogGroup -> node entries',
      projectType: 'projectType/applicableProjectTypes -> node entries',
      methodVariant: 'methodVariant/applicableMethodVariantCodes -> node entries',
      backlinks: 'referenced*Codes -> referencing node entries',
      semanticOverrides: 'stableCode -> curated semantic override',
    },
  }
}
