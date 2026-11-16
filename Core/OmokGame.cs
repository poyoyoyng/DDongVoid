using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DDongVoid.Core;

public enum OmokStatus { Waiting, Playing, Finished }

// Renju (RIF) rules on a 15 × 15 board, the same as the web version. Black moves first and only an unbroken five wins
// for Black; double-three, double-four and overline are forbidden to Black. White has no restrictions and also wins with an overline.
public static class OmokRules
{
    public const int Players = 2, MaxTitleLength = 40, Size = 15, Points = Size * Size;
    public const int Empty = 0, Black = 1, White = 2;
    public static readonly TimeSpan MatchPollInterval = TimeSpan.FromSeconds(.5);
    private static readonly (int X, int Y)[] Directions = [(1, 0), (0, 1), (1, 1), (1, -1)];
    private const int DepthLimit = 6;

    public static string PointName(int index) => $"{"ABCDEFGHIJKLMNO"[index % Size]}{Size - index / Size}";
    private static bool Inside(int x, int y) => x is >= 0 and < Size && y is >= 0 and < Size;
    private static int At(int[] board, int x, int y) => Inside(x, y) ? board[y * Size + x] : -1;

    // Length of the unbroken run of `color` through (x, y) along one direction.
    private static int Run(int[] board, int x, int y, int dx, int dy, int color)
    {
        var count = 1;
        for (var step = 1; At(board, x + dx * step, y + dy * step) == color; step++) count++;
        for (var step = 1; At(board, x - dx * step, y - dy * step) == color; step++) count++;
        return count;
    }
    // Offsets of the empty points on this line that would turn Black's run through (x, y) into exactly five.
    private static List<int> FivePoints(int[] board, int x, int y, int dx, int dy)
    {
        var points = new List<int>();
        for (var step = -4; step <= 4; step++)
        {
            int px = x + dx * step, py = y + dy * step;
            if (At(board, px, py) != Empty) continue;
            board[py * Size + px] = Black;
            if (Run(board, x, y, dx, dy, Black) == 5) points.Add(step);
            board[py * Size + px] = Empty;
        }
        return points;
    }
    private static bool StraightFour(List<int> points) => points.Count == 2 && points[1] - points[0] == 5;
    // A straight four has two ends that both make five; otherwise each point that makes five is its own four.
    private static int Fours(int[] board, int x, int y, int dx, int dy)
    {
        var points = FivePoints(board, x, y, dx, dy);
        return StraightFour(points) ? 1 : Math.Min(points.Count, 2);
    }
    // A real three can become a straight four with one more black stone that Black is allowed to play.
    private static bool Three(int[] board, int x, int y, int dx, int dy, int depth)
    {
        for (var step = -4; step <= 4; step++)
        {
            int px = x + dx * step, py = y + dy * step;
            if (At(board, px, py) != Empty) continue;
            board[py * Size + px] = Black;
            var real = StraightFour(FivePoints(board, x, y, dx, dy)) && ForbiddenAfter(board, px, py, depth + 1) is null;
            board[py * Size + px] = Empty;
            if (real) return true;
        }
        return false;
    }
    // Reason the black stone just placed at (x, y) is forbidden, or null. Making five always wins.
    private static string? ForbiddenAfter(int[] board, int x, int y, int depth = 0)
    {
        if (depth > DepthLimit) return null;
        var lengths = Directions.Select(d => Run(board, x, y, d.X, d.Y, Black)).ToArray();
        if (lengths.Contains(5)) return null;
        if (lengths.Any(length => length > 5)) return "장목";
        int fourCount = 0, threeCount = 0;
        foreach (var (dx, dy) in Directions)
        {
            var found = Fours(board, x, y, dx, dy);
            fourCount += found;
            if (found == 0 && Three(board, x, y, dx, dy, depth)) threeCount++;
        }
        return fourCount >= 2 ? "4-4" : threeCount >= 2 ? "3-3" : null;
    }
    public static string? ForbiddenReason(IReadOnlyList<int> board, int index)
    {
        if (board[index] != Empty) return null;
        var work = board.ToArray(); work[index] = Black;
        return ForbiddenAfter(work, index % Size, index / Size);
    }
    // The winning row through the stone at `index`, or null: exactly five for Black, five or more for White.
    public static List<int>? WinningLine(IReadOnlyList<int> board, int index)
    {
        var color = board[index];
        if (color is not (Black or White)) return null;
        var cells = board.ToArray();
        int x = index % Size, y = index / Size;
        foreach (var (dx, dy) in Directions)
        {
            var length = Run(cells, x, y, dx, dy, color);
            if (color == Black ? length != 5 : length < 5) continue;
            var start = 0;
            while (At(cells, x - dx * (start + 1), y - dy * (start + 1)) == color) start++;
            return [.. Enumerable.Range(0, length).Select(step => (y - dy * start + dy * step) * Size + x - dx * start + dx * step)];
        }
        return null;
    }
}

