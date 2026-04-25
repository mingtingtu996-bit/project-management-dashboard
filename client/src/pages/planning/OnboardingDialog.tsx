export interface OnboardingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLearnMore?: () => void
  projectName?: string
}

export default function OnboardingDialog({
  open: _open,
  onOpenChange: _onOpenChange,
  onLearnMore: _onLearnMore,
  projectName: _projectName,
}: OnboardingDialogProps) {
  void _open
  void _onOpenChange
  void _onLearnMore
  void _projectName
  return null
}
