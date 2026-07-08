# serve-permanent.ps1 — build + serve the site and run the PERMANENT named tunnel.
# Requires a one-time setup first:  .\setup-permanent-tunnel.ps1 -Hostname tracker.yourdomain.com
#
#   .\serve-permanent.ps1            # build + serve + permanent tunnel
#   .\serve-permanent.ps1 -NoBuild   # skip rebuild
#
# The site is live at your fixed https://<hostname> only while this window is
# open and the laptop is on/online. To keep it running 24/7 without a window,
# install cloudflared as a Windows service (see README).

param(
    [switch]$NoBuild,
    [string]$TunnelName = 'grad-tracker',
    [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'
$frontend = Join-Path $PSScriptRoot 'frontend'
$config = Join-Path $env:USERPROFILE '.cloudflared\config.yml'

if (-not (Test-Path $config)) {
    throw "No tunnel config found. Run setup first: .\setup-permanent-tunnel.ps1 -Hostname tracker.yourdomain.com"
}

Set-Location $frontend
if (-not $NoBuild) {
    Write-Host "Building the site..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed." }
}

Write-Host "Starting the local server on port $Port..." -ForegroundColor Cyan
$server = Start-Process node -ArgumentList "server.mjs $Port" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
    Write-Host "Running permanent tunnel '$TunnelName' (Ctrl+C to stop)..." -ForegroundColor Green
    cloudflared tunnel run $TunnelName
}
finally {
    Write-Host "`nShutting down the local server..." -ForegroundColor Cyan
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
