$ErrorActionPreference = 'SilentlyContinue'

Write-Host "Stopping backend and tunnel..." -ForegroundColor Cyan

# Stop node processes bound to 3333 (and any other node leftovers)
try {
  Get-NetTCPConnection -LocalPort 3333 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force }
} catch {}

Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# Stop cloudflared
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "Stopped node and cloudflared (if running)." -ForegroundColor Green
