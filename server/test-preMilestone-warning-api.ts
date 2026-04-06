// 使用 Supabase REST API 测试前期证照预警功能
// 这个脚本通过 HTTP 请求来测试，避免 Node.js SDK 兼容性问题

import https from 'https';

// ⚠️  测试文件 - 必须通过环境变量传入密钥
// 运行前请先设置: export SUPABASE_URL=... && export SUPABASE_ANON_KEY=...
import 'dotenv/config';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL 和 SUPABASE_ANON_KEY 必须通过环境变量设置，禁止硬编码');
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'wwdrkjnbvcbfytwnnyvs.supabase.co',
      port: 443,
      path: path,
      method: method,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      }
    };

    if (body) {
      const postData = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: result });
        } catch (error) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function testPreMilestoneWarning() {
  console.log('🧪 开始前期证照预警功能测试\n');

  try {
    // Step 1: 创建测试项目
    console.log('Step 1: 创建测试项目...');
    const projectResult = await makeRequest(
      'POST',
      '/rest/v1/projects',
      {
        name: '前期证照预警测试项目',
        description: '用于测试前期证照过期预警功能',
        status: 'active',
        project_type: '住宅',
        building_type: '高层',
        structure_type: '框架剪力墙',
        building_count: 1,
        above_ground_floors: 20,
        underground_floors: 2,
        support_method: '筏板基础',
        total_area: 30000,
        planned_start_date: new Date().toISOString(),
        planned_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        total_investment: 50000000,
        health_score: 80,
        health_status: 'healthy'
      }
    );
    console.log(`项目创建: ${projectResult.status}`);
    if (projectResult.data && projectResult.data.length > 0) {
      const projectId = projectResult.data[0].id;
      console.log(`项目 ID: ${projectId}\n`);

      // Step 2: 创建测试证照（三种情况）
      console.log('Step 2: 创建测试证照...');
      
      // 证照 1: 7天后过期（应该生成 warning）
      const tomorrow7 = new Date();
      tomorrow7.setDate(tomorrow7.getDate() + 7);
      
      const permit1Result = await makeRequest('POST', '/rest/v1/pre_milestones', {
        project_id: projectId,
        name: '建设工程规划许可证（7天后过期）',
        permit_type: '建设工程规划许可证',
        issuer: '市规划局',
        issue_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expiry_date: tomorrow7.toISOString(),
        status: 'valid',
        document_number: 'TEST-001-7DAYS'
      });
      console.log(`证照1（7天后过期）: ${permit1Result.status}`);
      const permit1Id = permit1Result.data[0].id;

      // 证照 2: 1天前过期（应该生成 critical）
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const permit2Result = await makeRequest('POST', '/rest/v1/pre_milestones', {
        project_id: projectId,
        name: '施工许可证（已过期1天）',
        permit_type: '施工许可证',
        issuer: '市住建局',
        issue_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        expiry_date: yesterday.toISOString(),
        status: 'expired',
        document_number: 'TEST-002-EXPIRED'
      });
      console.log(`证照2（已过期）: ${permit2Result.status}`);
      const permit2Id = permit2Result.data[0].id;

      // 证照 3: 60天后过期（不应该生成预警）
      const future60 = new Date();
      future60.setDate(future60.getDate() + 60);
      
      const permit3Result = await makeRequest('POST', '/rest/v1/pre_milestones', {
        project_id: projectId,
        name: '环评批复（60天后过期）',
        permit_type: '环评批复',
        issuer: '市环保局',
        issue_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        expiry_date: future60.toISOString(),
        status: 'valid',
        document_number: 'TEST-003-60DAYS'
      });
      console.log(`证照3（60天后过期）: ${permit3Result.status}\n`);

      // Step 3: 调用预警生成 API
      console.log('Step 3: 调用预警生成 API...');
      
      // 调用后端 API 生成预警
      // 注意：这里假设后端服务器正在运行
      const generateWarningResult = await makeRequest(
        'POST',
        '/api/pre-milestones/generate-warnings',
        { projectId: projectId }
      );
      console.log(`预警生成: ${generateWarningResult.status}\n`);

      // Step 4: 查询生成的预警
      console.log('Step 4: 查询生成的预警记录...');
      const warningsResult = await makeRequest(
        'GET',
        `/rest/v1/warnings?project_id=eq.${projectId}&order=created_at`
      );
      console.log(`查询到 ${warningsResult.data ? warningsResult.data.length : 0} 条预警记录\n`);

      if (warningsResult.data && warningsResult.data.length > 0) {
        console.log('📋 预警记录详情:\n');
        warningsResult.data.forEach((warning, index) => {
          console.log(`预警 ${index + 1}:`);
          console.log(`  ID: ${warning.id}`);
          console.log(`  类型: ${warning.warning_type}`);
          console.log(`  级别: ${warning.warning_level}`);
          console.log(`  标题: ${warning.title}`);
          console.log(`  描述: ${warning.description}`);
          console.log(`  创建时间: ${warning.created_at}\n`);
        });

        // Step 5: 验证结果
        console.log('✅ 验证结果:');
        
        const criticalCount = warningsResult.data.filter(w => w.warning_level === 'critical').length;
        const warningCount = warningsResult.data.filter(w => w.warning_level === 'warning').length;
        
        console.log(`- Critical 级别预警: ${criticalCount} 条（预期 1 条）`);
        console.log(`- Warning 级别预警: ${warningCount} 条（预期 1 条）`);
        console.log(`- 总计: ${warningsResult.data.length} 条（预期 2 条）`);
        
        if (criticalCount === 1 && warningCount === 1 && warningsResult.data.length === 2) {
          console.log('\n✅ 测试通过！预警功能正常工作。');
        } else {
          console.log('\n⚠️ 测试结果与预期不符，请检查预警生成逻辑。');
        }
      } else {
        console.log('❌ 未生成任何预警记录，请检查服务配置。');
      }

    } else {
      console.log('❌ 项目创建失败');
    }

  } catch (error) {
    console.error('❌ 测试执行失败:', error.message);
  }
}

// 执行测试
testPreMilestoneWarning().then(() => {
  console.log('\n🎉 测试完成！');
}).catch(error => {
  console.error('❌ 测试失败:', error);
});
