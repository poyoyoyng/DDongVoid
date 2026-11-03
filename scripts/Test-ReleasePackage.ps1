param(
    [Parameter(Mandatory)][string]$PackageDirectory,
    [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [string]$Commit
)
$ErrorActionPreference = 'Stop'
$taskExpectedVersion = [version]"$Version.0"
foreach ($taskAssemblyName in @('DDongVoid', 'DDongVoid.Updater')) {
    foreach ($taskExtension in @('exe', 'dll')) {
        $taskPath = Join-Path $PackageDirectory "$taskAssemblyName.$taskExtension"
        $taskInfo = [Diagnostics.FileVersionInfo]::GetVersionInfo($taskPath)
        if ([version]$taskInfo.FileVersion -ne $taskExpectedVersion -or
            ($taskInfo.ProductVersion -split '\+', 2)[0] -ne $Version) {
            throw "배포 버전 불일치: $taskPath (예상 $Version, 실제 $($taskInfo.ProductVersion))"
        }
        if ($Commit -and $taskInfo.ProductVersion -ne "$Version+$Commit") {
            throw "배포 커밋 불일치: $taskPath (예상 $Commit, 실제 $($taskInfo.ProductVersion))"
        }
    }
    $taskAssemblyVersion = [Reflection.AssemblyName]::GetAssemblyName((Join-Path $PackageDirectory "$taskAssemblyName.dll")).Version
    if ($taskAssemblyVersion -ne $taskExpectedVersion) { throw "어셈블리 버전 불일치: $taskAssemblyName" }
    $taskDependencies = Get-Content -LiteralPath (Join-Path $PackageDirectory "$taskAssemblyName.deps.json") -Raw | ConvertFrom-Json
    if ("$taskAssemblyName/$Version" -notin $taskDependencies.libraries.PSObject.Properties.Name) {
        throw "의존성 정보 버전 불일치: $taskAssemblyName"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $PackageDirectory "$taskAssemblyName.runtimeconfig.json"))) {
        throw "실행 설정 누락: $taskAssemblyName"
    }
}
$taskReadme = Get-Content -LiteralPath (Join-Path $PackageDirectory 'README.txt') -Raw
if (($taskReadme -split '\r?\n')[0] -ne "AKC미니게임 $Version") { throw '배포 안내문 버전 불일치' }
Write-Output "배포 파일 버전 검증 통과: $Version"
