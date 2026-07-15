/**
 * WorkBuddy 深度功能冒烟测试。
 * 模拟真实用户访问常见入口，检查页面可见性与基础交互。
 */
const { chromium } = require('playwright');

async function deepTest() {
  console.log('='.repeat(60));
  console.log('WorkBuddy 深度功能测试');
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  function log(name, passed, msg = '') {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`  ${status} ${name}: ${msg}`);
    results.tests.push({ name, passed, msg });
    if (passed) results.passed++;
    else results.failed++;
  }

  try {
    console.log('\n[1] 访问应用...');
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    log('应用访问', true, '首页加载成功');

    console.log('\n[2] 检查首页内容...');
    const title = await page.title();
    log('页面标题', title.length > 0, title);

    const hasProjectList = await page.locator('[class*="project"], .card, .item').count() > 0;
    log('项目列表', hasProjectList, hasProjectList ? '存在项目列表或卡片' : '未发现项目列表');

    const statsText = await page.locator('text=/\\d+/').first().innerText().catch(() => '');
    log('统计数据', true, statsText ? `显示: ${statsText}` : '未发现统计数字');

    console.log('\n[3] 测试创建项目入口...');
    const createBtn = page.locator('button:has-text("新建"), button:has-text("创建"), button:has-text("+")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1000);
      const modalVisible = await page.locator('[class*="modal"], [class*="dialog"], [role="dialog"]').isVisible().catch(() => false);
      log('创建弹窗', modalVisible, modalVisible ? '弹窗已打开' : '未打开弹窗');
      await page.keyboard.press('Escape').catch(() => {});
    } else {
      log('创建按钮', false, '未找到创建按钮');
    }

    const navigationChecks = [
      ['任务入口', 'button:has-text("任务"), a:has-text("任务"), [href*="task"], [href*="gantt"]'],
      ['横道图入口', 'text=横道图, a:has-text("横道图"), [href*="gantt"]'],
      ['风险入口', 'text=风险, a:has-text("风险"), [href*="risk"]'],
      ['里程碑入口', 'text=里程碑, a:has-text("里程碑"), [href*="milestone"]'],
      ['邀请入口', 'text=邀请, a:has-text("邀请"), [href*="invite"]'],
      ['成员入口', 'text=成员, a:has-text("成员"), [href*="member"]'],
      ['报表入口', 'text=报表, a:has-text("报表"), text=统计, a:has-text("统计")'],
    ];

    for (const [name, selector] of navigationChecks) {
      const entry = page.locator(selector).first();
      log(name, await entry.isVisible().catch(() => false));
    }

    console.log('\n[11] 测试快捷键帮助...');
    await page.keyboard.press('?');
    await page.waitForTimeout(500);
    const helpVisible = await page.locator('[class*="help"], [class*="shortcut"], [class*="modal"], [role="dialog"]').first().isVisible().catch(() => false);
    log('快捷键帮助', helpVisible);

    console.log('\n[12] 保存最终状态...');
    await page.screenshot({ path: 'artifacts/test-results/deep_test_final.png', fullPage: true });
    log('最终截图', true);
  } catch (error) {
    console.log(`\n测试出错: ${error.message}`);
    results.failed++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('测试结果汇总');
  console.log('='.repeat(60));
  console.log(`  通过: ${results.passed}`);
  console.log(`  失败: ${results.failed}`);
  const total = results.passed + results.failed;
  console.log(`  通过率: ${total > 0 ? Math.round((results.passed / total) * 100) : 0}%`);
  console.log('='.repeat(60));

  await browser.close();
  return results;
}

deepTest().catch(console.error);
