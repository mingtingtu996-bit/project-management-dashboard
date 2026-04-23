const cloudbase = require('@cloudbase/node-sdk');

// 初始化 CloudBase
const app = cloudbase.init({
  env: 'project-management-8d1l147388982',
  secretId: process.env.TENCENT_SECRET_ID,
  secretKey: process.env.TENCENT_SECRET_KEY
});

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

async function checkAndCreateCollections() {
  try {
    console.log('正在检查数据库集合...\n');
    
    // 尝试访问每个集合来检查是否存在
    for (const collectionName of collections) {
      try {
        // 尝试查询集合（只取一条记录）
        await db.collection(collectionName).limit(1).get();
        console.log(`  ✓ ${collectionName} 已存在`);
      } catch (err) {
        if (err.code === 'DATABASE_COLLECTION_NOT_EXIST' || 
            err.message.includes('collection not found') ||
            err.message.includes('不存在')) {
          console.log(`  ⚠️ ${collectionName} 不存在，正在创建...`);
          try {
            await db.createCollection(collectionName);
            console.log(`    ✓ ${collectionName} 创建成功`);
          } catch (createErr) {
            console.log(`    ❌ 创建失败: ${createErr.message}`);
          }
        } else {
          console.log(`  ✓ ${collectionName} 已存在`);
        }
      }
    }
    
    console.log('\n✅ 所有集合检查完成！');
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

checkAndCreateCollections();
