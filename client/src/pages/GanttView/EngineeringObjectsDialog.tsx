import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getApiErrorMessage } from '@/lib/apiClient'
import {
  ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES,
  ENGINEERING_OBJECT_PHYSICAL_LEDGER_TYPES,
  ENGINEERING_OBJECT_PERSISTED_DECOMPOSITION_PARENT_TYPES,
  ENGINEERING_OBJECT_ROOT_TYPES,
  ENGINEERING_OBJECT_VALID_CHILDREN,
  getEngineeringObjectDefaultAreaAccountingMode,
  getEngineeringObjectDefaultCoverageRole,
} from '@/lib/engineeringObjectScope'
import { cn } from '@/lib/utils'
import {
  createEngineeringObject,
  deleteEngineeringObject,
  listEngineeringObjects,
  updateEngineeringObject,
  type EngineeringObject,
  type EngineeringObjectType,
} from '@/services/engineeringObjectsApi'

const OBJECT_TYPES: Array<{ key: EngineeringObjectType; label: string }> = [
  { key: 'phase', label: '分期' },
  { key: 'section', label: '标段' },
  { key: 'building', label: '单体' },
  { key: 'basement', label: '地下室' },
  { key: 'floor', label: '楼层' },
  { key: 'physical_zone', label: '工程区域' },
  { key: 'functional_area', label: '功能区' },
]

const OBJECT_TYPE_LABELS: Record<EngineeringObjectType, string> = {
  phase: '分期',
  section: '标段',
  building: '单体',
  basement: '地下室',
  floor: '楼层',
  physical_zone: '工程区域',
  functional_area: '功能区',
}

const OBJECT_TYPE_COLORS: Record<EngineeringObjectType, string> = {
  phase: 'bg-blue-100 text-blue-700',
  section: 'bg-amber-100 text-amber-700',
  building: 'bg-slate-100 text-slate-700',
  basement: 'bg-indigo-100 text-indigo-700',
  floor: 'bg-slate-100 text-slate-600',
  physical_zone: 'bg-blue-100 text-blue-700',
  functional_area: 'bg-emerald-100 text-emerald-700',
}

const VALID_CHILD_TYPES = ENGINEERING_OBJECT_VALID_CHILDREN as Record<EngineeringObjectType, readonly EngineeringObjectType[]>

const ALLOWED_OBJECT_TYPES = new Set<string>(OBJECT_TYPES.map((type) => type.key))
const EMPTY_ENGINEERING_OBJECTS: EngineeringObject[] = []
const LEDGER_OBJECT_TYPES = new Set<EngineeringObjectType>(['building', 'basement', 'floor', 'physical_zone', 'functional_area'])
const PHYSICAL_LEDGER_OBJECT_TYPES = new Set<EngineeringObjectType>(ENGINEERING_OBJECT_PHYSICAL_LEDGER_TYPES)
const DECOMPOSITION_PARENT_TYPES = new Set<EngineeringObjectType>(ENGINEERING_OBJECT_PERSISTED_DECOMPOSITION_PARENT_TYPES)
const COVERAGE_ROLE_OPTIONS = [
  { id: 'exclusive_scope', label: '实体范围' },
  { id: 'overlay_trigger', label: '功能触发' },
  { id: 'reference_marker', label: '参考标记' },
] as const
const AREA_ACCOUNTING_OPTIONS = [
  { id: 'counted', label: '计入面积' },
  { id: 'not_counted', label: '不计入面积' },
  { id: 'derived_from_children', label: '由下级汇总' },
] as const

const FUNCTIONAL_USAGES = [
  '住宅楼',
  '写字楼',
  '酒店客房楼',
  '商业',
  '住院楼',
  '医技楼',
  '门诊楼',
  '传染门诊',
  '教学楼',
  '实验楼',
  '宿舍楼',
  '食堂',
  '体育馆',
  '图书馆',
  '主厂房',
  '辅楼',
  '仓库',
  '机房楼',
  '动力中心',
  '转换层',
  '上盖塔楼',
  '既有建筑',
  '模块化单元',
  '框架主体',
  '场馆主体',
] as const

const METHOD_VARIANTS = [
  { id: 'cast_in_situ', label: '现浇钢筋混凝土' },
  { id: 'steel_frame', label: '钢框架' },
  { id: 'precast_concrete', label: '装配式 PC' },
  { id: 'modular_mic', label: '模块化 MiC' },
] as const

const FUNCTIONAL_CATEGORIES = [
  '核心筒',
  '户内',
  '公区',
  '设备区',
  '人防',
  '三区两通道',
  '洁净区',
  '清洁区',
  '半污染区',
  '污染区',
] as const

