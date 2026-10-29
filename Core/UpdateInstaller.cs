using System.Diagnostics;
using System.IO;

namespace DDongVoid.Core;

public static class UpdateInstaller
{
    public static void Install(string payloadDirectory, string targetDirectory, string backupDirectory, TimeSpan? retryFor = null)
    {
        var target = Path.GetFullPath(targetDirectory);
        var payload = Path.GetFullPath(payloadDirectory);
        var backup = Path.GetFullPath(backupDirectory);
        if (target.Equals(payload, StringComparison.OrdinalIgnoreCase) || target.Equals(backup, StringComparison.OrdinalIgnoreCase) ||
            !File.Exists(Path.Combine(target, "DDongVoid.exe")))
            throw new InvalidDataException("업데이트할 게임 폴더가 올바르지 않습니다.");
        foreach (var name in UpdatePackage.RequiredFiles)
            if (!File.Exists(Path.Combine(payload, name))) throw new InvalidDataException("업데이트 실행 파일이 누락되었습니다.");
        Directory.CreateDirectory(backup);
        var existed = UpdatePackage.RequiredFiles.Where(name => File.Exists(Path.Combine(target, name))).ToHashSet();
        foreach (var name in existed) File.Copy(Path.Combine(target, name), Path.Combine(backup, name), overwrite: false);
        var applied = new List<string>();
        try
        {
            foreach (var name in UpdatePackage.RequiredFiles)
            {
                var destination = Path.Combine(target, name);
                var temporary = Path.Combine(target, $".{name}.{Guid.NewGuid():N}.update");
                try
                {
                    File.Copy(Path.Combine(payload, name), temporary);
                    // A read-only flag (e.g. files copied from a share or USB) blocks replacement.
                    if (File.Exists(destination)) File.SetAttributes(destination, File.GetAttributes(destination) & ~FileAttributes.ReadOnly);
                    Retry(() => File.Move(temporary, destination, overwrite: true), retryFor ?? TimeSpan.FromSeconds(5));
                    applied.Add(name);
                }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
            }
        }
        catch (Exception installError)
        {
            var errors = new List<Exception> { installError };
            foreach (var name in applied.AsEnumerable().Reverse())
            {
                try
                {
                    var path = Path.Combine(target, name);
                    if (existed.Contains(name)) File.Copy(Path.Combine(backup, name), path, overwrite: true);
                    else File.Delete(path);
                }
                catch (Exception rollbackError) { errors.Add(rollbackError); }
            }
            if (errors.Count > 1) throw new AggregateException("업데이트 복원에 실패했습니다. 백업 폴더: " + backup, errors);
            throw;
        }
    }
    // Antivirus scans and a just-exited game can hold the files for a moment after exit.
    private static void Retry(Action action, TimeSpan retryFor)
    {
        var timer = Stopwatch.StartNew();
        while (true)
        {
            try { action(); return; }
            catch (Exception ex) when ((ex is IOException or UnauthorizedAccessException) && timer.Elapsed < retryFor) { Thread.Sleep(200); }
        }
    }
    // Ids of other game processes started from this folder, hidden windows included.
    public static List<int> RunningGames(string targetDirectory, int? exceptProcessId = null)
    {
        var exe = Path.Combine(Path.GetFullPath(targetDirectory), "DDongVoid.exe");
        var result = new List<int>();
        foreach (var process in Process.GetProcessesByName("DDongVoid"))
        {
            using (process)
            {
                try
                {
                    if (process.Id != exceptProcessId && string.Equals(process.MainModule?.FileName, exe, StringComparison.OrdinalIgnoreCase))
                        result.Add(process.Id);
                }
                catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException) { }
            }
        }
        return result;
    }
    public static bool IsAccessDenied(Exception ex) =>
        ex is UnauthorizedAccessException || ex.HResult == unchecked((int)0x80070005) ||
        (ex is AggregateException aggregate && aggregate.InnerExceptions.Any(IsAccessDenied)) || (ex.InnerException is { } inner && IsAccessDenied(inner));
    public const string AccessDeniedHelp = "게임 파일을 바꿀 권한이 없거나 다른 프로그램이 파일을 사용 중입니다.\n" +
        "· 숨긴 창을 포함해 게임 창을 모두 닫았는지 확인해 주세요.\n" +
        "· D:\\ 같은 드라이브 최상위 대신 D:\\AKC미니게임 같은 폴더를 만들어 압축을 풀어 주세요.\n" +
        "· Program Files 같은 보호 폴더에는 설치하지 마세요.";
}
