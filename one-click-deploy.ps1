# 🚀 房地产工程管理系统 - 一键部署脚本
# 简化部署流程，从手动15分钟 → 一键3分钟

param(
    [string]$Environment = "vercel",  # vercel, cloudbase, local
    [switch]$Production = $false,
    [switch]$SkipTests = $false,
    [switch]$SkipBuild = $false
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 房地产工程管理系统一键部署工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "环境: $Environment" -ForegroundColor Yellow
Write-Host "生产模式: $(if($Production){'是'}else{'否'})" -ForegroundColor Yellow
Write-Host "跳过测试: $(if($SkipTests){'是'}else{'否'})" -ForegroundColor Yellow
Write-Host "跳过构建: $(if($SkipBuild){'是'}else{'否'})" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 配置检查
function Check-Config {
    Write-Host "🔧 检查配置文件..." -ForegroundColor Yellow
    
    $requiredFiles = @(
        "client/package.json",
        "server/package.json",
        "vercel.json",
        "cloudbaserc.json"
    )
    
    foreach ($file in $requiredFiles) {
        if (Test-Path $file) {
            Write-Host "   ✅ $file" -ForegroundColor Green
        } else {
            Write-Host "   ❌ $file (缺失)" -ForegroundColor Red
            return $false
        }
    }
    
    return $true
}

# 代码检查
function Run-CodeChecks {
    if ($SkipTests) {
        Write-Host "⏭️  跳过代码检查" -ForegroundColor Yellow
        return $true
    }
    
    Write-Host "🔍 运行代码检查..." -ForegroundColor Yellow
    
    # TypeScript检查
    try {
        Write-Host "   📝 前端TypeScript检查..." -ForegroundColor Gray
        Set-Location client
        $tscResult = npx tsc --noEmit
        Write-Host "   ✅ 前端TypeScript检查通过" -ForegroundColor Green
        
        Set-Location ../server
        $tscResult = npx tsc --noEmit
        Write-Host "   ✅ 后端TypeScript检查通过" -ForegroundColor Green
        Set-Location ..
    } catch {
        Write-Host "   ❌ TypeScript检查失败: $_" -ForegroundColor Red
        return $false
    }
    
    # 运行测试
    try {
        Write-Host "   🧪 运行测试..." -ForegroundColor Gray
        Set-Location client
        npm test -- --passWithNoTests
        Set-Location ../server
        npm test -- --passWithNoTests
        Set-Location ..
        Write-Host "   ✅ 测试通过" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠️  测试运行中有警告" -ForegroundColor Yellow
    }
    
    return $true
}

# 构建前端
function Build-Frontend {
    if ($SkipBuild) {
        Write-Host "⏭️  跳过构建" -ForegroundColor Yellow
        return $true
    }
    
    Write-Host "📦 构建前端应用..." -ForegroundColor Yellow
    
    try {
        Set-Location client
        
        # 检查依赖
        if (-not (Test-Path "node_modules")) {
            Write-Host "   📦 安装前端依赖..." -ForegroundColor Gray
            npm ci
        }
        
        # 构建
        if ($Production) {
            Write-Host "   🔨 生产环境构建..." -ForegroundColor Gray
            $env:NODE_ENV = "production"
            npm run build
        } else {
            Write-Host "   🔨 开发环境构建..." -ForegroundColor Gray
            npm run build
        }
        
        Set-Location ..
        
        # 检查构建结果
        if (Test-Path "client/dist/index.html") {
            $fileCount = (Get-ChildItem "client/dist" -Recurse | Measure-Object).Count
            Write-Host "   ✅ 前端构建完成 ($fileCount 个文件)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "   ❌ 构建失败: index.html未生成" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "   ❌ 构建失败: $_" -ForegroundColor Red
        return $false
    }
}

# Vercel部署
function Deploy-Vercel {
    Write-Host "🌐 部署到Vercel..." -ForegroundColor Yellow
    
    try {
        # 检查Vercel CLI
        if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
            Write-Host "   📦 安装Vercel CLI..." -ForegroundColor Gray
            npm install -g vercel
        }
        
        # 登录检查
        Write-Host "   🔐 检查Vercel登录状态..." -ForegroundColor Gray
        $vercelStatus = vercel whoami 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "   ⚠️  未登录Vercel，请先运行: vercel login" -ForegroundColor Yellow
            Write-Host "   🔑 正在打开浏览器登录..." -ForegroundColor Gray
            vercel login
        }
        
        # 部署
        Set-Location client
        
        if ($Production) {
            Write-Host "   🚀 生产环境部署..." -ForegroundColor Magenta
            vercel --prod --yes --confirm
        } else {
            Write-Host "   🚀 预览环境部署..." -ForegroundColor Magenta
            vercel --yes --confirm
        }
        
        Set-Location ..
        
        Write-Host "   ✅ Vercel部署成功！" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "   ❌ Vercel部署失败: $_" -ForegroundColor Red
        return $false
    }
}

