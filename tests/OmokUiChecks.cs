using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using DDongVoid;
using DDongVoid.Core;

internal static class OmokUiChecks
{
    [STAThread]
    private static void Main(string[] args)
    {
        var styles = System.Xml.Linq.XDocument.Load(Path.Combine(AppContext.BaseDirectory, "AppStyles.txt"));
        System.Xml.Linq.XNamespace ns = "http://schemas.microsoft.com/winfx/2006/xaml/presentation";
        var dictionary = new System.Xml.Linq.XElement(ns + "ResourceDictionary",
            new System.Xml.Linq.XAttribute(System.Xml.Linq.XNamespace.Xmlns + "x", "http://schemas.microsoft.com/winfx/2006/xaml"),
            styles.Root!.Element(ns + "Application.Resources")!.Elements());
        var app = new Application { Resources = (ResourceDictionary)System.Windows.Markup.XamlReader.Parse(dictionary.ToString()) };
        SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext(Dispatcher.CurrentDispatcher));
        var host = new MainWindow(); var guest = new MainWindow();
        var root = Path.Combine(AppContext.BaseDirectory, "test-data", Guid.NewGuid().ToString("N"));
        var store = new OmokStore(root); Directory.CreateDirectory(root);
        void Assert(bool condition, string message) { if (!condition) throw new Exception(message); Console.WriteLine("통과: " + message); }
        void Set(MainWindow w, string field, object? value) => typeof(MainWindow).GetField(field, BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(w, value);
        object? Get(MainWindow w, string field) => typeof(MainWindow).GetField(field, BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(w);
        void Call(MainWindow w, string method) => typeof(MainWindow).GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(w, null);
        IEnumerable<T> Find<T>(DependencyObject parent) where T : DependencyObject
        {
            if (parent is T item) yield return item;
            for (var i = 0; i < VisualTreeHelper.GetChildrenCount(parent); i++)
                foreach (var child in Find<T>(VisualTreeHelper.GetChild(parent, i))) yield return child;
        }
        void Layout(MainWindow w, double width = 480, double height = 740)
        {
            var body = (FrameworkElement)w.Content; body.Measure(new Size(width, height)); body.Arrange(new Rect(0, 0, width, height)); body.UpdateLayout();
        }
        void Wait(Func<bool> ready)
        {
            var watch = Stopwatch.StartNew();
            while (!ready() && watch.Elapsed.TotalSeconds < 10)
            {
                var frame = new DispatcherFrame(); Dispatcher.CurrentDispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() => frame.Continue = false));
                Dispatcher.PushFrame(frame); Thread.Sleep(5); Layout(host); Layout(guest);
            }
            if (!ready()) throw new Exception("화면 갱신 시간 초과");
        }
        bool Idle() => !(bool)Get(host, "busy")! && !(bool)Get(guest, "busy")!;
        OmokRoom Room(MainWindow w) => (OmokRoom)Get(w, "omokRoom")!;
        string Label(Button b) => b.Content is TextBlock t ? t.Text : b.Content as string ?? "";
        void Press(Button button) => button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        void Click(MainWindow w, string label) => Press(Find<Button>((DependencyObject)w.Content).Single(b => Label(b) == label));
        int At(int x, int y) => y * OmokRules.Size + x;
        List<Button> Points(MainWindow w) => [.. Find<Button>((DependencyObject)w.Content).Where(b => b.Tag is int && b.Parent is System.Windows.Controls.Primitives.UniformGrid { Name: "OmokPoints" })];
        void Place(MainWindow w, int x, int y)
        {
            var moves = Room(w).Moves;
            Press(Points(w).Single(b => (int)b.Tag == At(x, y)));
            Wait(() => Idle() && Room(host).Moves > moves && Room(guest).Moves > moves);
        }
        void Screenshot(MainWindow w, string suffix)
        {
            if (args.Length != 1) return;
            var body = (FrameworkElement)w.Content; var bitmap = new RenderTargetBitmap(480, 740, 96, 96, PixelFormats.Pbgra32); bitmap.Render(body);
            var png = new PngBitmapEncoder(); png.Frames.Add(BitmapFrame.Create(bitmap));
            using var file = File.Create(Path.GetFullPath(args[0]).Replace(".png", suffix + ".png")); png.Save(file);
        }
        foreach (var w in new[] { host, guest }) { Set(w, "store", new LocalStore(root)); Set(w, "userId", w == host ? "p0" : "p1"); }
        try
        {
            Call(host, "ShowGameList"); Layout(host);
            var list = Find<System.Windows.Controls.Primitives.UniformGrid>((DependencyObject)host.Content).Single(p => p.Name == "GameList");
            var item = list.Children.Cast<Button>().SingleOrDefault(b => ((TextBlock)b.Content).Text == "오목");
            Assert(item is not null, "게임 목록에 오목 표시");
            Press(item!);
            Assert(Equals(Get(host, "panel"), "omok-lobby"), "게임 목록에서 오목 클릭으로 로비 진입");
            Layout(host); Click(host, "방 만들기"); Layout(host);
            Find<TextBox>((DependencyObject)host.Content).Single(t => t.Name == "OmokRoomTitle").Text = "둘이서 오목";
            Click(host, "방 만들기"); Wait(() => Idle() && Equals(Get(host, "panel"), "omok-room"));
            var id = Room(host).Id;
            Click(host, "준비 완료"); Wait(Idle);
            Assert(Room(host).Status == OmokStatus.Waiting, "혼자 준비하면 시작하지 않고 상대를 기다림");
            Call(guest, "ShowOmokLobby"); Wait(() => Find<Button>((DependencyObject)guest.Content).Any(b => b.Tag is Guid g && g == id));
            Press(Find<Button>((DependencyObject)guest.Content).Single(b => b.Tag is Guid g && g == id));
            Wait(() => Idle() && Equals(Get(guest, "panel"), "omok-room"));
            Click(guest, "준비 완료");
            Wait(() => Idle() && Room(host).Status == OmokStatus.Playing && Room(guest).Status == OmokStatus.Playing);
            Assert(Points(host).Count == OmokRules.Points && Points(guest).Count == 0, "흑(방장) 화면에만 둘 수 있는 자리 표시");
            Place(host, 7, 5); Place(guest, 0, 0); Place(host, 7, 6); Place(guest, 0, 2); Place(host, 5, 7); Place(guest, 0, 4); Place(host, 6, 7); Place(guest, 0, 6);
            Assert(Room(guest).Board[At(7, 7)] == OmokRules.Empty && Room(guest).Board[At(6, 7)] == OmokRules.Black, "두 화면의 오목판이 같은 수로 갱신");
            Assert(Points(host).All(b => (int)b.Tag != At(7, 7)) && Find<Grid>((DependencyObject)host.Content).Any(g => (g.ToolTip as string)?.Contains("H8 · 흑 금수 (3-3)") == true),
                "흑 차례에 3-3 금수 자리는 × 표시·누를 수 없음");
            foreach (var transparent in new[] { true, false })
            {
                var preferences = Get(host, "preferences")!;
                preferences.GetType().GetProperty("Transparent")!.SetValue(preferences, transparent); Call(host, "ApplyAppearance");
                Set(host, "omokDrawn", null); Call(host, "DrawOmokRoom"); Layout(host);
                var scroller = Find<ScrollViewer>((DependencyObject)host.Content).Single(s => ReferenceEquals(s.Content, host.FindName("DialogContent")));
                var viewport = Find<ScrollContentPresenter>(scroller).First();
                var actions = Find<FrameworkElement>((DependencyObject)host.Content).Single(e => e.Name == "OmokActions");
                var board = Find<FrameworkElement>((DependencyObject)host.Content).Single(e => e.Name == "OmokBoard");
                Screenshot(host, transparent ? "-transparent" : "");
                var bounds = actions.TransformToAncestor(viewport).TransformBounds(new Rect(new Point(), actions.RenderSize));
                var boardBounds = board.TransformToAncestor(viewport).TransformBounds(new Rect(new Point(), board.RenderSize));
                Assert(bounds.Bottom <= viewport.ActualHeight + .5 && boardBounds.Right <= viewport.ActualWidth + .5,
                    $"기본 창 크기({(transparent ? "투명" : "일반")} 모드)에서 오목판과 버튼이 스크롤 없이 보임 · 아래 {bounds.Bottom:0} / 화면 {viewport.ActualHeight:0}");
            }
            Place(host, 14, 14); Place(guest, 7, 7);
            Assert(Room(host).Board[At(7, 7)] == OmokRules.White, "백은 흑 금수 자리에 둘 수 있음");
            Click(guest, "기권하기"); Layout(guest);
            Assert(Room(guest).Status == OmokStatus.Playing && Find<Button>((DependencyObject)guest.Content).Any(b => Label(b) == "정말 기권할까요?"), "기권은 한 번 더 눌러야 확정");
            Click(guest, "정말 기권할까요?");
            Wait(() => Idle() && Room(host).Status == OmokStatus.Finished && Room(guest).Status == OmokStatus.Finished);
            Assert(Room(host).Winners.SequenceEqual(["p0"]) && Find<TextBlock>((DependencyObject)host.Content).Any(t => t.Text == "이겼어요!"), "기권하면 상대 승리");
            Assert(new GameResultStore(root).Rankings(GameResultStore.Omok).First().UserId == "p0", "오목 승패를 랭킹에 기록");
            Click(host, "다시 하기"); Wait(Idle); Click(guest, "다시 하기");
            Wait(() => Idle() && Room(host).Status == OmokStatus.Playing && Room(guest).Status == OmokStatus.Playing);
            Assert(Room(host).CurrentPlayerId == "p1" && Points(guest).Count == OmokRules.Points && Points(host).Count == 0, "다음 판은 흑백을 바꿔 상대가 흑으로 먼저 둠");
            Place(guest, 7, 7);
            Screenshot(host, "-white");
            Click(host, "방 목록으로"); Wait(() => Equals(Get(host, "panel"), "omok-lobby"));
            Assert(store.Rooms().Single().Status == OmokStatus.Playing, "목록 이동 후 게임 보존");
            Set(host, "omokRoomId", id); Set(host, "omokRoom", store.Join(id, "p0")); Call(host, "ShowOmokRoom"); Layout(host);
            Click(host, "방 없애기");
            Wait(() => Idle() && Equals(Get(host, "panel"), "omok-lobby") && Equals(Get(guest, "panel"), "omok-lobby"));
            Assert(store.Rooms().Count == 0, "방장 삭제 시 두 화면 모두 목록 복귀");
            Set(host, "rankingGame", Enum.Parse(typeof(MainWindow).GetNestedType("RankingGame", BindingFlags.NonPublic)!, "Omok"));
            Call(host, "ShowRankings");
            Wait(() => Find<TextBlock>((DependencyObject)host.Content).Any(t => t.Text.StartsWith("내 순위  1위")));
            Assert(Find<Button>((DependencyObject)host.Content).Any(b => Label(b) == "오목" && b.Style == (Style)host.FindResource("Primary")), "랭킹 보기에 오목 탭");
        }
        finally
        {
            Call(host, "DetachOmokRoom"); Call(guest, "DetachOmokRoom");
            Directory.Delete(root, true);
        }
    }
}
