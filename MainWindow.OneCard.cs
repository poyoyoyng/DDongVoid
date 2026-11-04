using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using DDongVoid.Core;

namespace DDongVoid;

public partial class MainWindow
{
    private readonly DispatcherTimer oneCardTimer = new(DispatcherPriority.Normal) { Interval = TimeSpan.FromSeconds(1) };
    private Guid? oneCardRoomId;
    private OneCardRoom? oneCardRoom;
    private List<OneCardRoom> oneCardRooms = [];
    private string? oneCardDrawn;
    private bool oneCardTimerHooked, oneCardSyncing;
    private int oneCardStateVersion;
    private CancellationTokenSource? oneCardSyncCancellation;
    private Task? oneCardActivePoll;
    private string oneCardSyncNote = "동기화 확인 중…";
    private TextBlock? oneCardSyncStatus;
    private bool InOneCardMatch => oneCardRoom?.Status == OneCardStatus.Playing;
    private OneCardStore NewOneCardStore() => new(store.Folder);

    private void StartOneCardTimer()
    {
        if (!oneCardTimerHooked) { oneCardTimer.Tick += async (_, _) => await PollOneCardAsync(); oneCardTimerHooked = true; }
        oneCardTimer.Start();
    }
    private void DetachOneCardRoom()
    {
        oneCardTimer.Stop(); oneCardSyncCancellation?.Cancel(); oneCardStateVersion++;
        oneCardRoomId = null; oneCardRoom = null; oneCardDrawn = null; oneCardSyncStatus = null;
    }
    private void ShowOneCardLobby()
    {
        if (!RequireLogin()) return;
        DetachSlapRoom(); DetachCiaoRoom(); DetachOneCardRoom();
        DrawOneCardLobby(); StartOneCardTimer(); _ = PollOneCardAsync();
    }
    private void DrawOneCardLobby()
    {
        var signature = "lobby|" + userId + "|" + JsonSerializer.Serialize(oneCardRooms);
        if (panel == "onecard-lobby" && oneCardDrawn == signature) return;
        oneCardDrawn = signature;
        BeginPanel("onecard-lobby", "원카드 · 2 ~ 4인", "원카드", "");
        AddOneCardSyncControls();
        AddButton("방 만들기", CreateOneCardRoom, true);
        var mine = oneCardRooms.Where(r => r.Find(userId!) is not null).OrderByDescending(r => r.CreatedAt).ToList();
        var others = oneCardRooms.Where(r => r.Find(userId!) is null).OrderByDescending(r => r.CreatedAt).ToList();
        AddText($"내가 참가한 방 · {mine.Count}개", 13, "#A7F3CE", 12, 6, true);
        if (mine.Count == 0) AddText("참가 중인 방이 없어요.", 11, "#91AB9C", 0, 6);
        foreach (var room in mine) AddOneCardRoomEntry(room);
        AddText($"다른 방 · {others.Count}개", 13, "#A7F3CE", 12, 6, true);
        foreach (var room in others) AddOneCardRoomEntry(room);
        AddButton("돌아가기", () => { DetachOneCardRoom(); ShowGameList(); });
    }
    private void AddOneCardRoomEntry(OneCardRoom room)
    {
        var me = room.Find(userId!);
        var state = room.Status switch
        {
            OneCardStatus.Playing => me is null ? "게임 중" : $"T{room.Turn} · 이어하기",
            OneCardStatus.Finished => "결과 보기",
            _ => me is not null ? (me.Ready ? "준비 완료 · 상대 대기" : "준비 대기 · 이어하기")
                : room.Players.Count >= OneCardRules.MaxPlayers ? "가득 참" : "참가 가능",
        };
        var players = string.Join(" · ", room.Players.Select(p => p.Id));
        var button = AddButton($"{room.Title}   ·   {room.Players.Count}/{OneCardRules.MaxPlayers}\n{players}\n{state}",
            () => _ = RunOneCardAsync((s, id) => s.Join(room.Id, id)));
        button.Tag = room.Id;
        button.IsEnabled = me is not null || state == "참가 가능";
        button.Content = new TextBlock { Text = (string)button.Content, TextWrapping = TextWrapping.Wrap };
    }
    private void CreateOneCardRoom()
    {
        if (!RequireLogin()) return;
        DetachOneCardRoom();
        BeginPanel("onecard-create", "원카드 · 2 ~ 4인", "방 만들기", "방 목록에 표시할 제목을 입력해 주세요.");
        AddText($"방 제목 · 최대 {OneCardRules.MaxTitleLength}자", 12, "#B6C7BC", 0, 6);
        var title = new TextBox { Name = "OneCardRoomTitle", MaxLength = OneCardRules.MaxTitleLength, Margin = new Thickness(0, 0, 0, 12) };
        System.Windows.Automation.AutomationProperties.SetName(title, "방 제목"); DialogContent.Children.Add(title);
        AddButton("방 만들기", () =>
        {
            var input = title.Text;
            _ = RunOneCardAsync((s, id) => s.Create(id, input));
        }, true);
        AddButton("취소", ShowOneCardLobby); title.Focus();
    }
    private void RememberOneCardRoom(OneCardRoom room)
    {
        oneCardRooms.RemoveAll(r => r.Id == room.Id); oneCardRooms.Add(room);
    }
    private async Task RunOneCardAsync(Func<OneCardStore, string, OneCardRoom?> action)
    {
        if (busy || userId is null) return;
        var oneCardStore = NewOneCardStore(); var me = userId;
        var previousId = oneCardRoomId;
        var version = ++oneCardStateVersion;
        oneCardSyncCancellation?.Cancel();
        busy = true;
        var refresh = false;
        try
        {
            var room = await Task.Run(() => action(oneCardStore, me));
            if (version != oneCardStateVersion || userId != me || store.Folder != oneCardStore.Folder) return;
            oneCardRoom = room; oneCardRoomId = room?.Id;
            if (room is null)
            {
                oneCardRooms.RemoveAll(r => r.Id == previousId); ShowOneCardLobby(); return;
            }
            RememberOneCardRoom(room); oneCardDrawn = null; DrawOneCardRoom(); StartOneCardTimer(); refresh = true;
        }
        catch (Exception ex) when (IsUserError(ex))
        {
            if (version == oneCardStateVersion && userId == me && store.Folder == oneCardStore.Folder)
            {
                SetMessage(ex.Message); refresh = true;
            }
        }
        finally { busy = false; }
        if (refresh && version == oneCardStateVersion) await PollOneCardAsync();
    }
    private void SetOneCardSyncNote(string note)
    {
        oneCardSyncNote = note;
        if (oneCardSyncStatus is not null)
        {
            oneCardSyncStatus.Text = note;
            oneCardSyncStatus.ToolTip = OneCardSyncDetails();
        }
    }
    private string OneCardSyncDetails() => $"앱 버전: {UpdateService.CurrentVersion}\n저장 파일: {System.IO.Path.Combine(store.Folder, "ddongvoid-onecard.json")}"
        + (oneCardRoom is { } room ? $"\n방 ID: {room.Id}\n방 수정 번호: {room.Revision}\n현재 턴: {room.Turn}" : "");
    private void AddOneCardSyncControls()
    {
        var row = new DockPanel { Margin = new Thickness(0, 0, 0, 10), ToolTip = store.Folder };
        var refresh = new Button { Content = "새로고침", Padding = new Thickness(9, 5, 9, 5), FontSize = 11 };
        refresh.Click += async (_, _) => await RefreshOneCardAsync();
        DockPanel.SetDock(refresh, Dock.Right); row.Children.Add(refresh);
        oneCardSyncStatus = new TextBlock { Name = "OneCardSyncStatus", Text = oneCardSyncNote, FontSize = 10,
            Foreground = new SolidColorBrush(Color.FromRgb(145, 171, 156)), VerticalAlignment = VerticalAlignment.Center,
            TextWrapping = TextWrapping.Wrap, ToolTip = OneCardSyncDetails() };
        row.Children.Add(oneCardSyncStatus); DialogContent.Children.Add(row);
    }
    private async Task RefreshOneCardAsync()
    {
        if (busy || userId is null) return;
        var version = oneCardStateVersion;
        var active = oneCardActivePoll;
        oneCardSyncCancellation?.Cancel();
        if (active is not null) await active;
        if (version != oneCardStateVersion) return;
        // A manual refresh also rebuilds the controls when the file contents are unchanged.
        oneCardDrawn = null;
        SetOneCardSyncNote("다시 확인 중…");
        StartOneCardTimer();
        await PollOneCardAsync();
    }
    private Task PollOneCardAsync()
    {
        if (busy || oneCardSyncing || userId is null) return Task.CompletedTask;
        if (oneCardRoomId is null && panel != "onecard-lobby") { oneCardTimer.Stop(); return Task.CompletedTask; }
        return oneCardActivePoll = PollOneCardCoreAsync();
    }
    private async Task PollOneCardCoreAsync()
    {
        var oneCardStore = NewOneCardStore(); var me = userId!; var roomId = oneCardRoomId; var version = oneCardStateVersion;
        using var cancellation = new CancellationTokenSource();
        oneCardSyncCancellation = cancellation; oneCardSyncing = true;
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(8));
            var readToken = deadline.Token;
            var snapshot = await Task.Run(() => oneCardStore.SnapshotAsync(me, readToken), readToken).WaitAsync(readToken);
            if (version != oneCardStateVersion || userId != me || store.Folder != oneCardStore.Folder || roomId != oneCardRoomId) return;
            var rooms = snapshot.Rooms;
            if (roomId is Guid id)
            {
                var room = rooms.FirstOrDefault(r => r.Id == id && r.Find(me) is not null);
                if (room is null)
                {
                    if (snapshot.DeletedRoomIds.Contains(id))
                    {
                        oneCardRooms = rooms;
                        ShowOneCardLobby();
                        SetMessage("방장이 방을 삭제했습니다. 방 목록으로 돌아왔습니다.");
                        return;
                    }
                    // Missing data is not proof of deletion: keep the last room until a
                    // snapshot includes it again or explicitly confirms its removal.
                    oneCardDrawn = null;
                    SetOneCardSyncNote("방 정보 재확인 중…");
                    if (panel == "onecard-room") SetMessage("방 정보를 확인하지 못했습니다. 현재 방을 유지하고 다시 확인합니다.");
                    return;
                }
                oneCardRoom = room;
            }
            oneCardRooms = rooms; SetOneCardSyncNote($"자동 갱신 · {DateTime.Now:HH:mm:ss}");
            if (panel == "onecard-room") DrawOneCardRoom();
            else if (panel == "onecard-lobby") DrawOneCardLobby();
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch (Exception ex) when (IsUserError(ex) || ex is OperationCanceledException)
        {
            if (version == oneCardStateVersion && userId == me && store.Folder == oneCardStore.Folder && panel.StartsWith("onecard"))
            {
                SetOneCardSyncNote("조회 실패 · 자동 재시도 중");
                SetMessage("원카드 정보를 불러오지 못했습니다. 공유 폴더 연결을 확인해 주세요."); oneCardDrawn = null;
            }
        }
        finally
        {
            if (ReferenceEquals(oneCardSyncCancellation, cancellation)) oneCardSyncCancellation = null;
            oneCardSyncing = false;
        }
    }
    private void ShowOneCardRoom()
    {
        oneCardDrawn = null; DrawOneCardRoom(); StartOneCardTimer(); _ = PollOneCardAsync();
    }
    private void DrawOneCardRoom()
    {
        if (oneCardRoom is not { } room || userId is null || room.Find(userId) is not { } me) { ShowOneCardLobby(); return; }
        var signature = "room|" + userId + "|" + JsonSerializer.Serialize(room);
        if (panel == "onecard-room" && oneCardDrawn == signature) return;
        oneCardDrawn = signature;
        var playing = room.Status == OneCardStatus.Playing;
        var finished = room.Status == OneCardStatus.Finished;
        var title = finished ? room.Winners.Contains(userId) ? "이겼어요!" : "게임이 끝났어요"
            : playing ? room.CurrentPlayerId == userId ? "내 차례" : $"{room.CurrentPlayerId}님의 차례" : "준비되면 시작!";
        BeginPanel("onecard-room", $"원카드 · {room.Title} · {(playing ? $"TURN {room.Turn}" : finished ? "GAME OVER" : "WAITING ROOM")}", title,
            !playing && !finished ? "2~4명이 참가하고 모두 준비하면 시작합니다.\n3~4인 게임은 모두 입장한 뒤 준비해 주세요." : "");
        AddOneCardSyncControls();
        if (!playing && !finished)
        {
            AddText($"방장 · {room.HostId}", 11, "#91AB9C", 0, 6);
            foreach (var p in room.Players)
                AddText($"{p.Id}{(p.Id == userId ? " (나)" : "")} · {(p.Ready ? "준비 완료 ✓" : "준비 대기")}", 13, "#EDF4F0", 0, 8, true);
            AddText($"참가자 {room.Players.Count}/{OneCardRules.MaxPlayers}", 11, "#91AB9C", 0, 8);
        }
        else
        {
            AddOneCardTable(room, me);
            if (room.LastMessage is { } last) AddText(last, 11, "#F4C59D", 4, 8);
        }
        if (finished)
        {
            AddText($"승자  {string.Join(" · ", room.Winners)}", 15, "#A7F3CE", 0, 6, true);
            AddText(room.EndReason ?? "", 12, "#B6C7BC", 0, 6);
        }
        if (!playing)
            AddButton(me.Ready ? "준비 취소" : finished ? "다시 하기 · 준비 완료" : "준비 완료",
                () => _ = RunOneCardAsync((s, id) => s.SetReady(room.Id, id, !me.Ready)), !me.Ready);
        AddButton(playing ? "방 목록으로 · 게임 유지" : "방 목록으로 · 참가 유지", ShowOneCardLobby);
        if (room.HostId == userId)
            AddButton("방 없애기 (방장 전용)", () => _ = RunOneCardAsync((s, id) => { s.DeleteRoom(room.Id, id); return null; }));
        if (!playing) AddButton("방 나가기", () => _ = RunOneCardAsync((s, id) => { s.Leave(room.Id, id); return null; }));
        UpdateOneCardCallout(room);
    }
    private void AddOneCardTable(OneCardRoom room, OneCardPlayer me)
    {
        var players = new WrapPanel { Margin = new Thickness(0, 0, 0, 8) };
        foreach (var p in room.Players)
        {
            var current = p.Id == room.CurrentPlayerId;
            players.Children.Add(new Border { CornerRadius = new CornerRadius(6), Margin = new Thickness(0, 0, 5, 5), Padding = new Thickness(8, 6, 8, 6),
                Background = new SolidColorBrush(Color.FromRgb(current ? (byte)48 : (byte)16, current ? (byte)75 : (byte)27, current ? (byte)59 : (byte)23)),
                Child = new TextBlock { Text = $"{(current ? "▶ " : "")}{p.Id}{(p.Id == me.Id ? " (나)" : "")}\n{p.CardCount}장{(p.CardCount == 1 ? " · 원카드" : "")}",
                    TextWrapping = TextWrapping.Wrap, MaxWidth = 140, FontSize = 12, Foreground = Brushes.White } });
        }
        DialogContent.Children.Add(players);
        var table = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 8) };
        if (room.TopCard is int card)
            table.Children.Add(new Border { Background = Brushes.FloralWhite, CornerRadius = new CornerRadius(3.5), Padding = new Thickness(4), Width = 41, Height = 50,
                Child = OneCardFace(card, 21), ToolTip = OneCardRules.Effect(card) });
        table.Children.Add(new TextBlock { Text = $"{(room.Direction == 1 ? "→ 정방향" : "← 역방향")}\n{(room.ActiveSuit is { } suit ? OneCardRules.SuitName(suit) : "모든 무늬 가능")}"
                + (room.PendingAttack > 0 ? $"\n누적 공격 +{room.PendingAttack}" : ""),
            Margin = new Thickness(14, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap, MaxWidth = 145,
            Foreground = new SolidColorBrush(Color.FromRgb(167, 243, 206)), FontSize = 13 });
        DialogContent.Children.Add(table);
        if (room.Status == OneCardStatus.Playing)
            AddButton(room.PendingAttack > 0 ? $"공격 받기 · {room.PendingAttack}장" : "카드 1장 받기 · 차례 넘기기",
                () => _ = RunOneCardAsync((s, id) => s.Draw(room.Id, id, room.Revision))).IsEnabled = room.CurrentPlayerId == me.Id;
        AddText($"내 손패 · {me.CardCount}장", 12, "#A7F3CE", 0, 4, true);
        if (room.Status == OneCardStatus.Playing)
        {
            var hand = new WrapPanel { Name = "OneCardHand", Margin = new Thickness(-1, 0, -1, 6) };
            foreach (var c in me.Hand.Order())
            {
                var value = c;
                var button = new Button { Content = OneCardHandFace(c), Tag = c, Width = 29, Height = 38, Padding = new Thickness(1.5), Margin = new Thickness(1),
                    Background = Brushes.FloralWhite, ToolTip = $"{OneCardRules.Name(c)} · {OneCardRules.Effect(c)}", IsEnabled = room.CanPlay(me.Id, c) };
                System.Windows.Automation.AutomationProperties.SetName(button, $"{OneCardRules.Name(c)} 내기 · {OneCardRules.Effect(c)}");
                if (OneCardRules.Rank(value) == 7)
                {
                    var choices = new ContextMenu { PlacementTarget = button, Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom };
                    foreach (var suitOption in Enum.GetValues<CardSuit>())
                    {
                        var chosen = suitOption;
                        var option = new MenuItem { Header = OneCardRules.SuitName(chosen), Tag = chosen, FontSize = 14, Padding = new Thickness(12, 8, 12, 8) };
                        System.Windows.Automation.AutomationProperties.SetName(option, $"{OneCardRules.SuitName(chosen)}로 변경");
                        option.Click += (_, _) =>
                        {
                            choices.IsOpen = false;
                            if (!busy) _ = RunOneCardAsync((s, id) => s.Play(room.Id, id, room.Revision, value, chosen));
                        };
                        choices.Items.Add(option);
                    }
                    button.ContextMenu = choices;
                    button.Click += (_, _) => { if (!busy) choices.IsOpen = true; };
                }
                else button.Click += (_, _) => { if (!busy) _ = RunOneCardAsync((s, id) => s.Play(room.Id, id, room.Revision, value)); };
                hand.Children.Add(button);
            }
            DialogContent.Children.Add(hand);
            AddText("밝은 카드를 눌러 내세요. 상대 손패는 장수만 표시합니다.", 10, "#91AB9C", 2, 4);
        }
    }
    private static Brush OneCardInk(int card) => card >= 52 ? card == OneCardRules.ColorJoker ? Brushes.Firebrick : Brushes.SlateGray
        : OneCardRules.Suit(card) is CardSuit.Heart or CardSuit.Diamond ? Brushes.Firebrick : Brushes.DarkSlateGray;
    private static FrameworkElement OneCardHandFace(int card)
    {
        var ink = OneCardInk(card);
        var face = new StackPanel();
        if (card >= 52)
        {
            face.Children.Add(new TextBlock { Text = "★", FontWeight = FontWeights.Bold, Foreground = ink, TextAlignment = TextAlignment.Center });
            var joker = new TextBlock { FontSize = 6, FontWeight = FontWeights.Bold, Foreground = ink, TextAlignment = TextAlignment.Center };
            if (card == OneCardRules.ColorJoker)
            {
                Brush[] rainbow = [Brushes.Firebrick, Brushes.DarkOrange, Brushes.ForestGreen, Brushes.RoyalBlue, Brushes.DarkViolet];
                for (var i = 0; i < 5; i++) joker.Inlines.Add(new System.Windows.Documents.Run("JOKER"[i].ToString()) { Foreground = rainbow[i] });
            }
            else joker.Text = "JOKER";
            face.Children.Add(joker);
        }
        else
        {
            var name = OneCardRules.Name(card).Split(' ');
            face.Children.Add(new TextBlock { Text = name[1], FontWeight = FontWeights.Bold, Foreground = ink, TextAlignment = TextAlignment.Center,
                Margin = new Thickness(0, 0, 0, -3) });
            face.Children.Add(new TextBlock { Text = name[0], FontWeight = FontWeights.Bold, Foreground = ink, TextAlignment = TextAlignment.Center });
        }
        return new Viewbox { Stretch = Stretch.Uniform, Child = face };
    }
    private static FrameworkElement OneCardFace(int card, double size)
    {
        var ink = OneCardInk(card);
        var face = new StackPanel { VerticalAlignment = VerticalAlignment.Center, LayoutTransform = new ScaleTransform(.5, .5) };
        face.Children.Add(new TextBlock { Text = card >= 52 ? "★" : OneCardRules.Name(card), FontSize = size, FontWeight = FontWeights.Bold,
            Foreground = ink, TextAlignment = TextAlignment.Center });
        if (card >= 52)
        {
            var joker = new TextBlock { FontSize = 9, FontWeight = FontWeights.Bold, Foreground = ink, TextAlignment = TextAlignment.Center };
            if (card == OneCardRules.ColorJoker)
            {
                Brush[] rainbow = [Brushes.Firebrick, Brushes.DarkOrange, Brushes.ForestGreen, Brushes.RoyalBlue, Brushes.DarkViolet];
                for (var i = 0; i < 5; i++) joker.Inlines.Add(new System.Windows.Documents.Run("JOKER"[i].ToString()) { Foreground = rainbow[i] });
            }
            else joker.Text = "JOKER";
            face.Children.Add(joker);
        }
        face.Children.Add(new TextBlock { Text = OneCardRules.Effect(card), FontSize = 9, Foreground = ink,
            TextWrapping = TextWrapping.Wrap, TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 5, 0, 0) });
        return face;
    }
    private void UpdateOneCardCallout(OneCardRoom room)
    {
        if (room.Status != OneCardStatus.Playing || room.VulnerablePlayerId is not { } target) return;
        var content = new StackPanel();
        content.Children.Add(new TextBlock { Text = $"{target}님이 1장 남았어요!", TextWrapping = TextWrapping.Wrap, TextAlignment = TextAlignment.Center,
            Foreground = Brushes.White, FontSize = 15, FontWeight = FontWeights.Bold });
        var button = new Button { Name = "OneCardCallButton", Content = "원카드!", FontSize = 27, Padding = new Thickness(22, 12, 22, 12),
            Style = (Style)FindResource("Primary"), Margin = new Thickness(0, 10, 0, 6) };
        System.Windows.Automation.AutomationProperties.SetName(button, $"원카드! · {target}");
        button.Click += (_, _) => { if (!busy) _ = RunOneCardAsync((s, id) => s.Call(room.Id, id, room.Revision, target)); };
        content.Children.Add(button);
        content.Children.Add(new TextBlock { Text = target == userId ? "먼저 눌러 원카드를 선언하세요!" : "먼저 누르면 저 사람이 벌칙 1장!",
            TextWrapping = TextWrapping.Wrap, TextAlignment = TextAlignment.Center, Foreground = Brushes.White, FontSize = 11 });
        OneCardCallout.Child = content; OneCardCallout.Visibility = Visibility.Visible;
    }
}
