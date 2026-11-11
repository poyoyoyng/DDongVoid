using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DDongVoid.Core;

public enum YachtStatus { Waiting, Playing, Finished }
public enum YachtCategory { Aces, Deuces, Threes, Fours, Fives, Sixes, Choice, FourOfAKind, FullHouse, SmallStraight, LargeStraight, Yacht }

public static class YachtRules
{
    public const int Players = 2, MaxTitleLength = 40, DiceCount = 5, MaxRolls = 3, Categories = 12;
    public const int BonusThreshold = 63, BonusScore = 35;
    public static readonly TimeSpan MatchPollInterval = TimeSpan.FromSeconds(.5);
    public static bool IsUpper(YachtCategory category) => category <= YachtCategory.Sixes;
    public static string Name(YachtCategory category) => category switch
    {
        YachtCategory.Aces => "1", YachtCategory.Deuces => "2", YachtCategory.Threes => "3",
        YachtCategory.Fours => "4", YachtCategory.Fives => "5", YachtCategory.Sixes => "6",
        YachtCategory.Choice => "찬스", YachtCategory.FourOfAKind => "포 다이스", YachtCategory.FullHouse => "풀 하우스",
        YachtCategory.SmallStraight => "S. 스트레이트", YachtCategory.LargeStraight => "L. 스트레이트", _ => "야추",
    };
    public static string Hint(YachtCategory category) => category switch
    {
        <= YachtCategory.Sixes => $"{(int)category + 1} 눈의 합",
        YachtCategory.Choice => "주사위 5개의 합",
        YachtCategory.FourOfAKind => "같은 눈 4개 이상 · 5개의 합",
        YachtCategory.FullHouse => "같은 눈 3개 + 2개 · 5개의 합",
        YachtCategory.SmallStraight => "연속 4개 · 15점",
        YachtCategory.LargeStraight => "연속 5개 · 30점",
        _ => "같은 눈 5개 · 50점",
    };
    public static int Score(YachtCategory category, IReadOnlyList<int> dice)
    {
        if (dice.Count != DiceCount || dice.Any(d => d is < 1 or > 6)) return 0;
        var counts = dice.GroupBy(d => d).Select(g => g.Count()).OrderDescending().ToArray();
        bool Run(int length) => Enumerable.Range(1, 7 - length).Any(start => Enumerable.Range(start, length).All(dice.Contains));
        return category switch
        {
            <= YachtCategory.Sixes => dice.Where(d => d == (int)category + 1).Sum(),
            YachtCategory.Choice => dice.Sum(),
            YachtCategory.FourOfAKind => counts[0] >= 4 ? dice.Sum() : 0,
            // 세계 게임전집 51 기준 최대 30점: 같은 눈 5개도 3개 + 2개로 묶을 수 있어 풀 하우스로 인정합니다.
            YachtCategory.FullHouse => counts[0] == 5 || counts is [3, 2] ? dice.Sum() : 0,
            YachtCategory.SmallStraight => Run(4) ? 15 : 0,
            YachtCategory.LargeStraight => Run(5) ? 30 : 0,
            _ => counts[0] == 5 ? 50 : 0,
        };
    }
    public static int RollDie() => RandomNumberGenerator.GetInt32(1, 7);
}

public sealed class YachtPlayer
{
    public string Id { get; set; } = "";
    public bool Ready { get; set; }
    public List<int?> Scores { get; set; } = NewSheet();
    internal static List<int?> NewSheet() => [.. Enumerable.Repeat<int?>(null, YachtRules.Categories)];
    public int? Score(YachtCategory category) => Scores[(int)category];
    public int UpperSum() => Scores.Take(6).Sum(s => s ?? 0);
    public bool UpperDone() => Scores.Take(6).All(s => s is not null);
    public int Bonus() => UpperSum() >= YachtRules.BonusThreshold ? YachtRules.BonusScore : 0;
    // The bonus is out of reach once even five of every empty upper face cannot close the gap.
    public bool BonusLost() => Bonus() == 0 && UpperSum() + Enumerable.Range(0, 6).Where(i => Scores[i] is null).Sum(i => 5 * (i + 1)) < YachtRules.BonusThreshold;
    // Three of each face is the 63-point pace: positive means ahead of it.
    public int UpperPace() => Enumerable.Range(0, 6).Where(i => Scores[i] is not null).Sum(i => Scores[i]!.Value - 3 * (i + 1));
    public int Total() => Scores.Sum(s => s ?? 0) + Bonus();
    public bool Done() => Scores.All(s => s is not null);
}

