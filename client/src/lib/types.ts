// @/lib/types — 兼容层，重导出 supabase 中的类型
export type {
  User,
  Project,
  Task,
  Risk,
  Milestone,
  Invitation,
  ProjectMember,
  TaskCondition,
  TaskObstacle,
  TaskDelayHistory,
  AcceptancePlan,
  WbsTemplate,
  PreMilestone,
} from '@/lib/supabase'
