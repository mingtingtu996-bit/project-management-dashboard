/**
 * WorkBuddy 项目管理应用自动化测试
 * 模拟真实用户使用场景
 */
const { chromium } = require('playwright');

async function testWorkflow() {
  console.log('='.repeat(60));
  console.log('WorkBuddy 自动化测试开始');
  console.log('='.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  // 收集控制台日志
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  
  // ==================== 步骤1: 访问首页 ====================
  console.log('\n[步骤1] 访问首页...');
  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // 截图
  await page.screenshot({ path: 'test-results/01_homepage.png', fullPage: true });
  console.log('  ✓ 首页截图已保存');
  
  // ==================== 步骤2: 检查页面元素 ====================
  console.log('\n[步骤2] 检查页面元素...');
  
  // 检查页面标题
  const title = await page.title();
  console.log(`  - 页面标题: ${title}`);
  
  // 检查主要内容区域
  const mainContent = await page.locator('main, #root, .content').first();
  if (await mainContent.isVisible()) {
    console.log('  ✓ 找到主要内容区域');
  }
  
  // ==================== 步骤3: 检查功能模块 ====================
  console.log('\n[步骤3] 检查功能模块...');
  
  // 检查导航元素
  const navCount = await page.locator('nav, header, [class*="nav"], [class*="header"]').count();
  console.log(`  - 找到 ${navCount} 个导航元素`);
  
  // 检查按钮
  const buttonCount = await page.locator('button').count();
  console.log(`  - 找到 ${buttonCount} 个按钮`);
  
  // 检查卡片/项目元素
  const cardCount = await page.locator('[class*="card"], [class*="project"], [class*="item"]').count();
  console.log(`  - 找到 ${cardCount} 个卡片/项目元素`);
  
  // ==================== 步骤4: 检查数据展示区域 ====================
  console.log('\n[步骤4] 检查数据展示区域...');
  
  // 检查图表
  const chartCount = await page.locator('svg, [class*="chart"], [class*="gantt"]').count();
  console.log(`  - 找到 ${chartCount} 个图表元素`);
  
  // 检查表格
  const tableCount = await page.locator('table, [class*="table"]').count();
  console.log(`  - 找到 ${tableCount} 个表格元素`);
  
  // 检查表单
  const formCount = await page.locator('form, [class*="form"], input, select').count();
  console.log(`  - 找到 ${formCount} 个表单元素`);
  
  // ==================== 步骤5: 模拟用户交互 ====================
  console.log('\n[步骤5] 模拟用户交互...');
  
  // 尝试点击可见按钮
  const buttons = await page.locator('button:visible').all();
  let clicked = false;
  for (const btn of buttons.slice(0, 5)) {
    try {
      const btnText = await btn.innerText();
      await btn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log(`  ✓ 点击了按钮: ${btnText.trim().substring(0, 30)}`);
      clicked = true;
      break;
    } catch (e) {
      continue;
    }
  }
  if (!clicked) {
    console.log('  - 未找到可点击的按钮');
  }
  
  // ==================== 步骤6: 检查错误 ====================
  console.log('\n[步骤6] 检查控制台错误...');
  const errors = consoleLogs.filter(log => log.toLowerCase().includes('error'));
  if (errors.length > 0) {
    console.log(`  ⚠️ 发现 ${errors.length} 个错误:`);
    errors.slice(0, 3).forEach(err => {
      console.log(`    ${err.substring(0, 100)}`);
    });
  } else {
    console.log('  ✓ 无控制台错误');
  }
  
  // ==================== 步骤7: 响应式测试 ====================
  console.log('\n[步骤7] 测试响应式布局...');
  
  // 移动端尺寸
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/07_mobile.png', fullPage: true });
  console.log('  ✓ 移动端截图已保存');
  
  // 平板尺寸
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/07_tablet.png', fullPage: true });
  console.log('  ✓ 平板截图已保存');
  
  // 恢复桌面尺寸
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  // ==================== 步骤8: 检查后端API ====================
  console.log('\n[步骤8] 检查后端API...');
  
  try {
    const healthResponse = await page.request.get('http://localhost:3001/api/health');
    console.log(`  - 健康检查API: ${healthResponse.status()}`);
    if (healthResponse.ok()) {
      const data = await healthResponse.json();
      console.log(`  ✓ 后端服务正常: ${JSON.stringify(data).substring(0, 50)}`);
    }
  } catch (e) {
    console.log(`  - 后端API请求失败`);
  }
  
  // ==================== 步骤9: 页面性能 ====================
  console.log('\n[步骤9] 检查页面性能...');
  
  const metrics = await page.evaluate(() => {
    return {
      domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
      loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart,
      domNodes: document.getElementsByTagName('*').length
    };
  });
  
  console.log(`  - DOM内容加载: ${metrics.domContentLoaded}ms`);
  console.log(`  - 页面完全加载: ${metrics.loadComplete}ms`);
  console.log(`  - DOM节点数: ${metrics.domNodes}`);
  
  // ==================== 测试完成 ====================
  console.log('\n' + '='.repeat(60));
  console.log('测试完成!');
  console.log('='.repeat(60));
  
  // 最终截图
  await page.screenshot({ path: 'test-results/08_final.png', fullPage: true });
  console.log('\n📁 所有截图已保存到 test-results 目录');
  
  await browser.close();
  return true;
}

testWorkflow().catch(console.error);
