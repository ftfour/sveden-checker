$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $ScriptDir "..")).ProviderPath
$PackageJson = Get-Content -Raw (Join-Path $Root "package.json") | ConvertFrom-Json
$Version = $PackageJson.version
$ReleaseRoot = Join-Path $Root "release"
$DistRoot = Join-Path $ReleaseRoot "sveden-checker-$Version-win-x64"
$AppRoot = Join-Path $DistRoot "app"
$ToolsRoot = Join-Path $ReleaseRoot ".tools"
$NodeVersion = "v20.19.5"
$NodeName = "node-$NodeVersion-win-x64"
$NodeZip = Join-Path $ToolsRoot "$NodeName.zip"
$NodeUrl = "https://nodejs.org/dist/$NodeVersion/$NodeName.zip"
$NodeExtracted = Join-Path $ToolsRoot $NodeName
$NodeTarget = Join-Path $DistRoot "node"
$TempNode = Join-Path $env:TEMP "sveden-node-$NodeVersion-win-x64"
$TempApp = Join-Path $env:TEMP "sveden-checker-runtime-install"
$PrebuildUrl = "https://github.com/WiseLibs/better-sqlite3/releases/download/v11.10.0/better-sqlite3-v11.10.0-node-v115-win32-x64.tar.gz"
$PrebuildCache = Join-Path $ToolsRoot "better-sqlite3-v11.10.0-node-v115-win32-x64.tar.gz"
$PrebuildArchive = Join-Path $env:TEMP "better-sqlite3-v11.10.0-node-v115-win32-x64.tar.gz"
$PrebuildExtract = Join-Path $env:TEMP "better-sqlite3-prebuild"
$ZipPath = Join-Path $ReleaseRoot "sveden-checker-$Version-win-x64.zip"
$ExePath = Join-Path $ReleaseRoot "sveden-checker-$Version-win-x64.exe"

function Remove-Dir($Path) {
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $Path) {
    cmd /c rmdir /s /q "`"$Path`"" | Out-Null
  }
}

function Find-Exe($Name, $Fallback) {
  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($Command) {
    return $Command.Source
  }
  if (Test-Path -LiteralPath $Fallback) {
    return $Fallback
  }
  throw "$Name not found"
}

New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null

if (!(Test-Path -LiteralPath $NodeZip)) {
  Write-Host "Downloading Windows Node.js $NodeVersion..."
  Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip
}

if (!(Test-Path -LiteralPath $NodeExtracted)) {
  Expand-Archive -LiteralPath $NodeZip -DestinationPath $ToolsRoot -Force
}

Remove-Dir $NodeTarget
Copy-Item -LiteralPath $NodeExtracted -Destination $NodeTarget -Recurse

Remove-Dir $TempNode
Copy-Item -LiteralPath $NodeExtracted -Destination $TempNode -Recurse

Remove-Dir $TempApp
New-Item -ItemType Directory -Force -Path $TempApp | Out-Null
Copy-Item -LiteralPath (Join-Path $AppRoot "package.json") -Destination (Join-Path $TempApp "package.json")

$NodeExe = Join-Path $TempNode "node.exe"
$NpmCli = Join-Path $TempNode "node_modules\npm\bin\npm-cli.js"

Push-Location $TempApp
try {
  & $NodeExe $NpmCli install --omit=dev --ignore-scripts --no-audit --no-fund --workspaces=false
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

if (!(Test-Path -LiteralPath $PrebuildCache)) {
  Write-Host "Downloading better-sqlite3 Windows native module..."
  Invoke-WebRequest -Uri $PrebuildUrl -OutFile $PrebuildCache
}
Copy-Item -LiteralPath $PrebuildCache -Destination $PrebuildArchive -Force

Remove-Dir $PrebuildExtract
New-Item -ItemType Directory -Force -Path $PrebuildExtract | Out-Null
tar -xzf $PrebuildArchive -C $PrebuildExtract

$NativeModule = Get-ChildItem -Recurse $PrebuildExtract -Filter "*.node" | Select-Object -First 1
if (!$NativeModule) {
  throw "better-sqlite3 native .node file not found in prebuild archive"
}

$NativeTarget = Join-Path $TempApp "node_modules\better-sqlite3\build\Release"
New-Item -ItemType Directory -Force -Path $NativeTarget | Out-Null
Copy-Item -LiteralPath $NativeModule.FullName -Destination (Join-Path $NativeTarget "better_sqlite3.node") -Force

Remove-Dir (Join-Path $AppRoot "node_modules")
Copy-Item -LiteralPath (Join-Path $TempApp "node_modules") -Destination (Join-Path $AppRoot "node_modules") -Recurse
Copy-Item -LiteralPath (Join-Path $TempApp "package-lock.json") -Destination (Join-Path $AppRoot "package-lock.json") -Force

if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}
Compress-Archive -LiteralPath $DistRoot -DestinationPath $ZipPath -CompressionLevel Optimal

$IExpress = Find-Exe "iexpress.exe" "C:\Windows\System32\iexpress.exe"
$IExpressStage = Join-Path $env:TEMP "sveden-checker-iexpress-$Version"
$IExpressZip = Join-Path $IExpressStage "sveden-checker-$Version-win-x64.zip"
$Bootstrap = Join-Path $IExpressStage "install-and-run.ps1"
$BootstrapCmd = Join-Path $IExpressStage "install-and-run.cmd"
$SedPath = Join-Path $IExpressStage "sveden-checker.sed"
$ExeTemp = Join-Path $env:TEMP "sveden-checker-$Version-win-x64.exe"

Remove-Dir $IExpressStage
New-Item -ItemType Directory -Force -Path $IExpressStage | Out-Null
Copy-Item -LiteralPath $ZipPath -Destination $IExpressZip -Force

$BootstrapText = @"
`$ErrorActionPreference = "Stop"
Start-Transcript -Path (Join-Path `$env:TEMP "sveden-checker-install.log") -Force
`$Version = "$Version"
`$PayloadName = "sveden-checker-$Version-win-x64"
`$InstallRoot = Join-Path `$env:LOCALAPPDATA "SvedenChecker"
`$TempExtract = Join-Path `$env:TEMP "sveden-checker-extract-`$Version"
`$ZipPath = Join-Path `$PSScriptRoot "`$PayloadName.zip"

`$ExistingProcesses = Get-Process node -ErrorAction SilentlyContinue |
  Where-Object { `$_.Path -and `$_.Path.StartsWith(`$InstallRoot, [System.StringComparison]::OrdinalIgnoreCase) }
