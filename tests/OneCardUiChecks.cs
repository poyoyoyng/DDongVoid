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

internal static class OneCardUiChecks
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
        var store = new OneCardStore(root); Directory.CreateDirectory(root);
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
        void Click(MainWindow w, string label) => Find<Button>((DependencyObject)w.Content).Single(b => Equals(b.Content, label)).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        foreach (var w in new[] { host, guest }) { Set(w, "store", new LocalStore(root)); Set(w, "userId", w == host ? "p0" : "p1"); }
        try
        {
            Call(host, "ShowGameList"); Layout(host);
            Assert(Find<TextBlock>((DependencyObject)host.Content).Any(t => t.Text == "원카드"), "게임 목록에 원카드 표시");
            var preferences = Get(host, "preferences")!;
            var transparentSetting = preferences.GetType().GetProperty("Transparent")!;
            var originalTransparent = (bool)transparentSetting.GetValue(preferences)!;
            foreach (var transparent in new[] { false, true })
            {
                transparentSetting.SetValue(preferences, transparent); Call(host, "ApplyAppearance");
                foreach (var size in transparent ? new[] { new Size(480, 740), new Size(300, 320) } : new[] { new Size(480, 740), new Size(480, 600) })
                {
                    Call(host, "ShowGameList"); Layout(host, size.Width, size.Height);
                    var list = Find<System.Windows.Controls.Primitives.UniformGrid>((DependencyObject)host.Content).Single(p => p.Name == "GameList");
                    var labels = list.Children.Cast<Button>().Select(b => ((TextBlock)b.Content).Text).ToArray();
                    Assert(labels.SequenceEqual(new[] { "똥 피하기", "맞짱", "차오차오", "원카드", "야추" }), "게임 목록 5개·키보드 리듬 제외");
                    var scroller = Find<ScrollViewer>((DependencyObject)host.Content).Single(s => ReferenceEquals(s.Content, host.FindName("DialogContent")));
                    var viewport = Find<ScrollContentPresenter>(scroller).First();
                    foreach (var button in list.Children.Cast<Button>())
                    {
                        var bounds = button.TransformToAncestor(viewport).TransformBounds(new Rect(new Point(), button.RenderSize));
                        Assert(bounds.Top >= -.5 && bounds.Bottom <= viewport.ActualHeight + .5 && bounds.Left >= -.5 && bounds.Right <= viewport.ActualWidth + .5,
                            $"{size.Width}×{size.Height}에서 {((TextBlock)button.Content).Text} 버튼 전체 표시");
                    }
                }
            }
            transparentSetting.SetValue(preferences, originalTransparent); Call(host, "ApplyAppearance"); Call(host, "ShowGameList"); Layout(host);
            var oneCard = Find<Button>((DependencyObject)host.Content).Single(b => b.Content is TextBlock t && t.Text == "원카드");
            oneCard.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Assert(Equals(Get(host, "panel"), "onecard-lobby"), "게임 목록에서 원카드 클릭으로 로비 진입");
            Layout(host); Click(host, "방 만들기"); Layout(host);
            var title = Find<TextBox>((DependencyObject)host.Content).Single(t => t.Name == "OneCardRoomTitle"); title.Text = "친구와 원카드";
            Click(host, "방 만들기"); Wait(() => Idle() && Equals(Get(host, "panel"), "onecard-room"));
            var id = ((OneCardRoom)Get(host, "oneCardRoom")!).Id;
            Call(guest, "ShowOneCardLobby"); Wait(() => Find<Button>((DependencyObject)guest.Content).Any(b => b.Tag is Guid g && g == id));
            Find<Button>((DependencyObject)guest.Content).Single(b => b.Tag is Guid g && g == id).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Wait(() => Idle() && Equals(Get(guest, "panel"), "onecard-room"));
            Click(host, "준비 완료"); Wait(Idle); Click(guest, "준비 완료");
            Wait(() => Idle() && Get(host, "oneCardRoom") is OneCardRoom { Status: OneCardStatus.Playing } && Get(guest, "oneCardRoom") is OneCardRoom { Status: OneCardStatus.Playing });
            Assert(((OneCardRoom)Get(host, "oneCardRoom")!).Find("p0")!.Hand.Count == 7 && ((OneCardRoom)Get(guest, "oneCardRoom")!).Find("p0")!.Hand.Count == 0,
                "실제 방 생성·참가·양쪽 준비·손패 비공개");
            Assert(!Find<Button>((DependencyObject)guest.Content).Any(b => Equals(b.Content, "방 없애기 (방장 전용)")), "참가자에게 방 삭제 버튼 숨김");
            Click(host, "카드 1장 받기 · 차례 넘기기");
            Wait(() => Idle() && ((OneCardRoom)Get(guest, "oneCardRoom")!).Turn == 2);
            Assert(((OneCardRoom)Get(host, "oneCardRoom")!).Find("p0")!.CardCount == 8, "카드 받기와 다음 턴 양쪽 동기화");
            Call(host, "DetachOneCardRoom"); Call(guest, "DetachOneCardRoom");

            OneCardRoom Fixture(bool seven = false)
            {
                var room = new OneCardRoom { Id = id, Title = "친구와 원카드", Status = OneCardStatus.Playing, ActiveSuit = CardSuit.Spade, DiscardPile = [4],
                    Players = [new() { Id = "p0", Hand = seven ? [6, 8] : [5, 8], CardCount = 2 }, new() { Id = "p1", Hand = [18, 20], CardCount = 2 },
                        new() { Id = "p2", Hand = [31, 30], CardCount = 2 }, new() { Id = "p3", Hand = [44, 43], CardCount = 2 }] };
                room.DrawPile = Enumerable.Range(0, OneCardRules.DeckSize).Except(room.Players.SelectMany(p => p.Hand).Concat(room.DiscardPile)).ToList();
                if (!seven) room.Play("p0", 0, 5);
                return room;
            }
            void Show(OneCardRoom room)
            {
                File.WriteAllText(store.FilePath, JsonSerializer.Serialize(new OneCardDatabase { Rooms = [room] }));
                foreach (var w in new[] { host, guest })
                {
                    Set(w, "oneCardRoomId", id); Set(w, "oneCardRoom", room.ViewFor(w == host ? "p0" : "p1")); Call(w, "ShowOneCardRoom"); Layout(w);
                }
            }
            Show(Fixture(true));
            var seven = Find<Button>((DependencyObject)host.Content).Single(b => b.Tag is int c && c == 6);
            Assert(seven.IsEnabled, "낼 수 있는 7 카드 활성화");
            seven.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            var suitMenu = seven.ContextMenu!;
            Assert(suitMenu.IsOpen && suitMenu.Items.Cast<MenuItem>().Select(m => (CardSuit)m.Tag).SequenceEqual(Enum.GetValues<CardSuit>()),
                "7 클릭 시 네 가지 무늬 선택지 표시");
            Assert(store.Rooms("p0").Single().TopCard == 4, "무늬 선택 전에는 7을 내지 않음");
            suitMenu.IsOpen = false;
            Assert(store.Rooms("p0").Single().Find("p0")!.CardCount == 2, "무늬 선택 취소 시 손패 유지");
            seven.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            suitMenu.Items.Cast<MenuItem>().Single(m => (CardSuit)m.Tag == CardSuit.Heart).RaiseEvent(new RoutedEventArgs(MenuItem.ClickEvent));
            // The button is rebuilt on every redraw, so look it up again each time.
            Button? CallButton(MainWindow w) => Find<Button>((DependencyObject)w.Content).SingleOrDefault(b => b.Name == "OneCardCallButton");
            Border Bubble(MainWindow w) => (Border)w.FindName("OneCardCallout");
            int Cards(MainWindow w, string player) => ((OneCardRoom)Get(w, "oneCardRoom")!).Find(player)!.CardCount;
            Wait(() => Idle() && ((OneCardRoom)Get(guest, "oneCardRoom")!).ActiveSuit == CardSuit.Heart);
            Assert(Cards(host, "p0") == 1 && !suitMenu.IsOpen, "무늬 선택 시 7 제출·무늬 변경·다음 턴 양쪽 반영");
            Assert(CallButton(host) is { IsEnabled: true } && CallButton(guest) is { IsEnabled: true } && Bubble(host).Visibility == Visibility.Collapsed,
                "원카드 버튼은 항상 활성화·누르기 전에는 가운데 말풍선 없음");
            var draw = Find<Button>((DependencyObject)guest.Content).Single(b => Equals(b.Content, "카드 1장 받기 · 차례 넘기기"));
            var callButton = CallButton(guest)!;
            Assert(callButton.Parent == draw.Parent && ((Panel)draw.Parent).Children.IndexOf(callButton) == ((Panel)draw.Parent).Children.IndexOf(draw) + 1
                && callButton.TransformToAncestor((Visual)guest.Content).Transform(new Point()).Y > draw.TransformToAncestor((Visual)guest.Content).Transform(new Point()).Y,
                "원카드 버튼을 카드 받기 버튼 바로 아래에 표시");
            Call(host, "DetachOneCardRoom"); Call(guest, "DetachOneCardRoom");
            Show(Fixture());
            if (args.Length == 1)
            {
                var body = (FrameworkElement)guest.Content; var bitmap = new RenderTargetBitmap(480, 740, 96, 96, PixelFormats.Pbgra32); bitmap.Render(body);
                var png = new PngBitmapEncoder(); png.Frames.Add(BitmapFrame.Create(bitmap)); using var file = File.Create(Path.GetFullPath(args[0])); png.Save(file);
            }
            Layout(guest, 360, 640); Assert(CallButton(guest)!.ActualWidth > 0, "좁은 창에서 원카드 버튼 표시"); Layout(guest);
            Click(guest, "원카드!"); var pressedAt = DateTimeOffset.UtcNow;
            Assert(CallButton(guest) is { IsEnabled: false }, "누른 사람 버튼은 바로 비활성화");
            Wait(() => Idle() && Cards(host, "p0") == 2 && Cards(guest, "p0") == 2);
            Assert(Cards(guest, "p1") == 2 && CallButton(host) is { IsEnabled: true }, "선언 안 한 사람을 남이 먼저 누르면 그 사람만 벌칙 1장·다른 사람 버튼은 유지");
            var bubbleShown = new Dictionary<MainWindow, DateTimeOffset>();
            Wait(() =>
            {
                foreach (var w in new[] { host, guest }) if (Bubble(w).Visibility == Visibility.Visible) bubbleShown.TryAdd(w, DateTimeOffset.UtcNow);
                return bubbleShown.Count == 2;
            });
            Assert(Find<TextBlock>(Bubble(host)).Any(t => t.Text == "원카드!"), "누가 누르면 본인·상대 화면에 원카드! 말풍선 표시");
            Assert(Find<TextBlock>(Bubble(host)).Any(t => t.Text == "p1") && Find<TextBlock>(Bubble(guest)).Any(t => t.Text == "p1 (나)"), "말풍선에 누른 사람 표시 · 본인 화면은 (나)");
            Wait(() => Bubble(host).Visibility == Visibility.Collapsed && Bubble(guest).Visibility == Visibility.Collapsed);
            Assert(bubbleShown.Values.All(t => DateTimeOffset.UtcNow - t is var shownFor && shownFor >= TimeSpan.FromSeconds(.4) && shownFor < TimeSpan.FromSeconds(1)),
                "원카드! 말풍선은 0.5초 정도 뒤 사라짐");
            Click(guest, "원카드!"); Wait(Idle);
            Assert(DateTimeOffset.UtcNow - pressedAt < TimeSpan.FromSeconds(1) && store.Rooms("p1").Single().Find("p1")!.CardCount == 2, "누른 사람은 1초 동안 다시 누를 수 없음");
            Wait(() => CallButton(guest)?.IsEnabled == true);
            Assert(DateTimeOffset.UtcNow - pressedAt is var cooldown && cooldown >= TimeSpan.FromSeconds(.9) && cooldown < TimeSpan.FromSeconds(1.6), "1초 뒤 원카드 버튼 다시 활성화");
            Click(guest, "원카드!");
            Wait(() => Idle() && Cards(host, "p1") == 3 && Cards(guest, "p1") == 3);
            Assert(Cards(guest, "p0") == 2, "원카드인 사람이 없을 때 누르면 누른 사람이 벌칙 1장");
            Call(host, "DetachOneCardRoom"); Call(guest, "DetachOneCardRoom"); Show(Fixture());
            Assert(Bubble(host).Visibility == Visibility.Collapsed, "방에 들어올 때 지난 원카드 말풍선은 띄우지 않음");
            Click(host, "원카드!"); Wait(() => Idle() && ((OneCardRoom)Get(guest, "oneCardRoom")!).VulnerablePlayerId is null);
            Assert(((OneCardRoom)Get(host, "oneCardRoom")!).Find("p0")!.CardCount == 1, "본인 선클릭 시 벌칙 없이 원카드 선언");
            Call(host, "DetachOneCardRoom"); Call(guest, "DetachOneCardRoom"); Show(Fixture());
            Call(host, "ShowSettings"); Layout(host); Assert(CallButton(host) is null, "설정 화면에서는 원카드 버튼 숨김");
            Call(host, "ReturnToGame"); Layout(host); Wait(() => CallButton(host)?.IsEnabled == true);
            Assert(CallButton(host) is { IsEnabled: true }, "게임 복귀 시 원카드 버튼 다시 표시·누른 뒤 대기가 끝나면 활성화");
            Click(host, "방 목록으로 · 게임 유지"); Wait(() => Equals(Get(host, "panel"), "onecard-lobby"));
            Assert(store.Rooms("p0").Single().Status == OneCardStatus.Playing, "목록 이동 후 게임 보존");
            var latest = store.Join(id, "p0"); Set(host, "oneCardRoomId", id); Set(host, "oneCardRoom", latest); Call(host, "ShowOneCardRoom"); Layout(host);
            Click(host, "방 없애기 (방장 전용)");
            Wait(() => Idle() && Equals(Get(host, "panel"), "onecard-lobby") && Equals(Get(guest, "panel"), "onecard-lobby"));
            Assert(store.Rooms("p0").Count == 0, "방장 삭제 시 두 화면 모두 목록 복귀");
        }
        finally
        {
            Call(host, "DetachOneCardRoom"); Call(guest, "DetachOneCardRoom");
            Directory.Delete(root, true);
        }
    }
}
