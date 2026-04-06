# CloudBase Deployment Script
# Deploys the Project Management System to CloudBase

$envId = "project-management-8d1l147388982"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CloudBase Deployment Script" -ForegroundColor Cyan
Write-Host "Environment ID: $envId" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build frontend
Write-Host "Step 1: Building frontend..." -ForegroundColor Yellow
Set-Location -Path "c:\Users\jjj64\WorkBuddy\20260318232610\client"

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Frontend build successful!" -ForegroundColor Green
Write-Host ""

# Step 2: Deploy cloud function
Write-Host "Step 2: Deploying cloud function..." -ForegroundColor Yellow
Set-Location -Path "c:\Users\jjj64\WorkBuddy\20260318232610"

# Install function dependencies
Set-Location -Path "server\functions\api"
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing function dependencies..." -ForegroundColor Yellow
    npm install
}
Set-Location -Path "c:\Users\jjj64\WorkBuddy\20260318232610"

# Deploy function
cloudbase functions:deploy api

if ($LASTEXITCODE -ne 0) {
    Write-Host "Cloud function deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Cloud function deployed successfully!" -ForegroundColor Green
Write-Host ""

# Step 3: Deploy frontend
Write-Host "Step 3: Deploying frontend..." -ForegroundColor Yellow

# Copy dist to root for deployment
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}
Copy-Item -Recurse "client\dist" "dist"

# Deploy hosting
cloudbase hosting:deploy dist

if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Frontend deployed successfully!" -ForegroundColor Green
Write-Host ""

# Step 4: Show deployment info
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your application is now live at:" -ForegroundColor Yellow
Write-Host "https://$envId.tcloudbaseapp.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cloud Function API:" -ForegroundColor Yellow
Write-Host "https://$envId.service.tcloudbase.com/api" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Visit the URL above to verify deployment" -ForegroundColor White
Write-Host "2. Check CloudBase console for logs and monitoring" -ForegroundColor White
Write-Host "3. Configure custom domain if needed" -ForegroundColor White