`$ExistingProcesses | Stop-Process -Force
`$ExistingProcesses | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath `$TempExtract) {
  Remove-Item -LiteralPath `$TempExtract -Recurse -Force
}
if (Test-Path -LiteralPath `$InstallRoot) {
  Remove-Item -LiteralPath `$InstallRoot -Recurse -Force
}

Expand-Archive -LiteralPath `$ZipPath -DestinationPath `$TempExtract -Force
`$PayloadRoot = Join-Path `$TempExtract `$PayloadName
if (!(Test-Path -LiteralPath `$PayloadRoot)) {
  throw "Release payload was not found: `$PayloadRoot"
}

Copy-Item -LiteralPath `$PayloadRoot -Destination `$InstallRoot -Recurse
Start-Process -FilePath (Join-Path `$InstallRoot "start-sveden-checker.cmd") -WorkingDirectory `$InstallRoot
Stop-Transcript
"@
[System.IO.File]::WriteAllText($Bootstrap, $BootstrapText, [System.Text.UTF8Encoding]::new($false))

$BootstrapCmdText = @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-and-run.ps1"
"@
[System.IO.File]::WriteAllText($BootstrapCmd, $BootstrapCmdText, [System.Text.Encoding]::ASCII)

$TargetName = $ExeTemp
$SourceDir = "$IExpressStage\"
$SedText = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=1
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$TargetName
FriendlyName=Sveden Checker
AppLaunched=install-and-run.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$SourceDir
[SourceFiles0]
sveden-checker-$Version-win-x64.zip=
install-and-run.ps1=
install-and-run.cmd=
"@
[System.IO.File]::WriteAllText($SedPath, $SedText, [System.Text.Encoding]::Default)

if (Test-Path -LiteralPath $ExeTemp) {
  Remove-Item -LiteralPath $ExeTemp -Force
}

& $IExpress /N /Q $SedPath
if ($LASTEXITCODE -ne 0) {
  throw "IExpress failed with code $LASTEXITCODE"
}
for ($Attempt = 0; $Attempt -lt 60 -and !(Test-Path -LiteralPath $ExeTemp); $Attempt++) {
  Start-Sleep -Seconds 1
}
if (!(Test-Path -LiteralPath $ExeTemp)) {
  throw "IExpress exe was not created"
}
Copy-Item -LiteralPath $ExeTemp -Destination $ExePath -Force

Write-Host "Windows zip release: $ZipPath"
Write-Host "Windows exe release: $ExePath"