const PHYSICAL_ZONE_TYPES = [
  '地下室分区',
  '室外道路',
  '园建绿化',
  '管网分区',
  '人防区',
  '设备区',
  '车库分区',
  '屋面区域',
] as const

const BUILDING_NUMBER_FIELDS = [
  ['standardFloorCount', '标准层数', '如 22'],
  ['basementDepthM', '地下深度 (m)', '如 6'],
  ['maxSpanM', '最大跨度 (m)', '如 15'],
  ['supportHeightM', '高支模高度 (m)', '如 8'],
  ['standardFloorAreaM2', '标准层面积 (m2)', '如 800'],
] as const

type AddTarget = {
  parentId: string | null
  type: EngineeringObjectType
  relation: 'root' | 'sibling' | 'child'
  anchorId?: string | null
  anchorName?: string
  anchorType?: EngineeringObjectType
}

type EngineeringObjectEditDraft = {
  objectName: string
  sortOrder: string
  metadata: Record<string, unknown>
}

export interface EngineeringObjectsDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  openEventName?: string
  initialObjects?: EngineeringObject[]
  initialObjectsLoaded?: boolean
  initialObjectsLoading?: boolean
  onObjectsChange?: (objects: EngineeringObject[]) => void
}

function isAllowedObjectType(value: string): value is EngineeringObjectType {
  return ALLOWED_OBJECT_TYPES.has(value)
}

function keepAllowedObjects(objects: EngineeringObject[]): EngineeringObject[] {
  return objects.filter((object) => isAllowedObjectType(String(object.objectType)))
}

function mergeObjectsById(...groups: EngineeringObject[][]): EngineeringObject[] {
  const byId = new Map<string, EngineeringObject>()
  for (const group of groups) {
    for (const object of group) {
      byId.set(object.id, object)
    }
  }
  return [...byId.values()]
}

function serializeObjects(objects: EngineeringObject[]): string {
  return JSON.stringify(
    keepAllowedObjects(objects)
      .map((object) => ({
        id: object.id,
        projectId: object.projectId,
        objectType: object.objectType,
        objectCode: object.objectCode,
        objectName: object.objectName,
        parentId: object.parentId ?? null,
        sortOrder: Number(object.sortOrder ?? 0),
        status: object.status ?? 'active',
        metadata: object.metadata ?? {},
      }))
      .sort(compareObjects),
  )
}
function getObjectTypeLabel(type: string): string {
  return isAllowedObjectType(type) ? OBJECT_TYPE_LABELS[type] : type
}

function getPrimaryChildType(type: EngineeringObjectType): EngineeringObjectType | null {
  if (type === 'building') return 'floor'
  if (type === 'basement') return 'floor'
  if (type === 'physical_zone') return 'floor'
  if (type === 'floor') return 'functional_area'
  return VALID_CHILD_TYPES[type]?.[0] ?? null
}

function readDecompositionMode(object: EngineeringObject, objects: EngineeringObject[]): 'by_floor' | 'by_physical_zone' | null {
  const explicit = String(object.metadata?.decompositionMode ?? '')
  if (explicit === 'by_floor' || explicit === 'by_physical_zone') return explicit
  const child = objects.find((item) => (item.parentId || null) === object.id && ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES[item.objectType])
  return child ? ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES[child.objectType] ?? null : null
}

function resolveAllowedChildTypes(object: EngineeringObject, objects: EngineeringObject[]): EngineeringObjectType[] {
  const childTypes = [...(VALID_CHILD_TYPES[object.objectType] ?? [])]
  if (!DECOMPOSITION_PARENT_TYPES.has(object.objectType)) return childTypes
  const mode = readDecompositionMode(object, objects)
  if (mode === 'by_floor') return childTypes.filter((type) => type !== 'physical_zone')
  if (mode === 'by_physical_zone') return childTypes.filter((type) => type !== 'floor')
  return childTypes
}

function applyChildCompletenessMetadata(
  parent: EngineeringObject | null,
  childType: EngineeringObjectType,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const defaults = PHYSICAL_LEDGER_OBJECT_TYPES.has(childType) ? { childrenComplete: true } : {}
  return { ...defaults, ...metadata }
}

function compareObjects(left: Pick<EngineeringObject, 'id' | 'objectName' | 'sortOrder'>, right: Pick<EngineeringObject, 'id' | 'objectName' | 'sortOrder'>): number {
  return Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0)
    || String(left.objectName ?? '').localeCompare(String(right.objectName ?? ''), 'zh-Hans-CN')
    || String(left.id).localeCompare(String(right.id))
}

function readMetadataValue(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  return value === null || value === undefined ? '' : String(value)
}

