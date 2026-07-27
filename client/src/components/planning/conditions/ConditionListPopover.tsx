import {
  InlineConditionList,
  type ConditionItem,
} from '@/components/planning/PlanningInlinePopover'

interface ConditionListPopoverProps {
  conditions: ConditionItem[]
  onToggleSatisfied?: (conditionId: string) => void
  onAddCondition?: () => void
  onOpenDrawer?: () => void
  className?: string
}

export function ConditionListPopover(props: ConditionListPopoverProps) {
  return (
    <div data-testid="condition-list-popover">
      <InlineConditionList {...props} />
    </div>
  )
}

export default ConditionListPopover
