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
    private readonly DispatcherTimer omokTimer = new(DispatcherPriority.Normal) { Interval = TimeSpan.FromSeconds(1) };
    private Guid? omokRoomId;
    private OmokRoom? omokRoom;
    private List<OmokRoom> omokRooms = [];
    private string? omokDrawn;
    private bool omokTimerHooked, omokSyncing;
    private int omokStateVersion;
    private CancellationTokenSource? omokSyncCancellation;
    private Task? omokActivePoll;
    private string omokSyncNote = "동기화 확인 중…";
    private TextBlock? omokSyncStatus;
    // Resigning takes two presses: the first arms the button for this room revision only.
    private (Guid Room, int Revision)? omokResignArmed;
    private const double OmokCell = 18;
    private static readonly (int X, int Y)[] OmokStars = [(3, 3), (11, 3), (7, 7), (3, 11), (11, 11)];
    private bool InOmokMatch => omokRoom?.Status == OmokStatus.Playing;
    private OmokStore NewOmokStore() => new(store.Folder);

    private void StartOmokTimer()
    {
        if (!omokTimerHooked) { omokTimer.Tick += async (_, _) => await PollOmokAsync(); omokTimerHooked = true; }
        UpdateOmokPollInterval(); omokTimer.Start();
    }
    private void UpdateOmokPollInterval()
    {
        var interval = InOmokMatch ? OmokRules.MatchPollInterval : TimeSpan.FromSeconds(1);
        if (omokTimer.Interval != interval) omokTimer.Interval = interval;
    }
    private void DetachOmokRoom()
    {
        omokTimer.Stop(); omokSyncCancellation?.Cancel(); omokStateVersion++;
        omokRoomId = null; omokRoom = null; omokDrawn = null; omokSyncStatus = null; omokResignArmed = null;
    }
    private void ShowOmokLobby()
    {
        if (!RequireLogin()) return;
        DetachSlapRoom(); DetachCiaoRoom(); DetachOneCardRoom(); DetachYachtRoom(); DetachOmokRoom(); DetachYutRoom();
        DrawOmokLobby(); StartOmokTimer(); _ = PollOmokAsync();
    }
    private void DrawOmokLobby()
    {
        var signature = "lobby|" + userId + "|" + JsonSerializer.Serialize(omokRooms);
        if (panel == "omok-lobby" && omokDrawn == signature) return;
        omokDrawn = signature;
        BeginPanel("omok-lobby", "오목 · 2인 · 렌주룰", "오목", "");
        AddOmokSyncControls();
        AddButton("방 만들기", CreateOmokRoom, true);
        var mine = omokRooms.Where(r => r.Find(userId!) is not null).OrderByDescending(r => r.CreatedAt).ToList();
        var others = omokRooms.Where(r => r.Find(userId!) is null).OrderByDescending(r => r.CreatedAt).ToList();
        AddText($"내가 참가한 방 · {mine.Count}개", 13, "#A7F3CE", 12, 6, true);
        if (mine.Count == 0) AddText("참가 중인 방이 없어요.", 11, "#91AB9C", 0, 6);
        foreach (var room in mine) AddOmokRoomEntry(room);
        AddText($"다른 방 · {others.Count}개", 13, "#A7F3CE", 12, 6, true);
        foreach (var room in others) AddOmokRoomEntry(room);
        AddButton("돌아가기", () => { DetachOmokRoom(); ShowGameList(); });
    }
    private void AddOmokRoomEntry(OmokRoom room)
    {
        var me = room.Find(userId!);
        var state = room.Status switch
        {
            OmokStatus.Playing => me is null ? "게임 중" : $"{room.Moves}수째 · 이어하기",
            OmokStatus.Finished => "결과 보기",
            _ => me is not null ? (me.Ready ? "준비 완료 · 상대 대기" : "준비 대기 · 이어하기")
                : room.Players.Count >= OmokRules.Players ? "가득 참" : "참가 가능",
        };
        var players = string.Join(" vs ", room.Players.Select(p => p.Id));
        var button = AddButton($"{room.Title}   ·   {room.Players.Count}/{OmokRules.Players}\n{players}\n{state}",
            () => _ = RunOmokAsync((s, id) => s.Join(room.Id, id)));
        button.Tag = room.Id;
        button.IsEnabled = me is not null || state == "참가 가능";
        button.Content = new TextBlock { Text = (string)button.Content, TextWrapping = TextWrapping.Wrap };
    }
    private void CreateOmokRoom()
    {
        if (!RequireLogin()) return;
        DetachOmokRoom();
        BeginPanel("omok-create", "오목 · 2인 · 렌주룰", "방 만들기", "방 목록에 표시할 제목을 입력해 주세요.");
        AddText($"방 제목 · 최대 {OmokRules.MaxTitleLength}자", 12, "#B6C7BC", 0, 6);
        var title = new TextBox { Name = "OmokRoomTitle", MaxLength = OmokRules.MaxTitleLength, Margin = new Thickness(0, 0, 0, 12) };
        System.Windows.Automation.AutomationProperties.SetName(title, "방 제목"); DialogContent.Children.Add(title);
        AddButton("방 만들기", () =>
        {
            var input = title.Text;
            _ = RunOmokAsync((s, id) => s.Create(id, input));
        }, true);
        AddButton("취소", ShowOmokLobby); title.Focus();
    }
    private async Task RunOmokAsync(Func<OmokStore, string, OmokRoom?> action)
    {
        if (busy || userId is null) return;
        var omokStore = NewOmokStore(); var me = userId;
        var previousId = omokRoomId;
        var version = ++omokStateVersion;
        omokSyncCancellation?.Cancel();
        busy = true;
        var refresh = false;
        try
        {
            var room = await RunOnShare(() => action(omokStore, me));
            if (version != omokStateVersion || userId != me || store.Folder != omokStore.Folder) return;
            omokRoom = room; omokRoomId = room?.Id;
            if (room is null)
            {
                omokRooms.RemoveAll(r => r.Id == previousId); ShowOmokLobby(); return;
            }
            omokRooms.RemoveAll(r => r.Id == room.Id); omokRooms.Add(room);
            omokDrawn = null; DrawOmokRoom(); StartOmokTimer(); refresh = true;
        }
        catch (Exception ex) when (IsUserError(ex))
        {
            if (version == omokStateVersion && userId == me && store.Folder == omokStore.Folder)
            {
                SetMessage(ShareErrorText(ex, "오목 동작")); refresh = true;
            }
        }
        finally { busy = false; }
        if (refresh && version == omokStateVersion) await PollOmokAsync();
    }
    private void SetOmokSyncNote(string note)
    {
        omokSyncNote = note;
        if (omokSyncStatus is not null)
        {
            omokSyncStatus.Text = note;
            omokSyncStatus.ToolTip = OmokSyncDetails();
        }
    }
    private string OmokSyncDetails() => $"앱 버전: {UpdateService.CurrentVersion}\n저장 파일: {System.IO.Path.Combine(store.Folder, "ddongvoid-omok.json")}"
        + (omokRoom is { } room ? $"\n방 ID: {room.Id}\n방 수정 번호: {room.Revision}\n수: {room.Moves}" : "");
    private void AddOmokSyncControls()
    {
        var row = new DockPanel { Margin = new Thickness(0, 0, 0, panel == "omok-room" ? 6 : 10), ToolTip = store.Folder };
        var refresh = new Button { Content = "새로고침", Padding = new Thickness(9, 4, 9, 4), FontSize = 11 };
        refresh.Click += async (_, _) => await RefreshOmokAsync();
        DockPanel.SetDock(refresh, Dock.Right); row.Children.Add(refresh);
        omokSyncStatus = new TextBlock { Name = "OmokSyncStatus", Text = omokSyncNote, FontSize = 10,
            Foreground = Theme.Paint(Color.FromRgb(145, 171, 156)), VerticalAlignment = VerticalAlignment.Center,
            TextWrapping = TextWrapping.Wrap, ToolTip = OmokSyncDetails() };
        row.Children.Add(omokSyncStatus); DialogContent.Children.Add(row);
    }
    private async Task RefreshOmokAsync()
    {
        if (busy || userId is null) return;
        var version = omokStateVersion;
        var active = omokActivePoll;
        omokSyncCancellation?.Cancel();
        if (active is not null) await active;
        if (version != omokStateVersion) return;
        // A manual refresh also rebuilds the controls when the file contents are unchanged.
        omokDrawn = null;
        SetOmokSyncNote("다시 확인 중…");
        StartOmokTimer();
        await PollOmokAsync();
    }
    private Task PollOmokAsync()
    {
        if (busy || omokSyncing || userId is null) return Task.CompletedTask;
        if (omokRoomId is null && panel != "omok-lobby") { omokTimer.Stop(); return Task.CompletedTask; }
        return omokActivePoll = PollOmokCoreAsync();
    }
    private async Task PollOmokCoreAsync()
    {
        var omokStore = NewOmokStore(); var me = userId!; var roomId = omokRoomId; var version = omokStateVersion;
        using var cancellation = new CancellationTokenSource();
        omokSyncCancellation = cancellation; omokSyncing = true;
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(8));
            var readToken = deadline.Token;
            var snapshot = await Task.Run(() => omokStore.SnapshotAsync(readToken), readToken).WaitAsync(readToken);
            if (version != omokStateVersion || userId != me || store.Folder != omokStore.Folder || roomId != omokRoomId) return;
            var rooms = snapshot.Rooms;
            if (roomId is Guid id)
            {
                var room = rooms.FirstOrDefault(r => r.Id == id && r.Find(me) is not null);
                if (room is null)
                {
                    if (snapshot.DeletedRoomIds.Contains(id))
                    {
                        omokRooms = rooms;
                        ShowOmokLobby();
                        SetMessage("방장이 방을 삭제했습니다. 방 목록으로 돌아왔습니다.");
                        return;
                    }
                    // Missing data is not proof of deletion: keep the last room until a
                    // snapshot includes it again or explicitly confirms its removal.
                    omokDrawn = null;
                    SetOmokSyncNote("방 정보 재확인 중…");
                    if (panel == "omok-room") SetMessage("방 정보를 확인하지 못했습니다. 현재 방을 유지하고 다시 확인합니다.");
                    return;
                }
                omokRoom = room;
            }
            omokRooms = rooms; UpdateOmokPollInterval(); SetOmokSyncNote($"자동 갱신 · {DateTime.Now:HH:mm:ss}");
            if (panel == "omok-room") DrawOmokRoom();
            else if (panel == "omok-lobby") DrawOmokLobby();
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch (Exception ex) when (IsUserError(ex) || ex is OperationCanceledException)
        {
            LogError("오목 조회", ex);
            if (version == omokStateVersion && userId == me && store.Folder == omokStore.Folder && panel.StartsWith("omok"))
            {
                SetOmokSyncNote("조회 실패 · 자동 재시도 중");
                SetMessage("오목 정보를 불러오지 못했습니다. 공유 폴더 연결을 확인해 주세요."); omokDrawn = null;
            }
        }
        finally
        {
            if (ReferenceEquals(omokSyncCancellation, cancellation)) omokSyncCancellation = null;
            omokSyncing = false;
        }
    }
    private void ShowOmokRoom()
    {
        omokDrawn = null; DrawOmokRoom(); StartOmokTimer(); _ = PollOmokAsync();
    }
    private void DrawOmokRoom()
    {
        if (omokRoom is not { } room || userId is null || room.Find(userId) is not { } me) { ShowOmokLobby(); return; }
        if (omokResignArmed is { } armed && armed != (room.Id, room.Revision)) omokResignArmed = null;
        var signature = "room|" + userId + "|" + omokResignArmed + "|" + JsonSerializer.Serialize(room);
        if (panel == "omok-room" && omokDrawn == signature) return;
        omokDrawn = signature;
        var playing = room.Status == OmokStatus.Playing;
        var finished = room.Status == OmokStatus.Finished;
        var myTurn = room.CurrentPlayerId == userId;
        var title = finished ? room.Winners.Count > 1 ? "무승부!" : room.Winners.Contains(userId) ? "이겼어요!" : "아쉽게 졌어요"
            : !playing ? "준비되면 시작!"
            : myTurn ? $"내 차례 · {OmokRoom.ColorName(room.BlackTurn)}" : $"{room.CurrentPlayerId}님의 차례";
        BeginPanel("omok-room", $"오목 · {room.Title} · {(playing ? $"{room.Moves + 1}수째" : finished ? "GAME OVER" : "WAITING ROOM")}", title, "");
        AddOmokSyncControls();
        if (playing || finished)
        {
            // The board takes the left side and the two name plates stack beside it, so the whole board fits without scrolling.
            var layout = new Grid { Margin = new Thickness(0, 0, 0, 4) };
            layout.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            layout.ColumnDefinitions.Add(new ColumnDefinition());
            layout.Children.Add(OmokBoard(room, myTurn));
            var side = new StackPanel { Margin = new Thickness(8, 0, 0, 0) };
            for (var seat = 0; seat < room.Players.Count; seat++) side.Children.Add(OmokPlate(room, seat));
            if (room.LastMove is int last)
                side.Children.Add(new TextBlock { Text = $"마지막 수\n{OmokRules.PointName(last)} · {(room.Board[last] == OmokRules.Black ? "흑" : "백")}", FontSize = 10.5,
                    Foreground = YachtBrush("#91AB9C"), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(2, 4, 0, 0) });
            if (playing && myTurn && room.BlackTurn)
                side.Children.Add(new TextBlock { Text = "× 표시는 흑이 둘 수 없는 금수 자리예요.", FontSize = 10.5,
                    Foreground = YachtBrush("#F4C59D"), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(2, 6, 0, 0) });
            Grid.SetColumn(side, 1); layout.Children.Add(side);
            DialogContent.Children.Add(layout);
            if (room.LastMessage is { } message) AddText(message, 11, "#F4C59D", 0, 4);
        }
        else
        {
            for (var seat = 0; seat < OmokRules.Players; seat++) DialogContent.Children.Add(OmokPlate(room, seat));
            AddText("두 사람 모두 준비 완료를 누르면 시작해요.\n흑이 먼저 두고, 흑과 백은 한 판씩 번갈아 맡아요.", 11, "#91AB9C", 4, 6);
        }
        var actions = new System.Windows.Controls.Primitives.UniformGrid { Name = "OmokActions", Rows = 1, Margin = new Thickness(-2, 0, -2, 0) };
        void Action(string text, Action click, bool primary = false, string? hint = null)
        {
            var button = AddButton(text, click, primary);
            DialogContent.Children.Remove(button);
            button.Margin = new Thickness(2, 3, 2, 3); button.Padding = new Thickness(4, button.Padding.Top, 4, button.Padding.Bottom); button.ToolTip = hint;
            button.Content = new TextBlock { Text = text, TextWrapping = TextWrapping.Wrap, TextAlignment = TextAlignment.Center };
            System.Windows.Automation.AutomationProperties.SetName(button, text);
            actions.Children.Add(button);
        }
        if (playing)
            Action(omokResignArmed is null ? "기권하기" : "정말 기권할까요?", () =>
            {
                if (omokResignArmed is null) { omokResignArmed = (room.Id, room.Revision); DrawOmokRoom(); return; }
                omokResignArmed = null;
                _ = RunOmokAsync((s, id) => s.Resign(room.Id, id, room.Revision));
            }, omokResignArmed is not null);
        else
            Action(me.Ready ? "준비 취소" : finished ? "다시 하기" : "준비 완료",
                () => _ = RunOmokAsync((s, id) => s.SetReady(room.Id, id, !me.Ready)), !me.Ready, finished && !me.Ready ? "준비 완료하고 흑백을 바꿔 한 판 더 해요." : null);
        Action("방 목록으로", ShowOmokLobby, hint: playing ? "게임은 그대로 유지돼요. 목록에서 다시 들어올 수 있어요." : "참가는 유지돼요.");
        if (room.HostId == userId)
            Action("방 없애기", () => _ = RunOmokAsync((s, id) => { s.DeleteRoom(room.Id, id); return null; }), hint: "방장만 방을 없앨 수 있어요.");
        if (!playing) Action("방 나가기", () => _ = RunOmokAsync((s, id) => { s.Leave(room.Id, id); return null; }));
        DialogContent.Children.Add(actions);
    }
    private static Ellipse OmokStone(bool black, double size) => new()
    {
        Width = size, Height = size, Fill = YachtBrush(black ? "#1A1A1A" : "#F7F7F2"), Stroke = YachtBrush(black ? "#1A1A1A" : "#8A8A80"), StrokeThickness = 1,
    };
    // Name plate with the player's stone color; the player to move is lit, the winner starred.
    private Border OmokPlate(OmokRoom room, int seat)
    {
        var player = seat < room.Players.Count ? room.Players[seat] : null;
        var started = room.Status != OmokStatus.Waiting;
        var black = room.BlackIndex == seat;
        var current = player is not null && player.Id == room.CurrentPlayerId;
        var winner = player is not null && room.Winners.Contains(player.Id);
        var row = new DockPanel();
        if (started && player is not null)
        {
            // The plate is dark, so the black stone gets the white stone's rim to stay visible.
            var stone = OmokStone(black, 18); stone.Stroke = YachtBrush("#8A8A80");
            stone.Margin = new Thickness(0, 0, 7, 0); stone.VerticalAlignment = VerticalAlignment.Center;
            row.Children.Add(stone);
        }
        var text = new StackPanel();
        text.Children.Add(new TextBlock { Text = player is null ? "빈 자리" : $"{(current ? "▶ " : winner ? "★ " : "")}{player.Id}{(player.Id == userId ? " (나)" : "")}",
            FontSize = 12, FontWeight = FontWeights.Bold, TextTrimming = TextTrimming.CharacterEllipsis, ToolTip = player?.Id,
            Foreground = player is null ? YachtBrush("#6F8579") : YachtBrush(YachtInk[seat]) });
        text.Children.Add(new TextBlock
        {
            Text = player is null ? "상대를 기다리는 중…" : !started ? player.Ready ? "준비 완료 ✓" : "준비 대기"
                : $"{OmokRoom.ColorName(black)}{(winner ? room.Winners.Count > 1 ? " · 무승부" : " · 승리" : current ? " · 두는 중" : "")}",
            FontSize = 11, Foreground = player is null ? YachtBrush("#6F8579") : YachtBrush("#C9D6CF"),
        });
        row.Children.Add(text);
        return new Border
        {
            Child = row, CornerRadius = new CornerRadius(8), Padding = new Thickness(9, 5, 9, 5), Margin = new Thickness(0, 0, 0, 5),
            Background = YachtBrush(current ? "#31583F" : "#0F1A16"), BorderThickness = new Thickness(current || winner ? 1.5 : 1),
            BorderBrush = current || winner ? YachtBrush(YachtInk[seat]) : YachtBrush("#2B3C32"),
        };
    }
    // A 15 × 15 wooden board: lines and star points underneath, one button per point on top.
    private FrameworkElement OmokBoard(OmokRoom room, bool myTurn)
    {
        const int Size = OmokRules.Size;
        var length = Size * OmokCell;
        var lines = new Canvas { Width = length, Height = length, IsHitTestVisible = false };
        for (var i = 0; i < Size; i++)
        {
            var at = (i + .5) * OmokCell;
            lines.Children.Add(new Line { X1 = OmokCell / 2, X2 = length - OmokCell / 2, Y1 = at, Y2 = at, Stroke = YachtBrush("#5B4220"), StrokeThickness = 1 });
            lines.Children.Add(new Line { Y1 = OmokCell / 2, Y2 = length - OmokCell / 2, X1 = at, X2 = at, Stroke = YachtBrush("#5B4220"), StrokeThickness = 1 });
        }
        foreach (var (x, y) in OmokStars)
        {
            var star = new Ellipse { Width = 5, Height = 5, Fill = YachtBrush("#5B4220") };
            Canvas.SetLeft(star, (x + .5) * OmokCell - 2.5); Canvas.SetTop(star, (y + .5) * OmokCell - 2.5); lines.Children.Add(star);
        }
        var playable = myTurn && room.Status == OmokStatus.Playing;
        var blackTurn = room.BlackTurn;
        var points = new System.Windows.Controls.Primitives.UniformGrid { Name = "OmokPoints", Rows = Size, Columns = Size, Width = length, Height = length };
        for (var index = 0; index < OmokRules.Points; index++)
        {
            var point = room.Board[index];
            var cell = new Grid { Background = Brushes.Transparent };
            var name = OmokRules.PointName(index);
            if (point != OmokRules.Empty)
            {
                var stone = OmokStone(point == OmokRules.Black, OmokCell - 2);
                if (room.WinningLine.Contains(index)) { stone.Stroke = YachtBrush("#FFD064"); stone.StrokeThickness = 2.5; }
                cell.Children.Add(stone);
                if (index == room.LastMove) cell.Children.Add(new Ellipse { Width = 6, Height = 6, Fill = YachtBrush("#E5484D") });
                cell.ToolTip = $"{name} · {(point == OmokRules.Black ? "흑" : "백")}";
                points.Children.Add(cell); continue;
            }
            var ban = playable && blackTurn ? OmokRules.ForbiddenReason(room.Board, index) : null;
            if (ban is not null)
            {
                cell.Children.Add(new TextBlock { Text = "×", FontSize = 14, FontWeight = FontWeights.Bold, Foreground = YachtBrush("#E5484D"),
                    HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, -2, 0, 0) });
                cell.ToolTip = $"{name} · 흑 금수 ({ban})";
                points.Children.Add(cell); continue;
            }
            if (!playable) { points.Children.Add(cell); continue; }
            var ghost = OmokStone(blackTurn, OmokCell - 2); ghost.Opacity = 0;
            cell.Children.Add(ghost);
            var target = index;
            var button = new Button { Template = YachtPlainButton, Content = cell, Tag = target, Cursor = System.Windows.Input.Cursors.Hand, ToolTip = $"{name}에 두기" };
            System.Windows.Automation.AutomationProperties.SetName(button, $"{name}에 {OmokRoom.ColorName(blackTurn)} 돌 두기");
            button.MouseEnter += (_, _) => ghost.Opacity = .5;
            button.MouseLeave += (_, _) => ghost.Opacity = 0;
            button.Click += (_, _) => { if (!busy) _ = RunOmokAsync((s, id) => s.Place(room.Id, id, room.Revision, target)); };
            points.Children.Add(button);
        }
        var stack = new Grid();
        stack.Children.Add(lines); stack.Children.Add(points);
        return new Border
        {
            Name = "OmokBoard", Child = stack, Padding = new Thickness(3), CornerRadius = new CornerRadius(6), VerticalAlignment = VerticalAlignment.Top,
            Background = YachtBrush("#DCB36A"), BorderBrush = YachtBrush("#B88A3E"), BorderThickness = new Thickness(2),
        };
    }
}
