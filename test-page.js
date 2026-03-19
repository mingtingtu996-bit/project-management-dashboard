const { chromium } = require('playwright');

(async () => {
  console.log('启动浏览器...');
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('Console:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PageError:', err.message));
  
  console.log('打开页面...');
  await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);
  
  console.log('---页面内容---');
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text);
  
  console.log('---等待用户关闭---');
  await new Promise(r => setTimeout(r, 30000));
  await browser.close();
})();
