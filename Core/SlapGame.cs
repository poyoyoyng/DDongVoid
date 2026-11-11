using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DDongVoid.Core;

public enum SlapZone { High, Middle, Low }
public enum SlapMove { Charge, Slap, Block }
public enum SlapStatus { Waiting, Playing, Finished }

// Power selects the attack tier (1-3); unused for charge and block.
public sealed record SlapAction(SlapMove Move, SlapZone? Zone = null, int Power = 0);
public sealed record SlapResult(int Round, string Attacker, string Defender, SlapAction Attack, SlapAction Defense, int Damage, bool Blocked);

public static class SlapRules
{
    public const int MaxHp = 6, MaxGauge = 3, BaseDamage = 1;
    public static int GaugeCost(int power) => power switch { 1 => 0, 2 => 1, 3 => 3, _ => throw new ArgumentOutOfRangeException(nameof(power)) };
    public static int Multiplier(int power) => power switch { 1 => 1, 2 => 2, 3 => 5, _ => throw new ArgumentOutOfRangeException(nameof(power)) };
    public static int Damage(int power) => BaseDamage * Multiplier(power);
    public static string ZoneName(SlapZone zone) => zone switch { SlapZone.High => "상단", SlapZone.Middle => "중단", _ => "하단" };
    public static string PowerName(int power) => power switch { 1 => "기본공격", 2 => "강한 뺨 ×2", _ => "필살뺨 ×5" };
}

public sealed class SlapPlayer
{
    public string Id { get; set; } = "";
    public bool Ready { get; set; }
    public int Hp { get; set; } = SlapRules.MaxHp;
    public int Gauge { get; set; }
    public bool GaveUp { get; set; }
    // The opponent's screen shows only whether a choice exists, never what it is.
    public SlapAction? Choice { get; set; }
    public bool Submitted => Choice is not null;
}

public sealed class SlapRoom
{
    public const int MaxTitleLength = 40;
    public Guid Id { get; set; }
    public string Title { get; set; } = "맞짱 방";
    public DateTimeOffset CreatedAt { get; set; }
    public SlapStatus Status { get; set; }
    public bool Started => Status == SlapStatus.Playing;
    public int Round { get; set; } = 1;
    // Changes on every move, join, leave or ready so clients redraw only when something happened.
    public int Revision { get; set; }
    public List<SlapPlayer> Players { get; set; } = [];
    public SlapResult? LastResult { get; set; }
    public string? Winner { get; set; }
    public string? EndReason { get; set; }
    // Player 1 (the room creator) attacks on odd rounds, player 2 on even rounds.
    public string? AttackerId => Status == SlapStatus.Playing && Players.Count == 2 ? Players[(Round - 1) % 2].Id : null;
    public string? DefenderId => Status == SlapStatus.Playing && Players.Count == 2 ? Players[Round % 2].Id : null;

    public SlapPlayer? Find(string id) => Players.FirstOrDefault(p => p.Id == id);
    public SlapPlayer? Opponent(string id) => Players.FirstOrDefault(p => p.Id != id);

