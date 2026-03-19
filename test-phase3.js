const { chromium } = require('playwright');

(async () => {
  console.log('🚀 启动浏览器...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const results = {
    passed: [],
    failed: []
  };
  
  const screenshotDir = './test-results-phase3/';
  const fs = require('fs');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // 辅助函数：截图
  async function capture(name) {
    await page.screenshot({ path: `${screenshotDir}${name}.png`, fullPage: true });
    console.log(`📸 截图: ${name}.png`);
  }

  // 辅助函数：记录结果
  function record(testName, passed, error = null) {
    if (passed) {
      results.passed.push(testName);
      console.log(`✅ ${testName}`);
    } else {
      results.failed.push({ testName, error });
      console.log(`❌ ${testName}: ${error}`);
    }
  }

  try {
    // 测试1: 页面加载
    console.log('\n📋 测试1: 页面加载...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    record('页面加载', true);
    await capture('page-load');

    // 测试2: 检查权限相关 UI 元素
    console.log('\n📋 测试2: 权限 UI 元素检查...');
    
    // 检查是否有权限相关的代码被正确编译
    const hasPermissionGuard = await page.evaluate(() => {
      // 检查 Sidebar 是否渲染
      const sidebar = document.querySelector('[class*="sidebar"]') || document.querySelector('aside');
      return !!sidebar;
    });
    record('Sidebar 渲染', hasPermissionGuard);
    
    // 检查页面是否正常显示
    const hasMainContent = await page.evaluate(() => {
      const main = document.querySelector('main') || document.querySelector('[class*="content"]');
      return !!main;
    });
    record('主内容区渲染', hasMainContent);
    await capture('permission-ui');

    // 测试3: 测试快捷键功能（确保交互正常）
    console.log('\n📋 测试3: 快捷键交互测试...');
    await page.keyboard.press('Shift+?');
    await page.waitForTimeout(500);
    
    const hasDialog = await page.evaluate(() => {
      return !!document.querySelector('[role="dialog"]') || 
             !!document.querySelector('.fixed') ||
             document.body.innerText.includes('快捷键');
    });
    record('快捷键对话框显示', hasDialog);
    if (hasDialog) {
      await capture('shortcuts-dialog');
    }
    
    // 关闭对话框
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 测试4: 检查控制台错误
    console.log('\n📋 测试4: 控制台错误检查...');
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const hasNoErrors = errors.length === 0;
    record('无控制台错误', hasNoErrors, hasNoErrors ? null : errors.join(', '));
    await capture('console-check');

    // 测试5: 测试导航到项目详情页
    console.log('\n📋 测试5: 导航测试...');
    await page.goto('http://localhost:5173/projects', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    
    // 检查是否有项目列表或相关内容
    const hasProjectContent = await page.evaluate(() => {
      return document.body.innerText.length > 100;
    });
    record('项目页面加载', hasProjectContent);
    await capture('projects-page');

    // 测试6: 检查骨架屏组件是否正常工作
    console.log('\n📋 测试6: 骨架屏组件...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    
    const hasContent = await page.evaluate(() => {
      return document.body.innerText.length > 50;
    });
    record('内容渲染', hasContent);
    await capture('skeleton-check');

    // 测试7: 移动端响应式检查
    console.log('\n📋 测试7: 移动端适配...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    
    const hasMobileMenu = await page.evaluate(() => {
      // 检查汉堡菜单按钮是否存在
      const buttons = document.querySelectorAll('button');
      return Array.from(buttons).some(btn => {
        const text = btn.innerText || btn.getAttribute('aria-label') || '';
        return text.includes('菜单') || text.includes('menu') || text.includes('Menu');
      });
    });
    record('移动端菜单按钮', hasMobileMenu);
    await capture('mobile-view');

  } catch (error) {
    console.error('测试过程出错:', error.message);
    record('测试执行', false, error.message);
  }

  await browser.close();

  // 输出结果摘要
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果摘要');
  console.log('='.repeat(50));
  console.log(`✅ 通过: ${results.passed.length}`);
  console.log(`❌ 失败: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n失败测试:');
    results.failed.forEach(f => {
      console.log(`  - ${f.testName}: ${f.error}`);
    });
  }
  
  console.log('\n📁 截图目录:', screenshotDir);
  console.log('='.repeat(50));

  process.exit(results.failed.length > 0 ? 1 : 0);
})();
