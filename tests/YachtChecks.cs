using System.Text.Json;
using DDongVoid.Core;

internal static class YachtChecks
{
    public static void Run(string root, Action<string, Action> check, Action<bool, string> assert)
    {
        void Reject(Action action)
        {
            try { action(); } catch (ArgumentException) { return; }
            throw new Exception("허용되지 않은 동작이 성공했습니다.");
        }
        int Score(YachtCategory category, params int[] dice) => YachtRules.Score(category, dice);
        Func<int> Dice(params int[] values) { var queue = new Queue<int>(values); return queue.Dequeue; }
        YachtRoom Started()
        {
            var r = new YachtRoom { Id = Guid.NewGuid(), Players = [new() { Id = "p0" }, new() { Id = "p1" }] };
            r.SetReady("p0", true); r.SetReady("p1", true); return r;
        }
        bool[] None() => new bool[YachtRules.DiceCount];
        check("야추 족보 점수 계산", () =>
        {
            assert(Score(YachtCategory.Aces, 1, 1, 3, 1, 6) == 3 && Score(YachtCategory.Sixes, 6, 6, 3, 1, 6) == 18 && Score(YachtCategory.Fours, 1, 2, 3, 5, 6) == 0, "상단 합 오류");
            assert(Score(YachtCategory.Choice, 1, 2, 3, 4, 6) == 16, "찬스 오류");
            assert(Score(YachtCategory.FourOfAKind, 6, 6, 6, 6, 2) == 26 && Score(YachtCategory.FourOfAKind, 3, 3, 3, 3, 3) == 15
                && Score(YachtCategory.FourOfAKind, 6, 6, 6, 2, 2) == 0, "포 다이스 오류");
            assert(Score(YachtCategory.FullHouse, 3, 3, 3, 5, 5) == 19 && Score(YachtCategory.FullHouse, 6, 6, 6, 6, 6) == 30
                && Score(YachtCategory.FullHouse, 6, 6, 6, 6, 2) == 0 && Score(YachtCategory.FullHouse, 1, 2, 3, 4, 5) == 0, "풀 하우스 오류");
            assert(Score(YachtCategory.SmallStraight, 1, 2, 3, 4, 6) == 15 && Score(YachtCategory.SmallStraight, 3, 4, 5, 6, 6) == 15
                && Score(YachtCategory.SmallStraight, 2, 3, 4, 5, 6) == 15 && Score(YachtCategory.SmallStraight, 1, 2, 3, 5, 6) == 0, "S. 스트레이트 오류");
            assert(Score(YachtCategory.LargeStraight, 2, 3, 4, 5, 6) == 30 && Score(YachtCategory.LargeStraight, 1, 2, 3, 4, 5) == 30
                && Score(YachtCategory.LargeStraight, 1, 2, 3, 4, 6) == 0, "L. 스트레이트 오류");
            assert(Score(YachtCategory.Yacht, 4, 4, 4, 4, 4) == 50 && Score(YachtCategory.Yacht, 4, 4, 4, 4, 1) == 0, "야추 오류");
            assert(Score(YachtCategory.Choice, 0, 0, 0, 0, 0) == 0, "굴리기 전 주사위 점수");
        });
        check("야추 2인 전용 시작·혼자 준비로는 시작 안 함", () =>
        {
            var solo = new YachtRoom { Players = [new() { Id = "p0" }] }; solo.SetReady("p0", true);
            assert(solo.Status == YachtStatus.Waiting, "혼자 시작함");
            var r = new YachtRoom { Players = [new() { Id = "p0" }, new() { Id = "p1" }] }; r.SetReady("p0", true);
            assert(r.Status == YachtStatus.Waiting, "모두 준비 전 시작"); r.SetReady("p1", true);
            assert(r.Status == YachtStatus.Playing && r.CurrentPlayerId == "p0" && r.RollsUsed == 0 && r.Dice.All(d => d == 0) && r.Players.All(p => !p.Ready), "시작 상태 오류");
        });
        check("야추 3번 굴리기·고정한 주사위 유지·차례와 입력 검증", () =>
        {
            var r = Started();
            Reject(() => r.Record("p0", r.Revision, YachtCategory.Choice)); Reject(() => r.Roll("p1", r.Revision, None())); Reject(() => r.Roll("p0", -1, None()));
            r.Roll("p0", r.Revision, [true, true, true, true, true], Dice(1, 2, 3, 4, 5));
            assert(r.Dice.SequenceEqual([1, 2, 3, 4, 5]) && r.Held.All(h => !h) && r.RollsLeft == 2, "첫 굴림은 고정 무시하고 5개 모두 굴림");
            r.Roll("p0", r.Revision, [true, false, true, false, false], Dice(6, 6, 6));
            assert(r.Dice.SequenceEqual([1, 6, 3, 6, 6]) && r.Held.SequenceEqual([true, false, true, false, false]), "고정 주사위 유지 오류");
            Reject(() => r.Roll("p0", r.Revision, [true, true, true, true, true]));
            r.Roll("p0", r.Revision, None(), Dice(2, 2, 2, 2, 2)); assert(r.RollsLeft == 0 && r.RollCount == 3, "굴림 횟수 오류");
            Reject(() => r.Roll("p0", r.Revision, None()));
            r.Record("p0", r.Revision, YachtCategory.Yacht);
            assert(r.Find("p0")!.Score(YachtCategory.Yacht) == 50 && r.CurrentPlayerId == "p1" && r.Round == 1 && r.RollsUsed == 0 && r.Dice.All(d => d == 0), "기록 후 차례 넘김 오류");
            r.Roll("p1", r.Revision, None(), Dice(1, 1, 1, 1, 2)); r.Record("p1", r.Revision, YachtCategory.Yacht);
            assert(r.Find("p1")!.Score(YachtCategory.Yacht) == 0 && r.CurrentPlayerId == "p0" && r.Round == 2, "맞지 않는 칸 0점·라운드 증가 오류");
            r.Roll("p0", r.Revision, None(), Dice(3, 3, 3, 3, 3)); Reject(() => r.Record("p0", r.Revision, YachtCategory.Yacht));
        });
        check("야추 상단 63점 보너스 +35와 남은 점수·실패 표시", () =>
        {
            var p = new YachtPlayer { Scores = [3, 6, 9, 12, 15, null, null, null, null, null, null, null] };
            assert(p.UpperSum() == 45 && p.Bonus() == 0 && !p.BonusLost() && p.UpperPace() == 0, "보너스 진행 오류");
            p.Scores[5] = 18; assert(p.UpperSum() == 63 && p.Bonus() == 35 && p.Total() == 98, "63점 보너스 오류");
            var lost = new YachtPlayer { Scores = [1, 2, 3, 4, 5, null, null, null, null, null, null, null] };
            assert(lost.BonusLost() && lost.UpperPace() < 0, "보너스 불가 판정 오류");
            var r = Started(); r.Players[0].Scores = [3, 6, 9, 12, 15, null, null, null, null, null, null, null];
            r.Roll("p0", r.Revision, None(), Dice(6, 6, 6, 1, 2)); r.Record("p0", r.Revision, YachtCategory.Sixes);
            assert(r.Players[0].Bonus() == 35 && r.LastMessage!.Contains("보너스 +35"), "보너스 달성 알림 오류");
        });
        check("야추 12라운드 종료·승자·재대전", () =>
        {
            var r = Started();
            foreach (var category in Enum.GetValues<YachtCategory>())
                foreach (var id in new[] { "p0", "p1" })
                {
                    r.Roll(id, r.Revision, None(), id == "p0" ? Dice(6, 6, 6, 6, 6) : Dice(1, 1, 1, 1, 1));
                    r.Record(id, r.Revision, category);
                }
            assert(r.Status == YachtStatus.Finished && r.Winners.SequenceEqual(["p0"]) && r.Players.All(p => p.Done()), "종료 판정 오류");
            // 6 다섯 개: 6 칸·찬스·포 다이스·풀 하우스 30, 야추 50 · 상단 30점이라 보너스 없음.
            assert(r.Players[0].Total() == 170 && r.Players[1].Total() == 70, "최종 점수 오류");
            Reject(() => r.Roll("p0", r.Revision, None()));
            r.SetReady("p1", true); r.SetReady("p0", true);
            assert(r.Status == YachtStatus.Playing && r.Round == 1 && r.Winners.Count == 0 && r.Players.All(p => p.Scores.All(s => s is null)), "재대전 초기화 오류");
        });
        check("야추 공유 방 생성·2인 제한·진행 보존·삭제·손상 파일 보존", () =>
        {
            var s = new YachtStore(Path.Combine(root, "야추 방"));
            assert(s.Rooms().Count == 0 && !Directory.Exists(s.Folder), "조회 시 폴더 생성");
            Reject(() => s.Create("p0", " ")); Reject(() => s.Create("p0", new string('가', 41)));
            var r = s.Create("p0", "  둘이서  "); s.Join(r.Id, "p1");
            Reject(() => s.Join(r.Id, "p2")); Reject(() => s.DeleteRoom(r.Id, "p1"));
            s.SetReady(r.Id, "p0", true); r = s.SetReady(r.Id, "p1", true);
            assert(r.Title == "둘이서" && r.Status == YachtStatus.Playing, "방 시작 오류");
            var peer = new YachtStore(s.Folder);
            r = peer.Roll(r.Id, "p0", r.Revision, new bool[5]);
            assert(r.Dice.All(d => d is >= 1 and <= 6) && s.Rooms().Single().RollsUsed == 1, "공유 굴림 오류");
            var rolled = r.Dice.Sum(); r = s.Record(r.Id, "p0", r.Revision, YachtCategory.Choice);
            assert(peer.Rooms().Single().Find("p0")!.Score(YachtCategory.Choice) == rolled && peer.Rooms().Single().CurrentPlayerId == "p1", "공유 기록 오류");
            s.Leave(r.Id, "p0"); assert(s.Rooms().Single().Players.Count == 2, "진행 중 나가기로 참가 이탈");
            var corrupt = File.ReadAllText(s.FilePath).Replace("\"RollsUsed\": 0", "\"RollsUsed\": 9");
            File.WriteAllText(s.FilePath, corrupt);
            try { s.Create("p0", "덮어쓰기 금지"); throw new Exception("손상 감지 실패"); } catch (InvalidDataException) { }
            assert(File.ReadAllText(s.FilePath) == corrupt, "손상 파일 덮어쓰기");
            File.WriteAllText(s.FilePath, JsonSerializer.Serialize(new YachtDatabase { Rooms = [Started()] }));
            var id = s.Rooms().Single().Id; s.DeleteRoom(id, "p0");
            assert(s.SnapshotAsync().Result.DeletedRoomIds.Contains(id) && s.Rooms().Count == 0, "방 삭제 오류");
        });
        check("야추 이미 참가한 방 재입장은 읽기만 함·다른 PC가 쓰기 잠금 중에도 즉시 입장", () =>
        {
            var s = new YachtStore(Path.Combine(root, "야추 재입장"));
            var r = s.Create("p0", "재입장");
            var before = File.ReadAllText(s.FilePath); var written = File.GetLastWriteTimeUtc(s.FilePath);
            using (new FileStream(Path.Combine(s.Folder, ".ddongvoid-yacht.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
            {
                var started = DateTime.UtcNow; var again = s.Join(r.Id, "p0");
                assert(again.Id == r.Id && DateTime.UtcNow - started < TimeSpan.FromSeconds(2), "쓰기 잠금 중 재입장 실패");
            }
            assert(File.ReadAllText(s.FilePath) == before && File.GetLastWriteTimeUtc(s.FilePath) == written, "재입장 때 파일을 다시 씀");
        });
        check("야추 무작위 100판 종료·점수 범위", () =>
        {
            var random = new Random(63);
            for (var game = 0; game < 100; game++)
            {
                var r = Started();
                while (r.Status == YachtStatus.Playing)
                {
                    var id = r.CurrentPlayerId!;
                    var rolls = random.Next(1, 4);
                    for (var n = 0; n < rolls; n++)
                    {
                        var held = Enumerable.Range(0, 5).Select(_ => random.Next(2) == 0).ToArray();
                        if (n > 0 && held.All(h => h)) held[0] = false;
                        r.Roll(id, r.Revision, held);
                    }
                    var open = Enum.GetValues<YachtCategory>().Where(c => r.Find(id)!.Score(c) is null).ToArray();
                    r.Record(id, r.Revision, open[random.Next(open.Length)]);
                }
                assert(r.Winners.Count > 0 && r.Players.All(p => p.Total() is >= 5 and <= 325), "무작위 게임 오류");
            }
        });
    }
}
