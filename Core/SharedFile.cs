using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DDongVoid.Core;

// Serializes read-modify-write cycles on a JSON file in a shared folder:
// a named mutex covers windows on this PC, an exclusive lock file covers other PCs.
internal static class SharedFile
{
    public static T Locked<T>(string filePath, string lockName, bool createFolder, string busyMessage, Func<T> action)
    {
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(filePath.ToUpperInvariant())));
        using var mutex = new Mutex(false, @"Local\DDongVoid_" + key);
        bool acquired;
        try { acquired = mutex.WaitOne(TimeSpan.FromSeconds(5)); } catch (AbandonedMutexException) { acquired = true; }
        if (!acquired) throw new IOException("다른 창에서 저장 중입니다. 잠시 후 다시 시도해 주세요.");
        try
        {
            using var fileLock = AcquireFileLock(Path.GetDirectoryName(filePath)!, lockName, createFolder, busyMessage);
            return action();
        }
        finally { mutex.ReleaseMutex(); }
    }
    private static FileStream? AcquireFileLock(string folder, string lockName, bool createFolder, string busyMessage)
    {
        if (createFolder) Directory.CreateDirectory(folder);
        else if (!Directory.Exists(folder)) return null;
        var timer = Stopwatch.StartNew();
        while (true)
        {
            try { return new FileStream(Path.Combine(folder, lockName), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException ex) when ((ex.HResult & 0xffff) is 32 or 33)
            {
                if (timer.Elapsed >= TimeSpan.FromSeconds(5)) throw new IOException(busyMessage, ex);
                Thread.Sleep(25);
            }
        }
    }
    // Writes a temp file first so readers never see a half-written JSON.
    public static void WriteAtomic<T>(string filePath, T value, JsonSerializerOptions options)
    {
        var folder = Path.GetDirectoryName(filePath)!;
        Directory.CreateDirectory(folder);
        var temp = Path.Combine(folder, $".ddongvoid-{Guid.NewGuid():N}.tmp");
        var backup = Path.Combine(folder, $".ddongvoid-backup-{Guid.NewGuid():N}.tmp");
        var committed = false;
        try
        {
            using (var file = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            { JsonSerializer.Serialize(file, value, options); file.Flush(true); }
            // ReplaceFile preserves open readers' old snapshot and lets new readers open the
            // completed update. MoveFileEx(overwrite) can fail even with FileShare.Delete.
            if (File.Exists(filePath)) File.Replace(temp, filePath, backup, true);
            else File.Move(temp, filePath);
            committed = true;
        }
        finally
        {
            if (File.Exists(temp)) File.Delete(temp);
            // Preserve the previous data if replacement fails partway through on the share.
            if (committed)
                try { File.Delete(backup); }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        }
    }
}