function readSingleMethodVariant(metadata: Record<string, unknown>): string {
  const methodCodes = metadata.methodVariantCodes
  if (Array.isArray(methodCodes)) return String(methodCodes[0] ?? '')
  return String(metadata.methodVariantCode ?? '')
}

function writeSingleMethodVariant(metadata: Record<string, unknown>, value: string): Record<string, unknown> {
  const next = { ...metadata }
  delete next.methodVariantCode
  if (value.trim()) next.methodVariantCodes = [value.trim()]
  else delete next.methodVariantCodes
  return next
}

function defaultCoverageMetadata(type: EngineeringObjectType): Record<string, unknown> {
  if (LEDGER_OBJECT_TYPES.has(type)) {
    return {
      coverageRole: getEngineeringObjectDefaultCoverageRole(type),
      areaAccountingMode: getEngineeringObjectDefaultAreaAccountingMode(type),
    }
  }
  if (type === 'functional_area') {
    return {
      coverageRole: getEngineeringObjectDefaultCoverageRole(type),
      areaAccountingMode: getEngineeringObjectDefaultAreaAccountingMode(type),
    }
  }
  return {}
}

function withDefaultCoverageMetadata(type: EngineeringObjectType, metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...defaultCoverageMetadata(type),
    ...metadata,
  }
}

function isBuildingFunctionalUsageMissing(type: EngineeringObjectType, metadata: Record<string, unknown>): boolean {
  return type === 'building' && !String(metadata.functionalUsage ?? '').trim()
}

function writeMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
  value: string,
  type: 'text' | 'number' = 'text',
): Record<string, unknown> {
  const next = { ...metadata }
  if (type === 'number') {
    const normalized = value.trim()
    if (!normalized) delete next[key]
    else {
      const numeric = Number(normalized)
      if (Number.isFinite(numeric)) next[key] = numeric
    }
    return next
  }
  if (!value.trim()) delete next[key]
  else next[key] = value
  return next
}

