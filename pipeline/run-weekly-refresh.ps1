# run-weekly-refresh.ps1 — wrapper invoked by the weekly scheduled task.
# Runs the non-destructive refresh and appends a line to review/refresh.log.
# Uses the project venv Python if present, otherwise the system python.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$py = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }

New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'review') | Out-Null
$log = Join-Path $PSScriptRoot 'review\refresh.log'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'

try {
    $out = & $py weekly_refresh.py 2>&1
    Add-Content -Path $log -Value "[$stamp] OK  $($out -join ' | ')"
} catch {
    Add-Content -Path $log -Value "[$stamp] ERROR  $_"
    throw
}
