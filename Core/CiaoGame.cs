using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DDongVoid.Core;

public enum CiaoStatus { Waiting, Playing, Finished }
public enum CiaoPhase { Roll, Declare, Respond }

public static class CiaoRules
{
    public const int MaxPlayers = 4, MaxTitleLength = 40, Pawns = 7, Finish = 9, PodiumSize = 8;
    public const int MaxDeclaration = 4;
    public static int DieFromFace(int face) => face switch
    {
        >= 1 and <= 4 => face,
        0 or 5 => 0,
        _ => throw new ArgumentOutOfRangeException(nameof(face)),
    };
    public static string DieName(int value) => value == 0 ? "X" : value.ToString();
}

public sealed class CiaoPlayer
{
    public string Id { get; set; } = "";
    public bool Ready { get; set; }
    public int? Position { get; set; } = 0;
    public int Reserve { get; set; } = CiaoRules.Pawns - 1;
    public int Fallen { get; set; }
    public List<int> GoalScores { get; set; } = [];
    public int Score => GoalScores.Sum();
    public bool CanChallenge => Position is not null || GoalScores.Count > 0;
}

public sealed record CiaoResult(int Turn, string Speaker, int Declaration, string? Challenger,
    int? RevealedDie, string? FallenPlayer, string MovedPlayer, string Message);

public sealed class CiaoRoom
{
    public Guid Id { get; set; }
    public string Title { get; set; } = "차오차오 방";
    public DateTimeOffset CreatedAt { get; set; }
    public CiaoStatus Status { get; set; }
    public int Revision { get; set; }
    public int Turn { get; set; } = 1;
    public int SpeakerIndex { get; set; }
    public CiaoPhase Phase { get; set; }
    // Persisted for reconnects; views returned to other players redact this field.
    public int? Die { get; set; }
    public int? Declaration { get; set; }
    public List<string> Passed { get; set; } = [];
    public List<CiaoPlayer> Players { get; set; } = [];
    public List<string> Winners { get; set; } = [];
    public CiaoResult? LastResult { get; set; }
    public string? EndReason { get; set; }
    public string? SpeakerId => Status == CiaoStatus.Playing ? Players[SpeakerIndex].Id : null;
    public string? ResponderId => Status == CiaoStatus.Playing && Phase == CiaoPhase.Respond
        ? Enumerable.Range(1, Players.Count - 1).Select(i => Players[(SpeakerIndex + i) % Players.Count])
            .FirstOrDefault(p => p.CanChallenge && !Passed.Contains(p.Id))?.Id : null;
    public CiaoPlayer? Find(string id) => Players.FirstOrDefault(p => p.Id == id);

