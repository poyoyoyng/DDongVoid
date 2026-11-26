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

internal static class JeungYutUiChecks
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
        var store = new JeungYutStore(root); Directory.CreateDirectory(root);
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
        JeungYutRoom Room(MainWindow w) => (JeungYutRoom)Get(w, "yutRoom")!;
        string Label(Button b) => b.Content is TextBlock t ? t.Text : b.Content as string ?? "";
        List<Button> Buttons(MainWindow w) => [.. Find<Button>((DependencyObject)w.Content)];
        void Press(Button button) => button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        void Click(MainWindow w, string label) => Press(Buttons(w).Single(b => Label(b) == label));
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
            var item = list.Children.Cast<Button>().SingleOrDefault(b => ((TextBlock)b.Content).Text == "증강윷놀이");
            Assert(item is not null, "게임 목록에 증강윷놀이 표시");
            Press(item!);
            Assert(Equals(Get(host, "panel"), "jeungyut-lobby"), "게임 목록에서 증강윷놀이 클릭으로 로비 진입");
            Layout(host); Click(host, "방 만들기"); Layout(host);
            Find<TextBox>((DependencyObject)host.Content).Single(t => t.Name == "YutRoomTitle").Text = "둘이서 윷";
            Click(host, "방 만들기"); Wait(() => Idle() && Equals(Get(host, "panel"), "jeungyut-room"));
            var id = Room(host).Id;
            Click(host, "준비 완료"); Wait(Idle);
            Assert(Room(host).Status == JeungYutStatus.Waiting, "혼자 준비하면 시작하지 않고 다른 참가자를 기다림");
            Call(guest, "ShowYutLobby"); Wait(() => Buttons(guest).Any(b => b.Tag is Guid g && g == id));
            Press(Buttons(guest).Single(b => b.Tag is Guid g && g == id));
            Wait(() => Idle() && Equals(Get(guest, "panel"), "jeungyut-room"));
            Click(guest, "준비 완료");
            Wait(() => Idle() && Room(host).Status == JeungYutStatus.Playing && Room(guest).Status == JeungYutStatus.Playing);
            MainWindow Current() => Room(host).CurrentPlayerId == "p0" ? host : guest;
            MainWindow Other() => Current() == host ? guest : host;
            Assert(Buttons(Other()).All(b => Label(b) != "윷 던지기  ↗") && Buttons(Current()).Any(b => Label(b) == "윷 던지기  ↗"), "차례인 사람에게만 던지기 버튼 표시");
            bool Animating(MainWindow w) => (bool)typeof(MainWindow).GetProperty("YutAnimating", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(w)!;
            bool Stage(MainWindow w) => Find<FrameworkElement>((DependencyObject)w.Content).Any(e => e.Name == "YutThrowStage");
            bool Hopping(MainWindow w) => Get(w, "yutMotion") is not null;
            var moved = false; bool sawStage = false, sawStageOther = false, sawHop = false;
            for (var step = 0; step < 8; step++)
            {
                Wait(() => !Animating(host) && !Animating(guest));
                var w = Current(); Set(w, "yutDrawn", null); Call(w, "DrawYutRoom"); Layout(w);
                var game = Room(w).Game!; var buttons = Buttons(w);
                var button = game.Phase == JeungYut.Augment ? buttons.First(b => b.Tag is string tag && tag.StartsWith("augment:"))
                    : game.Phase == JeungYut.FlickPhase ? buttons.Single(b => Label(b) == "이번 알까기 넘기기")
                    : game.Throws > 0 ? buttons.Single(b => Label(b) == "윷 던지기  ↗")
                    : buttons.First(b => b.Tag is JeungYutMove);
                moved |= button.Tag is JeungYutMove;
                var revision = Room(w).Revision;
                var other = w == host ? guest : host;
                Press(button);
                Wait(() => Idle() && Room(host).Revision > revision && Room(guest).Revision > revision);
                if (Label(button) == "윷 던지기  ↗")
                {
                    if (!sawStage && Stage(w)) Screenshot(w, "-throw");
                    sawStage |= Animating(w) && Stage(w) && Buttons(w).All(b => Label(b) != "윷 던지기  ↗");
                    Wait(() => Animating(other) || Room(other).Game!.LastRoll is null); Layout(other); sawStageOther |= Stage(other);
                }
                if (button.Tag is JeungYutMove) sawHop |= Hopping(w);
            }
            Wait(() => !Animating(host) && !Animating(guest) && !Hopping(host) && !Hopping(guest));
            Assert(sawStage && sawStageOther, "윷을 던지면 두 화면 모두 던지기 애니메이션을 보여 주고 그동안 버튼을 숨김");
            Assert(sawHop, "말을 옮기면 칸을 따라 이동하는 애니메이션");
            Assert(moved && Room(host).Revision == Room(guest).Revision && Room(host).Game!.Log.SequenceEqual(Room(guest).Game!.Log), "던지기·이동이 두 화면에 같은 판으로 갱신");
            var onBoard = Room(host).Game!.Players.SelectMany(p => p.Tokens).Count(t => JeungYut.OnBoard(JeungYut.Position(t)));
            Set(host, "yutDrawn", null); Call(host, "DrawYutRoom"); Layout(host);
            Assert(Find<Grid>((DependencyObject)host.Content).Count(g => g.Tag is string tag && tag.StartsWith("piece:")) > 0 == onBoard > 0, "판 위의 말을 말판에 표시");
            foreach (var transparent in new[] { true, false })
            {
                var preferences = Get(host, "preferences")!;
                preferences.GetType().GetProperty("Transparent")!.SetValue(preferences, transparent); Call(host, "ApplyAppearance");
                Set(host, "yutDrawn", null); Call(host, "DrawYutRoom"); Layout(host);
                var scroller = Find<ScrollViewer>((DependencyObject)host.Content).Single(s => ReferenceEquals(s.Content, host.FindName("DialogContent")));
                var viewport = Find<ScrollContentPresenter>(scroller).First();
                var board = Find<FrameworkElement>((DependencyObject)host.Content).Single(e => e.Name == "YutBoard");
                var boardBounds = board.TransformToAncestor(viewport).TransformBounds(new Rect(new Point(), board.RenderSize));
                Screenshot(host, transparent ? "-transparent" : "");
                Assert(boardBounds.Right <= viewport.ActualWidth + .5 && boardBounds.Bottom <= viewport.ActualHeight + .5,
                    $"기본 창 크기({(transparent ? "투명" : "일반")} 모드)에서 말판이 가로·세로로 잘리지 않음");
            }
            var between = typeof(MainWindow).GetMethod("YutMotionBetween", BindingFlags.Static | BindingFlags.NonPublic)!;
            var before = JeungYut.Create(["p0", "p1"], true, () => 0); var after = JsonSerializer.Deserialize<JeungYutState>(JsonSerializer.Serialize(before))!;
            before.Players[0].Tokens[0].Path = ["o1", "o2"]; before.Players[0].Tokens[1].Path = ["o1", "o2"]; before.Players[1].Tokens[0].Path = ["o1", "o2", "o3", "o4"];
            after.Players[0].Tokens[0].Path = ["o1", "o2", "o3", "o4"]; after.Players[0].Tokens[1].Path = ["o1", "o2", "o3", "o4"];
            var motion = between.Invoke(null, [before, after, 0.0])!;
            var hops = (System.Collections.IList)motion.GetType().GetProperty("Hops")!.GetValue(motion)!; var fades = (System.Collections.IList)motion.GetType().GetProperty("Fades")!.GetValue(motion)!;
            Assert(hops.Count == 1 && hops[0]!.ToString()!.Contains("×2") && fades.Count == 1, "업힌 두 말은 한 묶음으로 칸을 따라 이동하고 잡힌 말은 사라지는 애니메이션");
            var shotRoom = Room(host).Copy(); var shotGame = shotRoom.Game!; var shooter = shotGame.Active; var target = 1 - shooter;
            shotGame.Players[shooter].Tokens[0].Path = ["o1"]; shotGame.Revision += 1000;
            shotGame.Flick = new() { Id = shotGame.Revision, Owner = shooter, FromX = 560, FromY = 464, ToX = 560, ToY = 222, Hit = "o4", SourceNode = "o1",
                SourceTokens = [0], Victim = target, VictimTokens = [0], Outcome = "hit" };
            Set(host, "yutRoom", shotRoom); Set(host, "yutDrawn", null); Call(host, "DrawYutRoom"); Layout(host);
            Assert(Animating(host) && Find<TextBlock>((DependencyObject)host.Content).Any(t => t.Text == "제대로 맞았다!"), "알까기 명중은 비행 애니메이션과 결과를 보여 줌");
            Wait(() => !Animating(host));
            Set(host, "yutRoom", store.Join(id, "p0")); Set(host, "yutPreviousGame", Room(host).Game); Set(host, "yutDrawn", null); Call(host, "DrawYutRoom");
            Click(guest, "기권하기"); Layout(guest);
            Assert(Room(guest).Status == JeungYutStatus.Playing && Buttons(guest).Any(b => Label(b) == "정말 기권할까요?"), "기권은 한 번 더 눌러야 확정");
            Click(guest, "정말 기권할까요?");
            Wait(() => Idle() && Room(host).Status == JeungYutStatus.Finished && Room(guest).Status == JeungYutStatus.Finished);
            Assert(Room(host).Winners.SequenceEqual(["p0"]) && Find<TextBlock>((DependencyObject)host.Content).Any(t => t.Text == "이겼어요!"), "2인전 기권하면 상대 승리");
            Assert(new GameResultStore(root).Rankings(GameResultStore.JeungYut).First().UserId == "p0", "증강윷놀이 승패를 랭킹에 기록");
            Click(host, "다시 하기"); Wait(Idle); Click(guest, "다시 하기");
            Wait(() => Idle() && Room(host).Status == JeungYutStatus.Playing && Room(guest).Status == JeungYutStatus.Playing && Room(host).Game!.Revision == 0);
            Assert(Room(host).Game!.Players.All(p => p.Tokens.All(t => JeungYut.Position(t) == JeungYut.Home)), "다시 하기로 새 판 시작");
            Click(host, "방 목록으로"); Wait(() => Equals(Get(host, "panel"), "jeungyut-lobby"));
            Assert(store.Rooms().Single().Status == JeungYutStatus.Playing, "목록 이동 후 게임 보존");
            Set(host, "yutRoomId", id); Set(host, "yutRoom", store.Join(id, "p0")); Call(host, "ShowYutRoom"); Layout(host);
            Click(host, "방 없애기");
            Wait(() => Idle() && Equals(Get(host, "panel"), "jeungyut-lobby") && Equals(Get(guest, "panel"), "jeungyut-lobby"));
            Assert(store.Rooms().Count == 0, "방장 삭제 시 두 화면 모두 목록 복귀");
            Click(host, "규칙 · 증강 도감"); Layout(host);
            Assert(Equals(Get(host, "panel"), "jeungyut-guide") && JeungYut.Augments.All(a => Find<TextBlock>((DependencyObject)host.Content).Any(t => t.Text.EndsWith(a.Name))), "증강 도감에 17종 표시");
            Set(host, "rankingGame", Enum.Parse(typeof(MainWindow).GetNestedType("RankingGame", BindingFlags.NonPublic)!, "JeungYut"));
            Call(host, "ShowRankings");
            Wait(() => Find<TextBlock>((DependencyObject)host.Content).Any(t => t.Text.StartsWith("내 순위  1위")));
            Assert(Buttons(host).Any(b => Label(b) == "증강윷놀이" && b.Style == (Style)host.FindResource("Primary")), "랭킹 보기에 증강윷놀이 탭");
        }
        finally
        {
            Call(host, "DetachYutRoom"); Call(guest, "DetachYutRoom");
            Directory.Delete(root, true);
        }
    }
}
