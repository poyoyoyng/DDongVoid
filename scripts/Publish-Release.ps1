param(
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version = '1.0.0',
    [string]$OutputDirectory,
    [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $taskProjectRoot 'artifacts\release' }
$taskPackageDirectory = Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) 'package'
New-Item -ItemType Directory -Path $taskPackageDirectory -Force | Out-Null
if (-not $SkipTests) {
    dotnet run --project (Join-Path $taskProjectRoot 'tests\DDongVoid.Tests.csproj') -c Release -p:NuGetAudit=false
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
    dotnet run --project (Join-Path $taskProjectRoot 'tests\RenderingChecks.csproj') -c Release -p:NuGetAudit=false
    if ($LASTEXITCODE -ne 0) { throw 'Rendering checks failed.' }
}
dotnet publish (Join-Path $taskProjectRoot 'DDongVoid.csproj') -c Release -r win-x64 --no-self-contained -o $taskPackageDirectory "-p:Version=$Version" -p:NuGetAudit=false
if ($LASTEXITCODE -ne 0) { throw 'Game publish failed.' }
dotnet publish (Join-Path $taskProjectRoot 'Updater\DDongVoid.Updater.csproj') -c Release -r win-x64 --no-self-contained -o $taskPackageDirectory "-p:Version=$Version" -p:NuGetAudit=false
if ($LASTEXITCODE -ne 0) { throw 'Updater publish failed.' }
$taskRequiredNames = @('DDongVoid.exe','DDongVoid.dll','DDongVoid.deps.json','DDongVoid.runtimeconfig.json','DDongVoid.Updater.exe','DDongVoid.Updater.dll','DDongVoid.Updater.deps.json','DDongVoid.Updater.runtimeconfig.json')
foreach ($taskName in $taskRequiredNames) {
    if (-not (Test-Path -LiteralPath (Join-Path $taskPackageDirectory $taskName))) { throw "Missing package file: $taskName" }
}
[IO.File]::WriteAllText((Join-Path $taskPackageDirectory 'run.cmd'), "@echo off`r`nstart `"`" `"%~dp0DDongVoid.exe`"`r`n", [Text.Encoding]::ASCII)
$taskReadme = @"
DDONG VOID $Version

ZIP 파일을 전부 압축 해제한 뒤 DDongVoid.exe 또는 run.cmd를 실행하세요.
.NET 10 Desktop Runtime (Windows x64)이 필요합니다.
https://dotnet.microsoft.com/download/dotnet/10.0

게임과 DDongVoid.Updater로 시작하는 파일들을 모두 같은 폴더에 보관하세요.
게임 실행 시와 실행 중 15분마다 새 버전을 확인합니다.
업데이트 안내에서 예를 선택하면 파일 검증 후 게임을 다시 실행합니다.
플레이 중에는 다음 메뉴 화면에서 안내합니다. 설정에서도 업데이트를 확인할 수 있습니다.

F2: 설정 / Esc: 일시정지 / Ctrl+Shift+Space: 숨기기·복귀
일시정지 또는 게임 결과에서 메인 화면으로 돌아갈 수 있습니다.
메인 메뉴의 랭킹 보기에서 아이디별 최고 점수를 확인합니다.
"@
[IO.File]::WriteAllText((Join-Path $taskPackageDirectory 'README.txt'), $taskReadme, [Text.UTF8Encoding]::new($true))
$taskArchivePath = Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) 'DDongVoid-win-x64.zip'
$taskFiles = ($taskRequiredNames + @('run.cmd','README.txt')) | ForEach-Object { Join-Path $taskPackageDirectory $_ }
Compress-Archive -LiteralPath $taskFiles -DestinationPath $taskArchivePath -Force
Write-Output "Package: $taskArchivePath"
Get-FileHash -LiteralPath $taskArchivePath -Algorithm SHA256 | Select-Object Hash,Path