    public void SetReady(string id, bool ready)
    {
        var player = Find(id) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status == CiaoStatus.Playing) throw new ArgumentException("이미 게임이 진행 중입니다.");
        player.Ready = ready; Revision++;
        if (Players.Count >= 2 && Players.All(p => p.Ready))
        {
            Status = CiaoStatus.Playing; Turn = 1; SpeakerIndex = 0; Phase = CiaoPhase.Roll;
            Die = Declaration = null; Passed.Clear(); Winners.Clear(); LastResult = null; EndReason = null;
            foreach (var p in Players)
            {
                p.Ready = false; p.Position = 0; p.Reserve = CiaoRules.Pawns - 1; p.Fallen = 0; p.GoalScores.Clear();
            }
        }
    }
    public void CheckAction(string id, int revision)
    {
        if (Find(id) is null) throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status != CiaoStatus.Playing) throw new ArgumentException("게임이 진행 중이 아닙니다.");
        if (Revision != revision) throw new ArgumentException("방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.");
    }
    public void Roll(string id, int revision, int die)
    {
        CheckAction(id, revision);
        if (SpeakerId != id || Phase != CiaoPhase.Roll) throw new ArgumentException("지금은 주사위를 굴릴 차례가 아닙니다.");
        if (die is < 0 or > CiaoRules.MaxDeclaration) throw new ArgumentException("주사위 눈이 올바르지 않습니다.");
        Die = die; Phase = CiaoPhase.Declare; Revision++;
    }
    public void Declare(string id, int revision, int number)
    {
        CheckAction(id, revision);
        if (SpeakerId != id || Phase != CiaoPhase.Declare || Die is null) throw new ArgumentException("주사위를 먼저 굴려 주세요.");
        if (number is < 1 or > CiaoRules.MaxDeclaration) throw new ArgumentException($"1~{CiaoRules.MaxDeclaration} 중 하나를 선언해 주세요.");
        Declaration = number; Passed.Clear(); Phase = CiaoPhase.Respond; Revision++;
        if (ResponderId is null) Resolve(null);
    }
    public void Respond(string id, int revision, bool doubt)
    {
        CheckAction(id, revision);
        if (Phase != CiaoPhase.Respond || ResponderId != id) throw new ArgumentException("지금은 응답할 차례가 아닙니다.");
        Revision++;
        if (doubt) Resolve(id);
        else { Passed.Add(id); if (ResponderId is null) Resolve(null); }
    }
    private void ReplacePawn(CiaoPlayer player)
    {
        if (player.Reserve > 0) { player.Reserve--; player.Position = 0; }
        else player.Position = null;
    }
    private void Drop(CiaoPlayer player)
    {
        if (player.Position is not null) { player.Fallen++; ReplacePawn(player); }
        else if (player.GoalScores.Count > 0)
        {
            // With no racing pawn, risk the lowest scoring podium pawn.
            player.GoalScores.Remove(player.GoalScores.Min()); player.Fallen++;
        }
    }
    private void Move(CiaoPlayer player, int steps)
    {
        if (player.Position is not int position) return;
        if (position + steps < CiaoRules.Finish) { player.Position = position + steps; return; }
        var occupied = Players.SelectMany(p => p.GoalScores).ToHashSet();
        player.GoalScores.Add(Enumerable.Range(1, CiaoRules.PodiumSize).First(i => !occupied.Contains(i)));
        ReplacePawn(player);
    }
    private void Resolve(string? challengerId)
    {
        var speaker = Players[SpeakerIndex]; var number = Declaration!.Value;
        var truthful = Die == number;
        string? fallen = null;
        var mover = speaker;
        string result;
        if (challengerId is null) result = $"모두 PASS · {speaker.Id} {number}칸 이동 · 주사위 비공개";
        else
        {
            var challenger = Find(challengerId)!;
            fallen = truthful ? challenger.Id : speaker.Id;
            Drop(truthful ? challenger : speaker);
            mover = truthful ? speaker : challenger;
            var movement = mover.Position is null ? $"{mover.Id} 경주 말 없음 · 이동 없음" : $"{mover.Id} {number}칸 이동";
            result = $"{challenger.Id} 의심 {(truthful ? "실패" : "성공")}! 실제 주사위 {CiaoRules.DieName(Die!.Value)} · {fallen}의 말 추락 · {movement}";
        }
        Move(mover, number);
        LastResult = new(Turn, speaker.Id, number, challengerId, challengerId is null ? null : Die, fallen, mover.Id, result);
        Die = Declaration = null; Passed.Clear(); Phase = CiaoPhase.Roll;
        var winner = Players.FirstOrDefault(p => p.GoalScores.Count >= 3);
        if (winner is not null)
        {
            Winners = [winner.Id]; EndReason = "말 3개 도착!"; Status = CiaoStatus.Finished; return;
        }
        if (Players.All(p => p.Position is null) || Players.Sum(p => p.GoalScores.Count) == CiaoRules.PodiumSize)
        {
            var best = Players.Max(p => p.Score);
            Winners = Players.Where(p => p.Score == best).Select(p => p.Id).ToList();
            EndReason = "경주 종료 · 도착 점수 합계로 승부"; Status = CiaoStatus.Finished; return;
        }
        do { SpeakerIndex = (SpeakerIndex + 1) % Players.Count; } while (Players[SpeakerIndex].Position is null);
        Turn++;
    }
    public CiaoRoom ViewFor(string viewer)
    {
        var copy = JsonSerializer.Deserialize<CiaoRoom>(JsonSerializer.Serialize(this))!;
        if (viewer != SpeakerId) copy.Die = null;
        return copy;
    }
}

