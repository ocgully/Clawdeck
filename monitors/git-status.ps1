# Clawdeck monitor: dirty-file count for a repo (Windows / PowerShell).
# Set CLAWDECK_REPO_DIR to the checkout you care about.

$ErrorActionPreference = 'SilentlyContinue'
$repo = if ($env:CLAWDECK_REPO_DIR) { $env:CLAWDECK_REPO_DIR } else { $PWD.Path }

if (-not (Test-Path (Join-Path $repo '.git'))) {
  Write-Output "STATUS: info"; Write-Output "LABEL: no repo"; exit 0
}

$dirty = (git -C $repo status --porcelain | Measure-Object -Line).Lines
if ($dirty -gt 0) {
  Write-Output "STATUS: warn"; Write-Output "LABEL: $dirty dirty"
} else {
  Write-Output "STATUS: ok"; Write-Output "LABEL: clean"
}
