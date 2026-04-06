// CloudBase 云函数入口
const cloudbase = require('@cloudbase/node-sdk');

// 初始化 CloudBase
const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV
});

const db = app.database();

// 主处理函数
exports.main = async (event, context) => {
  const { httpMethod, path, queryStringParameters, body } = event;
  
// 设置 CORS 头（生产环境应配置 CORS_ORIGIN 环境变量）
  const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
  
  // 处理预检请求
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'OK' })
    };
  }
  
  try {
    // 路由处理
    const route = path || '/';
    
    // 健康检查
    if (route === '/health' || route === '/') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'ok',
          message: 'Project Management API is running',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        })
      };
    }
    
    // 获取项目列表
    if (route === '/projects' && httpMethod === 'GET') {
      const projects = await db.collection('projects').get();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          data: projects.data,
          total: projects.data.length
        })
      };
    }
    
    // 获取任务列表
    if (route === '/tasks' && httpMethod === 'GET') {
      const tasks = await db.collection('tasks').get();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          data: tasks.data,
          total: tasks.data.length
        })
      };
    }
    
    // 默认响应
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        error: 'Not Found',
        message: `Route ${route} not found`
      })
    };
    
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      })
    };
  }
};
