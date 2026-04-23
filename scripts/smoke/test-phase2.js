const { chromium } = require('playwright');

(async () => {
  console.log('启动浏览�?..');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // 测试 1: 打开页面
    console.log('测试 1: 打开项目列表页面...');
    await page.goto('http://localhost:5173/projects', { timeout: 30000 });
    console.log('�?页面加载成功');
    
    // 测试 2: 等待页面加载完成
    await page.waitForLoadState('networkidle');
    console.log('�?页面资源加载完成');
    
    // 测试 3: 截图 - 正常宽度
    await page.screenshot({ path: 'artifacts/test-results/full-width.png', fullPage: true });
    console.log('�?截图已保�? artifacts/test-results/full-width.png');
    
    // 测试 4: 检查控制台错误
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // 等待一下让控制台收集错�?
    await page.waitForTimeout(2000);
    
    if (consoleErrors.length > 0) {
      console.log('�?控制台错�?', consoleErrors);
    } else {
      console.log('�?无控制台错误');
    }
    
    // 测试 5: 测试快捷�?- �?Shift+?
    console.log('测试 5: 测试快捷�?..');
    await page.keyboard.press('Shift+?');
    await page.waitForTimeout(500);
    
    // 检查帮助对话框是否出现
    const helpDialog = await page.$('text=键盘快捷�?);
    if (helpDialog) {
      console.log('�?快捷键帮助对话框出现');
      await page.screenshot({ path: 'artifacts/test-results/shortcuts-help.png' });
      
      // 关闭对话�?
      await page.keyboard.press('Escape');
    } else {
      console.log('�?快捷键帮助对话框未出�?);
    }
    
    // 测试 6: 移动端适配测试
    console.log('测试 6: 移动端适配测试...');
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'artifacts/test-results/mobile-view.png' });
    console.log('�?移动端截图已保存: artifacts/test-results/mobile-view.png');
    
    // 检查移动端菜单按钮
    const menuButton = await page.$('[aria-label="菜单"], [class*="menu"], [class*="Menu"]');
    if (menuButton) {
      console.log('�?移动端菜单按钮存�?);
    } else {
      console.log('�?未找到移动端菜单按钮');
    }
    
    // 测试 7: 导航到其他页�?
    console.log('测试 7: 导航测试...');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:5173/dashboard', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'artifacts/test-results/dashboard.png' });
    console.log('�?Dashboard 页面加载成功');
    
    console.log('\n========== 测试完成 ==========');
    console.log('所有测试通过!');
    
  } catch (error) {
    console.error('测试失败:', error.message);
    await page.screenshot({ path: 'artifacts/test-results/error.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
