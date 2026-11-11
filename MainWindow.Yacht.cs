using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using DDongVoid.Core;

namespace DDongVoid;

public partial class MainWindow
{
    private readonly DispatcherTimer yachtTimer = new(DispatcherPriority.Normal) { Interval = TimeSpan.FromSeconds(1) };
    private Guid? yachtRoomId;
    private YachtRoom? yachtRoom;
    private List<YachtRoom> yachtRooms = [];
    private string? yachtDrawn;
    private bool yachtTimerHooked, yachtSyncing;
    private int yachtStateVersion;
    private CancellationTokenSource? yachtSyncCancellation;
    private Task? yachtActivePoll;
    private string yachtSyncNote = "동기화 확인 중…";
    private TextBlock? yachtSyncStatus;
    // Dice kept for the next roll stay on this PC until the roll is sent; a new room revision reloads them.
    private bool[] yachtHeld = new bool[YachtRules.DiceCount];
    private (Guid Room, int Revision)? yachtHeldFor;
    // The room's roll count last drawn here: a higher count means a roll to animate.
    private (Guid Room, int Rolls)? yachtSeenRolls;
    private int yachtRollVersion;
    private static readonly string[] YachtInk = ["#A7F3CE", "#F4C59D"];
    private static readonly (int Row, int Column)[][] YachtPips =
    [
        [], [(1, 1)], [(0, 2), (2, 0)], [(0, 2), (1, 1), (2, 0)], [(0, 0), (0, 2), (2, 0), (2, 2)],
        [(0, 0), (0, 2), (1, 1), (2, 0), (2, 2)], [(0, 0), (0, 2), (1, 0), (1, 2), (2, 0), (2, 2)],
    ];
    private static readonly ControlTemplate YachtPlainButton = new(typeof(Button)) { VisualTree = new FrameworkElementFactory(typeof(ContentPresenter)) };
    private bool InYachtMatch => yachtRoom?.Status == YachtStatus.Playing;
    private YachtStore NewYachtStore() => new(store.Folder);

