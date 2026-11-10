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

internal static class YachtUiChecks
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
        var store = new YachtStore(root); Directory.CreateDirectory(root);
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
        YachtRoom Room(MainWindow w) => (YachtRoom)Get(w, "yachtRoom")!;
        Button Named(MainWindow w, string name) => Find<Button>((DependencyObject)w.Content).Single(b => b.Name == name);
        void Press(Button button) => button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        void Click(MainWindow w, string label) => Press(Find<Button>((DependencyObject)w.Content).Single(b => Equals(b.Content, label)));
        List<Button> Dice(MainWindow w) => Find<Button>((DependencyObject)w.Content).Where(b => b.Tag is int && b.Parent is System.Windows.Controls.Primitives.UniformGrid { Name: "YachtDice" }).ToList();
        foreach (var w in new[] { host, guest }) { Set(w, "store", new LocalStore(root)); Set(w, "userId", w == host ? "p0" : "p1"); }
        try
        {
            Call(host, "ShowGameList"); Layout(host);
            var list = Find<System.Windows.Controls.Primitives.UniformGrid>((DependencyObject)host.Content).Single(p => p.Name == "GameList");
            Assert(list.Children.Cast<Button>().Select(b => ((TextBlock)b.Content).Text).Last() == "야추", "게임 목록에 야추 표시");
            Press(list.Children.Cast<Button>().Last());
            Assert(Equals(Get(host, "panel"), "yacht-lobby"), "게임 목록에서 야추 클릭으로 로비 진입");
            Layout(host); Click(host, "방 만들기"); Layout(host);
            Find<TextBox>((DependencyObject)host.Content).Single(t => t.Name == "YachtRoomTitle").Text = "둘이서 야추";
            Click(host, "방 만들기"); Wait(() => Idle() && Equals(Get(host, "panel"), "yacht-room"));
            var id = Room(host).Id;
            Click(host, "준비 완료"); Wait(Idle);
            Assert(Room(host).Status == YachtStatus.Waiting, "혼자 준비하면 시작하지 않고 상대를 기다림");
            Call(guest, "ShowYachtLobby"); Wait(() => Find<Button>((DependencyObject)guest.Content).Any(b => b.Tag is Guid g && g == id));
            Press(Find<Button>((DependencyObject)guest.Content).Single(b => b.Tag is Guid g && g == id));
            Wait(() => Idle() && Equals(Get(guest, "panel"), "yacht-room"));
            Click(guest, "준비 완료");
            Wait(() => Idle() && Room(host).Status == YachtStatus.Playing && Room(guest).Status == YachtStatus.Playing);
            Assert(Named(host, "YachtRollButton").IsEnabled && !Named(guest, "YachtRollButton").IsEnabled, "방장부터 시작·상대 화면 굴리기 비활성화");
            Assert(Dice(host).All(d => !d.IsEnabled), "굴리기 전에는 주사위 고정 불가");
            Press(Named(host, "YachtRollButton"));
            Wait(() => Idle() && Room(guest).RollsUsed == 1);
            Assert(Room(guest).Dice.SequenceEqual(Room(host).Dice) && Room(host).Dice.All(d => d is >= 1 and <= 6), "굴린 주사위가 양쪽 화면에 동일하게 표시");
            var kept = Room(host).Dice[0];
            Assert(Dice(host).All(d => d.IsEnabled) && Dice(guest).All(d => !d.IsEnabled), "내 차례에만 주사위 고정 가능");
            Press(Dice(host)[0]); Layout(host);
            Assert(Find<TextBlock>(Dice(host)[0]).Any(t => t.Text == "고정"), "누른 주사위에 고정 표시");
            Press(Named(host, "YachtRollButton"));
            Wait(() => Idle() && Room(guest).RollsUsed == 2);
            Assert(Room(host).Dice[0] == kept && Room(host).Held[0], "고정한 주사위는 다시 굴려도 유지");
            var choice = Room(host).Dice.Sum();
            Assert(Find<Button>((DependencyObject)guest.Content).All(b => !b.Name.StartsWith("YachtPick")), "상대 화면에는 점수 선택 칸 없음");
            Press(Named(host, "YachtPickChoice"));
            Wait(() => Idle() && Room(guest).CurrentPlayerId == "p1");
            Assert(Room(guest).Find("p0")!.Score(YachtCategory.Choice) == choice && Named(guest, "YachtRollButton").IsEnabled, "점수 기록 후 상대 차례로 넘어감");
            Call(host, "DetachYachtRoom"); Call(guest, "DetachYachtRoom");

            // A mid-game table: p0 one Fives away from the 63-point bonus, p1 already holding it.
            var fixture = new YachtRoom
            {
                Id = id, Title = "둘이서 야추", Status = YachtStatus.Playing, Round = 6, Revision = 40, RollsUsed = 1, RollCount = 30,
                Dice = [5, 5, 5, 2, 3], Held = [false, false, false, false, false],
                Players =
                [
                    new() { Id = "p0", Scores = [3, 6, 9, 12, null, 18, 22, null, null, null, null, null] },
                    new() { Id = "p1", Scores = [4, 8, 12, 12, 15, 18, null, 0, null, 15, null, 50] },
                ],
            };
            File.WriteAllText(store.FilePath, JsonSerializer.Serialize(new YachtDatabase { Rooms = [fixture] }));
            foreach (var w in new[] { host, guest }) { Set(w, "yachtRoomId", id); Set(w, "yachtRoom", fixture.Copy()); Call(w, "ShowYachtRoom"); Layout(w); }
            var fives = Named(host, "YachtPickFives");
            Assert(Find<TextBlock>(fives).Any(t => t.Text == "15★"), "보너스를 채우는 상단 칸은 ★로 미리 표시");
            Assert(Find<TextBlock>((DependencyObject)host.Content).Any(t => t.Text == "48/63") && Find<TextBlock>((DependencyObject)host.Content).Any(t => t.Text == "15점 남음"),
                "상단 소계와 보너스까지 남은 점수 표시");
            Assert(Find<TextBlock>((DependencyObject)host.Content).Any(t => t.Text == "+35"), "보너스를 얻은 상대는 +35 표시");
            var preferences = Get(host, "preferences")!;
            var transparentSetting = preferences.GetType().GetProperty("Transparent")!;
            var originalTransparent = (bool)transparentSetting.GetValue(preferences)!;
            foreach (var transparent in new[] { true, false })
            {
                transparentSetting.SetValue(preferences, transparent); Call(host, "ApplyAppearance"); Set(host, "yachtDrawn", null); Call(host, "DrawYachtRoom"); Layout(host);
                var scroller = Find<ScrollViewer>((DependencyObject)host.Content).Single(s => ReferenceEquals(s.Content, host.FindName("DialogContent")));
                var viewport = Find<ScrollContentPresenter>(scroller).First();
                var sheet = Find<Grid>((DependencyObject)host.Content).Single(g => g.Name == "YachtSheet");
                var bounds = sheet.TransformToAncestor(viewport).TransformBounds(new Rect(new Point(), sheet.RenderSize));
                Assert(bounds.Bottom <= viewport.ActualHeight + .5 && bounds.Right <= viewport.ActualWidth + .5,
                    $"기본 창 크기({(transparent ? "투명" : "일반")} 모드)에서 두 사람 점수판 전체가 스크롤 없이 보임 · 점수판 아래 {bounds.Bottom:0} / 화면 {viewport.ActualHeight:0}");
                if (args.Length == 1)
                {
                    var body = (FrameworkElement)host.Content; var bitmap = new RenderTargetBitmap(480, 740, 96, 96, PixelFormats.Pbgra32); bitmap.Render(body);
                    var png = new PngBitmapEncoder(); png.Frames.Add(BitmapFrame.Create(bitmap));
                    using var file = File.Create(Path.GetFullPath(args[0]).Replace(".png", transparent ? "-transparent.png" : ".png")); png.Save(file);
                }
            }
            transparentSetting.SetValue(preferences, originalTransparent); Call(host, "ApplyAppearance");
            Press(Named(host, "YachtPickFives"));
            Wait(() => Idle() && Room(guest).Find("p0")!.Bonus() == 35);
            Assert(Room(guest).LastMessage!.Contains("보너스 +35"), "보너스 달성을 양쪽 화면에 알림");
            Click(host, "방 목록으로 · 게임 유지"); Wait(() => Equals(Get(host, "panel"), "yacht-lobby"));
            Assert(store.Rooms().Single().Status == YachtStatus.Playing, "목록 이동 후 게임 보존");
            Set(host, "yachtRoomId", id); Set(host, "yachtRoom", store.Join(id, "p0")); Call(host, "ShowYachtRoom"); Layout(host);
            Click(host, "방 없애기 (방장 전용)");
            Wait(() => Idle() && Equals(Get(host, "panel"), "yacht-lobby") && Equals(Get(guest, "panel"), "yacht-lobby"));
            Assert(store.Rooms().Count == 0, "방장 삭제 시 두 화면 모두 목록 복귀");
        }
        finally
        {
            Call(host, "DetachYachtRoom"); Call(guest, "DetachYachtRoom");
            Directory.Delete(root, true);
        }
    }
}
