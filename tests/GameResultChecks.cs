using DDongVoid.Core;

internal static class GameResultChecks
{
    public static void Run(string root, Action<string, Action> check, Action<bool, string> assert)
    {
        GameResult Result(string game, string[] players, string[] winners, Guid? room = null, int revision = 1) =>
            new(game, room ?? Guid.NewGuid(), revision, DateTimeOffset.UtcNow, [.. players], [.. winners]);
        YachtRoom PlayOut(YachtStore s, Guid id)
        {
            var r = s.Rooms().Single(x => x.Id == id);
            foreach (var category in Enum.GetValues<YachtCategory>())
                foreach (var player in new[] { "p0", "p1" })
                {
                    r = s.Roll(id, player, r.Revision, new bool[YachtRules.DiceCount]);
                    r = s.Record(id, player, r.Revision, category);
                }
            return r;
        }
        check("승패 기록: 단독 1위 승·공동 1위 무승부·나머지 패와 순위·게임별 분리·중복 저장 방지", () =>
        {
            var results = new GameResultStore(Path.Combine(root, "승패 계산"));
            assert(results.Rankings(GameResultStore.Yacht).Count == 0 && !File.Exists(results.FilePath), "빈 기록 조회 시 파일 생성");
            var once = Result(GameResultStore.Yacht, ["a", "b"], ["a"]);
            results.Add(once); results.Add(once with { PlayedAt = DateTimeOffset.UtcNow.AddMinutes(1) });
            results.Add(Result(GameResultStore.Yacht, ["a", "b"], ["a", "b"]));
            results.Add(Result(GameResultStore.Yacht, ["a", "b"], ["b"]));
            results.Add(Result(GameResultStore.OneCard, ["a", "b", "c"], ["c"]));
            var yacht = results.Rankings(GameResultStore.Yacht);
            assert(results.Results(GameResultStore.Yacht).Count == 3, "같은 방·같은 수정 번호 중복 저장");
            assert(yacht.Count == 2 && yacht.All(e => e.Rank == 1 && e.BestScore == 1 && e.Draws == 1 && e.Losses == 1), "승·무·패 집계 또는 공동 순위 오류");
            results.Add(Result(GameResultStore.Yacht, ["a", "c"], ["a"]));
            yacht = results.Rankings(GameResultStore.Yacht);
            assert(yacht.Select(e => (e.Rank, e.UserId, e.BestScore, e.Draws, e.Losses)).SequenceEqual([(1, "a", 2, 1, 1), (2, "b", 1, 1, 1), (3, "c", 0, 0, 1)]),
                "승수·무승부·패 순 정렬 오류");
            var oneCard = results.Rankings(GameResultStore.OneCard);
            assert(oneCard.Count == 3 && oneCard[0] is { UserId: "c", BestScore: 1, Rank: 1 } && oneCard.Skip(1).All(e => e is { Rank: 2, Losses: 1 }), "게임별 기록 분리 오류");
        });
        check("야추 게임이 끝나면 승패 1회 저장·재대전 종료 시 다시 저장", () =>
        {
            var s = new YachtStore(Path.Combine(root, "야추 승패"));
            var results = new GameResultStore(s.Folder);
            var r = s.Create("p0", "승패"); s.Join(r.Id, "p1"); s.SetReady(r.Id, "p0", true); s.SetReady(r.Id, "p1", true);
            assert(results.Results(GameResultStore.Yacht).Count == 0, "진행 중 게임을 기록");
            var first = PlayOut(s, r.Id);
            var saved = results.Results(GameResultStore.Yacht);
            assert(first.Status == YachtStatus.Finished && saved.Count == 1 && saved[0].RoomId == r.Id && saved[0].Revision == first.Revision
                && saved[0].Players.SequenceEqual(["p0", "p1"]) && saved[0].Winners.SequenceEqual(first.Winners), "종료 게임 기록 오류");
            s.Join(r.Id, "p0"); s.SetReady(r.Id, "p0", true); s.SetReady(r.Id, "p1", true);
            assert(results.Results(GameResultStore.Yacht).Count == 1, "재입장·재대전 시작만으로 기록 추가");
            PlayOut(s, r.Id);
            var ranking = results.Rankings(GameResultStore.Yacht);
            assert(results.Results(GameResultStore.Yacht).Count == 2 && ranking.Count == 2 && ranking.All(e => e.BestScore + e.Draws + e.Losses == 2), "재대전 결과 누적 오류");
        });
        check("승패 기록 파일이 손상돼도 게임은 끝나고 원본은 보존", () =>
        {
            var s = new YachtStore(Path.Combine(root, "승패 손상"));
            var results = new GameResultStore(s.Folder);
            var r = s.Create("p0", "손상"); s.Join(r.Id, "p1"); s.SetReady(r.Id, "p0", true); s.SetReady(r.Id, "p1", true);
            File.WriteAllText(results.FilePath, "{ 깨진 파일");
            assert(PlayOut(s, r.Id).Status == YachtStatus.Finished && File.ReadAllText(results.FilePath) == "{ 깨진 파일", "손상된 승패 파일 때문에 게임이 멈추거나 덮어씀");
        });
    }
}
