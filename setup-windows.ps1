<#
  SARPulse one-time setup for Windows (safe to re-run).
  Installs, only if missing:
    - uv        (Astral's Python manager; installs Python itself, isolated per project)
    - Python    3.12, managed by uv (no global pip, no PATH edits)
    - Node.js   LTS (for the Next.js website and the Firebase CLI)
  Then installs the website packages, runs all tests, and optionally fetches real NASA OPERA data.
#>
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") + ";$env:USERPROFILE\.local\bin"
}
$wingetArgs = @("--exact", "--silent", "--accept-source-agreements", "--accept-package-agreements")

Step 1 "uv (Python manager)"
if (-not (Have "uv")) {
  if (Have "winget") { winget install --id astral-sh.uv @wingetArgs }
  else { powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex" }
  Refresh-Path
}
uv --version

Step 2 "Python 3.12 (managed by uv)"
uv python install 3.12

Step 3 "Node.js LTS"
if (-not (Have "node")) {
  if (-not (Have "winget")) { throw "winget is missing. Install Node.js LTS from https://nodejs.org, then re-run this script." }
  winget install --id OpenJS.NodeJS.LTS @wingetArgs
  Refresh-Path
}
node --version

Step 4 "Website packages (npm ci)"
npm ci --no-audit --no-fund

Step 5 "Tests"
npm test
uv run --python 3.12 --with pytest --with numpy pytest -q pipeline/tests

Step 6 "Real NASA data (optional)"
$answer = Read-Host "Fetch measured OPERA DISP-S1 velocities for Miami Beach now? Needs your Earthdata login, takes ~5-15 min. [y/N]"
if ($answer -match '^[Yy]') {
  uv run --python 3.12 pipeline/fetch_real_data.py
}

Step 7 "Done"
Write-Host "Start the site locally with:  npm run dev   then open http://localhost:3000" -ForegroundColor Green
$run = Read-Host "Start it now? [Y/n]"
if ($run -notmatch '^[Nn]') { Start-Process "http://localhost:3000"; npm run dev }
