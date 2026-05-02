import type { ComponentProps } from 'react'
import type { LucideIcon as LucideIconType } from 'lucide-react'

type LucideIconProps = ComponentProps<LucideIconType> & {
  icon: LucideIconType
}

export function LucideIcon({ icon: Icon, strokeWidth = 1.5, ...props }: LucideIconProps) {
  return <Icon strokeWidth={strokeWidth} {...props} />
}
