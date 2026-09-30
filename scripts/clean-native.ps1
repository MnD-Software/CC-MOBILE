$ErrorActionPreference = 'SilentlyContinue'
$root = 'c:\Users\Web Design\OneDrive\Desktop\CakeCity-Mobile-App'
$removed = 0
foreach ($r in @("$root\android")) {
  Get-ChildItem -LiteralPath $r -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { @('build','intermediates','cxx','merged_native_libs','stripped_native_libs','library_jni','generated','tmp','outputs','intermediates') -contains $_.Name -and $_.FullName -match '\\build(\\|$)' } |
    Sort-Object { $_.FullName.Length } -Descending |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
      if (-not (Test-Path -LiteralPath $_.FullName)) { $removed++ }
    }
}
Write-Output "removed build dirs: $removed"
# Materialize any reparse-point .so left behind
powershell -NoProfile -ExecutionPolicy Bypass -File "$root\scripts\fix-reparse.ps1"