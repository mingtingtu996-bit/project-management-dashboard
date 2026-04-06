@echo off
chcp 65001 > nul
echo ============================================
echo 登录系统快速启动脚本
echo ============================================
echo.

REM 检查是否在正确的目录
if not exist "server\package.json" (
    echo ❌ 错误: 请在项目根目录运行此脚本
    echo 当前目录: %CD%
    pause
    exit /b 1
)

echo 📋 步骤1: 检查后端依赖
if not exist "server\node_modules" (
    echo ⚠️  node_modules 不存在，开始安装依赖...
    cd server
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo ❌ npm install 失败，请手动安装依赖
        pause
        exit /b 1
    )
    cd ..
    echo ✅ 依赖安装完成
) else (
    echo ✅ 依赖已存在
)

echo.
echo 📋 步骤2: 检查环境配置
if not exist "server\.env" (
    echo ❌ 缺少 server\.env 文件
    pause
    exit /b 1
)
if not exist "client\.env" (
    echo ❌ 缺少 client\.env 文件
    pause
    exit /b 1
)
echo ✅ 环境配置已就绪

echo.
echo 📋 步骤3: 提示执行Migration
echo ============================================
echo ⚠️  重要: 如果尚未执行数据库Migration，请按以下步骤操作:
echo.
echo 1. 打开 Supabase Dashboard: https://supabase.com/dashboard
echo 2. 选择项目: wwdrkjnbvcbfytwnnyvs
echo 3. 进入 SQL Editor
echo 4. 执行文件: server\migrations\050_add_login_fields.sql
echo 5. 默认管理员: admin / admin123
echo ============================================
echo.

set /p migrate="是否已执行Migration? (y/n): "
if /i "%migrate%" neq "y" (
    echo 请先执行Migration再继续
    pause
    exit /b 0
)

echo.
echo 📋 步骤4: 启动服务
echo ============================================
echo 后端服务将在新窗口启动
echo 前端服务将在新窗口启动
echo ============================================
echo.

REM 启动后端（新窗口）
start "后端服务" cmd /k "cd /d %CD%\server && npm run dev"

REM 等待2秒
timeout /t 2 /nobreak > nul

REM 启动前端（新窗口）
start "前端服务" cmd /k "cd /d %CD%\client && npm run dev"

echo.
echo ✅ 服务启动中...
echo.
echo 📋 服务地址:
echo   - 后端: http://localhost:3001
echo   - 前端: http://localhost:5173
echo   - 健康检查: http://localhost:3001/api/health
echo.
echo 📋 默认登录账号:
echo   - 用户名: admin
echo   - 密码: admin123
echo.
echo 按任意键关闭此窗口...
pause > nul
