param([string]$Version = "")
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$demo = Split-Path -Parent $here
if ($Version -eq "") {
  $Version = (Get-Content (Join-Path $demo "package.json") | ConvertFrom-Json).version
}
$staging = Join-Path $here "staging"
$dist = Join-Path $here "dist"
$makensis = Join-Path ${env:ProgramFiles(x86)} "NSIS\makensis.exe"
if (!(Test-Path $makensis)) { $makensis = Join-Path $env:ProgramFiles "NSIS\makensis.exe" }
if (!(Test-Path $makensis)) { throw "makensis.exe not found - install NSIS first (winget install -e --id NSIS.NSIS)" }

$index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
$nodeVer = ($index | Where-Object { $_.version -like "v22.*" } | Select-Object -First 1).version
if (!$nodeVer) { throw "could not resolve latest Node v22 from nodejs.org" }
$nodeZip = Join-Path $here "node-$nodeVer-win-x64.zip"
if (!(Test-Path $nodeZip)) {
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$nodeVer/node-$nodeVer-win-x64.zip" -OutFile $nodeZip
}

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory $staging | Out-Null
New-Item -ItemType Directory $dist -Force | Out-Null
$tmp = Join-Path $here "node-tmp"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $nodeZip -DestinationPath $tmp
Move-Item (Join-Path $tmp "node-$nodeVer-win-x64") (Join-Path $staging "node")
Remove-Item $tmp -Recurse -Force

Copy-Item (Join-Path $demo "server.mjs") $staging
Copy-Item (Join-Path $demo "package.json") $staging
Copy-Item (Join-Path $demo "README.md") $staging
Copy-Item (Join-Path $demo "SETUP.md") $staging
Copy-Item (Join-Path $demo "AGENT-PROMPTS.md") $staging
Copy-Item (Join-Path $demo "public") (Join-Path $staging "public") -Recurse
Copy-Item (Join-Path $demo "pitches") (Join-Path $staging "pitches") -Recurse
Copy-Item (Join-Path $here "Start-CRM-Demo.bat") $staging

Push-Location $here
& $makensis "/DAPP_VERSION=$Version" "crm-demo.nsi"
Pop-Location
Write-Output ("Built: " + $dist + "\CRMDemo-Setup-" + $Version + ".exe")
