using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DDongVoid.Core;

public enum SlapZone { High, Middle, Low }
public enum SlapMove { Charge, Slap, Block }
public enum SlapStatus { Waiting, Playing, Finished }

// Power is the number of 기 spent on a slap (1-3); unused for charge and block.
public sealed record SlapAction(SlapMove Move, SlapZone? Zone = null, int Power = 0);
public sealed record SlapResult(int Round, string Attacker, string Defender, SlapAction Attack, SlapAction Defense, int Damage, bool Blocked);

public static class SlapRules
{
    public const int MaxHp = 5, MaxGauge = 3, BaseDamage = 1;
    // 기 1개 기본뺨 ×1, 2개 ×3, 3개 ×5.
    public static int Multiplier(int power) => power switch { 1 => 1, 2 => 3, 3 => 5, _ => throw new ArgumentOutOfRangeException(nameof(power)) };
    public static int Damage(int power) => BaseDamage * Multiplier(power);
    public static string ZoneName(SlapZone zone) => zone switch { SlapZone.High => "상단", SlapZone.Middle => "중단", _ => "하단" };
    public static string PowerName(int power) => power switch { 1 => "기본뺨", 2 => "강한 뺨 ×3", _ => "필살 뺨 ×5" };
}

public sealed class SlapPlayer
{
    public string Id { get; set; } = "";
    public bool Ready { get; set; }
    public int Hp { get; set; } = SlapRules.MaxHp;
    public int Gauge { get; set; }
    // The opponent's screen shows only whether a choice exists, never what it is.
    public SlapAction? Choice { get; set; }
    public bool Submitted => Choice is not null;
    // Bumped by the player's own client; the other client watches it change on its own clock,
    // so PCs with skewed clocks never time each other out.
    public int Heartbeat { get; set; }
    public DateTimeOffset LastSeen { get; set; }
}

public sealed class SlapRoom
{
    public Guid Id { get; set; }
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
        foreach (var p in Players) { p.Ready = false; p.Hp = SlapRules.MaxHp; p.Gauge = 0; p.Choice = null; }
    }
    public void Submit(string id, SlapAction action)
    {
        var player = Find(id) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status != SlapStatus.Playing) throw new ArgumentException("게임이 진행 중이 아닙니다.");
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
            case SlapMove.Slap when action.Power > player.Gauge: throw new ArgumentException("기가 부족합니다.");
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
        if (attack.Move == SlapMove.Charge) attacker.Gauge++; else attacker.Gauge -= attack.Power;
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
    // Leaving mid-match hands the win to whoever stays.
    public void Remove(string id, string reason)
    {
        var player = Find(id);
        if (player is null) return;
        if (Status == SlapStatus.Playing && Opponent(id) is { } stayer)
        { Status = SlapStatus.Finished; Winner = stayer.Id; EndReason = $"{id} 님이 {reason}"; }
        Players.Remove(player);
        foreach (var p in Players) { p.Ready = false; p.Choice = null; }
        Revision++;
    }
}

public sealed class SlapDatabase
{
    public int Version { get; set; } = 1;
    public List<SlapRoom> Rooms { get; set; } = [];
}

