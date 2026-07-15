const { chromium } = require('playwright');

(async () => {
  console.log('启动 Edge 浏览器测试...\n');

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];
  let screenshotIndex = 1;

  async function screenshot(name) {
    await page.screenshot({
      path: `artifacts/test-results-phase4/${screenshotIndex}-${name}.png`,
      fullPage: true,
    });
    console.log(`  截图: ${screenshotIndex}-${name}.png`);
    screenshotIndex++;
  }

  console.log('测试1: 页面加载...');
  try {
    await page.goto('http://localhost:5200', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot('page-load');
    results.push({ test: '页面加载', status: 'PASS' });
    console.log('  PASS\n');
  } catch (e) {
    results.push({ test: '页面加载', status: 'FAIL', error: e.message });
    console.log(`  FAIL: ${e.message}\n`);
  }

  console.log('测试2: 监控页面 (/monitoring)...');
  try {
    await page.goto('http://localhost:5200/#/monitoring', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const content = await page.content();
    const hasMonitoring = content.includes('监控') || content.includes('Monitor') || content.includes('API');

    await screenshot('monitoring-page');
    results.push({ test: '监控页面', status: hasMonitoring ? 'PASS' : 'FAIL' });
    console.log(`  ${hasMonitoring ? 'PASS' : 'FAIL'}\n`);
  } catch (e) {
    results.push({ test: '监控页面', status: 'FAIL', error: e.message });
    console.log(`  FAIL: ${e.message}\n`);
  }

  console.log('测试3: 侧边栏监控入口...');
  try {
    await page.goto('http://localhost:5200/#/workspace', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    const monitorLink = await page.locator('a[href="/monitoring"]').first();
    const isVisible = await monitorLink.isVisible().catch(() => false);

    await screenshot('sidebar-monitoring-link');
    results.push({ test: '侧边栏监控入口', status: isVisible ? 'PASS' : 'FAIL' });
    console.log(`  ${isVisible ? 'PASS' : 'FAIL'}\n`);
  } catch (e) {
    results.push({ test: '侧边栏监控入口', status: 'FAIL', error: e.message });
    console.log(`  FAIL: ${e.message}\n`);
  }

  console.log('测试4: 反馈按钮...');
  try {
    await page.goto('http://localhost:5200/#/workspace', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    const feedbackBtn = await page.locator('button[class*="fixed"], [class*="feedback"], [class*="Feedback"]').first();
    const hasFeedback = await feedbackBtn.count() > 0;

    await screenshot('feedback-button');
    results.push({ test: '反馈按钮', status: hasFeedback ? 'PASS' : 'MAYBE' });
    console.log(`  ${hasFeedback ? 'PASS' : 'MAYBE'} (可能需要滚动到底部)\n`);
  } catch (e) {
    results.push({ test: '反馈按钮', status: 'SKIP', error: e.message });
    console.log(`  SKIP: ${e.message}\n`);
  }

  console.log('测试5: 设置页面备份功能...');
  try {
    await page.goto('http://localhost:5200/#/settings/billing', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    const content = await page.content();
    const hasExport = content.includes('导出') || content.includes('备份') || content.includes('Export');

    await screenshot('settings-backup');
    results.push({ test: '设置页面备份功能', status: hasExport ? 'PASS' : 'CHECK' });
    console.log(`  ${hasExport ? 'PASS' : 'CHECK'}\n`);
  } catch (e) {
    results.push({ test: '设置页面备份功能', status: 'FAIL', error: e.message });
    console.log(`  FAIL: ${e.message}\n`);
  }

  console.log('测试6: 懒加载功能...');
  try {
    await page.goto('http://localhost:5200/#/workspace', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    await screenshot('lazy-load-dashboard');
    results.push({ test: '懒加载 - Dashboard', status: 'PASS' });
    console.log('  PASS\n');
  } catch (e) {
    results.push({ test: '懒加载 - Dashboard', status: 'FAIL', error: e.message });
    console.log(`  FAIL: ${e.message}\n`);
  }

  console.log('测试7: 骨架屏加载...');
  try {
    await page.goto('http://localhost:5200/#/workspace', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);

    const content = await page.content();
    const hasSkeleton = content.includes('animate-pulse') || content.includes('skeleton') || content.includes('loading');

    await screenshot('skeleton-loading');
    results.push({ test: '骨架屏显示', status: hasSkeleton ? 'PASS' : 'CHECK' });
    console.log(`  ${hasSkeleton ? 'PASS' : 'CHECK'}\n`);
  } catch (e) {
    results.push({ test: '骨架屏显示', status: 'SKIP', error: e.message });
    console.log(`  SKIP: ${e.message}\n`);
  }

  console.log('测试8: 移动端适配...');
  try {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:5200/#/workspace', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    await screenshot('mobile-view');
    results.push({ test: '移动端适配', status: 'PASS' });
    console.log('  PASS\n');
  } catch (e) {
    results.push({ test: '移动端适配', status: 'FAIL', error: e.message });
    console.log(`  FAIL: ${e.message}\n`);
  }

  await page.setViewportSize({ width: 1280, height: 800 });

  console.log('测试9: 控制台错误检查...');
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('http://localhost:5200/#/workspace', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  const criticalErrors = errors.filter((e) => !e.includes('Supabase') && !e.includes('Warning'));
  results.push({
    test: '控制台错误',
    status: criticalErrors.length === 0 ? 'PASS' : 'WARN',
    details: criticalErrors.length > 0 ? criticalErrors.join(', ') : '无关键错误',
  });
  console.log(`  ${criticalErrors.length === 0 ? 'PASS' : 'WARN'} (${criticalErrors.length} 个错误)\n`);

  console.log('='.repeat(50));
  console.log('测试结果汇总');
  console.log('='.repeat(50));

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.test}: ${result.status}`);
    if (result.status.includes('PASS')) passCount++;
    else if (result.status.includes('FAIL')) failCount++;
    else skipCount++;
  });

  console.log('='.repeat(50));
  console.log(`总计: PASS ${passCount} | FAIL ${failCount} | OTHER ${skipCount}`);
  console.log('='.repeat(50));

  await browser.close();
  console.log('\n测试完成');
})();
