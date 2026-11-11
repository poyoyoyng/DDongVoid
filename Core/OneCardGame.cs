using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DDongVoid.Core;

public enum OneCardStatus { Waiting, Playing, Finished }
public enum CardSuit { Spade, Heart, Diamond, Club }

public static class OneCardRules
{
    public const int MaxPlayers = 4, MaxTitleLength = 40, StartingCards = 7, DeckSize = 54;
    public const int BlackJoker = 52, ColorJoker = 53;
    // Polled faster during a game so a 원카드 press and the next turn reach every PC quickly.
    public static readonly TimeSpan MatchPollInterval = TimeSpan.FromSeconds(.25);
    public static int Rank(int card) => card < 52 ? card % 13 + 1 : 0;
    public static CardSuit Suit(int card) => (CardSuit)(card / 13);
    public static string SuitName(CardSuit suit) => suit switch
    {
        CardSuit.Spade => "♠ 스페이드", CardSuit.Heart => "♥ 하트",
        CardSuit.Diamond => "♦ 다이아몬드", _ => "♣ 클로버",
    };
    public static string Name(int card) => card switch
    {
        BlackJoker => "흑조커", ColorJoker => "컬러 조커",
        _ => $"{SuitName(Suit(card)).Split(' ')[0]} {Rank(card) switch { 1 => "A", 11 => "J", 12 => "Q", 13 => "K", var n => n.ToString() }}",
    };
    public static int Attack(int card) => card switch { ColorJoker => 7, BlackJoker or 0 => 5, _ => Rank(card) switch { 1 => 3, 2 => 2, _ => 0 } };
    public static string Effect(int card) => Attack(card) is > 0 and var damage ? $"공격 +{damage}"
        : Rank(card) switch { 3 => "2 공격 방어", 7 => "무늬 변경", 11 => "건너뛰기", 12 => "방향 전환", 13 => "한 번 더", _ => "일반 카드" };
    public static List<int> ShuffledDeck()
    {
        var cards = Enumerable.Range(0, DeckSize).ToList(); Shuffle(cards); return cards;
    }
    internal static void Shuffle(List<int> cards)
    {
        for (var i = cards.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1); (cards[i], cards[j]) = (cards[j], cards[i]);
        }
    }
    public const string Description = "2~4인 · 흑조커 1장·컬러 조커 1장 포함 54장 · 각자 7장\n"
        + "같은 무늬나 숫자 1장을 냅니다. 못 내거나 내기 싫으면 1장을 받고 차례를 마칩니다. 먼저 손패를 비우면 승리합니다.\n"
        + "2: +2 / A: +3 / ♠A: +5 / 흑조커: +5 / 컬러 조커: +7. 공격은 누적됩니다. "
        + "2에는 다른 2·같은 무늬 A·조커, A에는 다른 A·조커로 대응합니다. ♠A에는 조커, 흑조커에는 ♠A·컬러 조커만 가능하고 컬러 조커는 막을 수 없습니다. "
        + "같은 무늬 3은 2로 쌓인 공격을 모두 취소합니다. 못 막으면 누적 장수를 받고 차례를 마칩니다.\n"
        + "7: 무늬 선택 / J: 다음 사람 건너뛰기 / Q: 방향 전환(2인은 순서 유지) / K: 한 번 더. "
        + "조커는 평소 아무 카드 위에 낼 수 있고, 공격을 받은 뒤에는 아무 무늬나 낼 수 있습니다. 첫 바닥 카드는 일반 숫자이며 특수 효과가 없습니다.\n"
        + "카드 받기 아래의 원카드! 버튼은 언제든 누를 수 있습니다. 한 장 남은 본인이 누르면 선언 완료, 다른 사람이 먼저 누르면 선언하지 않은 사람이 벌칙 1장, "
        + "원카드인 사람이 없을 때 누르면 누른 사람이 벌칙 1장을 받습니다. 한 번 누르면 1초 동안 다시 누를 수 없습니다. 마지막 특수 카드로도 즉시 승리합니다.\n"
        + "더미가 떨어지면 맨 위 카드를 남기고 섞습니다. 모두 더 받을 카드도 낼 카드도 없으면 손패가 가장 적은 사람이 공동 승리합니다. "
        + "파산·여러 장 동시 내기 등 추가 지역룰은 사용하지 않습니다.";
}

