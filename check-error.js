const { chromium } = require('playwright');

(async () => {
  console.log('🚀 启动 Edge 浏览器查看错误...');
  
  // 有头模式，可以看到实际页面
  const browser = await chromium.launch({ 
    channel: 'msedge',
    headless: false
  });
  
  const page = await browser.newPage();
  
  // 收集错误
  const errors = [];
  page.on('pageerror', err => {
    errors.push(`PageError: ${err.message}`);
    console.log('PageError:', err.message);
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console: ${msg.text()}`);
      console.log('Console Error:', msg.text());
    }
  });
  
  try {
    console.log('📂 打开页面...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    // 等待足够长让React渲染
    await page.waitForTimeout(8000);
    
    // 获取页面标题
    const title = await page.title();
    console.log(`📄 页面标题: ${title}`);
    
    // 截图
    await page.screenshot({ path: './vite-error.png', fullPage: true });
    console.log('📸 截图已保存: vite-error.png');
    
    // 检查根元素内容
    const rootContent = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? root.innerHTML.substring(0, 500) : 'ROOT NOT FOUND';
    });
    console.log('Root内容:', rootContent);
    
  } catch (e) {
    console.error('错误:', e.message);
  }
  
  console.log('\n收集到的错误:');
  errors.forEach(e => console.log(e));
  
  // 保持浏览器打开，让用户查看
  console.log('\n按回车键关闭浏览器...');
  
  await new Promise(resolve => {
    process.stdin.once('data', () => {
      browser.close();
      resolve();
    });
  });
})();
