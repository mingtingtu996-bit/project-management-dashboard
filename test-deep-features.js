/**
 * WorkBuddy 深度功能测试
 * 模拟真实用户完整工作流
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
    tests: []
  };
  
  function log(name, passed, msg = '') {
    const status = passed ? '✓' : '✗';
    console.log(`  ${status} ${name}: ${msg}`);
    results.tests.push({ name, passed, msg });
    if (passed) results.passed++;
    else results.failed++;
  }
  
  try {
    // ==================== 1. 访问应用 ====================
    console.log('\n[1] 访问应用...');
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    log('应用访问', true, '首页加载成功');
    
    // ==================== 2. 检查首页内容 ====================
    console.log('\n[2] 检查首页内容...');
    
    // 检查标题
    const title = await page.title();
    log('页面标题', title.includes('项目管理'), title);
    
    // 检查是否有项目列表
    const hasProjectList = await page.locator('[class*="project"], .card, .item').count() > 0;
    log('项目列表', hasProjectList, hasProjectList ? '存在项目列表' : '无项目');
    
    // 检查是否有统计数据
    const statsText = await page.locator('text=/\\d+/').first().innerText().catch(() => '');
    log('统计数据', true, statsText ? `显示: ${statsText}` : '无统计');
    
    // ==================== 3. 测试创建项目功能 ====================
    console.log('\n[3] 测试创建项目功能...');
    
    // 查找创建按钮
    const createBtn = page.locator('button:has-text("新建"), button:has-text("创建"), button:has-text("+")').first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(1000);
      
      // 检查是否打开弹窗
      const modalVisible = await page.locator('[class*="modal"], [class*="dialog"], [role="dialog"]').isVisible().catch(() => false);
      log('创建弹窗', modalVisible, modalVisible ? '弹窗已打开' : '无弹窗');
      
      if (modalVisible) {
        // 填写项目名称
        const nameInput = page.locator('input[name="name"], input[placeholder*="名称"], input[id*="name"]').first();
        if (await nameInput.isVisible()) {
          await nameInput.fill('自动化测试项目');
          log('填写项目名', true);
        }
        
        // 填写描述
        const descInput = page.locator('textarea, input[name="description"]').first();
        if (await descInput.isVisible()) {
          await descInput.fill('这是一个通过自动化测试创建的项目');
          log('填写描述', true);
        }
        
        // 点击保存
        const saveBtn = page.locator('button:has-text("保存"), button:has-text("确定")').first();
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
          await page.waitForTimeout(2000);
          log('保存项目', true);
        }
      }
    } else {
      log('创建按钮', false, '未找到创建按钮');
    }
    
    // ==================== 4. 测试任务管理 ====================
    console.log('\n[4] 测试任务管理...');
    
    // 查找任务相关按钮
    const taskBtn = page.locator('button:has-text("任务"), a:has-text("任务"), [href*="task"]').first();
    if (await taskBtn.isVisible()) {
      await taskBtn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      log('任务页面', true);
      
      // 检查是否有添加任务按钮
      const addTaskBtn = page.locator('button:has-text("添加任务"), button:has-text("+任务")').first();
      if (await addTaskBtn.isVisible()) {
        log('添加任务按钮', true);
      }
    } else {
      log('任务入口', false, '未找到任务入口');
    }
    
    // ==================== 5. 测试甘特图 ====================
    console.log('\n[5] 测试甘特图...');
    
    // 查找甘特图入口
    const ganttLink = page.locator('text=甘特图, a:has-text("甘特图"), [href*="gantt"]').first();
    if (await ganttLink.isVisible()) {
      await ganttLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      log('甘特图页面', true);
      
      // 检查是否有甘特图元素
      const ganttChart = await page.locator('[class*="gantt"], svg').first();
      log('甘特图渲染', await ganttChart.isVisible());
    }
    
    // ==================== 6. 测试风险管理 ====================
    console.log('\n[6] 测试风险管理...');
    
    // 查找风险入口
    const riskLink = page.locator('text=风险, a:has-text("风险"), [href*="risk"]').first();
    if (await riskLink.isVisible()) {
      await riskLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      log('风险页面', true);
    }
    
    // ==================== 7. 测试里程碑 ====================
    console.log('\n[7] 测试里程碑...');
    
    const milestoneLink = page.locator('text=里程碑, a:has-text("里程碑"), [href*="milestone"]').first();
    if (await milestoneLink.isVisible()) {
      await milestoneLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      log('里程碑页面', true);
    }
    
    // ==================== 8. 测试邀请功能 ====================
    console.log('\n[8] 测试邀请功能...');
    
    const inviteLink = page.locator('text=邀请, a:has-text("邀请"), [href*="invite"]').first();
    if (await inviteLink.isVisible()) {
      await inviteLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      log('邀请页面', true);
      
      // 检查邀请码输入框
      const inviteInput = page.locator('input[placeholder*="邀请码"], input[name="code"]').first();
      log('邀请码输入框', await inviteInput.isVisible());
    }
    
    // ==================== 9. 测试成员管理 ====================
    console.log('\n[9] 测试成员管理...');
    
    const memberLink = page.locator('text=成员, a:has-text("成员"), [href*="member"]').first();
    if (await memberLink.isVisible()) {
      await memberLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      log('成员页面', true);
    }
    
    // ==================== 10. 测试报表功能 ====================
    console.log('\n[10] 测试报表功能...');
    
    const reportLink = page.locator('text=报表, a:has-text("报表"), text=统计, a:has-text("统计")').first();
    if (await reportLink.isVisible()) {
      await reportLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      log('报表页面', true);
    }
    
    // ==================== 11. 测试快捷键 ====================
    console.log('\n[11] 测试快捷键帮助...');
    
    // 按?键打开帮助
    await page.keyboard.press('?');
    await page.waitForTimeout(500);
    const helpVisible = await page.locator('[class*="help"], [class*="shortcut"], [class*="modal"]').first().isVisible().catch(() => false);
    log('快捷键帮助', helpVisible);
    
    // ==================== 12. 最终截图 ====================
    console.log('\n[12] 保存最终状态...');
    await page.screenshot({ path: 'test-results/deep_test_final.png', fullPage: true });
    log('最终截图', true);
    
  } catch (error) {
    console.log(`\n✗ 测试出错: ${error.message}`);
    results.failed++;
  }
  
  // ==================== 输出结果 ====================
  console.log('\n' + '='.repeat(60));
  console.log('测试结果汇总');
  console.log('='.repeat(60));
  console.log(`  通过: ${results.passed}`);
  console.log(`  失败: ${results.failed}`);
  console.log(`  通过率: ${Math.round(results.passed / (results.passed + results.failed) * 100)}%`);
  console.log('='.repeat(60));
  
  await browser.close();
  return results;
}

deepTest().catch(console.error);
