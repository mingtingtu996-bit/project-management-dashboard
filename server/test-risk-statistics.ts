/**
 * 风险统计功能测试脚本
 * 测试 riskStatisticsService 和 API 路由
 */

import { riskStatisticsService } from './src/services/riskStatisticsService.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 创建 Supabase 客户端
function createSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase configuration missing. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in your .env file.');
  }
  
  return createClient(url, key);
}

const TEST_PROJECT_ID = 'test-project-001';

async function testRiskStatistics() {
  console.log('🧪 开始测试风险统计功能...\n');

  try {
    // 1. 测试生成单日统计快照
    console.log('1️⃣ 测试生成单日统计快照...');
    const today = new Date().toISOString().split('T')[0];
    const snapshot = await riskStatisticsService.generateDailySnapshot(TEST_PROJECT_ID, today);
    
    if (snapshot) {
      console.log('✅ 单日快照生成成功');
      console.log(`   - 日期: ${snapshot.stat_date}`);
      console.log(`   - 新增风险: ${snapshot.new_risks}`);
      console.log(`   - 已处理: ${snapshot.resolved_risks}`);
      console.log(`   - 当前存量: ${snapshot.total_risks}`);
      console.log(`   - 高风险: ${snapshot.high_risk_count}`);
    } else {
      console.log('⚠️ 单日快照生成失败或返回空');
    }

    // 2. 测试生成历史统计数据
    console.log('\n2️⃣ 测试生成历史统计数据（最近7天）...');
    const generated = await riskStatisticsService.generateHistoricalSnapshots(TEST_PROJECT_ID, 7);
    console.log(`✅ 成功生成 ${generated} 条历史统计记录`);

    // 3. 测试获取风险趋势数据
    console.log('\n3️⃣ 测试获取风险趋势数据（30天）...');
    const trendData = await riskStatisticsService.getRiskTrend(TEST_PROJECT_ID, 30);
    
    console.log(`✅ 获取到 ${trendData.trend.length} 天的趋势数据`);
    console.log(`   - 总新增: ${trendData.summary.totalNewRisks}`);
    console.log(`   - 总处理: ${trendData.summary.totalResolvedRisks}`);
    console.log(`   - 当前存量: ${trendData.summary.currentTotalRisks}`);
    console.log(`   - 变化率: ${trendData.summary.riskChangeRate}%`);

    if (trendData.trend.length > 0) {
      console.log('\n   最近5天数据预览:');
      trendData.trend.slice(-5).forEach(day => {
        console.log(`   ${day.date}: 新增${day.newRisks}, 处理${day.resolvedRisks}, 存量${day.totalRisks}`);
      });
    }

    // 4. 测试获取最新快照
    console.log('\n4️⃣ 测试获取最新统计快照...');
    const latest = await riskStatisticsService.getLatestSnapshot(TEST_PROJECT_ID);
    
    if (latest) {
      console.log('✅ 最新快照获取成功');
      console.log(`   - 日期: ${latest.stat_date}`);
      console.log(`   - 延期风险: ${latest.delay_risks}`);
      console.log(`   - 受阻风险: ${latest.obstacle_risks}`);
      console.log(`   - 条件风险: ${latest.condition_risks}`);
      console.log(`   - 一般风险: ${latest.general_risks}`);
    } else {
      console.log('⚠️ 未找到最新快照');
    }

    // 5. 验证数据库表结构
    console.log('\n5️⃣ 验证数据库表结构...');
    const supabase = createSupabaseClient();
    const { data: tableInfo, error: tableError } = await supabase
      .from('risk_statistics')
      .select('*')
      .limit(1);

    if (tableError) {
      console.log('❌ 表结构验证失败:', tableError.message);
    } else {
      console.log('✅ risk_statistics 表存在且可访问');
    }

    console.log('\n✨ 所有测试完成！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testRiskStatistics();
