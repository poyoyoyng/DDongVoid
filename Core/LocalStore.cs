using System.IO;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DDongVoid.Core;

public sealed record Account(string Id, string Salt, string PasswordHash, int Iterations, DateTimeOffset CreatedAt, int BestScore = 0);
public sealed record PlayRecord(Guid RecordId, string UserId, int Score, double Seconds, int Dodged, DateTimeOffset PlayedAt);
public sealed record RankingEntry(int Rank, string UserId, int BestScore);
public sealed class Database
{
    public int Version { get; set; } = 1;
    public List<Account> Accounts { get; set; } = [];
    public List<PlayRecord> Records { get; set; } = [];
}

public sealed class LocalStore
{
    private const int Iterations = 210_000;
    public string Folder { get; }
    public string FilePath => Path.Combine(Folder, "ddongvoid.json");
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    public LocalStore(string folder) => Folder = Path.GetFullPath(folder);
    private T Access<T>(Func<Database, T> action, bool save = false, bool persistHighScores = false)
    {
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(FilePath.ToUpperInvariant())));
        using var mutex = new Mutex(false, @"Local\DDongVoid_" + key);
        bool acquired;
        try { acquired = mutex.WaitOne(TimeSpan.FromSeconds(5)); } catch (AbandonedMutexException) { acquired = true; }
        if (!acquired) throw new IOException("다른 창에서 저장 중입니다. 잠시 후 다시 시도해 주세요.");
        try
        {
            using var fileLock = AcquireFileLock(save);
            var db = Read();
            var migrated = BackfillHighScores(db);
            var result = action(db);
            if (save || (persistHighScores && migrated)) Write(db);
            return result;
        }
        finally { mutex.ReleaseMutex(); }
    }
    private FileStream? AcquireFileLock(bool createFolder)
    {
        if (createFolder) Directory.CreateDirectory(Folder);
        else if (!Directory.Exists(Folder)) return null;
        var timer = Stopwatch.StartNew();
        while (true)
        {
            try { return new FileStream(Path.Combine(Folder, ".ddongvoid.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException ex) when ((ex.HResult & 0xffff) is 32 or 33)
            {
                if (timer.Elapsed >= TimeSpan.FromSeconds(5))
                    throw new IOException("다른 PC에서 계정이나 기록을 저장 중입니다. 잠시 후 다시 시도해 주세요.", ex);
                Thread.Sleep(25);
            }
        }
    }
    private static bool BackfillHighScores(Database db)
    {
        var scores = db.Records.GroupBy(r => r.UserId).ToDictionary(g => g.Key, g => g.Max(r => r.Score));
        bool changed = false;
        for (int i = 0; i < db.Accounts.Count; i++)
        {
            var account = db.Accounts[i];
            if (scores.TryGetValue(account.Id, out var score) && score > account.BestScore)
            { db.Accounts[i] = account with { BestScore = score }; changed = true; }
        }
        return changed;
    }
    private Database Read()
    {
        if (!File.Exists(FilePath)) return new Database();
        try
        {
            var db = JsonSerializer.Deserialize<Database>(File.ReadAllText(FilePath)) ?? throw new JsonException();
            if (db.Version != 1 || db.Accounts is null || db.Records is null ||
                db.Accounts.Any(a => a is null || string.IsNullOrEmpty(a.Id) || a.BestScore < 0 || a.Iterations < 100_000 || a.Iterations > 2_000_000 ||
                    Convert.FromBase64String(a.Salt).Length != 16 || Convert.FromBase64String(a.PasswordHash).Length != 32) ||
                db.Accounts.Select(a => a.Id.ToUpperInvariant()).Distinct().Count() != db.Accounts.Count ||
                db.Records.Any(r => r is null || r.Score < 0 || r.Dodged < 0 || !double.IsFinite(r.Seconds) || r.Seconds < 0 ||
                    !db.Accounts.Any(a => a.Id == r.UserId))) throw new JsonException();
            return db;
        }
        catch (Exception ex) when (ex is JsonException or FormatException or ArgumentNullException)
        { throw new InvalidDataException("JSON 형식이 올바르지 않습니다. 원본 파일은 그대로 보존했습니다. 다른 저장 폴더를 선택하거나 백업을 복원해 주세요.", ex); }
    }
    private void Write(Database db)
    {
        Directory.CreateDirectory(Folder);
        var temp = Path.Combine(Folder, $".ddongvoid-{Guid.NewGuid():N}.tmp");
        try
        {
            using (var file = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            { JsonSerializer.Serialize(file, db, JsonOptions); file.Flush(true); }
            File.Move(temp, FilePath, true);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    public void Validate() => Access(db => true);
    public string Register(string id, string password)
    {
        id = id.Trim();
        if (!Regex.IsMatch(id, @"\A[a-zA-Z0-9가-힣_-]{3,24}\z")) throw new ArgumentException("아이디는 한글·영문·숫자·_·-로 3~24자 입력해 주세요.");
        if (password.Length is < 1 or > 128) throw new ArgumentException("비밀번호를 128자 이하로 입력해 주세요.");
        return Access(db =>
        {
            if (db.Accounts.Any(a => a.Id.Equals(id, StringComparison.OrdinalIgnoreCase))) throw new ArgumentException("이미 사용 중인 아이디입니다.");
            var salt = RandomNumberGenerator.GetBytes(16);
            var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
            db.Accounts.Add(new Account(id, Convert.ToBase64String(salt), Convert.ToBase64String(hash), Iterations, DateTimeOffset.UtcNow));
            return id;
        }, true);
    }
    public string Login(string id, string password) => Access(db =>
    {
        if (password.Length > 128) throw new ArgumentException("아이디 또는 비밀번호가 일치하지 않습니다.");
        var account = db.Accounts.FirstOrDefault(a => a.Id.Equals(id.Trim(), StringComparison.OrdinalIgnoreCase));
        var salt = account is null ? new byte[16] : Convert.FromBase64String(account.Salt);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, account?.Iterations ?? Iterations, HashAlgorithmName.SHA256, 32);
        if (account is null || !CryptographicOperations.FixedTimeEquals(hash, Convert.FromBase64String(account.PasswordHash)))
            throw new ArgumentException("아이디 또는 비밀번호가 일치하지 않습니다.");
        return account.Id;
    });
    // A device session keeps a digest of the credential, never the password or its raw hash.
    private static string SessionKeyFor(Account account) =>
        Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes("ddongvoid-session|" + account.Salt + "|" + account.PasswordHash)));
    public string SessionKey(string id) => Access(db =>
        db.Accounts.FirstOrDefault(a => a.Id == id) is { } account ? SessionKeyFor(account) : throw new ArgumentException("계정을 찾을 수 없습니다."));
    public string ResumeSession(string id, string key) => Access(db =>
    {
        var account = db.Accounts.FirstOrDefault(a => a.Id == id);
        if (account is null || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(SessionKeyFor(account)), Encoding.UTF8.GetBytes(key)))
            throw new ArgumentException("저장된 로그인이 만료되었습니다. 다시 로그인해 주세요.");
        return account.Id;
    });
    public void AddRecord(PlayRecord record) => Access(db =>
    {
        var accountIndex = db.Accounts.FindIndex(a => a.Id == record.UserId);
        if (accountIndex < 0) throw new InvalidDataException("현재 폴더에서 계정을 찾을 수 없습니다. 다시 로그인해 주세요.");
        if (!db.Records.Any(r => r.RecordId == record.RecordId))
        {
            db.Records.Add(record);
            var account = db.Accounts[accountIndex];
            db.Accounts[accountIndex] = account with { BestScore = Math.Max(account.BestScore, record.Score) };
        }
        return true;
    }, true);
    public List<PlayRecord> Records(string id) => Access(db => db.Records.Where(r => r.UserId == id).OrderByDescending(r => r.PlayedAt).ToList());
    public int BestScore(string id) => Access(db => db.Accounts.FirstOrDefault(a => a.Id == id)?.BestScore ?? 0);
    public List<RankingEntry> Rankings() => Access(db =>
    {
        var played = db.Records.Select(r => r.UserId).ToHashSet();
        var accounts = db.Accounts.Where(a => a.BestScore > 0 || played.Contains(a.Id))
            .OrderByDescending(a => a.BestScore).ThenBy(a => a.Id, StringComparer.OrdinalIgnoreCase).ToList();
        var result = new List<RankingEntry>();
        int rank = 0;
        for (int i = 0; i < accounts.Count; i++)
        {
            if (i == 0 || accounts[i].BestScore != accounts[i - 1].BestScore) rank = i + 1;
            result.Add(new RankingEntry(rank, accounts[i].Id, accounts[i].BestScore));
        }
        return result;
    }, persistHighScores: true);
}
