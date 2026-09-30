$ErrorActionPreference = 'SilentlyContinue'
$log = 'C:\ccstate.txt'
Remove-Item $log -ErrorAction SilentlyContinue
$p = 'c:\Users\Web Design\OneDrive\Desktop\CakeCity-Mobile-App'
function S($msg) { Add-Content -Path $log -Value $msg }
S ('react-native pkg: ' + (Test-Path "$p\node_modules\react-native\package.json"))
S ('expo pkg: ' + (Test-Path "$p\node_modules\expo\package.json"))
S ('screens pkg: ' + (Test-Path "$p\node_modules\react-native-screens\package.json"))
S ('google-signin pkg: ' + (Test-Path "$p\node_modules\@react-native-google-signin\google-signin\package.json"))
S ('CCModules present: ' + (Test-Path 'C:\CakeCityModules'))
S ('release apk: ' + (Test-Path "$p\android\app\build\outputs\apk\release\app-release.apk"))
S ('FreeGB: ' + [math]::Round((Get-PSDrive C).Free/1GB,1))
S ('java procs: ' + (Get-Process java | Measure-Object).Count)
S ('node procs: ' + (Get-Process node | Measure-Object).Count)
S ('one drive procs: ' + (Get-Process | Where-Object { $_.Name -match 'OneDrive|msync|FileCoAuth' } | Measure-Object).Count)
Get-Content $log
