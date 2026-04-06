/**
 * 输入验证模块
 * 提供用户输入的客户端验证功能
 */

/**
 * 验证结果接口
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * 通用输入验证配置
 */
interface ValidationConfig {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  noHTML?: boolean;
}

/**
 * 验证字符串字段
 */
export function validateString(
  value: string,
  fieldName: string,
  config: ValidationConfig = {}
): ValidationResult {
  const errors: string[] = [];

  // 必填验证
  if (config.required && (!value || value.trim().length === 0)) {
    errors.push(`${fieldName}不能为空`);
  }

  // 跳过后续验证（如果值为空且非必填）
  if (!value || value.trim().length === 0) {
    return { isValid: errors.length === 0, errors };
  }

  const trimmedValue = value.trim();

  // 长度验证
  if (config.minLength && trimmedValue.length < config.minLength) {
    errors.push(`${fieldName}长度不能少于${config.minLength}个字符`);
  }

  if (config.maxLength && trimmedValue.length > config.maxLength) {
    errors.push(`${fieldName}长度不能超过${config.maxLength}个字符`);
  }

  // 模式验证
  if (config.pattern && !config.pattern.test(trimmedValue)) {
    errors.push(`${fieldName}格式不正确`);
  }

  // HTML标签检测（防XSS）
  if (config.noHTML) {
    if (/<[^>]*>/g.test(trimmedValue)) {
      errors.push(`${fieldName}不能包含HTML标签`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * 验证任务输入
 */
export interface TaskInput {
  title: string;
  description?: string;
  priority?: string;
  status?: string;
}

export function validateTaskInput(input: TaskInput): ValidationResult {
  const errors: string[] = [];

  // 标题验证
  const titleValidation = validateString(input.title || '', '任务标题', {
    required: true,
    minLength: 1,
    maxLength: 255,
    noHTML: true
  });

  if (!titleValidation.isValid) {
    errors.push(...titleValidation.errors);
  }

  // 描述验证
  if (input.description) {
    const descValidation = validateString(input.description, '任务描述', {
      maxLength: 5000,
      noHTML: true
    });

    if (!descValidation.isValid) {
      errors.push(...descValidation.errors);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * 验收计划输入验证（兼容新模型 V4.3 和旧模型）
 * 新模型用 type_id，旧模型用 acceptance_type
 */
export interface AcceptancePlanInput {
  type_id?: string;
  acceptance_type?: string;
  acceptance_name?: string;
  name?: string;
  planned_date: string;
  notes?: string;
}

export function validateAcceptancePlanInput(input: AcceptancePlanInput): ValidationResult {
  const errors: string[] = [];

  // 验收类型验证：type_id 或 acceptance_type 至少有一个即可
  if (!input.type_id && !input.acceptance_type) {
    // 宽容处理：不强制要求类型，允许通过
  } else if (input.type_id && typeof input.type_id === 'string' && input.type_id.trim() === '') {
    errors.push('验收类型ID不能为空字符串');
  }

  // 验收名称验证：新模型用 name，旧模型用 acceptance_name，二选一即可
  const resolvedName = input.name?.trim() || input.acceptance_name?.trim()
  if (resolvedName) {
    const nameValidation = validateString(resolvedName, '验收名称', {
      minLength: 2,
      maxLength: 255,
      noHTML: true
    });
    if (!nameValidation.isValid) {
      errors.push(...nameValidation.errors);
    }
  }

  // 计划日期验证
  if (!input.planned_date) {
    errors.push('计划日期不能为空');
  } else {
    const plannedDate = new Date(input.planned_date);
    if (isNaN(plannedDate.getTime())) {
      errors.push('计划日期格式不正确');
    }
  }

  // 备注验证
  if (input.notes) {
    const notesValidation = validateString(input.notes, '备注', {
      maxLength: 2000,
      noHTML: true
    });

    if (!notesValidation.isValid) {
      errors.push(...notesValidation.errors);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * 验收节点输入验证
 */
export interface AcceptanceNodeInput {
  node_name: string;
  node_type?: string;
  description?: string;
  planned_date?: string;
  notes?: string;
}

export function validateAcceptanceNodeInput(input: AcceptanceNodeInput): ValidationResult {
  const errors: string[] = [];

  // 节点名称验证
  const nameValidation = validateString(input.node_name || '', '节点名称', {
    required: true,
    minLength: 2,
    maxLength: 255,
    noHTML: true
  });

  if (!nameValidation.isValid) {
    errors.push(...nameValidation.errors);
  }

  // 节点类型验证
  if (input.node_type) {
    const typeValidation = validateString(input.node_type, '节点类型', {
      maxLength: 100,
      noHTML: true
    });

    if (!typeValidation.isValid) {
      errors.push(...typeValidation.errors);
    }
  }

  // 描述验证
  if (input.description) {
    const descValidation = validateString(input.description, '描述', {
      maxLength: 2000,
      noHTML: true
    });

    if (!descValidation.isValid) {
      errors.push(...descValidation.errors);
    }
  }

  // 计划日期验证
  if (input.planned_date) {
    const plannedDate = new Date(input.planned_date);
    if (isNaN(plannedDate.getTime())) {
      errors.push('计划日期格式不正确');
    }
  }

  // 备注验证
  if (input.notes) {
    const notesValidation = validateString(input.notes, '备注', {
      maxLength: 2000,
      noHTML: true
    });

    if (!notesValidation.isValid) {
      errors.push(...notesValidation.errors);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * 项目输入验证
 */
export interface ProjectInput {
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
}

export function validateProjectInput(input: ProjectInput): ValidationResult {
  const errors: string[] = [];

  // 项目名称验证
  const nameValidation = validateString(input.name || '', '项目名称', {
    required: true,
    minLength: 2,
    maxLength: 255,
    noHTML: true
  });

  if (!nameValidation.isValid) {
    errors.push(...nameValidation.errors);
  }

  // 描述验证
  if (input.description) {
    const descValidation = validateString(input.description, '项目描述', {
      maxLength: 2000,
      noHTML: true
    });

    if (!descValidation.isValid) {
      errors.push(...descValidation.errors);
    }
  }

  // 日期验证
  if (input.start_date && input.end_date) {
    const startDate = new Date(input.start_date);
    const endDate = new Date(input.end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      errors.push('日期格式不正确');
    } else if (startDate >= endDate) {
      errors.push('开始日期必须早于结束日期');
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * 验证并返回第一个错误消息
 * 适用于表单提交时的快速验证
 */
export function getFirstErrorMessage(validationResult: ValidationResult): string | null {
  return validationResult.errors.length > 0 ? validationResult.errors[0] : null;
}
