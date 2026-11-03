using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using DDongVoid.Core;

namespace DDongVoid;

public partial class MainWindow
{
    private readonly DispatcherTimer ciaoTimer = new(DispatcherPriority.Normal) { Interval = TimeSpan.FromSeconds(1) };
    private Guid? ciaoRoomId;
    private CiaoRoom? ciaoRoom;
    private List<CiaoRoom> ciaoRooms = [];
    private string? ciaoDrawn;
    private bool ciaoTimerHooked, ciaoSyncing;
    private int ciaoStateVersion;
    private CancellationTokenSource? ciaoSyncCancellation;
    private Task? ciaoActivePoll;
    private string ciaoSyncNote = "동기화 확인 중…";
    private TextBlock? ciaoSyncStatus;
    private TextBlock? ciaoResponseCountdown;
    private bool InCiaoMatch => ciaoRoom?.Status == CiaoStatus.Playing;
    private CiaoStore NewCiaoStore() => new(store.Folder);

    private void StartCiaoTimer()
    {
        if (!ciaoTimerHooked) { ciaoTimer.Tick += async (_, _) => await PollCiaoAsync(); ciaoTimerHooked = true; }
        ciaoTimer.Start();
    }
    private void DetachCiaoRoom()
    {
        ciaoTimer.Stop(); ciaoSyncCancellation?.Cancel(); ciaoStateVersion++;
        ciaoRoomId = null; ciaoRoom = null; ciaoDrawn = null; ciaoSyncStatus = null; ciaoResponseCountdown = null;
    }
    private void ShowCiaoLobby()
    {
        if (!RequireLogin()) return;
        DetachSlapRoom(); DetachCiaoRoom();
        DrawCiaoLobby(); StartCiaoTimer(); _ = PollCiaoAsync();
    }
    private void DrawCiaoLobby()
    {
        var signature = "lobby|" + userId + "|" + JsonSerializer.Serialize(ciaoRooms);
        if (panel == "ciao-lobby" && ciaoDrawn == signature) return;
        ciaoDrawn = signature;
        BeginPanel("ciao-lobby", "차오차오 · 2 ~ 4인", "차오차오", "");
        AddCiaoSyncControls();
        AddButton("방 만들기", CreateCiaoRoom, true);
        var mine = ciaoRooms.Where(r => r.Find(userId!) is not null).OrderByDescending(r => r.CreatedAt).ToList();
        var others = ciaoRooms.Where(r => r.Find(userId!) is null).OrderByDescending(r => r.CreatedAt).ToList();
        AddText($"내가 참가한 방 · {mine.Count}개", 13, "#A7F3CE", 12, 6, true);
        if (mine.Count == 0) AddText("참가 중인 방이 없어요.", 11, "#91AB9C", 0, 6);
        foreach (var room in mine) AddCiaoRoomEntry(room);
        AddText($"다른 방 · {others.Count}개", 13, "#A7F3CE", 12, 6, true);
        foreach (var room in others) AddCiaoRoomEntry(room);
        AddButton("돌아가기", () => { DetachCiaoRoom(); ShowGameList(); });
    }
    private void AddCiaoRoomEntry(CiaoRoom room)
    {
        var me = room.Find(userId!);
        var state = room.Status switch
        {
            CiaoStatus.Playing => me is null ? "게임 중" : $"T{room.Turn} · 이어하기",
            CiaoStatus.Finished => "결과 보기",
            _ => me is not null ? (me.Ready ? "준비 완료 · 상대 대기" : "준비 대기 · 이어하기")
                : room.Players.Count >= CiaoRules.MaxPlayers ? "가득 참" : "참가 가능",
        };
        var players = string.Join(" · ", room.Players.Select(p => p.Id));
        var button = AddButton($"{room.Title}   ·   {room.Players.Count}/{CiaoRules.MaxPlayers}\n{players}\n{state}",
            () => _ = RunCiaoAsync((s, id) => s.Join(room.Id, id)));
        button.Tag = room.Id;
        button.IsEnabled = me is not null || state == "참가 가능";
        button.Content = new TextBlock { Text = (string)button.Content, TextWrapping = TextWrapping.Wrap };
    }
    private void CreateCiaoRoom()
    {
        if (!RequireLogin()) return;
        DetachCiaoRoom();
        BeginPanel("ciao-create", "차오차오 · 2 ~ 4인", "방 만들기", "방 목록에 표시할 제목을 입력해 주세요.");
        AddText($"방 제목 · 최대 {CiaoRules.MaxTitleLength}자", 12, "#B6C7BC", 0, 6);
        var title = new TextBox { Name = "CiaoRoomTitle", MaxLength = CiaoRules.MaxTitleLength, Margin = new Thickness(0, 0, 0, 12) };
        System.Windows.Automation.AutomationProperties.SetName(title, "방 제목"); DialogContent.Children.Add(title);
        AddButton("방 만들기", () =>
        {
            var input = title.Text;
            _ = RunCiaoAsync((s, id) => s.Create(id, input));
        }, true);
        AddButton("취소", ShowCiaoLobby); title.Focus();
    }
    private void RememberCiaoRoom(CiaoRoom room)
    {
        ciaoRooms.RemoveAll(r => r.Id == room.Id); ciaoRooms.Add(room);
    }
    private async Task RunCiaoAsync(Func<CiaoStore, string, CiaoRoom?> action)
    {
        if (busy || userId is null) return;
        var ciaoStore = NewCiaoStore(); var me = userId;
        var previousId = ciaoRoomId;
        var version = ++ciaoStateVersion;
        ciaoSyncCancellation?.Cancel();
        busy = true;
        var refresh = false;
        try
        {
            var room = await Task.Run(() => action(ciaoStore, me));
            if (version != ciaoStateVersion || userId != me || store.Folder != ciaoStore.Folder) return;
            ciaoRoom = room; ciaoRoomId = room?.Id;
            if (room is null)
            {
                ciaoRooms.RemoveAll(r => r.Id == previousId); ShowCiaoLobby(); return;
            }
            RememberCiaoRoom(room); ciaoDrawn = null; DrawCiaoRoom(); StartCiaoTimer(); refresh = true;
        }
        catch (Exception ex) when (IsUserError(ex))
        {
            if (version == ciaoStateVersion && userId == me && store.Folder == ciaoStore.Folder)
            {
                SetMessage(ex.Message); refresh = true;
            }
        }
        finally { busy = false; }
        if (refresh && version == ciaoStateVersion) await PollCiaoAsync();
    }
    private void SetCiaoSyncNote(string note)
    {
        ciaoSyncNote = note;
        if (ciaoSyncStatus is not null)
        {
            ciaoSyncStatus.Text = note;
            ciaoSyncStatus.ToolTip = CiaoSyncDetails();
        }
    }
    private string CiaoSyncDetails() => $"앱 버전: {UpdateService.CurrentVersion}\n저장 파일: {System.IO.Path.Combine(store.Folder, "ddongvoid-ciao.json")}"
        + (ciaoRoom is { } room ? $"\n방 ID: {room.Id}\n방 수정 번호: {room.Revision}\n현재 턴: {room.Turn}" : "");
    private void AddCiaoSyncControls()
    {
        var row = new DockPanel { Margin = new Thickness(0, 0, 0, 10), ToolTip = store.Folder };
        var refresh = new Button { Content = "새로고침", Padding = new Thickness(9, 5, 9, 5), FontSize = 11 };
        refresh.Click += async (_, _) => await RefreshCiaoAsync();
        DockPanel.SetDock(refresh, Dock.Right); row.Children.Add(refresh);
        ciaoSyncStatus = new TextBlock { Name = "CiaoSyncStatus", Text = ciaoSyncNote, FontSize = 10,
            Foreground = new SolidColorBrush(Color.FromRgb(145, 171, 156)), VerticalAlignment = VerticalAlignment.Center,
            TextWrapping = TextWrapping.Wrap, ToolTip = CiaoSyncDetails() };
        row.Children.Add(ciaoSyncStatus); DialogContent.Children.Add(row);
    }
    private async Task RefreshCiaoAsync()
    {
        if (busy || userId is null) return;
        var version = ciaoStateVersion;
        var active = ciaoActivePoll;
        ciaoSyncCancellation?.Cancel();
        if (active is not null) await active;
        if (version != ciaoStateVersion) return;
        // A manual refresh also rebuilds the controls when the file contents are unchanged.
        ciaoDrawn = null;
        SetCiaoSyncNote("다시 확인 중…");
        StartCiaoTimer();
        await PollCiaoAsync();
    }
    private Task PollCiaoAsync()
    {
        if (busy || ciaoSyncing || userId is null) return Task.CompletedTask;
        if (ciaoRoomId is null && panel != "ciao-lobby") { ciaoTimer.Stop(); return Task.CompletedTask; }
        return ciaoActivePoll = PollCiaoCoreAsync();
    }
    private async Task PollCiaoCoreAsync()
    {
        var ciaoStore = NewCiaoStore(); var me = userId!; var roomId = ciaoRoomId; var version = ciaoStateVersion;
        using var cancellation = new CancellationTokenSource();
        ciaoSyncCancellation = cancellation; ciaoSyncing = true;
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(8));
            var rooms = await Task.Run(() => ciaoStore.RoomsAsync(me, deadline.Token), deadline.Token).WaitAsync(deadline.Token);
            if (version != ciaoStateVersion || userId != me || store.Folder != ciaoStore.Folder || roomId != ciaoRoomId) return;
            if (roomId is Guid id)
            {
                var room = rooms.FirstOrDefault(r => r.Id == id && r.Find(me) is not null);
                if (room is null)
                {
                    ciaoRooms = rooms;
                    ShowCiaoLobby();
                    SetMessage("방장이 방을 삭제했습니다. 방 목록으로 돌아왔습니다.");
                    return;
                }
                ciaoRoom = room;
            }
            ciaoRooms = rooms; SetCiaoSyncNote($"자동 갱신 · {DateTime.Now:HH:mm:ss}");
            if (panel == "ciao-room") DrawCiaoRoom();
            else if (panel == "ciao-lobby") DrawCiaoLobby();
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch (Exception ex) when (IsUserError(ex) || ex is OperationCanceledException)
        {
            if (version == ciaoStateVersion && userId == me && store.Folder == ciaoStore.Folder && panel.StartsWith("ciao"))
            {
                SetCiaoSyncNote("조회 실패 · 자동 재시도 중");
                SetMessage("차오차오 정보를 불러오지 못했습니다. 공유 폴더 연결을 확인해 주세요."); ciaoDrawn = null;
            }
        }
        finally
        {
            if (ReferenceEquals(ciaoSyncCancellation, cancellation)) ciaoSyncCancellation = null;
            ciaoSyncing = false;
        }
    }
    private void ShowCiaoRoom()
    {
        ciaoDrawn = null; DrawCiaoRoom(); StartCiaoTimer(); _ = PollCiaoAsync();
    }
    private void DrawCiaoRoom()
    {
        if (ciaoRoom is not { } room || userId is null || room.Find(userId) is not { } me) { ShowCiaoLobby(); return; }
        if (ciaoResponseCountdown is not null) ciaoResponseCountdown.Text = CiaoResponseTimeText(room);
        var signature = "room|" + userId + "|" + JsonSerializer.Serialize(room);
        if (panel == "ciao-room" && ciaoDrawn == signature) return;
        ciaoDrawn = signature;
        ciaoResponseCountdown = null;
        var playing = room.Status == CiaoStatus.Playing;
        var finished = room.Status == CiaoStatus.Finished;
        var title = finished ? room.Winners.Contains(userId) ? "이겼어요!" : "게임이 끝났어요"
            : playing ? room.SpeakerId == userId ? "내 차례" : room.CanRespond(userId!) ? "응답 차례" : "상대 차례" : "준비되면 시작!";
        BeginPanel("ciao-room", $"차오차오 · {room.Title} · {(playing ? $"TURN {room.Turn}" : finished ? "GAME OVER" : "WAITING ROOM")}", title,
            !playing && !finished ? "2~4명이 참가하고 모두 준비하면 시작합니다." : "");
        AddCiaoSyncControls();
        AddText($"방장 · {room.HostId}", 11, "#91AB9C", 0, 6);
        if (!playing && !finished)
        {
            foreach (var player in room.Players)
                AddText($"P{room.Players.IndexOf(player) + 1}  {player.Id}{(player.Id == userId ? " (나)" : "")} · {(player.Ready ? "준비 완료 ✓" : "준비 대기")}", 13, "#EDF4F0", 0, 8, true);
            AddText($"참가자 {room.Players.Count}/{CiaoRules.MaxPlayers}", 11, "#91AB9C", 0, 8);
        }
        else
        {
            if (playing) AddCiaoActions(room, me);
            if (room.LastResult is { } result) AddText($"T{result.Turn} · {result.Message}", 11, "#F4C59D", 4, 10);
            AddCiaoBoard(room);
        }
        if (finished)
        {
            AddText($"승자  {string.Join(" · ", room.Winners)}", 15, "#A7F3CE", 0, 6, true);
            AddText(room.EndReason ?? "", 12, "#B6C7BC", 0, 6);
        }
        if (!playing)
            AddButton(me.Ready ? "준비 취소" : finished ? "다시 하기 · 준비 완료" : "준비 완료",
                () => _ = RunCiaoAsync((s, id) => s.SetReady(room.Id, id, !me.Ready)), !me.Ready);
        AddButton(playing ? "방 목록으로 · 게임 유지" : "방 목록으로 · 참가 유지", ShowCiaoLobby);
        if (room.HostId == userId)
            AddButton("방 없애기 (방장 전용)", () => _ = RunCiaoAsync((s, id) => { s.DeleteRoom(room.Id, id); return null; }));
        if (!playing) AddButton("방 나가기", () => _ = RunCiaoAsync((s, id) => { s.Leave(room.Id, id); return null; }));
    }
    private static string CiaoResponseTimeText(CiaoRoom room)
    {
        var seconds = room.ResponseDeadline is { } deadline
            ? Math.Clamp((int)Math.Ceiling((deadline - DateTimeOffset.UtcNow).TotalSeconds), 0, CiaoRules.ResponseTimeoutSeconds)
            : CiaoRules.ResponseTimeoutSeconds;
        return $"남은 {seconds}초 · 미응답 시 자동 PASS";
    }
    private void AddCiaoActions(CiaoRoom room, CiaoPlayer me)
    {
        var mine = room.SpeakerId == me.Id;
        if (room.Phase == CiaoPhase.Roll)
        {
            if (mine) AddButton("주사위 굴리기", () => _ = RunCiaoAsync((s, id) => s.Roll(room.Id, id, room.Revision)), true);
            else AddText($"{room.SpeakerId}님이 주사위를 굴릴 차례입니다.", 12, "#91AB9C");
            return;
        }
        if (mine && room.Die is int die)
        {
            AddText($"내 주사위  {CiaoRules.DieName(die)}", 20, "#A7F3CE", 0, 6, true).Name = "CiaoPrivateDie";
            if (die == 0 && room.Phase == CiaoPhase.Declare) AddText("X가 나왔어요. 숫자를 골라 블러핑하세요.", 11, "#F4C59D", 0, 6);
        }
        if (room.Phase == CiaoPhase.Declare)
        {
            if (mine)
            {
                AddText("나왔다고 말할 숫자를 고르세요.", 11, "#91AB9C", 0, 6);
                var row = new UniformGrid { Rows = 1, Columns = CiaoRules.MaxDeclaration, Margin = new Thickness(-2, 0, -2, 8) };
                for (int number = 1; number <= CiaoRules.MaxDeclaration; number++)
                {
                    var value = number;
                    var button = new Button { Content = value.ToString(), Tag = value, ToolTip = $"{value} 선언", Padding = new Thickness(2, 8, 2, 8), Margin = new Thickness(2), FontSize = 16 };
                    System.Windows.Automation.AutomationProperties.SetName(button, $"{value} 선언");
                    button.Click += (_, _) => { if (!busy) _ = RunCiaoAsync((s, id) => s.Declare(room.Id, id, room.Revision, value)); };
                    row.Children.Add(button);
                }
                DialogContent.Children.Add(row);
            }
            else AddText($"{room.SpeakerId}님이 숫자를 선언하고 있어요. 주사위는 비공개입니다.", 12, "#91AB9C");
        }
        else
        {
            AddText($"{room.SpeakerId}님의 선언  {room.Declaration}", 18, "#A7F3CE", 0, 8, true);
            AddText("동시 응답 · 먼저 접수된 의심으로 판정", 12, "#91AB9C", 0, 4);
            ciaoResponseCountdown = AddText(CiaoResponseTimeText(room), 11, "#F4C59D", 0, 4);
            AddText($"응답 대기 · {string.Join(" · ", room.PendingResponderIds)}", 11, "#91AB9C", 0, 6);
            if (!mine)
            {
                var allowed = room.CanRespond(me.Id);
                AddButton("PASS", () => _ = RunCiaoAsync((s, id) => s.Respond(room.Id, id, room.Revision, false))).IsEnabled = allowed;
                AddButton("의심", () => _ = RunCiaoAsync((s, id) => s.Respond(room.Id, id, room.Revision, true)), true).IsEnabled = allowed;
                if (allowed && me.Position is null && me.GoalScores.Count > 0)
                    AddText($"의심이 틀리면 도착한 {me.GoalScores.Min()}점 말이 떨어집니다.", 11, "#F4C59D", 4, 4);
            }
            if (room.Passed.Count > 0) AddText($"PASS · {string.Join(" · ", room.Passed)}", 11, "#91AB9C", 4, 4);
        }
    }
    private void AddCiaoBoard(CiaoRoom room)
    {
        string[] colors = ["#A7F3CE", "#F4C59D", "#99CFFF", "#D5B2FF"];
        AddText("공용 이동판 · 9칸", 11, "#91AB9C", 4, 5);
        var track = new UniformGrid { Name = "CiaoSharedTrack", Rows = 2, Columns = 5, Margin = new Thickness(-1, 0, -1, 8) };
        int[] steps = [0, 1, 2, 3, 4, 9, 8, 7, 6, 5];
        foreach (var step in steps)
        {
            var label = step == 0 ? "S →" : step == CiaoRules.Finish ? "G" : step == 4 ? "4 ↓" : step < 4 ? $"{step} →" : $"← {step}";
            var body = new StackPanel();
            body.Children.Add(new TextBlock { Text = label, FontSize = 10, TextAlignment = TextAlignment.Center,
                Foreground = new SolidColorBrush(Color.FromRgb(145, 171, 156)), Margin = new Thickness(0, 0, 0, 2) });
            var pawns = new UniformGrid { Rows = 2, Columns = 2, Height = 26 };
            for (int i = 0; i < CiaoRules.MaxPlayers; i++)
            {
                var slot = new Border();
                if (i < room.Players.Count && room.Players[i].Position == step)
                {
                    var player = room.Players[i];
                    slot.Child = CiaoPawn(colors[i], $"P{i + 1} {player.Id} · 현재 {step}칸", "ciao-active:" + player.Id, true);
                }
                pawns.Children.Add(slot);
            }
            body.Children.Add(pawns);
            var cell = new Border { Tag = step, CornerRadius = new CornerRadius(5), Margin = new Thickness(1), Padding = new Thickness(2, 3, 2, 3),
                Background = new SolidColorBrush(Color.FromRgb(16, 27, 23)), Child = body };
            var occupants = string.Join(" · ", room.Players.Where(p => p.Position == step).Select(p => p.Id));
            System.Windows.Automation.AutomationProperties.SetName(cell, $"{(step == 0 ? "출발" : step == CiaoRules.Finish ? "도착" : $"{step}칸")} · {occupants}");
            track.Children.Add(cell);
        }
        DialogContent.Children.Add(track);
        for (int i = 0; i < room.Players.Count; i++)
        {
            var player = room.Players[i]; var color = colors[i];
            AddText($"{(room.SpeakerId == player.Id ? "▶ " : "")}P{i + 1}  {player.Id}{(player.Id == userId ? " (나)" : "")}", 12, color, 0, 3, true);
            var remaining = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 7) };
            remaining.Children.Add(new TextBlock { Text = "남은 말", FontSize = 10, Width = 44, VerticalAlignment = VerticalAlignment.Center,
                Foreground = new SolidColorBrush(Color.FromRgb(145, 171, 156)) });
            if (player.Position is int position)
                remaining.Children.Add(CiaoPawn(color, $"{player.Id} · 이동 중인 말 · {position}칸", "ciao-remaining-active:" + player.Id, true));
            for (int pawn = 0; pawn < player.Reserve; pawn++)
            {
                remaining.Children.Add(CiaoPawn(color, $"{player.Id} · 대기 중인 말 {pawn + 1}", "ciao-reserve:" + player.Id));
            }
            var count = player.Reserve + (player.Position is null ? 0 : 1);
            remaining.Children.Add(new TextBlock { Text = $" {count}개", FontSize = 10, VerticalAlignment = VerticalAlignment.Center,
                Foreground = new SolidColorBrush(Color.FromRgb(145, 171, 156)) });
            System.Windows.Automation.AutomationProperties.SetName(remaining, $"{player.Id} · 남은 말 {count}개 · 대기 {player.Reserve}개");
            DialogContent.Children.Add(remaining);
        }
        AddText("도착대 · 탈락한 자리는 다시 사용하지 않음", 11, "#91AB9C", 0, 4);
        var podium = new UniformGrid { Rows = 1, Columns = CiaoRules.PodiumSize, Margin = new Thickness(0, 0, 0, 6) };
        for (int score = 1; score <= CiaoRules.PodiumSize; score++)
        {
            var owner = room.Players.FindIndex(p => p.GoalScores.Contains(score));
            var vacated = owner < 0 && score <= room.UsedPodiumSlots;
            var slot = new StackPanel { Margin = new Thickness(1) };
            slot.Children.Add(new TextBlock { Text = vacated ? $"{score}×" : score.ToString(), FontSize = 10, TextAlignment = TextAlignment.Center,
                Foreground = new SolidColorBrush(Color.FromRgb(145, 171, 156)), Margin = new Thickness(0, 0, 0, 3) });
            slot.Children.Add(CiaoPawn(owner < 0 ? vacated ? "#26362D" : "#40574A" : colors[owner],
                owner < 0 ? vacated ? $"{score}점 · 탈락한 자리 · 재사용 안 함" : $"{score}점 · 빈자리"
                    : $"{score}점 · {room.Players[owner].Id}", "ciao-goal:" + score));
            podium.Children.Add(slot);
        }
        DialogContent.Children.Add(podium);
    }
    private static Ellipse CiaoPawn(string color, string description, string tag, bool active = false)
    {
        var pawn = new Ellipse { Width = 10, Height = 10, Margin = new Thickness(1), Tag = tag, ToolTip = description,
            HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
            Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color)),
            Stroke = active ? Brushes.White : Brushes.Transparent, StrokeThickness = active ? 1.2 : 0 };
        System.Windows.Automation.AutomationProperties.SetName(pawn, description);
        return pawn;
    }
}
