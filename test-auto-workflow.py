"""
WorkBuddy 项目管理应用自动化测试
模拟真实用户使用场景
"""
from playwright.sync_api import sync_playwright
import time

def test_workflow():
    """模拟真实用户完整工作流程"""
    
    with sync_playwright() as p:
        # 启动浏览器
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()
        
        # 收集控制台日志
        console_logs = []
        page.on('console', lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        
        print("=" * 60)
        print("WorkBuddy 自动化测试开始")
        print("=" * 60)
        
        # ==================== 步骤1: 访问首页 ====================
        print("\n[步骤1] 访问首页...")
        page.goto('http://localhost:5173')
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        
        # 截图
        page.screenshot(path='c:/Users/jjj64/WorkBuddy/20260318232610/test-results/01_homepage.png', full_page=True)
        print("  ✓ 首页截图已保存")
        
        # ==================== 步骤2: 检查页面元素 ====================
        print("\n[步骤2] 检查页面元素...")
        
        # 检查是否有项目列表
        try:
            project_list = page.locator('[class*="project"], [class*="card"]').first
            if project_list.is_visible():
                print("  ✓ 找到项目列表区域")
        except:
            print("  - 项目列表区域未找到（可能需要登录）")
        
        # 检查导航菜单
        try:
            nav_items = page.locator('nav, header, [class*="nav"]').all()
            print(f"  - 找到 {len(nav_items)} 个导航元素")
        except:
            print("  - 导航区域未找到")
        
        # ==================== 步骤3: 模拟创建项目 ====================
        print("\n[步骤3] 模拟创建项目...")
        
        # 查找创建按钮
        create_buttons = page.locator('button:has-text("创建"), button:has-text("新建"), [class*="create"]').all()
        print(f"  - 找到 {len(create_buttons)} 个可能的创建按钮")
        
        for btn in create_buttons[:3]:
            try:
                text = btn.inner_text()
                print(f"    按钮: {text[:30]}")
            except:
                pass
        
        # ==================== 步骤4: 检查功能模块 ====================
        print("\n[步骤4] 检查功能模块...")
        
        # 检查是否有甘特图
        gantt_elements = page.locator('[class*="gantt"], [class*="chart"]').all()
        print(f"  - 找到 {len(gantt_elements)} 个图表元素")
        
        # 检查是否有风险相关元素
        risk_elements = page.locator('[class*="risk"], text=风险').all()
        print(f"  - 找到 {len(risk_elements)} 个风险相关元素")
        
        # 检查里程碑
        milestone_elements = page.locator('[class*="milestone"], text=里程碑').all()
        print(f"  - 找到 {len(milestone_elements)} 个里程碑元素")
        
        # ==================== 步骤5: 模拟用户交互 ====================
        print("\n[步骤5] 模拟用户交互...")
        
        # 尝试点击第一个可见的按钮
        buttons = page.locator('button').all()
        clicked = False
        for btn in buttons[:5]:
            try:
                if btn.is_visible() and btn.is_enabled():
                    btn.click()
                    page.wait_for_load_state('networkidle')
                    clicked = True
                    print(f"  ✓ 点击了按钮: {btn.inner_text()[:20]}")
                    break
            except:
                continue
        
        if not clicked:
            print("  - 未找到可点击的按钮")
        
        time.sleep(1)
        
        # ==================== 步骤6: 检查错误 ====================
        print("\n[步骤6] 检查控制台错误...")
        errors = [log for log in console_logs if 'error' in log.lower()]
        if errors:
            print(f"  ⚠️ 发现 {len(errors)} 个错误:")
            for err in errors[:3]:
                print(f"    {err[:100]}")
        else:
            print("  ✓ 无控制台错误")
        
        # ==================== 步骤7: 页面响应 ====================
        print("\n[步骤7] 测试页面响应...")
        
        # 模拟窗口大小变化
        page.set_viewport_size({'width': 375, 'height': 667})  # 手机尺寸
        page.wait_for_timeout(500)
        page.screenshot(path='c:/Users/jjj64/WorkBuddy/20260318232610/test-results/07_mobile.png', full_page=True)
        print("  ✓ 移动端截图已保存")
        
        page.set_viewport_size({'width': 1920, 'height': 1080})  # 恢复桌面尺寸
        
        # ==================== 步骤8: 检查网络请求 ====================
        print("\n[步骤8] 检查API响应...")
        
        # 检查后端API
        try:
            response = page.request.get('http://localhost:3001/api/health')
            print(f"  - 健康检查API: {response.status}")
        except Exception as e:
            print(f"  - 后端API请求失败: {str(e)[:50]}")
        
        # ==================== 测试完成 ====================
        print("\n" + "=" * 60)
        print("测试完成!")
        print("=" * 60)
        
        # 最终截图
        page.screenshot(path='c:/Users/jjj64/WorkBuddy/20260318232610/test-results/08_final.png', full_page=True)
        print("\n📁 所有截图已保存到 test-results 目录")
        
        browser.close()
        
        return True

if __name__ == '__main__':
    test_workflow()