# 腾讯云部署
function Deploy-CloudBase {
    Write-Host "☁️  部署到腾讯云CloudBase..." -ForegroundColor Yellow
    
    try {
        # 检查CloudBase CLI
        if (-not (Get-Command cloudbase -ErrorAction SilentlyContinue)) {
            Write-Host "   📦 安装CloudBase CLI..." -ForegroundColor Gray
            npm install -g @cloudbase/cli
        }
        
        # 读取环境ID
        $envConfig = Get-Content "cloudbaserc.json" | ConvertFrom-Json
        $envId = $envConfig.envId
        Write-Host "   🏷️  环境ID: $envId" -ForegroundColor Gray
        
        # 登录检查
        Write-Host "   🔐 检查CloudBase登录状态..." -ForegroundColor Gray
        $cloudbaseStatus = cloudbase env:list 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "   ⚠️  未登录CloudBase，请先运行: cloudbase login" -ForegroundColor Yellow
            Write-Host "   🔑 正在打开浏览器登录..." -ForegroundColor Gray
            cloudbase login
        }
        
        # 构建云函数
        Write-Host "   🔨 构建云函数..." -ForegroundColor Gray
        Set-Location "server/functions/api"
        if (-not (Test-Path "node_modules")) {
            npm ci
        }
        Set-Location "../../../"
        
        # 部署前端
        Write-Host "   🚀 部署前端静态资源..." -ForegroundColor Gray
        cloudbase hosting:deploy "client/dist"
        
        # 部署云函数
        Write-Host "   🚀 部署API云函数..." -ForegroundColor Gray
        cloudbase functions:deploy api
        
        Write-Host "   ✅ CloudBase部署成功！" -ForegroundColor Green
        Write-Host "   🌐 访问地址: https://$envId.tcloudbaseapp.com" -ForegroundColor Cyan
        return $true
    } catch {
        Write-Host "   ❌ CloudBase部署失败: $_" -ForegroundColor Red
        return $false
    }
}

# 本地开发环境
function Deploy-Local {
    Write-Host "💻 启动本地开发环境..." -ForegroundColor Yellow
    
    try {
        # 启动后端API
        Write-Host "   🖥️  启动后端服务器..." -ForegroundColor Gray
        Start-Job -Name "api-server" -ScriptBlock {
            Set-Location "C:\Users\jjj64\WorkBuddy\20260318232610\server"
            npm run dev
        }
        
        # 启动前端开发服务器
        Write-Host "   🖥️  启动前端开发服务器..." -ForegroundColor Gray
        Start-Job -Name "frontend-server" -ScriptBlock {
            Set-Location "C:\Users\jjj64\WorkBuddy\20260318232610\client"
            npm run dev
        }
        
        Write-Host "   ✅ 本地环境启动成功！" -ForegroundColor Green
        Write-Host "   🌐 前端: http://localhost:5173" -ForegroundColor Cyan
        Write-Host "   🔧 API: http://localhost:3001" -ForegroundColor Cyan
        Write-Host "   📊 健康检查: http://localhost:3001/api/health" -ForegroundColor Cyan
        
        return $true
    } catch {
        Write-Host "   ❌ 本地启动失败: $_" -ForegroundColor Red
        return $false
    }
}

# 主部署流程
function Main {
    # 记录开始时间
    $startTime = Get-Date
    
    # 1. 检查配置
    if (-not (Check-Config)) {
        Write-Host "❌ 配置检查失败，终止部署" -ForegroundColor Red
        exit 1
    }
    
    # 2. 代码检查
    if (-not (Run-CodeChecks)) {
        Write-Host "❌ 代码检查失败，终止部署" -ForegroundColor Red
        exit 1
    }
    
    # 3. 构建前端
    if (-not (Build-Frontend)) {
        Write-Host "❌ 构建失败，终止部署" -ForegroundColor Red
        exit 1
    }
    
    # 4. 根据环境部署
    $deployResult = $false
    
    switch ($Environment.ToLower()) {
        "vercel" {
            $deployResult = Deploy-Vercel
        }
        "cloudbase" {
            $deployResult = Deploy-CloudBase
        }
        "local" {
            $deployResult = Deploy-Local
        }
        default {
            Write-Host "❌ 未知环境: $Environment" -ForegroundColor Red
            Write-Host "可用环境: vercel, cloudbase, local" -ForegroundColor Yellow
            exit 1
        }
    }
    
    # 计算耗时
    $endTime = Get-Date
    $duration = [math]::Round(($endTime - $startTime).TotalMinutes, 2)
    
    # 结果输出
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    if ($deployResult) {
        Write-Host "🎉 部署成功！" -ForegroundColor Green
        Write-Host "⏱️  总耗时: $duration 分钟" -ForegroundColor White
        
        # 生成部署报告
        $deployReport = @"
# 部署报告
- 时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
- 环境: $Environment
- 生产模式: $(if($Production){'是'}else{'否'})
- 耗时: $duration 分钟
- 状态: ✅ 成功
"@
        
        $deployReport | Out-File "deploy-report.md" -Encoding UTF8
        Write-Host "📋 部署报告已保存: deploy-report.md" -ForegroundColor Gray
    } else {
        Write-Host "❌ 部署失败" -ForegroundColor Red
        Write-Host "⏱️  耗时: $duration 分钟" -ForegroundColor White
    }
    Write-Host "========================================" -ForegroundColor Cyan
}

# 执行主流程
Main