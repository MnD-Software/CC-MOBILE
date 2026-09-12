# Builds a standalone test APK outside OneDrive. Store distribution uses EAS.
[CmdletBinding()]
param(
  [string]$BuildRoot = (Join-Path $env:SystemDrive 'CakeCityBuild'),
  [ValidateSet('armeabi-v7a,arm64-v8a,x86,x86_64','arm64-v8a','arm64-v8a,x86_64')]
  [string]$Architectures = 'armeabi-v7a,arm64-v8a,x86,x86_64'
)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$root = [IO.Path]::GetFullPath($BuildRoot).TrimEnd('\')
if ($root.Length -gt 40 -or $root -match '\s' -or $root -eq [IO.Path]::GetPathRoot($root).TrimEnd('\')) {
  throw 'Use a short build path without spaces (for example C:\CakeCityBuild) to avoid Windows native compiler path limits.'
}
if ($root -eq $sourceRoot -or $root.StartsWith($sourceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The Android staging directory must be outside the source workspace.'
}
New-Item -ItemType Directory -Force -Path $root | Out-Null
if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) {
  throw 'The staging directory must be a regular local directory.'
}
$buildStarted = [DateTime]::UtcNow
$logMain = Join-Path $root 'cc-rebuild.log'
Set-Content -LiteralPath $logMain -Value '' -Encoding UTF8
function Log([string]$Message) {
  $line = (Get-Date -Format 'HH:mm:ss') + ' ' + $Message
  Add-Content -LiteralPath $logMain -Value $line -Encoding UTF8
  Write-Host $line
}
function Run([string]$Program, [string[]]$Arguments, [string]$LogName) {
  $log = Join-Path $root $LogName
  Log ("Running " + $Program + ' ' + ($Arguments -join ' '))
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $Program @Arguments *> $log
    $result = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($result -ne 0) {
    Get-Content -LiteralPath $log -Tail 45
    throw "$Program failed (exit $result). See $log"
  }
}
function AssertStagedPath([string]$Path) {
  $absolute = [IO.Path]::GetFullPath($Path)
  if (!$absolute.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe staging target: $absolute" }
  if ((Test-Path -LiteralPath $absolute) -and ((Get-Item -LiteralPath $absolute).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Staging target is a reparse point: $absolute"
  }
}

$oldLock = Join-Path $root 'package-lock.json'
$oldHash = if (Test-Path -LiteralPath $oldLock) { (Get-FileHash -LiteralPath $oldLock -Algorithm SHA256).Hash } else { '' }
$sourceHash = (Get-FileHash -LiteralPath (Join-Path $sourceRoot 'package-lock.json') -Algorithm SHA256).Hash
$dependencyStamp = Join-Path $root '.dependencies.sha256'
$dependencyHash = $sourceHash + ((Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'patches') -File | Sort-Object Name | Get-FileHash -Algorithm SHA256 | ForEach-Object Hash) -join '')
$installedHash = if (Test-Path -LiteralPath $dependencyStamp) { (Get-Content -LiteralPath $dependencyStamp -Raw).Trim() } else { '' }
# Mirror only owned source directories; never copy Git metadata, credentials,
# backups, dependencies, or generated native outputs into the staging tree.
foreach ($folder in @('app','src','assets','patches','scripts','tests')) {
  $from = Join-Path $sourceRoot $folder
  $to = Join-Path $root $folder
  AssertStagedPath $to
  & robocopy $from $to /MIR /XJ /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "Source staging failed for $folder (exit $LASTEXITCODE)." }
}
foreach ($file in @('package.json','package-lock.json','app.json','app.config.js','tsconfig.json','eas.json')) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination (Join-Path $root $file) -Force
}
Log "Source staged at $root"

# Build environment is explicit. A workstation .env.local must never silently
# bake a phone-local API address or a credential into the APK.
$env:EXPO_NO_DOTENV = '1'
$env:CAKECITY_BUILD_PROFILE = 'preview'
$env:CI = '1'
$javaCandidates = @($env:JAVA_HOME, 'C:\Program Files\Android\Android Studio\jbr')
$portableJdks = Join-Path $env:LOCALAPPDATA 'CakeCity-Toolchains'
if (Test-Path -LiteralPath $portableJdks) {
  $javaCandidates += @(Get-ChildItem -LiteralPath $portableJdks -Directory -Filter 'jdk-*' | Sort-Object Name -Descending | ForEach-Object FullName)
}
$workingJava = $null
foreach ($candidate in $javaCandidates) {
  if (!$candidate -or !(Test-Path -LiteralPath (Join-Path $candidate 'lib\jvm.cfg'))) { continue }
  $java = Join-Path $candidate 'bin\java.exe'
  if (!(Test-Path -LiteralPath $java)) { continue }
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $javaVersion = & $java -version 2>&1 | Out-String
    $javaResult = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($javaResult -eq 0 -and $javaVersion -match 'version "(17|21)\.') { $workingJava = $candidate; break }
}
if (!$workingJava) { throw 'Set JAVA_HOME to a working JDK 17 or 21; java.exe -version must succeed.' }
$env:JAVA_HOME = $workingJava
Log "Using JDK: $workingJava"
if (!$env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
if (!(Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'Set ANDROID_HOME to the installed Android SDK.' }
# The previous shared Gradle transform cache was modified externally. Reuse
# downloaded dependencies, but give this build its own generated cache.
if (!$env:GRADLE_USER_HOME) {
  $env:GRADLE_USER_HOME = Join-Path $root '.gradle-home'
  foreach ($cachePath in @('wrapper','caches\modules-2')) {
    $cached = Join-Path (Join-Path $env:USERPROFILE '.gradle') $cachePath
    $destination = Join-Path $env:GRADLE_USER_HOME $cachePath
    AssertStagedPath $destination
    if ((Test-Path -LiteralPath $cached) -and !(Test-Path -LiteralPath $destination)) {
      & robocopy $cached $destination /E /XJ /R:2 /W:1 /XF *.lock /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -gt 7) { throw 'Unable to reuse the Gradle download cache.' }
    }
  }
}

Push-Location $root
try {
  Run 'node.exe' @('scripts/check-release.cjs') 'cc-config.log'
  $dependenciesReady = (Test-Path 'node_modules/expo/package.json') -and (Test-Path 'node_modules/expo-notifications/package.json')
  if (!$dependenciesReady -or $oldHash -ne $sourceHash -or $installedHash -ne $dependencyHash) {
    Run 'npm.cmd' @('ci','--include=dev','--prefer-offline','--no-audit','--no-fund') 'cc-npmci.log'
  }
  Run 'npm.cmd' @('ls','--depth=0') 'cc-dependencies.log'
  Set-Content -LiteralPath $dependencyStamp -Value $dependencyHash -Encoding ASCII
  Run 'npx.cmd' @('expo','install','--check') 'cc-expo-check.log'
  Run 'npm.cmd' @('run','typecheck') 'cc-typecheck.log'
  Run 'npm.cmd' @('run','format:check') 'cc-format.log'
  Run 'npm.cmd' @('test') 'cc-tests.log'
  # Prebuild refreshes package/version, permissions, links, plugins and splash.
  # Validate the generated deletion target before Expo's clean regeneration.
  AssertStagedPath (Join-Path $root 'android')
  Run 'npx.cmd' @('expo','prebuild','--platform','android','--clean','--no-install') 'cc-prebuild.log'
  $env:NODE_ENV = 'production'
  Push-Location (Join-Path $root 'android')
  try {
    Run '.\gradlew.bat' @('app:assembleRelease',"-PreactNativeArchitectures=$Architectures",'--no-daemon','--no-watch-fs','--max-workers=2','--console=plain') 'cc-build.log'
  } finally { Pop-Location }

  $apk = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
  if (!(Test-Path -LiteralPath $apk)) { throw 'Gradle returned success but did not produce an APK.' }
  $info = Get-Item -LiteralPath $apk
  if ($info.Length -lt 1MB -or $info.LastWriteTimeUtc -lt $buildStarted) { throw 'The APK is empty or older than this build.' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($apk)
  try {
    $bundle = $archive.GetEntry('assets/index.android.bundle')
    if (!$bundle -or $bundle.Length -lt 100KB) { throw 'The standalone JavaScript bundle is missing from the APK.' }
  } finally { $archive.Dispose() }
  $buildTools = Get-ChildItem -LiteralPath (Join-Path $env:ANDROID_HOME 'build-tools') -Directory |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
  if (!$buildTools) { throw 'Android build tools are required to verify the APK.' }
  Run (Join-Path $buildTools.FullName 'apksigner.bat') @('verify','--verbose',$apk) 'cc-signature.log'
  Run (Join-Path $buildTools.FullName 'aapt.exe') @('dump','badging',$apk) 'cc-apk-metadata.log'
  $badging = Get-Content -LiteralPath (Join-Path $root 'cc-apk-metadata.log') -Raw
  $app = Get-Content -LiteralPath 'app.json' -Raw | ConvertFrom-Json
  if ($badging -notmatch "package: name='ke.co.cakecity.mobile'" -or
      !$badging.Contains("versionCode='$($app.expo.android.versionCode)'") -or
      !$badging.Contains("versionName='$($app.expo.version)'")) { throw 'APK identity/version does not match the app configuration.' }

  $dist = Join-Path $sourceRoot 'dist'
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  $destination = Join-Path $dist ("CakeCity-" + $app.expo.version + "-preview.apk")
  Copy-Item -LiteralPath $apk -Destination $destination -Force
  $hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash
  if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $hash) { throw 'Copied APK checksum does not match.' }
  $manifest = @{
    built_at = [DateTime]::UtcNow.ToString('o'); file = [IO.Path]::GetFileName($destination)
    sha256 = $hash; bytes = $info.Length; version = $app.expo.version
    version_code = $app.expo.android.versionCode; architectures = $Architectures
    signing = 'Android debug certificate; internal testing only'
    api_configured = [bool]$env:EXPO_PUBLIC_API_URL
    install_tested = $false; embedded_bundle = $true
  }
  $manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dist 'build-manifest.json') -Encoding UTF8
  Copy-Item -LiteralPath (Join-Path $root 'cc-apk-metadata.log') -Destination (Join-Path $dist 'apk-metadata.txt') -Force
  Log "Verified APK: $destination"
  Log "SHA256: $hash"
} finally { Pop-Location }
