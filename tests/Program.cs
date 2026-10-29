using System.Text.Json;
using System.Text.Json.Nodes;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using DDongVoid.Core;

var root = Path.Combine(AppContext.BaseDirectory, "test-data", Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
int passed = 0;
void Check(string name, Action test)
{
    test(); passed++; Console.WriteLine($"통과: {name}");
}
void Assert(bool condition, string description) { if (!condition) throw new Exception(description); }
void Throws<T>(Action action) where T : Exception
{
    try { action(); } catch (T) { return; }
    throw new Exception($"예상한 {typeof(T).Name} 예외가 발생하지 않았습니다.");
}

try
{
    var store = new LocalStore(Path.Combine(root, "계정 저장 폴더"));
    Check("새 폴더 읽기에는 파일 생성 없음", () => { store.Validate(); Assert(!Directory.Exists(store.Folder), "읽기 작업에서 파일을 만들었습니다."); });
    Check("회원가입과 영속 저장", () => { Assert(store.Register("테스트User", "test-password-123") == "테스트User", "계정 생성 실패"); Assert(File.Exists(store.FilePath), "JSON 저장 실패"); });
    Check("JSON에 평문 비밀번호 없음", () =>
    {
        var json = File.ReadAllText(store.FilePath);
        Assert(!json.Contains("test-password-123"), "비밀번호 평문 노출");
        var db = JsonSerializer.Deserialize<Database>(json)!;
        Assert(db.Accounts[0].Salt.Length > 0 && db.Accounts[0].PasswordHash.Length > 0, "해시 정보 누락");
    });
    Check("재실행 후 대소문자 무시 로그인", () => Assert(new LocalStore(store.Folder).Login("  테스트user  ", "test-password-123") == "테스트User", "로그인 실패"));
    Check("오류 비밀번호 및 없는 계정 거부", () => { Throws<ArgumentException>(() => store.Login("테스트User", "wrong-password")); Throws<ArgumentException>(() => store.Login("없는계정", "test-password-123")); });
    Check("저장된 로그인 유지 및 잘못된 세션 거부", () =>
    {
        var key = store.SessionKey("테스트User");
        Assert(!key.Contains("test-password-123") && new LocalStore(store.Folder).ResumeSession("테스트User", key) == "테스트User", "로그인 유지 실패");
        Throws<ArgumentException>(() => store.ResumeSession("테스트User", key + "x"));
        Throws<ArgumentException>(() => store.ResumeSession("없는계정", key));
        Throws<ArgumentException>(() => new LocalStore(Path.Combine(root, "다른 세션 폴더")).ResumeSession("테스트User", key));
    });
    Check("중복 아이디 및 입력 제한", () =>
    {
        Throws<ArgumentException>(() => store.Register("테스트USER", "password2"));
        Throws<ArgumentException>(() => store.Register("../path", "password2"));
        Throws<ArgumentException>(() => store.Register("ab", "password2"));
        Throws<ArgumentException>(() => store.Register("newuser", "123"));
        Throws<ArgumentException>(() => store.Register("newuser", new string('a', 129)));
    });
    Check("같은 비밀번호도 계정마다 다른 해시", () =>
    {
        store.Register("otheruser", "test-password-123");
        var accounts = JsonSerializer.Deserialize<Database>(File.ReadAllText(store.FilePath))!.Accounts;
        Assert(accounts[0].PasswordHash != accounts[1].PasswordHash && accounts[0].Salt != accounts[1].Salt, "salt가 중복되었습니다.");
    });
    var record = new PlayRecord(Guid.NewGuid(), "테스트User", 550, 30, 10, DateTimeOffset.UtcNow);
    Check("기록 저장 및 중복 재시도 방지", () =>
    {
        store.AddRecord(record); store.AddRecord(record);
        Assert(new LocalStore(store.Folder).Records("테스트User").Count == 1, "기록이 없거나 중복 저장됨");
    });
    Check("계정별 기록 분리 및 최근순", () =>
    {
        store.AddRecord(record with { RecordId = Guid.NewGuid(), Score = 1000, PlayedAt = record.PlayedAt.AddMinutes(1) });
        store.AddRecord(record with { RecordId = Guid.NewGuid(), UserId = "otheruser", Score = 9999 });
        Assert(store.Records("테스트User").Count == 2 && store.Records("테스트User")[0].Score == 1000, "기록 순서 또는 계정 분리 오류");
        Assert(store.Records("otheruser").Count == 1, "다른 계정의 기록이 섞임");
    });
    Check("없는 계정의 기록 저장 거부", () => Throws<InvalidDataException>(() => store.AddRecord(record with { UserId = "missing" })));
    Check("여러 인스턴스의 동시 쓰기 보존", () =>
    {
        Parallel.For(0, 12, i => new LocalStore(store.Folder).AddRecord(record with { RecordId = Guid.NewGuid(), Score = i }));
        Assert(store.Records("테스트User").Count == 14, "동시 쓰기에서 기록 손실");
    });
    Check("저장 경로 전환 시 데이터 분리", () =>
    {
        var other = new LocalStore(Path.Combine(root, "다른 경로")); other.Validate();
        Throws<ArgumentException>(() => other.Login("테스트User", "test-password-123"));
        Assert(store.Login("테스트User", "test-password-123") == "테스트User", "기존 폴더 데이터 손상");
    });
    Check("손상 JSON 보존 및 오류 보고", () =>
    {
        var badFolder = Path.Combine(root, "bad"); Directory.CreateDirectory(badFolder);
        var bad = new LocalStore(badFolder); const string original = "{ corrupted json"; File.WriteAllText(bad.FilePath, original);
        Throws<InvalidDataException>(() => bad.Register("newuser", "password"));
        Assert(File.ReadAllText(bad.FilePath) == original, "손상된 파일을 덮어썼습니다.");
    });
    Check("잘못된 해시와 미지원 버전 보존", () =>
    {
        var bad = new LocalStore(Path.Combine(root, "bad"));
        var db = new Database { Accounts = [new Account("user", "invalid!", "invalid!", 210000, DateTimeOffset.UtcNow)] };
        File.WriteAllText(bad.FilePath, JsonSerializer.Serialize(db)); Throws<InvalidDataException>(bad.Validate);
        db.Accounts.Clear(); db.Version = 999; var text = JsonSerializer.Serialize(db); File.WriteAllText(bad.FilePath, text);
        Throws<InvalidDataException>(bad.Validate); Assert(File.ReadAllText(bad.FilePath) == text, "미지원 JSON 변경");
    });
    Check("쓸 수 없는 경로에서 기록 유실 없이 실패", () =>
    {
        var blocked = Path.Combine(root, "file-as-folder"); File.WriteAllText(blocked, "keep");
        Throws<IOException>(() => new LocalStore(blocked).Register("newuser", "password"));
        Assert(File.ReadAllText(blocked) == "keep", "기존 파일 변경");
    });
    Check("게임 초기화와 이동 경계", () =>
    {
        var game = new GameEngine(42); game.Resize(600, 400); game.Reset(); game.Update(.1, -1);
        Assert(game.PlayerX < 300 && game.Seconds > 0, "이동 실패");
        for (int i = 0; i < 100; i++) { game.Hazards.Clear(); game.Update(.1, -1); }
        Assert(game.PlayerX == 22, "왼쪽 경계 이탈");
        for (int i = 0; i < 100; i++) { game.Hazards.Clear(); game.Update(.1, 1); }
        Assert(game.PlayerX == 578, "오른쪽 경계 이탈");
        game.Reset(); Assert(game.Score == 0 && game.Hazards.Count == 0 && !game.IsOver, "재시작 초기화 실패");
    });
    Check("똥 회피 점수 계산", () =>
    {
        var game = new GameEngine(1); game.Reset();
        game.Hazards.Add(new Hazard { X = 30, Y = game.Height + 30, Radius = 13, Speed = 150 });
        game.Update(.1, 0); Assert(game.Dodged == 1 && game.Score == 26, "회피 점수 오류");
    });
    Check("충돌 후 게임 진행 중단", () =>
    {
        var game = new GameEngine(1); game.Reset();
        game.Hazards.Add(new Hazard { X = game.PlayerX, Y = game.PlayerY, Radius = 18, Speed = 100 });
        game.Update(.01, 0); Assert(game.IsOver, "충돌 미감지");
        var t = game.Seconds; game.Update(.1, 1); Assert(game.Seconds == t, "게임 종료 후 시간 증가");
    });
    Check("창 크기 변경 시 위치 유지", () =>
    {
        var game = new GameEngine(1); game.Resize(600, 400); game.Reset();
        game.Hazards.Add(new Hazard { X = 100, Y = 100, Radius = 18, Speed = 100 });
        game.Resize(1200, 800); Assert(game.PlayerX == 600 && game.Hazards[0].X == 200 && game.Hazards[0].Y == 200, "리사이즈 위치 오류");
    });
    Check("생존 시간에 따른 난이도 상승", () =>
    {
        var game = new GameEngine(2); game.Reset();
        for (int i = 0; i < 130; i++) { game.Hazards.Clear(); game.Update(.1, 0); }
        Assert(game.Level == 2 && game.Score >= 129, "난이도 또는 시간 점수 오류");
    });
    Check("시간이 지날수록 기존 똥의 낙하도 빨라짐", () =>
    {
        var game = new GameEngine(10); game.Resize(600, 100000); game.Reset();
        var hazard = new Hazard { X = 30, Y = 0, Radius = 13, Speed = 100 };
        game.Hazards.Add(hazard); game.Update(.1, 0); var initialFall = hazard.Y;
        for (int i = 0; i < 600; i++)
        { game.Hazards.Clear(); game.Hazards.Add(hazard); game.Update(.1, 0); }
        var before = hazard.Y; game.Update(.1, 0); var laterFall = hazard.Y - before;
        Assert(laterFall > initialFall * 1.9, "60초 이후에도 기존 똥의 속도가 증가하지 않았습니다.");
        Assert(!game.IsOver, "난이도 측정 중 예상치 못한 충돌");
    });
    Check("시간이 지날수록 실제 생성량 증가 및 재시작 초기화", () =>
    {
        var game = new GameEngine(20); game.Reset();
        int initialCount = 0, middleCount = 0, laterCount = 0;
        for (int i = 0; i < 1900; i++)
        {
            game.Hazards.Clear(); game.Update(.1, 0);
            if (i < 100) initialCount += game.Hazards.Count;
            else if (i >= 600 && i < 700) middleCount += game.Hazards.Count;
            else if (i >= 1800) laterCount += game.Hazards.Count;
        }
        Assert(middleCount > initialCount && laterCount > middleCount, $"생성량이 늘지 않음: {initialCount}, {middleCount}, {laterCount}");
        game.Reset();
        Assert(game.Level == 1 && game.FallSpeedMultiplier == 1 && game.Score == 0 && game.Hazards.Count == 0, "재시작 시 난이도 초기화 실패");
        int restartedCount = 0;
        for (int i = 0; i < 100; i++) { game.Hazards.Clear(); game.Update(.1, 0); restartedCount += game.Hazards.Count; }
        Assert(restartedCount < middleCount, "재시작 뒤에도 생성 빈도가 높게 유지됨");
    });
    var rankingStore = new LocalStore(Path.Combine(root, "랭킹"));
    Check("빈 랭킹과 새 계정의 최고 점수 초기화", () =>
    {
        Assert(rankingStore.Rankings().Count == 0, "빈 저장 폴더의 랭킹 오류");
        foreach (var id in new[] { "alpha", "bravo", "charlie", "newplayer" }) rankingStore.Register(id, "test-password");
        var db = JsonSerializer.Deserialize<Database>(File.ReadAllText(rankingStore.FilePath))!;
        Assert(db.Accounts.All(a => a.BestScore == 0), "새 계정의 최고 점수가 0이 아님");
        Assert(rankingStore.Rankings().Count == 0, "아직 플레이하지 않은 계정이 랭킹에 포함됨");
    });
    var rankingRecord = new PlayRecord(Guid.NewGuid(), "alpha", 600, 30, 12, DateTimeOffset.UtcNow);
    Check("계정 JSON에 최고 점수 저장 및 낮은 점수로 덮어쓰기 방지", () =>
    {
        rankingStore.AddRecord(rankingRecord);
        rankingStore.AddRecord(rankingRecord with { RecordId = Guid.NewGuid(), Score = 100 });
        rankingStore.AddRecord(rankingRecord with { Score = 99999 });
        var db = JsonSerializer.Deserialize<Database>(File.ReadAllText(rankingStore.FilePath))!;
        Assert(db.Accounts.Single(a => a.Id == "alpha").BestScore == 600, "최고 점수 저장 또는 중복 재시도 오류");
        Assert(new LocalStore(rankingStore.Folder).BestScore("alpha") == 600, "재실행 후 최고 점수 유실");
    });
    Check("아이디별 한 줄 랭킹과 공동 순위", () =>
    {
        rankingStore.AddRecord(rankingRecord with { RecordId = Guid.NewGuid(), UserId = "bravo", Score = 900 });
        rankingStore.AddRecord(rankingRecord with { RecordId = Guid.NewGuid(), UserId = "charlie", Score = 900 });
        var rankings = rankingStore.Rankings();
        Assert(rankings.Count == 3 && rankings.Select(r => r.UserId).Distinct().Count() == 3, "아이디별 랭킹 중복 또는 누락");
        Assert(rankings[0] == new RankingEntry(1, "bravo", 900) && rankings[1] == new RankingEntry(1, "charlie", 900) && rankings[2] == new RankingEntry(3, "alpha", 600), "점수순 또는 공동 순위 계산 오류");
    });
    Check("0점으로 완료한 판도 랭킹에 포함", () =>
    {
        rankingStore.AddRecord(rankingRecord with { RecordId = Guid.NewGuid(), UserId = "newplayer", Score = 0 });
        var last = rankingStore.Rankings().Last();
        Assert(last.UserId == "newplayer" && last.Rank == 4 && last.BestScore == 0, "0점 완료 기록 누락");
    });
    Check("기존 JSON 기록에서 최고 점수 복원 및 계정 정보 보존", () =>
    {
        var legacy = new LocalStore(Path.Combine(root, "이전 버전")); Directory.CreateDirectory(legacy.Folder);
        var node = JsonNode.Parse(File.ReadAllText(rankingStore.FilePath))!;
        foreach (var account in node["Accounts"]!.AsArray()) account!.AsObject().Remove("BestScore");
        File.WriteAllText(legacy.FilePath, node.ToJsonString());
        var rankings = legacy.Rankings();
        Assert(rankings.Count == 4 && rankings[0].BestScore == 900, "기존 기록의 랭킹 복원 실패");
        var restored = JsonSerializer.Deserialize<Database>(File.ReadAllText(legacy.FilePath))!;
        Assert(restored.Accounts.Single(a => a.Id == "alpha").BestScore == 600, "복원한 최고 점수를 JSON에 저장하지 않음");
        Assert(legacy.Login("alpha", "test-password") == "alpha" && restored.Records.Count == 5, "마이그레이션에서 인증 또는 기록 손상");
    });
    Check("독립 파일 잠금 해제 후 저장 및 랭킹 갱신", () =>
    {
        var heldLock = new FileStream(Path.Combine(rankingStore.Folder, ".ddongvoid.lock"), FileMode.Open, FileAccess.ReadWrite, FileShare.None);
        using var started = new ManualResetEventSlim();
        var write = Task.Run(() => { started.Set(); rankingStore.AddRecord(rankingRecord with { RecordId = Guid.NewGuid(), Score = 1200 }); });
        try
        {
            Assert(started.Wait(TimeSpan.FromSeconds(2)), "동시 저장 작업 시작 실패");
            Thread.Sleep(150);
            Assert(!write.IsCompleted, "다른 PC에 해당하는 파일 잠금을 무시함");
        }
        finally { heldLock.Dispose(); }
        write.GetAwaiter().GetResult();
        Assert(rankingStore.Rankings()[0] == new RankingEntry(1, "alpha", 1200), "잠금 해제 후 최고 점수 또는 순위 갱신 실패");
        Assert(rankingStore.Records("bravo").Count == 1 && rankingStore.Records("charlie").Count == 1, "다른 계정 기록 유실");
    });
    string ReleaseJson(string tag, string url = "https://github.com/poyoyoyng/DDongVoid/releases/download/v1.0.10/DDongVoid-win-x64.zip", string? digest = null, bool preview = false)
        => JsonSerializer.Serialize(new { tag_name = tag, draft = false, prerelease = preview, assets = new[] { new { name = UpdateService.AssetName, browser_download_url = url, size = 100, digest = digest ?? "sha256:" + new string('a', 64) } } });
    Check("업데이트 버전은 문자열이 아닌 숫자로 비교", () =>
    {
        var update = UpdateService.ParseRelease(ReleaseJson("v1.0.10"), new Version(1, 0, 9));
        Assert(update?.Version == new Version(1, 0, 10), "1.0.10을 1.0.9보다 이전으로 판단함");
        Assert(UpdateService.ParseRelease(ReleaseJson("v1.0.10"), new Version(1, 0, 10, 0)) is null, "같은 버전에 업데이트 표시");
        Assert(UpdateService.ParseRelease(ReleaseJson("v1.0.10"), new Version(1, 0, 11)) is null, "이전 버전으로 다운그레이드");
        Assert(UpdateService.ParseRelease(ReleaseJson("v1.0.10", preview: true), new Version(1, 0, 0)) is null, "미리보기 버전 자동 설치");
    });
    Check("업데이트 주소와 무결성 정보 검사", () =>
    {
        Throws<InvalidDataException>(() => UpdateService.ParseRelease(ReleaseJson("v1.0.10", "https://example.com/DDongVoid-win-x64.zip"), new Version(1, 0, 0)));
        Throws<InvalidDataException>(() => UpdateService.ParseRelease(ReleaseJson("v1.0.10", "http://github.com/poyoyoyng/DDongVoid/releases/download/v1.0.10/DDongVoid-win-x64.zip"), new Version(1, 0, 0)));
        Throws<InvalidDataException>(() => UpdateService.ParseRelease(ReleaseJson("v1.0.10", digest: "sha256:invalid"), new Version(1, 0, 0)));
    });
    string CreateUpdateArchive(string name, string? extra = null, bool omit = false, bool realAssembly = false)
    {
        var path = Path.Combine(root, name + ".zip");
        using var zip = ZipFile.Open(path, ZipArchiveMode.Create);
        foreach (var file in UpdatePackage.RequiredFiles.Where(f => !omit || f != "DDongVoid.Updater.exe"))
        {
            var entry = zip.CreateEntry(file);
            using var output = entry.Open();
            if (realAssembly && file == "DDongVoid.dll")
            { using var input = File.OpenRead(Assembly.GetExecutingAssembly().Location); input.CopyTo(output); }
            else { using var text = new StreamWriter(output); text.Write("new " + file); }
        }
        if (extra is not null) { using var writer = new StreamWriter(zip.CreateEntry(extra).Open()); writer.Write("untrusted"); }
        return path;
    }
    Check("ZIP 경로 탈출과 설정 덮어쓰기 및 실행 파일 누락 차단", () =>
    {
        var path = Path.Combine(root, "bad-payload");
        Throws<InvalidDataException>(() => UpdatePackage.Extract(CreateUpdateArchive("traversal", "../settings.json"), path));
        Throws<InvalidDataException>(() => UpdatePackage.Extract(CreateUpdateArchive("settings", "settings.json"), path));
        Throws<InvalidDataException>(() => UpdatePackage.Extract(CreateUpdateArchive("missing", omit: true), path));
        Assert(!Directory.Exists(path), "잘못된 ZIP을 검증 전에 압축 해제함");
    });
    Check("다운로드 SHA-256 불일치 시 설치 차단", () =>
    {
        using var client = new HttpClient(new StubHttpHandler(() => new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([1, 2, 3]) }));
        var service = new UpdateService(client);
        var update = new AvailableUpdate(new Version(1, 0, 0), "v1.0.0", new Uri("https://github.com/poyoyoyng/DDongVoid/releases/download/v1.0.0/DDongVoid-win-x64.zip"), new string('0', 64), 3);
        Throws<InvalidDataException>(() => service.PrepareAsync(update).GetAwaiter().GetResult());
    });
    Check("검증된 다운로드의 압축 해제와 버전 확인", () =>
    {
        var bytes = File.ReadAllBytes(CreateUpdateArchive("valid-download", realAssembly: true));
        using var client = new HttpClient(new StubHttpHandler(() => new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(bytes) }));
        var service = new UpdateService(client);
        var version = UpdateService.NormalizeVersion(Assembly.GetExecutingAssembly().GetName().Version!);
        var update = new AvailableUpdate(version, "v" + version, new Uri("https://github.com/poyoyoyng/DDongVoid/releases/download/v1.0.0/DDongVoid-win-x64.zip"), Convert.ToHexString(SHA256.HashData(bytes)), bytes.Length);
        var payload = service.PrepareAsync(update).GetAwaiter().GetResult();
        Assert(UpdatePackage.RequiredFiles.All(f => File.Exists(Path.Combine(payload, f))), "검증 후 실행 파일 누락");
    });
    Check("배포가 아직 없으면 정상적으로 업데이트 없음", () =>
    {
        using var client = new HttpClient(new StubHttpHandler(() => new HttpResponseMessage(HttpStatusCode.NotFound)));
        Assert(new UpdateService(client).CheckAsync().GetAwaiter().GetResult() is null, "최초 배포 이전에 업데이트 오류");
    });
    string CreateInstallTarget(string name)
    {
        var path = Path.Combine(root, name); Directory.CreateDirectory(path);
        foreach (var file in UpdatePackage.RequiredFiles) File.WriteAllText(Path.Combine(path, file), "old " + file);
        File.WriteAllText(Path.Combine(path, "settings.json"), "settings-keep");
        File.WriteAllText(Path.Combine(path, "ddongvoid.json"), "account-records-keep");
        return path;
    }
    var validArchive = CreateUpdateArchive("install");
    var validPayload = Path.Combine(root, "payload"); UpdatePackage.Extract(validArchive, validPayload);
    Check("업데이트 설치에서 계정과 개인 설정 보존", () =>
    {
        var target = CreateInstallTarget("install-success");
        UpdateInstaller.Install(validPayload, target, Path.Combine(root, "backup-success"));
        Assert(UpdatePackage.RequiredFiles.All(f => File.ReadAllText(Path.Combine(target, f)) == "new " + f), "새 실행 파일 교체 실패");
        Assert(File.ReadAllText(Path.Combine(target, "settings.json")) == "settings-keep" && File.ReadAllText(Path.Combine(target, "ddongvoid.json")) == "account-records-keep", "업데이트가 사용자 데이터를 변경함");
    });
    Check("일부 파일 교체 실패 시 이전 실행 파일 전부 복원", () =>
    {
        var target = CreateInstallTarget("install-rollback");
        using (var locked = new FileStream(Path.Combine(target, UpdatePackage.RequiredFiles[^1]), FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            bool failed = false;
            try { UpdateInstaller.Install(validPayload, target, Path.Combine(root, "backup-rollback")); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { failed = true; }
            Assert(failed, "사용 중인 파일이 있는데 설치가 성공했다고 처리함");
        }
        Assert(UpdatePackage.RequiredFiles.All(f => File.ReadAllText(Path.Combine(target, f)) == "old " + f), "실패 후 이전 버전이 복원되지 않음");
        Assert(File.ReadAllText(Path.Combine(target, "ddongvoid.json")) == "account-records-keep", "실패한 업데이트에서 사용자 데이터 손상");
    });
    Console.WriteLine($"총 {passed}개 검증 통과");
}
finally { Directory.Delete(root, true); }

sealed class StubHttpHandler(Func<HttpResponseMessage> response) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        => Task.FromResult(response());
}
