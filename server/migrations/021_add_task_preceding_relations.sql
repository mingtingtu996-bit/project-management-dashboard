// 021_add_task_preceding_relations.sql
// 前置工序多选功能：junction 表支持一个条件关联多个前置任务

-- 任务前置关系表（支持多对多：一个条件可依赖多个前置任务）
CREATE TABLE IF NOT EXISTS task_preceding_relations (
  id            VARCHAR(36)  PRIMARY KEY,
  condition_id  VARCHAR(36)  NOT NULL,
  task_id       VARCHAR(36)  NOT NULL,           -- 前置任务ID
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_condition_id (condition_id),
  INDEX idx_task_id (task_id),

  -- 防止重复
  UNIQUE KEY uk_condition_task (condition_id, task_id),

  -- 外键
  CONSTRAINT fk_pr_condition FOREIGN KEY (condition_id)
    REFERENCES task_conditions(id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_task FOREIGN KEY (task_id)
    REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 迁移说明：原有 task_conditions.preceding_task_id 字段保留（兼容旧数据），
-- 但新增条件时使用 junction 表存储多对多关系。
-- 触发器已更新为同时查询 junction 表。
