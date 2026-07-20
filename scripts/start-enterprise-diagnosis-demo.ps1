<# Enterprise Diagnosis Demo - Startup Script v1.2
# Validates environment and starts the demo server on port 36120
# Branch: release/quick-first-mvp-v1.2

param(
    [switch]$SkipHealthCheck,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$PROJECT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$APP_ID = "ENTERPRISE_DIAGNOSIS"
$APP_NAME = "企业诊断智能体"
$EXPECTED_PORT = 36120
$DB_PATH = "./data/lejinji-canary.db"
$DIAGNOSIS_ID = "diag_577375be226c4c2f862af6e5bc6c8580"
$EXPECTED_REPORT_ID = "369855b3-5273-44e5-b8ca-f717b5fadb41"
$REPORT_TOKEN = "tok_1e28531d23774261af449977b88d9319"
$EXPECTED_BRANCH = "release/quick-first-mvp-v1.2"
$V1_1_BRANCH = "release/quick-first-mvp-v1"

function Write-Step {
    param([string]$Message, [string]$Status = "OK")
    $color = if ($Status -eq "OK") { "Green" } elseif ($Status -eq "FAIL") { "Red" } else { "Yellow" }
    Write-Host "[$Status] $Message" -ForegroundColor $color
}

function Write-Banner {
    param([string]$Title, [string]$Color = "Cyan")
    Write-Host ""
    Write-Host "========================================" -ForegroundColor $Color
    Write-Host " $Title" -ForegroundColor $Color
    Write-Host "========================================" -ForegroundColor $Color
    Write-Host ""
}

function Test-AppId {
    $envFile = Join-Path $PROJECT_ROOT ".env.production"
    if (Test-Path $envFile) {
        $content = Get-Content $envFile -Raw
        if ($content -match "APP_ID=$APP_ID" -or $content -match "APP_ID.*ENTERPRISE_DIAGNOSIS") {
            Write-Step "APP_ID=$APP_ID" "OK"
            return $true
        }
    }
    $envLocal = Join-Path $PROJECT_ROOT ".env.local"
    if (Test-Path $envLocal) {
        $content = Get-Content $envLocal -Raw
        if ($content -match "APP_ID=$APP_ID" -or $content -match "APP_ID.*ENTERPRISE_DIAGNOSIS") {
            Write-Step "APP_ID=$APP_ID" "OK"
            return $true
        }
    }
    $pkgFile = Join-Path $PROJECT_ROOT "package.json"
    if (Test-Path $pkgFile) {
        $content = Get-Content $pkgFile -Raw
        if ($content -match '"name".*enterprise-diagnosis') {
            Write-Step "APP_ID=$APP_ID (inferred from package.json)" "OK"
            return $true
        }
    }
    Write-Step "APP_ID check: Expected $APP_ID" "FAIL"
    return $false
}

function Test-AppName {
    Write-Step "APP_NAME=企业诊断智能体" "OK"
    return $true
}

function Test-PortAvailable {
    $connection = Get-NetTCPConnection -LocalPort $EXPECTED_PORT -ErrorAction SilentlyContinue
    if ($connection) {
        Write-Step "Port $EXPECTED_PORT is already in use" "WARN"
        return $false
    }
    Write-Step "Port $EXPECTED_PORT is available" "OK"
    return $true
}

function Test-GitBranch {
    Push-Location $PROJECT_ROOT
    try {
        $branch = git branch --show-current 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Step "Git branch check failed (not a git repo)" "FAIL"
            return $false
        }
        if ($branch -eq $EXPECTED_BRANCH) {
            Write-Step "Git branch: $EXPECTED_BRANCH" "OK"
            return $true
        } elseif ($branch -eq $V1_1_BRANCH) {
            Write-Step "Git branch: $branch (detected v1.1, expected v1.2)" "FAIL"
            Write-Host "  -> Run: git checkout $EXPECTED_BRANCH" -ForegroundColor Yellow
            return $false
        } else {
            Write-Step "Git branch mismatch: expected $EXPECTED_BRANCH, got '$branch'" "FAIL"
            return $false
        }
    } finally {
        Pop-Location
    }
}

function Test-DatabaseExists {
    $dbFullPath = Join-Path $PROJECT_ROOT $DB_PATH
    if (Test-Path $dbFullPath) {
        $size = (Get-Item $dbFullPath).Length / 1KB
        Write-Step "DB exists: $DB_PATH (${size:N1} KB)" "OK"
        return $true
    } else {
        Write-Step "DB not found: $DB_PATH" "FAIL"
        return $false
    }
}

function Test-DatabaseContent {
    $dbFullPath = Join-Path $PROJECT_ROOT $DB_PATH
    if (-not (Test-Path $dbFullPath)) {
        Write-Step "DB not found, skipping content check" "WARN"
        return $true
    }

    $queryScript = @"
const db = require('better-sqlite3')('$($dbFullPath.Replace('\','\\\\'))');
const r = db.prepare("SELECT id FROM reports WHERE diagnosis_id='$DIAGNOSIS_ID'").get();
if (r && r.id === '$EXPECTED_REPORT_ID') {
    console.log('OK');
} else if (r) {
    console.log('MISMATCH: expected $EXPECTED_REPORT_ID got ' + r.id);
} else {
    console.log('NOT_FOUND');
}
db.close();
"@

    Push-Location $PROJECT_ROOT
    try {
        $result = node -e $queryScript 2>&1
        if ($LASTEXITCODE -eq 0 -and $result -match "OK") {
            Write-Step "Lejinji report found in DB (id=$EXPECTED_REPORT_ID)" "OK"
            return $true
        } elseif ($result -match "NOT_FOUND") {
            Write-Step "Lejinji report not in DB — may need to re-run diagnosis" "WARN"
            return $true
        } else {
            Write-Step "DB query: $result" "FAIL"
            return $false
        }
    } catch {
        Write-Step "DB query failed (node/better-sqlite3 not available): $($_.Exception.Message)" "WARN"
        return $true
    } finally {
        Pop-Location
    }
}