public sealed class SlapStore
{
    // Rooms nobody has touched for this long are swept away regardless of clock skew.
    public static readonly TimeSpan AbandonedAfter = TimeSpan.FromMinutes(10);
    public string Folder { get; }
    public string FilePath => Path.Combine(Folder, "ddongvoid-slap.json");
    private readonly Func<DateTimeOffset> now;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, Converters = { new JsonStringEnumConverter() } };
    public SlapStore(string folder, Func<DateTimeOffset>? clock = null) { Folder = Path.GetFullPath(folder); now = clock ?? (() => DateTimeOffset.UtcNow); }

    private T Access<T>(Func<SlapDatabase, T> action, bool save) =>
        SharedFile.Locked(FilePath, ".ddongvoid-slap.lock", save, "다른 PC에서 대전 정보를 저장 중입니다. 잠시 후 다시 시도해 주세요.", () =>
        {
            var db = Read();
            var swept = db.Rooms.RemoveAll(r => r.Players.Count == 0 || r.Players.All(p => now() - p.LastSeen > AbandonedAfter)) > 0;
            var result = action(db);
            if (save || (swept && Directory.Exists(Folder))) SharedFile.WriteAtomic(FilePath, db, JsonOptions);
            return result;
        });
    private SlapDatabase Read()
    {
        if (!File.Exists(FilePath)) return new SlapDatabase();
        try
        {
            var db = JsonSerializer.Deserialize<SlapDatabase>(File.ReadAllText(FilePath), JsonOptions) ?? throw new JsonException();
            if (db.Version != 1 || db.Rooms is null || db.Rooms.Any(r => r is null || r.Players is null || r.Players.Count > 2 || r.Players.Any(p => p is null || string.IsNullOrEmpty(p.Id))))
                throw new JsonException();
            return db;
        }
        // A broken match file holds no lasting data, so start over instead of locking everyone out.
        catch (JsonException) { return new SlapDatabase(); }
    }
    private static SlapRoom Room(SlapDatabase db, Guid roomId) =>
        db.Rooms.FirstOrDefault(r => r.Id == roomId) ?? throw new ArgumentException("방이 사라졌습니다. 방 목록에서 다시 골라 주세요.");
    private void LeaveAll(SlapDatabase db, string userId, string reason)
    {
        foreach (var room in db.Rooms.Where(r => r.Find(userId) is not null).ToList()) room.Remove(userId, reason);
        db.Rooms.RemoveAll(r => r.Players.Count == 0);
    }
    private SlapPlayer Join(SlapRoom room, string userId)
    {
        var player = new SlapPlayer { Id = userId, LastSeen = now() };
        room.Players.Add(player); room.Revision++;
        // A newcomer to a finished room starts a fresh match setup rather than inheriting the old result.
        if (room.Status == SlapStatus.Finished) { room.Status = SlapStatus.Waiting; room.LastResult = null; room.Winner = null; room.EndReason = null; }
        return player;
    }

    public List<SlapRoom> Rooms() => Access(db => db.Rooms.OrderBy(r => r.CreatedAt).ToList(), false);
    public SlapRoom Create(string userId) => Access(db =>
    {
        LeaveAll(db, userId, "방을 나갔습니다.");
        var room = new SlapRoom { Id = Guid.NewGuid(), CreatedAt = now() };
        Join(room, userId); db.Rooms.Add(room);
        return room;
    }, true);
    public SlapRoom Join(Guid roomId, string userId) => Access(db =>
    {
        var room = Room(db, roomId);
        if (room.Find(userId) is not null) return room;
        if (room.Players.Count >= 2) throw new ArgumentException("이미 2명이 참가한 방입니다.");
        if (room.Status == SlapStatus.Playing) throw new ArgumentException("이미 게임이 진행 중인 방입니다.");
        LeaveAll(db, userId, "방을 나갔습니다.");
        Join(room, userId);
        return room;
    }, true);
    // Returns null once the player is no longer in the room (left elsewhere, kicked, or swept).
    public SlapRoom? Sync(Guid roomId, string userId, bool heartbeat) => Access(db =>
    {
        var room = db.Rooms.FirstOrDefault(r => r.Id == roomId);
        if (room?.Find(userId) is not { } player) return null;
        if (heartbeat) { player.Heartbeat++; player.LastSeen = now(); }
        return room;
    }, heartbeat);
    public SlapRoom SetReady(Guid roomId, string userId, bool ready) => Access(db => { var room = Room(db, roomId); room.SetReady(userId, ready); return room; }, true);
    public SlapRoom Submit(Guid roomId, string userId, SlapAction action) => Access(db => { var room = Room(db, roomId); room.Submit(userId, action); return room; }, true);
    public void Leave(Guid roomId, string userId) => Access(db =>
    {
        if (db.Rooms.FirstOrDefault(r => r.Id == roomId) is { } room) { room.Remove(userId, "기권하고 나갔습니다."); db.Rooms.RemoveAll(r => r.Players.Count == 0); }
        return true;
    }, true);
    // Removes an unresponsive opponent only if their heartbeat is still the one the caller saw,
    // so a player who just came back is never kicked by a stale observation.
    public SlapRoom? Kick(Guid roomId, string userId, string opponentId, int seenHeartbeat) => Access(db =>
    {
        var room = db.Rooms.FirstOrDefault(r => r.Id == roomId);
        if (room?.Find(userId) is null) return null;
        if (room.Find(opponentId) is { } opponent && opponent.Heartbeat == seenHeartbeat) room.Remove(opponentId, "연결이 끊겨 기권 처리되었습니다.");
        return room;
    }, true);
}
