using System.Diagnostics;
using System.Runtime.InteropServices;
using DDongVoid.Core;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        string? target = null;
        try
        {
            if (args.Length is < 4 or > 5 || !int.TryParse(args[0], out var pid) || !long.TryParse(args[1], out var ticks))
                throw new ArgumentException("이 파일은 게임의 업데이트 안내에서 실행해 주세요.");
            target = Path.GetFullPath(args[2]); var payload = Path.GetFullPath(args[3]);
            var portable = args.Length == 5 && args[4] == "--portable";
            try
            {
                using var parent = Process.GetProcessById(pid);
                if (parent.StartTime.ToUniversalTime().Ticks != ticks) throw new InvalidOperationException("원래 게임 프로세스를 확인할 수 없습니다.");
                if (!parent.WaitForExit(30000)) throw new IOException("게임이 아직 실행 중입니다. 게임을 닫은 뒤 다시 업데이트해 주세요.");
            }
            catch (ArgumentException) { /* The original process has already exited. */ }
            // A second game window (possibly hidden) keeps DDongVoid.exe locked.
            var waited = Stopwatch.StartNew();
            while (UpdateInstaller.RunningGames(target).Count > 0)
            {
                if (waited.Elapsed > TimeSpan.FromSeconds(15))
                    throw new IOException("다른 게임 창이 아직 실행 중입니다. 숨긴 창을 포함해 게임을 모두 닫은 뒤 다시 업데이트해 주세요.");
                Thread.Sleep(250);
            }
            var backup = Path.Combine(Path.GetDirectoryName(payload)!, "backup");
            UpdateInstaller.Install(payload, target, backup);
            var start = new ProcessStartInfo(Path.Combine(target, "DDongVoid.exe")) { UseShellExecute = true, WorkingDirectory = target };
            if (portable) start.ArgumentList.Add("--portable");
            Process.Start(start);
            return 0;
        }
        catch (Exception ex)
        {
            var help = UpdateInstaller.IsAccessDenied(ex) ? "\n\n" + UpdateInstaller.AccessDeniedHelp : "";
            MessageBox(IntPtr.Zero, "업데이트를 완료하지 못했습니다. 현재 버전은 그대로 유지됩니다.\n\n" + ex.Message + help + "\n\n게임 폴더: " + (target ?? "확인되지 않음"), "AKC미니게임 업데이트", 0x10);
            return 1;
        }
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int MessageBox(IntPtr hwnd, string text, string caption, uint type);
}
