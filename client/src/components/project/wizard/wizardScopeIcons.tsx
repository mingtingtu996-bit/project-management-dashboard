import {
  AlertTriangle,
  BadgePlus,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleHelp,
  ClipboardCheck,
  Clock,
  Copy,
  Factory,
  FileText,
  FilePlus,
  Gauge,
  GraduationCap,
  Hotel,
  Info,
  LayoutTemplate,
  Layers3,
  ListChecks,
  Loader2,
  Lock,
  MapPin,
  MapPinned,
  ParkingSquare,
  PackageCheck,
  Pencil,
  PlusCircle,
  Search,
  Server,
  Save,
  School,
  Sparkles,
  Stethoscope,
  TrainTrack,
  Trash2,
  Trees,
  Trophy,
  TramFront,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

type ScopeIconKey =
  | 'building'
  | 'basement'
  | 'physical_zone'
  | 'floor'
  | 'hospital'
  | 'hotel'
  | 'school'
  | 'industrial'
  | 'general_civil'
  | 'data_center'
  | 'transportation_hub'
  | 'sports_culture'
  | 'tod_upper_cover'
  | 'renovation'
  | 'modular_building'
  | 'custom'
  | 'configured'
  | 'pending'
  | 'expand'
  | 'collapse'
  | 'add_scope'
  | 'delete_scope'
  | 'edit_scope'
  | 'floor_batch'
  | 'duplicate_scope'
  | 'entry_blank'
  | 'entry_template'
  | 'entry_copy'
  | 'wizard_step_identity'
  | 'wizard_step_business'
  | 'wizard_step_scope'
  | 'wizard_step_features'
  | 'wizard_step_starting_line'
  | 'wizard_step_confirmation'
  | 'wizard_complete'
  | 'feature_info'
  | 'feature_required'
  | 'feature_search'
  | 'starting_line'
  | 'generation'
  | 'generating'
  | 'draft'
  | 'save_draft'
  | 'autosave_error'
  | 'wizard_help'
  | 'recommendation_draft'
  | 'profile_summary'
  | 'schedule_target'
  | 'warning'

const WIZARD_SCOPE_ICON_MAP: Record<ScopeIconKey, LucideIcon> = {
  building: Building2,
  basement: ParkingSquare,
  physical_zone: Trees,
  floor: Layers3,
  hospital: Stethoscope,
  hotel: Hotel,
  school: School,
  industrial: Factory,
  general_civil: Building2,
  data_center: Server,
  transportation_hub: TrainTrack,
  sports_culture: Trophy,
  tod_upper_cover: TramFront,
  renovation: Wrench,
  modular_building: Boxes,
  custom: PlusCircle,
  configured: CheckCircle2,
  pending: Circle,
  expand: ChevronRight,
  collapse: ChevronDown,
  add_scope: PlusCircle,
  delete_scope: Trash2,
  edit_scope: Pencil,
  floor_batch: Layers3,
  duplicate_scope: Copy,
  entry_blank: FilePlus,
  entry_template: LayoutTemplate,
  entry_copy: Copy,
  wizard_step_identity: CalendarDays,
  wizard_step_business: Building2,
  wizard_step_scope: MapPinned,
  wizard_step_features: ListChecks,
  wizard_step_starting_line: ClipboardCheck,
  wizard_step_confirmation: PackageCheck,
  wizard_complete: CheckCircle2,
  feature_info: Info,
  feature_required: Lock,
  feature_search: Search,
  starting_line: ClipboardCheck,
  generation: Sparkles,
  generating: Loader2,
  draft: FileText,
  save_draft: Save,
  autosave_error: AlertTriangle,
  wizard_help: CircleHelp,
  recommendation_draft: Sparkles,
  profile_summary: PackageCheck,
  schedule_target: Clock,
  warning: AlertTriangle,
}

export function getWizardScopeIcon(key: string): LucideIcon {
  return WIZARD_SCOPE_ICON_MAP[key as ScopeIconKey] ?? Warehouse
}

export const wizardIconClassName = 'h-4 w-4 text-blue-600'

export function wizardIconTestId(key: string): string {
  return `wizard-icon-${key.replace(/_/g, '-')}`
}
