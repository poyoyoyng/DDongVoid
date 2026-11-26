using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using DDongVoid.Core;

namespace DDongVoid;

public partial class MainWindow
{
    private readonly DispatcherTimer yutTimer = new(DispatcherPriority.Normal) { Interval = TimeSpan.FromSeconds(1) };
    private Guid? yutRoomId;
    private JeungYutRoom? yutRoom;
    private List<JeungYutRoom> yutRooms = [];
    private string? yutDrawn;
    private bool yutTimerHooked, yutSyncing;
    private int yutStateVersion;
    private CancellationTokenSource? yutSyncCancellation;
    private Task? yutActivePoll;
    private string yutSyncNote = "동기화 확인 중…";
    private TextBlock? yutSyncStatus;
    // Resigning takes two presses: the first arms the button for this room revision only.
    private (Guid Room, int Revision)? yutResignArmed;
    // Which throw result and which of my pieces are picked; both only narrow down the move buttons.
    private int? yutSelectedResult, yutSelectedToken;
    private const double YutBoardSide = 236;
    private static readonly string[] YutPieceFill = ["#3B82F6", "#E5484D", "#8B5CF6", "#D99A00"];
    private static readonly string[] YutInk = ["#99CFFF", "#F4B69D", "#D5B2FF", "#FFE29A"];
    private bool InYutMatch => yutRoom?.Status == JeungYutStatus.Playing;
    private JeungYutStore NewYutStore() => new(store.Folder);

