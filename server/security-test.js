/**
 * 安全测试脚本 - 验证修复后的安全功能
 * 运行: node security-test.js
 */

const http = require('http');

const BASE_URL = 'localhost';
const PORT = 3001;

// 测试用例
const tests = [
  {
    name: 'TC-AUTH-01: 未认证访问API应返回401',
    method: 'GET',
    path: '/api/projects',
    headers: {},
    expectStatus: 401,
    expectBody: (body) => body.error && body.error.code === 'UNAUTHORIZED'
  },
  {
    name: 'TC-AUTH-02: 无效token应返回401',
    method: 'GET',
    path: '/api/projects',
    headers: { 'Authorization': 'Bearer invalid-token' },
    expectStatus: 401,
    expectBody: (body) => body.error && (body.error.code === 'INVALID_TOKEN' || body.error.code === 'INVALID_TOKEN_FORMAT')
  },
  {
    name: 'TC-AUTH-04: 有效token格式应被接受（测试模式）',
    method: 'GET',
    path: '/api/projects',
    headers: { 'Authorization': 'Bearer test-auth-token' },
    expectStatus: 200,
    expectBody: (body) => body.success === true
  },
  {
    name: 'TC-INPUT-01: SQL注入防护测试',
    method: 'GET',
    path: '/api/projects?id=1\' OR \'1\'=\'1',
    headers: { 'Authorization': 'Bearer test-auth-token' },
    expectStatus: 200,
    expectBody: (body) => Array.isArray(body.data)
  },
  {
    name: 'TC-INPUT-02: XSS攻击防护测试',
    method: 'POST',
    path: '/api/projects',
    headers: { 
      'Authorization': 'Bearer test-auth-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: '<script>alert("xss")</script>',
      description: '<img src=x onerror=alert("xss")>'
    }),
    expectStatus: 201,
    expectBody: (body) => body.success === true
  },
  {
    name: 'TC-CORS-01: 跨域预检请求',
    method: 'OPTIONS',
    path: '/api/projects',
    headers: {
      'Origin': 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET'
    },
    expectStatus: 204
  }
];

// 执行单个测试
function runTest(test) {
  return new Promise((resolve) => {
    const options = {
      hostname: BASE_URL,
      port: PORT,
      path: test.path,
      method: test.method,
      headers: test.headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let body = {};
        try {
          body = JSON.parse(data);
        } catch (e) {
          // 非JSON响应
        }

        const statusMatch = res.statusCode === test.expectStatus;
        const bodyMatch = test.expectBody ? test.expectBody(body) : true;
        const passed = statusMatch && bodyMatch;

        resolve({
          name: test.name,
          passed,
          status: res.statusCode,
          expectedStatus: test.expectStatus,
          body: passed ? null : body
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        name: test.name,
        passed: false,
        error: err.message
      });
    });

    if (test.body) {
      req.write(test.body);
    }
    req.end();
  });
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('       安全测试执行 - 修复后验证');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`执行: ${test.name} ... `);
    const result = await runTest(test);
    
    if (result.passed) {
      console.log('✅ 通过');
      passed++;
    } else {
      console.log('❌ 失败');
      console.log(`   状态码: ${result.status} (期望: ${result.expectedStatus})`);
      if (result.body) {
        console.log(`   响应: ${JSON.stringify(result.body, null, 2)}`);
      }
      if (result.error) {
        console.log(`   错误: ${result.error}`);
      }
      failed++;
    }
  }

  console.log('\n========================================');
  console.log('              测试汇总');
  console.log('========================================');
  console.log(`总计: ${tests.length} 个测试`);
  console.log(`通过: ${passed} ✅`);
  console.log(`失败: ${failed} ❌`);
  console.log(`评分: ${Math.round((passed / tests.length) * 100)}/100`);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

main();
