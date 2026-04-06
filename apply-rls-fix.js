#!/usr/bin/env node

/**
 * 应用RLS修复到CloudBase数据库
 * 
 * 使用方式:
 * 1. 安装依赖: npm install @cloudbase/node-sdk pg
 * 2. 配置环境变量:
 *    - CLOUDBASE_ENV_ID=project-management-8d1l147388982
 *    - CLOUDBASE_SECRET_KEY=your_secret_key  <-- 需要从CloudBase控制台获取
 * 3. 执行: node apply-rls-fix.js
 */

import cloudbase from '@cloudbase/node-sdk';
import fs from 'fs/promises';
import path from 'path';

// CloudBase配置
const config = {
  envId: process.env.CLOUDBASE_ENV_ID || 'project-management-8d1l147388982',
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY,
};

// 初始化CloudBase
const app = cloudbase.init({
  ...config,
});

// 读取SQL文件
async function readSQLFile() {
  const sqlPath = path.join(__dirname, 'server/migrations/038_fix_projects_rls.sql');
  return await fs.readFile(sqlPath, 'utf-8');
}

// 执行SQL (通过CloudBase云函数)
async function executeSQL(sql) {
  console.log('执行RLS修复SQL...');
  console.log('─'.repeat(60));
  
  try {
    // 方式1: 如果有云函数,可以通过云函数执行SQL
    // 这里提供一个完整的SQL执行模板
    
    const db = app.database();
    
    // 注意: CloudBase Node SDK不直接支持执行原生SQL
    // 需要通过以下方式之一:
    // 1. 使用CloudBase控制台手动执行
    // 2. 部署一个临时云函数执行SQL
    // 3. 使用MySQL客户端直接连接数据库
    
    console.log('SQL内容:');
    console.log(sql);
    console.log('');
    console.log('─'.repeat(60));
    
    console.log('\n⚠️  重要提示:');
    console.log('1. CloudBase Node SDK不直接支持执行原生SQL');
    console.log('2. 请通过以下方式之一执行:');
    console.log('   - 方式A: CloudBase控制台 -> MySQL数据库 -> SQL编辑器');
    console.log('   - 方式B: 使用MySQL客户端连接数据库');
    console.log('   - 方式C: 部署临时云函数执行SQL');
    console.log('');
    
    console.log('📋 数据库连接信息:');
    console.log('   - 环境 ID:', config.envId);
    console.log('   - 控制台地址: https://tcb.cloud.tencent.com/dev');
    console.log('');
    
    return { success: false, message: '需要手动执行SQL' };
    
  } catch (error) {
    console.error('执行失败:', error);
    return { success: false, error };
  }
}

// 主函数
async function main() {
  try {
    console.log('========================================');
    console.log('RLS修复脚本');
    console.log('========================================');
    console.log('');
    
    // 检查环境变量
    if (!process.env.CLOUDBASE_SECRET_KEY) {
      console.warn('⚠️  未设置 CLOUDBASE_SECRET_KEY 环境变量');
      console.warn('   请从CloudBase控制台获取Secret Key:');
      console.warn('   https://tcb.cloud.tencent.com/dev?envId=' + config.envId + '#/env/apikey');
      console.warn('');
    }
    
    // 读取SQL文件
    const sql = await readSQLFile();
    console.log('✓ 已读取SQL文件: server/migrations/038_fix_projects_rls.sql');
    console.log('');
    
    // 执行SQL
    const result = await executeSQL(sql);
    
    if (result.success) {
      console.log('✓ RLS修复完成!');
    } else {
      console.log('\n📝 手动执行步骤:');
      console.log('1. 打开CloudBase控制台:');
      console.log('   https://tcb.cloud.tencent.com/dev?envId=' + config.envId);
      console.log('');
      console.log('2. 进入 "MySQL数据库" 页面');
      console.log('');
      console.log('3. 点击 "SQL编辑器"');
      console.log('');
      console.log('4. 粘贴以下SQL内容并执行:');
      console.log('');
      console.log(sql);
      console.log('');
      console.log('5. 执行后,查看输出确认策略已创建');
    }
    
  } catch (error) {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  }
}

// 执行
main();
