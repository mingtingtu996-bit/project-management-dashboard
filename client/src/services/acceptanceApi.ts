/**
 * 验收计划 API 服务 - V2 (Express API 版)
 *
 * 已从 Supabase 直接查询迁移为通过 Express API 调用。
 * 后端路由: server/src/routes/acceptance-plans.ts
 *
 * - GET  /api/acceptance-plans?projectId=xxx
 * - GET  /api/acceptance-plans/:id
 * - POST /api/acceptance-plans
 * - PUT  /api/acceptance-plans/:id
 * - DELETE /api/acceptance-plans/:id
 */

import type {
  AcceptancePlan,
  AcceptanceStatus,
  AcceptanceType
} from '@/types/acceptance';
import { authFetch } from '../lib/apiClient';

const API_BASE = '/api';

/** 内部：解析后端响应，失败时抛错 */
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  return authFetch<T>(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    }
  });
}

export const acceptanceApi = {
  /**
   * 获取项目的验收计划列表
   */
  async getPlans(projectId: string): Promise<AcceptancePlan[]> {
    const data = await apiFetch<any[]>(
      `${API_BASE}/acceptance-plans?projectId=${encodeURIComponent(projectId)}`
    );

    return (data || []).map(mapDbToPlan);
  },

  /**
   * 获取单个验收计划
   */
  async getPlan(planId: string): Promise<AcceptancePlan> {
    const data = await apiFetch<any>(
      `${API_BASE}/acceptance-plans/${encodeURIComponent(planId)}`
    );
    return mapDbToPlan(data);
  },

  /**
   * 创建验收计划
   */
  async createPlan(plan: Partial<AcceptancePlan>): Promise<AcceptancePlan> {
    const body: Record<string, any> = {
      project_id: plan.project_id,
      task_id: plan.milestone_id,          // 后端字段名
      type_id: plan.type_id,               // 修复：直接发送 type_id，触发后端新模型校验
      acceptance_name: plan.type_name,
      type_color: plan.type_color,
      name: plan.name,
      description: plan.description,
      planned_date: plan.planned_date,
      status: plan.status || 'pending',  // F-8修复：统一发送英文状态值
      phase: plan.phase,
      phase_order: plan.phase_order,
      responsible_user_id: plan.responsible_user_id,
      created_by: plan.created_by
    };

    // 去掉 undefined 字段，同时显式删除旧模型字段 acceptance_type（防止前端对象污染）
    Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
    delete body['acceptance_type']; // 强制走新模型路径，后端按 type_id 校验

    const data = await apiFetch<any>(`${API_BASE}/acceptance-plans`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return mapDbToPlan(data);
  },

  /**
   * 更新验收计划
   */
  async updatePlan(planId: string, updates: Partial<AcceptancePlan>): Promise<AcceptancePlan> {
    const body: Record<string, any> = {};

    if (updates.name !== undefined) body.name = updates.name;
    if (updates.description !== undefined) body.description = updates.description;
    if (updates.planned_date !== undefined) body.planned_date = updates.planned_date;
    if (updates.actual_date !== undefined) body.actual_date = updates.actual_date;
    if (updates.status !== undefined) body.status = updates.status;
    if (updates.phase !== undefined) body.phase = updates.phase;
    if (updates.phase_order !== undefined) body.phase_order = updates.phase_order;
    if (updates.responsible_user_id !== undefined) body.responsible_user_id = updates.responsible_user_id;
    if (updates.documents !== undefined) body.documents = JSON.stringify(updates.documents);

    const data = await apiFetch<any>(
      `${API_BASE}/acceptance-plans/${encodeURIComponent(planId)}`,
      { method: 'PUT', body: JSON.stringify(body) }
    );
    return mapDbToPlan(data);
  },

  /**
   * 更新验收状态（便捷方法）
   */
  async updateStatus(planId: string, status: AcceptanceStatus): Promise<void> {
    const body: Record<string, any> = { status };
    if (status === 'passed') {
      body.actual_date = new Date().toISOString().split('T')[0];
    }
    await apiFetch<any>(
      `${API_BASE}/acceptance-plans/${encodeURIComponent(planId)}`,
      { method: 'PUT', body: JSON.stringify(body) }
    );
  },

  /**
   * 删除验收计划
   */
  async deletePlan(planId: string): Promise<void> {
    await apiFetch<any>(
      `${API_BASE}/acceptance-plans/${encodeURIComponent(planId)}`,
      { method: 'DELETE' }
    );
  },

  // ─── 以下为兼容性方法 (acceptance_types 表可选) ──────────────────────────

  /**
   * 获取自定义验收类型
   * 注意：当前后端无此路由，返回空数组作为降级处理
   */
  async getCustomTypes(_projectId: string): Promise<AcceptanceType[]> {
    // 后端尚未实现 acceptance_types 查询路由，返回空数组
    // 系统默认类型由前端 DEFAULT_ACCEPTANCE_TYPES 常量维护
    return [];
  },

  /**
   * 创建自定义验收类型（暂不支持，降级）
   */
  async createCustomType(type: Partial<AcceptanceType>, _projectId: string): Promise<AcceptanceType> {
    // 后端无此路由，本地模拟
    return {
      id: `custom_${Date.now()}`,
      name: type.name || '自定义类型',
      shortName: (type.name || '').slice(0, 4),
      color: type.color || '#6b7280',
      icon: type.icon,
      isSystem: false,
      description: type.description,
      defaultDependsOn: type.defaultDependsOn,
      sortOrder: type.sortOrder ?? 99
    };
  },

  /**
   * 删除自定义验收类型（暂不支持，空操作）
   */
  async deleteCustomType(_typeId: string): Promise<void> {
    // 后端无此路由，空操作
  },

  /**
   * 更新节点位置（保存到 position 字段）
   */
  async updatePosition(planId: string, position: { x?: number; y?: number }): Promise<void> {
    await apiFetch<any>(
      `${API_BASE}/acceptance-plans/${encodeURIComponent(planId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ position: JSON.stringify(position) })
      }
    );
  },

  /**
   * 添加依赖关系（通过更新 depends_on 字段）
   */
  async addDependency(planId: string, dependsOnId: string): Promise<void> {
    // 先获取当前的 depends_on
    const current = await this.getPlan(planId);
    const deps = current.depends_on || [];
    if (!deps.includes(dependsOnId)) {
      await this.updatePlan(planId, {
        depends_on: [...deps, dependsOnId]
      });
    }
  },

  /**
   * 移除依赖关系
   */
  async removeDependency(planId: string, dependsOnId: string): Promise<void> {
    const current = await this.getPlan(planId);
    const deps = (current.depends_on || []).filter((id: string) => id !== dependsOnId);
    await this.updatePlan(planId, { depends_on: deps });
  },

  /**
   * 为项目创建默认验收计划（批量）
   */
  async createDefaultPlans(_projectId: string): Promise<AcceptancePlan[]> {
    // 后端无 RPC，返回当前列表
    return this.getPlans(_projectId);
  }
};

// ─── 数据映射 ────────────────────────────────────────────────────────────────

/** 中文→英文状态映射（数据库可能存中文或英文） */
const STATUS_CN_TO_EN: Record<string, string> = {
  '待验收': 'pending',
  '验收中': 'in_progress',
  '已通过': 'passed',
  '未通过': 'failed',
  '需补充': 'needs_revision',
};

/** 将后端 DB 行映射为前端 AcceptancePlan 格式 */
function mapDbToPlan(item: any): AcceptancePlan {
  let position: { x: number; y: number } | undefined;
  if (item.position) {
    try {
      position = typeof item.position === 'string'
        ? JSON.parse(item.position)
        : item.position;
    } catch {
      position = undefined;
    }
  }

  let dependsOn: string[] = [];
  if (item.depends_on) {
    try {
      dependsOn = typeof item.depends_on === 'string'
        ? JSON.parse(item.depends_on)
        : item.depends_on;
    } catch {
      dependsOn = [];
    }
  }

  return {
    id: item.id,
    project_id: item.project_id,
    milestone_id: item.task_id || item.milestone_id,
    type_id: item.acceptance_type || item.type_id || '',
    type_name: item.acceptance_name || item.type_name || '',
    type_color: item.type_color || 'bg-gray-500',
    name: item.name || item.acceptance_name || '',
    description: item.description,
    planned_date: item.planned_date,
    actual_date: item.actual_date,
    status: item.status
      ? (STATUS_CN_TO_EN[item.status] || item.status)
      : 'pending',
    depends_on: dependsOn,
    depended_by: [],
    phase: item.phase,
    phase_order: item.phase_order ?? 0,
    position,
    responsible_user_id: item.responsible_user_id,
    documents: item.documents
      ? (typeof item.documents === 'string' ? JSON.parse(item.documents) : item.documents)
      : undefined,
    nodes: undefined,
    is_system: item.is_system ?? false,
    created_at: item.created_at,
    updated_at: item.updated_at,
    created_by: item.created_by
  };
}