public sealed class OmokPlayer
{
    public string Id { get; set; } = "";
    public bool Ready { get; set; }
}

public sealed class OmokRoom
{
    public Guid Id { get; set; }
    public string Title { get; set; } = "오목 방";
    public DateTimeOffset CreatedAt { get; set; }
    public OmokStatus Status { get; set; }
    public int Revision { get; set; }
    // Matches started with this pairing: P1 takes black in odd matches, P2 in even ones.
    public int Match { get; set; }
    public int BlackIndex { get; set; }
    public int CurrentIndex { get; set; }
    public List<int> Board { get; set; } = [];
    public int? LastMove { get; set; }
    public int Moves { get; set; }
    public List<OmokPlayer> Players { get; set; } = [];
    public List<string> Winners { get; set; } = [];
    public List<int> WinningLine { get; set; } = [];
    public string? LastMessage { get; set; }
    public string? HostId => Players.FirstOrDefault()?.Id;
    public string? CurrentPlayerId => Status == OmokStatus.Playing ? Players[CurrentIndex].Id : null;
    public OmokPlayer? Find(string id) => Players.FirstOrDefault(p => p.Id == id);
    public int IndexOf(string id) => Players.FindIndex(p => p.Id == id);
    public bool BlackTurn => CurrentIndex == BlackIndex;
    public static string ColorName(bool black) => black ? "흑" : "백";

    public void SetReady(string id, bool ready)
    {
        var player = Find(id) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status == OmokStatus.Playing) throw new ArgumentException("이미 게임이 진행 중입니다.");
        player.Ready = ready; Revision++;
        if (Players.Count < OmokRules.Players || Players.Any(p => !p.Ready)) return;
        foreach (var p in Players) p.Ready = false;
        Match++; BlackIndex = (Match + 1) % 2; CurrentIndex = BlackIndex;
        Board = [.. Enumerable.Repeat(OmokRules.Empty, OmokRules.Points)];
        LastMove = null; Moves = 0; Winners.Clear(); WinningLine.Clear();
        Status = OmokStatus.Playing;
        LastMessage = $"{Players[BlackIndex].Id}님이 흑으로 먼저 둡니다.";
    }
    private void CheckAction(string id, int revision)
    {
        if (Find(id) is null) throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status != OmokStatus.Playing) throw new ArgumentException("게임이 진행 중이 아닙니다.");
        if (Revision != revision) throw new ArgumentException("방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.");
    }
    public void Place(string id, int revision, int index)
    {
        CheckAction(id, revision);
        if (CurrentPlayerId != id) throw new ArgumentException("내 차례가 아닙니다.");
        if (index is < 0 or >= OmokRules.Points) throw new ArgumentException("돌을 놓을 자리를 골라 주세요.");
        if (Board[index] != OmokRules.Empty) throw new ArgumentException("이미 돌이 놓인 자리입니다.");
        var black = BlackTurn;
        if (black && OmokRules.ForbiddenReason(Board, index) is { } reason) throw new ArgumentException($"흑은 {reason} 금수 자리에 둘 수 없습니다.");
        Board[index] = black ? OmokRules.Black : OmokRules.White;
        LastMove = index; Moves++; Revision++;
        LastMessage = $"{id}({ColorName(black)}) · {OmokRules.PointName(index)}";
        if (OmokRules.WinningLine(Board, index) is { } line)
        {
            WinningLine = line; Finish([id], $"{id}({ColorName(black)}) · 오목 완성!"); return;
        }
        if (Board.All(point => point != OmokRules.Empty)) { Finish([.. Players.Select(p => p.Id)], "판이 가득 찼습니다 · 무승부"); return; }
        CurrentIndex = 1 - CurrentIndex;
    }
    public void Resign(string id, int revision)
    {
        CheckAction(id, revision);
        Revision++;
        Finish([.. Players.Where(p => p.Id != id).Select(p => p.Id)], $"{id} 기권");
    }
    private void Finish(List<string> winners, string message)
    {
        Winners = winners; LastMessage = message; Status = OmokStatus.Finished;
    }
    public OmokRoom Copy() => JsonSerializer.Deserialize<OmokRoom>(JsonSerializer.Serialize(this))!;
}

