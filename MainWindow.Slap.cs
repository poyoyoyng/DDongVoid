using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Threading;
using DDongVoid.Core;

namespace DDongVoid;

// 맞짱: a turn-based 1:1 match synced through ddongvoid-slap.json in the shared data folder.
public partial class MainWindow
{
    private static readonly TimeSpan SlapReadTimeout = TimeSpan.FromSeconds(8);
    private readonly DispatcherTimer slapTimer = new(DispatcherPriority.Normal) { Interval = TimeSpan.FromSeconds(1) };
    private Guid? slapRoomId;
    private SlapRoom? slapRoom;
    private List<SlapRoom> slapRooms = [];
    private string? slapDrawn;
    private bool slapSyncing;
    private CancellationTokenSource? slapSyncCancellation;
    private Task? slapActivePoll;
    private DateTime? slapLastSyncUtc;
    private string slapSyncNote = "동기화 확인 중…";
    private TextBlock? slapSyncStatus;
    private int slapStateVersion;
    private int slapPower = 1;
    private bool slapTimerHooked;
    private bool InSlapMatch => slapRoom?.Status == SlapStatus.Playing;

    private SlapStore NewSlapStore() => new(store.Folder);
    private void StartSlapTimer()
    {
        if (!slapTimerHooked) { slapTimer.Tick += async (_, _) => await PollSlapAsync(); slapTimerHooked = true; }
        slapTimer.Start();
    }
    private void ShowSlapLobby()
    {
        if (!RequireLogin()) return;
        DetachCiaoRoom();
        DetachSlapRoom();
        slapDrawn = null; DrawSlapLobby(); StartSlapTimer(); _ = PollSlapAsync();
    }
    private void DrawSlapLobby(string? note = null)
    {
        var signature = "lobby|" + userId + "|" + JsonSerializer.Serialize(slapRooms);
        if (panel == "slap-lobby" && slapDrawn == signature && note is null) return;
        slapDrawn = signature;
        BeginPanel("slap-lobby", "맞짱 · 1 : 1", "맞짱", "");
        AddSlapSyncControls();
        AddButton("방 만들기", CreateSlapRoom, true);
        if (slapRooms.Count == 0) AddText("열린 방이 없어요. 방을 만들고 상대를 기다려 보세요.", 12, "#91AB9C", 10, 6);
        var mine = slapRooms.Where(r => r.Find(userId!) is not null).OrderByDescending(r => r.CreatedAt).ToList();
        var others = slapRooms.Where(r => r.Find(userId!) is null).OrderByDescending(r => r.CreatedAt).ToList();
        AddText($"내가 참가한 방 · {mine.Count}개", 13, "#A7F3CE", 12, 6, true);
        if (mine.Count == 0) AddText("참가 중인 방이 없어요. 새 방을 만들거나 다른 방에 참가하세요.", 11, "#91AB9C", 0, 6);
        foreach (var room in mine) AddSlapRoomEntry(room);
        AddText($"다른 방 · {others.Count}개", 13, "#A7F3CE", 12, 6, true);
        foreach (var room in others) AddSlapRoomEntry(room);
        AddButton("돌아가기", LeaveSlapLobby);
        if (note is not null) SetMessage(note);
    }
    private void AddSlapRoomEntry(SlapRoom room)
    {
        var me = room.Find(userId!);
        string state;
        if (me is not null)
        {
            var progress = me.GaveUp ? "포기 응답 대기" : room.Opponent(userId!)?.GaveUp == true ? "상대 포기 요청"
                : me.Submitted ? "상대 선택 대기" : "내 선택 대기";
            state = room.Status switch
            {
                SlapStatus.Finished => "결과 보기",
                SlapStatus.Playing => $"R{room.Round} · {progress} · 이어하기",
                _ => $"{(me.Ready ? "준비 완료 · 상대 대기" : "준비 대기")} · 이어하기",
            };
        }
        else state = room.Status == SlapStatus.Playing ? "게임 중" : room.Players.Count >= 2 ? "가득 참" : "참가 가능";
        var players = string.Join(" · ", room.Players.Select(p => p.Id));
        var button = AddButton($"{room.Title}   ·   {room.Players.Count}/2\n{players}\n{state}", () => JoinSlapRoom(room.Id));
        button.Tag = room.Id;
        button.IsEnabled = me is not null || state == "참가 가능";
        button.Content = new TextBlock { Text = (string)button.Content, TextWrapping = TextWrapping.Wrap };
    }
    private void RememberSlapRoom(SlapRoom room)
    {
        slapRooms.RemoveAll(r => r.Id == room.Id);
        slapRooms.Add(room);
    }
    private void SetSlapSyncNote(string note)
    {
        slapSyncNote = note;
        if (slapSyncStatus is not null) slapSyncStatus.Text = note;
    }
    private void AddSlapSyncControls()
    {
        var row = new DockPanel { Margin = new Thickness(0, 0, 0, 10), ToolTip = store.Folder };
        var refresh = new Button { Content = "새로고침", Padding = new Thickness(9, 5, 9, 5), FontSize = 11 };
        refresh.Click += async (_, _) => await RefreshSlapAsync();
        DockPanel.SetDock(refresh, Dock.Right); row.Children.Add(refresh);
        slapSyncStatus = new TextBlock { Name = "SlapSyncStatus", Text = slapSyncNote, FontSize = 10,
            Foreground = new SolidColorBrush(Color.FromRgb(145, 171, 156)), VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap };
        row.Children.Add(slapSyncStatus); DialogContent.Children.Add(row);
    }
    private async Task RefreshSlapAsync()
    {
        if (busy || userId is null) return;
        var stateVersion = slapStateVersion;
        StartSlapTimer();
        var active = slapActivePoll;
        slapSyncCancellation?.Cancel();
        if (active is not null) await active;
        if (slapStateVersion == stateVersion) await PollSlapAsync();
    }
    private void LeaveSlapLobby() { slapTimer.Stop(); ShowGameList(); }
    private async Task RunSlapAsync(Func<SlapStore, string, SlapRoom?> action)
    {
        if (busy || userId is null) return;
        var slapStore = NewSlapStore(); var me = userId;
        var previousRoomId = slapRoomId;
        var stateVersion = ++slapStateVersion;
        slapSyncCancellation?.Cancel();
        var refresh = false;
        busy = true;
        try
        {
            var room = await Task.Run(() => action(slapStore, me));
            if (slapStateVersion != stateVersion || userId != me || store.Folder != slapStore.Folder) return;
            slapRoom = room; slapRoomId = room?.Id;
            if (room is null)
            {
                slapRooms.RemoveAll(r => r.Id == previousRoomId);
                ShowSlapLobby(); SetMessage("방에서 나왔습니다."); return;
            }
            RememberSlapRoom(room);
            slapDrawn = null; DrawSlapRoom(); StartSlapTimer();
            refresh = true;
        }
        catch (Exception ex) when (IsUserError(ex))
        {
            if (slapStateVersion == stateVersion && userId == me && store.Folder == slapStore.Folder) SetMessage(ex.Message);
        }
        finally { busy = false; }
        if (refresh && slapStateVersion == stateVersion) await PollSlapAsync();
    }
    private void CreateSlapRoom()
    {
        if (!RequireLogin()) return;
        DetachSlapRoom();
        BeginPanel("slap-create", "맞짱 · 1 : 1", "방 만들기", "방 목록에 표시할 제목을 입력해 주세요.");
        AddText($"방 제목 · 최대 {SlapRoom.MaxTitleLength}자", 12, "#B6C7BC", 0, 6);
        var titleInput = new TextBox { Name = "SlapRoomTitle", MaxLength = SlapRoom.MaxTitleLength, Margin = new Thickness(0, 0, 0, 12) };
        System.Windows.Automation.AutomationProperties.SetName(titleInput, "방 제목");
        DialogContent.Children.Add(titleInput);
        AddButton("방 만들기", () =>
        {
            var title = titleInput.Text;
            _ = RunSlapAsync((s, me) => s.Create(me, title));
        }, true);
        AddButton("취소", ShowSlapLobby);
        titleInput.Focus();
    }
    private void JoinSlapRoom(Guid id) => _ = RunSlapAsync((s, me) => s.Join(id, me));
    private void SetSlapReady(bool ready)
    {
        if (slapRoomId is Guid id) _ = RunSlapAsync((s, me) => s.SetReady(id, me, ready));
    }
    private void SubmitSlap(SlapAction action)
    {
        if (slapRoomId is Guid id) _ = RunSlapAsync((s, me) => s.Submit(id, me, action));
    }
    private void SetSlapGiveUp(bool giveUp)
    {
        if (slapRoomId is Guid id) _ = RunSlapAsync((s, me) => s.SetGiveUp(id, me, giveUp));
    }
    private void LeaveSlapRoom()
    {
        if (InSlapMatch) { ShowSlapLobby(); return; }
        if (slapRoomId is not Guid id) { ShowSlapLobby(); return; }
        _ = RunSlapAsync((s, me) => { s.Leave(id, me); return null; });
    }
    // Detach only this window; the saved match and pending choices remain available.
    private void DetachSlapRoom()
    {
        slapTimer.Stop();
        slapSyncCancellation?.Cancel();
        slapSyncStatus = null;
        slapStateVersion++;
        slapRoomId = null; slapRoom = null; slapDrawn = null;
    }
    private Task PollSlapAsync()
    {
        if (busy || slapSyncing || userId is null) return Task.CompletedTask;
        if (slapRoomId is null && panel != "slap-lobby") { slapTimer.Stop(); return Task.CompletedTask; }
        return slapActivePoll = PollSlapCoreAsync();
    }
    private async Task PollSlapCoreAsync()
    {
        var slapStore = NewSlapStore(); var me = userId!; var roomId = slapRoomId;
        var stateVersion = slapStateVersion;
        using var cancellation = new CancellationTokenSource();
        slapSyncCancellation = cancellation;
        slapSyncing = true;
        try
        {
            // Read every room from one snapshot, including rooms not currently on screen.
            var rooms = await SlapSnapshotReader.ReadAsync(slapStore.RoomsAsync, SlapReadTimeout, cancellation.Token);
            if (slapStateVersion != stateVersion || slapRoomId != roomId || userId != me || store.Folder != slapStore.Folder) return;
            // The persisted snapshot is authoritative. Request versions above already reject
            // reads started before a local action; room revisions can reset after a file restore.
            if (roomId is Guid id)
            {
                var room = rooms.FirstOrDefault(r => r.Id == id && r.Find(me) is not null);
                if (room is null)
                {
                    // A temporarily missing shared file must not eject a player from the room.
                    slapDrawn = null;
                    SetSlapSyncNote("방 정보 재확인 중…");
                    if (panel == "slap-room") SetMessage("방 정보를 확인하지 못했습니다. 현재 방을 유지하고 다시 확인합니다.");
                    return;
                }
                slapRoom = room;
                slapRooms = rooms;
                slapLastSyncUtc = DateTime.UtcNow;
                SetSlapSyncNote($"자동 갱신 · {DateTime.Now:HH:mm:ss}");
                if (panel == "slap-room") DrawSlapRoom();
            }
            else
            {
                slapRooms = rooms;
                slapLastSyncUtc = DateTime.UtcNow;
                SetSlapSyncNote($"자동 갱신 · {DateTime.Now:HH:mm:ss}");
                if (panel == "slap-lobby") DrawSlapLobby();
            }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch (Exception ex) when (IsUserError(ex) || ex is TimeoutException)
        {
            if (slapStateVersion == stateVersion && userId == me && store.Folder == slapStore.Folder && panel.StartsWith("slap"))
            {
                SetSlapSyncNote(ex is TimeoutException ? "조회 지연 · 자동 재시도 중" : "조회 실패 · 자동 재시도 중");
                SetMessage("대전 정보를 불러오지 못했습니다. 공유 폴더 연결을 확인해 주세요.\n" + ex.Message);
                // The next successful read must also clear the error when the room is unchanged.
                slapDrawn = null;
            }
        }
        finally
        {
            if (ReferenceEquals(slapSyncCancellation, cancellation)) slapSyncCancellation = null;
            slapSyncing = false;
        }
    }
    private void ShowSlapRoom()
    {
        slapDrawn = null; DrawSlapRoom();
        StartSlapTimer(); _ = PollSlapAsync();
    }
    private void DrawSlapRoom()
    {
        if (slapRoom is not { } room || userId is null) { ShowSlapLobby(); return; }
        var opponent = room.Opponent(userId);
        var signature = $"room|{userId}|{slapPower}|{JsonSerializer.Serialize(room)}";
        if (panel == "slap-room" && slapDrawn == signature) return;
        slapDrawn = signature;
        var me = room.Find(userId)!;
        if (room.Status == SlapStatus.Playing) { DrawSlapMatch(room, me, opponent!); return; }

        var finished = room.Status == SlapStatus.Finished;
        var title = finished ? (room.Winner is null ? "대전을 종료했어요" : room.Winner == userId ? "이겼어요! 짝!" : "졌어요… 얼얼하다") : opponent is null ? "상대를 기다리는 중" : "준비되면 시작!";
        BeginPanel("slap-room", $"맞짱 · {room.Title} · {(finished ? "GAME OVER" : "WAITING ROOM")}", title,
            finished ? "" : "두 사람 모두 준비 완료를 누르면 바로 시작합니다.\n방을 만든 사람(P1)이 먼저 공격합니다.");
        AddSlapSyncControls();
        if (finished)
        {
            if (room.Winner is not null) AddText($"승자  {room.Winner}", 15, "#A7F3CE", 0, 6, true);
            if (room.EndReason is not null) AddText(room.EndReason, 12, "#B6C7BC", 0, 6);
        }
        AddSlapArena(room, me, opponent);
        AddButton(me.Ready ? "준비 취소" : finished ? "다시 하기 · 준비 완료" : "준비 완료", () => SetSlapReady(!me.Ready), !me.Ready);
        AddButton("방 목록으로 · 참가 유지", ShowSlapLobby);
        AddButton("방 나가기", LeaveSlapRoom);
    }
    private void DrawSlapMatch(SlapRoom room, SlapPlayer me, SlapPlayer opponent)
    {
        var attacking = room.AttackerId == me.Id;
        BeginPanel("slap-room", $"맞짱 · {room.Title} · ROUND {room.Round}", attacking ? "내 공격 차례!" : "내 수비 차례!", "");
        AddSlapSyncControls();
        AddSlapArena(room, me, opponent);

        var full = me.Gauge >= SlapRules.MaxGauge;
        if (room.Players.Any(p => p.GaveUp))
        {
            AddText(me.GaveUp ? "포기를 요청했어요. 상대도 포기하면 대전이 종료됩니다.\n포기 요청을 취소하면 이어서 진행할 수 있어요."
                : "상대가 포기를 요청했어요. 나도 포기하면 대전이 종료됩니다.\n상대가 요청을 취소하면 이어서 진행할 수 있어요.", 12, "#F4C59D", 4, 10);
        }
        else if (me.Choice is not null)
        {
            AddText(opponent.Submitted ? "결과 확인 중…" : "상대 선택을 기다려요 · 앱을 꺼도 저장됩니다.", 11, "#91AB9C", 0, 10);
        }
        else if (attacking)
        {
            if (SlapRules.GaugeCost(slapPower) > me.Gauge) slapPower = 1;
            AddSlapRow(Enumerable.Range(1, SlapRules.MaxGauge).Select(power =>
                ($"{SlapRules.PowerName(power)}\n기 {SlapRules.GaugeCost(power)} · 피해 {SlapRules.Damage(power)}", (Action)(() => { slapPower = power; DrawSlapRoom(); }), SlapRules.GaugeCost(power) <= me.Gauge, power == slapPower)));
            AddSlapRow(Enum.GetValues<SlapZone>().Select(zone =>
                ($"{SlapRules.ZoneName(zone)}\n때리기", (Action)(() => SubmitSlap(new SlapAction(SlapMove.Slap, zone, slapPower))), true, true)));
            AddButton(full ? "기 가득 참 (3/3) · 때려야 해요" : "기 모으기  +1", () => SubmitSlap(new SlapAction(SlapMove.Charge))).IsEnabled = !full;
        }
        else
        {
            AddSlapRow(Enum.GetValues<SlapZone>().Select(zone =>
                ($"{SlapRules.ZoneName(zone)}\n막기", (Action)(() => SubmitSlap(new SlapAction(SlapMove.Block, zone))), true, true)));
            AddButton(full ? "기 가득 참 (3/3) · 막아야 해요" : "기 모으기  +1  (이번 턴은 못 막아요)", () => SubmitSlap(new SlapAction(SlapMove.Charge))).IsEnabled = !full;
        }
        AddButton(me.GaveUp ? "포기 요청 취소" : "포기하기", () => SetSlapGiveUp(!me.GaveUp)).ToolTip = "두 사람 모두 포기하면 승패 없이 대전이 종료됩니다.";
        AddButton("방 목록으로 · 대전 유지", LeaveSlapRoom);
    }
    private void AddSlapArena(SlapRoom room, SlapPlayer me, SlapPlayer? opponent)
    {
        if (SlapPresentation.ShowsResult(room)) AddText($"R{room.LastResult!.Round} 결과", 10, "#91AB9C", 0, 4);
        var arena = new UniformGrid { Rows = 1, Columns = 2, Margin = new Thickness(-3, 0, -3, 10) };
        AddFighter(me, false);
        AddFighter(opponent, true);
        DialogContent.Children.Add(arena);

        void AddFighter(SlapPlayer? player, bool right)
        {
            int index = player is null ? 1 : room.Players.IndexOf(player);
            var visual = player is null ? new SlapFighterVisual(SlapPose.Idle, "참가자 대기", "참가자를 기다리고 있어요")
                : SlapPresentation.ForPlayer(room, player.Id, me.Id);
            var name = player is null ? "P2  —" : $"P{index + 1}  {player.Id}{(player == me ? " (나)" : "")}";
            var body = new StackPanel();
            body.Children.Add(new TextBlock { Text = name, ToolTip = name, FontSize = 12, FontWeight = FontWeights.Bold,
                TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(4, 0, 4, 6) });
            var fighter = new SlapFighterView { PlayerId = player?.Id ?? "", Character = index, Visual = visual,
                Hp = player?.Hp ?? SlapRules.MaxHp, Gauge = player?.Gauge ?? 0, FacingLeft = right, Empty = player is null,
                Width = 160, ToolTip = visual.Description };
            System.Windows.Automation.AutomationProperties.SetName(fighter,
                $"{name} · 체력 {fighter.Hp}/{SlapRules.MaxHp} · 기력 {fighter.Gauge}/{SlapRules.MaxGauge} · {visual.Description}");
            body.Children.Add(new Viewbox { Child = fighter, Stretch = Stretch.Uniform, StretchDirection = StretchDirection.DownOnly });
            body.Children.Add(new TextBlock { Text = visual.Caption, ToolTip = visual.Description, TextAlignment = TextAlignment.Center,
                FontSize = 12, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(167, 243, 206)),
                TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 2, 0, 4) });
            arena.Children.Add(new Border { Child = body, Padding = new Thickness(6, 9, 6, 6), Margin = new Thickness(3, 0, 3, 0),
                CornerRadius = new CornerRadius(12), Background = new SolidColorBrush(Color.FromRgb(16, 27, 23)) });
        }
    }
    private void AddSlapRow(IEnumerable<(string Text, Action Click, bool Enabled, bool Primary)> items)
    {
        var row = new UniformGrid { Rows = 1, Margin = new Thickness(-3, 0, -3, 4) };
        foreach (var (text, click, enabled, primary) in items)
        {
            var button = new Button { Content = new TextBlock { Text = text, TextAlignment = TextAlignment.Center, TextWrapping = TextWrapping.Wrap }, Margin = new Thickness(3), Padding = new Thickness(6, 10, 6, 10), IsEnabled = enabled };
            if (primary) button.Style = (Style)FindResource("Primary");
            button.Click += (_, _) => { if (!busy) click(); };
            row.Children.Add(button);
        }
        DialogContent.Children.Add(row);
    }
}
