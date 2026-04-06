// supabaseService.ts — 向后兼容层，所有实现均在 dbService.ts（Supabase PostgreSQL）

export {
  SupabaseService,
  getProjects, getProject, createProject, updateProject, deleteProject,
  getTasks, getTask, createTask, updateTask, deleteTask,
  getRisks, getRisk, createRisk, updateRisk, deleteRisk,
  getMilestones, getMilestone, createMilestone, updateMilestone, deleteMilestone,
  getMembers, createMember, updateMember, deleteMember,
  getInvitations, createInvitation, updateInvitation, deleteInvitation, validateInvitation,
  executeSQL, executeSQLOne,
} from './dbService.js'
