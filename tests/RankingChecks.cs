using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using DDongVoid;
using DDongVoid.Core;

internal static class RankingChecks
{
    [STAThread]
    private static void Main()
    {
        var styles = System.Xml.Linq.XDocument.Load(Path.Combine(AppContext.BaseDirectory, "AppStyles.txt"));
        System.Xml.Linq.XNamespace ns = "http://schemas.microsoft.com/winfx/2006/xaml/presentation";
        var dictionary = new System.Xml.Linq.XElement(ns + "ResourceDictionary",
            new System.Xml.Linq.XAttribute(System.Xml.Linq.XNamespace.Xmlns + "x", "http://schemas.microsoft.com/winfx/2006/xaml"),
            styles.Root!.Element(ns + "Application.Resources")!.Elements());
        var app = new Application { Resources = (ResourceDictionary)System.Windows.Markup.XamlReader.Parse(dictionary.ToString()) };
        SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext(Dispatcher.CurrentDispatcher));
        var window = new MainWindow();
        var root = Path.Combine(AppContext.BaseDirectory, "test-data", Guid.NewGuid().ToString("N"));
        var store = new LocalStore(root);
        var records = new List<PlayRecord>();
        var now = DateTimeOffset.UtcNow;
        // Seed valid accounts without spending the UI check on repeated password hashing.
        store.Register("player00", "test");
        var db = System.Text.Json.JsonSerializer.Deserialize<Database>(File.ReadAllText(store.FilePath))!;
        var account = db.Accounts[0];
        for (int i = 0; i < 40; i++)
        {
            var id = $"player{i:00}";
            if (i > 0) db.Accounts.Add(account with { Id = id });
            var record = new PlayRecord(Guid.NewGuid(), id, i * 100, 10, 0, now);
            db.Records.Add(record); records.Add(record);
        }
        File.WriteAllText(store.FilePath, System.Text.Json.JsonSerializer.Serialize(db));
        var rhythm = new RhythmStore(root);
        foreach (var record in records) rhythm.AddRecord(record with { Score = 5000 - record.Score });
        var slap = new SlapStore(root);
        var room = slap.Create("player00"); slap.Join(room.Id, "player01");
        slap.SetReady(room.Id, "player00", true); slap.SetReady(room.Id, "player01", true);
        slap.Leave(room.Id, "player01");

        void Set(string name, object? value) => typeof(MainWindow).GetField(name, BindingFlags.NonPublic | BindingFlags.Instance)!.SetValue(window, value);
        void Call(string name) => typeof(MainWindow).GetMethod(name, BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(window, null);
        void Assert(bool condition, string text) { if (!condition) throw new Exception(text); Console.WriteLine("통과: " + text); }
        IEnumerable<T> Find<T>(DependencyObject parent) where T : DependencyObject
        {
            if (parent is T found) yield return found;
            for (int i = 0; i < VisualTreeHelper.GetChildrenCount(parent); i++)
                foreach (var child in Find<T>(VisualTreeHelper.GetChild(parent, i))) yield return child;
        }
        var content = (FrameworkElement)window.Content;
        void Layout(double width = 480, double height = 740)
        {
            content.Measure(new Size(width, height)); content.Arrange(new Rect(0, 0, width, height)); content.UpdateLayout();
        }
        void Wait(Func<bool> ready)
        {
            var clock = Stopwatch.StartNew();
            while (!ready() && clock.Elapsed < TimeSpan.FromSeconds(10))
            {
                var frame = new DispatcherFrame();
                Dispatcher.CurrentDispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() => frame.Continue = false));
                Dispatcher.PushFrame(frame); Thread.Sleep(5); Layout();
            }
            Assert(ready(), "랭킹 비동기 조회 완료");
        }
        void ClickGame(string name)
        {
            var button = Find<Button>(content).Single(b => b.Content is TextBlock text && text.Text == name);
            button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        }
        string[] Labels() => Find<TextBlock>(content).Select(t => t.Text).ToArray();
        ScrollViewer? List() => Find<ScrollViewer>(content).FirstOrDefault(s => s.Name == "RankingList");
        Set("store", store); Set("userId", "player00");
        Call("ShowRankings"); Layout(); Wait(() => List() is not null);
        Assert(Labels().Contains("3,900점"), "똥 피하기 최고 점수 표시");
        var list = List()!;
        Assert(list.ScrollableHeight > 0, "40명 랭킹의 스크롤 영역 생성");
        var wheel = new MouseWheelEventArgs(Mouse.PrimaryDevice, 0, -120) { RoutedEvent = UIElement.PreviewMouseWheelEvent };
        ((Panel)list.Content).Children[0].RaiseEvent(wheel); Layout();
        Assert(wheel.Handled && list.VerticalOffset > 0, "랭킹 행 위에서 휠을 내리면 목록 스크롤");
        list.ScrollToBottom(); Layout(); Assert(list.VerticalOffset >= list.ScrollableHeight - 1, "마지막 플레이어까지 스크롤 가능");
        ClickGame("키보드 리듬"); Wait(() => List() is not null && Labels().Contains("5,000점"));
        Assert(List()!.VerticalOffset == 0, "게임 전환 시 스크롤 위치 초기화");
        ClickGame("뺨때리기"); Wait(() => Labels().Contains("1승 0패"));
        Assert(Labels().Contains("0승 1패"), "뺨때리기 승·패를 함께 표시");
        ClickGame("똥 피하기"); ClickGame("키보드 리듬"); Wait(() => Labels().Contains("5,000점"));
        Assert(Labels().Any(t => t.StartsWith("내 순위  1위") && t.Contains("5,000점")), "빠르게 게임을 바꿔도 이전 조회 결과를 표시하지 않음");
        Layout(300, 320);
        Assert(List()!.ScrollableHeight > 0, "작은 창에서도 랭킹 스크롤 유지");
        // Exercise the same retry path used after a failed shared-folder write.
        Set("activeGame", Enum.Parse(typeof(MainWindow).GetNestedType("MiniGame", BindingFlags.NonPublic)!, "Rhythm"));
        Set("pendingRecord", records[0] with { RecordId = Guid.NewGuid(), Score = 9999 });
        Call("ShowEnd"); Layout();
        Assert(Find<Button>(content).Any(b => Equals(b.Content, "기록 저장 재시도")), "리듬 미저장 기록 재시도 버튼 표시");
        Call("SavePendingRecord");
        Assert(rhythm.Rankings()[0].BestScore == 9999 && store.BestScore("player00") == 0, "리듬 결과 저장 경로 분리");
        Console.WriteLine("랭킹 화면 검증 완료");
        Directory.Delete(root, true);
    }
}
