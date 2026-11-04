using System.IO;
using System.Text.Json;

namespace DDongVoid.Core;

// Keep rhythm scores separate so older clients cannot treat them as dodge scores.
public sealed class RhythmStore(string folder) : IRhythmStore
{
    public string FilePath { get; } = Path.Combine(Path.GetFullPath(folder), "ddongvoid-rhythm.json");
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private T Access<T>(Func<List<PlayRecord>, T> action, bool save = false) =>
        SharedFile.Locked(FilePath, ".ddongvoid-rhythm.lock", save, "다른 PC에서 리듬 기록을 저장 중입니다. 잠시 후 다시 시도해 주세요.", () =>
        {
            List<PlayRecord> records = [];
            if (File.Exists(FilePath))
            {
                try
                {
                    records = JsonSerializer.Deserialize<List<PlayRecord>>(File.ReadAllText(FilePath)) ?? throw new JsonException();
                    if (records.Any(r => r is null || string.IsNullOrWhiteSpace(r.UserId) || r.Score < 0 ||
                        !double.IsFinite(r.Seconds) || r.Seconds < 0)) throw new JsonException();
                }
                catch (JsonException ex) { throw new InvalidDataException("리듬 기록 JSON 형식이 올바르지 않습니다. 원본 파일은 그대로 보존했습니다.", ex); }
            }
            var result = action(records);
            if (save) SharedFile.WriteAtomic(FilePath, records, JsonOptions);
            return result;
        });

    public void AddRecord(PlayRecord record) => Access(records =>
    {
        if (!records.Any(r => r.RecordId == record.RecordId)) records.Add(record);
        return true;
    }, true);

    public List<RankingEntry> Rankings() => Access(records =>
    {
        var scores = records.GroupBy(r => r.UserId).Select(g => (Id: g.Key, Best: g.Max(r => r.Score)))
            .OrderByDescending(r => r.Best).ThenBy(r => r.Id, StringComparer.OrdinalIgnoreCase).ToList();
        int rank = 0;
        return scores.Select((r, i) =>
        {
            if (i == 0 || r.Best != scores[i - 1].Best) rank = i + 1;
            return new RankingEntry(rank, r.Id, r.Best);
        }).ToList();
    });
}
