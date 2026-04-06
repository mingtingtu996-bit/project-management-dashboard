const { chromium } = require('playwright');

async function testDashboard() {
  console.log('启动浏览器...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('打开网页 http://localhost:5173');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

    console.log('等待页面加载完成...');
    await page.waitForTimeout(2000);

    // 截图1: 初始状态
    console.log('截图1: 页面初始状态');
    await page.screenshot({ path: 'test-screenshot-1-initial.png', fullPage: true });

    // 检查页面标题
    const title = await page.title();
    console.log('页面标题:', title);

    // 检查是否有任务列表
    const taskElements = await page.$$('.task-item, [data-testid="task"], .task-row');
    console.log(`找到 ${taskElements.length} 个任务元素`);

    // 检查是否有进度条
    const progressBars = await page.$$('.progress-bar, [role="progressbar"]');
    console.log(`找到 ${progressBars.length} 个进度条`);

    // 截图2: 页面详情
    console.log('截图2: 页面详细信息');
    await page.screenshot({ path: 'test-screenshot-2-details.png', fullPage: true });

    console.log('测试完成！');
    console.log('截图已保存:');
    console.log('  - test-screenshot-1-initial.png');
    console.log('  - test-screenshot-2-details.png');

  } catch (error) {
    console.error('测试失败:', error.message);
  } finally {
    await browser.close();
  }
}

testDashboard().catch(console.error);
