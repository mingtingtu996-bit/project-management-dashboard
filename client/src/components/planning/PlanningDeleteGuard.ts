// v1.4.7.1 §8.4: Delete row protection rules
// Frontend-side guard patterns for delete operations

export type DeleteDisposition =
  | 'allow'           // Can delete - new unsaved row
  | 'soft_delete'     // Save as deletion intent, backend handles per v1.4.15
  | 'block'           // Cannot delete - protected by upgrade chain or reference
  | 'confirm'         // Needs user confirmation before deletion intent

export interface DeleteGuardResult {
  disposition: DeleteDisposition
  reason?: string
  requiresConfirmation?: boolean
}

export interface DeleteableRow {
  id: string
  isNew?: boolean        // Unsaved new row
  isPersisted?: boolean  // Saved to DB
  hasUpgradeChain?: boolean // Part of warning -> risk -> issue chain
  hasConditions?: boolean
  hasBlockages?: boolean
  hasAcceptanceLinks?: boolean
  childCount?: number
}

const UPGRADE_CHAIN_WARNING = '该记录已升级为关闭状态，不能直接删除'
const HAS_CHILDREN_WARNING = '该行有 {n} 个子级，删除后将一并移除子级'
const HAS_CONDITIONS_WARNING = '该行有开工条件关联，删除后条件将标记来源失效'
const HAS_BLOCKAGES_WARNING = '该行有阻碍记录，删除后阻碍将标记来源失效'
const HAS_ACCEPTANCE_LINKS_WARNING = '该行影响验收事项，删除后验收关联将由后端重新治理'

export function evaluateDeleteDisposition(row: DeleteableRow): DeleteGuardResult {
  // New unsaved rows can always be removed from buffer
  if (row.isNew && !row.isPersisted) {
    return { disposition: 'allow' }
  }

  // Upgrade chain protection
  if (row.hasUpgradeChain) {
    return {
      disposition: 'block',
      reason: UPGRADE_CHAIN_WARNING,
    }
  }

  // Needs confirmation for rows with children
  if (row.childCount && row.childCount > 0) {
    return {
      disposition: 'confirm',
      reason: HAS_CHILDREN_WARNING.replace('{n}', String(row.childCount)),
      requiresConfirmation: true,
    }
  }

  // Needs confirmation for rows with conditions
  if (row.hasConditions) {
    return {
      disposition: 'confirm',
      reason: HAS_CONDITIONS_WARNING,
      requiresConfirmation: true,
    }
  }

  // Needs confirmation for rows with blockages
  if (row.hasBlockages) {
    return {
      disposition: 'confirm',
      reason: HAS_BLOCKAGES_WARNING,
      requiresConfirmation: true,
    }
  }

  if (row.hasAcceptanceLinks) {
    return {
      disposition: 'confirm',
      reason: HAS_ACCEPTANCE_LINKS_WARNING,
      requiresConfirmation: true,
    }
  }

  // Normal persisted rows: save as soft delete intent
  return {
    disposition: 'soft_delete',
    reason: '保存时将提交删除操作',
  }
}

export function getDeleteButtonLabel(disposition: DeleteGuardResult): string {
  switch (disposition.disposition) {
    case 'allow': return '删除'
    case 'block': return '关闭'
    case 'confirm': return '删除'
    case 'soft_delete': return '删除'
  }
}

export function getDeleteButtonDisabled(disposition: DeleteGuardResult): boolean {
  return disposition.disposition === 'block'
}

export function getDeleteTooltip(disposition: DeleteGuardResult): string | undefined {
  return disposition.reason
}