    public void SetReady(string id, bool ready)
    {
        var player = Find(id) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status == SlapStatus.Playing) throw new ArgumentException("이미 게임이 진행 중입니다.");
        player.Ready = ready; Revision++;
        if (Players.Count == 2 && Players.All(p => p.Ready)) Start();
    }
    private void Start()
    {
        Status = SlapStatus.Playing; Round = 1; LastResult = null; Winner = null; EndReason = null;
        foreach (var p in Players) { p.Ready = false; p.Hp = SlapRules.MaxHp; p.Gauge = 0; p.Choice = null; p.GaveUp = false; }
    }
    public void SetGiveUp(string id, bool giveUp)
    {
        var player = Find(id) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status != SlapStatus.Playing) throw new ArgumentException("게임이 진행 중이 아닙니다.");
        if (player.GaveUp == giveUp) return;
        player.GaveUp = giveUp; Revision++;
        if (Players.Count == 2 && Players.All(p => p.GaveUp))
        {
            Status = SlapStatus.Finished; Winner = null;
            EndReason = "두 사람이 모두 포기하여 대전을 종료했습니다.";
            foreach (var p in Players) { p.Ready = false; p.Choice = null; }
        }
    }
    public void Submit(string id, SlapAction action)
    {
        var player = Find(id) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status != SlapStatus.Playing) throw new ArgumentException("게임이 진행 중이 아닙니다.");
        if (Players.Any(p => p.GaveUp)) throw new ArgumentException("포기 요청 중입니다. 요청을 취소하거나 두 사람 모두 포기하면 됩니다.");
        if (player.Choice is not null) throw new ArgumentException("이번 턴에는 이미 선택했습니다.");
        var attacking = id == AttackerId;
        switch (action.Move)
        {
            case SlapMove.Charge when player.Gauge >= SlapRules.MaxGauge:
                throw new ArgumentException($"기는 최대 {SlapRules.MaxGauge}개까지 모을 수 있습니다.");
            case SlapMove.Charge: break;
            case SlapMove.Slap when !attacking: throw new ArgumentException("수비 차례에는 때릴 수 없습니다.");
            case SlapMove.Slap when action.Zone is null || action.Power is < 1 or > SlapRules.MaxGauge:
                throw new ArgumentException("때릴 위치와 세기를 골라 주세요.");
            case SlapMove.Slap when SlapRules.GaugeCost(action.Power) > player.Gauge: throw new ArgumentException("기가 부족합니다.");
            case SlapMove.Slap: break;
            case SlapMove.Block when attacking: throw new ArgumentException("공격 차례에는 막을 수 없습니다.");
            case SlapMove.Block when action.Zone is null: throw new ArgumentException("막을 위치를 골라 주세요.");
            case SlapMove.Block: break;
            default: throw new ArgumentException("알 수 없는 행동입니다.");
        }
        player.Choice = action with { Power = action.Move == SlapMove.Slap ? action.Power : 0, Zone = action.Move == SlapMove.Charge ? null : action.Zone };
        Revision++;
        if (Players.All(p => p.Choice is not null)) Resolve();
    }
    private void Resolve()
    {
        var attacker = Find(AttackerId!)!; var defender = Find(DefenderId!)!;
        var attack = attacker.Choice!; var defense = defender.Choice!;
        if (attack.Move == SlapMove.Charge) attacker.Gauge++; else attacker.Gauge -= SlapRules.GaugeCost(attack.Power);
        if (defense.Move == SlapMove.Charge) defender.Gauge++;
        var slapped = attack.Move == SlapMove.Slap;
        var blocked = slapped && defense.Move == SlapMove.Block && defense.Zone == attack.Zone;
        var damage = slapped && !blocked ? SlapRules.Damage(attack.Power) : 0;
        defender.Hp = Math.Max(0, defender.Hp - damage);
        LastResult = new SlapResult(Round, attacker.Id, defender.Id, attack, defense, damage, blocked);
        attacker.Choice = defender.Choice = null;
        if (defender.Hp == 0) { Status = SlapStatus.Finished; Winner = attacker.Id; }
        else Round++;
    }
    // Closing a screen or leaving a running match never changes its saved state.
    public void Remove(string id)
    {
        var player = Find(id);
        if (player is null || Status == SlapStatus.Playing) return;
        Players.Remove(player);
        foreach (var p in Players) { p.Ready = false; p.Choice = null; }
        Revision++;
    }
}

public sealed class SlapDatabase
{
    public int Version { get; set; } = 1;
    public List<SlapRoom> Rooms { get; set; } = [];
    public List<SlapMatch> Matches { get; set; } = [];
}

public sealed record SlapMatch(string Winner, string Loser);