public sealed class CiaoDatabase
{
    public int Version { get; set; } = 1;
    public List<CiaoRoom> Rooms { get; set; } = [];
}

public sealed class CiaoStore
{
    public string Folder { get; }
    public string FilePath => Path.Combine(Folder, "ddongvoid-ciao.json");
    private readonly Func<int> roll;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, Converters = { new JsonStringEnumConverter() } };
    public CiaoStore(string folder, Func<int>? roller = null)
    {
        Folder = Path.GetFullPath(folder);
        roll = roller ?? (() => CiaoRules.DieFromFace(RandomNumberGenerator.GetInt32(6)));
    }
    private static CiaoDatabase Validate(CiaoDatabase? db)
    {
        if (db is null || db.Version != 1 || db.Rooms is null || db.Rooms.Any(r => r is null ||
            string.IsNullOrWhiteSpace(r.Title) || r.Players is null || r.Players.Count is < 1 or > CiaoRules.MaxPlayers ||
            r.Players.Any(p => p is null || string.IsNullOrEmpty(p.Id) || p.Reserve is < 0 or >= CiaoRules.Pawns ||
                p.Fallen is < 0 or > CiaoRules.Pawns || p.Position is < 0 or >= CiaoRules.Finish || p.GoalScores is null ||
                p.GoalScores.Any(s => s is < 1 or > CiaoRules.PodiumSize) ||
                p.Reserve + p.Fallen + p.GoalScores.Count + (p.Position is null ? 0 : 1) != CiaoRules.Pawns) ||
            r.Players.Select(p => p.Id).Distinct().Count() != r.Players.Count ||
            r.Players.SelectMany(p => p.GoalScores).Distinct().Count() != r.Players.Sum(p => p.GoalScores.Count) ||
            !Enum.IsDefined(r.Status) || !Enum.IsDefined(r.Phase) || r.Revision < 0 || r.Turn < 1 ||
            r.Passed is null || r.Winners is null || r.SpeakerIndex < 0 || r.SpeakerIndex >= r.Players.Count ||
            (r.Status == CiaoStatus.Playing && (r.Players.Count < 2 || r.Players[r.SpeakerIndex].Position is null ||
                (r.Phase == CiaoPhase.Roll ? r.Die is not null || r.Declaration is not null : r.Die is null || r.Die is < 0 or > CiaoRules.MaxDeclaration) ||
                (r.Phase == CiaoPhase.Respond && (r.Declaration is null or < 1 or > CiaoRules.MaxDeclaration || r.ResponderId is null))))))
            throw new JsonException();
        return db;
    }
    private async Task<CiaoDatabase> ReadAsync(CancellationToken cancellation = default)
    {
        cancellation.ThrowIfCancellationRequested();
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                await using var file = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete,
                    4096, FileOptions.Asynchronous | FileOptions.SequentialScan);
                return Validate(await JsonSerializer.DeserializeAsync<CiaoDatabase>(file, JsonOptions, cancellation).ConfigureAwait(false));
            }
            catch (IOException ex) when (attempt < 20 && (ex.HResult & 0xffff) is 32 or 33)
            { await Task.Delay(25, cancellation).ConfigureAwait(false); }
            catch (FileNotFoundException) { return new(); }
            catch (DirectoryNotFoundException) { return new(); }
            catch (JsonException ex) { throw new InvalidDataException("차오차오 JSON 형식이 올바르지 않습니다. 기존 방을 보호하기 위해 파일을 보존했습니다.", ex); }
        }
    }
    private T Write<T>(Func<CiaoDatabase, T> action) => SharedFile.Locked(FilePath, ".ddongvoid-ciao.lock", true,
        "다른 PC에서 차오차오 정보를 저장 중입니다. 잠시 후 다시 시도해 주세요.", () =>
        {
            var db = ReadAsync().GetAwaiter().GetResult();
            var result = action(db); Validate(db); SharedFile.WriteAtomic(FilePath, db, JsonOptions); return result;
        });
    private static CiaoRoom Room(CiaoDatabase db, Guid id) => db.Rooms.FirstOrDefault(r => r.Id == id)
        ?? throw new ArgumentException("방이 사라졌습니다. 방 목록에서 다시 골라 주세요.");
    public async Task<List<CiaoRoom>> RoomsAsync(string viewer, CancellationToken cancellation = default) =>
        (await ReadAsync(cancellation).ConfigureAwait(false)).Rooms.OrderBy(r => r.CreatedAt).Select(r => r.ViewFor(viewer)).ToList();
    public List<CiaoRoom> Rooms(string viewer) => RoomsAsync(viewer).GetAwaiter().GetResult();
    public CiaoRoom Create(string userId, string title)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("방 제목을 입력해 주세요.");
        title = title.Trim();
        if (title.Length > CiaoRules.MaxTitleLength) throw new ArgumentException($"방 제목은 {CiaoRules.MaxTitleLength}자까지 입력할 수 있습니다.");
        return Write(db =>
        {
            var room = new CiaoRoom { Id = Guid.NewGuid(), Title = title, CreatedAt = DateTimeOffset.UtcNow, Players = [new() { Id = userId }] };
            db.Rooms.Add(room); return room.ViewFor(userId);
        });
    }
    public CiaoRoom Join(Guid id, string userId) => Write(db =>
    {
        var room = Room(db, id);
        if (room.Find(userId) is not null) return room.ViewFor(userId);
        if (room.Status != CiaoStatus.Waiting) throw new ArgumentException("이미 시작했거나 종료한 방입니다.");
        if (room.Players.Count >= CiaoRules.MaxPlayers) throw new ArgumentException("이미 4명이 참가한 방입니다.");
        room.Players.Add(new() { Id = userId }); room.Revision++; return room.ViewFor(userId);
    });
    public CiaoRoom SetReady(Guid id, string userId, bool ready) => Write(db =>
    {
        var room = Room(db, id); room.SetReady(userId, ready); return room.ViewFor(userId);
    });
    private CiaoRoom Act(Guid id, string userId, Action<CiaoRoom> action) => Write(db =>
    {
        var room = Room(db, id); action(room); return room.ViewFor(userId);
    });
    public CiaoRoom Roll(Guid id, string userId, int revision) => Act(id, userId, room =>
    {
        room.CheckAction(userId, revision);
        if (room.SpeakerId != userId || room.Phase != CiaoPhase.Roll) throw new ArgumentException("지금은 주사위를 굴릴 차례가 아닙니다.");
        room.Roll(userId, revision, roll());
    });
    public CiaoRoom Declare(Guid id, string userId, int revision, int number) => Act(id, userId, room => room.Declare(userId, revision, number));
    public CiaoRoom Respond(Guid id, string userId, int revision, bool doubt) => Act(id, userId, room => room.Respond(userId, revision, doubt));
    public void Leave(Guid id, string userId) => Write(db =>
    {
        var room = Room(db, id);
        if (room.Status == CiaoStatus.Playing) return false; // Closing the view preserves an ongoing game.
        room.Players.RemoveAll(p => p.Id == userId);
        foreach (var player in room.Players) player.Ready = false;
        room.SpeakerIndex = 0; room.Revision++;
        if (room.Players.Count == 0) db.Rooms.Remove(room);
        return true;
    });
}
