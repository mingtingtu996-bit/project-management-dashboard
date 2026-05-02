# One-click helper for the current WorkBuddy deployment model.
# Production deploys now target a self-hosted server with Docker Compose.

param(
    [ValidateSet("self-hosted", "local")]
    [string]$Environment = "self-hosted",

    [switch]$SkipTests = $false,
    [switch]$SkipBuild = $false,

    [string]$AppDir = $env:APP_DIR,
    [string]$ReleaseSha = $env:RELEASE_SHA,
    [string]$ComposeFile = "deploy/docker-compose.lighthouse.yml",
    [string]$EnvFile = "deploy/env/server.production.env",
    [string]$HealthUrl = "http://127.0.0.1/api/health"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AppDir)) {
    $AppDir = (Get-Location).Path
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "WorkBuddy deployment helper" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Skip tests: $SkipTests" -ForegroundColor Yellow
Write-Host "Skip build: $SkipBuild" -ForegroundColor Yellow
Write-Host "App dir: $AppDir" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Invoke-Step {
    param(
        [string]$Label,
        [scriptblock]$Action
    )

    Write-Host "==> $Label" -ForegroundColor Yellow
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

function Check-Config {
    Write-Host "Checking required files..." -ForegroundColor Yellow

    $requiredFiles = @(
        "client/package.json",
        "server/package.json",
        "scripts/deploy-lighthouse-server.sh",
        "deploy/docker-compose.lighthouse.yml",
        "client/Dockerfile",
        "server/Dockerfile"
    )

    foreach ($file in $requiredFiles) {
        if (Test-Path $file) {
            Write-Host "   OK $file" -ForegroundColor Green
        } else {
            Write-Host "   Missing $file" -ForegroundColor Red
            return $false
        }
    }

    return $true
}

function Run-CodeChecks {
    if ($SkipTests) {
        Write-Host "Skipping code checks." -ForegroundColor Yellow
        return
    }

    Invoke-Step "Client typecheck" {
        pnpm --dir client run typecheck
    }

    Invoke-Step "Client tests" {
        pnpm --dir client run test:run
    }

    Invoke-Step "Server typecheck" {
        Push-Location server
        try {
            npm run typecheck
        } finally {
            Pop-Location
        }
    }

    Invoke-Step "Server tests" {
        Push-Location server
        try {
            npm test
        } finally {
            Pop-Location
        }
    }
}

function Build-App {
    if ($SkipBuild) {
        Write-Host "Skipping build." -ForegroundColor Yellow
        return
    }

    Invoke-Step "Client build" {
        pnpm --dir client run build
    }

    Invoke-Step "Server build" {
        Push-Location server
        try {
            npm run build
        } finally {
            Pop-Location
        }
    }
}

function Resolve-ReleaseSha {
    if (-not [string]::IsNullOrWhiteSpace($ReleaseSha)) {
        return $ReleaseSha
    }

    $sha = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($sha)) {
        throw "Cannot resolve RELEASE_SHA. Pass -ReleaseSha or run inside a git repository."
    }

    return $sha.Trim()
}

function Deploy-SelfHosted {
    if (-not (Get-Command bash -ErrorAction SilentlyContinue)) {
        throw "bash is required to run scripts/deploy-lighthouse-server.sh."
    }

    $resolvedSha = Resolve-ReleaseSha

    $previousAppDir = $env:APP_DIR
    $previousReleaseSha = $env:RELEASE_SHA
    $previousComposeFile = $env:COMPOSE_FILE
    $previousEnvFile = $env:ENV_FILE
    $previousHealthUrl = $env:HEALTH_URL

    try {
        $env:APP_DIR = $AppDir
        $env:RELEASE_SHA = $resolvedSha
        $env:COMPOSE_FILE = $ComposeFile
        $env:ENV_FILE = $EnvFile
        $env:HEALTH_URL = $HealthUrl

        Invoke-Step "Self-hosted Docker Compose deploy" {
            bash scripts/deploy-lighthouse-server.sh
        }
    } finally {
        $env:APP_DIR = $previousAppDir
        $env:RELEASE_SHA = $previousReleaseSha
        $env:COMPOSE_FILE = $previousComposeFile
        $env:ENV_FILE = $previousEnvFile
        $env:HEALTH_URL = $previousHealthUrl
    }
}

function Start-Local {
    Write-Host "Starting local development services..." -ForegroundColor Yellow

    Start-Job -Name "workbuddy-api-server" -ScriptBlock {
        Set-Location $using:AppDir
        Set-Location server
        npm run dev
    } | Out-Null

    Start-Job -Name "workbuddy-frontend-server" -ScriptBlock {
        Set-Location $using:AppDir
        Set-Location client
        npm run dev
    } | Out-Null

    Write-Host "Local API: http://localhost:3001" -ForegroundColor Cyan
    Write-Host "Local web: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "Use Get-Job to inspect background jobs." -ForegroundColor Gray
}

function Main {
    $startTime = Get-Date

    if (-not (Check-Config)) {
        exit 1
    }

    if ($Environment -eq "local") {
        Start-Local
        return
    }

    Run-CodeChecks
    Build-App
    Deploy-SelfHosted

    $duration = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 2)
    Write-Host ""
    Write-Host "Deployment helper finished in $duration minutes." -ForegroundColor Green
}

Main
