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
    private static readonly TimeSpan SlapHeartbeatEvery = TimeSpan.FromSeconds(3);
    // An opponent whose heartbeat has not moved for this long (on this PC's clock) forfeits.
    private static readonly TimeSpan SlapOpponentTimeout = TimeSpan.FromSeconds(20);
    private readonly DispatcherTimer slapTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private Guid? slapRoomId;
    private SlapRoom? slapRoom;
    private List<SlapRoom> slapRooms = [];
    private string? slapDrawn;
    private bool slapSyncing;
    private int slapPower = 1;
    private DateTime slapLastBeat;
    // Last heartbeat seen per player (room id + player id) and when it last changed, on this PC's clock.
    private readonly Dictionary<string, (int Beat, DateTime Changed)> slapBeats = [];
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
        slapDrawn = null; DrawSlapLobby(); StartSlapTimer(); _ = PollSlapAsync();
    }
    private void DrawSlapLobby(string? note = null)
    {
        var signature = "lobby|" + string.Join(",", slapRooms.Select(r => $"{r.Id}:{r.Revision}:{SlapRoomStale(r)}"));
        if (panel == "slap-lobby" && slapDrawn == signature && note is null) return;
        slapDrawn = signature;
        BeginPanel("slap-lobby", "SLAP BATTLE · 1 : 1", "뺨때리기 대전", "같은 저장 폴더를 쓰는 사람과 턴제로 겨룹니다.\n방을 만들거나 열린 방에 참가하세요.");
        AddText($"체력 {SlapRules.MaxHp}  ·  기본 공격력 {SlapRules.BaseDamage}  ·  기 최대 {SlapRules.MaxGauge}개\n공격: 상단·중단·하단 중 하나를 때리거나 기 모으기\n수비: 기 소모 없이 상단·중단·하단 중 하나를 막거나 기 모으기\n기본공격: 기 0 · 피해 1  /  강한 뺨: 기 1 · 피해 2\n필살뺨: 기 3 · 피해 5", 11, "#91AB9C", 0, 14);
        AddButton("방 만들기", CreateSlapRoom, true);
        if (slapRooms.Count == 0) AddText("열린 방이 없어요. 방을 만들고 상대를 기다려 보세요.", 12, "#91AB9C", 10, 6);
        foreach (var room in slapRooms)
        {
            var host = room.Players.FirstOrDefault()?.Id ?? "?";
            var stale = SlapRoomStale(room);
            var state = stale ? "응답 없음" : room.Status == SlapStatus.Playing ? "게임 중" : room.Players.Count >= 2 ? "가득 참" : "참가 가능";
            var button = AddButton($"{host} 님의 방   ·   {room.Players.Count}/2   ·   {state}", () => JoinSlapRoom(room.Id));
            button.IsEnabled = state == "참가 가능";
        }
        AddButton("돌아가기", LeaveSlapLobby);
        if (note is not null) SetMessage(note);
    }
    private bool SlapRoomStale(SlapRoom room) => room.Players.Count > 0 && room.Players.All(p => SlapSilentFor(room, p) > SlapOpponentTimeout);
    // Time since this PC last saw the player's heartbeat change; zero until a change could have been observed.
    private TimeSpan SlapSilentFor(SlapRoom room, SlapPlayer player)
    {
        var key = room.Id + "|" + player.Id;
        var now = DateTime.UtcNow;
        if (!slapBeats.TryGetValue(key, out var seen) || seen.Beat != player.Heartbeat) { slapBeats[key] = (player.Heartbeat, now); return TimeSpan.Zero; }
        return now - seen.Changed;
    }
    private void LeaveSlapLobby() { slapTimer.Stop(); ShowGameList(); }
    private async Task RunSlapAsync(Func<SlapStore, SlapRoom?> action)
    {
        if (busy || userId is null) return;
        var slapStore = NewSlapStore();
        busy = true;
        try
        {
            var room = await Task.Run(() => action(slapStore));
            if (store.Folder != slapStore.Folder) return;
            slapRoom = room; slapRoomId = room?.Id;
            if (room is null) { DrawSlapLobby("방에서 나왔습니다."); return; }
            slapDrawn = null; DrawSlapRoom(); StartSlapTimer();
        }
        catch (Exception ex) when (IsUserError(ex)) { SetMessage(ex.Message); }
        finally { busy = false; }
    }
    private void CreateSlapRoom() => _ = RunSlapAsync(s => s.Create(userId!));
    private void JoinSlapRoom(Guid id) => _ = RunSlapAsync(s => s.Join(id, userId!));
    private void SetSlapReady(bool ready) => _ = RunSlapAsync(s => s.SetReady(slapRoomId!.Value, userId!, ready));
    private void SubmitSlap(SlapAction action) => _ = RunSlapAsync(s => s.Submit(slapRoomId!.Value, userId!, action));
    private void LeaveSlapRoom()
    {
        if (InSlapMatch && MessageBox.Show(this, "대전 중에 나가면 기권패가 됩니다. 나갈까요?", "뺨때리기", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        if (slapRoomId is not Guid id) { ShowSlapLobby(); return; }
        _ = RunSlapAsync(s => { s.Leave(id, userId!); return null; });
    }
    // Best-effort exit for logout, folder change and app close; the opponent's timeout covers any failure.
    private void AbandonSlapRoom()
    {
        slapTimer.Stop();
        if (slapRoomId is Guid id && userId is not null)
        {
            try { NewSlapStore().Leave(id, userId); } catch (Exception ex) when (IsUserError(ex)) { }
        }
        slapRoomId = null; slapRoom = null; slapDrawn = null;
    }
    private async Task PollSlapAsync()
    {
        if (slapSyncing || userId is null) return;
        if (slapRoomId is null && panel != "slap-lobby") { slapTimer.Stop(); return; }
        var slapStore = NewSlapStore(); var me = userId; var roomId = slapRoomId;
        var beat = roomId is not null && DateTime.UtcNow - slapLastBeat >= SlapHeartbeatEvery;
        slapSyncing = true;
        try
        {
            if (roomId is Guid id)
            {
                var room = await Task.Run(() => slapStore.Sync(id, me, beat));
                if (beat) slapLastBeat = DateTime.UtcNow;
                if (slapRoomId != id || userId != me || store.Folder != slapStore.Folder) return;
                if (room is null)
                {
                    slapRoomId = null; slapRoom = null;
                    if (panel.StartsWith("slap")) DrawSlapLobby("방에서 나가졌습니다. 연결이 오래 끊겼거나 다른 창에서 나갔을 수 있어요.");
                    return;
                }
                // A poll that started before one of our own moves must not paint the older state over it.
                if (slapRoom?.Id == room.Id && room.Revision < slapRoom.Revision) return;
                slapRoom = room;
                if (room.Opponent(me) is { } opponent && SlapSilentFor(room, opponent) > SlapOpponentTimeout && !busy)
                {
                    var seen = opponent.Heartbeat;
                    slapRoom = await Task.Run(() => slapStore.Kick(id, me, opponent.Id, seen)) ?? slapRoom;
                }
                if (panel == "slap-room") DrawSlapRoom();
            }
            else
            {
                var rooms = await Task.Run(slapStore.Rooms);
                if (slapRoomId is not null || store.Folder != slapStore.Folder) return;
                slapRooms = rooms;
                if (panel == "slap-lobby") DrawSlapLobby();
            }
        }
        catch (Exception ex) when (IsUserError(ex))
        {
            if (panel.StartsWith("slap")) SetMessage("대전 정보를 불러오지 못했습니다. 공유 폴더 연결을 확인해 주세요.\n" + ex.Message);
        }
        finally { slapSyncing = false; }
    }
    private void ShowSlapRoom() { slapDrawn = null; DrawSlapRoom(); }
    private void DrawSlapRoom()
    {
        if (slapRoom is not { } room || userId is null) { ShowSlapLobby(); return; }
        var opponent = room.Opponent(userId);
        var lagging = opponent is not null && SlapSilentFor(room, opponent) > TimeSpan.FromSeconds(8);
        var signature = $"room|{room.Id}|{room.Revision}|{lagging}|{slapPower}";
        if (panel == "slap-room" && slapDrawn == signature) return;
        slapDrawn = signature;
        var me = room.Find(userId)!;
        if (room.Status == SlapStatus.Playing) { DrawSlapMatch(room, me, opponent!, lagging); return; }

        var finished = room.Status == SlapStatus.Finished;
        var title = finished ? (room.Winner == userId ? "이겼어요! 짝!" : "졌어요… 얼얼하다") : opponent is null ? "상대를 기다리는 중" : "준비되면 시작!";
        BeginPanel("slap-room", finished ? "SLAP BATTLE · GAME OVER" : "SLAP BATTLE · WAITING ROOM", title,
            finished ? "" : "두 사람 모두 준비 완료를 누르면 바로 시작합니다.\n방을 만든 사람(P1)이 먼저 공격합니다.");
        if (finished)
        {
            AddText($"승자  {room.Winner}", 15, "#A7F3CE", 0, 6, true);
            if (room.EndReason is not null) AddText(room.EndReason, 12, "#B6C7BC", 0, 6);
            if (room.LastResult is { } last) AddText(DescribeSlap(last, room.Players[0].Id), 12, "#B6C7BC", 0, 12);
        }
        for (int i = 0; i < room.Players.Count; i++)
        {
            var p = room.Players[i];
            var status = p.Ready ? "준비 완료 ✓" : "대기 중";
            if (p != me && lagging) status += "  ·  응답 없음";
            AddSlapCard($"P{i + 1}  {p.Id}{(p == me ? " (나)" : "")}", status, p.Ready);
        }
        if (opponent is null) AddSlapCard("P2  —", "참가자를 기다리고 있어요", false);
        AddButton(me.Ready ? "준비 취소" : finished ? "다시 하기 · 준비 완료" : "준비 완료", () => SetSlapReady(!me.Ready), !me.Ready);
        AddButton("방 나가기", LeaveSlapRoom);
    }
    private void DrawSlapMatch(SlapRoom room, SlapPlayer me, SlapPlayer opponent, bool lagging)
    {
        var attacking = room.AttackerId == me.Id;
        BeginPanel("slap-room", $"SLAP BATTLE · ROUND {room.Round}", attacking ? "내 공격 차례!" : "내 수비 차례!", "");
        AddSlapStats(me, true, attacking);
        AddSlapStats(opponent, false, !attacking, lagging);
        if (room.LastResult is { } last) AddText($"지난 턴 · {DescribeSlap(last, me.Id)}", 11, "#B6C7BC", 2, 8);

        var full = me.Gauge >= SlapRules.MaxGauge;
        if (me.Choice is { } choice)
        {
            AddText($"선택 완료 · {DescribeChoice(choice)}", 13, "#A7F3CE", 4, 4, true);
            AddText(opponent.Submitted ? "상대도 입력했어요. 결과를 계산하는 중…" : "상대가 고르는 중입니다. 잠시 기다려 주세요.", 12, "#91AB9C", 0, 10);
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
        AddButton("기권하고 나가기", LeaveSlapRoom);
    }
    private void AddSlapStats(SlapPlayer p, bool mine, bool attacking, bool lagging = false)
    {
        var hearts = new string('♥', p.Hp) + new string('♡', SlapRules.MaxHp - p.Hp);
        var gauge = new string('●', p.Gauge) + new string('○', SlapRules.MaxGauge - p.Gauge);
        var input = mine ? "" : lagging ? "  ·  응답 없음" : p.Submitted ? "  ·  입력 완료 ✓" : "  ·  고르는 중…";
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
