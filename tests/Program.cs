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
// Advances to `offset` seconds before the next note's hit time (negative = late).
RhythmNote AdvanceTo(RhythmEngine game, double offset)
{
    while (game.Notes.Count == 0) game.Update(.05);
    var note = game.Notes.MinBy(n => n.Time)!;
    var target = note.Time - offset;
    while (target - game.Seconds > 1e-9) game.Update(Math.Min(.1, target - game.Seconds));
    return note;
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
        Throws<ArgumentException>(() => store.Register("newuser", ""));
        Assert(store.Register("shortpw", "1") == "shortpw" && store.Login("shortpw", "1") == "shortpw", "짧은 비밀번호 가입 실패");
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
    Check("리듬: 왼손·오른손 키 배치와 노트 생성", () =>
    {
        Assert(RhythmEngine.LaneOf('s') == 0 && RhythmEngine.LaneOf('D') == 0 && RhythmEngine.LaneOf('K') == 1 && RhythmEngine.LaneOf('l') == 1 && RhythmEngine.LaneOf('A') == -1 && RhythmEngine.LaneOf('J') == -1, "키 라인 배치 오류");
        Assert(string.Concat(RhythmEngine.LaneKeys) == "SDKL", "왼손 S D · 오른손 K L 구성 오류");
        var game = new RhythmEngine(3); game.Reset(); for (int i = 0; i < 30; i++) game.Update(.1);
        Assert(game.Notes.Count > 0 && game.Notes.All(n => RhythmEngine.LaneOf(n.Key) == n.Lane), "노트 생성 또는 라인 불일치");
    });
    Check("리듬: 시드 없는 게임은 판마다 다른 무작위 블록", () =>
    {
        string Pattern(RhythmEngine game) { game.Reset(); var keys = ""; for (int i = 0; i < 100; i++) { game.Update(.1); keys += string.Concat(game.Notes.Select(n => n.Key)); game.Notes.Clear(); } return keys; }
        var engine = new RhythmEngine();
        var first = Pattern(engine); var again = Pattern(engine); var other = Pattern(new RhythmEngine());
        Assert(first.Length >= 5 && first != again && first != other, "블록 순서가 반복됨");
        Assert(Pattern(new RhythmEngine(9)) == Pattern(new RhythmEngine(9)), "고정 시드 재현 실패");
    });
    Check("리듬: 시간이 지날수록 속도와 빈도가 계속 증가", () =>
    {
        var game = new RhythmEngine(6); game.Reset();
        double lastTravel = game.TravelTime, lastInterval = game.NoteInterval;
        Assert(game.SpeedMultiplier == 1, "시작 속도 오류");
        for (int step = 0; step < 12; step++)
        {
            for (int i = 0; i < 100; i++) { game.Update(.1); game.Notes.Clear(); }
            Assert(game.TravelTime < lastTravel && game.NoteInterval <= lastInterval, $"{game.Seconds:F0}초에 속도가 증가하지 않음");
            lastTravel = game.TravelTime; lastInterval = game.NoteInterval;
        }
        Assert(game.SpeedMultiplier > 2.99, "120초 이후 3배 속도 미도달");
    });
    Check("리듬: 정박·엇박·따닥·연속 패턴이 섞여 나옴", () =>
    {
        var game = new RhythmEngine(11); game.Reset();
        var times = new SortedSet<double>();
        for (int i = 0; i < 1500; i++) { game.Update(.1); foreach (var n in game.Notes) times.Add(Math.Round(n.Time, 6)); game.Notes.Clear(); }
        var list = times.ToList();
        var gaps = list.Zip(list.Skip(1), (a, b) => (Gap: b - a, At: a)).ToList();
        Assert(gaps.All(g => g.Gap >= RhythmEngine.MinGap - 1e-6), "손으로 칠 수 없을 만큼 짧은 간격");
        int longestQuickRun = 0, run = 0;
        foreach (var g in gaps) { run = g.Gap < .26 ? run + 1 : 0; longestQuickRun = Math.Max(longestQuickRun, run); }
        Assert(longestQuickRun >= 2, "3연타 이상 연속 패턴이 나오지 않음");
        var early = gaps.Where(g => g.At < 30).Select(g => Math.Round(g.Gap, 2)).Distinct().Count();
        Assert(early >= 4, $"초반 간격이 너무 단조로움: {early}종류");
        Assert(gaps.Any(g => g.At < 30 && g.Gap < .3) && gaps.Any(g => g.At < 30 && g.Gap > .9), "초반에 따닥 또는 엇박(긴 간격)이 없음");
    });
    Check("리듬: 블록 글자는 한글 자판 표기", () =>
    {
        Assert(RhythmEngine.LabelOf('q') == "ㅂ" && RhythmEngine.LabelOf('R') == "ㄱ" && RhythmEngine.LabelOf('K') == "ㅏ" && RhythmEngine.LabelOf('M') == "ㅡ" && RhythmEngine.LabelOf('/') == "/", "한글 자판 표기 오류");
        var labels = string.Concat(RhythmEngine.LaneKeys).Select(RhythmEngine.LabelOf).ToList();
        Assert(labels.SequenceEqual(["ㄴ", "ㅇ", "ㅏ", "ㅣ"]), "S D K L 한글 표기 오류");
    });
    Check("리듬: 양손 동시 블록과 각 라인 판정", () =>
    {
        var game = new RhythmEngine(7); game.Reset();
        List<RhythmNote> pair = [];
        for (int i = 0; i < 600 && pair.Count == 0; i++)
        {
            game.Update(.05);
            pair = game.Notes.GroupBy(n => n.Time).Where(g => g.Count() == 2).Select(g => g.ToList()).FirstOrDefault() ?? [];
        }
        Assert(pair.Count == 2 && pair[0].Lane != pair[1].Lane, "양손 동시 블록이 나오지 않음");
        game.Notes.RemoveAll(n => !pair.Contains(n));
        while (pair[0].Time - game.Seconds > 1e-9) game.Update(Math.Min(.1, pair[0].Time - game.Seconds));
        var combo = game.Combo;
        Assert(game.Hit(pair[0].Key) == RhythmJudgement.Perfect && game.Hit(pair[1].Key) == RhythmJudgement.Perfect && game.Combo == combo + 2, "양손 동시 입력 판정 오류");
        Assert(game.LastJudgement[0] == RhythmJudgement.Perfect && game.LastJudgement[1] == RhythmJudgement.Perfect, "라인별 판정 표시 오류");
    });
    Check("리듬: 타이밍 판정과 콤보 점수", () =>
    {
        var game = new RhythmEngine(4); game.Reset();
        var note = AdvanceTo(game, 0);
        Assert(game.Hit(char.ToLowerInvariant(note.Key)) == RhythmJudgement.Perfect && game.Combo == 1 && game.Score == 300, "정확한 타이밍 PERFECT 실패");
        Assert(game.Hit(note.Key) is null && game.Combo == 1, "이미 처리한 노트가 다시 판정됨");
        var next = AdvanceTo(game, -.08);
        Assert(game.Hit(next.Key) == RhythmJudgement.Great && game.Combo == 2 && game.Score == 300 + 200 + 2, "GREAT 판정 또는 콤보 보너스 오류");
        game.Notes.RemoveAll(n => Math.Abs(n.Time - game.Seconds) <= RhythmEngine.GoodWindow);
        var early = game.Notes.MinBy(n => n.Time)!;
        Assert(early.Time - game.Seconds > RhythmEngine.GoodWindow && game.Hit(early.Key) is null && game.Notes.Contains(early) && game.Combo == 2, "판정 범위 밖 입력이 노트를 소모함");
    });
    Check("리듬: 놓친 노트는 MISS, 라이프 소진 시 종료", () =>
    {
        var game = new RhythmEngine(5); game.Reset();
        var guard = 0;
        while (!game.IsOver && guard++ < 10000) game.Update(.05);
        Assert(game.IsOver && game.Life == 0 && game.Miss == 10 && game.Combo == 0 && game.Score == 0, $"MISS 처리 또는 종료 오류: {game.Miss}, {game.Life}");
        game.Reset();
        Assert(!game.IsOver && game.Life == 100 && game.Notes.Count == 0 && game.Seconds == 0, "재시작 초기화 실패");
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
    Check("읽기 전용 게임 파일도 업데이트로 교체", () =>
    {
        var target = CreateInstallTarget("install-readonly");
        foreach (var file in UpdatePackage.RequiredFiles) File.SetAttributes(Path.Combine(target, file), FileAttributes.ReadOnly);
        UpdateInstaller.Install(validPayload, target, Path.Combine(root, "backup-readonly"));
        Assert(UpdatePackage.RequiredFiles.All(f => File.ReadAllText(Path.Combine(target, f)) == "new " + f), "읽기 전용 파일 교체 실패");
        foreach (var file in Directory.GetFiles(Path.Combine(root, "backup-readonly"))) File.SetAttributes(file, FileAttributes.Normal);
    });
    Check("잠깐 잠긴 게임 파일은 기다렸다가 교체", () =>
    {
        var target = CreateInstallTarget("install-transient");
        var locked = new FileStream(Path.Combine(target, UpdatePackage.RequiredFiles[0]), FileMode.Open, FileAccess.Read, FileShare.Read);
        var release = Task.Delay(600).ContinueWith(_ => locked.Dispose());
        UpdateInstaller.Install(validPayload, target, Path.Combine(root, "backup-transient"), TimeSpan.FromSeconds(5));
        release.Wait();
        Assert(UpdatePackage.RequiredFiles.All(f => File.ReadAllText(Path.Combine(target, f)) == "new " + f), "잠금 해제 후 교체 실패");
    });
    Check("다른 경로의 프로세스는 실행 중인 게임으로 보지 않음", () =>
        Assert(UpdateInstaller.RunningGames(Path.Combine(root, "no-game-here")).Count == 0, "실행 중이 아닌 폴더에서 게임을 감지함"));
    Check("일부 파일 교체 실패 시 이전 실행 파일 전부 복원", () =>
    {
        var target = CreateInstallTarget("install-rollback");
        using (var locked = new FileStream(Path.Combine(target, UpdatePackage.RequiredFiles[^1]), FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            bool failed = false;
            try { UpdateInstaller.Install(validPayload, target, Path.Combine(root, "backup-rollback"), TimeSpan.FromMilliseconds(300)); }
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
