import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const WBS_TEMPLATE_GENERATION_IMPLEMENTATION_FILES = [
  'wbsTemplateGenerationFoundation.ts',
  'wbsTemplateScopeClassificationService.ts',
  'wbsTemplateDurationAssemblyService.ts',
  'wbsTemplateOutputProjectionService.ts',
  'wbsTemplateDependencyCandidateService.ts',
  'wbsTemplateAssetStrategyService.ts',
  'wbsTemplateCloseoutChainService.ts',
  'wbsTemplateAuditFormattingService.ts',
  'wbsTemplateGenerationOrchestrator.ts',
] as const

export function readWbsTemplateGenerationImplementationSource(serverRoot: string) {
  return WBS_TEMPLATE_GENERATION_IMPLEMENTATION_FILES
    .map((fileName) => readFileSync(resolve(serverRoot, 'src/services', fileName), 'utf8'))
    .join('\n')
}
