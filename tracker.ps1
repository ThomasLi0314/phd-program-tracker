# tracker.ps1 — build the site, serve it from this laptop, and share it publicly
# via a Cloudflare quick tunnel. All data stays on this machine; the tunnel only
# relays visitor traffic to the local server.
#
#   .\tracker.ps1            # build + serve + public tunnel
#   .\tracker.ps1 -NoBuild   # skip rebuild (serve the existing dist/)
#   .\tracker.ps1 -LocalOnly # serve on the LAN only, no public tunnel
#   .\tracker.ps1 -Port 9000 # use a different local port

param(
    [switch]$NoBuild,
    [switch]$LocalOnly,
    [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'
$frontend = Join-Path $PSScriptRoot 'frontend'
Set-Location $frontend

if (-not $NoBuild) {
    Write-Host "Building the site..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed." }
}
if (-not (Test-Path (Join-Path $frontend 'dist\index.html'))) {
    throw "No build found. Run without -NoBuild first."
}

Write-Host "Starting the local server on port $Port..." -ForegroundColor Cyan
$server = Start-Process node -ArgumentList "server.mjs $Port" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
    $lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } |
        Select-Object -First 1).IPAddress
    Write-Host ""
    Write-Host "Serving at:  http://localhost:$Port" -ForegroundColor Green
    if ($lan) { Write-Host "On your Wi-Fi: http://${lan}:$Port  (same-network access)" -ForegroundColor Green }

    if ($LocalOnly) {
        Write-Host ""
        Write-Host "Local-only mode. Press Ctrl+C to stop." -ForegroundColor Yellow
        while ($true) { Start-Sleep -Seconds 3600 }
    }

    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "cloudflared is not installed — can't open a public tunnel." -ForegroundColor Red
        Write-Host "Install it once with:  winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
        Write-Host "The site is still reachable on your Wi-Fi at the address above." -ForegroundColor Yellow
        while ($true) { Start-Sleep -Seconds 3600 }
    }

    Write-Host ""
    Write-Host "Opening a public Cloudflare tunnel — watch for the https://<...>.trycloudflare.com link below." -ForegroundColor Cyan
    Write-Host "Share that link. It stays live while this window is open; a new link is issued each run." -ForegroundColor Cyan
    Write-Host ""
    cloudflared tunnel --url "http://localhost:$Port"
}
finally {
    Write-Host "`nShutting down the local server..." -ForegroundColor Cyan
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
