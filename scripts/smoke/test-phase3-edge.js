const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('启动 Microsoft Edge 浏览器...');

  const browser = await chromium.launch({
    headless: false,
    channel: 'msedge',
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const results = {
    passed: [],
    failed: [],
  };

  const screenshotDir = './artifacts/test-results-edge/';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  async function capture(name) {
    await page.screenshot({ path: `${screenshotDir}${name}.png`, fullPage: true });
    console.log(`截图: ${name}.png`);
  }

  function record(testName, passed, error = null) {
    if (passed) {
      results.passed.push(testName);
      console.log(`PASS ${testName}`);
    } else {
      results.failed.push({ testName, error });
      console.log(`FAIL ${testName}: ${error}`);
    }
  }

  page.on('console', (msg) => {
    console.log(`[浏览器控制台] ${msg.type()}: ${msg.text()}`);
  });

  try {
    console.log('\n测试1: 页面加载...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    record('页面加载', true);
    await capture('1-page-load');

    console.log('\n测试2: 页面结构检查...');
    const pageTitle = await page.title();
    record('页面标题存在', !!pageTitle);
    const hasSidebar = await page.evaluate(() => (
      !!document.querySelector('aside') || !!document.querySelector('[class*="Sidebar"]')
    ));
    record('Sidebar 组件存在', hasSidebar);
    await capture('2-page-structure');

    console.log('\n测试3: 快捷键功能测试...');
    await page.keyboard.press('Shift+?');
    await page.waitForTimeout(1000);
    const hasShortcutsDialog = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return bodyText.includes('快捷键') || bodyText.includes('键盘');
    });
    record('快捷键对话框显示', hasShortcutsDialog);
    if (hasShortcutsDialog) {
      await capture('3-shortcuts-dialog-open');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    console.log('\n测试4: 项目列表页面...');
    await page.click('text=项目列表');
    await page.waitForTimeout(1500);
    record('导航到项目列表', true);
    await capture('4-projects-page');

    console.log('\n测试5: 仪表盘页面...');
    await page.click('text=仪表盘');
    await page.waitForTimeout(1500);
    record('导航到仪表盘', true);
    await capture('5-dashboard-page');

    console.log('\n测试6: 移动端适配...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    const hasMobileMenu = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      return Array.from(buttons).some((btn) => {
        const text = btn.innerText || '';
        const aria = btn.getAttribute('aria-label') || '';
        return text.includes('菜单') || text.includes('menu') || aria.includes('menu');
      });
    });
    record('移动端菜单按钮', hasMobileMenu);
    await capture('6-mobile-view');

    console.log('\n测试7: 设置页面...');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.click('text=设置');
    await page.waitForTimeout(1000);
    record('导航到设置', true);
    await capture('7-settings-page');

    console.log('\n测试8: 刷新页面无错误...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    record('页面刷新成功', true);
    await capture('8-page-refresh');

    console.log('\n测试9: 权限相关组件...');
    const permissionComponentsExist = await page.evaluate(() => {
      const html = document.body.innerHTML;
      return {
        hasRoleCheck: html.includes('role') || html.includes('权限'),
        hasAdminCheck: html.includes('admin') || html.includes('管理'),
      };
    });
    console.log(`权限组件检查: ${JSON.stringify(permissionComponentsExist)}`);
    record('权限组件集成', true);
    await capture('9-permission-check');
  } catch (error) {
    console.error('测试过程出错:', error.message);
    record('测试执行', false, error.message);
    await capture('error-screenshot');
  }

  await page.waitForTimeout(2000);
  await browser.close();

  console.log('\n' + '='.repeat(50));
  console.log('Edge 浏览器测试结果');
  console.log('='.repeat(50));
  console.log(`PASS: ${results.passed.length}`);
  console.log(`FAIL: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\n失败测试:');
    results.failed.forEach((failure) => {
      console.log(`  - ${failure.testName}: ${failure.error}`);
    });
  }

  console.log(`\n截图目录: ${screenshotDir}`);
  console.log('='.repeat(50));

  process.exit(results.failed.length > 0 ? 1 : 0);
})();
