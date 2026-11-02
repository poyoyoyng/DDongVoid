using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Threading;
using DDongVoid.Core;

namespace DDongVoid;

// 뺨때리기: a turn-based 1:1 match synced through ddongvoid-slap.json in the shared data folder.
public partial class MainWindow
{
    private readonly DispatcherTimer slapTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private Guid? slapRoomId;
    private SlapRoom? slapRoom;
    private List<SlapRoom> slapRooms = [];
    private string? slapDrawn;
    private bool slapSyncing;
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
        DetachSlapRoom();
        slapDrawn = null; DrawSlapLobby(); StartSlapTimer(); _ = PollSlapAsync();
    }
    private void DrawSlapLobby(string? note = null)
    {
        var signature = "lobby|" + userId + "|" + string.Join(",", slapRooms.Select(r => $"{r.Id}:{r.Revision}"));
        if (panel == "slap-lobby" && slapDrawn == signature && note is null) return;
        slapDrawn = signature;
        BeginPanel("slap-lobby", "SLAP BATTLE · 1 : 1", "뺨때리기 대전", "여러 방을 만들거나 동시에 참가할 수 있어요.\n각 방에서 시간 날 때 한 턴씩 진행하고, 목록에서 이어서 플레이하세요.");
        AddText($"체력 {SlapRules.MaxHp}  ·  기본 공격력 {SlapRules.BaseDamage}  ·  기 최대 {SlapRules.MaxGauge}개\n공격: 상단·중단·하단 중 하나를 때리거나 기 모으기\n수비: 기 소모 없이 상단·중단·하단 중 하나를 막거나 기 모으기\n기본공격: 기 0 · 피해 1  /  강한 뺨: 기 1 · 피해 2\n필살뺨: 기 3 · 피해 5", 11, "#91AB9C", 0, 14);
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
        var host = room.Players.FirstOrDefault()?.Id ?? "?";
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
        var button = AddButton($"{host} 님의 방 #{room.Id.ToString("N")[..8]}   ·   {room.Players.Count}/2\n{players}\n{state}", () => JoinSlapRoom(room.Id));
        button.Tag = room.Id;
        button.IsEnabled = me is not null || state == "참가 가능";
        button.Content = new TextBlock { Text = (string)button.Content, TextWrapping = TextWrapping.Wrap };
    }
    private void RememberSlapRoom(SlapRoom room)
    {
        slapRooms.RemoveAll(r => r.Id == room.Id);
        slapRooms.Add(room);
    }
    private void LeaveSlapLobby() { slapTimer.Stop(); ShowGameList(); }
    private async Task RunSlapAsync(Func<SlapStore, string, SlapRoom?> action)
    {
        if (busy || userId is null) return;
        var slapStore = NewSlapStore(); var me = userId;
        var previousRoomId = slapRoomId;
        var stateVersion = ++slapStateVersion;
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
    private void CreateSlapRoom() => _ = RunSlapAsync((s, me) => s.Create(me));
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
        slapStateVersion++;
        slapRoomId = null; slapRoom = null; slapDrawn = null;
    }
    private async Task PollSlapAsync()
    {
        if (busy || slapSyncing || userId is null) return;
        if (slapRoomId is null && panel != "slap-lobby") { slapTimer.Stop(); return; }
        var slapStore = NewSlapStore(); var me = userId; var roomId = slapRoomId;
        var stateVersion = slapStateVersion;
        slapSyncing = true;
        try
        {
            // Read every room from one snapshot, including rooms not currently on screen.
            var rooms = await Task.Run(slapStore.Rooms);
            if (slapStateVersion != stateVersion || slapRoomId != roomId || userId != me || store.Folder != slapStore.Folder) return;
            var known = slapRooms.ToDictionary(r => r.Id);
            rooms = rooms.Select(r => known.TryGetValue(r.Id, out var previous) && previous.Revision > r.Revision ? previous : r).ToList();
            if (roomId is Guid id)
            {
                var room = rooms.FirstOrDefault(r => r.Id == id && r.Find(me) is not null);
                if (room is null)
                {
                    // A temporarily missing shared file must not eject a player from the room.
                    slapDrawn = null;
                    if (panel == "slap-room") SetMessage("방 정보를 확인하지 못했습니다. 현재 방을 유지하고 다시 확인합니다.");
                    return;
                }
                // A poll that started before one of our own moves must not paint the older state over it.
                if (slapRoom?.Id == room.Id && room.Revision < slapRoom.Revision) return;
                slapRoom = room;
                slapRooms = rooms;
                if (panel == "slap-room") DrawSlapRoom();
            }
            else
            {
                slapRooms = rooms;
                if (panel == "slap-lobby") DrawSlapLobby();
            }
        }
        catch (Exception ex) when (IsUserError(ex))
        {
            if (slapStateVersion == stateVersion && userId == me && store.Folder == slapStore.Folder && panel.StartsWith("slap"))
                SetMessage("대전 정보를 불러오지 못했습니다. 공유 폴더 연결을 확인해 주세요.\n" + ex.Message);
        }
        finally { slapSyncing = false; }
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
        var signature = $"room|{room.Id}|{room.Revision}|{slapPower}";
        if (panel == "slap-room" && slapDrawn == signature) return;
        slapDrawn = signature;
        var me = room.Find(userId)!;
        if (room.Status == SlapStatus.Playing) { DrawSlapMatch(room, me, opponent!); return; }

        var finished = room.Status == SlapStatus.Finished;
        var title = finished ? (room.Winner is null ? "대전을 종료했어요" : room.Winner == userId ? "이겼어요! 짝!" : "졌어요… 얼얼하다") : opponent is null ? "상대를 기다리는 중" : "준비되면 시작!";
        BeginPanel("slap-room", $"SLAP BATTLE · #{room.Id.ToString("N")[..8]} · {(finished ? "GAME OVER" : "WAITING ROOM")}", title,
            finished ? "" : "두 사람 모두 준비 완료를 누르면 바로 시작합니다.\n방을 만든 사람(P1)이 먼저 공격합니다.");
        if (finished)
        {
            if (room.Winner is not null) AddText($"승자  {room.Winner}", 15, "#A7F3CE", 0, 6, true);
            if (room.EndReason is not null) AddText(room.EndReason, 12, "#B6C7BC", 0, 6);
            if (room.LastResult is { } last) AddText(DescribeSlap(last, room.Players[0].Id), 12, "#B6C7BC", 0, 12);
        }
        for (int i = 0; i < room.Players.Count; i++)
        {
            var p = room.Players[i];
            var status = p.Ready ? "준비 완료 ✓" : "대기 중";
            AddSlapCard($"P{i + 1}  {p.Id}{(p == me ? " (나)" : "")}", status, p.Ready);
        }
        if (opponent is null) AddSlapCard("P2  —", "참가자를 기다리고 있어요", false);
        AddButton(me.Ready ? "준비 취소" : finished ? "다시 하기 · 준비 완료" : "준비 완료", () => SetSlapReady(!me.Ready), !me.Ready);
        AddButton("방 목록으로 · 참가 유지", ShowSlapLobby);
        AddButton("방 나가기", LeaveSlapRoom);
    }
    private void DrawSlapMatch(SlapRoom room, SlapPlayer me, SlapPlayer opponent)
    {
        var attacking = room.AttackerId == me.Id;
        BeginPanel("slap-room", $"SLAP BATTLE · #{room.Id.ToString("N")[..8]} · ROUND {room.Round}", attacking ? "내 공격 차례!" : "내 수비 차례!", "");
        AddSlapStats(me, true, attacking);
        AddSlapStats(opponent, false, !attacking);
        if (room.LastResult is { } last) AddText($"지난 턴 · {DescribeSlap(last, me.Id)}", 11, "#B6C7BC", 2, 8);

        var full = me.Gauge >= SlapRules.MaxGauge;
        if (room.Players.Any(p => p.GaveUp))
        {
            AddText(me.GaveUp ? "포기를 요청했어요. 상대도 포기하면 대전이 종료됩니다.\n포기 요청을 취소하면 이어서 진행할 수 있어요."
                : "상대가 포기를 요청했어요. 나도 포기하면 대전이 종료됩니다.\n상대가 요청을 취소하면 이어서 진행할 수 있어요.", 12, "#F4C59D", 4, 10);
        }
        else if (me.Choice is { } choice)
        {
            AddText($"선택 완료 · {DescribeChoice(choice)}", 13, "#A7F3CE", 4, 4, true);
            AddText(opponent.Submitted ? "상대도 입력했어요. 결과를 계산하는 중…" : "상대가 시간 날 때 선택하면 다음 턴으로 넘어갑니다.\n앱을 꺼도 선택한 행동은 저장됩니다.", 12, "#91AB9C", 0, 10);
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
    private void AddSlapStats(SlapPlayer p, bool mine, bool attacking)
    {
        var hearts = new string('♥', p.Hp) + new string('♡', SlapRules.MaxHp - p.Hp);
        var gauge = new string('●', p.Gauge) + new string('○', SlapRules.MaxGauge - p.Gauge);
        var input = p.GaveUp ? "  ·  포기 요청" : mine ? "" : p.Submitted ? "  ·  입력 완료 ✓" : "  ·  선택 대기";
        AddSlapCard($"{(attacking ? "공격" : "수비")}  {p.Id}{(mine ? " (나)" : "")}{input}", $"체력 {hearts}  {p.Hp}/{SlapRules.MaxHp}      기 {gauge}  {p.Gauge}/{SlapRules.MaxGauge}", mine);
    }
    private void AddSlapCard(string heading, string detail, bool highlight)
    {
        var body = new StackPanel();
        body.Children.Add(new TextBlock { Text = heading, FontSize = 13, FontWeight = FontWeights.Bold, TextTrimming = TextTrimming.CharacterEllipsis });
        body.Children.Add(new TextBlock { Text = detail, FontSize = 12, Foreground = new SolidColorBrush(Color.FromRgb(167, 243, 206)), Margin = new Thickness(0, 4, 0, 0), TextWrapping = TextWrapping.Wrap });
        DialogContent.Children.Add(new Border { Child = body, Padding = new Thickness(12, 9, 12, 9), Margin = new Thickness(0, 0, 0, 6), CornerRadius = new CornerRadius(8),
            Background = new SolidColorBrush(highlight ? Color.FromRgb(37, 61, 46) : Color.FromRgb(16, 27, 23)) });
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
    private static string DescribeChoice(SlapAction a) => a.Move switch
    {
        SlapMove.Charge => "기 모으기",
        SlapMove.Slap => $"{SlapRules.ZoneName(a.Zone!.Value)} {SlapRules.PowerName(a.Power)}",
        _ => $"{SlapRules.ZoneName(a.Zone!.Value)} 막기",
    };
    private static string DescribeSlap(SlapResult r, string topPlayerId)
    {
        var outcome = r.Attack.Move != SlapMove.Slap ? "공격 없음" : r.Blocked ? "막았다! 피해 없음" : $"짝! {r.Defender} 체력 -{r.Damage}";
        var attack = $"{r.Attacker}: {DescribeChoice(r.Attack)}";
        var defense = $"{r.Defender}: {DescribeChoice(r.Defense)}  →  {outcome}";
        return r.Attacker == topPlayerId
            ? $"R{r.Round}  {attack}\n{defense}"
            : $"R{r.Round}  {defense}\n{attack}";
    }
}
