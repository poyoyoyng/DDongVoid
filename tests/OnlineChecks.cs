extern alias server;
using System.IO;
using DDongVoid.Core;
using DDongVoid.Online;
using server::DDongVoid.Server;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;

// Runs the real server on a local port and plays through it with two clients, the way two PCs would.
var root = Path.Combine(Path.GetTempPath(), "DDongVoidOnlineChecks", Guid.NewGuid().ToString("N"));
var data = Path.Combine(root, "data");
int passed = 0, failed = 0;
void Check(string name, Action action)
{
    try { action(); passed++; Console.WriteLine("통과: " + name); }
    catch (Exception ex) { failed++; Console.WriteLine($"실패: {name} - {ex.Message}"); }
}
void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
void Throws<T>(Action action, string message) where T : Exception
{
    try { action(); } catch (T) { return; }
    throw new Exception(message);
}

async Task<(WebApplication App, string Address)> StartAsync()
{
    var app = GameServer.Build(data, "http://127.0.0.1:0");
    await app.StartAsync();
    var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
    return (app, address);
}

var (server, address) = await StartAsync();
try
{
    var a = new RemoteAccountStore(new OnlineServer(address));
    var b = new RemoteAccountStore(new OnlineServer(address));

    Check("서버 주소 정리와 상태 확인", () =>
    {
        Assert(OnlineServer.Normalize(" 192.168.0.10:5080/ ") == "http://192.168.0.10:5080", "주소 정리 오류");
        Throws<ArgumentException>(() => OnlineServer.Normalize("ftp://game"), "잘못된 주소 허용");
        var health = a.Server.Health();
        Assert(health.Name == OnlineProtocol.Name && health.Protocol == OnlineProtocol.Version, "상태 응답 오류");
        Throws<IOException>(() => new OnlineServer("http://127.0.0.1:1").Health(), "꺼진 서버 연결 오류를 사용자 오류로 변환하지 않음");
    });
    Check("회원가입·로그인·저장된 로그인 재개", () =>
    {
        Assert(a.Register("pp0", "pw0") == "pp0" && b.Register("pp1", "pw1") == "pp1", "회원가입 실패");
        Throws<ArgumentException>(() => a.Register("P0", "x"), "중복 아이디 허용");
        Throws<ArgumentException>(() => new RemoteAccountStore(new OnlineServer(address)).Login("pp0", "wrong"), "틀린 비밀번호 허용");
        var key = a.SessionKey("pp0");
        var fresh = new RemoteAccountStore(new OnlineServer(address));
        Assert(fresh.ResumeSession("pp0", key) == "pp0" && fresh.BestScore("pp0") == 0, "저장된 로그인 재개 실패");
        Throws<ArgumentException>(() => new RemoteAccountStore(new OnlineServer(address)).ResumeSession("pp0", "bad"), "잘못된 키 허용");
    });
    Check("로그인 없이 개인 정보 거부·다른 사람 이름으로 기록 저장 차단", () =>
    {
        Throws<ArgumentException>(() => new OnlineServer(address).Call<List<PlayRecord>>("account.records"), "로그인 없는 조회 허용");
        var record = new PlayRecord(Guid.NewGuid(), "pp0", 120, 3.5, 4, DateTimeOffset.UtcNow);
        a.AddRecord(record);
        Throws<ArgumentException>(() => a.AddRecord(record with { RecordId = Guid.NewGuid(), UserId = "pp1" }), "클라이언트가 다른 사람 기록 전송");
        a.Server.Call<bool>("account.addRecord", record with { RecordId = Guid.NewGuid(), UserId = "pp1", Score = 999 });
        Assert(a.Records("pp0").Count == 2 && b.Records("pp1").Count == 0, "서버가 요청에 적힌 아이디를 믿음");
        Assert(a.Rankings().Single().UserId == "pp0" && a.BestScore("pp0") == 999, "랭킹·최고 점수 오류");
        a.Rhythm().AddRecord(record with { RecordId = Guid.NewGuid(), Score = 50 });
        Assert(b.Rhythm().Rankings().Single() is { UserId: "pp0", BestScore: 50 }, "리듬 랭킹 오류");
    });
    Check("원카드 손패 숨김과 다른 사람 차례 대신 내기 차단", () =>
    {
        var room = a.OneCard().Create("pp0", "온라인 원카드");
        b.OneCard().Join(room.Id, "pp1");
        a.OneCard().SetReady(room.Id, "pp0", true);
        var started = b.OneCard().SetReady(room.Id, "pp1", true);
        Assert(started.Status == OneCardStatus.Playing && started.DrawPile.Count == 0, "게임 시작 또는 더미 숨김 오류");
        var mine = a.OneCard().SnapshotAsync("pp0").Result.Rooms.Single(r => r.Id == room.Id);
        Assert(mine.Find("pp0")!.Hand.Count == 7 && mine.Find("pp1")!.Hand.Count == 0 && mine.Find("pp1")!.CardCount == 7, "상대 손패가 보임");
        var card = mine.Find("pp0")!.Hand[0];
        Throws<ArgumentException>(() => b.Server.Call<OneCardRoom>("onecard.play", new OnlinePlay(room.Id, mine.Revision, card, CardSuit.Heart)), "다른 사람 차례에 대신 냄");
        Throws<ArgumentException>(() => a.OneCard().Draw(room.Id, "pp1", mine.Revision), "클라이언트가 다른 사람으로 행동");
        var drawn = a.OneCard().Draw(room.Id, "pp0", mine.Revision);
        Assert(drawn.Find("pp0")!.CardCount == 8 && drawn.CurrentPlayerId == "pp1", "카드 받기 오류");
        Throws<ArgumentException>(() => b.OneCard().DeleteRoom(room.Id, "pp1"), "방장 아닌 사람이 방 삭제");
        a.OneCard().DeleteRoom(room.Id, "pp0");
        Assert(b.OneCard().SnapshotAsync("pp1").Result.DeletedRoomIds.Contains(room.Id), "삭제 기록 누락");
    });
    Check("맞짱 상대 선택 숨김", () =>
    {
        var room = a.Slap().Create("pp0", "온라인 맞짱");
        b.Slap().Join(room.Id, "pp1");
        a.Slap().SetReady(room.Id, "pp0", true); b.Slap().SetReady(room.Id, "pp1", true);
        var attack = new SlapAction(SlapMove.Slap, SlapZone.High, 1);
        Assert(a.Slap().Submit(room.Id, "pp0", attack).Find("pp0")!.Choice == attack, "내 선택이 보이지 않음");
        var seen = b.Slap().RoomsAsync().Result.Single(r => r.Id == room.Id).Find("pp0")!;
        Assert(seen.Submitted && seen.Choice != attack, "상대 선택이 그대로 보임");
        b.Slap().Submit(room.Id, "pp1", new SlapAction(SlapMove.Block, SlapZone.Low));
        var resolved = a.Slap().RoomsAsync().Result.Single(r => r.Id == room.Id);
        Assert(resolved.Round == 2 && resolved.LastResult!.Attack == attack && resolved.Find("pp1")!.Hp == SlapRules.MaxHp - 1, "판정 결과 오류");
        a.Slap().SetGiveUp(room.Id, "pp0", true); b.Slap().SetGiveUp(room.Id, "pp1", true);
        a.Slap().Leave(room.Id, "pp0"); b.Slap().Leave(room.Id, "pp1");
        Assert(a.Slap().Rankings().Count == 0 && a.Slap().RoomsAsync().Result.All(r => r.Id != room.Id), "양쪽 포기 처리 오류");
    });
    Check("차오차오 주사위는 굴린 사람만 확인", () =>
    {
        var room = a.Ciao().Create("pp0", "온라인 차오");
        b.Ciao().Join(room.Id, "pp1");
        a.Ciao().SetReady(room.Id, "pp0", true);
        var started = b.Ciao().SetReady(room.Id, "pp1", true);
        var speaker = started.SpeakerId == "pp0" ? a : b;
        var rolled = speaker.Ciao().Roll(room.Id, started.SpeakerId!, started.Revision);
        var other = speaker == a ? b : a; var otherId = started.SpeakerId == "pp0" ? "pp1" : "pp0";
        Assert(rolled.Die is not null && other.Ciao().SnapshotAsync(otherId).Result.Rooms.Single(r => r.Id == room.Id).Die is null, "상대 주사위가 보임");
        var declared = speaker.Ciao().Declare(room.Id, started.SpeakerId!, rolled.Revision, 3);
        Assert(declared.ResponseDeadline is { } deadline && (deadline - DateTimeOffset.UtcNow).Duration() < TimeSpan.FromSeconds(CiaoRules.ResponseTimeoutSeconds + 2), "응답 마감 시각 변환 오류");
    });
    Check("서버를 다시 켜도 계정과 기록 유지", () =>
    {
        server.StopAsync().GetAwaiter().GetResult();
        (server, address) = StartAsync().GetAwaiter().GetResult();
        var again = new RemoteAccountStore(new OnlineServer(address));
        Assert(again.Login("pp0", "pw0") == "pp0" && again.Records("pp0").Count == 2, "재시작 후 데이터 유실");
    });
}
finally
{
    await server.StopAsync();
    try { Directory.Delete(root, true); } catch (IOException) { }
}
Console.WriteLine($"총 {passed}개 통과, {failed}개 실패");
return failed == 0 ? 0 : 1;
