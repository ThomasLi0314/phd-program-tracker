# setup-permanent-tunnel.ps1 — one-time setup of a PERMANENT Cloudflare tunnel
# so the tracker always lives at a fixed address like https://tracker.yourdomain.com
# (instead of the random *.trycloudflare.com link the quick tunnel gives).
#
# PREREQUISITES you must do first (see README "Permanent address"):
#   1. Create a free Cloudflare account at https://dash.cloudflare.com
#   2. Add a domain to that account (buy one via Cloudflare Registrar ~$10/yr,
#      or add an existing domain and switch its nameservers to Cloudflare).
#   3. Run:  cloudflared tunnel login
#      (opens a browser; pick your domain to authorize — creates cert.pem)
#
# THEN run this once, passing the hostname you want:
#   .\setup-permanent-tunnel.ps1 -Hostname tracker.yourdomain.com
#
# After setup, start the site any time with:  .\serve-permanent.ps1

param(
    [Parameter(Mandatory = $true)][string]$Hostname,
    [string]$TunnelName = 'grad-tracker',
    [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'
$cfDir = Join-Path $env:USERPROFILE '.cloudflared'
$cert = Join-Path $cfDir 'cert.pem'

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    throw "cloudflared not found. Install: winget install --id Cloudflare.cloudflared"
}
if (-not (Test-Path $cert)) {
    Write-Host "You haven't authorized cloudflared with your Cloudflare account yet." -ForegroundColor Red
    Write-Host "Run this first (it opens a browser; pick your domain):" -ForegroundColor Yellow
    Write-Host "    cloudflared tunnel login" -ForegroundColor Yellow
    throw "Missing $cert"
}

# 1. Create the tunnel if it doesn't already exist.
$existing = (cloudflared tunnel list 2>$null) -match "\b$TunnelName\b"
if (-not $existing) {
    Write-Host "Creating tunnel '$TunnelName'..." -ForegroundColor Cyan
    cloudflared tunnel create $TunnelName
} else {
    Write-Host "Tunnel '$TunnelName' already exists — reusing it." -ForegroundColor Cyan
}

# 2. Route the chosen hostname's DNS to the tunnel (creates a CNAME in your zone).
Write-Host "Routing $Hostname to the tunnel..." -ForegroundColor Cyan
cloudflared tunnel route dns $TunnelName $Hostname

# 3. Write the tunnel config pointing at the local site server.
$creds = Get-ChildItem $cfDir -Filter '*.json' -ErrorAction SilentlyContinue |
    Where-Object { $_.BaseName -match '^[0-9a-fA-F-]{36}$' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $creds) { throw "No tunnel credentials .json found in $cfDir" }

$config = @"
tunnel: $TunnelName
credentials-file: $($creds.FullName)
ingress:
  - hostname: $Hostname
    service: http://localhost:$Port
  - service: http_status:404
"@
$configPath = Join-Path $cfDir 'config.yml'
Set-Content -Path $configPath -Value $config -Encoding utf8
Write-Host "Wrote $configPath" -ForegroundColor Green

Write-Host ""
Write-Host "Setup complete. Your permanent address will be: https://$Hostname" -ForegroundColor Green
Write-Host "Start the site with:  .\serve-permanent.ps1" -ForegroundColor Green
Write-Host "(DNS can take a few minutes to propagate the first time.)" -ForegroundColor Yellow
