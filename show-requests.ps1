# show-requests.ps1 — print the field-of-interest requests visitors have submitted.
# These are stored locally at frontend/reports/field-requests.jsonl (nothing off-machine).
#
#   .\show-requests.ps1          # all requests, newest last
#   .\show-requests.ps1 -Tail 10 # only the last 10

param([int]$Tail = 0)

$file = Join-Path $PSScriptRoot 'frontend\reports\field-requests.jsonl'
if (-not (Test-Path $file)) {
    Write-Host "No requests yet (no file at $file)." -ForegroundColor Yellow
    return
}

$lines = Get-Content $file | Where-Object { $_.Trim() }
if ($Tail -gt 0) { $lines = $lines | Select-Object -Last $Tail }

if (-not $lines) { Write-Host "No requests yet." -ForegroundColor Yellow; return }

Write-Host "$($lines.Count) field request(s):`n" -ForegroundColor Cyan
$i = 1
foreach ($line in $lines) {
    try { $r = $line | ConvertFrom-Json } catch { continue }
    Write-Host "$i. $($r.field)" -ForegroundColor Green
    Write-Host "   when : $($r.at)"
    if ($r.note)  { Write-Host "   note : $($r.note)" }
    if ($r.email) { Write-Host "   email: $($r.email)" }
    Write-Host ""
    $i++
}
Write-Host "To act on one: ask the agent to research that field, then it's merged into the dataset." -ForegroundColor Cyan
