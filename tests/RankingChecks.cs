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
        void Wait(Func<bool> ready, double timeoutSeconds = 10)
        {
            var clock = Stopwatch.StartNew();
            while (!ready() && clock.Elapsed < TimeSpan.FromSeconds(timeoutSeconds))
            {
                var frame = new DispatcherFrame();
                Dispatcher.CurrentDispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() => frame.Continue = false));
                Dispatcher.PushFrame(frame); Thread.Sleep(5); Layout();
            }
            Assert(ready(), "비동기 화면 갱신 완료");
        }
        void ClickGame(string name)
        {
            var button = Find<Button>(content).Single(b => b.Content is TextBlock text && text.Text == name);
            button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        }
        string[] Labels() => Find<TextBlock>(content).Select(t => t.Text).ToArray();
        void ClickAction(string title)
        {
            Layout();
            Find<Button>(content).Single(b => Equals(b.Content, title)).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        }
        (Task Poll, Action Complete) DeferSlapPoll(bool missingFile)
        {
            Wait(() => !(bool)Get("busy")! && !(bool)Get("slapSyncing")!);
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
        Wait(() => Find<Button>(content).Any(b => b.Tag is Guid id && id == room.Id));
        var resume = Find<Button>(content).Single(b => b.Tag is Guid id && id == room.Id);
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

        Set("userId", "player10");
        Call("ShowSlapLobby"); Layout();
        var simultaneousRooms = new List<Guid>();
        for (int i = 0; i < 3; i++)
        {
            ClickAction("방 만들기");
            Wait(() => !(bool)Get("busy")! && Equals(Get("panel"), "slap-room") && Get("slapRoomId") is not null);
            var id = (Guid)Get("slapRoomId")!;
            simultaneousRooms.Add(id);
            ClickAction("준비 완료");
            Wait(() => !(bool)Get("busy")! && Find<Button>(content).Any(b => Equals(b.Content, "준비 취소")));
            ClickAction("방 목록으로 · 참가 유지"); Layout();
            Assert(Find<Button>(content).Any(b => b.Tag is Guid tag && tag == id) && slap.Sync(id, "player10")!.Find("player10")!.Ready,
                "대기실에서 목록으로 이동해도 방 항목과 준비 상태 유지");
        }
        Assert(simultaneousRooms.Distinct().Count() == 3 && Labels().Contains("내가 참가한 방 · 3개"), "한 사람이 만든 세 방을 목록에 각각 표시");
        var entries = Find<Button>(content).Where(b => b.Tag is Guid id && simultaneousRooms.Contains(id)).ToArray();
        Assert(entries.Length == 3 && entries.All(b => b.IsEnabled)
            && entries.Select(b => ((TextBlock)b.Content).Text).Distinct().Count() == 3, "같은 사람이 만든 방도 서로 구분하고 모두 입장 가능");
        for (int i = 0; i < simultaneousRooms.Count; i++)
        {
            var id = simultaneousRooms[i];
            var opponent = $"player{i + 11:00}";
            slap.Join(id, opponent); slap.SetReady(id, opponent, true);
            Find<Button>(content).Single(b => b.Tag is Guid tag && tag == id).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Wait(() => !(bool)Get("busy")! && Equals(Get("slapRoomId"), id) && Labels().Contains("내 공격 차례!"));
            ClickAction("기 모으기  +1");
            Wait(() => !(bool)Get("busy")! && Labels().Contains("선택 완료 · 기 모으기"));
            ClickAction("방 목록으로 · 대전 유지"); Layout();
        }
        Assert(simultaneousRooms.All(id => slap.Sync(id, "player10")!.Find("player10")!.Choice == new SlapAction(SlapMove.Charge)),
            "세 방을 오가며 입력한 행동을 각 방에 별도로 보존");
        Assert(Find<Button>(content).Count(b => b.Tag is Guid id && simultaneousRooms.Contains(id)
            && ((TextBlock)b.Content).Text.Contains("상대 선택 대기")) == 3, "각 방의 진행 상태를 목록에 표시");
        Call("DetachSlapRoom");
        Console.WriteLine("뺨때리기 세 방 동시 참가·목록·전환 검증 완료");

        var guest = new MainWindow();
        var guestContent = (FrameworkElement)guest.Content;
        void GuestSet(string name, object? value) => typeof(MainWindow).GetField(name, BindingFlags.NonPublic | BindingFlags.Instance)!.SetValue(guest, value);
        object? GuestGet(string name) => typeof(MainWindow).GetField(name, BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(guest);
        void GuestCall(string name) => typeof(MainWindow).GetMethod(name, BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(guest, null);
        void GuestClick(string title) => Find<Button>(guestContent).Single(b => Equals(b.Content, title)).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        string[] GuestLabels()
        {
            guestContent.Measure(new Size(480, 740)); guestContent.Arrange(new Rect(0, 0, 480, 740)); guestContent.UpdateLayout();
            return Find<TextBlock>(guestContent).Select(t => t.Text).ToArray();
        }
        Set("userId", "player20"); GuestSet("store", new LocalStore(root)); GuestSet("userId", "player21");
        Call("ShowSlapLobby"); ClickAction("방 만들기");
        Wait(() => !(bool)Get("busy")! && Equals(Get("panel"), "slap-room"));
        var sharedRoomId = (Guid)Get("slapRoomId")!;
        ClickAction("준비 완료");
        Wait(() => !(bool)Get("busy")! && Labels().Contains("상대를 기다리는 중"));
        GuestCall("ShowSlapLobby");
        Wait(() => { GuestLabels(); return Find<Button>(guestContent).Any(b => b.Tag is Guid id && id == sharedRoomId); });
        Find<Button>(guestContent).Single(b => b.Tag is Guid id && id == sharedRoomId).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)GuestGet("busy")! && GuestLabels().Contains("준비되면 시작!"));
        Wait(() => Labels().Any(t => t.Contains("player21")) && Labels().Contains("준비되면 시작!"));
        GuestClick("준비 완료");
        Wait(() => Labels().Contains("내 공격 차례!") && GuestLabels().Contains("내 수비 차례!"));
        Assert(Equals(Get("slapRoomId"), sharedRoomId) && Equals(GuestGet("slapRoomId"), sharedRoomId), "방장 선준비 후 상대 참가·준비 시 양쪽이 같은 방에서 자동 시작");

        var background = slap.Create("player20"); slap.Join(background.Id, "player21"); slap.SetReady(background.Id, "player20", true);
        Wait(() => ((List<SlapRoom>)Get("slapRooms")!).Any(r => r.Id == background.Id));
        slap.SetReady(background.Id, "player21", true);
        Wait(() => ((List<SlapRoom>)Get("slapRooms")!).Any(r => r.Id == background.Id && r.Started)
            && ((List<SlapRoom>)GuestGet("slapRooms")!).Any(r => r.Id == background.Id && r.Started));
        Assert(Equals(Get("slapRoomId"), sharedRoomId) && Equals(GuestGet("slapRoomId"), sharedRoomId), "다른 방의 시작 상태도 양쪽에 갱신하며 현재 방 유지");
        ClickAction("방 목록으로 · 대전 유지"); GuestClick("방 목록으로 · 대전 유지");
        Wait(() => { GuestLabels(); return Find<Button>(content).Any(b => b.Tag is Guid id && id == background.Id)
            && Find<Button>(guestContent).Any(b => b.Tag is Guid id && id == background.Id); });
        Find<Button>(content).Single(b => b.Tag is Guid id && id == background.Id).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Find<Button>(guestContent).Single(b => b.Tag is Guid id && id == background.Id).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)Get("busy")! && !(bool)GuestGet("busy")! && Labels().Contains("내 공격 차례!") && GuestLabels().Contains("내 수비 차례!"));
        ClickAction("기 모으기  +1"); Wait(() => !(bool)Get("busy")! && Labels().Contains("선택 완료 · 기 모으기"));
        GuestClick("기 모으기  +1  (이번 턴은 못 막아요)");
        Wait(() => ((SlapRoom)Get("slapRoom")!).Round == 2 && ((SlapRoom)GuestGet("slapRoom")!).Round == 2);
        var hostState = (SlapRoom)Get("slapRoom")!; var guestState = (SlapRoom)GuestGet("slapRoom")!;
        Assert(hostState.Id == background.Id && guestState.Id == background.Id && hostState.Revision == guestState.Revision
            && hostState.Players.All(p => p.Gauge == 1 && p.Hp == 5) && guestState.Players.All(p => p.Gauge == 1 && p.Hp == 5),
            "방 전환 후 턴·체력·기력을 양쪽 화면에 동일하게 반영");
        ((DispatcherTimer)GuestGet("slapTimer")!).Stop(); GuestCall("ShowSlapRoom");
        Assert(((DispatcherTimer)GuestGet("slapTimer")!).IsEnabled, "방 화면 재진입 시 자동 동기화 재시작");
        Call("DetachSlapRoom"); GuestCall("DetachSlapRoom");
        Console.WriteLine("뺨때리기 두 창 참가·준비·방별 자동 동기화 검증 완료");

        Call("ShowSlapLobby"); ClickAction("방 만들기");
        Wait(() => !(bool)Get("busy")! && !(bool)Get("slapSyncing")! && Equals(Get("panel"), "slap-room"));
        var recoveredRoomId = (Guid)Get("slapRoomId")!;
        ClickAction("준비 완료");
        Wait(() => !(bool)Get("busy")! && !(bool)Get("slapSyncing")! && Find<Button>(content).Any(b => Equals(b.Content, "준비 취소")));
        // A restored shared file can have a lower revision than a cached room.
        ((SlapRoom)Get("slapRoom")!).Revision += 100;
        GuestCall("ShowSlapLobby");
        Wait(() => { GuestLabels(); return Find<Button>(guestContent).Any(b => b.Tag is Guid id && id == recoveredRoomId); });
        Find<Button>(guestContent).Single(b => b.Tag is Guid id && id == recoveredRoomId).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)GuestGet("busy")! && GuestLabels().Contains("준비되면 시작!"));
        GuestClick("준비 완료");
        Wait(() => !(bool)GuestGet("busy")! && GuestLabels().Contains("내 수비 차례!"));
        Wait(() => Labels().Contains("내 공격 차례!") && ((SlapRoom)Get("slapRoom")!).Opponent("player20")?.Id == "player21");
        Assert(((SlapRoom)Get("slapRoom")!).Revision == ((SlapRoom)GuestGet("slapRoom")!).Revision,
            "캐시 수정 번호가 더 커도 저장된 실제 참가자·게임 시작 상태로 양쪽 일치");
        Wait(() => !(bool)Get("slapSyncing")!);
        var staleView = (SlapRoom)Get("slapRoom")!;
        staleView.Players.RemoveAll(p => p.Id == "player21"); staleView.Status = SlapStatus.Waiting;
        Set("slapDrawn", null); Call("DrawSlapRoom"); Layout();
        Assert(Labels().Contains("P2  —"), "같은 수정 번호의 잘못된 대기 화면 재현");
        Wait(() => Labels().Contains("내 공격 차례!") && !Labels().Contains("P2  —"));
        Assert(((SlapRoom)Get("slapRoom")!).Players.Count == 2, "수정 번호가 같아도 참가자·상태가 달라지면 화면 복구");
        Call("DetachSlapRoom"); GuestCall("DetachSlapRoom");

        // Replace both window instances between visits so no room state survives in memory.
        window = new MainWindow(); content = (FrameworkElement)window.Content;
        Set("store", new LocalStore(root)); Set("userId", "player30");
        Call("ShowSlapLobby"); ClickAction("방 만들기");
        Wait(() => !(bool)Get("busy")! && Get("slapRoomId") is Guid);
        var offlineRoomId = (Guid)Get("slapRoomId")!;
        ClickAction("준비 완료");
        Wait(() => !(bool)Get("busy")! && Find<Button>(content).Any(b => Equals(b.Content, "준비 취소")));
        Call("DetachSlapRoom");

        guest = new MainWindow(); guestContent = (FrameworkElement)guest.Content;
        GuestSet("store", new LocalStore(root)); GuestSet("userId", "player31");
        GuestCall("ShowSlapLobby");
        Wait(() => { GuestLabels(); return Find<Button>(guestContent).Any(b => b.Tag is Guid id && id == offlineRoomId); });
        Find<Button>(guestContent).Single(b => b.Tag is Guid id && id == offlineRoomId).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)GuestGet("busy")! && GuestLabels().Contains("준비 완료 ✓"));
        GuestClick("준비 완료");
        Wait(() => !(bool)GuestGet("busy")! && GuestLabels().Contains("내 수비 차례!"));
        GuestClick("기 모으기  +1  (이번 턴은 못 막아요)");
        Wait(() => !(bool)GuestGet("busy")! && GuestLabels().Contains("선택 완료 · 기 모으기"));
        GuestCall("DetachSlapRoom");

        window = new MainWindow(); content = (FrameworkElement)window.Content;
        Set("store", new LocalStore(root)); Set("userId", "player30");
        Call("ShowSlapLobby");
        Wait(() => Find<Button>(content).Any(b => b.Tag is Guid id && id == offlineRoomId));
        Find<Button>(content).Single(b => b.Tag is Guid id && id == offlineRoomId).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)Get("busy")! && Labels().Contains("내 공격 차례!"));
        Assert(((SlapRoom)Get("slapRoom")!).Round == 1 && Labels().Any(t => t.Contains("player31") && t.Contains("입력 완료 ✓"))
            && !Find<Button>(content).Any(b => Equals(b.Content, "준비 완료")) && !Labels().Contains("선택 완료 · 기 모으기"),
            "방장이 새 창으로 돌아오면 이미 시작된 첫 턴과 상대 입력 여부를 표시하고 재준비 생략");
        Find<Button>(content).Single(b => b.Content is TextBlock t && t.Text == "상단\n때리기").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)Get("busy")! && ((SlapRoom)Get("slapRoom")!).Round == 2 && Labels().Contains("내 수비 차례!"));
        ClickAction("기 모으기  +1  (이번 턴은 못 막아요)");
        Wait(() => !(bool)Get("busy")! && Labels().Contains("선택 완료 · 기 모으기"));
        Call("DetachSlapRoom");

        guest = new MainWindow(); guestContent = (FrameworkElement)guest.Content;
        GuestSet("store", new LocalStore(root)); GuestSet("userId", "player31");
        GuestCall("ShowSlapLobby");
        Wait(() => { GuestLabels(); return Find<Button>(guestContent).Any(b => b.Tag is Guid id && id == offlineRoomId); });
        Find<Button>(guestContent).Single(b => b.Tag is Guid id && id == offlineRoomId).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)GuestGet("busy")! && GuestLabels().Contains("내 공격 차례!"));
        Assert(((SlapRoom)GuestGet("slapRoom")!).Round == 2 && GuestLabels().Any(t => t.Contains("player30") && t.Contains("입력 완료 ✓")),
            "상대도 새 창으로 돌아오면 공수 교대와 방장의 둘째 턴 입력을 확인");
        Find<Button>(guestContent).Single(b => b.Content is TextBlock t && t.Text.StartsWith("강한 뺨 ×2\n")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        GuestLabels();
        Find<Button>(guestContent).Single(b => b.Content is TextBlock t && t.Text == "중단\n때리기").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)GuestGet("busy")! && ((SlapRoom)GuestGet("slapRoom")!).Round == 3);
        GuestCall("DetachSlapRoom");

        window = new MainWindow(); content = (FrameworkElement)window.Content;
        Set("store", new LocalStore(root)); Set("userId", "player30");
        Call("ShowSlapLobby");
        Wait(() => Find<Button>(content).Any(b => b.Tag is Guid id && id == offlineRoomId));
        Find<Button>(content).Single(b => b.Tag is Guid id && id == offlineRoomId).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)Get("busy")! && Labels().Contains("내 공격 차례!") && ((SlapRoom)Get("slapRoom")!).Round == 3);
        var resumed = (SlapRoom)Get("slapRoom")!;
        Assert(resumed.Id == offlineRoomId && resumed.Find("player30")!.Hp == 3 && resumed.Find("player30")!.Gauge == 1
            && resumed.Find("player31")!.Hp == 4 && resumed.Find("player31")!.Gauge == 0 && resumed.LastResult!.Round == 2
            && resumed.Players.All(p => !p.Submitted), "양쪽이 번갈아 새 창으로 재접속해도 같은 방·턴·체력·기력·결과 유지");
        Call("DetachSlapRoom");
        Console.WriteLine("뺨때리기 선준비·오프라인 시작·선입력·재입장 전체 흐름 검증 완료");

        var liveRoot = Path.Combine(root, "잠금 복구 화면");
        var liveStore = new SlapStore(liveRoot);
        var liveRoom = liveStore.Create("player32");
        window = new MainWindow(); content = (FrameworkElement)window.Content;
        Set("store", new LocalStore(liveRoot)); Set("userId", "player32");
        Call("ShowSlapLobby");
        Wait(() => !(bool)Get("slapSyncing")! && Get("slapLastSyncUtc") is DateTime);
        var beforeLock = (DateTime)Get("slapLastSyncUtc")!;
        var heldWriteLock = new FileStream(Path.Combine(liveRoot, ".ddongvoid-slap.lock"), FileMode.Open, FileAccess.ReadWrite, FileShare.None);
        var pendingCreate = Task.Run(() => liveStore.Create("player33"));
        SlapRoom? incoming = null;
        try
        {
            Wait(() => Get("slapLastSyncUtc") is DateTime tick && tick > beforeLock, 3);
            Assert(!pendingCreate.IsCompleted, "다른 PC가 쓰기 잠금을 기다리는 동안에도 자동 조회 시각 갱신");
        }
        finally { heldWriteLock.Dispose(); incoming = pendingCreate.GetAwaiter().GetResult(); }
        Wait(() => Find<Button>(content).Any(b => b.Tag is Guid id && id == incoming!.Id));
        Assert(Labels().Any(t => t.Contains("player33 님의 방")), "재시작 없이 상대가 새로 만든 방을 목록에 표시");

        Find<Button>(content).Single(b => b.Tag is Guid id && id == liveRoom.Id).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)Get("busy")! && Equals(Get("slapRoomId"), liveRoom.Id));
        ClickAction("준비 완료");
        Wait(() => !(bool)Get("busy")! && Labels().Contains("상대를 기다리는 중"));
        guest = new MainWindow(); guestContent = (FrameworkElement)guest.Content;
        GuestSet("store", new LocalStore(liveRoot)); GuestSet("userId", "player33"); GuestCall("ShowSlapLobby");
        Wait(() => { GuestLabels(); return Find<Button>(guestContent).Any(b => b.Tag is Guid id && id == liveRoom.Id); });
        Find<Button>(guestContent).Single(b => b.Tag is Guid id && id == liveRoom.Id).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        Wait(() => !(bool)GuestGet("busy")! && Labels().Any(t => t.Contains("P2  player33")));
        Assert(!Labels().Contains("P2  —"), "상대가 들어오면 재시작 없이 방장 P2 카드 갱신");

        Wait(() => !(bool)Get("slapSyncing")! && !(bool)GuestGet("slapSyncing")!);
        var beforeFailure = (DateTime)Get("slapLastSyncUtc")!;
        using (var heldDataFile = new FileStream(liveStore.FilePath, FileMode.Open, FileAccess.Read, FileShare.None))
        {
            Wait(() => !(bool)Get("slapSyncing")! && ((string)Get("slapSyncNote")!).StartsWith("조회 실패"), 4);
            Assert(Equals(Get("slapRoomId"), liveRoom.Id) && ((SlapRoom)Get("slapRoom")!).Players.Count == 2,
                "파일 조회 실패 시 현재 방과 마지막 참가자 상태 보존");
        }
        GuestClick("준비 완료");
        Wait(() => !(bool)GuestGet("busy")! && GuestLabels().Contains("내 수비 차례!"));
        GuestClick("기 모으기  +1  (이번 턴은 못 막아요)");
        Wait(() => Labels().Contains("내 공격 차례!") && ((SlapRoom)Get("slapRoom")!).Opponent("player32")!.Submitted
            && Get("slapLastSyncUtc") is DateTime tick && tick > beforeFailure);
        Assert(Get("message") is null && ((string)Get("slapSyncNote")!).StartsWith("자동 갱신"), "잠금 해제 후 재시작 없이 자동 조회·게임 시작·상대 입력 복구");
        Wait(() => !(bool)Get("slapSyncing")!);
        ((DispatcherTimer)Get("slapTimer")!).Stop();
        var manualRoom = liveStore.Create("player34");
        ClickAction("새로고침");
        Wait(() => ((List<SlapRoom>)Get("slapRooms")!).Any(r => r.Id == manualRoom.Id));
        Assert(((DispatcherTimer)Get("slapTimer")!).IsEnabled, "새로고침 버튼으로 최신 목록 조회 및 자동 갱신 재시작");
        Call("DetachSlapRoom"); GuestCall("DetachSlapRoom");
        Console.WriteLine("뺨때리기 실행 중 방 목록·P2 갱신·파일 잠금 복구 검증 완료");
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
