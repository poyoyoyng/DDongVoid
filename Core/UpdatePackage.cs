using System.IO;
using System.IO.Compression;

namespace DDongVoid.Core;

public static class UpdatePackage
{
    public const long MaximumBytes = 100 * 1024 * 1024;
    public static readonly string[] RequiredFiles =
    [
        "DDongVoid.exe", "DDongVoid.dll", "DDongVoid.deps.json", "DDongVoid.runtimeconfig.json",
        "DDongVoid.Updater.exe", "DDongVoid.Updater.dll", "DDongVoid.Updater.deps.json", "DDongVoid.Updater.runtimeconfig.json"
    ];
    private static readonly HashSet<string> AllowedFiles = new(RequiredFiles.Concat(["run.cmd", "README.txt"]), StringComparer.OrdinalIgnoreCase);

    public static void Extract(string archivePath, string destination)
    {
        using var archive = ZipFile.OpenRead(archivePath);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long total = 0;
        // Validate every entry before writing anything; never accept data/settings files or paths.
        foreach (var entry in archive.Entries)
        {
            total = checked(total + entry.Length);
            if (!AllowedFiles.Contains(entry.FullName) || !seen.Add(entry.FullName) || entry.Length <= 0 || total > MaximumBytes)
                throw new InvalidDataException("업데이트 ZIP에 허용되지 않거나 중복된 파일이 있습니다.");
        }
        if (RequiredFiles.Any(name => !seen.Contains(name))) throw new InvalidDataException("업데이트에 필요한 실행 파일이 누락되었습니다.");
        Directory.CreateDirectory(destination);
        foreach (var entry in archive.Entries.Where(e => RequiredFiles.Contains(e.FullName, StringComparer.OrdinalIgnoreCase)))
            entry.ExtractToFile(Path.Combine(destination, entry.FullName), overwrite: false);
    }
}