public sealed class SlapStore
{
    public string Folder { get; }
    public string FilePath => Path.Combine(Folder, "ddongvoid-slap.json");
    private readonly Func<DateTimeOffset> now;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, Converters = { new JsonStringEnumConverter() } };
    public SlapStore(string folder, Func<DateTimeOffset>? clock = null) { Folder = Path.GetFullPath(folder); now = clock ?? (() => DateTimeOffset.UtcNow); }

    private T Access<T>(Func<SlapDatabase, T> action, bool save)
    {
        // Writers serialize updates; readers use an immutable, atomically replaced snapshot.
        if (!save) return action(Read());
        return SharedFile.Locked(FilePath, ".ddongvoid-slap.lock", true, "다른 PC에서 대전 정보를 저장 중입니다. 잠시 후 다시 시도해 주세요.", () =>
        {
            var db = Read();
            var playing = db.Rooms.Where(r => r.Status == SlapStatus.Playing)
                .Select(r => (Room: r, Players: r.Players.Select(p => p.Id).ToArray())).ToList();
            var result = action(db);
            foreach (var (room, players) in playing)
                if (room.Status == SlapStatus.Finished && room.Winner is { } winner && players.Length == 2)
                    db.Matches.Add(new SlapMatch(winner, players.Single(p => p != winner)));
            SharedFile.WriteAtomic(FilePath, db, JsonOptions);
            return result;
        });
    }
    private static SlapDatabase Validate(SlapDatabase? db)
    {
        if (db is null || db.Version != 1 || db.Rooms is null || db.Matches is null ||
            db.Matches.Any(m => m is null || string.IsNullOrEmpty(m.Winner) || string.IsNullOrEmpty(m.Loser) || m.Winner == m.Loser) ||
            db.Rooms.Any(r => r is null || r.Players is null || r.Players.Count > 2 || r.Players.Any(p => p is null || string.IsNullOrEmpty(p.Id))))
            throw new JsonException();
        return db;
    }
    private SlapDatabase Read()
    {
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                using var file = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                return Validate(JsonSerializer.Deserialize<SlapDatabase>(file, JsonOptions));
            }
            catch (IOException ex) when (attempt < 20 && (ex.HResult & 0xffff) is 32 or 33) { Thread.Sleep(25); }
            catch (FileNotFoundException) { return new SlapDatabase(); }
            catch (DirectoryNotFoundException) { return new SlapDatabase(); }
            catch (JsonException ex) { throw new InvalidDataException("대전 JSON 형식이 올바르지 않습니다. 승패 기록을 보호하기 위해 원본 파일을 보존했습니다.", ex); }
        }
    }
    public async Task<List<SlapRoom>> RoomsAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                await using var file = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete,
                    4096, FileOptions.Asynchronous | FileOptions.SequentialScan);
                var db = Validate(await JsonSerializer.DeserializeAsync<SlapDatabase>(file, JsonOptions, cancellationToken).ConfigureAwait(false));
                return db.Rooms.OrderBy(r => r.CreatedAt).ToList();
            }
            catch (IOException ex) when (attempt < 20 && (ex.HResult & 0xffff) is 32 or 33)
            { await Task.Delay(25, cancellationToken).ConfigureAwait(false); }
            catch (FileNotFoundException) { return []; }
            catch (DirectoryNotFoundException) { return []; }
            catch (JsonException ex) { throw new InvalidDataException("대전 JSON 형식이 올바르지 않습니다. 승패 기록을 보호하기 위해 원본 파일을 보존했습니다.", ex); }
        }
    }
    private static SlapRoom Room(SlapDatabase db, Guid roomId) =>
        db.Rooms.FirstOrDefault(r => r.Id == roomId) ?? throw new ArgumentException("방이 사라졌습니다. 방 목록에서 다시 골라 주세요.");
    private SlapPlayer Join(SlapRoom room, string userId)
    {
        var player = new SlapPlayer { Id = userId };
        room.Players.Add(player); room.Revision++;
        // A newcomer to a finished room starts a fresh match setup rather than inheriting the old result.
        if (room.Status == SlapStatus.Finished) { room.Status = SlapStatus.Waiting; room.LastResult = null; room.Winner = null; room.EndReason = null; }
        return player;
    }

    public List<SlapRoom> Rooms() => Access(db => db.Rooms.OrderBy(r => r.CreatedAt).ToList(), false);
    public List<RankingEntry> Rankings() => Access(db =>
    {
        var scores = db.Matches.SelectMany(m => new[] { (Id: m.Winner, Win: 1), (Id: m.Loser, Win: 0) }).GroupBy(s => s.Id)
            .Select(g => new { Id = g.Key, Wins = g.Sum(s => s.Win), Losses = g.Count() - g.Sum(s => s.Win) })
            .OrderByDescending(s => s.Wins).ThenBy(s => s.Id, StringComparer.OrdinalIgnoreCase).ToList();
        int rank = 0;
        return scores.Select((s, i) =>
        {
            if (i == 0 || s.Wins != scores[i - 1].Wins) rank = i + 1;
            return new RankingEntry(rank, s.Id, s.Wins, s.Losses);
        }).ToList();
    }, false);
    public SlapRoom Create(string userId, string title = "맞짱 방")
    {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("방 제목을 입력해 주세요.");
        title = title.Trim();
        if (title.Length > SlapRoom.MaxTitleLength) throw new ArgumentException($"방 제목은 {SlapRoom.MaxTitleLength}자까지 입력할 수 있습니다.");
        return Access(db =>
        {
            var room = new SlapRoom { Id = Guid.NewGuid(), Title = title, CreatedAt = now() };
            Join(room, userId); db.Rooms.Add(room);
            return room;
        }, true);
    }
    // Re-entering a room you already play in only reads it, so a failing shared-folder write can never lock you out of your own game.
    public SlapRoom Join(Guid roomId, string userId) => RoomsAsync().GetAwaiter().GetResult().FirstOrDefault(r => r.Id == roomId && r.Find(userId) is not null) ?? Access(db =>
    {
        var room = Room(db, roomId);
        if (room.Find(userId) is not null) return room;
        if (room.Players.Count >= 2) throw new ArgumentException("이미 2명이 참가한 방입니다.");
        if (room.Status == SlapStatus.Playing) throw new ArgumentException("이미 게임이 진행 중인 방입니다.");
        Join(room, userId);
        return room;
    }, true);
    public SlapRoom? Sync(Guid roomId, string userId) => Access(db =>
    {
        var room = db.Rooms.FirstOrDefault(r => r.Id == roomId);
        if (room?.Find(userId) is null) return null;
        return room;
    }, false);
    public SlapRoom SetReady(Guid roomId, string userId, bool ready) => Access(db => { var room = Room(db, roomId); room.SetReady(userId, ready); return room; }, true);
    public SlapRoom Submit(Guid roomId, string userId, SlapAction action) => Access(db => { var room = Room(db, roomId); room.Submit(userId, action); return room; }, true);
    public SlapRoom SetGiveUp(Guid roomId, string userId, bool giveUp) => Access(db => { var room = Room(db, roomId); room.SetGiveUp(userId, giveUp); return room; }, true);
    public void Leave(Guid roomId, string userId) => Access(db =>
    {
        if (db.Rooms.FirstOrDefault(r => r.Id == roomId) is { } room) { room.Remove(userId); db.Rooms.RemoveAll(r => r.Players.Count == 0); }
        return true;
    }, true);
}
