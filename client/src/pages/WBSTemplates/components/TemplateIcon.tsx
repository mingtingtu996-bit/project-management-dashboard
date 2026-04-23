import { StatusBadge } from '@/components/ui/status-badge'
import { zhCN } from '@/i18n/zh-CN'
import { getTypeColor } from '../utils'
import { IconHome, IconBuilding, IconGrid, IconLandmark } from './WbsIcons'

export function TemplateIcon({ type, className = 'w-5 h-5' }: { type?: string; className?: string }) {
  const color = getTypeColor(type)
  if (type === zhCN.wbsTemplates.commercial) return <IconBuilding className={`${className} ${color.text}`} />
  if (type === zhCN.wbsTemplates.industrial) return <IconGrid className={`${className} ${color.text}`} />
  if (type === zhCN.wbsTemplates.publicBuilding) return <IconLandmark className={`${className} ${color.text}`} />
  return <IconHome className={`${className} ${color.text}`} />
}

export function TemplateStatusBadge({ status }: { status?: 'draft' | 'published' | 'disabled' }) {
  return <StatusBadge status={status ?? 'published'} fallbackLabel="已发布" className="text-xs" />
}
