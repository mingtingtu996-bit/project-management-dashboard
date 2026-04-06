const cloudbase = require('@cloudbase/node-sdk');

exports.main = async (event, context) => {
  const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
  const db = app.database();
  
  // 需要创建的集合列表
  const collections = [
    'projects',
    'tasks', 
    'milestones',
    'task_conditions',
    'task_obstacles',
    'acceptance_plans',
    'acceptance_nodes',
    'wbs_structure',
    'wbs_task_links',
    'wbs_templates',
    'task_delay_history',
    'pre_milestones',
    'pre_milestone_conditions',
    'job_execution_logs',
    'task_locks',
    'notifications',
    'user_settings',
    'activity_logs',
    'project_members',
    'task_dependencies',
    'task_comments'
  ];
  
  const results = {
    success: [],
    failed: [],
    existing: []
  };
  
  for (const collectionName of collections) {
    try {
      // 尝试创建集合
      await db.createCollection(collectionName);
      results.success.push(collectionName);
    } catch (err) {
      if (err.code === 'DATABASE_COLLECTION_EXIST' || 
          err.message.includes('already exists') ||
          err.message.includes('已存在')) {
        results.existing.push(collectionName);
      } else {
        results.failed.push({ name: collectionName, error: err.message });
      }
    }
  }
  
  return {
    code: 0,
    message: '数据库初始化完成',
    data: results
  };
};
