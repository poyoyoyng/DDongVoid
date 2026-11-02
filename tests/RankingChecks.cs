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
        slap.SetReady(room.Id, "player00", true); room = slap.SetReady(room.Id, "player01", true);
        while (room.Started)
        {
            var attacker = room.AttackerId!; var defender = room.DefenderId!;
            slap.Submit(room.Id, attacker, new SlapAction(SlapMove.Slap, SlapZone.High, 1));
            room = slap.Submit(room.Id, defender, new SlapAction(SlapMove.Block, defender == "player00" ? SlapZone.High : SlapZone.Low));
        }

        void Set(string name, object? value) => typeof(MainWindow).GetField(name, BindingFlags.NonPublic | BindingFlags.Instance)!.SetValue(window, value);
        object? Get(string name) => typeof(MainWindow).GetField(name, BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(window);
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
        void ClickAction(string title) => Find<Button>(content).Single(b => Equals(b.Content, title)).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        (Task Poll, Action Complete) DeferSlapPoll(bool missingFile)
        {
            var deferred = new DeferredContext();
            var originalContext = SynchronizationContext.Current;
            var backupPath = slap.FilePath + ".poll-test";
            if (missingFile) File.Move(slap.FilePath, backupPath);
            try
            {
                SynchronizationContext.SetSynchronizationContext(deferred);
                var poll = (Task)typeof(MainWindow).GetMethod("PollSlapAsync", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(window, null)!;
                return (poll, deferred.TakeContinuation());
            }
            finally
            {
                SynchronizationContext.SetSynchronizationContext(originalContext);
                if (missingFile) File.Move(backupPath, slap.FilePath);
            }
        }
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

        Set("userId", "player02"); Set("pendingRecord", null);
        Layout();
        room = slap.Create("player03"); room = slap.Join(room.Id, "player02");
        Set("slapRoomId", room.Id); Set("slapRoom", room);
        Call("ShowSlapRoom"); Layout();
        var oldPoll = DeferSlapPoll(missingFile: true);
        ClickAction("준비 완료");
        Wait(() => !(bool)Get("busy")! && Labels().Contains("준비 완료 ✓"));
        oldPoll.Complete(); oldPoll.Poll.GetAwaiter().GetResult();
        Assert(Equals(Get("slapRoomId"), room.Id) && Equals(Get("panel"), "slap-room") && Get("message") is null,
            "준비 전의 조회가 늦게 돌아와도 준비 상태와 방 화면 유지");
        var missingPoll = DeferSlapPoll(missingFile: true);
        missingPoll.Complete(); missingPoll.Poll.GetAwaiter().GetResult();
        Assert(Equals(Get("slapRoomId"), room.Id) && Equals(Get("panel"), "slap-room") && ((SlapRoom)Get("slapRoom")!).Find("player02")!.Ready,
            "일시적으로 방 정보를 못 읽어도 퇴장하지 않고 준비 상태 보존");
        var recoveredPoll = DeferSlapPoll(missingFile: false);
        recoveredPoll.Complete(); recoveredPoll.Poll.GetAwaiter().GetResult();
        Assert(Get("message") is null && Find<Button>(content).Any(b => Equals(b.Content, "준비 취소")), "다음 조회 성공 시 안내를 지우고 준비 상태 복구");
        ClickAction("준비 취소");
        Wait(() => !(bool)Get("busy")! && Find<Button>(content).Any(b => Equals(b.Content, "준비 완료")));
        slap.SetReady(room.Id, "player03", true);
        ClickAction("준비 완료");
        Wait(() => !(bool)Get("busy")! && Labels().Contains("내 수비 차례!"));
        Assert(Equals(Get("slapRoomId"), room.Id) && Equals(Get("panel"), "slap-room"), "상대 준비 후 준비를 누르면 방을 유지하며 대전 시작");
        Call("DetachSlapRoom");
        room = slap.Create("player02"); slap.Join(room.Id, "player03");
        slap.SetReady(room.Id, "player02", true); slap.SetReady(room.Id, "player03", true);
        room = slap.Submit(room.Id, "player02", new SlapAction(SlapMove.Charge));
        Set("slapRoomId", room.Id); Set("slapRoom", room);
        Call("ShowSlapRoom"); Layout();
        Assert(Labels().Contains("선택 완료 · 기 모으기"), "저장한 행동을 대전 화면에 표시");
        Call("DetachSlapRoom");
        Assert(slap.Sync(room.Id, "player02")!.Find("player02")!.Submitted, "화면을 닫아도 선택한 행동을 보존");
        Call("ShowSlapLobby"); Layout();
        Wait(() => Find<Button>(content).Any(b => b.Content is string title && title.Contains("이어하기")));
        var resume = Find<Button>(content).Single(b => b.Content is string title && title.StartsWith("player02 님의 방") && title.Contains("이어하기"));
        Assert(resume.IsEnabled, "게임 중인 내 방의 이어하기 버튼 활성화");
        resume.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => Labels().Contains("선택 완료 · 기 모으기"));
        ClickAction("포기하기");
        Wait(() => Labels().Any(t => t.StartsWith("포기를 요청했어요")));
        Assert(slap.Sync(room.Id, "player03")!.Started, "한쪽 포기 요청 후에도 대전 유지");
        ClickAction("포기 요청 취소");
        Wait(() => Labels().Contains("선택 완료 · 기 모으기"));
        ClickAction("포기하기");
        Wait(() => Labels().Any(t => t.StartsWith("포기를 요청했어요")));
        slap.SetGiveUp(room.Id, "player03", true);
        var poll = (Task)typeof(MainWindow).GetMethod("PollSlapAsync", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(window, null)!;
        Wait(() => poll.IsCompleted && Labels().Contains("두 사람이 모두 포기하여 대전을 종료했습니다."));
        poll.GetAwaiter().GetResult();
        Assert(!Labels().Any(t => t.StartsWith("승자  ")), "상호 포기 결과에 승자 표시 없음");
        Call("DetachSlapRoom");
        Console.WriteLine("뺨때리기 이어하기·상호 포기 화면 검증 완료");
        Directory.Delete(root, true);
    }

    private sealed class DeferredContext : SynchronizationContext
    {
        private readonly System.Collections.Concurrent.BlockingCollection<(SendOrPostCallback Callback, object? State)> continuations = new();
        public override void Post(SendOrPostCallback callback, object? state) => continuations.Add((callback, state));
        public Action TakeContinuation()
        {
            if (!continuations.TryTake(out var next, TimeSpan.FromSeconds(10))) throw new Exception("지연시킬 조회 결과가 도착하지 않았습니다.");
            return () => next.Callback(next.State);
        }
    }
}
