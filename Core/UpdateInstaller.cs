using System.IO;

namespace DDongVoid.Core;

public static class UpdateInstaller
{
    public static void Install(string payloadDirectory, string targetDirectory, string backupDirectory)
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
                var temporary = Path.Combine(target, $".{name}.{Guid.NewGuid():N}.update");
                try
                {
                    File.Copy(Path.Combine(payload, name), temporary);
                    File.Move(temporary, Path.Combine(target, name), overwrite: true);
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
}
