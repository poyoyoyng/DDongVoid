using System.Text.Json;
using DDongVoid.Core;

internal static class OneCardChecks
{
    public static void Run(string root, Action<string, Action> check, Action<bool, string> assert)
    {
        void Reject(Action action)
        {
            try { action(); } catch (ArgumentException) { return; }
            throw new Exception("허용되지 않은 동작이 성공했습니다.");
        }
        // A complete deck allows the same fixtures to exercise on-disk validation.
        OneCardRoom Table(int top, params int[][] hands)
        {
            var used = hands.SelectMany(h => h).Append(top).ToArray();
            if (used.Distinct().Count() != used.Length) throw new Exception("테스트 카드 중복");
            return new OneCardRoom
            {
                Id = Guid.NewGuid(), Status = OneCardStatus.Playing, ActiveSuit = top >= 52 ? null : OneCardRules.Suit(top), DiscardPile = [top],
                Players = hands.Select((h, i) => new OneCardPlayer { Id = $"p{i}", Hand = [.. h], CardCount = h.Length }).ToList(),
                DrawPile = Enumerable.Range(0, OneCardRules.DeckSize).Except(used).ToList(),
            };
        }
        void Conserve(OneCardRoom room) => assert(room.Players.SelectMany(p => p.Hand).Concat(room.DrawPile).Concat(room.DiscardPile)
            .Order().SequenceEqual(Enumerable.Range(0, OneCardRules.DeckSize)), "카드 누락·중복");
        check("원카드 흑조커 1장·컬러 조커 1장·총 54장과 연속 공격", () =>
        {
            var deck = OneCardRules.ShuffledDeck();
            assert(deck.Count == 54 && deck.Count(c => OneCardRules.Name(c) == "흑조커") == 1
                && deck.Count(c => OneCardRules.Name(c) == "컬러 조커") == 1, "조커 구성 오류");
            var r = Table(4, [52, 8], [53, 20], [42, 43]);
            r.Play("p0", r.Revision, 52); r.Play("p1", r.Revision, 53);
            assert(r.PendingAttack == 12 && !r.CanPlay("p2", 42), "흑조커·컬러 조커 누적 오류");
            r.Draw("p2", r.Revision); assert(r.Players[2].CardCount == 14 && r.PendingAttack == 0, "조커 공격 받기 오류"); Conserve(r);
        });
        check("원카드 2·3·4인 준비와 7장 배분·일반 카드 시작", () =>
        {
            for (var n = 2; n <= 4; n++)
            {
                var r = new OneCardRoom { Players = Enumerable.Range(0, n).Select(i => new OneCardPlayer { Id = $"p{i}" }).ToList() };
                for (var i = 0; i < n - 1; i++) r.SetReady($"p{i}", true);
                assert(r.Status == OneCardStatus.Waiting, "모두 준비하기 전 시작");
                r.SetReady($"p{n - 1}", true, () => Enumerable.Range(0, OneCardRules.DeckSize).ToList());
                assert(r.Players.All(p => p.Hand.Count == 7 && p.CardCount == 7 && !p.Ready) && r.DrawPile.Count == OneCardRules.DeckSize - 1 - 7 * n, "잘못된 배분");
                assert(r.CurrentPlayerId == "p0" && OneCardRules.Attack(r.TopCard!.Value) == 0 && OneCardRules.Rank(r.TopCard.Value) is not (7 or 11 or 12 or 13), "선공 효과");
                Conserve(r);
            }
        });
        check("원카드 무늬·숫자 일치와 불법 선택·다른 차례·오래된 입력 거부", () =>
        {
            var r = Table(4, [5, 17, 20, 52], [10, 11]);
            assert(r.CanPlay("p0", 5) && r.CanPlay("p0", 17) && r.CanPlay("p0", 52) && !r.CanPlay("p0", 20), "내기 판정 오류");
            Reject(() => r.Play("p1", r.Revision, 10)); Reject(() => r.Play("p0", -1, 5)); Reject(() => r.Play("p0", 0, 20));
            Reject(() => r.Play("p0", 0, 99)); Reject(() => r.Draw("없는사람", 0));
            r.Play("p0", 0, 5); assert(r.CurrentPlayerId == "p1" && r.Players[0].CardCount == 3, "턴·장수 오류"); Conserve(r);
        });
        check("원카드 2 누적 공격과 같은 무늬 3 방어", () =>
        {
            var r = Table(4, [1, 9], [14, 20], [15, 30]);
            r.Play("p0", 0, 1); r.Play("p1", r.Revision, 14);
            assert(r.PendingAttack == 4 && r.CanPlay("p2", 15), "공격 누적·방어 판정 오류");
            r.Play("p2", r.Revision, 15); assert(r.PendingAttack == 0 && r.CurrentPlayerId == "p0", "3 방어 실패"); Conserve(r);
        });
        check("원카드 공격 승급·약한 공격 거부·조커 최상위", () =>
        {
            var r = Table(1, [0, 13, 52, 53, 14, 2], [8, 9]); r.PendingAttack = 2;
            assert(r.CanPlay("p0", 0) && r.CanPlay("p0", 2) && !r.CanPlay("p0", 13), "2 대응 무늬 오류");
            r.DiscardPile = [13]; r.ActiveSuit = CardSuit.Heart; r.PendingAttack = 3;
            assert(!r.CanPlay("p0", 14) && r.CanPlay("p0", 0), "A 대응 오류");
            r.DiscardPile = [0]; r.ActiveSuit = CardSuit.Spade; r.PendingAttack = 5;
            assert(!r.CanPlay("p0", 13) && r.CanPlay("p0", 52), "스페이드 A 대응 오류");
            r.DiscardPile = [52]; r.ActiveSuit = null;
            assert(r.CanPlay("p0", 0) && !r.CanPlay("p0", 13) && r.CanPlay("p0", 53), "흑조커 대응 오류");
            r.DiscardPile = [53]; assert(!r.CanPlay("p0", 0) && !r.CanPlay("p0", 52), "컬러 조커 방어 허용");
        });
        check("원카드 누적 공격 받으면 실제 장수 증가·턴 종료·조커 뒤 자유 내기", () =>
        {
            var r = Table(53, [3, 8], [18, 22]); r.PendingAttack = 12;
            r.Draw("p0", 0); assert(r.Players[0].Hand.Count == 14 && r.PendingAttack == 0 && r.CurrentPlayerId == "p1" && r.CanPlay("p1", 18), "공격 받기 오류"); Conserve(r);
        });
        check("원카드 7 선택 무늬 검증과 같은 숫자 연결", () =>
        {
            var r = Table(4, [6, 8], [13, 19, 29]);
            Reject(() => r.Play("p0", 0, 6)); Reject(() => r.Play("p0", 0, 6, (CardSuit)99));
            r.Play("p0", 0, 6, CardSuit.Diamond);
            assert(r.ActiveSuit == CardSuit.Diamond && r.CanPlay("p1", 29) && r.CanPlay("p1", 19) && !r.CanPlay("p1", 13), "무늬 변경 오류"); Conserve(r);
        });
        check("원카드 J·Q·K 2·3·4인 차례 처리", () =>
        {
            for (var count = 2; count <= 4; count++)
                foreach (var special in new[] { 10, 11, 12 })
                {
                    var hands = Enumerable.Range(0, count).Select(i => i == 0 ? new[] { special, 8 } : new[] { 13 * i + 3, 13 * i + 4 }).ToArray();
                    var r = Table(4, hands); r.Play("p0", 0, special);
                    var next = special == 10 ? 2 % count : special == 11 ? count - 1 : 0;
                    assert(r.CurrentIndex == next && r.Direction == (special == 11 ? -1 : 1), "특수 차례 처리 오류"); Conserve(r);
                }
        });
        check("원카드 버튼: 선언 안 한 사람을 남이 먼저 누르면 그 사람이 정확히 1장", () =>
        {
            var r = Table(4, [5, 8], [18, 20], [31, 30]);
            r.Play("p0", 0, 5); assert(r.VulnerablePlayerId == "p0", "원카드 대상 누락");
            r.Call("p2");
            assert(r.Players[0].Hand.Count == 2 && r.Players[2].Hand.Count == 2 && r.VulnerablePlayerId is null && r.CurrentPlayerId == "p1", "벌칙 대상·턴 오류");
            Conserve(r);
        });
        check("원카드 버튼: 원카드인 사람이 없을 때 누르면 누른 사람이 1장", () =>
        {
            var r = Table(4, [5, 8], [18, 20], [31, 30]);
            r.Call("p1");
            assert(r.Players[1].Hand.Count == 3 && r.Players.Where(p => p.Id != "p1").All(p => p.Hand.Count == 2) && r.CurrentPlayerId == "p0",
                "아무도 1장이 아닐 때 누른 사람 벌칙 오류");
            r.Play("p0", r.Revision, 5); r.Call("p0"); r.Call("p2");
            assert(r.Players[0].Hand.Count == 1 && r.Players[2].Hand.Count == 3, "선언 끝난 뒤 늦게 누른 사람 벌칙 오류");
            Reject(() => r.Call("없는사람")); Conserve(r);
        });
        check("원카드 버튼: 한 장 남은 본인이 누르면 벌칙 없이 선언·누른 횟수 기록", () =>
        {
            var r = Table(4, [5, 8], [18, 20]); r.Play("p0", 0, 5);
            var revision = r.Revision; r.Call("p0");
            assert(r.Players[0].CardCount == 1 && r.VulnerablePlayerId is null && r.Revision == revision + 1, "본인 클릭 시 벌칙");
            assert(r.CallCount == 1 && r.LastCallerId == "p0", "원카드 버튼 누른 횟수와 누른 사람이 말풍선용으로 기록되지 않음"); Conserve(r);
        });
        check("원카드 여러 명 1장일 때 선언 대상을 순서대로 보존·본인은 자기 선언", () =>
        {
            var r = Table(4, [5, 8], [18, 20], [31, 30]); r.Play("p0", 0, 5); r.Play("p1", r.Revision, 18);
            assert(r.UncalledPlayerIds.SequenceEqual(new[] { "p0", "p1" }), "다음 턴에서 기존 대상 유실");
            r.Call("p1"); assert(r.VulnerablePlayerId == "p0" && r.Players[0].CardCount == 1 && r.Players[1].CardCount == 1, "뒤 순서 본인 선언이 앞 사람을 지적함");
            r.Call("p0"); assert(r.VulnerablePlayerId is null, "앞 사람 선언 누락");
            r = Table(4, [5, 8], [18, 20], [31, 30]); r.Play("p0", 0, 5); r.Play("p1", r.Revision, 18);
            r.Call("p0"); assert(r.VulnerablePlayerId == "p1", "다음 대상 누락");
            r.Draw("p2", r.Revision); assert(r.VulnerablePlayerId == "p1", "타인 받기에 대상 유실"); Conserve(r);
        });
        check("원카드 대상 손패 변경·마지막 공격 카드 즉시 종료", () =>
        {
            var r = Table(4, [12, 0], [18, 20]); r.Play("p0", 0, 12); r.Draw("p0", r.Revision);
            assert(r.VulnerablePlayerId is null && r.Players[0].CardCount == 2, "손패 변경 뒤 버튼 유지");
            r = Table(4, [0], [18, 20]); r.Play("p0", 0, 0);
            assert(r.Status == OneCardStatus.Finished && r.Winners.SequenceEqual(new[] { "p0" }) && r.VulnerablePlayerId is null, "마지막 카드 종료 오류"); Conserve(r);
        });
        check("원카드 더미 재활용·맨 위 카드 보존·공격 장수 부족", () =>
        {
            var r = Table(53, [3, 8], Enumerable.Range(0, 53).Except(new[] { 3, 8 }).ToArray());
            r.PendingAttack = 7; r.Draw("p0", 0);
            assert(r.Players[0].Hand.Count == 2 && r.PendingAttack == 0 && r.CurrentIndex == 1, "빈 더미 공격 처리 오류"); Conserve(r);
            r = Table(4, [5, 8], [18, 20]); r.DiscardPile.Insert(0, r.DrawPile[^1]); r.DrawPile.RemoveAt(r.DrawPile.Count - 1);
            r.Players[1].Hand.AddRange(r.DrawPile); r.DrawPile.Clear(); r.Players[1].CardCount = r.Players[1].Hand.Count;
            r.Draw("p0", 0); assert(r.TopCard == 4 && r.DiscardPile.Count == 1 && r.Players[0].CardCount == 3, "더미 재활용 오류"); Conserve(r);
        });
        check("원카드 손패 비공개·조회 결과 변경이 원본에 영향 없음", () =>
        {
            var r = Table(4, [5, 8], [18, 20]); var view = r.ViewFor("p0");
            assert(view.Players[0].Hand.Count == 2 && view.Players[1].Hand.Count == 0 && view.Players[1].CardCount == 2 && view.DrawPile.Count == 0, "손패·더미 노출");
            view.Players[0].Hand.Clear(); assert(r.Players[0].Hand.Count == 2 && r.DrawPile.Count > 0, "원본 변경");
            assert(r.ViewFor("관전자").Players.All(p => p.Hand.Count == 0), "관전자 손패 노출");
        });
        check("원카드 공유 방 생성·4인 제한·준비·재접속·독립 방·방장 승계·삭제", () =>
        {
            var s = new OneCardStore(Path.Combine(root, "원카드 방"));
            assert(s.Rooms("p0").Count == 0 && !Directory.Exists(s.Folder), "조회 시 폴더 생성");
            Reject(() => s.Create("p0", " ")); Reject(() => s.Create("p0", new string('가', 41)));
            var r = s.Create("p0", "  친구들  "); var other = s.Create("p0", "독립 방");
            for (var i = 1; i < 4; i++) s.Join(r.Id, $"p{i}");
            Reject(() => s.Join(r.Id, "p4")); Reject(() => s.DeleteRoom(r.Id, "p1")); Reject(() => s.Leave(r.Id, "외부인"));
            for (var i = 0; i < 4; i++) r = s.SetReady(r.Id, $"p{i}", true);
            assert(r.Title == "친구들" && r.Status == OneCardStatus.Playing, "방 시작 오류");
            var peer = new OneCardStore(s.Folder); var fresh = peer.Join(r.Id, "p1");
            assert(fresh.Players[1].Hand.Count == 7 && fresh.Players[0].Hand.Count == 0, "재접속 비공개 오류");
            Reject(() => peer.Join(r.Id, "p4")); s.Leave(r.Id, "p0");
            assert(s.Rooms("p0").Single(x => x.Id == r.Id).Players.Count == 4, "진행 중 참가 이탈");
            var current = peer.Rooms("p0").Single(x => x.Id == r.Id); peer.Draw(r.Id, "p0", current.Revision);
            assert(s.Rooms("p0").Single(x => x.Id == r.Id).Turn == 2 && s.Rooms("p0").Single(x => x.Id == other.Id).Status == OneCardStatus.Waiting, "공유 갱신·독립성 오류");
            s.Join(other.Id, "p1"); s.SetReady(other.Id, "p1", true); s.Leave(other.Id, "p0");
            assert(s.Rooms("p1").Single(x => x.Id == other.Id).HostId == "p1" && !s.Rooms("p1").Single(x => x.Id == other.Id).Players[0].Ready, "방장 승계·준비 초기화 오류");
            s.DeleteRoom(r.Id, "p0"); assert(peer.SnapshotAsync("p1").Result.DeletedRoomIds.Contains(r.Id), "삭제 기록 누락");
            s.Leave(other.Id, "p1"); assert(s.Rooms("p0").Count == 0, "마지막 참가자 방 정리 오류");
        });
        check("원카드 동시 클릭은 먼저 접수된 한 명만 지적·늦은 사람 벌칙·재대전·손상 파일 보존", () =>
        {
            var s = new OneCardStore(Path.Combine(root, "원카드 동시 클릭")); Directory.CreateDirectory(s.Folder);
            var r = Table(4, [5, 8], [18, 20], [31, 30]); r.Play("p0", 0, 5);
            File.WriteAllText(s.FilePath, JsonSerializer.Serialize(new OneCardDatabase { Rooms = [r] }));
            Parallel.ForEach(new[] { "p1", "p2" }, id => s.Call(r.Id, id));
            var called = s.Rooms("p0").Single();
            assert(called.Find("p0")!.CardCount == 2 && called.Players.Count(p => p.Id != "p0" && p.CardCount == 3) == 1 && called.CallCount == 2,
                "동시 클릭 판정 오류");
            r = Table(4, [0], [18, 20]); r.Play("p0", 0, 0);
            File.WriteAllText(s.FilePath, JsonSerializer.Serialize(new OneCardDatabase { Rooms = [r] }));
            s.SetReady(r.Id, "p0", true); var again = s.SetReady(r.Id, "p1", true);
            assert(again.Status == OneCardStatus.Playing && again.Players.All(p => p.CardCount == 7) && again.Turn == 1 && again.Winners.Count == 0, "재대전 초기화 오류");
            var corrupt = File.ReadAllText(s.FilePath).Replace("\"CardCount\":7", "\"CardCount\":99").Replace("\"CardCount\": 7", "\"CardCount\": 99");
            File.WriteAllText(s.FilePath, corrupt);
            try { s.Create("p0", "덮어쓰기 금지"); throw new Exception("손상 감지 실패"); } catch (InvalidDataException) { }
            assert(File.ReadAllText(s.FilePath) == corrupt, "손상 파일 덮어쓰기");
        });
        check("원카드 마지막 카드를 내면 승패 저장", () =>
        {
            var s = new OneCardStore(Path.Combine(root, "원카드 승패")); Directory.CreateDirectory(s.Folder);
            var r = Table(4, [5], [18, 20], [31, 30]);
            File.WriteAllText(s.FilePath, JsonSerializer.Serialize(new OneCardDatabase { Rooms = [r] }));
            var done = s.Play(r.Id, "p0", r.Revision, 5);
            var saved = new GameResultStore(s.Folder).Results(GameResultStore.OneCard);
            assert(done.Status == OneCardStatus.Finished && saved.Count == 1 && saved[0].Winners.SequenceEqual(["p0"]) && saved[0].Players.SequenceEqual(["p0", "p1", "p2"]),
                "원카드 승패 저장 오류");
        });
        check("원카드 이미 참가한 방 재입장은 읽기만 함·다른 PC가 쓰기 잠금 중에도 즉시 입장", () =>
        {
            var s = new OneCardStore(Path.Combine(root, "원카드 재입장"));
            var r = s.Create("p0", "재입장");
            var before = File.ReadAllText(s.FilePath); var written = File.GetLastWriteTimeUtc(s.FilePath);
            using (new FileStream(Path.Combine(s.Folder, ".ddongvoid-onecard.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
            {
                var started = DateTime.UtcNow; var again = s.Join(r.Id, "p0");
                assert(again.Id == r.Id && DateTime.UtcNow - started < TimeSpan.FromSeconds(2), "쓰기 잠금 중 재입장 실패");
            }
            assert(File.ReadAllText(s.FilePath) == before && File.GetLastWriteTimeUtc(s.FilePath) == written, "재입장 때 파일을 다시 씀");
        });
        check("원카드 무작위 2·3·4인 90판 종료·카드 보존", () =>
        {
            var random = new Random(117);
            for (var n = 2; n <= 4; n++)
                for (var game = 0; game < 30; game++)
                {
                    var r = new OneCardRoom { Players = Enumerable.Range(0, n).Select(i => new OneCardPlayer { Id = $"p{i}" }).ToList() };
                    for (var i = 0; i < n; i++) r.SetReady($"p{i}", true);
                    for (var turn = 0; r.Status == OneCardStatus.Playing && turn < 10000; turn++)
                    {
                        if (r.VulnerablePlayerId is not null) r.Call($"p{random.Next(n)}");
                        var id = r.CurrentPlayerId!; var legal = r.Find(id)!.Hand.Where(c => r.CanPlay(id, c)).ToArray();
                        if (legal.Length == 0) r.Draw(id, r.Revision);
                        else r.Play(id, r.Revision, legal[random.Next(legal.Length)], (CardSuit)random.Next(4));
                        Conserve(r); assert(r.Players.All(p => p.CardCount == p.Hand.Count), "손패 장수 불일치");
                    }
                    assert(r.Status == OneCardStatus.Finished && r.Winners.Count > 0, "게임이 종료되지 않음");
                }
        });
    }
}
