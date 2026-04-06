import { executeSQL, executeSQLOne } from '../services/dbService.js';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

// 数据库类型定义
interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  start_date?: string;       // [F1]: 新增，与 db.ts Task 类型一致
  end_date?: string;         // [F1]: 新增，与 db.ts Task 类型一致
  progress: number;
  assignee?: string;
  assignee_name?: string;
  dependencies?: string[];
  is_critical?: boolean;
  is_milestone?: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

interface Risk {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  level: string;
  status: string;
  impact?: string;
  probability?: number;
  mitigation?: string;
  created_at: string;
  updated_at: string;
}

interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  planned_end_date: string;
  status: string;
  progress?: number;
  created_at: string;
  updated_at: string;
}

interface Alert {
  id: string;
  project_id: string;
  type: 'task' | 'risk' | 'milestone' | 'dependency' | 'resource';
  level: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  related_id?: string;
  related_type?: string;
  resolved: boolean;
  resolved_at?: string;
  created_at: string;
}

export class AutoAlertService {
  private isRunning: boolean = false;

  constructor() {
    // 不再需要接收 supabaseUrl/supabaseKey，直接使用 dbService
  }

  // 启动自动预警服务
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('AutoAlertService is already running');
      return;
    }

    console.log('Starting AutoAlertService...');
    this.isRunning = true;

    // 每天凌晨2:30执行检测（错峰执行）
    cron.schedule('30 2 * * *', async () => {
      console.log('Running daily auto-alert check...');
      try {
        await this.runDailyChecks();
        console.log('Daily auto-alert check completed');
      } catch (error) {
        console.error('Error in daily auto-alert check:', error);
      }
    });

    // 每小时检查一次紧急情况
    cron.schedule('0 * * * *', async () => {
      console.log('Running hourly quick check...');
      try {
        await this.runQuickChecks();
        console.log('Hourly quick check completed');
      } catch (error) {
        console.error('Error in hourly quick check:', error);
      }
    });

    console.log('AutoAlertService started successfully');
  }

  // 停止服务
  stop(): void {
    this.isRunning = false;
    console.log('AutoAlertService stopped');
  }

  // 每日完整检测
  private async runDailyChecks(): Promise<void> {
    const projects = await executeSQL('SELECT * FROM projects', []) as any[];

    for (const project of (projects || [])) {
      await this.checkProject(project.id);
    }
  }

  // 快速检测（只检查紧急情况）
  private async runQuickChecks(): Promise<void> {
    await this.checkTodayDeadlines();
    await this.checkCriticalRisks();
  }

  // 检查单个项目
  private async checkProject(projectId: string): Promise<void> {
    console.log(`Checking project ${projectId}...`);

    const [tasks, risks, milestones] = await Promise.all([
      this.getProjectTasks(projectId),
      this.getProjectRisks(projectId),
      this.getProjectMilestones(projectId)
    ]);

    await Promise.all([
      this.checkDelayedTasks(projectId, tasks),
      this.checkUpcomingDeadlines(projectId, tasks),
      this.checkCriticalDependencies(projectId, tasks),
      this.checkResourceConflicts(projectId, tasks),
      this.checkHighRisks(projectId, risks),
      this.checkMilestoneStatus(projectId, milestones),
      this.checkDataConsistency(projectId, tasks, risks, milestones)
    ]);

    await this.updateProjectHealth(projectId, tasks, risks, milestones);
  }

  // 检查延期任务
  private async checkDelayedTasks(projectId: string, tasks: Task[]): Promise<void> {
    const delayedTasks = tasks.filter(task => {
      if (!task.end_date || task.progress === 100) return false;
      const endDate = new Date(task.end_date);
      const today = new Date();
      return endDate < today;
    });

    for (const task of delayedTasks) {
      const existingAlert = await this.getExistingAlert(projectId, 'task', task.id, '延期任务');
      if (!existingAlert) {
        await this.createAlert({
          project_id: projectId,
          type: 'task',
          level: 'critical',
          title: '任务已延期',
          description: `任务 "${task.title}" 已超过截止日期`,
          related_id: task.id,
          related_type: 'tasks'
        });
      }
    }
  }

  // 检查即将到期的任务
  private async checkUpcomingDeadlines(projectId: string, tasks: Task[]): Promise<void> {
    const upcomingTasks = tasks.filter(task => {
      if (!task.end_date || task.progress === 100) return false;
      const endDate = new Date(task.end_date);
      const today = new Date();
      const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
      return diffDays >= 0 && diffDays <= 3;
    });

    for (const task of upcomingTasks) {
      const endDate = new Date(task.end_date!);
      const today = new Date();
      const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

      const alertLevel = diffDays === 0 ? 'critical' : 'warning';
      const alertTitle = diffDays === 0 ? '任务今天到期' : '任务即将到期';

      const existingAlert = await this.getExistingAlert(projectId, 'task', task.id, alertTitle);
      if (!existingAlert) {
        await this.createAlert({
          project_id: projectId,
          type: 'task',
          level: alertLevel,
          title: alertTitle,
          description: `任务 "${task.title}" 将在 ${diffDays === 0 ? '今天' : `${diffDays}天后`} 到期，当前进度 ${task.progress}%`,
          related_id: task.id,
          related_type: 'tasks'
        });
      }
    }
  }

  // 检查关键依赖
  private async checkCriticalDependencies(projectId: string, tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      if (task.dependencies && task.dependencies.length > 0) {
        const dependentTasks = tasks.filter(t => task.dependencies!.includes(t.id));
        const delayedDependencies = dependentTasks.filter(depTask => {
          if (!depTask.end_date || depTask.progress === 100) return false;
          const endDate = new Date(depTask.end_date);
          const today = new Date();
          return endDate < today;
        });

        if (delayedDependencies.length > 0 && task.progress > 0) {
          const existingAlert = await this.getExistingAlert(projectId, 'dependency', task.id, '依赖任务延期');
          if (!existingAlert) {
            await this.createAlert({
              project_id: projectId,
              type: 'dependency',
              level: 'warning',
              title: '依赖任务延期',
              description: `任务 "${task.title}" 的依赖任务已延期，可能影响当前进度`,
              related_id: task.id,
              related_type: 'tasks'
            });
          }
        }
      }
    }
  }

  // 检查资源冲突
  private async checkResourceConflicts(projectId: string, tasks: Task[]): Promise<void> {
    const assigneeTasks: Record<string, Task[]> = {};

    tasks.forEach(task => {
      if (task.assignee) {
        if (!assigneeTasks[task.assignee]) {
          assigneeTasks[task.assignee] = [];
        }
        assigneeTasks[task.assignee].push(task);
      }
    });

    for (const [assignee, assigneeTaskList] of Object.entries(assigneeTasks)) {
      if (assigneeTaskList.length < 2) continue;

      for (let i = 0; i < assigneeTaskList.length; i++) {
        for (let j = i + 1; j < assigneeTaskList.length; j++) {
          const task1 = assigneeTaskList[i];
          const task2 = assigneeTaskList[j];

          if (this.tasksOverlap(task1, task2)) {
            const existingAlert = await this.getExistingAlert(
              projectId, 'resource', `${task1.id}-${task2.id}`, '资源时间冲突'
            );
            if (!existingAlert) {
              await this.createAlert({
                project_id: projectId,
                type: 'resource',
                level: 'warning',
                title: '资源时间冲突',
                description: `${assignee} 同时负责的任务 "${task1.title}" 和 "${task2.title}" 时间重叠`,
                related_id: task1.id,
                related_type: 'tasks'
              });
            }
          }
        }
      }
    }
  }

  // 检查高风险
  private async checkHighRisks(projectId: string, risks: Risk[]): Promise<void> {
    const highRisks = risks.filter(risk =>
      risk.level === 'critical' || risk.level === 'high'
    );

    for (const risk of highRisks) {
      if (risk.status === 'open') {
        const existingAlert = await this.getExistingAlert(projectId, 'risk', risk.id, '高风险未处理');
        if (!existingAlert) {
          await this.createAlert({
            project_id: projectId,
            type: 'risk',
            level: risk.level === 'critical' ? 'critical' : 'warning',
            title: '高风险未处理',
            description: `风险 "${risk.title}" (${risk.level}) 尚未处理`,
            related_id: risk.id,
            related_type: 'risks'
          });
        }
      }
    }
  }

  // 检查里程碑状态
  private async checkMilestoneStatus(projectId: string, milestones: Milestone[]): Promise<void> {
    for (const milestone of milestones) {
      if (milestone.status !== '已完成') {
        const dueDate = new Date(milestone.planned_end_date);
        const today = new Date();

        if (dueDate < today) {
          const existingAlert = await this.getExistingAlert(projectId, 'milestone', milestone.id, '里程碑已延期');
          if (!existingAlert) {
            await this.createAlert({
              project_id: projectId,
              type: 'milestone',
              level: 'critical',
              title: '里程碑已延期',
              description: `里程碑 "${milestone.title}" 已超过截止日期`,
              related_id: milestone.id,
              related_type: 'milestones'
            });
          }
        } else {
          const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

          if (diffDays <= 7) {
            const alertLevel = diffDays <= 1 ? 'warning' : 'info';
            const alertTitle = diffDays <= 1 ? '里程碑即将到期' : '里程碑即将到来';

            const existingAlert = await this.getExistingAlert(projectId, 'milestone', milestone.id, alertTitle);
            if (!existingAlert) {
              await this.createAlert({
                project_id: projectId,
                type: 'milestone',
                level: alertLevel,
                title: alertTitle,
                description: `里程碑 "${milestone.title}" 将在 ${diffDays}天后到期`,
                related_id: milestone.id,
                related_type: 'milestones'
              });
            }
          }
        }
      }
    }
  }

  // 检查今天到期的任务
  private async checkTodayDeadlines(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const tasks = await executeSQL(
      `SELECT * FROM tasks WHERE status IN (?, ?) AND planned_end_date >= ? AND planned_end_date <= ?`,
      ['进行中', 'in_progress', `${today} 00:00:00`, `${today} 23:59:59`]
    ) as any[];

    for (const task of (tasks || [])) {
      await this.createAlert({
        project_id: task.project_id,
        type: 'task',
        level: 'critical',
        title: '任务今天到期',
        description: `任务 "${task.title}" 今天到期，请及时完成`,
        related_id: task.id,
        related_type: 'tasks'
      });
    }
  }

  // 检查严重风险
  private async checkCriticalRisks(): Promise<void> {
    const risks = await executeSQL(
      'SELECT * FROM risks WHERE level = ? AND status != ?',
      ['high', 'resolved']
    ) as any[];

    for (const risk of (risks || [])) {
      await this.createAlert({
        project_id: risk.project_id,
        type: 'risk',
        level: 'critical',
        title: '严重风险提醒',
        description: `严重风险 "${risk.title}" 需要立即处理`,
        related_id: risk.id,
        related_type: 'risks'
      });
    }
  }

  // 检查数据一致性
  private async checkDataConsistency(
    projectId: string,
    tasks: Task[],
    risks: Risk[],
    milestones: Milestone[]
  ): Promise<void> {
    const inconsistentTasks = tasks.filter(task => {
      if ((task.status === 'completed' || task.status === '已完成') && task.progress !== 100) return true;
      if ((task.status === 'in_progress' || task.status === '进行中') && task.progress === 0) return true;
      if ((task.status === 'not_started' || task.status === '未开始') && task.progress > 0) return true;
      return false;
    });

    if (inconsistentTasks.length > 0) {
      await this.createAlert({
        project_id: projectId,
        type: 'task',
        level: 'warning',
        title: '数据不一致警告',
        description: `${inconsistentTasks.length} 个任务的状态与进度不一致，请检查`,
        related_id: projectId,
        related_type: 'projects'
      });
    }
  }

  // 更新项目健康度
  private async updateProjectHealth(
    projectId: string,
    tasks: Task[],
    risks: Risk[],
    milestones: Milestone[]
  ): Promise<void> {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === '已完成').length;
    const delayedTasks = tasks.filter(t => {
      if (!t.end_date || t.progress === 100) return false;
      const endDate = new Date(t.end_date);
      return endDate < new Date();
    }).length;
    const highRisks = risks.filter(r => r.level === 'critical' || r.level === 'high').length;
    const completedMilestones = milestones.filter(m => m.status === 'completed' || m.status === '已完成').length;
    const totalMilestones = milestones.length;

    let healthScore = 100;

    if (totalTasks > 0) {
      const taskCompletion = (completedTasks / totalTasks) * 40;
      const delayPenalty = (delayedTasks / totalTasks) * 30;
      const riskPenalty = (highRisks / Math.max(risks.length, 1)) * 20;
      const milestoneBonus = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 10 : 0;
      healthScore = taskCompletion - delayPenalty - riskPenalty + milestoneBonus;
    }

    healthScore = Math.max(0, Math.min(100, healthScore));

    const now = new Date().toISOString().replace('T', ' ').split('.')[0];
    await executeSQL(
      'UPDATE projects SET health_score = ?, last_health_check = ? WHERE id = ?',
      [Math.round(healthScore), now, projectId]
    );
  }

  // 辅助方法

  private async getProjectTasks(projectId: string): Promise<Task[]> {
    const data = await executeSQL(
      'SELECT * FROM tasks WHERE project_id = ?',
      [projectId]
    ) as any[];
    return (data || []).map((t: any) => ({
      ...t,
      dependencies: t.dependencies
        ? (typeof t.dependencies === 'string' ? JSON.parse(t.dependencies) : t.dependencies)
        : []
    }));
  }

  private async getProjectRisks(projectId: string): Promise<Risk[]> {
    const data = await executeSQL(
      'SELECT * FROM risks WHERE project_id = ?',
      [projectId]
    ) as any[];
    return data || [];
  }

  private async getProjectMilestones(projectId: string): Promise<Milestone[]> {
    const data = await executeSQL(
      'SELECT * FROM tasks WHERE project_id = ? AND is_milestone = true',
      [projectId]
    ) as any[];
    return data || [];
  }

  private async getExistingAlert(
    projectId: string,
    type: string,
    relatedId: string,
    title: string
  ): Promise<Alert | null> {
    const data = await executeSQLOne(
      `SELECT * FROM alerts
       WHERE project_id = ? AND type = ? AND related_id = ? AND title = ? AND resolved = 0
       ORDER BY created_at DESC LIMIT 1`,
      [projectId, type, relatedId, title]
    );
    return (data as Alert) || null;
  }

  private async createAlert(alertData: Partial<Alert>): Promise<void> {
    const now = new Date().toISOString().replace('T', ' ').split('.')[0];
    const id = uuidv4();

    await executeSQL(
      `INSERT INTO alerts
        (id, project_id, type, level, title, description, related_id, related_type, resolved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        alertData.project_id,
        alertData.type,
        alertData.level,
        alertData.title,
        alertData.description,
        alertData.related_id || null,
        alertData.related_type || null,
        now
      ]
    );

    console.log(`Alert created: ${alertData.title}`);
  }

  private tasksOverlap(task1: Task, task2: Task): boolean {
    if (!task1.start_date || !task1.end_date || !task2.start_date || !task2.end_date) {
      return false;
    }

    const start1 = new Date(task1.start_date).getTime();
    const end1 = new Date(task1.end_date).getTime();
    const start2 = new Date(task2.start_date).getTime();
    const end2 = new Date(task2.end_date).getTime();

    return start1 < end2 && start2 < end1;
  }
}