public sealed class OneCardPlayer
{
    public string Id { get; set; } = "";
    public bool Ready { get; set; }
    public List<int> Hand { get; set; } = [];
    public int CardCount { get; set; }
}

public sealed class OneCardRoom
{
    public Guid Id { get; set; }
    public string Title { get; set; } = "원카드 방";
    public DateTimeOffset CreatedAt { get; set; }
    public OneCardStatus Status { get; set; }
    public int Revision { get; set; }
    public int Turn { get; set; } = 1;
    public int CurrentIndex { get; set; }
    public int Direction { get; set; } = 1;
    public int PendingAttack { get; set; }
    public CardSuit? ActiveSuit { get; set; }
    public List<int> DrawPile { get; set; } = [];
    public List<int> DiscardPile { get; set; } = [];
    public List<OneCardPlayer> Players { get; set; } = [];
    public List<string> UncalledPlayerIds { get; set; } = [];
    public string? VulnerablePlayerId => UncalledPlayerIds.FirstOrDefault();
    // Counts presses of the 원카드 button so every PC can show the speech bubble once per press.
    public int CallCount { get; set; }
    // Who pressed last, so the bubble can say who called.
    public string? LastCallerId { get; set; }
    public int EmptyDraws { get; set; }
    public List<string> Winners { get; set; } = [];
    public string? LastMessage { get; set; }
    public string? EndReason { get; set; }
    public string? HostId => Players.FirstOrDefault()?.Id;
    public string? CurrentPlayerId => Status == OneCardStatus.Playing ? Players[CurrentIndex].Id : null;
    public int? TopCard => DiscardPile.Count == 0 ? null : DiscardPile[^1];
    public OneCardPlayer? Find(string id) => Players.FirstOrDefault(p => p.Id == id);

