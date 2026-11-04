param(
    [string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $taskProjectRoot 'artifacts\server' }
$taskPackageDirectory = Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) 'package'
if (Test-Path -LiteralPath $taskPackageDirectory) { Remove-Item -LiteralPath $taskPackageDirectory -Recurse -Force }
New-Item -ItemType Directory -Path $taskPackageDirectory -Force | Out-Null
dotnet run --project (Join-Path $taskProjectRoot 'tests\OnlineChecks.csproj') -c Release -p:NuGetAudit=false
if ($LASTEXITCODE -ne 0) { throw 'Online checks failed.' }
# Self-contained single file: the server PC needs no .NET runtime installed.
dotnet publish (Join-Path $taskProjectRoot 'Server\DDongVoid.Server.csproj') -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:NuGetAudit=false -o $taskPackageDirectory
if ($LASTEXITCODE -ne 0) { throw 'Server publish failed.' }
$taskReadme = @"
AKC미니게임 서버

DDongVoid.Server.exe를 실행하면 5080 포트에서 서버가 켜집니다. 창을 닫으면 서버가 꺼집니다.
계정·기록·방 정보는 exe 옆의 data 폴더에 저장됩니다. 옮길 때는 data 폴더를 함께 옮기세요.
기존 공유 폴더의 ddongvoid*.json 파일을 data 폴더에 복사하면 계정과 기록을 그대로 씁니다.

옵션: DDongVoid.Server.exe --port 5080 --data D:\DDongVoidData

외부에서 접속하기
- Tailscale: 서버 PC와 플레이어 PC에 Tailscale을 설치하고 같은 계정으로 로그인한 뒤, 게임 설정의 서버 주소에 http://<서버 PC의 Tailscale IP>:5080 을 입력합니다.
- Cloudflare Tunnel: cloudflared tunnel --url http://localhost:5080 을 실행하고, 표시된 https 주소를 게임 설정의 서버 주소에 입력합니다.
- 같은 네트워크: 서버 창에 표시된 http://<IP>:5080 주소를 입력합니다. Windows 방화벽에서 5080 포트를 허용해야 할 수 있습니다.
"@
[IO.File]::WriteAllText((Join-Path $taskPackageDirectory 'README.txt'), $taskReadme, [Text.UTF8Encoding]::new($true))
$taskArchivePath = Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) 'DDongVoid-Server-win-x64.zip'
Compress-Archive -LiteralPath (Join-Path $taskPackageDirectory 'DDongVoid.Server.exe'), (Join-Path $taskPackageDirectory 'README.txt') -DestinationPath $taskArchivePath -Force
Write-Output "Package: $taskArchivePath"
Get-FileHash -LiteralPath $taskArchivePath -Algorithm SHA256 | Select-Object Hash,Path
