using System.Net;
using System.Net.Sockets;
using DDongVoid.Server;

// DDongVoid.Server.exe [--port 5080] [--data <folder>]
var port = 5080;
var data = Path.Combine(AppContext.BaseDirectory, "data");
for (var i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--port" when i + 1 < args.Length && int.TryParse(args[i + 1], out var value) && value is > 0 and < 65536: port = value; i++; break;
        case "--data" when i + 1 < args.Length: data = args[++i]; break;
        default:
            Console.WriteLine("사용법: DDongVoid.Server.exe [--port 5080] [--data 데이터폴더]");
            return 1;
    }
}

var app = GameServer.Build(data, $"http://0.0.0.0:{port}");
await app.StartAsync();
Console.OutputEncoding = System.Text.Encoding.UTF8;
Console.WriteLine($"AKC미니게임 서버 {GameServer.Version} 실행 중");
Console.WriteLine($"데이터 폴더: {Path.GetFullPath(data)}");
Console.WriteLine($"이 PC에서 접속: http://localhost:{port}");
foreach (var address in Dns.GetHostAddresses(Dns.GetHostName()).Where(a => a.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a)))
    Console.WriteLine($"같은 네트워크에서 접속: http://{address}:{port}");
Console.WriteLine("외부에서 접속하려면 Tailscale 또는 Cloudflare Tunnel로 이 포트를 연결하세요. 종료: Ctrl+C");
await app.WaitForShutdownAsync();
return 0;