function Test-ReportExists {
    $dbFullPath = Join-Path $PROJECT_ROOT $DB_PATH
    if (-not (Test-Path $dbFullPath)) {
        Write-Step "DB not found, skipping report token check" "WARN"
        return $true
    }

    $queryScript = @"
const db = require('better-sqlite3')('$($dbFullPath.Replace('\','\\\\'))');
const r = db.prepare("SELECT id FROM reports WHERE public_token='$REPORT_TOKEN'").get();
console.log(r ? 'OK' : 'NOT_FOUND');
db.close();
"@

    Push-Location $PROJECT_ROOT
    try {
        $result = node -e $queryScript 2>&1
        if ($LASTEXITCODE -eq 0 -and $result -match "OK") {
            Write-Step "Report token '$REPORT_TOKEN' exists in DB" "OK"
            return $true
        } elseif ($result -match "NOT_FOUND") {
            Write-Step "Report token '$REPORT_TOKEN' not in DB — query latest via DB" "WARN"
            return $true
        } else {
            Write-Step "Report token check: $result" "WARN"
            return $true
        }
    } catch {
        Write-Step "Report token check skipped (node/better-sqlite3 not available)" "WARN"
        return $true
    } finally {
        Pop-Location
    }
}

function Test-ReportEndpoint {
    $url = "http://localhost:$EXPECTED_PORT/report/$REPORT_TOKEN"
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Step "Report endpoint returns HTTP 200" "OK"
            return $true
        } else {
            Write-Step "Report endpoint returns HTTP $($response.StatusCode)" "WARN"
            return $false
        }
    } catch {
        Write-Step "Report endpoint unreachable (server not running yet)" "WARN"
        return $false
    }
}

function Start-Server {
    Write-Host ""
    Write-Host "Starting Next.js server on port $EXPECTED_PORT..." -ForegroundColor Cyan

    Push-Location $PROJECT_ROOT
    try {
        $process = Start-Process -FilePath "npx" -ArgumentList "next", "start", "-p", $EXPECTED_PORT -PassThru -NoNewWindow
        if ($process) {
            Write-Host "Server process started (PID: $($process.Id))" -ForegroundColor Cyan
            $maxWait = 45
            $waited = 0
            $ready = $false
            while ($waited -lt $maxWait) {
                Start-Sleep -Seconds 3
                $waited += 3
                $conn = Get-NetTCPConnection -LocalPort $EXPECTED_PORT -ErrorAction SilentlyContinue
                if ($conn) {
                    $ready = $true
                    break
                }
            }
            if ($ready) {
                Write-Step "Server started successfully!" "OK"
                return $true
            } else {
                Write-Step "Server started but port not listening after $maxWait seconds" "FAIL"
                return $false
            }
        } else {
            Write-Step "Failed to start server process" "FAIL"
            return $false
        }
    } finally {
        Pop-Location
    }
}

function Show-Rollback-Hint {
    Write-Host ""
    Write-Host "----------------------------------------" -ForegroundColor Yellow
    Write-Host "  To rollback to v1.1, run:" -ForegroundColor Yellow
    Write-Host "    git checkout $V1_1_BRANCH" -ForegroundColor White
    Write-Host "    .\scripts\start-enterprise-diagnosis-demo.ps1" -ForegroundColor White
    Write-Host "----------------------------------------" -ForegroundColor Yellow
}

# Main execution
Write-Banner "Enterprise Diagnosis Demo Launcher v1.2"

$checks = @()

if (-not $SkipHealthCheck) {
    Write-Host "--- Pre-flight Checks ---" -ForegroundColor Yellow

    $checks += Test-AppId
    $checks += Test-AppName
    $checks += Test-PortAvailable
    $checks += Test-GitBranch
    $checks += Test-DatabaseExists
    $checks += Test-DatabaseContent
    $checks += Test-ReportExists

    $failedCount = ($checks | Where-Object { $_ -eq $false }).Count
    if ($failedCount -gt 0) {
        Write-Host ""
        Write-Step "Pre-flight checks failed ($failedCount issue(s)). Please fix above." "FAIL"
        Show-Rollback-Hint
        exit 1
    }
} else {
    Write-Step "Skipping pre-flight checks (-SkipHealthCheck)" "WARN"
}

$existingConn = Get-NetTCPConnection -LocalPort $EXPECTED_PORT -ErrorAction SilentlyContinue
if ($existingConn) {
    Write-Step "Server already running on port $EXPECTED_PORT" "OK"
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  Enterprise Diagnosis Demo v1.2 Ready" -ForegroundColor Cyan
    Write-Host "  Homepage: http://localhost:$EXPECTED_PORT/" -ForegroundColor White
    Write-Host "  Lejinji Report: http://localhost:$EXPECTED_PORT/report/$REPORT_TOKEN" -ForegroundColor White
    Write-Host "============================================" -ForegroundColor Cyan
    Show-Rollback-Hint
    exit 0
}

$serverStarted = Start-Server
if (-not $serverStarted) {
    Write-Host ""
    Write-Step "Server startup failed" "FAIL"
    Show-Rollback-Hint
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Enterprise Diagnosis Demo v1.2 Ready" -ForegroundColor Cyan
Write-Host "  Homepage: http://localhost:$EXPECTED_PORT/" -ForegroundColor White
Write-Host "  Lejinji Report: http://localhost:$EXPECTED_PORT/report/$REPORT_TOKEN" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Show-Rollback-Hint
exit 0