    private void StartYutTimer()
    {
        if (!yutTimerHooked) { yutTimer.Tick += async (_, _) => await PollYutAsync(); yutTimerHooked = true; }
        UpdateYutPollInterval(); yutTimer.Start();
    }
    private void UpdateYutPollInterval()
    {
        var interval = InYutMatch ? JeungYutRoom.MatchPollInterval : TimeSpan.FromSeconds(1);
        if (yutTimer.Interval != interval) yutTimer.Interval = interval;
    }
    private void DetachYutRoom()
    {
        yutTimer.Stop(); yutSyncCancellation?.Cancel(); yutStateVersion++;
        yutRoomId = null; yutRoom = null; yutDrawn = null; yutSyncStatus = null; yutResignArmed = null;
        yutSelectedResult = null; yutSelectedToken = null;
    }
    private void ShowYutLobby()
    {
        if (!RequireLogin()) return;
        DetachSlapRoom(); DetachCiaoRoom(); DetachOneCardRoom(); DetachYachtRoom(); DetachOmokRoom(); DetachYutRoom();
        DrawYutLobby(); StartYutTimer(); _ = PollYutAsync();
    }
    private void DrawYutLobby()
    {
        var signature = "lobby|" + userId + "|" + JsonSerializer.Serialize(yutRooms);
        if (panel == "jeungyut-lobby" && yutDrawn == signature) return;
        yutDrawn = signature;
        BeginPanel("jeungyut-lobby", "증강윷놀이 · 2~4인 개인전", "증강윷놀이", "");
        AddYutSyncControls();
        AddButton("방 만들기", CreateYutRoom, true);
        AddButton("규칙 · 증강 도감", ShowYutGuide);
        var mine = yutRooms.Where(r => r.Find(userId!) is not null).OrderByDescending(r => r.CreatedAt).ToList();
        var others = yutRooms.Where(r => r.Find(userId!) is null).OrderByDescending(r => r.CreatedAt).ToList();
        AddText($"내가 참가한 방 · {mine.Count}개", 13, "#A7F3CE", 12, 6, true);
        if (mine.Count == 0) AddText("참가 중인 방이 없어요.", 11, "#91AB9C", 0, 6);
        foreach (var room in mine) AddYutRoomEntry(room);
        AddText($"다른 방 · {others.Count}개", 13, "#A7F3CE", 12, 6, true);
        foreach (var room in others) AddYutRoomEntry(room);
        AddButton("돌아가기", () => { DetachYutRoom(); ShowGameList(); });
    }
    private void AddYutRoomEntry(JeungYutRoom room)
    {
        var me = room.Find(userId!);
        var state = room.Status switch
        {
            JeungYutStatus.Playing => me is null ? "게임 중" : $"{room.Game!.Players[room.Game.Active].Turn}번째 턴 · 이어하기",
            JeungYutStatus.Finished => "결과 보기",
            _ => me is not null ? (me.Ready ? "준비 완료 · 다른 참가자 대기" : "준비 대기 · 이어하기")
                : room.Players.Count >= JeungYutRoom.MaxPlayers ? "가득 참" : "참가 가능",
        };
        var players = string.Join(" · ", room.Players.Select(p => p.Id));
        var button = AddButton($"{room.Title}   ·   {room.Players.Count}/{JeungYutRoom.MaxPlayers}\n{players}\n{state}",
            () => _ = RunYutAsync((s, id) => s.Join(room.Id, id)));
        button.Tag = room.Id;
        button.IsEnabled = me is not null || state == "참가 가능";
        button.Content = new TextBlock { Text = (string)button.Content, TextWrapping = TextWrapping.Wrap };
    }
    private void CreateYutRoom()
    {
        if (!RequireLogin()) return;
        DetachYutRoom();
        BeginPanel("jeungyut-create", "증강윷놀이 · 2~4인 개인전", "방 만들기", "방 목록에 표시할 제목을 입력해 주세요.");
        AddText($"방 제목 · 최대 {JeungYutRoom.MaxTitleLength}자", 12, "#B6C7BC", 0, 6);
        var title = new TextBox { Name = "YutRoomTitle", MaxLength = JeungYutRoom.MaxTitleLength, Margin = new Thickness(0, 0, 0, 12) };
        System.Windows.Automation.AutomationProperties.SetName(title, "방 제목"); DialogContent.Children.Add(title);
        AddButton("방 만들기", () =>
        {
            var input = title.Text;
            _ = RunYutAsync((s, id) => s.Create(id, input));
        }, true);
        AddButton("취소", ShowYutLobby); title.Focus();
    }
    private void ShowYutGuide()
    {
        DetachYutRoom();
        BeginPanel("jeungyut-guide", "SAME BOARD. NEW POSSIBILITIES.", "규칙 · 증강 도감", "");
        AddText("· 각자 말 4개를 먼저 모두 완주시키면 승리합니다. 도·개·걸·윷·모는 1~5칸, 빽도는 지나온 길로 1칸 뒤로 갑니다.\n" +
            "· 윷·모와 잡기는 한 번 더 던집니다. 상대가 있는 칸에 정확히 도착하면 묶음 전체를 대기로 보냅니다. 내 말끼리 만나면 업고 함께 움직입니다.\n" +
            "· 오른쪽 위·왼쪽 위 모서리에서 이동을 시작하면 지름길을 고를 수 있고, 중앙에 멈췄다면 다음에 빠른 출구를 고를 수 있습니다.\n" +
            "· 각자 5·10·15번째 턴에 무작위 증강 3개 중 하나를 고릅니다. 다시 제안받기는 판마다 1번입니다.", 11.5, "#C9D6CF", 0, 10);
        foreach (var a in JeungYut.Augments)
        {
            var card = new StackPanel();
            card.Children.Add(new TextBlock { Text = $"{a.Icon}  {a.Name}", FontSize = 12.5, FontWeight = FontWeights.Bold, Foreground = YutTierBrush(a.Tier) });
            card.Children.Add(new TextBlock { Text = $"{YutTierName(a.Tier)} / {a.Kind}", FontSize = 9.5, Foreground = Theme.Paint("#91AB9C"), Margin = new Thickness(0, 1, 0, 2) });
            card.Children.Add(new TextBlock { Text = a.Desc, FontSize = 11, Foreground = Theme.Paint("#C9D6CF"), TextWrapping = TextWrapping.Wrap });
            DialogContent.Children.Add(new Border { Child = card, Padding = new Thickness(10, 7, 10, 7), Margin = new Thickness(0, 0, 0, 5),
                CornerRadius = new CornerRadius(8), Background = Theme.Paint("#0F1A16") });
        }
        AddButton("돌아가기", ShowYutLobby, true);
    }
    private static SolidColorBrush YutTierBrush(string tier) => Theme.Paint(tier switch { "prism" => "#D5B2FF", "gold" => "#FFE29A", _ => "#C9D6CF" });
    private static string YutTierName(string tier) => tier switch { "prism" => "PRISMATIC", "gold" => "GOLD", _ => "SILVER" };
    private async Task RunYutAsync(Func<JeungYutStore, string, JeungYutRoom?> action)
    {
        if (busy || userId is null) return;
        var yutStore = NewYutStore(); var me = userId;
        var previousId = yutRoomId;
        var version = ++yutStateVersion;
        yutSyncCancellation?.Cancel();
        busy = true;
        var refresh = false;
        try
        {
            var room = await RunOnShare(() => action(yutStore, me));
            if (version != yutStateVersion || userId != me || store.Folder != yutStore.Folder) return;
            yutRoom = room; yutRoomId = room?.Id;
            if (room is null)
            {
                yutRooms.RemoveAll(r => r.Id == previousId); ShowYutLobby(); return;
            }
            yutRooms.RemoveAll(r => r.Id == room.Id); yutRooms.Add(room);
            yutDrawn = null; DrawYutRoom(); StartYutTimer(); refresh = true;
        }
        catch (Exception ex) when (IsUserError(ex))
        {
            if (version == yutStateVersion && userId == me && store.Folder == yutStore.Folder)
            {
                SetMessage(ShareErrorText(ex, "증강윷놀이 동작")); refresh = true;
            }
        }
        finally { busy = false; }
        if (refresh && version == yutStateVersion) await PollYutAsync();
    }
    private void SetYutSyncNote(string note)
    {
        yutSyncNote = note;
        if (yutSyncStatus is not null)
        {
            yutSyncStatus.Text = note;
            yutSyncStatus.ToolTip = YutSyncDetails();
        }
    }
    private string YutSyncDetails() => $"앱 버전: {UpdateService.CurrentVersion}\n저장 파일: {System.IO.Path.Combine(store.Folder, "ddongvoid-jeungyut.json")}"
        + (yutRoom is { } room ? $"\n방 ID: {room.Id}\n방 수정 번호: {room.Revision}" : "");
    private void AddYutSyncControls()
    {
        var row = new DockPanel { Margin = new Thickness(0, 0, 0, panel == "jeungyut-room" ? 6 : 10), ToolTip = store.Folder };
        var refresh = new Button { Content = "새로고침", Padding = new Thickness(9, 4, 9, 4), FontSize = 11 };
        refresh.Click += async (_, _) => await RefreshYutAsync();
        DockPanel.SetDock(refresh, Dock.Right); row.Children.Add(refresh);
        yutSyncStatus = new TextBlock { Name = "YutSyncStatus", Text = yutSyncNote, FontSize = 10,
            Foreground = Theme.Paint(Color.FromRgb(145, 171, 156)), VerticalAlignment = VerticalAlignment.Center,
            TextWrapping = TextWrapping.Wrap, ToolTip = YutSyncDetails() };
        row.Children.Add(yutSyncStatus); DialogContent.Children.Add(row);
    }
    private async Task RefreshYutAsync()
    {
        if (busy || userId is null) return;
        var version = yutStateVersion;
        var active = yutActivePoll;
        yutSyncCancellation?.Cancel();
        if (active is not null) await active;
        if (version != yutStateVersion) return;
        // A manual refresh also rebuilds the controls when the file contents are unchanged.
        yutDrawn = null;
        SetYutSyncNote("다시 확인 중…");
        StartYutTimer();
        await PollYutAsync();
    }
    private Task PollYutAsync()
    {
        if (busy || yutSyncing || userId is null) return Task.CompletedTask;
        if (yutRoomId is null && panel != "jeungyut-lobby") { yutTimer.Stop(); return Task.CompletedTask; }
        return yutActivePoll = PollYutCoreAsync();
    }
    private async Task PollYutCoreAsync()
    {
        var yutStore = NewYutStore(); var me = userId!; var roomId = yutRoomId; var version = yutStateVersion;
        using var cancellation = new CancellationTokenSource();
        yutSyncCancellation = cancellation; yutSyncing = true;
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(8));
            var readToken = deadline.Token;
            var snapshot = await Task.Run(() => yutStore.SnapshotAsync(readToken), readToken).WaitAsync(readToken);
            if (version != yutStateVersion || userId != me || store.Folder != yutStore.Folder || roomId != yutRoomId) return;
            var rooms = snapshot.Rooms;
            if (roomId is Guid id)
            {
                var room = rooms.FirstOrDefault(r => r.Id == id && r.Find(me) is not null);
                if (room is null)
                {
                    if (snapshot.DeletedRoomIds.Contains(id))
                    {
                        yutRooms = rooms;
                        ShowYutLobby();
                        SetMessage("방장이 방을 삭제했습니다. 방 목록으로 돌아왔습니다.");
                        return;
                    }
                    // Missing data is not proof of deletion: keep the last room until a
                    // snapshot includes it again or explicitly confirms its removal.
                    yutDrawn = null;
                    SetYutSyncNote("방 정보 재확인 중…");
                    if (panel == "jeungyut-room") SetMessage("방 정보를 확인하지 못했습니다. 현재 방을 유지하고 다시 확인합니다.");
                    return;
                }
                yutRoom = room;
            }
            yutRooms = rooms; UpdateYutPollInterval(); SetYutSyncNote($"자동 갱신 · {DateTime.Now:HH:mm:ss}");
            if (panel == "jeungyut-room") DrawYutRoom();
            else if (panel == "jeungyut-lobby") DrawYutLobby();
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch (Exception ex) when (IsUserError(ex) || ex is OperationCanceledException)
        {
            LogError("증강윷놀이 조회", ex);
            if (version == yutStateVersion && userId == me && store.Folder == yutStore.Folder && panel.StartsWith("jeungyut"))
            {
                SetYutSyncNote("조회 실패 · 자동 재시도 중");
                SetMessage("증강윷놀이 정보를 불러오지 못했습니다. 공유 폴더 연결을 확인해 주세요."); yutDrawn = null;
            }
        }
        finally
        {
            if (ReferenceEquals(yutSyncCancellation, cancellation)) yutSyncCancellation = null;
            yutSyncing = false;
        }
    }
    private void ShowYutRoom()
    {
        yutDrawn = null; DrawYutRoom(); StartYutTimer(); _ = PollYutAsync();
    }
    private void YutPlay(JeungYutRoom room, JeungYutAction action)
    {
        if (busy) return;
        yutSelectedToken = null;
        _ = RunYutAsync((s, id) => s.Play(room.Id, id, room.Revision, action));
    }
    // Keeps the picked result and piece only while they still exist, defaulting to the first result.
    private void NormalizeYutSelection(JeungYutState game, bool mine)
    {
        if (!mine) { yutSelectedResult = null; yutSelectedToken = null; return; }
        if (!game.Pending.Any(r => r.Id == yutSelectedResult)) yutSelectedResult = game.Pending.FirstOrDefault()?.Id;
        if (yutSelectedToken is int token && game.Players[game.Active].Tokens.FirstOrDefault(t => t.Id == token) is not { Done: false }) yutSelectedToken = null;
    }
    private void DrawYutRoom()
    {
        if (yutRoom is not { } room || userId is null || room.Find(userId) is not { } me) { ShowYutLobby(); return; }
        if (yutResignArmed is { } armed && armed != (room.Id, room.Revision)) yutResignArmed = null;
        var game = room.Game;
        var playing = room.Status == JeungYutStatus.Playing;
        var finished = room.Status == JeungYutStatus.Finished;
        var myTurn = playing && room.CurrentPlayerId == userId;
        if (game is not null) NormalizeYutSelection(game, myTurn);
        var signature = "room|" + userId + "|" + yutResignArmed + "|" + yutSelectedResult + "|" + yutSelectedToken + "|" + JsonSerializer.Serialize(room);
        if (panel == "jeungyut-room" && yutDrawn == signature) return;
        yutDrawn = signature;
        var title = finished ? room.Winners.Contains(userId) ? room.Winners.Count > 1 ? "공동 승리!" : "이겼어요!" : "아쉽게 졌어요"
            : !playing ? "준비되면 시작!"
            : myTurn ? game!.Phase switch
            {
                JeungYut.Augment => "내 차례 · 증강 선택",
                JeungYut.FlickPhase => "내 차례 · 알까기",
                _ => game.Throws > 0 ? "내 차례 · 윷 던지기" : "내 차례 · 말 이동",
            }
            : $"{room.CurrentPlayerId}님의 차례";
        var eyebrow = playing ? $"{game!.Players[game.Active].Turn}번째 턴" : finished ? "GAME OVER" : "WAITING ROOM";
        BeginPanel("jeungyut-room", $"증강윷놀이 · {room.Title} · {eyebrow}", title, "");
        AddYutSyncControls();
        if (game is not null)
        {
            var layout = new Grid { Margin = new Thickness(0, 0, 0, 4) };
            layout.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            layout.ColumnDefinitions.Add(new ColumnDefinition());
            var (board, highlight) = YutBoard(room, game, myTurn);
            layout.Children.Add(board);
            var side = new StackPanel { Margin = new Thickness(6, 0, 0, 0) };
            for (var seat = 0; seat < room.Players.Count; seat++) side.Children.Add(YutPlate(room, seat));
            Grid.SetColumn(side, 1); layout.Children.Add(side);
            DialogContent.Children.Add(layout);
            if (finished) AddText(room.LastMessage ?? "", 11.5, "#FFE29A", 2, 6, true);
            else AddYutActions(room, game, myTurn, highlight);
            AddYutLog(game);
        }
        else
        {
            for (var seat = 0; seat < JeungYutRoom.MaxPlayers; seat++) DialogContent.Children.Add(YutPlate(room, seat));
            AddText("2~4명이 모두 준비 완료를 누르면 시작해요.\n첫 차례는 무작위이고, 참가 순서대로 돌아갑니다.", 11, "#91AB9C", 4, 6);
        }
        var actions = new System.Windows.Controls.Primitives.UniformGrid { Name = "YutRoomActions", Rows = 1, Margin = new Thickness(-2, 0, -2, 0) };
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
            Action(yutResignArmed is null ? "기권하기" : "정말 기권할까요?", () =>
            {
                if (yutResignArmed is null) { yutResignArmed = (room.Id, room.Revision); DrawYutRoom(); return; }
                yutResignArmed = null;
                _ = RunYutAsync((s, id) => s.Resign(room.Id, id, room.Revision));
            }, yutResignArmed is not null, "기권하면 게임이 끝나고, 남은 사람 중 완주한 말이 가장 많은 사람이 이겨요.");
        else
            Action(me.Ready ? "준비 취소" : finished ? "다시 하기" : "준비 완료",
                () => _ = RunYutAsync((s, id) => s.SetReady(room.Id, id, !me.Ready)), !me.Ready, finished && !me.Ready ? "모두 준비 완료하면 새 판을 시작해요." : null);
        Action("방 목록으로", ShowYutLobby, hint: playing ? "게임은 그대로 유지돼요. 목록에서 다시 들어올 수 있어요." : "참가는 유지돼요.");
        if (room.HostId == userId)
            Action("방 없애기", () => _ = RunYutAsync((s, id) => { s.DeleteRoom(room.Id, id); return null; }), hint: "방장만 방을 없앨 수 있어요.");
        if (!playing) Action("방 나가기", () => _ = RunYutAsync((s, id) => { s.Leave(room.Id, id); return null; }));
        DialogContent.Children.Add(actions);
    }
    private static string YutRouteName(string route) => route switch { "shortcut" => "지름길", "short" => "빠른 출구", "long" => "왼쪽 경유", _ => "이동" };
    private static string YutPlaceName(string node) => node switch
    {
        JeungYut.Finish => "완주 ⚑", JeungYut.Home => "대기로", "c" => "중앙", "o0" => "도착 칸", "o5" or "o10" or "o15" => "모서리", _ => "칸",
    };
    // The throw results, the throw and move buttons, and the augment / flick / recruit choices of the player to move.
    private void AddYutActions(JeungYutRoom room, JeungYutState game, bool mine, Ellipse highlight)
    {
        var p = game.Players[game.Active];
        if (game.LastRoll is { } roll && roll.Id == game.Revision) AddYutThrow(game, roll);
        else if (game.Log.FirstOrDefault(text => !text.EndsWith("번째 턴")) is { } latest) AddText(latest, 11, "#F4C59D", 0, 6);
        if (game.Phase == JeungYut.Augment)
        {
            if (!mine) { AddText($"{p.Name}님이 증강을 고르고 있어요.", 11.5, "#91AB9C", 0, 6); return; }
            AddText($"전략이 바뀌는 순간 · {p.Augments.Count + 1}/3 증강. 하나를 고르세요.", 11.5, "#A7F3CE", 0, 4, true);
            foreach (var id in game.Offers)
            {
                var a = JeungYut.AugmentOf(id);
                var card = new StackPanel();
                card.Children.Add(new TextBlock { Text = $"{a.Icon}  {a.Name}", FontSize = 12.5, FontWeight = FontWeights.Bold, Foreground = YutTierBrush(a.Tier) });
                card.Children.Add(new TextBlock { Text = $"{YutTierName(a.Tier)} / {a.Kind}", FontSize = 9.5, Foreground = Theme.Paint("#91AB9C"), Margin = new Thickness(0, 1, 0, 2) });
                card.Children.Add(new TextBlock { Text = a.Desc, FontSize = 10.5, TextWrapping = TextWrapping.Wrap });
                var button = AddButton(a.Name, () => YutPlay(room, new() { Type = "augment", Id = id }));
                button.Content = card; button.Tag = "augment:" + id; button.HorizontalContentAlignment = HorizontalAlignment.Left;
                System.Windows.Automation.AutomationProperties.SetName(button, a.Name);
            }
            AddButton($"⟳ 다시 제안받기 ({p.DraftRerolls}/1)", () => YutPlay(room, new() { Type = "draftReroll" })).IsEnabled = p.DraftRerolls > 0;
            return;
        }
        if (game.Phase == JeungYut.FlickPhase)
        {
            if (!mine) { AddText($"{p.Name}님이 알까기를 조준하고 있어요.", 11.5, "#91AB9C", 0, 6); return; }
            AddText("당기고, 놓고, 날려요! 판 위의 내 말을 마우스로 뒤로 당겼다 놓으면 반대쪽으로 날아가요. 길게 당길수록 멀리 가고, 빗나가면 내 묶음이 대기로 돌아가요.",
                11, "#A7F3CE", 0, 4);
            AddYutRecruit(room, game);
            AddButton("이번 알까기 넘기기", () => YutPlay(room, new() { Type = "skipFlick" }));
            return;
        }
        if (game.Pending.Count > 0)
        {
            var results = new WrapPanel { Margin = new Thickness(0, 0, 0, 4) };
            foreach (var r in game.Pending)
            {
                var chip = new Button { Content = $"{JeungYut.Label(r.Value)} {(r.Value < 0 ? "−1" : r.Value.ToString())}", Padding = new Thickness(10, 4, 10, 4),
                    Margin = new Thickness(0, 0, 4, 0), IsEnabled = mine, Tag = "result:" + r.Id };
                if (mine && r.Id == yutSelectedResult) chip.Style = (Style)FindResource("Primary");
                var id = r.Id;
                chip.Click += (_, _) => { if (!busy) { yutSelectedResult = id; DrawYutRoom(); } };
                results.Children.Add(chip);
            }
            DialogContent.Children.Add(results);
        }
        if (!mine)
        {
            AddText($"{p.Name}님의 다음 수를 기다리고 있어요.", 11.5, "#91AB9C", 0, 6); return;
        }
        var choice = JeungYut.Has(game, game.Active, "choice");
        if (game.Throws > 0)
        {
            if (choice)
            {
                var row = new System.Windows.Controls.Primitives.UniformGrid { Rows = 1, Margin = new Thickness(-2, 0, -2, 0) };
                foreach (var (value, text) in new[] { (1, "도 · 1칸"), (2, "개 · 2칸") })
                {
                    var b = AddButton(text, () => YutPlay(room, new() { Type = "roll", Value = value }), true);
                    DialogContent.Children.Remove(b); b.Margin = new Thickness(2, 3, 2, 3); row.Children.Add(b);
                }
                DialogContent.Children.Add(row);
            }
            else AddButton("윷 던지기  ↗", () => YutPlay(room, new() { Type = "roll" }), true);
            if (game.Pending.Count > 0) AddText($"추가 던지기 {game.Throws}회 · 결과를 모으거나 먼저 이동할 수 있어요.", 10.5, "#91AB9C", 0, 4);
        }
        var selected = game.Pending.FirstOrDefault(r => r.Id == yutSelectedResult);
        if (selected is not null && JeungYut.Has(game, game.Active, "reroll") && !p.Rerolled && selected.Value < 4)
        {
            if (choice)
            {
                AddButton("⟳ 선택한 결과를 도로 변경", () => YutPlay(room, new() { Type = "reroll", Result = selected.Id, Value = 1 }));
                AddButton("⟳ 선택한 결과를 개로 변경", () => YutPlay(room, new() { Type = "reroll", Result = selected.Id, Value = 2 }));
            }
            else AddButton("⟳ 선택한 결과 다시 던지기", () => YutPlay(room, new() { Type = "reroll", Result = selected.Id }));
        }
        if (selected is not null)
        {
            if (JeungYut.Has(game, game.Active, "stutter"))
                AddText("“성어말?” 이동 확정 후 15%씩 +1·−1칸 더듬어요. 표시는 예정 목적지예요.", 10.5, "#F4C59D", 0, 4);
            var tokens = p.Tokens;
            string From(JeungYutMove m) => JeungYut.Position(tokens[m.Token]);
            // Pieces waiting at home are interchangeable, so only one of each kind (fresh / once captured) gets buttons.
            var moves = JeungYut.LegalMoves(game).Where(m => m.Result == selected.Id && YutMovesPiece(tokens, m, yutSelectedToken))
                .DistinctBy(m => (From(m) == JeungYut.Home ? From(m) + tokens[m.Token].Returning : From(m), m.Route)).ToList();
            AddText(yutSelectedToken is int chosen ? $"{chosen + 1}번 말의 이동 · 다른 말을 보려면 판의 말을 다시 누르세요." : "움직일 말을 고르세요 · 판 위의 내 말을 누르면 그 말만 보여요.",
                10.5, "#91AB9C", 2, 3);
            foreach (var m in moves)
            {
                var from = JeungYut.Position(tokens[m.Token]);
                List<JeungYutToken> group = from == JeungYut.Home ? [tokens[m.Token]] : [.. tokens.Where(t => JeungYut.Position(t) == from)];
                var who = from == JeungYut.Home ? $"새 말({m.Token + 1}번)" : $"{string.Join("·", group.Select(t => t.Id + 1))}번 말";
                var text = $"{who} · {YutRouteName(m.Route)} {(m.Steps == -1 ? "뒤로 1" : m.Steps.ToString())}칸 → {YutPlaceName(m.To)}";
                var move = m;
                var button = AddButton(text, () => YutPlay(room, new() { Type = "move", Token = move.Token, Result = move.Result, Route = move.Route }));
                button.Tag = move; button.HorizontalContentAlignment = HorizontalAlignment.Left; button.Padding = new Thickness(10, 5, 10, 5); button.Margin = new Thickness(0, 2, 0, 2);
                if (JeungYut.Nodes.TryGetValue(m.To, out var spot))
                {
                    button.MouseEnter += (_, _) => { Canvas.SetLeft(highlight, spot.X - 34); Canvas.SetTop(highlight, spot.Y - 34); highlight.Visibility = Visibility.Visible; };
                    button.MouseLeave += (_, _) => highlight.Visibility = Visibility.Collapsed;
                }
            }
        }
        AddYutRecruit(room, game);
    }
    // Whether the move carries the picked piece: its whole stack on the board, or exactly that piece from home.
    private static bool YutMovesPiece(List<JeungYutToken> tokens, JeungYutMove m, int? pick)
    {
        if (pick is not int id) return true;
        var at = JeungYut.Position(tokens[id]);
        return at == JeungYut.Home ? m.Token == id : JeungYut.Position(tokens[m.Token]) == at;
    }
    private void AddYutRecruit(JeungYutRoom room, JeungYutState game)
    {
        var options = JeungYut.RecruitOptions(game);
        if (options.Count == 0) return;
        AddText("♙ 뒹학 사람좀 모아봐 · 완주 2개! 창고 말을 업고 이번 턴을 끝낼 수 있어요. 남은 이동과 추가 던지기는 사라져요.", 10.5, "#FFE29A", 4, 2);
        foreach (var o in options)
            AddButton($"{o.Reserve + 1}번 → {o.Target + 1}번에 업고 턴 종료", () => YutPlay(room, new() { Type = "recruit", Reserve = o.Reserve, Target = o.Target }));
    }
    // Four sticks with the result: flat faces up count the move, a marked flat stick alone is 빽도.
    private void AddYutThrow(JeungYutState game, JeungYutRoll roll)
    {
        var flat = roll.Value == -1 ? 1 : roll.Value == 5 ? 0 : roll.Value;
        var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 6) };
        for (var i = 0; i < 4; i++)
        {
            var stick = new Border { Width = 9, Height = 30, CornerRadius = new CornerRadius(4), Margin = new Thickness(0, 0, 3, 0), BorderThickness = new Thickness(1),
                BorderBrush = Theme.Paint("#B88A3E"), Background = Theme.Paint(i < flat ? "#F7F7F2" : "#5B4220") };
            if (roll.Value == -1 && i == 0)
                stick.Child = new Ellipse { Width = 5, Height = 5, Fill = Theme.Paint("#E5484D"), VerticalAlignment = VerticalAlignment.Center };
            row.Children.Add(stick);
        }
        var text = new StackPanel { Margin = new Thickness(8, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
        text.Children.Add(new TextBlock { Text = $"{JeungYut.Label(roll.Value)}!", FontSize = 17, FontWeight = FontWeights.Bold, Foreground = Theme.Paint("#FFE29A") });
        text.Children.Add(new TextBlock { Text = $"{game.Players[roll.Owner].Name} · {(roll.Reroll ? "다시 던진 결과" : "던진 결과")} · {(roll.Value < 0 ? "뒤로 1칸" : $"{roll.Value}칸")}" +
            (roll.Extra > 0 ? $" · {roll.Extra}번 더 던져요!" : ""), FontSize = 10.5, Foreground = Theme.Paint("#C9D6CF"), TextWrapping = TextWrapping.Wrap });
        row.Children.Add(text);
        DialogContent.Children.Add(new Border { Name = "YutThrow", Child = row });
    }
    private void AddYutLog(JeungYutState game)
    {
        var lines = game.Log.Take(5).Select((text, i) => (i == 0 ? "↳ " : "   ") + text);
        DialogContent.Children.Add(new Border
        {
            Child = new TextBlock { Text = string.Join("\n", lines), FontSize = 10, Foreground = Theme.Paint("#91AB9C"), TextWrapping = TextWrapping.Wrap },
            Padding = new Thickness(8, 5, 8, 5), Margin = new Thickness(0, 4, 0, 4), CornerRadius = new CornerRadius(6), Background = Theme.Paint("#0F1A16"),
        });
    }
    private static string YutAugmentStatus(JeungYutPlayer p, string id) => id switch
    {
        "dopamine" => JeungYut.DopamineTurnsLeft(p) is > 0 and var buff ? $"+1칸 {buff}턴 · 이후 −1칸 {JeungYut.DopamineDebuffTurnsLeft(p)}턴"
            : JeungYut.DopamineDebuffTurnsLeft(p) is > 0 and var debuff ? $"−1칸 · {debuff}턴 남음" : "후유증 종료 · 정상 이동",
        "aunt" => $"잡힘 면역 {p.Immunity}/3회",
        "recruit" => p.RecruitUsed ? "판당 1회 · 사용 완료" : "판당 1회 · 미사용",
        "shield" => $"호신부 {p.Shields}/2회",
        _ => "",
    };
    // Name plate: color, finished / waiting / on-board counts and the augments, whose tooltips explain them.
    private Border YutPlate(JeungYutRoom room, int seat)
    {
        var seatInfo = seat < room.Players.Count ? room.Players[seat] : null;
        var game = room.Game;
        var player = seatInfo is not null && game is not null ? game.Players[seat] : null;
        var current = seatInfo is not null && seatInfo.Id == room.CurrentPlayerId;
        var winner = seatInfo is not null && room.Winners.Contains(seatInfo.Id);
        var body = new StackPanel();
        var head = new DockPanel();
        if (seatInfo is not null)
        {
            var dot = new Ellipse { Width = 11, Height = 11, Fill = Theme.Paint(YutPieceFill[seat]), Margin = new Thickness(0, 0, 5, 0), VerticalAlignment = VerticalAlignment.Center };
            head.Children.Add(dot);
        }
        head.Children.Add(new TextBlock { Text = seatInfo is null ? "빈 자리" : $"{(current ? "▶ " : winner ? "★ " : "")}{seatInfo.Id}{(seatInfo.Id == userId ? " (나)" : "")}",
            FontSize = 11.5, FontWeight = FontWeights.Bold, TextTrimming = TextTrimming.CharacterEllipsis, ToolTip = seatInfo?.Id,
            Foreground = seatInfo is null ? Theme.Paint("#6F8579") : Theme.Paint(YutInk[seat]) });
        body.Children.Add(head);
        string detail;
        if (seatInfo is null) detail = "참가 대기";
        else if (player is null) detail = seatInfo.Ready ? "준비 완료 ✓" : "준비 대기";
        else
        {
            int done = player.Tokens.Count(t => t.Done), home = player.Tokens.Count(t => JeungYut.Position(t) == JeungYut.Home);
            detail = $"완주 {done}/4 · 창고 {home} · 판 {4 - done - home}" + (player.Boost > 0 ? $" · 추격 +{player.Boost}" : "");
        }
        body.Children.Add(new TextBlock { Text = detail, FontSize = 10, Foreground = Theme.Paint(seatInfo is null ? "#6F8579" : "#C9D6CF"), TextWrapping = TextWrapping.Wrap });
        if (player is { Augments.Count: > 0 })
        {
            var augments = new WrapPanel();
            foreach (var id in player.Augments)
            {
                var a = JeungYut.AugmentOf(id); var status = YutAugmentStatus(player, id);
                augments.Children.Add(new Border
                {
                    Child = new TextBlock { Text = $"{a.Icon} {a.Name}", FontSize = 9.5, Foreground = YutTierBrush(a.Tier) },
                    Padding = new Thickness(4, 0, 4, 1), Margin = new Thickness(0, 2, 3, 0), CornerRadius = new CornerRadius(4), Background = Theme.Paint("#22302A"),
                    ToolTip = $"{a.Name} · {YutTierName(a.Tier)} / {a.Kind}\n{a.Desc}" + (status.Length > 0 ? $"\n지금: {status}" : ""),
                });
            }
            body.Children.Add(augments);
        }
        return new Border
        {
            Child = body, CornerRadius = new CornerRadius(8), Padding = new Thickness(8, 4, 8, 5), Margin = new Thickness(0, 0, 0, 4),
            Background = Theme.Paint(current ? "#31583F" : "#0F1A16"), BorderThickness = new Thickness(current || winner ? 1.5 : 1),
            BorderBrush = current || winner ? Theme.Paint(YutInk[seat]) : Theme.Paint("#2B3C32"),
        };
    }
    // The 29-point board in the web's 640 × 640 coordinates, scaled down. Pieces of the player to move can be picked,
    // the picked piece's destinations can be clicked, and in a flick turn a piece can be pulled back and released.
    private (FrameworkElement Board, Ellipse Highlight) YutBoard(JeungYutRoom room, JeungYutState game, bool mine)
    {
        var canvas = new Canvas { Width = JeungYut.BoardSize, Height = JeungYut.BoardSize, Background = Brushes.Transparent, ClipToBounds = true };
        static Brush Fixed(byte r, byte g, byte b, byte a = 255) { var brush = new SolidColorBrush(Color.FromArgb(a, r, g, b)); brush.Freeze(); return brush; }
        void Place(FrameworkElement element, double x, double y)
        {
            Canvas.SetLeft(element, x - element.Width / 2); Canvas.SetTop(element, y - element.Height / 2); canvas.Children.Add(element);
        }
        Place(new Rectangle { Width = 600, Height = 600, RadiusX = 28, RadiusY = 28, Fill = Theme.Paint("#DCB36A"), Stroke = Theme.Paint("#B88A3E"), StrokeThickness = 6 }, 320, 320);
        foreach (var line in JeungYut.Lines)
            canvas.Children.Add(new Polyline { Points = new PointCollection(line.Select(n => new Point(JeungYut.Nodes[n].X, JeungYut.Nodes[n].Y))),
                Stroke = Theme.Paint("#5B4220"), StrokeThickness = 5, Opacity = line.Contains("c") ? .55 : .8 });
        foreach (var (id, n) in JeungYut.Nodes)
        {
            var special = id is "o0" or "o5" or "o10" or "o15" or "c";
            Place(new Ellipse { Width = special ? 46 : 30, Height = special ? 46 : 30, Fill = Theme.Paint("#F7F7F2"), Stroke = Theme.Paint("#5B4220"), StrokeThickness = special ? 5 : 4 }, n.X, n.Y);
        }
        var startLabel = new TextBlock { Text = "출발 / 도착", FontSize = 22, FontWeight = FontWeights.Bold, Foreground = Theme.Paint("#5B4220") };
        Canvas.SetLeft(startLabel, 470); Canvas.SetTop(startLabel, 590); canvas.Children.Add(startLabel);
        if (game.Flick is { } shot)
            canvas.Children.Add(new Line { X1 = shot.FromX, Y1 = shot.FromY, X2 = shot.ToX, Y2 = shot.ToY, Stroke = Theme.Paint("#E5484D"),
                StrokeThickness = 5, StrokeDashArray = [2, 1.5], IsHitTestVisible = false });
        var highlight = new Ellipse { Width = 68, Height = 68, Stroke = Fixed(255, 236, 140), StrokeThickness = 7, Visibility = Visibility.Collapsed, IsHitTestVisible = false };
        var phase = game.Phase;
        var picking = mine && phase is JeungYut.Roll or JeungYut.Move && game.Pending.Count > 0;
        var flicking = mine && phase == JeungYut.FlickPhase;
        for (var owner = 0; owner < game.Players.Count; owner++)
        {
            foreach (var stack in game.Players[owner].Tokens.Where(t => JeungYut.OnBoard(JeungYut.Position(t))).GroupBy(JeungYut.Position))
            {
                var tokens = stack.ToList(); var n = JeungYut.Nodes[stack.Key];
                var lead = tokens[0].Id;
                var isMine = owner == game.Active && (picking || flicking);
                var selected = isMine && yutSelectedToken is int pick && tokens.Any(t => t.Id == pick);
                var piece = new Grid { Width = 72, Height = 72, Tag = $"piece:{owner}:{lead}",
                    ToolTip = $"{room.Players[owner].Id} · {string.Join("·", tokens.Select(t => t.Id + 1))}번 말{(tokens.Count > 1 ? $" ({tokens.Count}개 업힘)" : "")}" };
                if (selected) piece.Children.Add(new Ellipse { Width = 70, Height = 70, Stroke = Fixed(255, 236, 140), StrokeThickness = 7 });
                if (tokens.Count > 1) piece.Children.Add(new Ellipse { Width = 62, Height = 62, Stroke = Theme.Paint(YutPieceFill[owner]), StrokeThickness = 4 });
                piece.Children.Add(new Ellipse { Width = 52, Height = 52, Fill = Theme.Paint(YutPieceFill[owner]), Stroke = Brushes.White, StrokeThickness = 4 });
                piece.Children.Add(new TextBlock { Text = tokens.Count > 1 ? $"×{tokens.Count}" : (lead + 1).ToString(), FontSize = 26, FontWeight = FontWeights.Bold,
                    Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });
                if (isMine)
                {
                    piece.Cursor = flicking ? Cursors.SizeAll : Cursors.Hand;
                    if (picking)
                        piece.MouseLeftButtonDown += (_, e) =>
                        {
                            e.Handled = true; if (busy) return;
                            yutSelectedToken = selected ? null : lead; DrawYutRoom();
                        };
                    else AttachYutFlick(room, canvas, piece, lead, n);
                }
                Place(piece, n.X, n.Y);
            }
        }
        if (picking && yutSelectedToken is int chosen && game.Pending.FirstOrDefault(r => r.Id == yutSelectedResult) is { } result)
        {
            var tokens = game.Players[game.Active].Tokens;
            foreach (var m in JeungYut.LegalMoves(game).Where(m => m.Result == result.Id && YutMovesPiece(tokens, m, chosen)))
            {
                var spot = JeungYut.Nodes.TryGetValue(m.To, out var node) ? node : m.To == JeungYut.Finish ? (600.0, 600.0) : (600.0, 530.0);
                var mark = new Grid { Width = 60, Height = 60, Cursor = Cursors.Hand, Tag = m, ToolTip = $"{YutRouteName(m.Route)} {(m.Steps == -1 ? "뒤로 1" : m.Steps.ToString())}칸 → {YutPlaceName(m.To)}" };
                mark.Children.Add(new Ellipse { Fill = Fixed(52, 199, 89, 150), Stroke = Fixed(18, 94, 52), StrokeThickness = 4 });
                mark.Children.Add(new TextBlock { Text = m.To == JeungYut.Finish ? "⚑" : m.To == JeungYut.Home ? "↩" : "✓", FontSize = 28, FontWeight = FontWeights.Bold,
                    Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });
                var move = m;
                mark.MouseLeftButtonDown += (_, e) => { e.Handled = true; YutPlay(room, new() { Type = "move", Token = move.Token, Result = move.Result, Route = move.Route }); };
                Place(mark, spot.Item1, spot.Item2);
            }
        }
        canvas.Children.Add(highlight);
        var view = new Viewbox { Child = canvas, Width = YutBoardSide, Height = YutBoardSide };
        return (new Border { Name = "YutBoard", Child = view, VerticalAlignment = VerticalAlignment.Top }, highlight);
    }
    // Press a piece, drag the opposite way of the shot and release: the pull length sets the power, like the web version.
    private void AttachYutFlick(JeungYutRoom room, Canvas canvas, FrameworkElement piece, int token, (double X, double Y) source)
    {
        var aim = new Line { Stroke = new SolidColorBrush(Color.FromRgb(196, 237, 137)), StrokeThickness = 6, StrokeDashArray = [2, 1], IsHitTestVisible = false, Visibility = Visibility.Collapsed };
        var tether = new Line { Stroke = Brushes.White, StrokeThickness = 4, IsHitTestVisible = false, Visibility = Visibility.Collapsed };
        var power = new TextBlock { FontSize = 26, FontWeight = FontWeights.Bold, Foreground = Brushes.White, IsHitTestVisible = false, Visibility = Visibility.Collapsed };
        Point? start = null;
        (double X, double Y) Pull(Point at) => (at.X - start!.Value.X, at.Y - start.Value.Y);
        void Hide() { start = null; aim.Visibility = tether.Visibility = power.Visibility = Visibility.Collapsed; }
        piece.MouseLeftButtonDown += (_, e) =>
        {
            e.Handled = true; if (busy) return;
            if (aim.Parent is null) { canvas.Children.Add(tether); canvas.Children.Add(aim); canvas.Children.Add(power); }
            start = e.GetPosition(canvas); canvas.CaptureMouse();
        };
        canvas.MouseMove += (_, e) =>
        {
            if (start is null) return;
            var (pullX, pullY) = Pull(e.GetPosition(canvas));
            if (Math.Sqrt(pullX * pullX + pullY * pullY) < 1) return;
            var launch = JeungYut.FlickFromPull(pullX, pullY);
            var elastic = Math.Min(launch.Length, JeungYut.FlickMaxPull);
            aim.X1 = tether.X1 = source.X; aim.Y1 = tether.Y1 = source.Y;
            aim.X2 = source.X + launch.Dx * launch.Power; aim.Y2 = source.Y + launch.Dy * launch.Power;
            tether.X2 = source.X - launch.Dx * elastic; tether.Y2 = source.Y - launch.Dy * elastic;
            power.Text = $"파워 {Math.Round(launch.Power / JeungYut.FlickMaxTravel * 100)}%";
            Canvas.SetLeft(power, Math.Clamp(source.X - 60, 10, 500)); Canvas.SetTop(power, Math.Clamp(source.Y + 40, 10, 590));
            aim.Visibility = tether.Visibility = power.Visibility = Visibility.Visible;
        };
        canvas.MouseLeftButtonUp += (_, e) =>
        {
            if (start is null) return;
            var (pullX, pullY) = Pull(e.GetPosition(canvas));
            Hide(); canvas.ReleaseMouseCapture();
            if (Math.Sqrt(pullX * pullX + pullY * pullY) >= JeungYut.FlickMinPull)
                YutPlay(room, new() { Type = "flick", Token = token, PullX = pullX, PullY = pullY });
        };
        canvas.LostMouseCapture += (_, _) => Hide();
    }
}