    public void SetReady(string id, bool ready, Func<List<int>>? deckFactory = null)
    {
        var player = Find(id) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status == OneCardStatus.Playing) throw new ArgumentException("이미 게임이 진행 중입니다.");
        player.Ready = ready; Revision++;
        if (Players.Count < 2 || Players.Any(p => !p.Ready)) return;
        var deck = (deckFactory ?? OneCardRules.ShuffledDeck)();
        if (deck.Count != OneCardRules.DeckSize || !deck.Order().SequenceEqual(Enumerable.Range(0, OneCardRules.DeckSize)))
            throw new ArgumentException("카드 구성이 올바르지 않습니다.");
        DrawPile = [.. deck]; DiscardPile.Clear(); Winners.Clear(); EndReason = null;
        CurrentIndex = 0; Direction = 1; Turn = 1; PendingAttack = EmptyDraws = 0; UncalledPlayerIds.Clear();
        // Choose the neutral opener before dealing so it cannot all be in players' hands.
        var first = DrawPile.FindIndex(c => OneCardRules.Rank(c) is >= 4 and <= 10 and not 7);
        var card = DrawPile[first]; DrawPile.RemoveAt(first); DiscardPile.Add(card); ActiveSuit = OneCardRules.Suit(card);
        foreach (var p in Players) { p.Ready = false; p.Hand.Clear(); }
        for (var n = 0; n < OneCardRules.StartingCards; n++)
            foreach (var p in Players) { p.Hand.Add(DrawPile[^1]); DrawPile.RemoveAt(DrawPile.Count - 1); }
        Status = OneCardStatus.Playing; LastMessage = "각자 7장씩 받았습니다. 입장 순서대로 시작합니다."; UpdateCounts();
    }
    public void CheckAction(string id, int revision, bool ownTurn = true)
    {
        if (Find(id) is null) throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status != OneCardStatus.Playing) throw new ArgumentException("게임이 진행 중이 아닙니다.");
        if (Revision != revision) throw new ArgumentException("방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.");
        if (ownTurn && CurrentPlayerId != id) throw new ArgumentException("내 차례가 아닙니다.");
    }
    public bool CanPlay(string id, int card)
    {
        if (Status != OneCardStatus.Playing || CurrentPlayerId != id || Find(id)?.Hand.Contains(card) != true || TopCard is not int top) return false;
        if (PendingAttack == 0)
            return card >= 52 || ActiveSuit is null || OneCardRules.Suit(card) == ActiveSuit || OneCardRules.Rank(card) == OneCardRules.Rank(top);
        if (top == OneCardRules.ColorJoker) return false;
        if (top == OneCardRules.BlackJoker) return card == 0 || card >= 52;
        if (top == 0) return card >= 52;
        if (card >= 52) return true;
        if (OneCardRules.Rank(top) == 2)
            return OneCardRules.Rank(card) == 2 || OneCardRules.Suit(card) == ActiveSuit && OneCardRules.Rank(card) is 1 or 3;
        return OneCardRules.Rank(top) == 1 && OneCardRules.Rank(card) == 1;
    }
    public void Play(string id, int revision, int card, CardSuit? chosenSuit = null)
    {
        CheckAction(id, revision);
        if (!CanPlay(id, card)) throw new ArgumentException("지금 낼 수 없는 카드입니다.");
        if (OneCardRules.Rank(card) == 7 && (chosenSuit is null || !Enum.IsDefined(chosenSuit.Value)))
            throw new ArgumentException("7을 낼 때는 다음 무늬를 선택해 주세요.");
        var player = Find(id)!;
        UncalledPlayerIds.Remove(id); EmptyDraws = 0; player.Hand.Remove(card); DiscardPile.Add(card);
        ActiveSuit = card >= 52 ? null : OneCardRules.Rank(card) == 7 ? chosenSuit : OneCardRules.Suit(card);
        if (OneCardRules.Rank(card) == 3 && PendingAttack > 0) PendingAttack = 0;
        else PendingAttack += OneCardRules.Attack(card);
        LastMessage = $"{id} · {OneCardRules.Name(card)} · {OneCardRules.Effect(card)}";
        if (OneCardRules.Rank(card) == 7) LastMessage += $" → {OneCardRules.SuitName(ActiveSuit!.Value)}";
        UpdateCounts(); Revision++;
        if (player.Hand.Count == 0) { Finish([id], "손패를 모두 냈습니다!"); return; }
        if (player.Hand.Count == 1) UncalledPlayerIds.Add(id);
        var rank = OneCardRules.Rank(card);
        if (rank == 12) Direction *= -1;
        Advance(rank == 13 ? 0 : rank == 11 ? 2 : 1);
    }
    public void Draw(string id, int revision)
    {
        CheckAction(id, revision);
        // An empty draw is a pass only if this player truly has no legal card.
        if (DrawPile.Count == 0 && DiscardPile.Count == 1 && Find(id)!.Hand.Any(c => CanPlay(id, c)))
            throw new ArgumentException("받을 카드가 없습니다. 낼 수 있는 카드를 내 주세요.");
        UncalledPlayerIds.Remove(id);
        var requested = Math.Max(1, PendingAttack); var drawn = Take(Find(id)!, requested);
        EmptyDraws = drawn == 0 && PendingAttack == 0 ? EmptyDraws + 1 : 0; PendingAttack = 0;
        LastMessage = $"{id} · 카드 {drawn}장 받기" + (drawn < requested ? $" (남은 카드 부족 · 요청 {requested}장)" : "");
        Revision++; UpdateCounts(); Advance(1);
        if (EmptyDraws >= Players.Count)
        {
            var least = Players.Min(p => p.Hand.Count);
            Finish(Players.Where(p => p.Hand.Count == least).Select(p => p.Id).ToList(), "카드 소진 · 가장 적은 손패로 승부");
        }
    }
    // The 원카드 button is always open and judged on the state when the press arrives, not the presser's screen:
    // a presser down to one card declares, otherwise the first undeclared player is caught,
    // and with nobody left to call the presser takes the penalty card.
    public void Call(string id)
    {
        var presser = Find(id) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status != OneCardStatus.Playing) throw new ArgumentException("게임이 진행 중이 아닙니다.");
        var target = UncalledPlayerIds.Contains(id) ? id : VulnerablePlayerId;
        Revision++; CallCount++; LastCallerId = id;
        if (target is not null) UncalledPlayerIds.Remove(target);
        if (target == id) { LastMessage = $"{id} · 원카드!"; return; }
        var penalized = target is null ? presser : Find(target)!;
        var drawn = Take(penalized, 1); UpdateCounts(); EmptyDraws = 0;
        LastMessage = target is null ? $"{id} · 원카드인 사람이 없어 벌칙 {drawn}장" : $"{id} · {target}의 원카드 미선언 지적 · 벌칙 {drawn}장";
    }
    private int Take(OneCardPlayer player, int count)
    {
        var drawn = 0;
        while (drawn < count)
        {
            if (DrawPile.Count == 0)
            {
                if (DiscardPile.Count <= 1) break;
                DrawPile.AddRange(DiscardPile.Take(DiscardPile.Count - 1));
                DiscardPile = [DiscardPile[^1]]; OneCardRules.Shuffle(DrawPile);
            }
            player.Hand.Add(DrawPile[^1]); DrawPile.RemoveAt(DrawPile.Count - 1); drawn++;
        }
        return drawn;
    }
    private void UpdateCounts() { foreach (var p in Players) p.CardCount = p.Hand.Count; }
    private void Advance(int steps) { CurrentIndex = (CurrentIndex + Direction * steps % Players.Count + Players.Count) % Players.Count; Turn++; }
    private void Finish(List<string> winners, string reason) { Winners = winners; EndReason = reason; Status = OneCardStatus.Finished; UncalledPlayerIds.Clear(); }
    public OneCardRoom ViewFor(string viewer)
    {
        var copy = JsonSerializer.Deserialize<OneCardRoom>(JsonSerializer.Serialize(this))!;
        copy.DrawPile.Clear();
        foreach (var p in copy.Players) if (p.Id != viewer) p.Hand.Clear();
        return copy;
    }
}