export function EngineeringObjectsDialog({
  projectId,
  open,
  onOpenChange,
  openEventName,
  initialObjects = EMPTY_ENGINEERING_OBJECTS,
  initialObjectsLoaded = false,
  initialObjectsLoading = false,
  onObjectsChange,
}: EngineeringObjectsDialogProps) {
  const normalizedInitialObjects = useMemo(() => keepAllowedObjects(initialObjects), [initialObjects])
  const initialSnapshot = useMemo(() => serializeObjects(normalizedInitialObjects), [normalizedInitialObjects])
  const [objects, setObjects] = useState<EngineeringObject[]>(() => normalizedInitialObjects)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null)
  const [addName, setAddName] = useState('')
  const [addMetadataDraft, setAddMetadataDraft] = useState<Record<string, unknown>>({})
  const [editDraft, setEditDraft] = useState<Record<string, EngineeringObjectEditDraft>>({})
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advancedMetadataOpen, setAdvancedMetadataOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [internalOpen, setInternalOpen] = useState(open)
  const lastParentSnapshotRef = useRef(initialSnapshot)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const isDialogVisible = openEventName ? internalOpen : open

  const setObjectsIfChanged = useCallback((nextObjects: EngineeringObject[]) => {
    const allowedObjects = keepAllowedObjects(nextObjects)
    const nextSnapshot = serializeObjects(allowedObjects)
    setObjects((current) => (serializeObjects(current) === nextSnapshot ? current : allowedObjects))
    return { allowedObjects, nextSnapshot }
  }, [])

  const publishObjects = useCallback((nextObjects: EngineeringObject[]) => {
    const { allowedObjects, nextSnapshot } = setObjectsIfChanged(nextObjects)
    if (lastParentSnapshotRef.current !== nextSnapshot) {
      lastParentSnapshotRef.current = nextSnapshot
      onObjectsChange?.(allowedObjects)
    }
  }, [onObjectsChange, setObjectsIfChanged])

  useEffect(() => {
    if (!initialObjectsLoaded) return
    lastParentSnapshotRef.current = initialSnapshot
    setObjectsIfChanged(normalizedInitialObjects)
  }, [initialObjectsLoaded, initialSnapshot, normalizedInitialObjects, setObjectsIfChanged])

  const setDialogVisible = useCallback((nextOpen: boolean) => {
    if (openEventName) setInternalOpen(nextOpen)
    onOpenChange(nextOpen)
  }, [onOpenChange, openEventName])

  useEffect(() => {
    if (!openEventName) return
    const openDialog = () => setInternalOpen(true)
    window.addEventListener(openEventName, openDialog)
    return () => window.removeEventListener(openEventName, openDialog)
  }, [openEventName])

  const loadObjects = useCallback(async (options?: { blocking?: boolean; preserveObjects?: EngineeringObject[] }) => {
    if (!projectId) return
    const blocking = options?.blocking ?? objects.length === 0
    if (blocking) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const data = await listEngineeringObjects(projectId)
      publishObjects(mergeObjectsById(options?.preserveObjects ?? [], data))
    } catch (err) {
      setError(getApiErrorMessage(err, '加载范围树失败'))
    } finally {
      if (blocking) setLoading(false)
      else setRefreshing(false)
    }
  }, [objects.length, projectId, publishObjects])

  useEffect(() => {
    if (!isDialogVisible || !projectId || initialObjectsLoaded || initialObjectsLoading) return
    void loadObjects({ blocking: objects.length === 0 })
  }, [initialObjectsLoaded, initialObjectsLoading, isDialogVisible, loadObjects, objects.length, projectId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isDialogVisible) setDialogVisible(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDialogVisible, setDialogVisible])

  useEffect(() => {
    if (!isDialogVisible) return
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [isDialogVisible])

  const tree = useMemo(() => {
    const childrenMap = new Map<string | null, EngineeringObject[]>()
    for (const object of [...objects].sort(compareObjects)) {
      const parentId = object.parentId || null
      const siblings = childrenMap.get(parentId) ?? []
      siblings.push(object)
      childrenMap.set(parentId, siblings)
    }
    return {
      childrenMap,
      roots: childrenMap.get(null) ?? [],
    }
  }, [objects])

  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedId) ?? null,
    [objects, selectedId],
  )

  useEffect(() => {
    if (selectedId && !selectedObject) setSelectedId(null)
  }, [selectedId, selectedObject])

  const objectCounts = useMemo(() => {
    return OBJECT_TYPES.reduce<Record<EngineeringObjectType, number>>((counts, type) => {
      counts[type.key] = objects.filter((object) => object.objectType === type.key).length
      return counts
    }, { phase: 0, section: 0, building: 0, basement: 0, floor: 0, physical_zone: 0, functional_area: 0 })
  }, [objects])

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openAddPanel = (target: AddTarget) => {
    setAddTarget(target)
    setSelectedId(null)
    setAddName('')
    setAddMetadataDraft(withDefaultCoverageMetadata(target.type))
    setAdvancedMetadataOpen(false)
    setError(null)
  }

  const openRootAddPanel = (type: EngineeringObjectType) => {
    openAddPanel({ parentId: null, type, relation: 'root' })
  }

  const openChildAddPanel = (object: EngineeringObject, type: EngineeringObjectType) => {
    openAddPanel({
      parentId: object.id,
      type,
      relation: 'child',
      anchorId: object.id,
      anchorName: object.objectName,
      anchorType: object.objectType,
    })
  }

  const openSiblingAddPanel = (object: EngineeringObject) => {
    openAddPanel({
      parentId: object.parentId || null,
      type: object.objectType,
      relation: 'sibling',
      anchorId: object.id,
      anchorName: object.objectName,
      anchorType: object.objectType,
    })
  }

  const startEdit = (object: EngineeringObject) => {
    setSelectedId(object.id)
    setAddTarget(null)
    setAdvancedMetadataOpen(false)
    setEditDraft((drafts) => ({
      ...drafts,
      [object.id]: drafts[object.id] ?? {
        objectName: object.objectName,
        sortOrder: String(object.sortOrder ?? 0),
        metadata: withDefaultCoverageMetadata(object.objectType, { ...(object.metadata ?? {}) }),
      },
    }))
  }

  const handleAdd = async () => {
    const name = addName.trim()
    if (!addTarget || !name) return
    if (isBuildingFunctionalUsageMissing(addTarget.type, addMetadataDraft)) {
      setError('请先为单体选择功能用途')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const siblingCount = objects.filter((object) => (object.parentId || null) === (addTarget.parentId || null)).length
      const parentObject = addTarget.parentId ? objects.find((object) => object.id === addTarget.parentId) ?? null : null
      const created = await createEngineeringObject({
        projectId,
        objectType: addTarget.type,
        objectName: name,
        parentId: addTarget.parentId,
        sortOrder: siblingCount + 1,
        metadata: withDefaultCoverageMetadata(
          addTarget.type,
          applyChildCompletenessMetadata(parentObject, addTarget.type, addMetadataDraft),
        ),
      })
      setAddName('')
      setAddTarget(null)
      setAddMetadataDraft({})
      setSelectedId(created.id)
      publishObjects(mergeObjectsById(objects, [created]))
      await loadObjects({ blocking: false, preserveObjects: [created] })
    } catch (err) {
      setError(getApiErrorMessage(err, '新增范围节点失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedObject) return
    const draft = editDraft[selectedObject.id]
    if (!draft) return
    const objectName = draft.objectName.trim()
    if (!objectName) return
    if (isBuildingFunctionalUsageMissing(selectedObject.objectType, draft.metadata)) {
      setError('请先为单体选择功能用途')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateEngineeringObject(selectedObject.id, {
        objectName,
        sortOrder: Number(draft.sortOrder) || undefined,
        metadata: withDefaultCoverageMetadata(selectedObject.objectType, draft.metadata),
      })
      await loadObjects({ blocking: false })
    } catch (err) {
      setError(getApiErrorMessage(err, '保存范围节点失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (object: EngineeringObject) => {
    setSaving(true)
    setError(null)
    try {
      await deleteEngineeringObject(object.id)
      if (selectedId === object.id) setSelectedId(null)
      await loadObjects({ blocking: false })
    } catch (err) {
      setError(getApiErrorMessage(err, '停用范围节点失败'))
    } finally {
      setSaving(false)
    }
  }

  const renderMetadataTextInput = (
    metadata: Record<string, unknown>,
    key: string,
    label: string,
    onChange: (next: Record<string, unknown>) => void,
    options?: { type?: 'text' | 'number'; placeholder?: string },
  ) => (
    <label className="grid gap-1 text-xs text-slate-600">
      <span>{label}</span>
      <Input
        type={options?.type ?? 'text'}
        value={readMetadataValue(metadata, key)}
        onChange={(event) => onChange(writeMetadataValue(metadata, key, event.target.value, options?.type))}
        placeholder={options?.placeholder}
        className="h-8 bg-white text-xs tabular-nums"
      />
    </label>
  )

  const renderMetadataSelect = (
    metadata: Record<string, unknown>,
    key: string,
    label: string,
    choices: readonly (string | { id: string; label: string })[],
    onChange: (next: Record<string, unknown>) => void,
    placeholder = '未设置',
  ) => (
    <label className="grid gap-1 text-xs text-slate-600">
      <span>{label}</span>
      <select
        value={readMetadataValue(metadata, key)}
        onChange={(event) => onChange(writeMetadataValue(metadata, key, event.target.value))}
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <option value="">{placeholder}</option>
        {choices.map((choice) => {
          const value = typeof choice === 'string' ? choice : choice.id
          const label = typeof choice === 'string' ? choice : choice.label
          return <option key={value} value={value}>{label}</option>
        })}
      </select>
    </label>
  )

  const renderMethodVariantSelect = (
    metadata: Record<string, unknown>,
    onChange: (next: Record<string, unknown>) => void,
  ) => (
    <label className="grid gap-1 text-xs text-slate-600">
      <span>工法（可覆盖项目默认）</span>
      <select
        value={readSingleMethodVariant(metadata)}
        onChange={(event) => onChange(writeSingleMethodVariant(metadata, event.target.value))}
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <option value="">继承项目默认</option>
        {METHOD_VARIANTS.map((choice) => (
          <option key={choice.id} value={choice.id}>{choice.label}</option>
        ))}
      </select>
    </label>
  )

  const renderLedgerMetadataEditor = (
    objectType: EngineeringObjectType,
    metadata: Record<string, unknown>,
    onChange: (next: Record<string, unknown>) => void,
  ) => {
    if (!LEDGER_OBJECT_TYPES.has(objectType)) return null
    const resolvedMetadata = withDefaultCoverageMetadata(objectType, metadata)
    return (
      <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-2 sm:grid-cols-2">
        {renderMetadataSelect(resolvedMetadata, 'areaAccountingMode', '范围核算方式', AREA_ACCOUNTING_OPTIONS, onChange)}
        {renderMetadataSelect(resolvedMetadata, 'coverageRole', '覆盖角色', COVERAGE_ROLE_OPTIONS, onChange)}
      </div>
    )
  }

  const renderAdvancedToggle = () => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full justify-between bg-white text-xs"
      aria-expanded={advancedMetadataOpen}
      aria-label="高级属性"
      onClick={() => setAdvancedMetadataOpen((value) => !value)}
    >
      高级属性
      <span className="text-slate-400">{advancedMetadataOpen ? '收起' : '展开'}</span>
    </Button>
  )

  const renderScopeMetadataEditor = (
    objectType: EngineeringObjectType,
    metadata: Record<string, unknown>,
    onChange: (next: Record<string, unknown>) => void,
  ) => {
    if (objectType === 'building') {
      return (
        <div className="space-y-3">
          {renderLedgerMetadataEditor(objectType, metadata, onChange)}
          <div className="grid gap-2">
            {renderMetadataSelect(metadata, 'functionalUsage', '功能用途（必填）', FUNCTIONAL_USAGES, onChange, '选择用途')}
          </div>
          {renderAdvancedToggle()}
          {advancedMetadataOpen ? (
            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {BUILDING_NUMBER_FIELDS.map(([key, label, placeholder]) => (
                  <div key={key}>
                    {renderMetadataTextInput(metadata, key, label, onChange, { type: 'number', placeholder })}
                  </div>
                ))}
              </div>
              {renderMethodVariantSelect(metadata, onChange)}
            </div>
          ) : null}
        </div>
      )
    }

    if (objectType === 'floor') {
      return (
        <div className="space-y-3">
          {renderLedgerMetadataEditor(objectType, metadata, onChange)}
          {renderAdvancedToggle()}
          {advancedMetadataOpen ? (
            <div className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2">
              {renderMetadataTextInput(metadata, 'floorOrder', '楼层序号', onChange, { type: 'number', placeholder: '如 5' })}
              {renderMetadataTextInput(metadata, 'elevationM', '楼层标高 (m)', onChange, { type: 'number', placeholder: '如 15' })}
            </div>
          ) : null}
        </div>
      )
    }

    if (objectType === 'basement') {
      return (
        <div className="space-y-3">
          {renderLedgerMetadataEditor(objectType, metadata, onChange)}
          <div className="grid gap-2 sm:grid-cols-2">
            {renderMetadataTextInput(metadata, 'basementLevelCount', '地下层数', onChange, { type: 'number', placeholder: '如 2' })}
            {renderMetadataTextInput(metadata, 'basementAreaM2', '地下室面积 (m2)', onChange, { type: 'number', placeholder: '如 32000' })}
            {renderMetadataTextInput(metadata, 'foundationDepthM', '基坑深度 (m)', onChange, { type: 'number', placeholder: '如 9' })}
            {renderMetadataTextInput(metadata, 'civilDefenseAreaM2', '人防面积 (m2)', onChange, { type: 'number', placeholder: '如 8000' })}
          </div>
        </div>
      )
    }

    if (objectType === 'physical_zone') {
      return (
        <div className="space-y-3">
          {renderLedgerMetadataEditor(objectType, metadata, onChange)}
          {renderMetadataSelect(metadata, 'physicalCategory', '区域类型', PHYSICAL_ZONE_TYPES, onChange, '选择类型')}
          <div className="grid gap-2 sm:grid-cols-2">
            {renderMetadataTextInput(metadata, 'areaM2', '区域面积 (m2)', onChange, { type: 'number', placeholder: '如 12000' })}
            {renderMetadataTextInput(metadata, 'foundationDepthM', '基坑深度 (m)', onChange, { type: 'number', placeholder: '如 9' })}
          </div>
        </div>
      )
    }

    if (objectType === 'functional_area') {
      return (
        <div className="space-y-3">
          {renderLedgerMetadataEditor(objectType, metadata, onChange)}
          {renderAdvancedToggle()}
          {advancedMetadataOpen ? (
            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              {renderMetadataSelect(metadata, 'functionalCategory', '功能分类', FUNCTIONAL_CATEGORIES, onChange, '选择分类')}
            </div>
          ) : null}
        </div>
      )
    }

    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        {OBJECT_TYPE_LABELS[objectType]}只维护名称和层级关系；专业信息由工序模板、标准工项或专项类型承载。
      </div>
    )
  }

  const renderTreeNode = (object: EngineeringObject, depth: number): React.ReactNode => {
    const children = tree.childrenMap.get(object.id) ?? []
    const hasChildren = children.length > 0
    const isCollapsed = collapsed.has(object.id)
    const childTypes = resolveAllowedChildTypes(object, objects)
    const primaryChildType = getPrimaryChildType(object.objectType)

    return (
      <div key={object.id} className="select-none">
        <div
          data-testid={`scope-node-${object.objectType}-${object.objectName}`}
          className={cn(
            'group flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2 transition-colors',
            selectedId === object.id ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-slate-50',
            object.status !== 'active' && 'opacity-60',
          )}
          style={{ paddingLeft: depth * 20 + 8 }}
          onClick={() => startEdit(object)}
        >
          <Button unstyled
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggleCollapse(object.id)
            }}
            className="rounded p-0.5 outline-none transition-colors hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={`${isCollapsed ? '展开' : '收起'}${object.objectName}`}
          >
            {hasChildren ? (
              isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <span className="block w-3.5" />
            )}
          </Button>
          <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', OBJECT_TYPE_COLORS[object.objectType])}>
            {getObjectTypeLabel(object.objectType)}
          </span>
          <span className="ml-1 truncate text-sm font-medium text-slate-900">{object.objectName}</span>
          <span className="hidden text-xs text-slate-400 sm:inline">{object.objectCode}</span>
          <span className="flex-1" />
          <div className="hidden items-center gap-1 group-hover:flex group-focus-within:flex">
            {primaryChildType ? (
              <Button unstyled
                type="button"
                data-testid={`scope-node-add-child-${object.id}`}
                onClick={(event) => {
                  event.stopPropagation()
                  openChildAddPanel(object, primaryChildType)
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 outline-none transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
                title={`在 ${object.objectName} 下新增${OBJECT_TYPE_LABELS[primaryChildType]}`}
              >
                <Plus className="h-3 w-3 text-slate-400" />
                下级
              </Button>
            ) : null}
            {object.status === 'active' ? (
              <Button unstyled
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  void handleDeactivate(object)
                }}
                className="rounded p-1 outline-none transition-colors hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-blue-500"
                title="停用节点"
              >
                <Trash2 className="h-3 w-3 text-rose-500" />
              </Button>
            ) : null}
          </div>
        </div>
        {hasChildren && !isCollapsed ? children.map((child) => renderTreeNode(child, depth + 1)) : null}
      </div>
    )
  }

  const renderSidePanel = () => {
    if (addTarget) {
      const targetLabel = OBJECT_TYPE_LABELS[addTarget.type]
      const addTitle = addTarget.relation === 'sibling' && addTarget.anchorName
        ? `与 ${addTarget.anchorName} 同级新增${targetLabel}`
        : addTarget.relation === 'child' && addTarget.anchorName
          ? `在 ${addTarget.anchorName} 下新增${targetLabel}`
          : `在项目根下新增${targetLabel}`
      const landingHint = addTarget.relation === 'sibling' && addTarget.anchorName
        ? `新节点会与 ${addTarget.anchorName} 保持同一层级。`
        : addTarget.relation === 'child' && addTarget.anchorName
          ? `新节点会作为 ${addTarget.anchorName} 的下级范围。`
          : '新节点会直接添加到项目根下。'
      return (
        <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{addTitle}</h3>
            <p className="mt-1 text-xs text-slate-500">{landingHint}</p>
          </div>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>名称</span>
            <Input
              value={addName}
              data-testid="scope-add-name"
              onChange={(event) => setAddName(event.target.value)}
              placeholder={`新增${targetLabel}名称`}
              className="h-9 bg-white"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleAdd()
              }}
            />
          </label>
          <div className="rounded-xl border border-blue-100 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-slate-700">节点属性</div>
            {renderScopeMetadataEditor(addTarget.type, addMetadataDraft, setAddMetadataDraft)}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddTarget(null)} disabled={saving}>取消</Button>
            <Button
              type="button"
              size="sm"
              data-testid="scope-add-submit"
              onClick={() => void handleAdd()}
              disabled={saving || !addName.trim()}
              loading={saving}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              新增节点
            </Button>
          </div>
        </div>
      )
    }

    if (selectedObject) {
      const draft = editDraft[selectedObject.id] ?? {
        objectName: selectedObject.objectName,
        sortOrder: String(selectedObject.sortOrder ?? 0),
        metadata: withDefaultCoverageMetadata(selectedObject.objectType, { ...(selectedObject.metadata ?? {}) }),
      }
      const childTypes = resolveAllowedChildTypes(selectedObject, objects)
      const primaryChildType = getPrimaryChildType(selectedObject.objectType)
      const sortedChildTypes = primaryChildType
        ? [primaryChildType, ...childTypes.filter((type) => type !== primaryChildType)]
        : childTypes
      return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">节点属性</h3>
            <p className="mt-1 text-xs text-slate-500">{OBJECT_TYPE_LABELS[selectedObject.objectType]} / {selectedObject.objectCode}</p>
          </div>
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">新增同级</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="scope-add-sibling"
                className="w-full justify-start bg-white text-xs"
                onClick={() => openSiblingAddPanel(selectedObject)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                新增同级{OBJECT_TYPE_LABELS[selectedObject.objectType]}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">新增下级</div>
              {sortedChildTypes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {sortedChildTypes.map((childType) => (
                    <Button
                      key={childType}
                      type="button"
                      variant={childType === primaryChildType ? 'default' : 'outline'}
                      size="sm"
                      data-testid={`scope-add-child-${childType}`}
                      className="justify-start text-xs"
                      onClick={() => openChildAddPanel(selectedObject, childType)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      新增下级{OBJECT_TYPE_LABELS[childType]}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                  {OBJECT_TYPE_LABELS[selectedObject.objectType]}暂无下级类型，可使用新增同级继续扩展。
                </div>
              )}
            </div>
          </div>
          <label className="grid gap-1 text-xs text-slate-600">
            <span>名称</span>
            <Input
              value={draft.objectName}
              data-testid="scope-edit-name"
              onChange={(event) => setEditDraft((drafts) => ({
                ...drafts,
                [selectedObject.id]: { ...draft, objectName: event.target.value },
              }))}
              className="h-9 bg-white"
            />
          </label>
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
            <div className="mb-2 text-xs font-medium text-slate-700">节点属性</div>
            {renderScopeMetadataEditor(selectedObject.objectType, draft.metadata, (metadata) => {
              setEditDraft((drafts) => ({
                ...drafts,
                [selectedObject.id]: { ...draft, metadata },
              }))
            })}
          </div>
          <Button type="button" size="sm" data-testid="scope-edit-submit" className="w-full" onClick={() => void handleUpdate()} disabled={saving || !draft.objectName.trim()} loading={saving}>
            <Save className="mr-1 h-3.5 w-3.5" />
            保存节点
          </Button>
        </div>
      )
    }

    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p className="text-sm font-medium text-slate-600">选择左侧节点编辑属性</p>
        <p className="mt-1 text-xs text-slate-400">项目根只作为视觉容器，不会写入普通工程对象。</p>
      </div>
    )
  }

  if (!isDialogVisible) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
        aria-hidden
        onClick={() => setDialogVisible(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="engineering-objects-title"
        className="fixed left-[50%] top-[50%] z-50 grid max-h-[90vh] w-[92%] max-w-5xl translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-2xl border bg-background p-6 shadow-[var(--el-4)]"
        data-testid="gantt-engineering-objects-dialog"
      >
        <Button unstyled
          ref={closeButtonRef}
          type="button"
          aria-label="关闭"
          className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => setDialogVisible(false)}
        >
          <X className="h-4 w-4" />
        </Button>
        <DialogHeader>
          <h2 id="engineering-objects-title" className="text-lg font-semibold leading-none tracking-tight">工程对象树</h2>
          <p className="sr-only">维护项目的分期、标段、单体、楼层和区域工程对象树</p>
          <div className="text-xs text-muted-foreground">按项目根组织分期、标段、单体、楼层、区域 5 类工程对象。</div>
        </DialogHeader>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)]">
          <section className="min-h-[420px] rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-slate-100 pb-3">
              <span className="mr-2 text-xs text-slate-400">项目根：</span>
              {ENGINEERING_OBJECT_ROOT_TYPES.map((type) => (
                <Button unstyled
                  key={type}
                  type="button"
                  data-testid={`scope-root-add-${type}`}
                  onClick={() => openRootAddPanel(type)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Plus className="h-3 w-3" />
                  {OBJECT_TYPE_LABELS[type]}
                </Button>
              ))}
              <div className="ml-auto hidden items-center gap-2 text-xs text-slate-400 md:flex">
                {OBJECT_TYPES.map((type) => (
                  <span key={type.key}>{type.label} {objectCounts[type.key]}</span>
                ))}
              </div>
            </div>

            <div data-testid="scope-root" className="rounded-lg border border-dashed border-transparent px-2 py-2">
              <div className="mb-1 flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-2">
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700">项目根</span>
                <span className="text-sm font-medium text-slate-900">项目根</span>
              </div>
              {(loading || initialObjectsLoading) && objects.length === 0 ? (
                <div className="flex h-32 items-center justify-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在加载范围树...
                </div>
              ) : tree.roots.length > 0 ? (
                tree.roots.map((object) => renderTreeNode(object, 1))
              ) : (
                <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                  从项目根添加分期、标段、单体或区域。
                </div>
              )}
            </div>
          </section>

          <aside className="lg:sticky lg:top-4 lg:self-start">
            {renderSidePanel()}
          </aside>
        </div>

        <DialogFooter className="sticky bottom-0 z-10 -mx-6 -mb-6 gap-2 border-t border-slate-100 bg-background px-6 py-4">
          {refreshing ? (
            <span className="mr-auto inline-flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在同步最新范围树
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            data-testid="scope-refresh"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void loadObjects({ blocking: objects.length === 0 })
            }}
            disabled={loading || refreshing || saving}
          >
            <RefreshCw className="mr-2 h-4 w-4" />刷新
          </Button>
          <Button type="button" variant="outline" onClick={() => setDialogVisible(false)} disabled={saving}>关闭</Button>
        </DialogFooter>
      </div>
    </>
  )
}
