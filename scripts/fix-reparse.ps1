$ErrorActionPreference = 'Stop'
$root = 'c:\Users\Web Design\OneDrive\Desktop\CakeCity-Mobile-App'
$targets = @(
  (Join-Path $root 'node_modules'),
  (Join-Path $root 'android')
)
$count = 0
foreach ($t in $targets) {
  Get-ChildItem -LiteralPath $t -Recurse -Filter '*.so' -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Attributes.ToString().Contains('ReparsePoint')) {
      $src = $_.FullName
      $tmp = "$src.ccfix.tmp"
      try {
        [System.IO.File]::WriteAllBytes($tmp, [System.IO.File]::ReadAllBytes($src))
        [System.IO.File]::Delete($src)
        [System.IO.File]::Move($tmp, $src)
        $count++
      } catch {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
        Write-Output "SKIP: $src :: $($_.Exception.Message)"
      }
    }
  }
}
Write-Output "Reparse files rewritten: $count"