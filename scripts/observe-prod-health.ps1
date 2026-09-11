# Observation loop for production health (30 minutes)
# Usage: powershell -File scripts/observe-prod-health.ps1
param([int]$Minutes = 30, [int]$IntervalSec = 120)
$Key = Join-Path $env:USERPROFILE ".ssh\teammillimeter-deploy.pem"
$Remote = "ubuntu@52.78.74.101"
$end = (Get-Date).AddMinutes($Minutes)
$ok = 0; $fail = 0
while ((Get-Date) -lt $end) {
  $r = ssh -i $Key -o StrictHostKeyChecking=no -o ConnectTimeout=15 $Remote "curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/health; echo; pm2 pid erp; pm2 show erp | grep -E 'status |restarts |uptime ' | head -5"
  $ts = Get-Date -Format 'HH:mm:ss'
  Write-Host "[$ts] $r"
  if ($r -match '200' -and $r -match 'online') { $ok++ } else { $fail++ }
  Start-Sleep -Seconds $IntervalSec
}
Write-Host "observation_ok=$ok observation_fail=$fail minutes=$Minutes"
if ($fail -gt 0) { exit 1 }
