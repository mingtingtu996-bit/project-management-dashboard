import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

interface DisabledReasonTooltipProps {
  reason?: ReactNode
  children: ReactElement
  className?: string
}

export function DisabledReasonTooltip({ reason, children, className }: DisabledReasonTooltipProps) {
  const descriptionId = useId()

  if (!reason) return children

  const describedChild = isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': descriptionId } as Record<string, unknown>)
    : children

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex cursor-not-allowed', className)}>
          {describedChild}
          <span id={descriptionId} className="sr-only">
            {typeof reason === 'string' ? reason : '该操作当前不可用'}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px]">{reason}</TooltipContent>
    </Tooltip>
  )
}