public sealed class YachtRoom
{
    public Guid Id { get; set; }
    public string Title { get; set; } = "야추 방";
    public DateTimeOffset CreatedAt { get; set; }
    public YachtStatus Status { get; set; }
    public int Revision { get; set; }
    public int Round { get; set; } = 1;
    public int CurrentIndex { get; set; }
    public List<int> Dice { get; set; } = [];
    public List<bool> Held { get; set; } = [];
    public int RollsUsed { get; set; }
    // Counts every roll so each PC can play the tumbling animation once per roll.
    public int RollCount { get; set; }
    public List<YachtPlayer> Players { get; set; } = [];
    public List<string> Winners { get; set; } = [];
    public string? LastMessage { get; set; }
    public string? HostId => Players.FirstOrDefault()?.Id;
    public string? CurrentPlayerId => Status == YachtStatus.Playing ? Players[CurrentIndex].Id : null;
    public YachtPlayer? Find(string id) => Players.FirstOrDefault(p => p.Id == id);
    public int RollsLeft => YachtRules.MaxRolls - RollsUsed;

    public void SetReady(string id, bool ready)
    {
        var player = Find(id) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status == YachtStatus.Playing) throw new ArgumentException("이미 게임이 진행 중입니다.");
        player.Ready = ready; Revision++;
        if (Players.Count < YachtRules.Players || Players.Any(p => !p.Ready)) return;
        foreach (var p in Players) { p.Ready = false; p.Scores = YachtPlayer.NewSheet(); }
        Status = YachtStatus.Playing; Round = 1; CurrentIndex = 0; Winners.Clear(); ResetDice();
        LastMessage = $"{Players[0].Id}님부터 시작합니다.";
    }
    public void CheckAction(string id, int revision)
    {
        if (Find(id) is null) throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status != YachtStatus.Playing) throw new ArgumentException("게임이 진행 중이 아닙니다.");
        if (Revision != revision) throw new ArgumentException("방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.");
        if (CurrentPlayerId != id) throw new ArgumentException("내 차례가 아닙니다.");
    }
    public void Roll(string id, int revision, IReadOnlyList<bool> held, Func<int>? die = null)
    {
        CheckAction(id, revision);
        if (RollsUsed >= YachtRules.MaxRolls) throw new ArgumentException("이번 차례에는 더 굴릴 수 없습니다. 점수를 적을 칸을 골라 주세요.");
        if (held.Count != YachtRules.DiceCount) throw new ArgumentException("주사위 고정 정보가 올바르지 않습니다.");
        if (RollsUsed > 0 && held.All(h => h)) throw new ArgumentException("다시 굴릴 주사위를 하나 이상 남겨 주세요.");
        die ??= YachtRules.RollDie;
        for (var i = 0; i < YachtRules.DiceCount; i++)
        {
            Held[i] = RollsUsed > 0 && held[i];
            if (!Held[i]) Dice[i] = die() is var value and >= 1 and <= 6 ? value : throw new ArgumentException("주사위 눈이 올바르지 않습니다.");
        }
        RollsUsed++; RollCount++; Revision++;
        LastMessage = $"{id} · {RollsUsed}번째 굴림 · {string.Join(" ", Dice)}";
    }
    public void Record(string id, int revision, YachtCategory category)
    {
        CheckAction(id, revision);
        if (!Enum.IsDefined(category)) throw new ArgumentException("없는 족보입니다.");
        if (RollsUsed == 0) throw new ArgumentException("먼저 주사위를 굴려 주세요.");
        var player = Find(id)!;
        if (player.Score(category) is not null) throw new ArgumentException("이미 점수를 적은 칸입니다.");
        var hadBonus = player.Bonus() > 0;
        var score = YachtRules.Score(category, Dice); player.Scores[(int)category] = score;
        LastMessage = $"{id} · {YachtRules.Name(category)} 칸 {score}점";
        if (!hadBonus && player.Bonus() > 0) LastMessage += $" · 상단 {player.UpperSum()}점 달성! 보너스 +{YachtRules.BonusScore}";
        Revision++;
        if (Players.All(p => p.Done()))
        {
            var best = Players.Max(p => p.Total());
            Winners = Players.Where(p => p.Total() == best).Select(p => p.Id).ToList();
            LastMessage = Winners.Count > 1 ? $"{best}점 동점 · 무승부" : $"{Winners[0]} 승리 · {best}점";
            Status = YachtStatus.Finished; ResetDice(); return;
        }
        CurrentIndex = (CurrentIndex + 1) % Players.Count;
        if (CurrentIndex == 0) Round++;
        ResetDice();
    }
    private void ResetDice()
    {
        Dice = [.. Enumerable.Repeat(0, YachtRules.DiceCount)]; Held = [.. Enumerable.Repeat(false, YachtRules.DiceCount)]; RollsUsed = 0;
    }
    public YachtRoom Copy() => JsonSerializer.Deserialize<YachtRoom>(JsonSerializer.Serialize(this))!;
}

