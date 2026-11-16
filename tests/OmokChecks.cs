using DDongVoid.Core;

internal static class OmokChecks
{
    public static void Run(string root, Action<string, Action> check, Action<bool, string> assert)
    {
        void Reject(Action action)
        {
            try { action(); } catch (ArgumentException) { return; }
            throw new Exception("허용되지 않은 동작이 성공했습니다.");
        }
        int At(int x, int y) => y * OmokRules.Size + x;
        int[] Board((int X, int Y)[] black, (int X, int Y)[]? white = null)
        {
            var cells = new int[OmokRules.Points];
            foreach (var (x, y) in black) cells[At(x, y)] = OmokRules.Black;
            foreach (var (x, y) in white ?? []) cells[At(x, y)] = OmokRules.White;
            return cells;
        }
        OmokRoom Started()
        {
            var r = new OmokRoom { Id = Guid.NewGuid(), Players = [new() { Id = "p0" }, new() { Id = "p1" }] };
            r.SetReady("p0", true); r.SetReady("p1", true); return r;
        }
        void Play(OmokRoom r, params (int X, int Y)[] moves)
        {
            foreach (var (x, y) in moves) r.Place(r.CurrentPlayerId!, r.Revision, At(x, y));
        }
        check("오목 좌표 이름", () => assert(OmokRules.PointName(At(7, 7)) == "H8" && OmokRules.PointName(At(0, 0)) == "A15", "좌표 이름 오류"));
        check("오목 렌주 금수: 3-3 · 4-4 · 장목", () =>
        {
            assert(OmokRules.ForbiddenReason(Board([(7, 5), (7, 6), (5, 7), (6, 7)]), At(7, 7)) == "3-3", "3-3 금수 오류");
            assert(OmokRules.ForbiddenReason(Board([(4, 7), (5, 7), (6, 7), (7, 4), (7, 5), (7, 6)]), At(7, 7)) == "4-4", "4-4 금수 오류");
            assert(OmokRules.ForbiddenReason(Board([(1, 7), (3, 7), (5, 7), (7, 7)]), At(4, 7)) == "4-4", "한 줄 4-4 금수 오류");
            assert(OmokRules.ForbiddenReason(Board([(2, 7), (3, 7), (4, 7), (6, 7), (7, 7)]), At(5, 7)) == "장목", "장목 금수 오류");
        });
        check("오목 렌주 허용: 4-3 · 막힌 3 · 금수 모양이어도 오목 완성", () =>
        {
            assert(OmokRules.ForbiddenReason(Board([(4, 7), (5, 7), (6, 7), (7, 5), (7, 6)]), At(7, 7)) is null, "4-3을 금수로 판정");
            assert(OmokRules.ForbiddenReason(Board([(7, 5), (7, 6), (5, 7), (6, 7)], [(4, 7)]), At(7, 7)) is null, "막힌 3을 3-3으로 판정");
            var cells = Board([(3, 7), (4, 7), (5, 7), (6, 7), (7, 5), (7, 6), (8, 8), (9, 9)]);
            assert(OmokRules.ForbiddenReason(cells, At(7, 7)) is null, "오목 완성 수를 금수로 판정");
            cells[At(7, 7)] = OmokRules.Black;
            assert(OmokRules.WinningLine(cells, At(7, 7))!.SequenceEqual([At(3, 7), At(4, 7), At(5, 7), At(6, 7), At(7, 7)]), "오목 줄 오류");
        });
        check("오목 장목: 백은 승리 · 흑은 승리 아님", () =>
        {
            (int, int)[] six = [(2, 7), (3, 7), (4, 7), (5, 7), (6, 7), (7, 7)];
            assert(OmokRules.WinningLine(Board(six), At(4, 7)) is null, "흑 장목을 승리로 판정");
            assert(OmokRules.WinningLine(Board([], six), At(4, 7))?.Count == 6, "백 장목 승리 오류");
        });
        check("오목 시작·차례·입력 검증", () =>
        {
            var solo = new OmokRoom { Players = [new() { Id = "p0" }] }; solo.SetReady("p0", true);
            assert(solo.Status == OmokStatus.Waiting, "혼자 시작함");
            var r = Started();
            assert(r.Status == OmokStatus.Playing && r.BlackIndex == 0 && r.CurrentPlayerId == "p0" && r.Board.All(p => p == 0), "첫 판은 P1 흑 선공");
            Reject(() => r.Place("p1", r.Revision, At(7, 7))); Reject(() => r.Place("p0", -1, At(7, 7))); Reject(() => r.Place("p0", r.Revision, OmokRules.Points));
            Play(r, (7, 7));
            assert(r.Board[At(7, 7)] == OmokRules.Black && r.CurrentPlayerId == "p1" && r.LastMove == At(7, 7) && r.Moves == 1, "흑 착수 후 차례 넘김 오류");
            Reject(() => r.Place("p1", r.Revision, At(7, 7)));
            Play(r, (8, 8));
            assert(r.Board[At(8, 8)] == OmokRules.White && r.CurrentPlayerId == "p0", "백 착수 오류");
        });
        check("오목 흑 금수 착수 거부 · 백은 같은 자리 허용", () =>
        {
            var r = Started();
            Play(r, (7, 5), (0, 0), (7, 6), (0, 2), (5, 7), (0, 4), (6, 7), (0, 6));
            Reject(() => r.Place("p0", r.Revision, At(7, 7)));
            Play(r, (14, 14));
            Play(r, (7, 7));
            assert(r.Board[At(7, 7)] == OmokRules.White, "백이 흑 금수 자리에 두지 못함");
        });
        check("오목 다섯 개 완성으로 승리 · 기권 · 판마다 흑백 교대", () =>
        {
            var r = Started();
            Play(r, (3, 7), (3, 8), (4, 7), (4, 8), (5, 7), (5, 8), (6, 7), (6, 8), (7, 7));
            assert(r.Status == OmokStatus.Finished && r.Winners.SequenceEqual(["p0"]) && r.WinningLine.Count == 5, "오목 완성 승리 오류");
            Reject(() => r.Place("p1", r.Revision, At(8, 7)));
            r.SetReady("p0", true); r.SetReady("p1", true);
            assert(r.Status == OmokStatus.Playing && r.BlackIndex == 1 && r.CurrentPlayerId == "p1" && r.Moves == 0 && r.WinningLine.Count == 0, "두 번째 판 흑백 교대 오류");
            r.Resign("p0", r.Revision);
            assert(r.Status == OmokStatus.Finished && r.Winners.SequenceEqual(["p1"]), "기권 처리 오류");
        });
        check("오목 저장소: 참가·진행·나가기·방장 삭제", () =>
        {
            var s = new OmokStore(Path.Combine(root, "오목 저장소"));
            Reject(() => s.Create("p0", " ")); Reject(() => s.Create("p0", new string('가', OmokRules.MaxTitleLength + 1)));
            var r = s.Create("p0", "  둘이서 오목  ");
            assert(r.Title == "둘이서 오목" && File.Exists(s.FilePath), "방 생성 오류");
            s.Join(r.Id, "p1"); Reject(() => s.Join(r.Id, "p2"));
            s.SetReady(r.Id, "p0", true); r = s.SetReady(r.Id, "p1", true);
            r = s.Place(r.Id, "p0", r.Revision, At(7, 7));
            Reject(() => s.Place(r.Id, "p1", r.Revision - 1, At(8, 8)));
            s.Leave(r.Id, "p1");
            r = new OmokStore(s.Folder).Rooms().Single();
            assert(r.Status == OmokStatus.Playing && r.Players.Count == 2 && r.Board[At(7, 7)] == OmokRules.Black, "진행 중 나가기로 게임 손실 또는 재실행 후 이어하기 실패");
            r = s.Resign(r.Id, "p1", r.Revision);
            s.Leave(r.Id, "p1");
            r = s.Rooms().Single();
            assert(r.Status == OmokStatus.Waiting && r.Players.Count == 1 && r.Match == 0 && r.Board.Count == 0, "종료 후 나가기 초기화 오류");
            Reject(() => s.DeleteRoom(r.Id, "p1"));
            s.DeleteRoom(r.Id, "p0");
            var snapshot = s.SnapshotAsync().GetAwaiter().GetResult();
            assert(snapshot.Rooms.Count == 0 && snapshot.DeletedRoomIds.Contains(r.Id), "방장 삭제 오류");
        });
        check("오목 승패 기록 · 손상 파일 보호", () =>
        {
            var s = new OmokStore(Path.Combine(root, "오목 승패"));
            var results = new GameResultStore(s.Folder);
            var r = s.Create("p0", "기록"); s.Join(r.Id, "p1"); s.SetReady(r.Id, "p0", true); r = s.SetReady(r.Id, "p1", true);
            assert(results.Results(GameResultStore.Omok).Count == 0, "진행 중 게임을 기록");
            r = s.Resign(r.Id, "p0", r.Revision);
            var saved = results.Results(GameResultStore.Omok);
            assert(saved.Count == 1 && saved[0].Winners.SequenceEqual(["p1"]) && results.Results(GameResultStore.Yacht).Count == 0, "오목 승패 저장 오류");
            assert(results.Rankings(GameResultStore.Omok).First().UserId == "p1", "오목 랭킹 오류");
            File.WriteAllText(s.FilePath, "{ 깨진 파일");
            var refused = false;
            try { s.Create("p2", "덮어쓰기"); } catch (InvalidDataException) { refused = true; }
            assert(refused && File.ReadAllText(s.FilePath) == "{ 깨진 파일", "손상된 오목 파일을 덮어씀");
        });
    }
}
