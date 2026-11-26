using System.Text.Json;
using DDongVoid.Core;

// The web engine's tests (Web/tests/jeungyut-engine.test.mjs), replayed against the C# port with the same draws.
internal static class JeungYutChecks
{
    public static void Run(string root, Action<string, Action> check, Action<bool, string> assert)
    {
        double Fixed() => .4;
        Func<double> Draw(double value) => () => value;
        void Reject(Action action)
        {
            try { action(); } catch (ArgumentException) { return; }
            throw new Exception("허용되지 않은 동작이 성공했습니다.");
        }
        JeungYutState Fresh() => JeungYut.Create(["청", "홍"], true, Fixed);
        void Put(JeungYutState s, int p, int id, params string[] path) => s.Players[p].Tokens[id].Path = [.. path];
        void Pending(JeungYutState s, int value) { s.Pending = [new() { Id = 1, Value = value }]; s.Throws = 0; s.Phase = JeungYut.Move; s.NextId = 2; }
        void Move(JeungYutState s, int id = 0, string route = "outer", Func<double>? rng = null) =>
            JeungYut.Act(s, new() { Type = "move", Token = id, Result = s.Pending[0].Id, Route = route }, rng ?? Fixed);
        void Roll(JeungYutState s, double draw) => JeungYut.Act(s, new() { Type = "roll" }, Draw(draw));
        void Pick(JeungYutState s, string id) { s.Phase = JeungYut.Augment; s.Offers = [id]; JeungYut.Act(s, new() { Type = "augment", Id = id }, Fixed); }
        string At(JeungYutState s, int p, int id) => JeungYut.Position(s.Players[p].Tokens[id]);
        JeungYutAction Flick(int token, double x, double y) => new() { Type = "flick", Token = token, PullX = x, PullY = y };
        string Json(JeungYutState s) => JsonSerializer.Serialize(s);

        check("증윷 29칸 말판과 16가지 윷 분포", () =>
        {
            assert(JeungYut.Nodes.Count == 29, "말판 칸 수 오류");
            var counts = new Dictionary<int, int>();
            for (var bits = 0; bits < 16; bits++)
            {
                var s = Fresh(); Put(s, 0, 0, "o5"); Roll(s, (bits + .1) / 16);
                var v = s.Pending[0].Value; counts[v] = counts.GetValueOrDefault(v) + 1;
            }
            assert(counts[1] == 3 && counts[2] == 6 && counts[3] == 4 && counts[4] == 1 && counts[5] == 1 && counts[-1] == 1, "윷 분포 오류");
        });
        check("증윷 출발·모서리·지름길·중앙·완주 경계", () =>
        {
            JeungYutToken T(params string[] path) => new() { Path = [.. path] };
            assert(JeungYut.Position(JeungYut.Walk(T(), 1)) == "o1", "출발 오류");
            assert(JeungYut.Position(JeungYut.Walk(T("o4"), 3, "shortcut")) == "o7", "모서리 통과는 바깥길");
            assert(JeungYut.Position(JeungYut.Walk(T("o5"), 3, "shortcut")) == "c" && JeungYut.Position(JeungYut.Walk(T("o5"), 4, "shortcut")) == "a4", "지름길 오류");
            assert(JeungYut.Position(JeungYut.Walk(T("o10"), 5, "shortcut")) == "b5", "왼쪽 위 지름길 오류");
            assert(JeungYut.Position(JeungYut.Walk(T("o19"), 1)) == "o0" && JeungYut.Position(JeungYut.Walk(T("o19"), 2)) == "finish", "완주 경계 오류");
            var center = T("o5", "a1", "a2", "c");
            assert(JeungYut.Position(JeungYut.Walk(center, 1, "short")) == "b4" && JeungYut.Position(JeungYut.Walk(center, 1, "long")) == "a4", "중앙 출구 오류");
            assert(JeungYut.Position(JeungYut.Walk(T("o1"), -1)) == "home", "첫 칸 빽도는 대기");
        });
        check("증윷 빽도는 지나온 길로 · 대기 말은 빽도 불가 · 막힌 빽도는 턴 넘김", () =>
        {
            var s = Fresh(); Put(s, 0, 0, "o5", "a1", "a2", "c"); Pending(s, -1); Move(s); assert(At(s, 0, 0) == "a2", "빽도 경로 오류");
            var home = Fresh(); Pending(home, -1); assert(JeungYut.LegalMoves(home).Count == 0, "대기 말 빽도 허용");
            var pass = Fresh(); Roll(pass, 1.1 / 16); assert(pass.Active == 1 && pass.Players[1].Turn == 1, "쓸 수 없는 빽도가 턴을 넘기지 않음");
        });
        check("증윷 업기·잡기·추가 던지기", () =>
        {
            var s = Fresh(); Put(s, 0, 0, "o2"); Put(s, 0, 1, "o2"); Put(s, 1, 0, "o4"); Put(s, 1, 1, "o4"); Pending(s, 2); Move(s);
            assert(At(s, 0, 0) == "o4" && At(s, 0, 1) == "o4" && At(s, 1, 0) == "home" && At(s, 1, 1) == "home" && s.Throws == 1 && s.Active == 0, "업힌 말 잡기 오류");
            var acc = Fresh(); Roll(acc, 15.1 / 16); Roll(acc, 0); Roll(acc, 3.1 / 16);
            assert(acc.Pending.Select(r => r.Value).SequenceEqual([4, 5, 2]) && acc.Throws == 0 && acc.Active == 0, "윷·모 결과 모으기 오류");
            var yut = Fresh(); Put(yut, 1, 0, "o4"); Roll(yut, 15.1 / 16); Move(yut); assert(yut.Throws == 1, "윷으로 잡으면 추가 던지기 중복");
        });
        check("증윷 호신부·특수 승리·증강 드래프트", () =>
        {
            var s = Fresh(); s.Players[1].Shields = 2; Put(s, 0, 0, "o2"); Put(s, 1, 0, "o4"); Pending(s, 2); Move(s);
            assert(At(s, 0, 0) == "o2" && At(s, 1, 0) == "o4" && s.Players[1].Shields == 1, "호신부 오류");
            var tower = Fresh(); for (var i = 0; i < 4; i++) Put(tower, 0, i, "c");
            JeungYut.CheckWin(tower, 0); assert(tower.Winner is null, "증강 없이 사단 합체 승리");
            tower.Players[0].Augments = ["tower"]; JeungYut.CheckWin(tower, 0); assert(tower.Winner == 0, "사단 합체 승리 오류");
            var line = Fresh(); for (var i = 0; i < 4; i++) Put(line, 0, i, "o" + (i + 1));
            line.Players[0].Augments = ["line"]; JeungYut.CheckWin(line, 0); assert(line.Winner == 0, "일렬횡대 승리 오류");
            var gap = Fresh(); gap.Players[0].Augments = ["line"]; foreach (var (n, i) in new[] { ("o1", 0), ("o2", 1), ("o4", 2), ("o5", 3) }) Put(gap, 0, i, n);
            JeungYut.CheckWin(gap, 0); assert(gap.Winner is null, "끊긴 일렬횡대를 승리로 판정");
            var d = Fresh(); var history = new List<int>[] { [], [] }; var guard = 0;
            while (d.Players.Any(p => p.Turn < 16) && guard++ < 200)
            {
                if (d.Phase == JeungYut.Augment)
                {
                    var p = d.Players[d.Active]; history[d.Active].Add(p.Turn); assert(d.Offers.Count == 3, "증강 제안 3개");
                    if (p.DraftRerolls > 0)
                    {
                        var old = d.Offers.ToList(); JeungYut.Act(d, new() { Type = "draftReroll" }, Fixed);
                        assert(d.Offers.All(x => !old.Contains(x)), "다시 제안받기에 같은 증강"); Reject(() => JeungYut.Act(d, new() { Type = "draftReroll" }, Fixed));
                    }
                    JeungYut.Act(d, new() { Type = "augment", Id = d.Offers.FirstOrDefault(x => x != "choice") ?? d.Offers[0] }, Fixed);
                }
                foreach (var p in d.Players) foreach (var t in p.Tokens) { t.Path = []; t.Done = false; }
                if (d.Phase == JeungYut.FlickPhase) JeungYut.Act(d, new() { Type = "skipFlick" }, Fixed);
                if (d.Throws > 0) JeungYut.Act(d, new() { Type = "roll", Value = 1 }, Draw(1.1 / 16));
                else if (d.Pending.Count > 0) { var a = JeungYut.LegalMoves(d)[0]; JeungYut.Act(d, new() { Type = "move", Token = a.Token, Result = a.Result, Route = a.Route }, Fixed); }
            }
            assert(guard < 200 && history.All(h => h.SequenceEqual([5, 10, 15])) && d.Players.All(p => p.Augments.Count == 3), "5·10·15턴 증강 오류");
        });
        check("증윷 작지만 확실한·한 번 더 생각해·앞으로만·나 홀로·큰 걸음", () =>
        {
            var s = Fresh(); s.Players[0].Augments = ["choice"];
            Reject(() => JeungYut.Act(s, new() { Type = "roll", Value = 5 }, Fixed));
            JeungYut.Act(s, new() { Type = "roll", Value = 2 }, Draw(0)); assert(s.Pending[0].Value == 2, "도·개 선택 오류");
            var r = Fresh(); r.Players[0].Augments = ["reroll"]; Pending(r, 2); JeungYut.Act(r, new() { Type = "reroll", Result = 1 }, Draw(0));
            assert(r.Pending[0].Value == 5 && r.Throws == 1, "다시 던지기 오류"); Reject(() => JeungYut.Act(r, new() { Type = "reroll", Result = 1 }, Fixed));
            var f = Fresh(); f.Players[0].Augments = ["forward", "solo", "stride"]; f.Players[0].Turn = 3; Roll(f, 1.1 / 16);
            assert(f.Pending[0].Value == 1 && JeungYut.LegalMoves(f)[0].Steps == 3, "앞으로만·나 홀로·큰 걸음 거리 오류"); Move(f); assert(At(f, 0, 0) == "o3", "이동 결과 오류");
            var h = Fresh(); h.Players[0].Augments = ["hunter", "comeback"]; h.Players[0].Boost = 1; Put(h, 1, 0, "o3"); Pending(h, 2); Move(h);
            assert(h.Players[0].Boost == 1, "추격 본능 누적 오류");
            h.Players[0].Tokens[1].Returning = true; h.Players[0].Boost = 0; Pending(h, 1); Move(h, 1);
            assert(At(h, 0, 1) == "o3" && !h.Players[0].Tokens[1].Returning, "다시 출발 오류");
            var fin = Fresh(); fin.Players[0].Augments = ["finish"]; Put(fin, 0, 0, "o0"); Pending(fin, 1); Move(fin);
            assert(fin.Throws == 1 && fin.Players[0].FinishUsed, "완주의 기세 오류");
        });
        check("증윷 알까기: 첫 충돌·방어·빗나감·짧은 당김 거부", () =>
        {
            var hit = JeungYut.SimulateFlick((0, 0), 1, 0, 650, [(200, 0, "first"), (400, 0, "second")]);
            assert(hit.Hit == "first" && JeungYut.SimulateFlick((0, 0), 1, 0, 80, [(200, 0, "first")]).Hit is null, "충돌 계산 오류");
            var s = Fresh(); s.Players[0].Augments = ["flick"]; Put(s, 0, 0, "o1"); Put(s, 1, 0, "o4"); s.Phase = JeungYut.FlickPhase;
            JeungYut.Act(s, Flick(0, 0, JeungYut.FlickMaxPull), Fixed);
            assert(At(s, 1, 0) == "home" && s.Throws == 2 && At(s, 0, 0) == "o1" && s.Flick!.Outcome == "hit", "알까기 명중 오류");
            Reject(() => JeungYut.Act(s, Flick(0, 0, JeungYut.FlickMaxPull), Fixed));
            var block = Fresh(); Put(block, 0, 0, "o1"); Put(block, 1, 0, "o4"); block.Players[1].Shields = 1; block.Phase = JeungYut.FlickPhase;
            JeungYut.Act(block, Flick(0, 0, JeungYut.FlickMaxPull), Fixed); assert(block.Throws == 1 && At(block, 1, 0) == "o4", "알까기 방어 오류");
            var miss = Fresh(); Put(miss, 0, 0, "o1"); Put(miss, 0, 1, "o1"); Put(miss, 0, 2, "o2"); Put(miss, 1, 0, "o4"); miss.Phase = JeungYut.FlickPhase;
            JeungYut.Act(miss, Flick(1, -JeungYut.FlickMaxPull, 0), Fixed);
            assert(At(miss, 0, 0) == "home" && At(miss, 0, 1) == "home" && At(miss, 0, 2) == "o2" && miss.Flick!.Outcome == "miss" && miss.Phase == JeungYut.Roll, "알까기 빗나감 오류");
            var four = JeungYut.Create(["A", "B", "C", "D"], true, Draw(0)); Put(four, 0, 0, "o1"); Put(four, 1, 0, "o5"); Put(four, 2, 0, "o4"); Put(four, 3, 0, "o3");
            four.Phase = JeungYut.FlickPhase; JeungYut.Act(four, Flick(0, 0, JeungYut.FlickMaxPull), Fixed);
            assert(At(four, 3, 0) == "home" && At(four, 2, 0) == "o4" && At(four, 1, 0) == "o5", "여러 상대 중 첫 충돌만 잡기");
            var bad = Fresh(); Put(bad, 0, 0, "o1"); Put(bad, 1, 0, "o4"); bad.Phase = JeungYut.FlickPhase; var before = Json(bad);
            foreach (var action in new[] { Flick(0, 0, 0), Flick(0, 0, JeungYut.FlickMinPull - .1), Flick(0, double.NaN, 80), Flick(0, 0, double.PositiveInfinity),
                new JeungYutAction { Type = "flick", Token = 0 }, Flick(3, 0, 90) })
            { Reject(() => JeungYut.Act(bad, action, Fixed)); assert(Json(bad) == before, "잘못된 알까기가 상태를 바꿈"); }
            JeungYut.Act(bad, new() { Type = "skipFlick" }, Fixed); assert(bad.Phase == JeungYut.Roll, "알까기 넘기기 오류");
        });
        check("증윷 도파민장아찌·어쩌라고아줌마·반찬맨", () =>
        {
            var s = Fresh(); s.Players[0].Turn = 5; Pick(s, "dopamine"); var p = s.Players[0];
            for (var turn = 5; turn <= 11; turn++) { p.Turn = turn; Pending(s, 2); assert(JeungYut.LegalMoves(s)[0].Steps == 3 && JeungYut.DopamineTurnsLeft(p) == 12 - turn, "도파민 버프 오류"); }
            p.Turn = 12; Pending(s, 2); assert(JeungYut.LegalMoves(s)[0].Steps == 1, "도파민 디버프 오류");
            p.Turn = 21; assert(JeungYut.DopamineDebuffTurnsLeft(p) == 1, "디버프 남은 턴 오류"); p.Turn = 22; assert(JeungYut.DopamineDebuffTurnsLeft(p) == 0, "디버프 종료 오류");
            var relief = Fresh(); relief.Players[0].Turn = 5; Pick(relief, "dopamine"); relief.Players[0].Turn = 12; Put(relief, 1, 0, "o1"); Put(relief, 1, 1, "o1"); Pending(relief, 2); Move(relief);
            assert(JeungYut.DopamineDebuffTurnsLeft(relief.Players[0]) == 9, "잡기로 디버프 감소 오류");
            var aunt = Fresh(); aunt.Active = 1; Pick(aunt, "aunt"); aunt.Active = 0; for (var id = 0; id < 4; id++) Put(aunt, 1, id, "o4");
            for (var attempt = 1; attempt <= 3; attempt++)
            {
                aunt.Active = 0; Put(aunt, 0, 0, "o2"); Pending(aunt, 2); Move(aunt);
                assert(aunt.Players[1].Immunity == 3 - attempt && aunt.Players[1].Tokens.All(t => JeungYut.Position(t) == "o4") && At(aunt, 0, 0) == "o2", "잡힘 면역 오류");
            }
            aunt.Active = 0; Pending(aunt, 2); Move(aunt); assert(aunt.Players[1].Tokens.All(t => JeungYut.Position(t) == "home"), "면역 소진 후 잡기 오류");
            var counts = new Dictionary<int, int>();
            for (var i = 0; i < 1600; i++) { var b = Fresh(); Pick(b, "banchan"); Roll(b, (i + .5) / 1600); var v = b.Pending[0].Value; counts[v] = counts.GetValueOrDefault(v) + 1; }
            assert(counts[5] == 33 && counts[1] + counts[2] + counts[3] == 1567 && !counts.ContainsKey(4) && !counts.ContainsKey(-1), "반찬맨 분포 오류");
            var mo = Fresh(); Pick(mo, "banchan"); Roll(mo, 0); assert(mo.Throws == 2, "반찬맨 모 두 번 더 오류");
        });
        check("증윷 성어말?·뒹학 집결", () =>
        {
            var counts = new Dictionary<string, int>();
            for (var i = 0; i < 1000; i++)
            {
                var s = Fresh(); s.Players[0].Augments = ["stutter"]; Pending(s, 2); Move(s, rng: Draw((i + .5) / 1000));
                counts[At(s, 0, 0)] = counts.GetValueOrDefault(At(s, 0, 0)) + 1;
            }
            assert(counts["o1"] == 150 && counts["o2"] == 700 && counts["o3"] == 150, "성어말? 확률 오류");
            var normal = Fresh(); Pending(normal, 2); Move(normal, rng: () => throw new Exception("확률 판정을 하면 안 됩니다.")); assert(At(normal, 0, 0) == "o2", "증강 없는 이동에 확률 판정");
            JeungYutState Recruit(string phase)
            {
                var s = Fresh(); var p = s.Players[0]; p.Augments = ["recruit"]; p.Tokens[0].Done = true; p.Tokens[1].Done = true;
                Put(s, 0, 2, "o5", "a1", "a2"); p.Tokens[3].Returning = true; s.Phase = phase; return s;
            }
            foreach (var phase in new[] { JeungYut.Roll, JeungYut.Move, JeungYut.FlickPhase })
            {
                var s = Recruit(phase);
                assert(JeungYut.RecruitOptions(s).SequenceEqual([new JeungYutRecruit(3, 2)]), "집결 선택지 오류");
                JeungYut.Act(s, new() { Type = "recruit", Reserve = 3, Target = 2 }, Fixed);
                assert(At(s, 0, 3) == "a2" && s.Players[0].RecruitUsed && s.Active == 1 && s.Players[1].Turn == 1, "집결 후 턴 종료 오류");
            }
            var used = Recruit(JeungYut.Roll); JeungYut.Act(used, new() { Type = "recruit", Reserve = 3, Target = 2 }, Fixed);
            Roll(used, 1.1 / 16); used.Players[0].Tokens[3].Path = []; assert(JeungYut.RecruitOptions(used).Count == 0, "집결 재사용 허용");
            var none = Recruit(JeungYut.Roll); none.Players[0].Tokens[1].Done = false; var before = Json(none);
            Reject(() => JeungYut.Act(none, new() { Type = "recruit", Reserve = 3, Target = 2 }, Fixed)); assert(Json(none) == before, "조건 미달 집결이 상태를 바꿈");
        });
        check("증윷 2~4인 무작위 판이 모두 끝나고 저장·복원돼도 같은 상태", () =>
        {
            assert(JeungYut.Augments.Length == 17, "증강 17종");
            Reject(() => JeungYut.Create(["혼자"], true, Fixed)); Reject(() => JeungYut.Create(["a", "b", "c", "d", "e"], true, Fixed));
            foreach (var count in new[] { 2, 3, 4 })
                for (var seed = 1u; seed <= 15; seed++)
                {
                    var n = seed; double Random() { n = n * 1664525 + 1013904223; return n / 4294967296.0; }
                    var s = JeungYut.Create([.. Enumerable.Range(1, count).Select(i => $"P{i}")], true, Random);
                    var actions = 0;
                    while (s.Winner is null && actions++ < 4000)
                    {
                        var recruits = JeungYut.RecruitOptions(s);
                        JeungYutAction action = s.Phase == JeungYut.Augment ? new() { Type = "augment", Id = s.Offers[0] }
                            : recruits.Count > 0 ? new() { Type = "recruit", Reserve = recruits[0].Reserve, Target = recruits[0].Target }
                            : s.Phase == JeungYut.FlickPhase ? new() { Type = "skipFlick" }
                            : s.Throws > 0 ? new() { Type = "roll", Value = Random() < .5 ? 1 : 2 }
                            : JeungYut.LegalMoves(s) is [var first, ..] ? new() { Type = "move", Token = first.Token, Result = first.Result, Route = first.Route }
                            : throw new Exception($"{s.Phase}에서 멈춤");
                        JeungYut.Act(s, action, Random);
                        s = JsonSerializer.Deserialize<JeungYutState>(JsonSerializer.Serialize(s))!;
                    }
                    assert(s.Winner is not null && s.Players.All(p => p.Augments.Count <= 3), $"{count}인 {seed}번 판이 끝나지 않음");
                }
        });
        check("증윷 방: 2~4인 준비·차례 검증·기권·승패 기록", () =>
        {
            var store = new JeungYutStore(Path.Combine(root, "증윷 저장소"), Fixed);
            Reject(() => store.Create("p0", " "));
            var room = store.Create("p0", "넷이서 윷");
            room = store.SetReady(room.Id, "p0", true); assert(room.Status == JeungYutStatus.Waiting, "혼자 시작함");
            foreach (var id in new[] { "p1", "p2", "p3" }) room = store.Join(room.Id, id);
            Reject(() => store.Join(room.Id, "p4"));
            foreach (var id in new[] { "p1", "p2", "p3" }) room = store.SetReady(room.Id, id, true);
            assert(room.Status == JeungYutStatus.Playing && room.Game!.Players.Count == 4 && room.CurrentPlayerId == "p1", "4인 시작 오류");
            Reject(() => store.Play(room.Id, "p0", room.Revision, new() { Type = "roll" }));
            Reject(() => store.Play(room.Id, "p1", room.Revision - 1, new() { Type = "roll" }));
            room = store.Play(room.Id, "p1", room.Revision, new() { Type = "roll" });
            assert(room.Game!.Pending.Count == 1 && room.LastMessage!.StartsWith("p1 · "), "던지기 저장 오류");
            var reread = new JeungYutStore(store.Folder).Rooms().Single();
            assert(JsonSerializer.Serialize(reread) == JsonSerializer.Serialize(room), "재실행 후 같은 판으로 복원");
            store.Leave(room.Id, "p2"); assert(store.Rooms().Single().Players.Count == 4, "진행 중 나가기로 게임 손실");
            room = store.Resign(room.Id, "p0", room.Revision);
            assert(room.Status == JeungYutStatus.Finished && room.Winners.SequenceEqual(["p1", "p2", "p3"]), "기권 후 승자 오류");
            var results = new GameResultStore(store.Folder).Results(GameResultStore.JeungYut);
            assert(results.Count == 1 && results[0].Players.Count == 4, "증윷 승패 기록 오류");
            store.Leave(room.Id, "p3"); room = store.Rooms().Single();
            assert(room.Status == JeungYutStatus.Waiting && room.Game is null && room.Players.Count == 3, "종료 후 나가기 초기화 오류");
            Reject(() => store.DeleteRoom(room.Id, "p1")); store.DeleteRoom(room.Id, "p0"); assert(store.Rooms().Count == 0, "방장 삭제 오류");
        });
    }
}