public sealed class OmokDatabase
{
    public int Version { get; set; } = 1;
    public List<OmokRoom> Rooms { get; set; } = [];
    public List<Guid> DeletedRoomIds { get; set; } = [];
}

public sealed record OmokSnapshot(List<OmokRoom> Rooms, List<Guid> DeletedRoomIds);

public sealed class OmokStore
{
    public string Folder { get; }
    public string FilePath => Path.Combine(Folder, "ddongvoid-omok.json");

    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, Converters = { new JsonStringEnumConverter() } };
    public OmokStore(string folder) { Folder = Path.GetFullPath(folder); }
    private static OmokDatabase Validate(OmokDatabase? db)
    {
        if (db is null || db.Version != 1 || db.Rooms is null || db.DeletedRoomIds is null ||
            db.DeletedRoomIds.Any(id => id == Guid.Empty) || db.DeletedRoomIds.Distinct().Count() != db.DeletedRoomIds.Count ||
            db.Rooms.Select(r => r?.Id).Distinct().Count() != db.Rooms.Count) throw new JsonException();
        foreach (var r in db.Rooms)
        {
            if (r is null || r.Id == Guid.Empty || db.DeletedRoomIds.Contains(r.Id) ||
                string.IsNullOrWhiteSpace(r.Title) || r.Title.Length > OmokRules.MaxTitleLength ||
                r.Players is null || r.Players.Count is < 1 or > OmokRules.Players ||
                r.Players.Any(p => p is null || string.IsNullOrWhiteSpace(p.Id)) ||
                r.Players.Select(p => p.Id).Distinct().Count() != r.Players.Count ||
                !Enum.IsDefined(r.Status) || r.Revision < 0 || r.Match < 0 || r.Moves < 0 ||
                r.BlackIndex is < 0 or > 1 || r.CurrentIndex < 0 || r.CurrentIndex >= r.Players.Count ||
                r.Board is null || r.Winners is null || r.WinningLine is null ||
                r.Winners.Distinct().Count() != r.Winners.Count || r.Winners.Any(id => r.Find(id) is null))
                throw new JsonException();
            if (r.Status == OmokStatus.Waiting)
            {
                if (r.Winners.Count != 0 || r.Board.Count != 0 || r.WinningLine.Count != 0 || r.LastMove is not null) throw new JsonException();
            }
            else if (r.Players.Count != OmokRules.Players || r.Board.Count != OmokRules.Points ||
                r.Board.Any(point => point is < OmokRules.Empty or > OmokRules.White) ||
                r.Moves != r.Board.Count(point => point != OmokRules.Empty) || r.LastMove is < 0 or >= OmokRules.Points ||
                r.WinningLine.Any(index => index is < 0 or >= OmokRules.Points) ||
                (r.Status == OmokStatus.Playing && r.Winners.Count != 0) ||
                (r.Status == OmokStatus.Finished && r.Winners.Count == 0))
                throw new JsonException();
        }
        return db;
    }
    private async Task<OmokDatabase> ReadAsync(CancellationToken cancellation = default)
    {
        cancellation.ThrowIfCancellationRequested();
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                await using var file = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete,
                    4096, FileOptions.Asynchronous | FileOptions.SequentialScan);
                return Validate(await JsonSerializer.DeserializeAsync<OmokDatabase>(file, JsonOptions, cancellation).ConfigureAwait(false));
            }
            catch (IOException ex) when (attempt < 20 && (ex.HResult & 0xffff) is 32 or 33)
            { await Task.Delay(25, cancellation).ConfigureAwait(false); }
            catch (FileNotFoundException) { return new(); }
            catch (DirectoryNotFoundException) { return new(); }
            catch (JsonException ex) { throw new InvalidDataException("오목 JSON 형식이 올바르지 않습니다. 기존 방을 보호하기 위해 파일을 보존했습니다.", ex); }
        }
    }
    private T Write<T>(Func<OmokDatabase, T> action) => SharedFile.Locked(FilePath, ".ddongvoid-omok.lock", true,
        "다른 PC에서 오목 정보를 저장 중입니다. 잠시 후 다시 시도해 주세요.", () =>
        {
            var db = ReadAsync().GetAwaiter().GetResult();
            var finished = db.Rooms.ToDictionary(r => r.Id, r => r.Status == OmokStatus.Finished);
            var result = action(db); Validate(db);
            GameResultStore.RecordFinished(Folder, GameResultStore.Omok, db.Rooms, finished,
                r => (r.Id, r.Revision, r.Status == OmokStatus.Finished, r.Players.Select(p => p.Id).ToList(), r.Winners));
            SharedFile.WriteAtomic(FilePath, db, JsonOptions); return result;
        });
    private static OmokRoom Room(OmokDatabase db, Guid id) => db.Rooms.FirstOrDefault(r => r.Id == id)
        ?? throw new ArgumentException("방이 사라졌습니다. 방 목록에서 다시 골라 주세요.");
    public async Task<OmokSnapshot> SnapshotAsync(CancellationToken cancellation = default)
    {
        var db = await ReadAsync(cancellation).ConfigureAwait(false);
        return new(db.Rooms.OrderBy(r => r.CreatedAt).ToList(), db.DeletedRoomIds.ToList());
    }
    public List<OmokRoom> Rooms() => SnapshotAsync().GetAwaiter().GetResult().Rooms;
    public OmokRoom Create(string userId, string title)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("방 제목을 입력해 주세요.");
        title = title.Trim();
        if (title.Length > OmokRules.MaxTitleLength) throw new ArgumentException($"방 제목은 {OmokRules.MaxTitleLength}자까지 입력할 수 있습니다.");
        return Write(db =>
        {
            var room = new OmokRoom { Id = Guid.NewGuid(), Title = title, CreatedAt = DateTimeOffset.UtcNow, Players = [new() { Id = userId }] };
            db.Rooms.Add(room); return room.Copy();
        });
    }
    private OmokRoom? Member(Guid id, string userId) =>
        ReadAsync().GetAwaiter().GetResult().Rooms.FirstOrDefault(r => r.Id == id && r.Find(userId) is not null);
    // Re-entering a room you already play in only reads it, so a failing shared-folder write can never lock you out of your own game.
    public OmokRoom Join(Guid id, string userId) => Member(id, userId) is { } current ? current.Copy() : Write(db =>
    {
        var room = Room(db, id);
        if (room.Find(userId) is not null) return room.Copy();
        if (room.Status != OmokStatus.Waiting) throw new ArgumentException("이미 시작했거나 종료한 방입니다.");
        if (room.Players.Count >= OmokRules.Players) throw new ArgumentException("이미 2명이 참가한 방입니다.");
        room.Players.Add(new() { Id = userId }); room.Revision++; return room.Copy();
    });
    private OmokRoom Act(Guid id, Action<OmokRoom> action) => Write(db =>
    {
        var room = Room(db, id); action(room); return room.Copy();
    });
    public OmokRoom SetReady(Guid id, string userId, bool ready) => Act(id, room => room.SetReady(userId, ready));
    public OmokRoom Place(Guid id, string userId, int revision, int index) => Act(id, room => room.Place(userId, revision, index));
    public OmokRoom Resign(Guid id, string userId, int revision) => Act(id, room => room.Resign(userId, revision));
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
        if (room.Status == OmokStatus.Playing) return false; // Closing the view preserves an ongoing game.
        room.Players.RemoveAll(p => p.Id == userId);
        foreach (var player in room.Players) player.Ready = false;
        // A new pairing starts over, so the remaining player (now P1) takes black first again.
        room.Status = OmokStatus.Waiting; room.Match = 0; room.BlackIndex = 0; room.CurrentIndex = 0;
        room.Board.Clear(); room.LastMove = null; room.Moves = 0; room.Winners.Clear(); room.WinningLine.Clear(); room.LastMessage = null;
        room.Revision++;
        if (room.Players.Count == 0) { db.Rooms.Remove(room); db.DeletedRoomIds.Add(id); }
        return true;
    });
}
