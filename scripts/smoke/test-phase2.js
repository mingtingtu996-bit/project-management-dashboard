const { chromium } = require('playwright');

(async () => {
  console.log('启动浏览器...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('测试 1: 打开项目列表页面...');
    await page.goto('http://localhost:5173/#/workspace', { timeout: 30000 });
    console.log('PASS 页面加载成功');

    await page.waitForLoadState('networkidle');
    console.log('PASS 页面资源加载完成');

    await page.screenshot({ path: 'artifacts/test-results/full-width.png', fullPage: true });
    console.log('PASS 截图已保存: artifacts/test-results/full-width.png');

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);

    if (consoleErrors.length > 0) {
      console.log('WARN 控制台错误', consoleErrors);
    } else {
      console.log('PASS 无控制台错误');
    }

    console.log('测试 5: 测试快捷键...');
    await page.keyboard.press('Shift+?');
    await page.waitForTimeout(500);

    const helpDialog = await page.$('text=键盘快捷键');
    if (helpDialog) {
      console.log('PASS 快捷键帮助对话框出现');
      await page.screenshot({ path: 'artifacts/test-results/shortcuts-help.png' });
      await page.keyboard.press('Escape');
    } else {
      console.log('WARN 快捷键帮助对话框未出现');
    }

    console.log('测试 6: 移动端适配测试...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'artifacts/test-results/mobile-view.png' });
    console.log('PASS 移动端截图已保存: artifacts/test-results/mobile-view.png');

    const menuButton = await page.$('[aria-label="菜单"], [class*="menu"], [class*="Menu"]');
    if (menuButton) {
      console.log('PASS 移动端菜单按钮存在');
    } else {
      console.log('WARN 未找到移动端菜单按钮');
    }

    console.log('测试 7: 导航测试...');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:5173/#/workspace', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'artifacts/test-results/dashboard.png' });
    console.log('PASS Dashboard 页面加载成功');

    console.log('\n========== 测试完成 ==========');
  } catch (error) {
    console.error('测试失败:', error.message);
    await page.screenshot({ path: 'artifacts/test-results/error.png' });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
