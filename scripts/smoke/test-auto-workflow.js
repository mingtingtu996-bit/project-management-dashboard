/**
 * WorkBuddy 项目管理应用自动化冒烟测试。
 * 模拟真实用户使用场景，检查首页、基础元素、响应式和健康接口。
 */
const { chromium } = require('playwright');

async function testWorkflow() {
  console.log('='.repeat(60));
  console.log('WorkBuddy 自动化测试开始');
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  console.log('\n[步骤1] 访问首页...');
  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'artifacts/test-results/01_homepage.png', fullPage: true });
  console.log('  PASS 首页截图已保存');

  console.log('\n[步骤2] 检查页面元素...');
  const title = await page.title();
  console.log(`  - 页面标题: ${title}`);

  const mainContent = await page.locator('main, #root, .content').first();
  if (await mainContent.isVisible()) {
    console.log('  PASS 找到主要内容区域');
  }

  console.log('\n[步骤3] 检查功能模块...');
  const navCount = await page.locator('nav, header, [class*="nav"], [class*="header"]').count();
  console.log(`  - 找到 ${navCount} 个导航元素`);

  const buttonCount = await page.locator('button').count();
  console.log(`  - 找到 ${buttonCount} 个按钮`);

  const cardCount = await page.locator('[class*="card"], [class*="project"], [class*="item"]').count();
  console.log(`  - 找到 ${cardCount} 个卡片或项目元素`);

  console.log('\n[步骤4] 检查数据展示区域...');
  const chartCount = await page.locator('svg, [class*="chart"], [class*="gantt"]').count();
  console.log(`  - 找到 ${chartCount} 个图表元素`);

  const tableCount = await page.locator('table, [class*="table"]').count();
  console.log(`  - 找到 ${tableCount} 个表格元素`);

  const formCount = await page.locator('form, [class*="form"], input, select').count();
  console.log(`  - 找到 ${formCount} 个表单元素`);

  console.log('\n[步骤5] 模拟用户交互...');
  const buttons = await page.locator('button:visible').all();
  let clicked = false;
  for (const btn of buttons.slice(0, 5)) {
    try {
      const btnText = await btn.innerText();
      await btn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log(`  PASS 点击了按钮 ${btnText.trim().substring(0, 30)}`);
      clicked = true;
      break;
    } catch {
      continue;
    }
  }
  if (!clicked) {
    console.log('  - 未找到可点击的按钮');
  }

  console.log('\n[步骤6] 检查控制台错误...');
  const errors = consoleLogs.filter((line) => line.toLowerCase().includes('error'));
  if (errors.length > 0) {
    console.log(`  WARN 发现 ${errors.length} 个错误`);
    errors.slice(0, 3).forEach((err) => {
      console.log(`    ${err.substring(0, 100)}`);
    });
  } else {
    console.log('  PASS 无控制台错误');
  }

  console.log('\n[步骤7] 测试响应式布局...');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/test-results/07_mobile.png', fullPage: true });
  console.log('  PASS 移动端截图已保存');

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/test-results/07_tablet.png', fullPage: true });
  console.log('  PASS 平板截图已保存');

  await page.setViewportSize({ width: 1920, height: 1080 });

  console.log('\n[步骤8] 检查后端 API...');
  try {
    const healthResponse = await page.request.get('http://localhost:3001/api/readyz');
    console.log(`  - 健康检查 API: ${healthResponse.status()}`);
    if (healthResponse.ok()) {
      const data = await healthResponse.json();
      console.log(`  PASS 后端服务正常: ${JSON.stringify(data).substring(0, 50)}`);
    }
  } catch {
    console.log('  - 后端 API 请求失败');
  }

  console.log('\n[步骤9] 检查页面性能...');
  const metrics = await page.evaluate(() => ({
    domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
    loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart,
    domNodes: document.getElementsByTagName('*').length,
  }));

  console.log(`  - DOM 内容加载: ${metrics.domContentLoaded}ms`);
  console.log(`  - 页面完全加载: ${metrics.loadComplete}ms`);
  console.log(`  - DOM 节点数: ${metrics.domNodes}`);

  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));

  await page.screenshot({ path: 'artifacts/test-results/08_final.png', fullPage: true });
  console.log('\n所有截图已保存到 test-results 目录');

  await browser.close();
  return true;
}

testWorkflow().catch(console.error);