public sealed class OneCardDatabase
{
    public int Version { get; set; } = 1;
    public List<OneCardRoom> Rooms { get; set; } = [];
    public List<Guid> DeletedRoomIds { get; set; } = [];
}

public sealed record OneCardSnapshot(List<OneCardRoom> Rooms, List<Guid> DeletedRoomIds);

public sealed class OneCardStore
{
    public string Folder { get; }
    public string FilePath => Path.Combine(Folder, "ddongvoid-onecard.json");

    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, Converters = { new JsonStringEnumConverter() } };
    public OneCardStore(string folder) { Folder = Path.GetFullPath(folder); }
    private static OneCardDatabase Validate(OneCardDatabase? db)
    {
        if (db is null || db.Version != 1 || db.Rooms is null || db.DeletedRoomIds is null ||
            db.DeletedRoomIds.Any(id => id == Guid.Empty) || db.DeletedRoomIds.Distinct().Count() != db.DeletedRoomIds.Count ||
            db.Rooms.Select(r => r?.Id).Distinct().Count() != db.Rooms.Count) throw new JsonException();
        foreach (var r in db.Rooms)
        {
            if (r is null || r.Id == Guid.Empty || db.DeletedRoomIds.Contains(r.Id) ||
                string.IsNullOrWhiteSpace(r.Title) || r.Title.Length > OneCardRules.MaxTitleLength ||
                r.Players is null || r.Players.Count is < 1 or > OneCardRules.MaxPlayers ||
                r.Players.Any(p => p is null || string.IsNullOrWhiteSpace(p.Id) || p.Hand is null || p.CardCount != p.Hand.Count) ||
                r.Players.Select(p => p.Id).Distinct().Count() != r.Players.Count ||
                !Enum.IsDefined(r.Status) || r.Revision < 0 || r.Turn < 1 || r.CurrentIndex < 0 || r.CurrentIndex >= r.Players.Count ||
                r.Direction is not (1 or -1) || r.PendingAttack < 0 || r.EmptyDraws < 0 || r.CallCount < 0 || r.DrawPile is null || r.DiscardPile is null ||
                (r.ActiveSuit is { } suit && !Enum.IsDefined(suit)) || r.Winners is null ||
                r.Winners.Distinct().Count() != r.Winners.Count || r.Winners.Any(id => r.Find(id) is null) ||
                r.UncalledPlayerIds is null || r.UncalledPlayerIds.Distinct().Count() != r.UncalledPlayerIds.Count ||
                r.UncalledPlayerIds.Any(target => r.Status != OneCardStatus.Playing || r.Find(target)?.Hand.Count != 1))
                throw new JsonException();
            var cards = r.DrawPile.Concat(r.DiscardPile).Concat(r.Players.SelectMany(p => p.Hand)).Order().ToArray();
            if (r.Status == OneCardStatus.Waiting)
            {
                if (cards.Length != 0 || r.Winners.Count != 0 || r.PendingAttack != 0) throw new JsonException();
            }
            else if (r.Players.Count < 2 || r.DiscardPile.Count == 0 ||
                !cards.SequenceEqual(Enumerable.Range(0, OneCardRules.DeckSize)) ||
                (r.TopCard < 52 && r.ActiveSuit is null) ||
                (r.PendingAttack > 0 && OneCardRules.Attack(r.TopCard!.Value) == 0) ||
                (r.Status == OneCardStatus.Playing && (r.Winners.Count != 0 || r.Players.Any(p => p.Hand.Count == 0))) ||
                (r.Status == OneCardStatus.Finished && r.Winners.Count == 0)) throw new JsonException();
        }
        return db;
    }
    private async Task<OneCardDatabase> ReadAsync(CancellationToken cancellation = default)
    {
        cancellation.ThrowIfCancellationRequested();
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                await using var file = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete,
                    4096, FileOptions.Asynchronous | FileOptions.SequentialScan);
                return Validate(await JsonSerializer.DeserializeAsync<OneCardDatabase>(file, JsonOptions, cancellation).ConfigureAwait(false));
            }
            catch (IOException ex) when (attempt < 20 && (ex.HResult & 0xffff) is 32 or 33)
            { await Task.Delay(25, cancellation).ConfigureAwait(false); }
            catch (FileNotFoundException) { return new(); }
            catch (DirectoryNotFoundException) { return new(); }
            catch (JsonException ex) { throw new InvalidDataException("원카드 JSON 형식이 올바르지 않습니다. 기존 방을 보호하기 위해 파일을 보존했습니다.", ex); }
        }
    }
    private T Write<T>(Func<OneCardDatabase, T> action) => SharedFile.Locked(FilePath, ".ddongvoid-onecard.lock", true,
        "다른 PC에서 원카드 정보를 저장 중입니다. 잠시 후 다시 시도해 주세요.", () =>
        {
            var db = ReadAsync().GetAwaiter().GetResult();
            var result = action(db); Validate(db); SharedFile.WriteAtomic(FilePath, db, JsonOptions); return result;
        });
    private static OneCardRoom Room(OneCardDatabase db, Guid id) => db.Rooms.FirstOrDefault(r => r.Id == id)
        ?? throw new ArgumentException("방이 사라졌습니다. 방 목록에서 다시 골라 주세요.");
    public async Task<OneCardSnapshot> SnapshotAsync(string viewer, CancellationToken cancellation = default)
    {
        var db = await ReadAsync(cancellation).ConfigureAwait(false);
        return new(db.Rooms.OrderBy(r => r.CreatedAt).Select(r => r.ViewFor(viewer)).ToList(), db.DeletedRoomIds.ToList());
    }
    public async Task<List<OneCardRoom>> RoomsAsync(string viewer, CancellationToken cancellation = default) =>
        (await SnapshotAsync(viewer, cancellation).ConfigureAwait(false)).Rooms;
    public List<OneCardRoom> Rooms(string viewer) => RoomsAsync(viewer).GetAwaiter().GetResult();
    public OneCardRoom Create(string userId, string title)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("방 제목을 입력해 주세요.");
        title = title.Trim();
        if (title.Length > OneCardRules.MaxTitleLength) throw new ArgumentException($"방 제목은 {OneCardRules.MaxTitleLength}자까지 입력할 수 있습니다.");
        return Write(db =>
        {
            var room = new OneCardRoom { Id = Guid.NewGuid(), Title = title, CreatedAt = DateTimeOffset.UtcNow, Players = [new() { Id = userId }] };
            db.Rooms.Add(room); return room.ViewFor(userId);
        });
    }
    public OneCardRoom Join(Guid id, string userId) => Write(db =>
    {
        var room = Room(db, id);
        if (room.Find(userId) is not null) return room.ViewFor(userId);
        if (room.Status != OneCardStatus.Waiting) throw new ArgumentException("이미 시작했거나 종료한 방입니다.");
        if (room.Players.Count >= OneCardRules.MaxPlayers) throw new ArgumentException("이미 4명이 참가한 방입니다.");
        room.Players.Add(new() { Id = userId }); room.Revision++; return room.ViewFor(userId);
    });
    public OneCardRoom SetReady(Guid id, string userId, bool ready) => Write(db =>
    {
        var room = Room(db, id); room.SetReady(userId, ready); return room.ViewFor(userId);
    });
    private OneCardRoom Act(Guid id, string userId, Action<OneCardRoom> action) => Write(db =>
    {
        var room = Room(db, id); action(room); return room.ViewFor(userId);
    });
    public OneCardRoom Play(Guid id, string userId, int revision, int card, CardSuit? suit = null) =>
        Act(id, userId, room => room.Play(userId, revision, card, suit));
    public OneCardRoom Draw(Guid id, string userId, int revision) => Act(id, userId, room => room.Draw(userId, revision));
    public OneCardRoom Call(Guid id, string userId) => Act(id, userId, room => room.Call(userId));
    public void DeleteRoom(Guid id, string userId) => Write(db =>
    {
        var room = Room(db, id);
        if (room.HostId != userId) throw new ArgumentException("방장만 방을 없앨 수 있습니다.");
        db.Rooms.Remove(room);
        db.DeletedRoomIds.Add(id);
        return true;
    });
    public void Leave(Guid id, string userId) => Write(db =>
    {
        var room = Room(db, id);
        if (room.Find(userId) is null) throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (room.Status == OneCardStatus.Playing) return false; // Closing the view preserves an ongoing game.
        room.Players.RemoveAll(p => p.Id == userId);
        foreach (var player in room.Players) player.Ready = false;
        room.Status = OneCardStatus.Waiting; room.CurrentIndex = 0; room.Direction = 1; room.Turn = 1;
        room.PendingAttack = room.EmptyDraws = 0; room.ActiveSuit = null; room.UncalledPlayerIds.Clear();
        room.DrawPile.Clear(); room.DiscardPile.Clear(); room.Winners.Clear(); room.LastMessage = room.EndReason = null;
        foreach (var player in room.Players) { player.Hand.Clear(); player.CardCount = 0; }
        room.Revision++;
        if (room.Players.Count == 0) { db.Rooms.Remove(room); db.DeletedRoomIds.Add(id); }
        return true;
    });
}
