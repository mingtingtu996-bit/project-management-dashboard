// Supabase 服务层
// 封装所有数据库操作

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Project, Task, Risk, Milestone, ProjectMember, Invitation } from '../types/db'

export class SupabaseService {
  private client: SupabaseClient
  private tableNames = {
    projects: 'projects',
    tasks: 'tasks',
    risks: 'risks',
    milestones: 'milestones',
    projectMembers: 'project_members',
    invitations: 'project_invitations'
  }

  constructor() {
    const url = process.env.SUPABASE_URL || ''
    const key = process.env.SUPABASE_ANON_KEY || ''
    
    if (!url || !key) {
      throw new Error('Supabase configuration missing')
    }
    
    this.client = createClient(url, key)
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    const { data, error } = await this.client
      .from(this.tableNames.projects)
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data || []
  }

  async getProject(id: string): Promise<Project | null> {
    const { data, error } = await this.client
      .from(this.tableNames.projects)
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  }

  async createProject(project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> {
    const { data, error } = await this.client
      .from(this.tableNames.projects)
      .insert(project)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async updateProject(id: string, updates: Partial<Project>, expectedVersion: number): Promise<Project | null> {
    // 乐观锁检查
    const { data: existing } = await this.client
      .from(this.tableNames.projects)
      .select('version')
      .eq('id', id)
      .single()
    
    if (!existing || existing.version !== expectedVersion) {
      throw new Error('VERSION_MISMATCH')
    }

    const { data, error } = await this.client
      .from(this.tableNames.projects)
      .update({ ...updates, version: expectedVersion + 1 })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async deleteProject(id: string): Promise<void> {
    const { error } = await this.client
      .from(this.tableNames.projects)
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }

  // Tasks
  async getTasks(projectId?: string): Promise<Task[]> {
    let query = this.client.from(this.tableNames.tasks).select('*')
    
    if (projectId) {
      query = query.eq('project_id', projectId)
    }
    
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }

  async createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    const { data, error } = await this.client
      .from(this.tableNames.tasks)
      .insert(task)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async updateTask(id: string, updates: Partial<Task>, expectedVersion: number): Promise<Task | null> {
    const { data: existing } = await this.client
      .from(this.tableNames.tasks)
      .select('version')
      .eq('id', id)
      .single()
    
    if (!existing || existing.version !== expectedVersion) {
      throw new Error('VERSION_MISMATCH')
    }

    const { data, error } = await this.client
      .from(this.tableNames.tasks)
      .update({ ...updates, version: expectedVersion + 1 })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async deleteTask(id: string): Promise<void> {
    const { error } = await this.client
      .from(this.tableNames.tasks)
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }

  // Risks
  async getRisks(projectId?: string): Promise<Risk[]> {
    let query = this.client.from(this.tableNames.risks).select('*')
    
    if (projectId) {
      query = query.eq('project_id', projectId)
    }
    
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }

  async createRisk(risk: Omit<Risk, 'id' | 'created_at' | 'updated_at'>): Promise<Risk> {
    const { data, error } = await this.client
      .from(this.tableNames.risks)
      .insert(risk)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async updateRisk(id: string, updates: Partial<Risk>, expectedVersion: number): Promise<Risk | null> {
    const { data: existing } = await this.client
      .from(this.tableNames.risks)
      .select('version')
      .eq('id', id)
      .single()
    
    if (!existing || existing.version !== expectedVersion) {
      throw new Error('VERSION_MISMATCH')
    }

    const { data, error } = await this.client
      .from(this.tableNames.risks)
      .update({ ...updates, version: expectedVersion + 1 })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async deleteRisk(id: string): Promise<void> {
    const { error } = await this.client
      .from(this.tableNames.risks)
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }

  // Milestones
  async getMilestones(projectId?: string): Promise<Milestone[]> {
    let query = this.client.from(this.tableNames.milestones).select('*')
    
    if (projectId) {
      query = query.eq('project_id', projectId)
    }
    
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }

  async createMilestone(milestone: Omit<Milestone, 'id' | 'created_at' | 'updated_at'>): Promise<Milestone> {
    const { data, error } = await this.client
      .from(this.tableNames.milestones)
      .insert(milestone)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async updateMilestone(id: string, updates: Partial<Milestone>, expectedVersion: number): Promise<Milestone | null> {
    const { data: existing } = await this.client
      .from(this.tableNames.milestones)
      .select('version')
      .eq('id', id)
      .single()
    
    if (!existing || existing.version !== expectedVersion) {
      throw new Error('VERSION_MISMATCH')
    }

    const { data, error } = await this.client
      .from(this.tableNames.milestones)
      .update({ ...updates, version: expectedVersion + 1 })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async deleteMilestone(id: string): Promise<void> {
    const { error } = await this.client
      .from(this.tableNames.milestones)
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }

  // Project Members
  async getMembers(projectId?: string): Promise<ProjectMember[]> {
    let query = this.client.from(this.tableNames.projectMembers).select('*')
    
    if (projectId) {
      query = query.eq('project_id', projectId)
    }
    
    const { data, error } = await query.order('joined_at', { ascending: false })
    if (error) throw error
    return data || []
  }

  async createMember(member: Omit<ProjectMember, 'id' | 'joined_at'>): Promise<ProjectMember> {
    const { data, error } = await this.client
      .from(this.tableNames.projectMembers)
      .insert(member)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async updateMember(id: string, updates: Partial<ProjectMember>): Promise<ProjectMember | null> {
    const { data, error } = await this.client
      .from(this.tableNames.projectMembers)
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async deleteMember(id: string): Promise<void> {
    const { error } = await this.client
      .from(this.tableNames.projectMembers)
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }

  // Invitations
  async getInvitations(projectId?: string): Promise<Invitation[]> {
    let query = this.client.from(this.tableNames.invitations).select('*')
    
    if (projectId) {
      query = query.eq('project_id', projectId)
    }
    
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }

  async createInvitation(invitation: Omit<Invitation, 'id' | 'created_at'>): Promise<Invitation> {
    const { data, error } = await this.client
      .from(this.tableNames.invitations)
      .insert(invitation)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async updateInvitation(id: string, updates: Partial<Invitation>): Promise<Invitation | null> {
    const { data, error } = await this.client
      .from(this.tableNames.invitations)
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  async deleteInvitation(id: string): Promise<void> {
    const { error } = await this.client
      .from(this.tableNames.invitations)
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }

  async validateInvitation(code: string): Promise<Invitation | null> {
    const { data, error } = await this.client
      .from(this.tableNames.invitations)
      .select('*')
      .eq('code', code)
      .eq('status', 'active')
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    
    // 检查是否过期
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return null
    }
    
    return data
  }
}