public sealed class YachtDatabase
{
    public int Version { get; set; } = 1;
    public List<YachtRoom> Rooms { get; set; } = [];
    public List<Guid> DeletedRoomIds { get; set; } = [];
}

public sealed record YachtSnapshot(List<YachtRoom> Rooms, List<Guid> DeletedRoomIds);

public sealed class YachtStore
{
    public string Folder { get; }
    public string FilePath => Path.Combine(Folder, "ddongvoid-yacht.json");

    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, Converters = { new JsonStringEnumConverter() } };
    public YachtStore(string folder) { Folder = Path.GetFullPath(folder); }
    private static YachtDatabase Validate(YachtDatabase? db)
    {
        if (db is null || db.Version != 1 || db.Rooms is null || db.DeletedRoomIds is null ||
            db.DeletedRoomIds.Any(id => id == Guid.Empty) || db.DeletedRoomIds.Distinct().Count() != db.DeletedRoomIds.Count ||
            db.Rooms.Select(r => r?.Id).Distinct().Count() != db.Rooms.Count) throw new JsonException();
        foreach (var r in db.Rooms)
        {
            if (r is null || r.Id == Guid.Empty || db.DeletedRoomIds.Contains(r.Id) ||
                string.IsNullOrWhiteSpace(r.Title) || r.Title.Length > YachtRules.MaxTitleLength ||
                r.Players is null || r.Players.Count is < 1 or > YachtRules.Players ||
                r.Players.Any(p => p is null || string.IsNullOrWhiteSpace(p.Id) || p.Scores is null || p.Scores.Count != YachtRules.Categories ||
                    p.Scores.Any(s => s is < 0 or > 50)) ||
                r.Players.Select(p => p.Id).Distinct().Count() != r.Players.Count ||
                !Enum.IsDefined(r.Status) || r.Revision < 0 || r.RollCount < 0 || r.Round is < 1 or > YachtRules.Categories ||
                r.CurrentIndex < 0 || r.CurrentIndex >= r.Players.Count || r.RollsUsed is < 0 or > YachtRules.MaxRolls ||
                r.Dice is null || r.Held is null || r.Winners is null ||
                r.Winners.Distinct().Count() != r.Winners.Count || r.Winners.Any(id => r.Find(id) is null))
                throw new JsonException();
            if (r.Status == YachtStatus.Waiting)
            {
                if (r.Winners.Count != 0 || r.Dice.Count != 0 || r.Held.Count != 0 || r.Players.Any(p => p.Scores.Any(s => s is not null)))
                    throw new JsonException();
            }
            else if (r.Players.Count != YachtRules.Players || r.Dice.Count != YachtRules.DiceCount || r.Held.Count != YachtRules.DiceCount ||
                r.Dice.Any(d => r.RollsUsed == 0 ? d != 0 : d is < 1 or > 6) ||
                (r.Status == YachtStatus.Playing && (r.Winners.Count != 0 || r.Players.All(p => p.Done()))) ||
                (r.Status == YachtStatus.Finished && (r.Winners.Count == 0 || r.Players.Any(p => !p.Done()))))
                throw new JsonException();
        }
        return db;
    }
    private async Task<YachtDatabase> ReadAsync(CancellationToken cancellation = default)
    {
        cancellation.ThrowIfCancellationRequested();
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                await using var file = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete,
                    4096, FileOptions.Asynchronous | FileOptions.SequentialScan);
                return Validate(await JsonSerializer.DeserializeAsync<YachtDatabase>(file, JsonOptions, cancellation).ConfigureAwait(false));
            }
            catch (IOException ex) when (attempt < 20 && (ex.HResult & 0xffff) is 32 or 33)
            { await Task.Delay(25, cancellation).ConfigureAwait(false); }
            catch (FileNotFoundException) { return new(); }
            catch (DirectoryNotFoundException) { return new(); }
            catch (JsonException ex) { throw new InvalidDataException("야추 JSON 형식이 올바르지 않습니다. 기존 방을 보호하기 위해 파일을 보존했습니다.", ex); }
        }
    }
    private T Write<T>(Func<YachtDatabase, T> action) => SharedFile.Locked(FilePath, ".ddongvoid-yacht.lock", true,
        "다른 PC에서 야추 정보를 저장 중입니다. 잠시 후 다시 시도해 주세요.", () =>
        {
            var db = ReadAsync().GetAwaiter().GetResult();
            var result = action(db); Validate(db); SharedFile.WriteAtomic(FilePath, db, JsonOptions); return result;
        });
    private static YachtRoom Room(YachtDatabase db, Guid id) => db.Rooms.FirstOrDefault(r => r.Id == id)
        ?? throw new ArgumentException("방이 사라졌습니다. 방 목록에서 다시 골라 주세요.");
    public async Task<YachtSnapshot> SnapshotAsync(CancellationToken cancellation = default)
    {
        var db = await ReadAsync(cancellation).ConfigureAwait(false);
        return new(db.Rooms.OrderBy(r => r.CreatedAt).ToList(), db.DeletedRoomIds.ToList());
    }
    public List<YachtRoom> Rooms() => SnapshotAsync().GetAwaiter().GetResult().Rooms;
    public YachtRoom Create(string userId, string title)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("방 제목을 입력해 주세요.");
        title = title.Trim();
        if (title.Length > YachtRules.MaxTitleLength) throw new ArgumentException($"방 제목은 {YachtRules.MaxTitleLength}자까지 입력할 수 있습니다.");
        return Write(db =>
        {
            var room = new YachtRoom { Id = Guid.NewGuid(), Title = title, CreatedAt = DateTimeOffset.UtcNow, Players = [new() { Id = userId }] };
            db.Rooms.Add(room); return room.Copy();
        });
    }
    public YachtRoom Join(Guid id, string userId) => Write(db =>
    {
        var room = Room(db, id);
        if (room.Find(userId) is not null) return room.Copy();
        if (room.Status != YachtStatus.Waiting) throw new ArgumentException("이미 시작했거나 종료한 방입니다.");
        if (room.Players.Count >= YachtRules.Players) throw new ArgumentException("이미 2명이 참가한 방입니다.");
        room.Players.Add(new() { Id = userId }); room.Revision++; return room.Copy();
    });
    private YachtRoom Act(Guid id, Action<YachtRoom> action) => Write(db =>
    {
        var room = Room(db, id); action(room); return room.Copy();
    });
    public YachtRoom SetReady(Guid id, string userId, bool ready) => Act(id, room => room.SetReady(userId, ready));
    public YachtRoom Roll(Guid id, string userId, int revision, IReadOnlyList<bool> held) => Act(id, room => room.Roll(userId, revision, held));
    public YachtRoom Record(Guid id, string userId, int revision, YachtCategory category) => Act(id, room => room.Record(userId, revision, category));
    public void DeleteRoom(Guid id, string userId) => Write(db =>
    {
        var room = Room(db, id);
        if (room.HostId != userId) throw new ArgumentException("방장만 방을 없앨 수 있습니다.");
        db.Rooms.Remove(room);
        db.DeletedRoomIds.Add(id);
        return true;
    });
    public void Leave(Guid id, string userId) => Write(db =>
    {
        var room = Room(db, id);
        if (room.Find(userId) is null) throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (room.Status == YachtStatus.Playing) return false; // Closing the view preserves an ongoing game.
        room.Players.RemoveAll(p => p.Id == userId);
        foreach (var player in room.Players) { player.Ready = false; player.Scores = YachtPlayer.NewSheet(); }
        room.Status = YachtStatus.Waiting; room.CurrentIndex = 0; room.Round = 1; room.RollsUsed = 0;
        room.Dice.Clear(); room.Held.Clear(); room.Winners.Clear(); room.LastMessage = null;
        room.Revision++;
        if (room.Players.Count == 0) { db.Rooms.Remove(room); db.DeletedRoomIds.Add(id); }
        return true;
    });
}