    private void StartYachtTimer()
    {
        if (!yachtTimerHooked) { yachtTimer.Tick += async (_, _) => await PollYachtAsync(); yachtTimerHooked = true; }
        UpdateYachtPollInterval(); yachtTimer.Start();
    }
    private void UpdateYachtPollInterval()
    {
        var interval = InYachtMatch ? YachtRules.MatchPollInterval : TimeSpan.FromSeconds(1);
        if (yachtTimer.Interval != interval) yachtTimer.Interval = interval;
    }
    private void DetachYachtRoom()
    {
        yachtTimer.Stop(); yachtSyncCancellation?.Cancel(); yachtStateVersion++; yachtRollVersion++;
        yachtRoomId = null; yachtRoom = null; yachtDrawn = null; yachtSyncStatus = null;
        yachtHeldFor = null; yachtSeenRolls = null;
    }
    private void ShowYachtLobby()
    {
        if (!RequireLogin()) return;
        DetachSlapRoom(); DetachCiaoRoom(); DetachOneCardRoom(); DetachYachtRoom();
        DrawYachtLobby(); StartYachtTimer(); _ = PollYachtAsync();
    }
    private void DrawYachtLobby()
    {
        var signature = "lobby|" + userId + "|" + JsonSerializer.Serialize(yachtRooms);
        if (panel == "yacht-lobby" && yachtDrawn == signature) return;
        yachtDrawn = signature;
        BeginPanel("yacht-lobby", "야추 · 2인", "야추", "");
        AddYachtSyncControls();
        AddButton("방 만들기", CreateYachtRoom, true);
        var mine = yachtRooms.Where(r => r.Find(userId!) is not null).OrderByDescending(r => r.CreatedAt).ToList();
        var others = yachtRooms.Where(r => r.Find(userId!) is null).OrderByDescending(r => r.CreatedAt).ToList();
        AddText($"내가 참가한 방 · {mine.Count}개", 13, "#A7F3CE", 12, 6, true);
        if (mine.Count == 0) AddText("참가 중인 방이 없어요.", 11, "#91AB9C", 0, 6);
        foreach (var room in mine) AddYachtRoomEntry(room);
        AddText($"다른 방 · {others.Count}개", 13, "#A7F3CE", 12, 6, true);
        foreach (var room in others) AddYachtRoomEntry(room);
        AddButton("돌아가기", () => { DetachYachtRoom(); ShowGameList(); });
    }
    private void AddYachtRoomEntry(YachtRoom room)
    {
        var me = room.Find(userId!);
        var state = room.Status switch
        {
            YachtStatus.Playing => me is null ? "게임 중" : $"ROUND {room.Round} · 이어하기",
            YachtStatus.Finished => "결과 보기",
            _ => me is not null ? (me.Ready ? "준비 완료 · 상대 대기" : "준비 대기 · 이어하기")
                : room.Players.Count >= YachtRules.Players ? "가득 참" : "참가 가능",
        };
        var players = string.Join(" vs ", room.Players.Select(p => p.Id));
        var button = AddButton($"{room.Title}   ·   {room.Players.Count}/{YachtRules.Players}\n{players}\n{state}",
            () => _ = RunYachtAsync((s, id) => s.Join(room.Id, id)));
        button.Tag = room.Id;
        button.IsEnabled = me is not null || state == "참가 가능";
        button.Content = new TextBlock { Text = (string)button.Content, TextWrapping = TextWrapping.Wrap };
    }
    private void CreateYachtRoom()
    {
        if (!RequireLogin()) return;
        DetachYachtRoom();
        BeginPanel("yacht-create", "야추 · 2인", "방 만들기", "방 목록에 표시할 제목을 입력해 주세요.");
        AddText($"방 제목 · 최대 {YachtRules.MaxTitleLength}자", 12, "#B6C7BC", 0, 6);
        var title = new TextBox { Name = "YachtRoomTitle", MaxLength = YachtRules.MaxTitleLength, Margin = new Thickness(0, 0, 0, 12) };
        System.Windows.Automation.AutomationProperties.SetName(title, "방 제목"); DialogContent.Children.Add(title);
        AddButton("방 만들기", () =>
        {
            var input = title.Text;
            _ = RunYachtAsync((s, id) => s.Create(id, input));
        }, true);
        AddButton("취소", ShowYachtLobby); title.Focus();
    }
    private async Task RunYachtAsync(Func<YachtStore, string, YachtRoom?> action)
    {
        if (busy || userId is null) return;
        var yachtStore = NewYachtStore(); var me = userId;
        var previousId = yachtRoomId;
        var version = ++yachtStateVersion;
        yachtSyncCancellation?.Cancel();
        busy = true;
        var refresh = false;
        try
        {
            var room = await RunOnShare(() => action(yachtStore, me));
            if (version != yachtStateVersion || userId != me || store.Folder != yachtStore.Folder) return;
            yachtRoom = room; yachtRoomId = room?.Id;
            if (room is null)
            {
                yachtRooms.RemoveAll(r => r.Id == previousId); ShowYachtLobby(); return;
            }
            yachtRooms.RemoveAll(r => r.Id == room.Id); yachtRooms.Add(room);
            yachtDrawn = null; DrawYachtRoom(); StartYachtTimer(); refresh = true;
        }
        catch (Exception ex) when (IsUserError(ex))
        {
            if (version == yachtStateVersion && userId == me && store.Folder == yachtStore.Folder)
            {
                SetMessage(ShareErrorText(ex, "야추 동작")); refresh = true;
            }
        }
        finally { busy = false; }
        if (refresh && version == yachtStateVersion) await PollYachtAsync();
    }
    private void SetYachtSyncNote(string note)
    {
        yachtSyncNote = note;
        if (yachtSyncStatus is not null)
        {
            yachtSyncStatus.Text = note;
            yachtSyncStatus.ToolTip = YachtSyncDetails();
        }
    }
    private string YachtSyncDetails() => $"앱 버전: {UpdateService.CurrentVersion}\n저장 파일: {System.IO.Path.Combine(store.Folder, "ddongvoid-yacht.json")}"
        + (yachtRoom is { } room ? $"\n방 ID: {room.Id}\n방 수정 번호: {room.Revision}\n라운드: {room.Round}" : "");
    private void AddYachtSyncControls()
    {
        var row = new DockPanel { Margin = new Thickness(0, 0, 0, panel == "yacht-room" ? 6 : 10), ToolTip = store.Folder };
        var refresh = new Button { Content = "새로고침", Padding = new Thickness(9, 4, 9, 4), FontSize = 11 };
        refresh.Click += async (_, _) => await RefreshYachtAsync();
        DockPanel.SetDock(refresh, Dock.Right); row.Children.Add(refresh);
        yachtSyncStatus = new TextBlock { Name = "YachtSyncStatus", Text = yachtSyncNote, FontSize = 10,
            Foreground = Theme.Paint(Color.FromRgb(145, 171, 156)), VerticalAlignment = VerticalAlignment.Center,
            TextWrapping = TextWrapping.Wrap, ToolTip = YachtSyncDetails() };
        row.Children.Add(yachtSyncStatus); DialogContent.Children.Add(row);
    }
    private async Task RefreshYachtAsync()
    {
        if (busy || userId is null) return;
        var version = yachtStateVersion;
        var active = yachtActivePoll;
        yachtSyncCancellation?.Cancel();
        if (active is not null) await active;
        if (version != yachtStateVersion) return;
        // A manual refresh also rebuilds the controls when the file contents are unchanged.
        yachtDrawn = null;
        SetYachtSyncNote("다시 확인 중…");
        StartYachtTimer();
        await PollYachtAsync();
    }
    private Task PollYachtAsync()
    {
        if (busy || yachtSyncing || userId is null) return Task.CompletedTask;
        if (yachtRoomId is null && panel != "yacht-lobby") { yachtTimer.Stop(); return Task.CompletedTask; }
        return yachtActivePoll = PollYachtCoreAsync();
    }
    private async Task PollYachtCoreAsync()
    {
        var yachtStore = NewYachtStore(); var me = userId!; var roomId = yachtRoomId; var version = yachtStateVersion;
        using var cancellation = new CancellationTokenSource();
        yachtSyncCancellation = cancellation; yachtSyncing = true;
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(8));
            var readToken = deadline.Token;
            var snapshot = await Task.Run(() => yachtStore.SnapshotAsync(readToken), readToken).WaitAsync(readToken);
            if (version != yachtStateVersion || userId != me || store.Folder != yachtStore.Folder || roomId != yachtRoomId) return;
            var rooms = snapshot.Rooms;
            if (roomId is Guid id)
            {
                var room = rooms.FirstOrDefault(r => r.Id == id && r.Find(me) is not null);
                if (room is null)
                {
                    if (snapshot.DeletedRoomIds.Contains(id))
                    {
                        yachtRooms = rooms;
                        ShowYachtLobby();
                        SetMessage("방장이 방을 삭제했습니다. 방 목록으로 돌아왔습니다.");
                        return;
                    }
                    // Missing data is not proof of deletion: keep the last room until a
                    // snapshot includes it again or explicitly confirms its removal.
                    yachtDrawn = null;
                    SetYachtSyncNote("방 정보 재확인 중…");
                    if (panel == "yacht-room") SetMessage("방 정보를 확인하지 못했습니다. 현재 방을 유지하고 다시 확인합니다.");
                    return;
                }
                yachtRoom = room;
            }
            yachtRooms = rooms; UpdateYachtPollInterval(); SetYachtSyncNote($"자동 갱신 · {DateTime.Now:HH:mm:ss}");
            if (panel == "yacht-room") DrawYachtRoom();
            else if (panel == "yacht-lobby") DrawYachtLobby();
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch (Exception ex) when (IsUserError(ex) || ex is OperationCanceledException)
        {
            LogError("야추 조회", ex);
            if (version == yachtStateVersion && userId == me && store.Folder == yachtStore.Folder && panel.StartsWith("yacht"))
            {
                SetYachtSyncNote("조회 실패 · 자동 재시도 중");
                SetMessage("야추 정보를 불러오지 못했습니다. 공유 폴더 연결을 확인해 주세요."); yachtDrawn = null;
            }
        }
        finally
        {
            if (ReferenceEquals(yachtSyncCancellation, cancellation)) yachtSyncCancellation = null;
            yachtSyncing = false;
        }
    }
    private void ShowYachtRoom()
    {
        yachtDrawn = null; DrawYachtRoom(); StartYachtTimer(); _ = PollYachtAsync();
    }
    private void DrawYachtRoom()
    {
        if (yachtRoom is not { } room || userId is null || room.Find(userId) is not { } me) { ShowYachtLobby(); return; }
        if (yachtHeldFor != (room.Id, room.Revision))
        {
            yachtHeld = room.Held.Count == YachtRules.DiceCount ? [.. room.Held] : new bool[YachtRules.DiceCount];
            yachtHeldFor = (room.Id, room.Revision);
        }
        var signature = "room|" + userId + "|" + string.Join(",", yachtHeld) + "|" + JsonSerializer.Serialize(room);
        if (panel == "yacht-room" && yachtDrawn == signature) return;
        yachtDrawn = signature;
        var playing = room.Status == YachtStatus.Playing;
        var finished = room.Status == YachtStatus.Finished;
        var myTurn = room.CurrentPlayerId == userId;
        var title = finished ? room.Winners.Count > 1 ? "무승부!" : room.Winners.Contains(userId) ? "이겼어요!" : "아쉽게 졌어요"
            : !playing ? "준비되면 시작!"
            : !myTurn ? $"{room.CurrentPlayerId}님의 차례"
            : room.RollsUsed == 0 ? "내 차례 · 주사위를 굴리세요"
            : room.RollsLeft > 0 ? "내 차례 · 남길 주사위를 고르세요" : "내 차례 · 점수 칸을 고르세요";
        BeginPanel("yacht-room", $"야추 · {room.Title} · {(playing ? $"ROUND {room.Round} / {YachtRules.Categories}" : finished ? "GAME OVER" : "WAITING ROOM")}", title, "");
        AddYachtSyncControls();
        AddYachtVersus(room);
        var dice = new List<(Border Holder, int Index)>();
        if (playing || finished)
        {
            if (playing) dice = AddYachtTray(room, myTurn);
            if (room.LastMessage is { } last) AddText(last, 11, "#F4C59D", 0, 6);
            AddYachtSheet(room, myTurn);
        }
        if (!playing)
            AddButton(me.Ready ? "준비 취소" : finished ? "다시 하기 · 준비 완료" : "준비 완료",
                () => _ = RunYachtAsync((s, id) => s.SetReady(room.Id, id, !me.Ready)), !me.Ready);
        AddButton(playing ? "방 목록으로 · 게임 유지" : "방 목록으로 · 참가 유지", ShowYachtLobby);
        if (room.HostId == userId)
            AddButton("방 없애기 (방장 전용)", () => _ = RunYachtAsync((s, id) => { s.DeleteRoom(room.Id, id); return null; }));
        if (!playing) AddButton("방 나가기", () => _ = RunYachtAsync((s, id) => { s.Leave(room.Id, id); return null; }));
        AnimateYachtRoll(room, dice);
    }
    private static SolidColorBrush YachtBrush(string color) => Theme.Paint(color);
    // Two name plates side by side: the player to move is lit, totals are always visible.
    private void AddYachtVersus(YachtRoom room)
    {
        var versus = new Grid { Name = "YachtVersus", Margin = new Thickness(0, 0, 0, 6) };
        versus.ColumnDefinitions.Add(new ColumnDefinition());
        versus.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        versus.ColumnDefinitions.Add(new ColumnDefinition());
        for (var seat = 0; seat < YachtRules.Players; seat++)
        {
            var player = seat < room.Players.Count ? room.Players[seat] : null;
            var current = player is not null && player.Id == room.CurrentPlayerId;
            var winner = player is not null && room.Winners.Contains(player.Id);
            var plate = new StackPanel();
            plate.Children.Add(new TextBlock { Text = player is null ? "빈 자리" : $"{(current ? "▶ " : winner ? "★ " : "")}{player.Id}{(player.Id == userId ? " (나)" : "")}",
                FontSize = 12, FontWeight = FontWeights.Bold, TextTrimming = TextTrimming.CharacterEllipsis,
                Foreground = player is null ? YachtBrush("#6F8579") : YachtBrush(YachtInk[seat]) });
            plate.Children.Add(new TextBlock
            {
                Text = player is null ? "상대를 기다리는 중…" : room.Status == YachtStatus.Waiting ? player.Ready ? "준비 완료 ✓" : "준비 대기" : $"{player.Total()}점",
                FontSize = room.Status == YachtStatus.Waiting || player is null ? 12 : 20, FontWeight = FontWeights.Bold, FontFamily = new FontFamily("Consolas, Malgun Gothic"),
                Foreground = player is null ? YachtBrush("#6F8579") : Theme.Paint(Colors.White),
            });
            var card = new Border
            {
                Child = plate, CornerRadius = new CornerRadius(8), Padding = new Thickness(10, 5, 10, 5),
                Background = YachtBrush(current ? "#31583F" : "#0F1A16"), BorderThickness = new Thickness(current || winner ? 1.5 : 1),
                BorderBrush = current || winner ? YachtBrush(YachtInk[seat]) : YachtBrush("#2B3C32"),
            };
            Grid.SetColumn(card, seat * 2); versus.Children.Add(card);
        }
        var vs = new TextBlock { Text = "VS", FontSize = 12, FontWeight = FontWeights.Bold, Foreground = YachtBrush("#728F7D"),
            VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8, 0, 8, 0) };
        Grid.SetColumn(vs, 1); versus.Children.Add(vs);
        DialogContent.Children.Add(versus);
    }
    private static Border YachtDie(int value, bool held, double size = 40)
    {
        var pips = new Grid { Margin = new Thickness(size * .13) };
        for (var i = 0; i < 3; i++) { pips.RowDefinitions.Add(new RowDefinition()); pips.ColumnDefinitions.Add(new ColumnDefinition()); }
        if (value is >= 1 and <= 6)
            foreach (var (row, column) in YachtPips[value])
            {
                var dot = new Ellipse { Width = size * .18, Height = size * .18, Fill = YachtBrush(value == 1 ? "#C0392B" : "#1E2B25") };
                Grid.SetRow(dot, row); Grid.SetColumn(dot, column); pips.Children.Add(dot);
            }
        else
        {
            var unknown = new TextBlock { Text = "?", FontSize = size * .45, FontWeight = FontWeights.Bold, Foreground = YachtBrush("#728F7D"),
                HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            Grid.SetRowSpan(unknown, 3); Grid.SetColumnSpan(unknown, 3); pips.Children.Add(unknown);
        }
        return new Border
        {
            Width = size, Height = size, CornerRadius = new CornerRadius(size * .2), Child = pips,
            Background = YachtBrush(value == 0 ? "#22302A" : "#FBF7EC"),
            BorderBrush = YachtBrush(held ? "#A7F3CE" : value == 0 ? "#3B5044" : "#C9C2B0"), BorderThickness = new Thickness(held ? 3 : 1),
        };
    }
    // Five dice and the roll button share one row; a kept die is outlined and raised with a 고정 tag.
    private List<(Border Holder, int Index)> AddYachtTray(YachtRoom room, bool myTurn)
    {
        var canHold = myTurn && room.RollsUsed > 0 && room.RollsLeft > 0;
        var holders = new List<(Border, int)>();
        var row = new DockPanel { LastChildFill = true };
        var roll = new Button
        {
            Name = "YachtRollButton", Style = (Style)FindResource("Primary"), Width = 84, Padding = new Thickness(6, 6, 6, 6), Margin = new Thickness(8, 0, 0, 0),
            Content = new TextBlock { Text = $"{(room.RollsUsed == 0 ? "굴리기" : "다시 굴리기")}\n{room.RollsLeft}회 남음", TextAlignment = TextAlignment.Center, FontSize = 12 },
            IsEnabled = myTurn && room.RollsLeft > 0 && !(room.RollsUsed > 0 && yachtHeld.All(h => h)),
            ToolTip = room.RollsUsed == 0 ? "주사위 5개를 모두 굴립니다." : "고정하지 않은 주사위만 다시 굴립니다.",
        };
        System.Windows.Automation.AutomationProperties.SetName(roll, "주사위 굴리기");
        roll.Click += (_, _) =>
        {
            if (busy) return;
            var held = yachtHeld.ToArray();
            _ = RunYachtAsync((s, id) => s.Roll(room.Id, id, room.Revision, held));
        };
        DockPanel.SetDock(roll, Dock.Right); row.Children.Add(roll);
        var dice = new System.Windows.Controls.Primitives.UniformGrid { Columns = YachtRules.DiceCount, Name = "YachtDice" };
        for (var i = 0; i < YachtRules.DiceCount; i++)
        {
            var index = i; var value = room.Dice[i]; var held = room.RollsUsed > 0 && yachtHeld[i];
            var holder = new Border { Child = YachtDie(value, held), RenderTransformOrigin = new Point(.5, .5),
                RenderTransform = new TranslateTransform(0, held ? -4 : 0) };
            var face = new StackPanel();
            face.Children.Add(holder);
            face.Children.Add(new TextBlock { Text = held ? "고정" : " ", FontSize = 10, FontWeight = FontWeights.Bold, Foreground = YachtBrush("#A7F3CE"),
                HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, -1, 0, 0) });
            var die = new Button { Template = YachtPlainButton, Content = face, Tag = index, IsEnabled = canHold, Background = Brushes.Transparent,
                Cursor = canHold ? System.Windows.Input.Cursors.Hand : null, Margin = new Thickness(2, 0, 2, 0),
                ToolTip = canHold ? held ? "눌러서 고정 풀기" : "눌러서 고정" : null };
            System.Windows.Automation.AutomationProperties.SetName(die, $"주사위 {index + 1} · {(value == 0 ? "굴리기 전" : value.ToString())}{(held ? " · 고정" : "")}");
            die.Click += (_, _) =>
            {
                if (busy) return;
                yachtHeld[index] = !yachtHeld[index]; DrawYachtRoom();
            };
            dice.Children.Add(die); holders.Add((holder, index));
        }
        row.Children.Add(dice);
        DialogContent.Children.Add(new Border { Child = row, Background = YachtBrush("#0F1A16"), CornerRadius = new CornerRadius(10),
            Padding = new Thickness(8, 9, 8, 3), Margin = new Thickness(0, 0, 0, 6) });
        return holders;
    }
    // Rolled dice tumble briefly on every PC before settling on the faces read from the shared file.
    private void AnimateYachtRoll(YachtRoom room, List<(Border Holder, int Index)> dice)
    {
        var seen = yachtSeenRolls; yachtSeenRolls = (room.Id, room.RollCount);
        if (seen is not { } last || last.Room != room.Id || room.RollCount <= last.Rolls || room.RollsUsed == 0 || dice.Count == 0) return;
        var rolling = dice.Where(d => !room.Held[d.Index]).ToList();
        _ = TumbleYachtDiceAsync(rolling.Select(d => (d.Holder, room.Dice[d.Index])).ToList(), ++yachtRollVersion);
    }
    private async Task TumbleYachtDiceAsync(List<(Border Holder, int Value)> dice, int version)
    {
        for (var frame = 0; frame < 8 && version == yachtRollVersion; frame++)
        {
            foreach (var (holder, _) in dice)
            {
                holder.Child = YachtDie(Random.Shared.Next(1, 7), false);
                holder.RenderTransform = new RotateTransform(Random.Shared.Next(-25, 26));
            }
            await Task.Delay(55);
        }
        foreach (var (holder, value) in dice) { holder.Child = YachtDie(value, false); holder.RenderTransform = new TranslateTransform(); }
    }
    // Upper and lower sections sit side by side so both players' full sheets fit without scrolling.
    private void AddYachtSheet(YachtRoom room, bool myTurn)
    {
        var pick = myTurn && room.Status == YachtStatus.Playing && room.RollsUsed > 0;
        var sheet = new Grid { Name = "YachtSheet", Margin = new Thickness(0, 0, 0, 4) };
        sheet.ColumnDefinitions.Add(new ColumnDefinition());
        sheet.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
        sheet.ColumnDefinitions.Add(new ColumnDefinition());
        var upper = YachtTable(room, Enum.GetValues<YachtCategory>().Where(YachtRules.IsUpper), pick, true);
        var lower = YachtTable(room, Enum.GetValues<YachtCategory>().Where(c => !YachtRules.IsUpper(c)), pick, false);
        Grid.SetColumn(lower, 2); sheet.Children.Add(upper); sheet.Children.Add(lower);
        DialogContent.Children.Add(sheet);
    }
    private Border YachtTable(YachtRoom room, IEnumerable<YachtCategory> categories, bool pick, bool upper)
    {
        const double RowHeight = 20;
        var table = new Grid();
        table.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.5, GridUnitType.Star) });
        foreach (var _ in room.Players) table.ColumnDefinitions.Add(new ColumnDefinition());
        var rows = 0;
        void Row(double height = RowHeight)
        {
            table.RowDefinitions.Add(new RowDefinition { Height = new GridLength(height) });
            if (rows % 2 == 1)
            {
                var band = new Border { Background = YachtBrush("#0BFFFFFF") };
                Grid.SetRow(band, rows); Grid.SetColumnSpan(band, 1 + room.Players.Count); table.Children.Add(band);
            }
            rows++;
        }
        void Put(UIElement element, int column)
        {
            Grid.SetRow(element, rows - 1); Grid.SetColumn(element, column); table.Children.Add(element);
        }
        TextBlock Label(string text, string color = "#C9D6CF", bool bold = false) => new()
        {
            Text = text, FontSize = 11, Foreground = YachtBrush(color), FontWeight = bold ? FontWeights.Bold : FontWeights.Normal,
            VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 2, 0), TextTrimming = TextTrimming.CharacterEllipsis,
        };
        TextBlock Value(string text, string color, double size = 12) => new()
        {
            Text = text, FontSize = size, FontWeight = FontWeights.Bold, Foreground = YachtBrush(color), FontFamily = new FontFamily("Consolas, Malgun Gothic"),
            HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
        };
        Row();
        Put(Label(upper ? "상단" : "하단", "#728F7D", true), 0);
        for (var seat = 0; seat < room.Players.Count; seat++)
        {
            var p = room.Players[seat];
            var name = Value(p.Id == userId ? "나" : p.Id, YachtInk[seat], 11);
            name.TextTrimming = TextTrimming.CharacterEllipsis; name.MaxWidth = 60; name.ToolTip = p.Id;
            Put(name, seat + 1);
        }
        foreach (var category in categories)
        {
            Row();
            var label = Label(YachtRules.Name(category)); label.ToolTip = YachtRules.Hint(category); Put(label, 0);
            for (var seat = 0; seat < room.Players.Count; seat++) Put(YachtCell(room, room.Players[seat], category, pick), seat + 1);
        }
        if (upper)
        {
            Row(RowHeight + 3);
            Put(Label("소계", "#C9D6CF", true), 0);
            for (var seat = 0; seat < room.Players.Count; seat++)
            {
                var p = room.Players[seat]; var sum = p.UpperSum(); var done = p.Bonus() > 0;
                var cell = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(5, 0, 5, 0),
                    ToolTip = $"상단 {sum} / {YachtRules.BonusThreshold}점 · 눈마다 3개씩(63점) 기준 대비 {p.UpperPace():+0;-0;±0}" };
                cell.Children.Add(Value($"{sum}/{YachtRules.BonusThreshold}", done ? "#A7F3CE" : "#EDF4F0", 11));
                var bar = new Grid { Height = 3, Margin = new Thickness(0, 1, 0, 0) };
                bar.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Min(sum, YachtRules.BonusThreshold), GridUnitType.Star) });
                bar.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(Math.Max(0, YachtRules.BonusThreshold - sum), GridUnitType.Star) });
                var track = new Border { Background = YachtBrush("#2B3C32"), CornerRadius = new CornerRadius(1.5) }; Grid.SetColumnSpan(track, 2); bar.Children.Add(track);
                bar.Children.Add(new Border { Background = YachtBrush(done ? "#A7F3CE" : p.BonusLost() ? "#6F8579" : "#F4C59D"), CornerRadius = new CornerRadius(1.5) });
                cell.Children.Add(bar);
                Put(cell, seat + 1);
            }
            Row();
            Put(Label($"보너스 +{YachtRules.BonusScore}", "#A7F3CE", true), 0);
            for (var seat = 0; seat < room.Players.Count; seat++)
            {
                var p = room.Players[seat]; var need = YachtRules.BonusThreshold - p.UpperSum();
                var status = p.Bonus() > 0 ? Value($"+{YachtRules.BonusScore}", "#A7F3CE", 13)
                    : p.BonusLost() || p.UpperDone() ? Value("실패", "#6F8579", 10.5)
                    : Value($"{need}점 남음", "#F4C59D", 10.5);
                status.ToolTip = $"상단 소계 {YachtRules.BonusThreshold}점 이상이면 +{YachtRules.BonusScore}점 · 기준 대비 {p.UpperPace():+0;-0;±0}";
                Put(status, seat + 1);
            }
        }
        else
        {
            Row(RowHeight * 2 + 3);
            Put(Label("총점", "#EDF4F0", true), 0);
            for (var seat = 0; seat < room.Players.Count; seat++) Put(Value(room.Players[seat].Total().ToString(), YachtInk[seat], 20), seat + 1);
        }
        // The column of the player to move is tinted from top to bottom.
        if (room.Status == YachtStatus.Playing)
        {
            var tint = new Border { Background = YachtBrush("#2231583F"), BorderBrush = YachtBrush("#5531583F"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(4) };
            Grid.SetColumn(tint, room.CurrentIndex + 1); Grid.SetRowSpan(tint, rows); table.Children.Insert(0, tint);
        }
        return new Border { Child = table, Background = YachtBrush("#0F1A16"), CornerRadius = new CornerRadius(8), Padding = new Thickness(0, 2, 0, 2) };
    }
    private UIElement YachtCell(YachtRoom room, YachtPlayer player, YachtCategory category, bool pick)
    {
        if (player.Score(category) is int score)
            return new TextBlock { Text = score.ToString(), FontSize = 12, FontWeight = FontWeights.Bold, FontFamily = new FontFamily("Consolas, Malgun Gothic"),
                Foreground = YachtBrush(score == 0 ? "#6F8579" : "#EDF4F0"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        if (!pick || player.Id != userId)
            return new TextBlock { Text = "·", Foreground = YachtBrush("#3B5044"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        var preview = YachtRules.Score(category, room.Dice);
        // An upper pick that lifts the subtotal to 63 is starred so the bonus is visible before it is taken.
        var bonus = YachtRules.IsUpper(category) && player.Bonus() == 0 && player.UpperSum() + preview >= YachtRules.BonusThreshold;
        var button = new Button
        {
            Template = YachtPlainButton, Name = $"YachtPick{category}", Tag = category, Margin = new Thickness(3, 1, 3, 1), Cursor = System.Windows.Input.Cursors.Hand,
            ToolTip = $"{YachtRules.Name(category)} 칸에 {preview}점 적기" + (bonus ? $"\n상단 {YachtRules.BonusThreshold}점 달성 · 보너스 +{YachtRules.BonusScore}!" : ""),
            Content = new Border
            {
                Background = YachtBrush(preview > 0 ? "#3A4F2E" : "#22302A"), BorderBrush = YachtBrush(preview > 0 ? "#FFE29A" : "#4A5E53"),
                BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(4),
                Child = new TextBlock { Text = bonus ? $"{preview}★" : preview.ToString(), FontSize = 12, FontWeight = FontWeights.Bold,
                    FontFamily = new FontFamily("Consolas, Malgun Gothic"), Foreground = YachtBrush(preview > 0 ? "#FFE29A" : "#91AB9C"),
                    HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
            },
        };
        System.Windows.Automation.AutomationProperties.SetName(button, $"{YachtRules.Name(category)} 칸 {preview}점 적기");
        button.Click += (_, _) => { if (!busy) _ = RunYachtAsync((s, id) => s.Record(room.Id, id, room.Revision, category)); };
        return button;
    }
}
