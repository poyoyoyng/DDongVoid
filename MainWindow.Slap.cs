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
        BeginPanel("slap-lobby", "SLAP BATTLE · 1 : 1", "뺨때리기 대전", "서로 시간 날 때 한 턴씩 진행하세요. 앱을 꺼도 대전은 유지됩니다.\n참가한 방의 이어하기를 누르면 계속할 수 있어요.");
        AddText($"체력 {SlapRules.MaxHp}  ·  기본 공격력 {SlapRules.BaseDamage}  ·  기 최대 {SlapRules.MaxGauge}개\n공격: 상단·중단·하단 중 하나를 때리거나 기 모으기\n수비: 기 소모 없이 상단·중단·하단 중 하나를 막거나 기 모으기\n기본공격: 기 0 · 피해 1  /  강한 뺨: 기 1 · 피해 2\n필살뺨: 기 3 · 피해 5", 11, "#91AB9C", 0, 14);
        AddButton("방 만들기", CreateSlapRoom, true);
        if (slapRooms.Count == 0) AddText("열린 방이 없어요. 방을 만들고 상대를 기다려 보세요.", 12, "#91AB9C", 10, 6);
        foreach (var room in slapRooms.OrderByDescending(r => r.Find(userId!) is not null))
        {
            var host = room.Players.FirstOrDefault()?.Id ?? "?";
            var mine = room.Find(userId!) is not null;
            var state = mine ? room.Status == SlapStatus.Finished ? "결과 보기" : "이어하기"
                : room.Status == SlapStatus.Playing ? "게임 중" : room.Players.Count >= 2 ? "가득 참" : "참가 가능";
            var button = AddButton($"{host} 님의 방   ·   {room.Players.Count}/2   ·   {state}", () => JoinSlapRoom(room.Id));
            button.IsEnabled = mine || state == "참가 가능";
        }
        AddButton("돌아가기", LeaveSlapLobby);
        if (note is not null) SetMessage(note);
    }
    private void LeaveSlapLobby() { slapTimer.Stop(); ShowGameList(); }
    private async Task RunSlapAsync(Func<SlapStore, string, SlapRoom?> action)
    {
        if (busy || userId is null) return;
        var slapStore = NewSlapStore(); var me = userId;
        var stateVersion = ++slapStateVersion;
        busy = true;
        try
        {
            var room = await Task.Run(() => action(slapStore, me));
            if (slapStateVersion != stateVersion || userId != me || store.Folder != slapStore.Folder) return;
            slapRoom = room; slapRoomId = room?.Id;
            if (room is null) { ShowSlapLobby(); SetMessage("방에서 나왔습니다."); return; }
            slapDrawn = null; DrawSlapRoom(); StartSlapTimer();
        }
        catch (Exception ex) when (IsUserError(ex))
        {
            if (slapStateVersion == stateVersion && userId == me && store.Folder == slapStore.Folder) SetMessage(ex.Message);
        }
        finally { busy = false; }
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
            if (roomId is Guid id)
            {
                var room = await Task.Run(() => slapStore.Sync(id, me));
                if (slapStateVersion != stateVersion || slapRoomId != id || userId != me || store.Folder != slapStore.Folder) return;
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
                if (panel == "slap-room") DrawSlapRoom();
            }
            else
            {
                var rooms = await Task.Run(slapStore.Rooms);
                if (slapStateVersion != stateVersion || slapRoomId is not null || userId != me || store.Folder != slapStore.Folder) return;
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
    private void ShowSlapRoom() { slapDrawn = null; DrawSlapRoom(); }
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
        BeginPanel("slap-room", finished ? "SLAP BATTLE · GAME OVER" : "SLAP BATTLE · WAITING ROOM", title,
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
        AddButton("방 나가기", LeaveSlapRoom);
    }
    private void DrawSlapMatch(SlapRoom room, SlapPlayer me, SlapPlayer opponent)
    {
        var attacking = room.AttackerId == me.Id;
        BeginPanel("slap-room", $"SLAP BATTLE · ROUND {room.Round}", attacking ? "내 공격 차례!" : "내 수비 차례!", "");
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
