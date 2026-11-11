using System.IO;
using System.Text.Json;

namespace DDongVoid.Core;

// One finished room game. Revision is the room's revision when it finished, so a retried save is recorded once.
public sealed record GameResult(string Game, Guid RoomId, int Revision, DateTimeOffset PlayedAt, List<string> Players, List<string> Winners);

public sealed class GameResultDatabase
{
    public int Version { get; set; } = 1;
    public List<GameResult> Results { get; set; } = [];
}

// Win/loss history for the room games. It lives in its own file so a PC still on an older version,
// which rewrites the room files without knowing about results, cannot erase it.
public sealed class GameResultStore
{
    public const string Yacht = "yacht", OneCard = "onecard", Ciao = "ciao";
    public string Folder { get; }
    public string FilePath => Path.Combine(Folder, "ddongvoid-results.json");
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    public GameResultStore(string folder) => Folder = Path.GetFullPath(folder);

    public void Add(GameResult result) => SharedFile.Locked(FilePath, ".ddongvoid-results.lock", true,
        "다른 PC에서 승패 기록을 저장 중입니다. 잠시 후 다시 시도해 주세요.", () =>
        {
            var db = Read();
            if (db.Results.Any(r => r.Game == result.Game && r.RoomId == result.RoomId && r.Revision == result.Revision)) return false;
            db.Results.Add(result);
            SharedFile.WriteAtomic(FilePath, db, JsonOptions);
            return true;
        });
    public List<GameResult> Results(string game) => [.. Read().Results.Where(r => r.Game == game)];

    // Sole winner = win, shared top = draw, everyone else = loss. Ranked by wins, then draws, then fewer losses.
    public List<RankingEntry> Rankings(string game)
    {
        var scores = Results(game)
            .SelectMany(r => r.Players.Select(id => (Id: id, Outcome: !r.Winners.Contains(id) ? 'L' : r.Winners.Count == 1 ? 'W' : 'D')))
            .GroupBy(s => s.Id)
            .Select(g => (Id: g.Key, Wins: g.Count(s => s.Outcome == 'W'), Draws: g.Count(s => s.Outcome == 'D'), Losses: g.Count(s => s.Outcome == 'L')))
            .OrderByDescending(s => s.Wins).ThenByDescending(s => s.Draws).ThenBy(s => s.Losses).ThenBy(s => s.Id, StringComparer.OrdinalIgnoreCase).ToList();
        var rank = 0;
        return [.. scores.Select((s, i) =>
        {
            if (i == 0 || (s.Wins, s.Draws, s.Losses) != (scores[i - 1].Wins, scores[i - 1].Draws, scores[i - 1].Losses)) rank = i + 1;
            return new RankingEntry(rank, s.Id, s.Wins, s.Losses, s.Draws);
        })];
    }

    private GameResultDatabase Read()
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                using var file = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                var db = JsonSerializer.Deserialize<GameResultDatabase>(file, JsonOptions);
                if (db is null || db.Version != 1 || db.Results is null || db.Results.Any(r => r is null || string.IsNullOrEmpty(r.Game) ||
                    r.Players is null || r.Winners is null || r.Players.Count < 2 || r.Players.Any(string.IsNullOrEmpty) ||
                    r.Players.Distinct().Count() != r.Players.Count || r.Winners.Any(w => !r.Players.Contains(w))))
                    throw new JsonException();
                return db;
            }
            catch (IOException ex) when (attempt < 20 && (ex.HResult & 0xffff) is 32 or 33) { Thread.Sleep(25); }
            catch (FileNotFoundException) { return new(); }
            catch (DirectoryNotFoundException) { return new(); }
            catch (JsonException ex) { throw new InvalidDataException("승패 기록 JSON 형식이 올바르지 않습니다. 기록을 보호하기 위해 원본 파일을 보존했습니다.", ex); }
        }
    }
    // Called inside a room store's write, after its rules ran and before its file is committed: rooms that just
    // finished are recorded first, so a failed room save simply finishes (and is recorded) again on retry.
    internal static void RecordFinished<TRoom>(string folder, string game, IEnumerable<TRoom> rooms, IReadOnlyDictionary<Guid, bool> wasFinished,
        Func<TRoom, (Guid Id, int Revision, bool Finished, List<string> Players, List<string> Winners)> describe)
    {
        var store = new GameResultStore(folder);
        foreach (var room in rooms.Select(describe))
            if (room.Finished && !wasFinished.GetValueOrDefault(room.Id) && room.Players.Count >= 2)
                // A broken or busy results file must never stop a game from ending; the match then goes unrecorded.
                try { store.Add(new GameResult(game, room.Id, room.Revision, DateTimeOffset.UtcNow, [.. room.Players], [.. room.Winners])); }
                catch (Exception ex) when (ex is IOException or InvalidDataException or UnauthorizedAccessException) { }
    }
}
