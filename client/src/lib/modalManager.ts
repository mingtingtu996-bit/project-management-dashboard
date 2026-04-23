import { z } from 'zod'
import { getBrowserStorage, safeJsonParse, safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browserStorage'

/**
 * 弹窗频率管理器
 * 借鉴房地产工程管理系统的用户体验优化方案
 * 避免频繁弹窗打扰用户，提升用户体验
 */

interface ModalShowRecord {
  modalId: string;
  lastShown: number;
  showCount: number;
  userDismissed: boolean;
}

const ModalShowRecordSchema = z.object({
  modalId: z.string(),
  lastShown: z.number().finite(),
  showCount: z.number().int().nonnegative(),
  userDismissed: z.boolean(),
})

const ModalShowRecordListSchema = z.array(ModalShowRecordSchema)
const ModalPreferenceListSchema = z.array(z.tuple([z.string(), z.boolean()]))

class ModalManager {
  private static instance: ModalManager;
  private records: Map<string, ModalShowRecord> = new Map();
  private cooldownPeriods: Map<string, number> = new Map();
  private dismissPreferences: Map<string, boolean> = new Map();

  // 默认冷却时间配置（毫秒）
  private defaultCooldowns = {
    'risk_alert': 60 * 60 * 1000,      // 风险提醒：1小时
    'task_deadline': 2 * 60 * 60 * 1000, // 任务到期：2小时
    'milestone_upcoming': 4 * 60 * 60 * 1000, // 里程碑即将到期：4小时
    'welcome_tour': 24 * 60 * 60 * 1000, // 欢迎导览：24小时
    'feature_prompt': 12 * 60 * 60 * 1000, // 功能提示：12小时
    'data_sync': 30 * 60 * 1000,        // 数据同步：30分钟
    'permission_request': 7 * 24 * 60 * 60 * 1000, // 权限请求：7天
  };

  private constructor() {
    // 从localStorage加载用户偏好
    this.loadPreferences();
  }

  static getInstance(): ModalManager {
    if (!ModalManager.instance) {
      ModalManager.instance = new ModalManager();
    }
    return ModalManager.instance;
  }

  /**
   * 检查是否可以显示弹窗
   * @param modalId 弹窗ID
   * @param force 是否强制显示（忽略冷却时间）
   * @returns 是否可以显示
   */
  canShow(modalId: string, force: boolean = false): boolean {
    // 如果用户已永久关闭此弹窗
    if (this.dismissPreferences.get(modalId)) {
      return false;
    }

    // 强制显示模式
    if (force) {
      return true;
    }

    const record = this.records.get(modalId);
    if (!record) {
      return true; // 从未显示过
    }

    // 检查冷却时间
    const cooldown = this.getCooldownPeriod(modalId);
    const now = Date.now();
    const timeSinceLastShow = now - record.lastShown;

    return timeSinceLastShow > cooldown;
  }

  /**
   * 记录弹窗已显示
   * @param modalId 弹窗ID
   * @param userDismissed 用户是否主动关闭
   */
  markShown(modalId: string, userDismissed: boolean = false): void {
    const now = Date.now();
    const existingRecord = this.records.get(modalId);

    if (existingRecord) {
      existingRecord.lastShown = now;
      existingRecord.showCount += 1;
      existingRecord.userDismissed = userDismissed;
    } else {
      this.records.set(modalId, {
        modalId,
        lastShown: now,
        showCount: 1,
        userDismissed
      });
    }

    // 如果用户主动关闭，考虑增加冷却时间
    if (userDismissed) {
      this.handleUserDismissal(modalId);
    }

    this.saveRecords();
  }

  /**
   * 用户永久关闭某个弹窗
   * @param modalId 弹窗ID
   */
  dismissPermanently(modalId: string): void {
    this.dismissPreferences.set(modalId, true);
    this.savePreferences();
  }

  /**
   * 重置弹窗记录
   * @param modalId 弹窗ID（不传则重置所有）
   */
  reset(modalId?: string): void {
    if (modalId) {
      this.records.delete(modalId);
      this.dismissPreferences.delete(modalId);
    } else {
      this.records.clear();
      this.dismissPreferences.clear();
    }
    this.saveRecords();
    this.savePreferences();
  }

  /**
   * 设置自定义冷却时间
   * @param modalId 弹窗ID
   * @param cooldownMs 冷却时间（毫秒）
   */
  setCooldown(modalId: string, cooldownMs: number): void {
    this.cooldownPeriods.set(modalId, cooldownMs);
  }

  /**
   * 获取弹窗显示统计
   * @param modalId 弹窗ID
   * @returns 显示统计信息
   */
  getStats(modalId: string): {
    showCount: number;
    lastShown: Date | null;
    timeSinceLastShow: number;
    isDismissed: boolean;
  } {
    const record = this.records.get(modalId);
    const isDismissed = this.dismissPreferences.get(modalId) || false;

    if (!record) {
      return {
        showCount: 0,
        lastShown: null,
        timeSinceLastShow: 0,
        isDismissed
      };
    }

    const now = Date.now();
    const timeSinceLastShow = now - record.lastShown;

    return {
      showCount: record.showCount,
      lastShown: new Date(record.lastShown),
      timeSinceLastShow,
      isDismissed
    };
  }

  /**
   * 获取所有弹窗统计
   */
  getAllStats(): Record<string, {
    showCount: number;
    lastShown: Date | null;
    isDismissed: boolean;
  }> {
    const stats: Record<string, any> = {};

    this.records.forEach((record, modalId) => {
      const isDismissed = this.dismissPreferences.get(modalId) || false;
      stats[modalId] = {
        showCount: record.showCount,
        lastShown: new Date(record.lastShown),
        isDismissed
      };
    });

    return stats;
  }

  /**
   * 智能建议：根据用户行为调整弹窗策略
   */
  getSmartSuggestion(modalId: string): {
    shouldShow: boolean;
    reason: string;
    suggestedDelay?: number;
  } {
    const stats = this.getStats(modalId);
    const cooldown = this.getCooldownPeriod(modalId);

    // 从未显示过
    if (stats.showCount === 0) {
      return {
        shouldShow: true,
        reason: '首次显示'
      };
    }

    // 用户已永久关闭
    if (stats.isDismissed) {
      return {
        shouldShow: false,
        reason: '用户已永久关闭'
      };
    }

    // 用户最近主动关闭
    if (stats.lastShown && stats.timeSinceLastShow < cooldown) {
      return {
        shouldShow: false,
        reason: '仍在冷却期内',
        suggestedDelay: cooldown - stats.timeSinceLastShow
      };
    }

    // 显示过于频繁
    if (stats.showCount > 3 && stats.timeSinceLastShow < 24 * 60 * 60 * 1000) {
      return {
        shouldShow: false,
        reason: '今日显示过于频繁',
        suggestedDelay: 24 * 60 * 60 * 1000 - stats.timeSinceLastShow
      };
    }

    return {
      shouldShow: true,
      reason: '可以正常显示'
    };
  }

  // 私有方法

  private getCooldownPeriod(modalId: string): number {
    // 优先使用自定义设置
    const customCooldown = this.cooldownPeriods.get(modalId);
    if (customCooldown) {
      return customCooldown;
    }

    // 使用默认设置
    return this.defaultCooldowns[modalId as keyof typeof this.defaultCooldowns] || 60 * 60 * 1000; // 默认1小时
  }

  private handleUserDismissal(modalId: string): void {
    const record = this.records.get(modalId);
    if (!record) return;

    // 如果用户多次关闭同一弹窗，增加冷却时间
    if (record.showCount > 2 && record.userDismissed) {
      const currentCooldown = this.getCooldownPeriod(modalId);
      const newCooldown = currentCooldown * 2; // 加倍冷却时间
      this.setCooldown(modalId, newCooldown);
    }
  }

  private saveRecords(): void {
    try {
      const storage = getBrowserStorage()
      if (!storage) return
      const recordsArray = Array.from(this.records.values());
      safeStorageSet(storage, 'modal_manager_records', JSON.stringify(recordsArray));
    } catch (error) {
      console.warn('Failed to save modal records:', error);
    }
  }

  private savePreferences(): void {
    try {
      const storage = getBrowserStorage()
      if (!storage) return
      const preferences = Array.from(this.dismissPreferences.entries());
      safeStorageSet(storage, 'modal_manager_preferences', JSON.stringify(preferences));
    } catch (error) {
      console.warn('Failed to save modal preferences:', error);
    }
  }

  private loadPreferences(): void {
    try {
      const storage = getBrowserStorage()
      if (!storage) return
      // 加载显示记录
      const recordsJson = safeStorageGet(storage, 'modal_manager_records');
      if (recordsJson) {
        const recordsArray = ModalShowRecordListSchema.safeParse(
          safeJsonParse<unknown>(recordsJson, [], 'modal_manager_records'),
        );
        if (recordsArray.success) {
          recordsArray.data.forEach(record => {
            this.records.set(record.modalId, record);
          });
        } else {
          safeStorageRemove(storage, 'modal_manager_records');
        }
      }

      // 加载用户偏好
      const preferencesJson = safeStorageGet(storage, 'modal_manager_preferences');
      if (preferencesJson) {
        const preferencesArray = ModalPreferenceListSchema.safeParse(
          safeJsonParse<unknown>(preferencesJson, [], 'modal_manager_preferences'),
        );
        if (preferencesArray.success) {
          preferencesArray.data.forEach(([modalId, dismissed]) => {
            this.dismissPreferences.set(modalId, dismissed);
          });
        } else {
          safeStorageRemove(storage, 'modal_manager_preferences');
        }
      }
    } catch (error) {
      console.warn('Failed to load modal preferences:', error);
      // 如果加载失败，清空可能损坏的数据
      const storage = getBrowserStorage()
      safeStorageRemove(storage, 'modal_manager_records');
      safeStorageRemove(storage, 'modal_manager_preferences');
    }
  }
}

// 导出单例实例
export const modalManager = ModalManager.getInstance();

// React Hook 封装
export const useModalManager = () => {
  return {
    canShow: (modalId: string, force?: boolean) => modalManager.canShow(modalId, force),
    markShown: (modalId: string, userDismissed?: boolean) => modalManager.markShown(modalId, userDismissed),
    dismissPermanently: (modalId: string) => modalManager.dismissPermanently(modalId),
    reset: (modalId?: string) => modalManager.reset(modalId),
    getStats: (modalId: string) => modalManager.getStats(modalId),
    getAllStats: () => modalManager.getAllStats(),
    getSmartSuggestion: (modalId: string) => modalManager.getSmartSuggestion(modalId),
    setCooldown: (modalId: string, cooldownMs: number) => modalManager.setCooldown(modalId, cooldownMs)
  };
};

// 常用的弹窗ID常量
export const MODAL_IDS = {
  RISK_ALERT: 'risk_alert',
  TASK_DEADLINE: 'task_deadline',
  MILESTONE_UPCOMING: 'milestone_upcoming',
  WELCOME_TOUR: 'welcome_tour',
  FEATURE_PROMPT: 'feature_prompt',
  DATA_SYNC: 'data_sync',
  PERMISSION_REQUEST: 'permission_request',
  WBS_TEMPLATE_SUGGESTION: 'wbs_template_suggestion',
  AUTO_ALERT_SUMMARY: 'auto_alert_summary',
  HEALTH_SCORE_EXPLANATION: 'health_score_explanation'
};

// 使用示例：
/*
// 在组件中使用
import { modalManager, MODAL_IDS } from '@/lib/modalManager';

// 检查是否可以显示弹窗
if (modalManager.canShow(MODAL_IDS.RISK_ALERT)) {
  // 显示弹窗
  showRiskAlert();
  
  // 记录弹窗已显示
  modalManager.markShown(MODAL_IDS.RISK_ALERT);
}

// 获取智能建议
const suggestion = modalManager.getSmartSuggestion(MODAL_IDS.FEATURE_PROMPT);
if (suggestion.shouldShow) {
  // 显示功能提示
}

// 用户永久关闭弹窗
const handleDismiss = () => {
  modalManager.dismissPermanently(MODAL_IDS.WELCOME_TOUR);
};
*/
