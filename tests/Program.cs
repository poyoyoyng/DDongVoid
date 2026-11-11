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
    CiaoChecks.Run(root, Check, Assert);
    OneCardChecks.Run(root, Check, Assert);
    YachtChecks.Run(root, Check, Assert);
    GameResultChecks.Run(root, Check, Assert);
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
    var slapClock = DateTimeOffset.UtcNow;
    var rhythmStore = new RhythmStore(rankingStore.Folder);
    Check("리듬 랭킹: 게임별 점수 분리·동점·0점·중복 저장 방지", () =>
    {
        Assert(rhythmStore.Rankings().Count == 0, "리듬을 하지 않은 계정이 포함됨");
        var record = rankingRecord with { RecordId = Guid.NewGuid(), Score = 5000 };
        rhythmStore.AddRecord(record);
        rhythmStore.AddRecord(record with { Score = 99999 });
        rhythmStore.AddRecord(record with { RecordId = Guid.NewGuid(), Score = 10 });
        rhythmStore.AddRecord(record with { RecordId = Guid.NewGuid(), UserId = "bravo" });
        rhythmStore.AddRecord(record with { RecordId = Guid.NewGuid(), UserId = "charlie", Score = 0 });
        var rows = new RhythmStore(rankingStore.Folder).Rankings();
        Assert(rows.SequenceEqual(new[] { new RankingEntry(1, "alpha", 5000), new RankingEntry(1, "bravo", 5000), new RankingEntry(3, "charlie", 0) }), "리듬 랭킹 순위 또는 최고 점수 오류");
        Assert(rankingStore.BestScore("alpha") == 1200 && rankingStore.Rankings()[0].BestScore == 1200, "리듬 점수가 똥 피하기에 섞임");
    });
    Check("리듬 랭킹: 동시 저장 및 손상된 파일 보존", () =>
    {
        Parallel.For(0, 12, i => new RhythmStore(rankingStore.Folder).AddRecord(rankingRecord with { RecordId = Guid.NewGuid(), Score = 6000 + i }));
        Assert(rhythmStore.Rankings()[0].BestScore == 6011, "리듬 동시 저장 중 점수 유실");
        File.WriteAllText(rhythmStore.FilePath, "{ broken");
        Throws<InvalidDataException>(() => rhythmStore.AddRecord(rankingRecord));
        Assert(File.ReadAllText(rhythmStore.FilePath) == "{ broken", "손상된 리듬 파일을 덮어씀");
    });
    var slap = new SlapStore(Path.Combine(root, "맞짱"), () => slapClock);
    Check("맞짱: 방 제목 저장·재조회·입력 검사·이전 방 호환", () =>
    {
        var titled = new SlapStore(Path.Combine(root, "방 제목"));
        Throws<ArgumentException>(() => titled.Create("host", "   "));
        Throws<ArgumentException>(() => titled.Create("host", new string('가', SlapRoom.MaxTitleLength + 1)));
        Assert(titled.Rooms().Count == 0, "잘못된 제목으로 방이 생성됨");
        var room = titled.Create("host", "  퇴근 전 한 판!  ");
        var reopened = new SlapStore(titled.Folder);
        Assert(reopened.Rooms().Single().Title == "퇴근 전 한 판!", "입력한 제목이 저장·복원되지 않음");
        Assert(reopened.Join(room.Id, "guest").Title == "퇴근 전 한 판!", "상대 참가 후 제목이 변경됨");
        Assert(reopened.RoomsAsync().GetAwaiter().GetResult().Single().Title == "퇴근 전 한 판!", "자동 조회에서 제목 누락");
        Assert(titled.Create("host", new string('가', SlapRoom.MaxTitleLength)).Title.Length == SlapRoom.MaxTitleLength, "최대 길이 제목 생성 실패");
        var legacy = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(titled.FilePath))!;
        foreach (var saved in legacy["Rooms"]!.AsArray()) saved!.AsObject().Remove("Title");
        File.WriteAllText(titled.FilePath, legacy.ToJsonString());
        Assert(reopened.Rooms().All(r => r.Title == "맞짱 방"), "제목이 없는 기존 방을 불러오지 못함");
        Assert(reopened.Join(room.Id, "guest").Players.Count == 2, "기존 방 참가자 유실");
    });
    Check("캐릭터 행동·결과 자세와 상대 선택 비공개", () =>
    {
        var room = new SlapRoom { Status = SlapStatus.Playing, Players = [new() { Id = "a" }, new() { Id = "b" }] };
        SlapFighterVisual View(string id, string viewer = "a") => SlapPresentation.ForPlayer(room, id, viewer);
        Assert(View("a").Pose == SlapPose.Idle, "평소 자세 오류");
        room.Submit("a", new(SlapMove.Slap, SlapZone.High, 1));
        Assert(View("a").Pose == SlapPose.Idle && View("a").CurrentChoice && View("a").Zone == SlapZone.High,
            "공격은 턴 종료 전까지 평소 자세 유지");
        var hidden = View("a", "b");
        Assert(hidden.Pose == SlapPose.Idle && hidden.Submitted && !hidden.CurrentChoice && hidden.Zone is null
            && !hidden.Charging && hidden.Caption == "입력 완료 ✓" && hidden.Description == "입력 완료 ✓", "상대 공격 선택 노출");
        room.Submit("b", new(SlapMove.Block, SlapZone.High));
        Assert(SlapPresentation.ShowsResult(room) && View("a").Pose == SlapPose.AttackFailed && View("b").Pose == SlapPose.Guard,
            "공격 실패·방어 성공 자세 오류");
        room.Submit("b", new(SlapMove.Slap, SlapZone.Middle, 1));
        Assert(!SlapPresentation.ShowsResult(room) && View("a").Pose == SlapPose.Idle, "현재 선택 중 지난 결과 재표시");
        room.Submit("a", new(SlapMove.Charge));
        Assert(View("b").Pose == SlapPose.AttackSuccess && View("a").Pose == SlapPose.Hit && View("a").Charging
            && View("a").Caption == "기 모으기 · 맞았다!", "공격 성공·기 모으기 중 피격 자세 오류");
        room.Submit("b", new(SlapMove.Charge));
        Assert(View("b", "b").Pose == SlapPose.Charge && View("b", "b").Charging
            && View("b").Pose == SlapPose.Idle && !View("b").Charging && View("b").Zone is null, "기 모으기 전용 자세·상대 선택 비공개 오류");
        room.Submit("a", new(SlapMove.Charge));
        Assert(View("a").Pose == SlapPose.Charge && View("b").Pose == SlapPose.Charge
            && View("a").Charging && View("b").Charging, "턴 결과 기 모으기 전용 자세 표시 오류");
        room.Submit("a", new(SlapMove.Block, SlapZone.Low));
        Assert(View("a").Pose == SlapPose.Guard && View("a").CurrentChoice && View("a", "b").Zone is null,
            "방어 준비·상대 방어 선택 비공개 오류");
        room.SetGiveUp("a", true); room.SetGiveUp("b", true);
        Assert(!SlapPresentation.ShowsResult(room) && View("a").Caption == "대전 종료", "포기 종료 후 이전 결과 표시");
    });
    SlapRoom Ready2(string a, string b)
    {
        var room = slap.Create(a); slap.Join(room.Id, b);
        slap.SetReady(room.Id, a, true); return slap.SetReady(room.Id, b, true);
    }
    Check("맞짱: 기본공격·강한 뺨·필살뺨 피해 1·2·5", () =>
        Assert(SlapRules.Damage(1) == 1 && SlapRules.Damage(2) == 2 && SlapRules.Damage(3) == 5 && SlapRules.MaxHp == 6, "공격력 배율 또는 체력 오류"));
    Check("맞짱: 기본공격 무료·스킬 기력 소모·모든 기력에서 무료 방어", () =>
    {
        foreach (var (power, cost, damage) in new[] { (1, 0, 1), (2, 1, 2), (3, 3, 5) })
        for (int attackGauge = 0; attackGauge <= 3; attackGauge++)
        for (int defenseGauge = 0; defenseGauge <= 3; defenseGauge++)
        foreach (var blocked in new[] { true, false })
        {
            var attacker = new SlapPlayer { Id = "attack", Gauge = attackGauge };
            var defender = new SlapPlayer { Id = "defense", Gauge = defenseGauge };
            var room = new SlapRoom { Status = SlapStatus.Playing, Players = [attacker, defender] };
            var attack = new SlapAction(SlapMove.Slap, SlapZone.High, power);
            if (attackGauge < cost)
            {
                Throws<ArgumentException>(() => room.Submit(attacker.Id, attack));
                Assert(!attacker.Submitted && attacker.Gauge == attackGauge, "기 부족으로 거절된 공격이 상태를 변경함");
                continue;
            }
            room.Submit(attacker.Id, attack);
            room.Submit(defender.Id, new SlapAction(SlapMove.Block, blocked ? SlapZone.High : SlapZone.Low));
            Assert(attacker.Gauge == attackGauge - cost, "공격 기력 소모 오류");
            Assert(defender.Gauge == defenseGauge, "방어가 기력을 소모함");
            Assert(room.LastResult!.Blocked == blocked && room.LastResult.Damage == (blocked ? 0 : damage)
                && defender.Hp == SlapRules.MaxHp - (blocked ? 0 : damage), "방어 또는 공격 피해 판정 오류");
        }
    });
    Check("맞짱: 쓰기 잠금을 기다리는 중에도 마지막 완성본 조회 가능", () =>
    {
        var shared = new SlapStore(Path.Combine(root, "조회 쓰기 동시성"));
        var room = shared.Create("host");
        var held = new FileStream(Path.Combine(shared.Folder, ".ddongvoid-slap.lock"), FileMode.Open, FileAccess.ReadWrite, FileShare.None);
        var writer = Task.Run(() => shared.Join(room.Id, "guest"));
        var reader = Task.Run(() => shared.Rooms().Single(r => r.Id == room.Id));
        try
        {
            Assert(reader.Wait(TimeSpan.FromSeconds(1)), "조회가 다른 PC의 쓰기 잠금에 막힘");
            Assert(reader.Result.Players.Count == 1 && !writer.IsCompleted, "쓰기 완료 전 일관된 이전 상태를 읽지 못함");
            var asyncReader = shared.RoomsAsync();
            Assert(asyncReader.Wait(TimeSpan.FromSeconds(1)) && asyncReader.Result.Single(r => r.Id == room.Id).Players.Count == 1,
                "자동 갱신용 비동기 조회가 쓰기 잠금에 막힘");
        }
        finally
        {
            held.Dispose(); writer.GetAwaiter().GetResult(); reader.GetAwaiter().GetResult();
        }
        Assert(shared.Rooms().Single(r => r.Id == room.Id).Players.Count == 2, "쓰기 완료 후 새 참가자를 읽지 못함");
    });
    Check("맞짱: 이전 조회 파일을 열어 둬도 새 상태 저장·조회 가능", () =>
    {
        var shared = new SlapStore(Path.Combine(root, "열린 조회 파일"));
        var room = shared.Create("host");
        using var oldSnapshot = new FileStream(shared.FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        shared.Join(room.Id, "guest");
        using var previous = JsonDocument.Parse(oldSnapshot);
        Assert(previous.RootElement.GetProperty("Rooms")[0].GetProperty("Players").GetArrayLength() == 1,
            "열어 둔 완성본이 저장 도중 바뀜");
        Assert(shared.RoomsAsync().GetAwaiter().GetResult().Single(r => r.Id == room.Id).Players.Count == 2,
            "새 조회가 원자적으로 교체된 새 상태를 읽지 못함");
    });
    Check("맞짱: 동시에 여러 방을 저장하는 동안 조회해도 갱신 유실·부분 JSON 없음", () =>
    {
        var shared = new SlapStore(Path.Combine(root, "동시 저장과 조회"));
        var writers = Task.Run(() => Parallel.For(0, 12, i => shared.Create($"host{i}")));
        do
        {
            var snapshot = shared.RoomsAsync().GetAwaiter().GetResult();
            Assert(snapshot.All(r => r.Players.Count == 1) && snapshot.Select(r => r.Id).Distinct().Count() == snapshot.Count,
                "동시 조회에서 불완전하거나 중복된 방 상태를 읽음");
        } while (!writers.IsCompleted);
        writers.GetAwaiter().GetResult();
        Assert(shared.Rooms().Count == 12, "동시 쓰기에서 방 생성 결과가 유실됨");
    });
    Check("맞짱: 응답 없는 조회 시간 제한·취소·다음 조회 재개", () =>
    {
        var stalled = new TaskCompletionSource<List<SlapRoom>>(TaskCreationOptions.RunContinuationsAsynchronously);
        CancellationToken readToken = default;
        try
        {
            Throws<TimeoutException>(() => SlapSnapshotReader.ReadAsync(token => { readToken = token; return stalled.Task; },
                TimeSpan.FromMilliseconds(500)).GetAwaiter().GetResult());
            Assert(readToken.IsCancellationRequested, "시간 초과 시 진행 중인 읽기를 취소하지 않음");
            var snapshot = SlapSnapshotReader.ReadAsync(_ => Task.FromResult(new List<SlapRoom> { new() }), TimeSpan.FromSeconds(2)).GetAwaiter().GetResult();
            Assert(snapshot.Count == 1, "지연된 이전 읽기 때문에 다음 조회가 막힘");
            using var canceled = new CancellationTokenSource(); canceled.Cancel();
            Throws<OperationCanceledException>(() => SlapSnapshotReader.ReadAsync(_ => stalled.Task,
                TimeSpan.FromSeconds(2), canceled.Token).GetAwaiter().GetResult());
        }
        finally { stalled.TrySetResult([]); }
    });
    Check("맞짱: 참가·준비·시작 상태를 JSON에 기록", () =>
    {
        var room = slap.Create("p1");
        Assert(room.Players.Count == 1 && !room.Started && room.Status == SlapStatus.Waiting, "방 생성 상태 오류");
        slap.Join(room.Id, "p2");
        room = slap.SetReady(room.Id, "p1", true);
        Assert(!room.Started && room.Find("p1")!.Ready && !room.Find("p2")!.Ready, "한 명만 준비했는데 시작함");
        var json = JsonNode.Parse(File.ReadAllText(slap.FilePath))!["Rooms"]![0]!;
        Assert(json["Players"]!.AsArray().Count == 2 && json["Players"]![0]!["Ready"]!.GetValue<bool>() && json["Status"]!.GetValue<string>() == "Waiting", "JSON 참가·준비 정보 누락");
        room = slap.SetReady(room.Id, "p2", true);
        Assert(room.Started && room.AttackerId == "p1" && room.DefenderId == "p2" && room.Players.All(p => p.Hp == SlapRules.MaxHp && p.Gauge == 0), "둘 다 준비했는데 시작하지 않음");
        json = JsonNode.Parse(File.ReadAllText(slap.FilePath))!["Rooms"]![0]!;
        Assert(json["Started"]!.GetValue<bool>() && json["AttackerId"]!.GetValue<string>() == "p1", "JSON 시작 정보 누락");
        Throws<ArgumentException>(() => slap.Join(room.Id, "p3"));
        slap.Leave(room.Id, "p1");
    });
    Check("맞짱: 상대 입력 여부만 공개하고 둘 다 고르면 판정", () =>
    {
        var room = Ready2("a1", "d1");
        Throws<ArgumentException>(() => slap.Submit(room.Id, "a1", new SlapAction(SlapMove.Slap, SlapZone.High, 2)));
        Throws<ArgumentException>(() => slap.Submit(room.Id, "d1", new SlapAction(SlapMove.Slap, SlapZone.High, 1)));
        room = slap.Submit(room.Id, "a1", new SlapAction(SlapMove.Charge));
        Assert(room.Find("a1")!.Submitted && !room.Find("d1")!.Submitted && room.Round == 1, "입력 상태 오류");
        var json = JsonNode.Parse(File.ReadAllText(slap.FilePath))!["Rooms"]!.AsArray().First(r => r!["Id"]!.GetValue<Guid>() == room.Id)!;
        Assert(json["Players"]![0]!["Submitted"]!.GetValue<bool>() && !json["Players"]![1]!["Submitted"]!.GetValue<bool>(), "JSON 입력 여부 누락");
        Throws<ArgumentException>(() => slap.Submit(room.Id, "a1", new SlapAction(SlapMove.Charge)));
        room = slap.Submit(room.Id, "d1", new SlapAction(SlapMove.Charge));
        Assert(room.Round == 2 && room.AttackerId == "d1" && room.Players.All(p => p.Gauge == 1 && !p.Submitted), "판정 후 공수 교대 실패");
        slap.Leave(room.Id, "a1");
    });
    Check("맞짱: 같은 곳을 막으면 피해 없음, 다른 곳이면 맞음", () =>
    {
        var room = Ready2("b1", "b2");
        slap.Submit(room.Id, "b1", new SlapAction(SlapMove.Charge)); slap.Submit(room.Id, "b2", new SlapAction(SlapMove.Charge));
        slap.Submit(room.Id, "b2", new SlapAction(SlapMove.Charge)); slap.Submit(room.Id, "b1", new SlapAction(SlapMove.Block, SlapZone.Low));
        // Round 3: the basic attack is free even when blocked.
        slap.Submit(room.Id, "b1", new SlapAction(SlapMove.Slap, SlapZone.High, 1));
        room = slap.Submit(room.Id, "b2", new SlapAction(SlapMove.Block, SlapZone.High));
        Assert(room.LastResult!.Blocked && room.Find("b2")!.Hp == SlapRules.MaxHp && room.Find("b1")!.Gauge == 1, "막기 실패 또는 기본공격 기 소모 오류");
        // Round 4: b2 spends 1 기 for damage 2 into the wrong guard.
        slap.Submit(room.Id, "b2", new SlapAction(SlapMove.Slap, SlapZone.Middle, 2));
        room = slap.Submit(room.Id, "b1", new SlapAction(SlapMove.Block, SlapZone.Low));
        Assert(!room.LastResult!.Blocked && room.LastResult.Damage == 2 && room.Find("b1")!.Hp == SlapRules.MaxHp - 2 && room.Find("b2")!.Gauge == 1, "강한 뺨 피해 또는 기 소모 오류");
        slap.Leave(room.Id, "b1");
    });
    Check("맞짱: 체력 6에서 필살 피해 5 후 생존·추가 공격으로 승리·재대전 체력 복원", () =>
    {
        var room = Ready2("c1", "c2");
        slap.Submit(room.Id, "c1", new SlapAction(SlapMove.Charge)); slap.Submit(room.Id, "c2", new SlapAction(SlapMove.Charge));
        slap.Submit(room.Id, "c2", new SlapAction(SlapMove.Charge)); slap.Submit(room.Id, "c1", new SlapAction(SlapMove.Charge));
        slap.Submit(room.Id, "c1", new SlapAction(SlapMove.Charge)); room = slap.Submit(room.Id, "c2", new SlapAction(SlapMove.Block, SlapZone.High));
        Assert(room.Find("c1")!.Gauge == 3 && room.AttackerId == "c2", $"기 3개 모으기 실패 (기 {room.Find("c1")!.Gauge})");
        Throws<ArgumentException>(() => slap.Submit(room.Id, "c1", new SlapAction(SlapMove.Charge)));
        slap.Submit(room.Id, "c2", new SlapAction(SlapMove.Charge)); slap.Submit(room.Id, "c1", new SlapAction(SlapMove.Block, SlapZone.Middle));
        slap.Submit(room.Id, "c1", new SlapAction(SlapMove.Slap, SlapZone.Low, 3));
        room = slap.Submit(room.Id, "c2", new SlapAction(SlapMove.Block, SlapZone.High));
        Assert(room.Started && room.Winner is null && room.Find("c2")!.Hp == 1 && room.LastResult!.Damage == 5,
            "체력 6에서 필살뺨을 맞은 뒤 체력 1로 계속 진행하지 않음");
        Assert(slap.Rankings().All(r => r.UserId != "c1" && r.UserId != "c2"), "체력이 남았는데 승패를 집계함");
        room = new SlapStore(slap.Folder, () => slapClock).Sync(room.Id, "c2")!;
        Assert(room.Started && room.Find("c2")!.Hp == 1, "재접속 후 남은 체력 1을 보존하지 않음");
        slap.Submit(room.Id, "c2", new SlapAction(SlapMove.Slap, SlapZone.High, 1));
        slap.Submit(room.Id, "c1", new SlapAction(SlapMove.Block, SlapZone.High));
        slap.Submit(room.Id, "c1", new SlapAction(SlapMove.Slap, SlapZone.Low, 1));
        room = slap.Submit(room.Id, "c2", new SlapAction(SlapMove.Block, SlapZone.High));
        Assert(room.Status == SlapStatus.Finished && !room.Started && room.Winner == "c1" && room.Find("c2")!.Hp == 0,
            "추가 기본공격으로 체력 0이 된 뒤 승리하지 않음");
        Assert(slap.Rankings().Single(r => r.UserId == "c1").BestScore == 1 && slap.Rankings().Single(r => r.UserId == "c2").Losses == 1, "정상 대전 승패 누락");
        slap.Sync(room.Id, "c1"); slap.Sync(room.Id, "c2");
        Assert(slap.Rankings().Single(r => r.UserId == "c1").BestScore == 1, "대전 동기화 시 승수 중복 집계");
        room = slap.SetReady(room.Id, "c1", true); room = slap.SetReady(room.Id, "c2", true);
        Assert(room.Started && room.Players.All(p => p.Hp == SlapRules.MaxHp && p.Gauge == 0) && room.LastResult is null, "다시 하기 초기화 실패");
        slap.Leave(room.Id, "c1");
    });
    Check("맞짱: 방장 오프라인 선준비·상대 시작과 선입력·번갈아 재접속", () =>
    {
        var asyncFolder = Path.Combine(root, "시간 차 대전");
        var asyncClock = DateTimeOffset.UtcNow;
        SlapStore Client() => new(asyncFolder, () => asyncClock);
        var room = Client().Create("host");
        Client().SetReady(room.Id, "host", true);
        asyncClock += TimeSpan.FromDays(7);
        room = Client().Join(room.Id, "guest");
        Assert(room.Status == SlapStatus.Waiting && room.Find("host")!.Ready && !room.Find("guest")!.Ready,
            "오프라인 방장의 준비 상태가 상대 참가 후 유실됨");
        room = Client().SetReady(room.Id, "guest", true);
        Assert(room.Started && room.Round == 1 && room.AttackerId == "host" && room.Players.All(p => !p.Ready), "방장 재접속 없이 게임이 시작되지 않음");
        room = Client().Submit(room.Id, "guest", new SlapAction(SlapMove.Charge));
        var firstRevision = room.Revision;
        asyncClock += TimeSpan.FromDays(7);
        room = Client().Join(room.Id, "host");
        Assert(room.Started && room.Round == 1 && room.Revision == firstRevision && room.Find("guest")!.Submitted
            && !room.Find("host")!.Submitted && room.Players.All(p => p.Hp == SlapRules.MaxHp && p.Gauge == 0), "방장 재입장이 게임·상대 첫 입력을 초기화함");
        room = Client().Submit(room.Id, "host", new SlapAction(SlapMove.Slap, SlapZone.High, 1));
        Assert(room.Round == 2 && room.AttackerId == "guest" && room.Find("guest")!.Hp == SlapRules.MaxHp - 1 && room.Find("guest")!.Gauge == 1
            && room.Players.All(p => !p.Submitted), "시간 차 첫 턴 판정 또는 공수 교대 오류");
        Client().Submit(room.Id, "host", new SlapAction(SlapMove.Charge));
        asyncClock += TimeSpan.FromDays(7);
        room = Client().Join(room.Id, "guest");
        Assert(room.Round == 2 && room.Find("host")!.Choice == new SlapAction(SlapMove.Charge) && !room.Find("guest")!.Submitted,
            "상대 재입장 시 방장이 먼저 입력한 둘째 턴이 유실됨");
        room = Client().Submit(room.Id, "guest", new SlapAction(SlapMove.Slap, SlapZone.Middle, 2));
        asyncClock += TimeSpan.FromDays(7);
        room = Client().Join(room.Id, "host");
        Assert(room.Started && room.Round == 3 && room.AttackerId == "host" && room.LastResult!.Round == 2 && room.LastResult.Damage == 2
            && room.Find("host")!.Hp == SlapRules.MaxHp - 2 && room.Find("host")!.Gauge == 1 && room.Find("guest")!.Hp == SlapRules.MaxHp - 1 && room.Find("guest")!.Gauge == 0
            && room.Players.All(p => !p.Submitted), "번갈아 재접속 후 턴·결과·체력·기력이 일치하지 않음");
    });
    Check("맞짱: 장기 미접속·나가기·재실행 후에도 선택과 대전을 보존", () =>
    {
        var room = Ready2("e1", "e2");
        slap.Submit(room.Id, "e1", new SlapAction(SlapMove.Charge));
        slap.Leave(room.Id, "e1");
        slap.Leave(room.Id, "e2");
        var saved = File.ReadAllText(slap.FilePath);
        slapClock += TimeSpan.FromDays(90);
        var restarted = new SlapStore(slap.Folder, () => slapClock);
        Assert(restarted.Rooms().Any(r => r.Id == room.Id), "오래된 진행 중 대전이 삭제됨");
        room = restarted.Sync(room.Id, "e1")!;
        Assert(room.Started && room.Winner is null && room.Players.Count == 2 && room.Round == 1
            && room.Find("e1")!.Choice == new SlapAction(SlapMove.Charge), "재실행 후 대전 또는 선택 유실");
        var revision = room.Revision;
        Assert(restarted.Join(room.Id, "e2").Revision == revision, "이어하기가 대전을 초기화함");
        Assert(File.ReadAllText(slap.FilePath) == saved, "조회·이어하기가 저장된 상태를 변경함");
        room = restarted.Submit(room.Id, "e2", new SlapAction(SlapMove.Charge));
        Assert(room.Round == 2 && room.Players.All(p => p.Gauge == 1 && !p.Submitted), "시간 차이를 두고 낸 행동이 판정되지 않음");
        restarted.Submit(room.Id, "e2", new SlapAction(SlapMove.Slap, SlapZone.High, 2));
        slapClock += TimeSpan.FromDays(90);
        room = new SlapStore(slap.Folder, () => slapClock).Submit(room.Id, "e1", new SlapAction(SlapMove.Block, SlapZone.Low));
        Assert(room.Round == 3 && room.Find("e1")!.Hp == SlapRules.MaxHp - 2 && room.Find("e2")!.Gauge == 0, "재접속 후 체력·기력·턴 판정 오류");
    });
    Check("맞짱: 포기 요청 보존·취소·상호 포기 종료·승패 미집계", () =>
    {
        var room = Ready2("f1", "f2");
        var rankings = slap.Rankings();
        slap.Submit(room.Id, "f1", new SlapAction(SlapMove.Charge));
        Throws<ArgumentException>(() => slap.SetGiveUp(room.Id, "outsider", true));
        room = slap.SetGiveUp(room.Id, "f1", true);
        var revision = room.Revision;
        Assert(slap.SetGiveUp(room.Id, "f1", true).Revision == revision, "같은 포기 요청이 중복 처리됨");
        slapClock += TimeSpan.FromDays(30);
        var restarted = new SlapStore(slap.Folder, () => slapClock);
        room = restarted.Sync(room.Id, "f2")!;
        Assert(room.Started && room.Winner is null && room.Find("f1")!.GaveUp && room.Find("f1")!.Submitted, "한 사람의 포기 요청이 대전을 끝내거나 선택을 지움");
        Throws<ArgumentException>(() => restarted.Submit(room.Id, "f2", new SlapAction(SlapMove.Charge)));
        restarted.SetGiveUp(room.Id, "f1", false);
        room = restarted.Submit(room.Id, "f2", new SlapAction(SlapMove.Charge));
        Assert(room.Round == 2 && room.Players.All(p => p.Gauge == 1), "포기 취소 후 기존 선택으로 진행하지 못함");
        restarted.SetGiveUp(room.Id, "f1", true);
        slapClock += TimeSpan.FromDays(30);
        room = new SlapStore(slap.Folder, () => slapClock).SetGiveUp(room.Id, "f2", true);
        Assert(room.Status == SlapStatus.Finished && room.Winner is null && room.EndReason is not null
            && room.Players.All(p => p.GaveUp && !p.Submitted), "양쪽 포기로 종료되지 않음");
        Assert(slap.Rankings().SequenceEqual(rankings), "상호 포기한 대전이 승패에 집계됨");
        Throws<ArgumentException>(() => slap.Submit(room.Id, "f1", new SlapAction(SlapMove.Charge)));
        slap.SetReady(room.Id, "f1", true); room = slap.SetReady(room.Id, "f2", true);
        Assert(room.Started && room.Players.All(p => !p.GaveUp && !p.Submitted && p.Gauge == 0 && p.Hp == SlapRules.MaxHp), "재대전 후 포기 상태가 남음");
        slap.SetGiveUp(room.Id, "f1", true); slap.SetGiveUp(room.Id, "f2", true);
        slap.Leave(room.Id, "f1"); slap.Leave(room.Id, "f2");
        Assert(slap.Rooms().All(r => r.Id != room.Id), "종료 후 모두 나간 빈 방이 남음");
    });
    Check("맞짱: 누적 승패·승수 정렬·공동 순위·방 삭제 후 보존", () =>
    {
        var rankingSlap = new SlapStore(Path.Combine(root, "대전 랭킹"));
        foreach (var (winner, loser) in new[] { ("e1", "e2"), ("e1", "e2"), ("c1", "c2"), ("c2", "c1"), ("f1", "f2") })
        {
            var room = rankingSlap.Create(winner); rankingSlap.Join(room.Id, loser);
            rankingSlap.SetReady(room.Id, winner, true); room = rankingSlap.SetReady(room.Id, loser, true);
            while (room.Started)
            {
                var attacker = room.AttackerId!;
                var defender = room.DefenderId!;
                rankingSlap.Submit(room.Id, attacker, new SlapAction(SlapMove.Slap, SlapZone.High, 1));
                room = rankingSlap.Submit(room.Id, defender, new SlapAction(SlapMove.Block, defender == winner ? SlapZone.High : SlapZone.Low));
            }
            rankingSlap.Leave(room.Id, winner); rankingSlap.Leave(room.Id, loser);
        }
        var rows = new SlapStore(rankingSlap.Folder).Rankings();
        Assert(rows[0] == new RankingEntry(1, "e1", 2, 0), "승수 기준 내림차순 정렬 실패");
        Assert(rows.Single(r => r.UserId == "e2") == new RankingEntry(5, "e2", 0, 2), "패배 누적 또는 공동 순위 다음 순위 오류");
        Assert(rows.Single(r => r.UserId == "c1") == new RankingEntry(2, "c1", 1, 1), "재대전 승패 누락");
        Assert(rows.Single(r => r.UserId == "c2").Rank == 2 && rows.Single(r => r.UserId == "f1").Rank == 2, "승수가 같은데 패수에 따라 순위가 달라짐");
        Assert(rankingSlap.Rooms().Count == 0, "종료한 방이 삭제되지 않음");
    });
    Check("맞짱: 다른 방 생성·참가가 기존 대전을 유지하고 오래된 대기실도 참가 가능", () =>
    {
        var first = slap.Create("g1"); var second = slap.Create("g1");
        slap.SetReady(first.Id, "g1", true);
        slapClock += TimeSpan.FromDays(365);
        slap.Join(first.Id, "g2"); var running = slap.SetReady(first.Id, "g2", true);
        Assert(running.Started, "오래된 대기실 또는 준비 상태가 유실됨");
        slap.Submit(first.Id, "g1", new SlapAction(SlapMove.Charge));
        slap.Create("g1"); slap.Join(second.Id, "g2");
        running = new SlapStore(slap.Folder).Join(first.Id, "g1");
        Assert(running.Started && running.Players.Count == 2 && running.Find("g1")!.Submitted, "새 방이 기존 대전을 변경함");
        Throws<ArgumentException>(() => slap.Join(first.Id, "g3"));
        slap.Leave(second.Id, "g1"); slap.Leave(second.Id, "g2");
        Assert(slap.Rooms().All(r => r.Id != second.Id), "대기실을 명시적으로 나간 뒤 빈 방이 남음");
    });
    Check("맞짱: 세 방 동시 참가·독립 진행·한 방 종료 후 다른 방 보존", () =>
    {
        var multi = new SlapStore(Path.Combine(root, "동시 대전"));
        var first = multi.Create("multi"); multi.Join(first.Id, "opponent1");
        var second = multi.Create("multi"); multi.Join(second.Id, "opponent2");
        var third = multi.Create("opponent3"); multi.Join(third.Id, "multi");
        foreach (var room in multi.Rooms())
        {
            multi.SetReady(room.Id, room.Players[0].Id, true);
            multi.SetReady(room.Id, room.Players[1].Id, true);
        }
        multi.Submit(first.Id, "multi", new SlapAction(SlapMove.Slap, SlapZone.High, 1));
        multi.Submit(first.Id, "opponent1", new SlapAction(SlapMove.Block, SlapZone.Low));
        multi.Submit(second.Id, "multi", new SlapAction(SlapMove.Charge));
        multi.Submit(third.Id, "opponent3", new SlapAction(SlapMove.Charge));
        multi.Submit(third.Id, "multi", new SlapAction(SlapMove.Block, SlapZone.Middle));
        multi.SetGiveUp(first.Id, "multi", true); multi.SetGiveUp(first.Id, "opponent1", true);
        var restored = new SlapStore(multi.Folder).Rooms();
        Assert(restored.Count == 3 && restored.All(r => r.Find("multi") is not null), "여러 방 참가 상태가 유실됨");
        first = restored.Single(r => r.Id == first.Id);
        second = restored.Single(r => r.Id == second.Id);
        third = restored.Single(r => r.Id == third.Id);
        Assert(first.Status == SlapStatus.Finished && first.Find("opponent1")!.Hp == SlapRules.MaxHp - 1, "첫 방의 진행·종료 상태 오류");
        Assert(second.Started && second.Round == 1 && second.Find("multi")!.Choice == new SlapAction(SlapMove.Charge)
            && second.Players.All(p => p.Hp == SlapRules.MaxHp && p.Gauge == 0 && !p.GaveUp), "다른 방의 행동·포기가 두 번째 방에 영향을 줌");
        Assert(third.Started && third.Round == 2 && third.Find("opponent3")!.Gauge == 1 && third.Find("multi")!.Gauge == 0
            && third.Players.All(p => p.Hp == SlapRules.MaxHp && !p.Submitted && !p.GaveUp), "방 사이에 체력·기력·턴·선택이 섞임");
    });
    Check("맞짱: 손상된 파일은 대전·승패 기록을 보호", () =>
    {
        File.WriteAllText(slap.FilePath, "{ broken");
        Throws<InvalidDataException>(() => slap.Rooms());
        Throws<InvalidDataException>(() => slap.Create("g2"));
        Assert(File.ReadAllText(slap.FilePath) == "{ broken", "손상된 대전 파일의 승패 기록을 덮어씀");
    });
    Check("맞짱: 이전 버전 대전 파일의 빈 승패 랭킹", () =>
    {
        var legacySlap = new SlapStore(Path.Combine(root, "이전 대전"));
        Directory.CreateDirectory(legacySlap.Folder);
        File.WriteAllText(legacySlap.FilePath, "{\"Version\":1,\"Rooms\":[]}");
        Assert(legacySlap.Rankings().Count == 0 && legacySlap.Create("legacy").Players.Count == 1, "이전 대전 파일을 읽지 못함");
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
