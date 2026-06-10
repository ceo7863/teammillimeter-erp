# Deploy to production: git pull + build on EC2 (no local scp).
# Usage: npm run deploy:prod
# Requires: all changes committed and pushed to origin/main.

$ErrorActionPreference = "Stop"

$Key = Join-Path $env:USERPROFILE ".ssh\teammillimeter-deploy.pem"
$Remote = "ubuntu@52.78.74.101"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not (Test-Path $Key)) {
  Write-Error "SSH key not found: $Key"
}

Push-Location $Root
try {
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne "main") {
    Write-Error "Deploy only from main branch (current: $branch)."
  }

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  git fetch origin main *> $null
  $fetchExit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  if ($fetchExit -ne 0) {
    Write-Error "git fetch failed."
  }

  $dirty = git status --porcelain --untracked-files=no
  if ($dirty) {
    Write-Host ""
    Write-Host "ERROR: Uncommitted local changes — deploy blocked." -ForegroundColor Red
    Write-Host "Commit and push first, then run npm run deploy:prod again."
    Write-Host ""
    git status -sb
    exit 1
  }

  $unpushed = git rev-list "origin/main..HEAD" --count
  if ([int]$unpushed -gt 0) {
    Write-Host ""
    Write-Host "ERROR: $unpushed unpushed commit(s) on main — deploy blocked." -ForegroundColor Red
    Write-Host "Run: git push origin main"
    Write-Host "Server deploy always uses origin/main; unpushed commits would be overwritten by old code."
    exit 1
  }

  $localHead = (git rev-parse HEAD).Trim()
  $remoteHead = (git rev-parse origin/main).Trim()
  if ($localHead -ne $remoteHead) {
    Write-Host ""
    Write-Host "ERROR: Local main is behind origin/main — pull first." -ForegroundColor Red
    git log --oneline HEAD..origin/main
    exit 1
  }

  Write-Host "==> Pre-flight OK (HEAD $localHead)"
  Write-Host "==> Deploying to production (server-side git pull + build)..."
  ssh -i $Key -o StrictHostKeyChecking=no $Remote "cd ~/teammillimeter-erp && git fetch origin main && git reset --hard origin/main && bash scripts/deploy-server.sh"
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Remote deploy failed (exit $LASTEXITCODE)."
  }
  Write-Host "==> Deploy done"
}
finally {
  Pop-Location
}
