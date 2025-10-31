param(
  [int]$Port = 3333
)

$ErrorActionPreference = 'Stop'

# Paths
$Root = Split-Path -Parent $PSCommandPath
$ProjectRoot = Split-Path -Parent $Root
$BackendDir = Join-Path $ProjectRoot 'backend'
$CloudflaredExe = Join-Path $ProjectRoot 'cloudflared.exe'

Write-Host "Starting backend and tunnel..." -ForegroundColor Cyan

# 1) Free the port if something is stuck on it
try {
  Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
} catch {}

# 2) Start the backend in a new PowerShell window so logs stay visible
$backendCmd = "Set-Location '$BackendDir'; `$env:NODE_ENV='production'; node index.js"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $backendCmd | Out-Null

Start-Sleep -Seconds 2

# 3) Start Cloudflare quick tunnel in another window
if (-not (Test-Path $CloudflaredExe)) {
  Write-Host "cloudflared.exe not found at $CloudflaredExe" -ForegroundColor Red
  Write-Host "Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/local/" -ForegroundColor Yellow
  exit 1
}

$tunnelCmd = "Set-Location '$ProjectRoot'; .\cloudflared.exe tunnel --url http://localhost:$Port"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $tunnelCmd | Out-Null

Write-Host "\nDone. Two windows opened:" -ForegroundColor Green
Write-Host " - Backend: http://127.0.0.1:$Port" -ForegroundColor Green
Write-Host " - Tunnel: watch for a https://*.trycloudflare.com URL in the window output" -ForegroundColor Green
Write-Host "\nAfter the tunnel prints its URL, update backend/public/index.html (window.env.BACKEND_URL) and git push to redeploy Vercel." -ForegroundColor Yellow
