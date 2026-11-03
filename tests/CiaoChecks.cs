using System.Text.Json;
using DDongVoid.Core;

internal static class CiaoChecks
{
    public static void Run(string root, Action<string, Action> check, Action<bool, string> assert)
    {
        void Reject(Action action)
        {
            try { action(); } catch (ArgumentException) { return; }
            throw new Exception("잘못된 차오차오 입력을 허용했습니다.");
        }
        CiaoRoom Ready(int count = 2)
        {
            var room = new CiaoRoom { Id = Guid.NewGuid(), Players = Enumerable.Range(0, count).Select(i => new CiaoPlayer { Id = $"p{i}" }).ToList() };
            foreach (var p in room.Players) room.SetReady(p.Id, true);
            return room;
        }
        void Claim(CiaoRoom room, int die, int number)
        {
            var id = room.SpeakerId!; room.Roll(id, room.Revision, die); room.Declare(id, room.Revision, number);
        }
        void PassAll(CiaoRoom room)
        {
            while (room.Status == CiaoStatus.Playing && room.Phase == CiaoPhase.Respond)
                room.Respond(room.PendingResponderIds.First(), room.Revision, false);
        }
        check("차오차오: 2~4인 준비·방 제목·참가 제한", () =>
        {
            for (int count = 2; count <= 4; count++) assert(Ready(count).Status == CiaoStatus.Playing, "준비 후 시작 실패");
            var store = new CiaoStore(Path.Combine(root, "차오 방 생성"));
            assert(store.Rooms("p0").Count == 0 && !Directory.Exists(store.Folder), "목록 조회가 파일 생성");
            Reject(() => store.Create("p0", "  ")); Reject(() => store.Create("p0", new string('가', 41)));
            var room = store.Create("p0", "  퇴근 전 차오  ");
            room = store.SetReady(room.Id, "p0", true);
            assert(room.Status == CiaoStatus.Waiting && room.Title == "퇴근 전 차오", "혼자 시작하거나 제목 저장 실패");
            for (int i = 1; i <= 3; i++) room = store.Join(room.Id, $"p{i}");
            Reject(() => store.Join(room.Id, "p4"));
            assert(store.Join(room.Id, "p0").Players.Count == 4, "재입장 시 참가자 중복");
            store.SetReady(room.Id, "p1", true); store.SetReady(room.Id, "p2", true);
            assert(store.Rooms("p0").Single().Status == CiaoStatus.Waiting, "모두 준비 전 시작");
            room = store.SetReady(room.Id, "p3", true);
            assert(room.Status == CiaoStatus.Playing && room.SpeakerId == "p0", "4명 준비 후 시작 실패");
            Reject(() => store.SetReady(room.Id, "p0", false)); Reject(() => store.Join(room.Id, "p4"));
        });
        check("차오차오: 1·2·3·4·X·X 굴림·본인만 확인·재접속·중복 굴림 차단", () =>
        {
            assert(Enumerable.Range(0, 6).Select(CiaoRules.DieFromFace).SequenceEqual(new[] { 0, 1, 2, 3, 4, 0 }), "원래 주사위의 숫자 4면·X 2면 분포 오류");
            for (int die = 0; die <= CiaoRules.MaxDeclaration; die++)
            {
                var value = die; var rolls = 0;
                var store = new CiaoStore(Path.Combine(root, "차오 주사위", die.ToString()), () => { rolls++; return value; });
                var room = store.Create("p0", "비밀 주사위"); store.Join(room.Id, "p1");
                store.SetReady(room.Id, "p1", true); room = store.SetReady(room.Id, "p0", true);
                var revision = room.Revision;
                Reject(() => store.Roll(room.Id, "p1", revision));
                room = store.Roll(room.Id, "p0", revision);
                Reject(() => store.Roll(room.Id, "p0", revision));
                var reopened = new CiaoStore(store.Folder);
                assert(room.Die == value && reopened.Rooms("p0").Single().Die == value, "본인 주사위 복원 실패");
                assert(reopened.Rooms("p1").Single().Die is null && reopened.Rooms("stranger").Single().Die is null, "다른 참가자 주사위 노출");
                assert(rolls == 1 && room.Phase == CiaoPhase.Declare, "중복 굴림 또는 조회 중 재굴림");
                room = store.Declare(room.Id, "p0", room.Revision, CiaoRules.MaxDeclaration);
                assert(room.Declaration == CiaoRules.MaxDeclaration && store.Rooms("p1").Single().Die is null, "선언 후 실제 눈 노출");
                room = store.Respond(room.Id, "p1", room.Revision, false);
                assert(room.LastResult!.RevealedDie is null && room.Die is null && room.Players[0].Position == CiaoRules.MaxDeclaration,
                    "전원 패스 후 눈 공개 또는 이동 오류");
            }
        });
        check("차오차오: 자유 순서 PASS·같은 선언의 이전 화면 허용·중복 및 늦은 입력 거부", () =>
        {
            var room = Ready(4);
            Reject(() => room.Declare("p0", room.Revision, 3));
            Reject(() => room.Roll("p1", room.Revision, 2));
            room.Roll("p0", room.Revision, 2);
            Reject(() => room.Declare("p0", room.Revision, 0));
            Reject(() => room.Declare("p0", room.Revision, CiaoRules.MaxDeclaration + 1));
            room.Declare("p0", room.Revision, 3);
            var old = room.Revision;
            assert(room.PendingResponderIds.SequenceEqual(new[] { "p1", "p2", "p3" }) && !room.CanRespond("p0"), "동시 응답 대상 오류");
            Reject(() => room.Respond("p0", old, true));
            Reject(() => room.Respond("stranger", old, false));
            Reject(() => room.Respond("p2", old - 1, true));
            Reject(() => room.Respond("p2", old + 1, true));
            room.Respond("p3", old, false);
            Reject(() => room.Respond("p3", old, true));
            Reject(() => room.Respond("p3", room.Revision, false));
            assert(room.Players[0].Position == 0 && room.PendingResponderIds.SequenceEqual(new[] { "p1", "p2" }), "모두 응답 전 이동");
            room.Respond("p2", old, false);
            assert(room.PendingResponderIds.SequenceEqual(new[] { "p1" }), "남은 응답자 누락");
            room.Respond("p1", old, false);
            assert(room.Players[0].Position == 3 && room.SpeakerId == "p1" && room.Turn == 2, "이동 또는 차례 교대 실패");
            Reject(() => room.Respond("p2", old, true));
            Reject(() => room.Roll("p1", old, 1));
            Claim(room, 1, 2);
            Reject(() => room.Respond("p2", old, true));
            assert(room.CanRespond("p2") && room.LastResult!.Turn == 1, "지난 선언의 입력이 다음 선언에 적용됨");
        });
        check("차오차오: 먼저 접수한 의심만 판정·다른 참가자 PASS 후에도 이전 화면에서 의심", () =>
        {
            var room = Ready(4); Claim(room, 1, 4);
            var revision = room.Revision;
            room.Respond("p2", revision, false);
            room.Respond("p3", revision, true);
            assert(room.LastResult!.Challenger == "p3" && room.Find("p3")!.Position == 4 && room.Find("p0")!.Fallen == 1,
                "다른 참가자 PASS 후 선착순 의심 실패");
            Reject(() => room.Respond("p1", revision, true));
            Reject(() => room.Respond("p1", revision, false));
            assert(room.Turn == 2 && room.LastResult.Challenger == "p3" && room.Find("p0")!.Fallen == 1,
                "늦은 입력으로 중복 판정");
        });
        check("차오차오: 여러 저장소의 동시 PASS·의심을 유실·중복 판정 없이 저장", () =>
        {
            foreach (var mode in new[] { "전원 PASS", "전원 의심", "PASS와 의심" })
            {
                var folder = Path.Combine(root, "차오 동시 응답", mode);
                var store = new CiaoStore(folder, () => 1);
                var room = store.Create("p0", mode);
                for (int i = 1; i <= 3; i++) store.Join(room.Id, $"p{i}");
                for (int i = 0; i <= 3; i++) room = store.SetReady(room.Id, $"p{i}", true);
                room = store.Roll(room.Id, "p0", room.Revision);
                room = store.Declare(room.Id, "p0", room.Revision, 4);
                var revision = room.Revision;
                var results = new (string Id, bool Doubt, bool Accepted)[3];
                Parallel.For(0, 3, i =>
                {
                    var id = $"p{i + 1}";
                    var doubt = mode == "전원 의심" || (mode == "PASS와 의심" && i != 0);
                    try
                    {
                        new CiaoStore(folder).Respond(room.Id, id, revision, doubt);
                        results[i] = (id, doubt, true);
                    }
                    catch (ArgumentException) { results[i] = (id, doubt, false); }
                });
                room = new CiaoStore(folder).Rooms("p0").Single();
                assert(room.Turn == 2 && room.Phase == CiaoPhase.Roll && room.Passed.Count == 0
                    && room.Revision == revision + results.Count(r => r.Accepted), "동시 응답 유실 또는 중복 차례 진행");
                if (mode == "전원 PASS")
                    assert(results.All(r => r.Accepted) && room.Find("p0")!.Position == 4 && room.LastResult!.RevealedDie is null,
                        "같은 화면에서 보낸 동시 PASS가 거절되거나 실제 눈 공개");
                else
                {
                    var acceptedDoubts = results.Where(r => r.Doubt && r.Accepted).ToArray();
                    assert(acceptedDoubts.Length == 1 && room.LastResult!.Challenger == acceptedDoubts[0].Id
                        && room.Find(acceptedDoubts[0].Id)!.Position == 4 && room.Find("p0")!.Fallen == 1,
                        "여러 동시 의심을 중복 판정하거나 접수한 의심자와 결과 불일치");
                }
                Reject(() => store.Respond(room.Id, "p2", revision, true));
                room = store.Roll(room.Id, "p1", room.Revision);
                room = store.Declare(room.Id, "p1", room.Revision, 2);
                Reject(() => store.Respond(room.Id, "p2", revision, true));
                assert(new CiaoStore(folder).Rooms("p2").Single().CanRespond("p2"), "이전 선언의 입력이 다음 선언을 판정");
            }
        });
        check("차오차오: 선언 후 5초 경계·미응답 자동 PASS·PASS로 제한 시간 연장 금지", () =>
        {
            var now = new DateTimeOffset(2026, 11, 3, 0, 0, 0, TimeSpan.Zero);
            var room = Ready(4);
            room.Roll("p0", room.Revision, 1); room.Declare("p0", room.Revision, 4, now);
            var revision = room.Revision;
            room.Respond("p3", revision, false, now.AddSeconds(4));
            assert(room.ResponseDeadline == now.AddSeconds(5) && !room.UpdateResponseTimeout(now.AddMilliseconds(4999))
                && room.Phase == CiaoPhase.Respond && room.Find("p0")!.Position == 0, "5초 전에 자동 PASS하거나 PASS로 시간 연장");
            assert(room.UpdateResponseTimeout(now.AddSeconds(5)) && room.Turn == 2 && room.Find("p0")!.Position == 4
                && room.LastResult!.Challenger is null && room.LastResult.RevealedDie is null && room.ResponseDeadline is null,
                "5초가 되어도 미응답 자동 PASS·이동·비공개 처리 실패");
            assert(room.LastResult!.Message.Contains("5초 미응답 자동 PASS: p1 · p2")
                && !room.UpdateResponseTimeout(now.AddSeconds(10)), "자동 PASS 대상 안내 또는 중복 시간 초과 처리");
            Reject(() => room.Respond("p1", revision, true, now.AddSeconds(5)));

            room = Ready(4); room.Roll("p0", room.Revision, 1); room.Declare("p0", room.Revision, 4, now);
            revision = room.Revision;
            room.Respond("p3", revision, false, now.AddSeconds(4));
            room.Respond("p2", revision, true, now.AddMilliseconds(4999));
            assert(room.LastResult!.Challenger == "p2" && !room.UpdateResponseTimeout(now.AddSeconds(5))
                && room.Find("p0")!.Fallen == 1, "5초 전 의심을 자동 PASS로 덮어씀");

            room = Ready(3); room.Roll("p0", room.Revision, 1); room.Declare("p0", room.Revision, 4, now);
            room.Respond("p2", room.Revision, true, now.AddSeconds(5));
            assert(room.LastResult!.Challenger is null && room.Find("p0")!.Position == 4 && room.Find("p0")!.Fallen == 0,
                "5초 이후 도착한 의심을 수락");
        });
        check("차오차오: 자동 PASS 저장·재접속·여러 화면의 시간 초과 중복 처리 방지", () =>
        {
            var now = new DateTimeOffset(2026, 11, 3, 0, 0, 0, TimeSpan.Zero);
            var folder = Path.Combine(root, "차오 응답 시간");
            CiaoStore Open() => new(folder, () => 1, () => now);
            var store = Open(); var room = store.Create("p0", "5초 응답");
            store.Join(room.Id, "p1"); store.Join(room.Id, "p2");
            store.SetReady(room.Id, "p0", true); store.SetReady(room.Id, "p1", true); room = store.SetReady(room.Id, "p2", true);
            room = store.Roll(room.Id, "p0", room.Revision); room = store.Declare(room.Id, "p0", room.Revision, 4);
            var deadline = room.ResponseDeadline; var revision = room.Revision;
            now = now.AddSeconds(3); store.Respond(room.Id, "p1", revision, false);
            room = Open().Rooms("p2").Single();
            assert(room.ResponseDeadline == deadline && room.Passed.SequenceEqual(new[] { "p1" }), "재접속 시 응답 시간·PASS 초기화");
            now = now.AddSeconds(2);
            Parallel.For(0, 4, _ => Open().Rooms("p2"));
            room = Open().Rooms("p0").Single();
            assert(room.Turn == 2 && room.Revision == revision + 2 && room.LastResult!.Challenger is null
                && room.LastResult.Message.Contains("자동 PASS: p2") && room.Find("p0")!.Position == 4 && room.ResponseDeadline is null,
                "여러 화면의 시간 초과 처리로 이동·턴이 중복되거나 결과 저장 실패");
            Reject(() => Open().Respond(room.Id, "p2", revision, true));

            room = store.Roll(room.Id, "p1", room.Revision); room = store.Declare(room.Id, "p1", room.Revision, 2);
            room.ResponseDeadline = null;
            File.WriteAllText(store.FilePath, JsonSerializer.Serialize(new CiaoDatabase { Rooms = [room] }));
            room = Open().Rooms("p2").Single();
            assert(room.ResponseDeadline == now.AddSeconds(5) && room.Phase == CiaoPhase.Respond, "이전 버전의 진행 중 선언에 응답 시간 부여 실패");
            now = now.AddSeconds(5);
            room = Open().Respond(room.Id, "p2", room.Revision, true);
            assert(room.Turn == 3 && room.LastResult!.Challenger is null && Open().Rooms("p0").Single().Turn == 3,
                "조회 없이 도착한 늦은 의심의 자동 PASS 결과 저장 실패");
        });
        check("차오차오: 방장만 대기·진행·종료 방 삭제·다른 방 보존·방장 승계", () =>
        {
            var store = new CiaoStore(Path.Combine(root, "차오 방장 삭제"));
            var other = store.Create("other", "유지할 방");
            foreach (var status in new[] { CiaoStatus.Waiting, CiaoStatus.Playing, CiaoStatus.Finished })
            {
                var room = store.Create("host", status.ToString()); store.Join(room.Id, "guest");
                if (status != CiaoStatus.Waiting)
                { store.SetReady(room.Id, "host", true); room = store.SetReady(room.Id, "guest", true); }
                if (status == CiaoStatus.Finished)
                {
                    var rooms = store.Rooms("host"); rooms.Single(r => r.Id == room.Id).Status = CiaoStatus.Finished;
                    File.WriteAllText(store.FilePath, JsonSerializer.Serialize(new CiaoDatabase { Rooms = rooms }));
                }
                var before = File.ReadAllText(store.FilePath);
                Reject(() => store.DeleteRoom(room.Id, "guest")); Reject(() => store.DeleteRoom(room.Id, "stranger"));
                assert(File.ReadAllText(store.FilePath) == before, "방장이 아닌 참가자의 삭제 요청이 파일을 변경");
                store.DeleteRoom(room.Id, "host");
                assert(store.Rooms("guest").All(r => r.Id != room.Id) && store.Rooms("other").Any(r => r.Id == other.Id),
                    "방장 삭제 실패 또는 다른 방 유실");
                Reject(() => store.Respond(room.Id, "guest", room.Revision, true));
            }
            var inherited = store.Create("host", "방장 승계"); store.Join(inherited.Id, "guest");
            store.Leave(inherited.Id, "host");
            assert(store.Rooms("guest").Single(r => r.Id == inherited.Id).HostId == "guest", "방장 나가기 후 승계 실패");
            Reject(() => store.DeleteRoom(inherited.Id, "host")); store.DeleteRoom(inherited.Id, "guest");
        });
        check("차오차오: 거짓·X 의심 성공과 진실 의심 실패", () =>
        {
            foreach (var die in new[] { 0, 1, 4 })
            {
                var room = Ready(3); Claim(room, die, 4);
                room.Respond("p1", room.Revision, false); room.Respond("p2", room.Revision, true);
                var truthful = die == 4;
                var dropped = room.Find(truthful ? "p2" : "p0")!;
                var moved = room.Find(truthful ? "p0" : "p2")!;
                assert(dropped.Position == 0 && dropped.Fallen == 1 && dropped.Reserve == 5, "추락 후 새 말 배치 실패");
                assert(moved.Position == 4 && room.LastResult!.RevealedDie == die, "판정 후 이동·주사위 공개 실패");
                assert(room.SpeakerId == "p1" && room.Die is null && room.Passed.Count == 0, "다음 턴 상태 초기화 실패");
            }
        });
        check("차오차오: 9칸 도착·새 말·도착 순서 점수·3개 즉시 승리·재대전", () =>
        {
            var room = Ready();
            room.Players[0].Position = 8; Claim(room, 1, 1); PassAll(room);
            assert(room.Players[0].GoalScores.SequenceEqual(new[] { 1 }) && room.Players[0].Position == 0 && room.Players[0].Reserve == 5,
                "도착 점수·새 말 오류");
            room.Players[1].Position = 8; Claim(room, 1, 1); PassAll(room);
            assert(room.Players[1].Score == 2, "후속 도착 점수 오류");
            room.Players[0].GoalScores.Add(3); room.Players[0].Position = 8;
            Claim(room, 1, 1); PassAll(room);
            assert(room.Status == CiaoStatus.Finished && room.Winners.SequenceEqual(new[] { "p0" }), "말 3개 도착 시 즉시 승리 실패");
            var old = room.Revision;
            room.SetReady("p0", true); room.SetReady("p1", true);
            assert(room.Status == CiaoStatus.Playing && room.Players.All(p => p.GoalScores.Count == 0 && p.Fallen == 0 && p.Reserve == 6)
                && room.Turn == 1 && room.LastResult is null && room.LastGoalScore == 0 && room.UsedPodiumSlots == 0, "재대전 초기화 실패");
            Reject(() => room.Roll("p0", old, 1));
        });
        check("차오차오: 1·2·3번 도착 후 2번 탈락 시 다음 말은 4번에 도착", () =>
        {
            var room = Ready(4);
            room.Players[0].GoalScores = [1]; room.Players[0].Reserve = 5; room.Players[0].Position = 8;
            room.Players[1].GoalScores = [2]; room.Players[1].Position = null; room.Players[1].Reserve = 0; room.Players[1].Fallen = 6;
            room.Players[2].GoalScores = [3]; room.Players[2].Reserve = 5;
            Claim(room, 1, 1); room.Respond("p1", room.Revision, true);
            assert(room.Players[1].GoalScores.Count == 0 && room.Players[1].Fallen == 7
                && room.Players[0].GoalScores.SequenceEqual(new[] { 1, 4 }) && room.Players[2].GoalScores.SequenceEqual(new[] { 3 })
                && room.LastGoalScore == 4 && room.Status == CiaoStatus.Playing,
                "탈락한 2번 자리를 재사용하거나 다른 도착 말을 앞당김");
        });
        check("차오차오: 마지막 도착 말 탈락 후 저장·재접속해도 다음 번호 유지·이전 저장 호환", () =>
        {
            var store = new CiaoStore(Path.Combine(root, "차오 도착 순서 저장"), () => 1);
            var room = store.Create("p0", "마지막 자리 보존");
            for (int i = 1; i < 4; i++) store.Join(room.Id, $"p{i}");
            for (int i = 0; i < 4; i++) room = store.SetReady(room.Id, $"p{i}", true);
            room.Players[0].GoalScores = [1]; room.Players[0].Reserve = 5;
            room.Players[1].GoalScores = [3]; room.Players[1].Position = null; room.Players[1].Reserve = 0; room.Players[1].Fallen = 6;
            room.Players[2].GoalScores = [2]; room.Players[2].Reserve = 5; room.Players[2].Position = 8;
            // Simulate an older save without the new progress field.
            var legacy = System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(new CiaoDatabase { Rooms = [room] }))!;
            legacy["Rooms"]![0]!.AsObject().Remove("LastGoalScore");
            File.WriteAllText(store.FilePath, legacy.ToJsonString());
            room = store.Roll(room.Id, "p0", room.Revision); room = store.Declare(room.Id, "p0", room.Revision, 1);
            room = store.Respond(room.Id, "p1", room.Revision, true);
            var reopened = new CiaoStore(store.Folder, () => 1);
            room = reopened.Rooms("p2").Single();
            assert(room.LastGoalScore == 3 && room.Players.SelectMany(p => p.GoalScores).Max() == 2,
                "마지막 도착 말이 떨어진 뒤 저장된 도착 번호 유실");
            room = reopened.Roll(room.Id, "p2", room.Revision); room = reopened.Declare(room.Id, "p2", room.Revision, 1);
            while (room.Phase == CiaoPhase.Respond)
                room = reopened.Respond(room.Id, room.PendingResponderIds.First(), room.Revision, false);
            room = new CiaoStore(store.Folder).Rooms("p0").Single();
            assert(room.Players[2].GoalScores.SequenceEqual(new[] { 2, 4 }) && room.LastGoalScore == 4,
                "마지막 말 탈락·재접속 후 3번 자리를 재사용");
        });
        check("차오차오: 빈자리와 무관하게 8번 도착으로 종료·자동 정산도 8번까지만 배치", () =>
        {
            var room = Ready(4);
            room.Players[0].GoalScores = [1]; room.Players[0].Reserve = 5; room.Players[0].Position = 8;
            room.Players[1].GoalScores = [2, 7]; room.Players[1].Reserve = 4;
            room.Players[2].GoalScores = [3]; room.Players[2].Reserve = 5;
            room.Players[3].GoalScores = [4, 5]; room.Players[3].Reserve = 4;
            Claim(room, 1, 1); PassAll(room);
            assert(room.Status == CiaoStatus.Finished && room.LastGoalScore == 8 && room.Players[0].GoalScores.SequenceEqual(new[] { 1, 8 })
                && room.Players.Sum(p => p.GoalScores.Count) == 7 && room.Winners.SequenceEqual(new[] { "p0", "p1", "p3" }),
                "빈 6번 자리를 채우거나 8번 도착 뒤 점수 정산 누락");

            room = Ready();
            room.Players[0].GoalScores = [1]; room.Players[0].Reserve = 5;
            room.Players[1].GoalScores = [7]; room.Players[1].Position = null; room.Players[1].Reserve = 0; room.Players[1].Fallen = 6;
            Claim(room, 1, 1); room.Respond("p1", room.Revision, true);
            assert(room.Status == CiaoStatus.Finished && room.LastGoalScore == 8 && room.Players[0].GoalScores.SequenceEqual(new[] { 1, 8 })
                && room.Players[0].Reserve == 4 && room.Players[0].Position == 0 && room.Players[0].Score == 9,
                "자동 정산이 탈락한 자리를 재사용하거나 8번을 넘겨 말 배치");
        });
        check("차오차오: 말 소진 후 의심·도착 말 손실·탈락자 순서 건너뛰기", () =>
        {
            var room = Ready(3); var exhausted = room.Players[1];
            exhausted.Position = null; exhausted.Reserve = 0; exhausted.Fallen = 5; exhausted.GoalScores = [1, 3];
            Claim(room, 2, 2); room.Respond("p1", room.Revision, true);
            assert(exhausted.GoalScores.SequenceEqual(new[] { 3 }) && exhausted.Fallen == 6, "말 소진 후 틀린 의심의 도착 말 손실 오류");
            assert(room.SpeakerId == "p2", "경주 말 없는 참가자가 굴림 차례를 가짐");
            Claim(room, 2, 2); room.Respond("p0", room.Revision, false); room.Respond("p1", room.Revision, true);
            assert(!exhausted.CanChallenge && exhausted.Score == 0, "도착 말까지 잃어도 의심 허용");
            Claim(room, 1, 1);
            assert(room.PendingResponderIds.SequenceEqual(new[] { "p2" }) && !room.CanRespond("p1"), "완전 탈락자를 응답 대상에서 제외하지 않음");
        });
        check("차오차오: 도착대 8칸 종료·동점 공동 승리·경주 말 소진 종료", () =>
        {
            var room = Ready(4);
            room.Players[0].GoalScores = [1]; room.Players[0].Position = 8;
            room.Players[1].GoalScores = [2, 7]; room.Players[2].GoalScores = [3, 6]; room.Players[3].GoalScores = [4, 5];
            Claim(room, 1, 1); PassAll(room);
            assert(room.Status == CiaoStatus.Finished && room.Winners.Count == 4 && room.Players.All(p => p.Score == 9), "도착대 만석 점수·공동 승리 오류");
            room = Ready(); room.Players[0].Position = 8; room.Players[0].Reserve = 0;
            room.Players[1].Position = null; room.Players[1].Reserve = 0; room.Players[1].Fallen = 7;
            Claim(room, 1, 1);
            assert(room.Status == CiaoStatus.Finished && room.Winners.SequenceEqual(new[] { "p0" }), "응답자·경주 말 소진 시 종료 실패");
        });
        check("차오차오: 상대 말이 모두 소진되면 마지막 참가자의 남은 말 전부 자동 도착·정산", () =>
        {
            for (int count = 2; count <= 4; count++)
            for (int survivorIndex = 0; survivorIndex < count; survivorIndex++)
            {
                var room = Ready(count);
                room.SpeakerIndex = survivorIndex;
                var survivor = room.Players[survivorIndex];
                survivor.GoalScores = [1, 2]; survivor.Position = 8; survivor.Reserve = 3; survivor.Fallen = 1;
                foreach (var p in room.Players.Where(p => p != survivor))
                { p.Position = null; p.Reserve = 0; p.Fallen = 7; }
                var lastOpponent = room.Players.First(p => p != survivor);
                lastOpponent.Position = 0; lastOpponent.Fallen = 6;
                Claim(room, 1, 1); room.Respond(lastOpponent.Id, room.Revision, true);
                assert(room.Status == CiaoStatus.Finished && room.Winners.SequenceEqual(new[] { survivor.Id }), "마지막 참가자 자동 종료 실패");
                assert(survivor.GoalScores.Order().SequenceEqual(Enumerable.Range(1, 6)) && survivor.Score == 21,
                    "세 번째 말 도착 시 정산을 멈추거나 남은 말의 도착 점수 누락");
                assert(survivor.Position is null && survivor.Reserve == 0 && survivor.Fallen == 1, "자동 도착 중 말 생성·유실");
                assert(room.Die is null && room.Declaration is null && room.Passed.Count == 0 && room.EndReason!.Contains("자동 도착"), "종료 상태·안내 초기화 실패");
            }
        });
        check("차오차오: 상대 도착 말이 남으면 계속 의심 가능·마지막 도착 말 소진 시 자동 정산", () =>
        {
            var room = Ready(); var opponent = room.Players[1];
            opponent.Position = null; opponent.Reserve = 0; opponent.Fallen = 6; opponent.GoalScores = [1];
            Claim(room, 2, 2);
            assert(room.CanRespond(opponent.Id), "도착 말이 있는 상대의 응답 생략");
            room.Respond(opponent.Id, room.Revision, false);
            assert(room.Status == CiaoStatus.Playing && room.Players[0].GoalScores.Count == 0 && room.Players[0].Position == 2,
                "도착 말이 남은 상대가 있는데 자동 정산");
            Claim(room, 1, 1); room.Respond(opponent.Id, room.Revision, true);
            assert(room.Status == CiaoStatus.Finished && room.Players[0].GoalScores.SequenceEqual(Enumerable.Range(2, 7)) && room.Players[0].Score == 35,
                "상대의 마지막 도착 말 소진 후 남은 말 전체 정산 실패");
            assert(opponent.GoalScores.Count == 0 && opponent.Fallen == 7, "상대 도착 말 손실 미반영");
            room = Ready(); opponent = room.Players[1];
            opponent.Position = 0; opponent.Reserve = 1; opponent.Fallen = 5;
            Claim(room, 1, 1); room.Respond(opponent.Id, room.Revision, true);
            assert(room.Status == CiaoStatus.Playing && opponent.Position == 0 && opponent.Reserve == 0,
                "상대 대기 말이 새로 출발했는데 자동 정산");
        });
        check("차오차오: 자동 도착 결과 저장·재접속·재대전", () =>
        {
            var store = new CiaoStore(Path.Combine(root, "차오 자동 정산"), () => 2);
            var room = store.Create("p0", "마지막 한 사람"); store.Join(room.Id, "p1");
            store.SetReady(room.Id, "p0", true); room = store.SetReady(room.Id, "p1", true);
            room.Players[1].Position = 0; room.Players[1].Reserve = 0; room.Players[1].Fallen = 6;
            File.WriteAllText(store.FilePath, JsonSerializer.Serialize(new CiaoDatabase { Rooms = [room] }));
            room = store.Roll(room.Id, "p0", room.Revision); room = store.Declare(room.Id, "p0", room.Revision, 2);
            room = store.Respond(room.Id, "p1", room.Revision, true);
            var restored = new CiaoStore(store.Folder).Rooms("p1").Single();
            assert(restored.Status == CiaoStatus.Finished && restored.Players[0].GoalScores.Count == 7 && restored.Players[0].Score == 28,
                "자동 정산 결과 저장·복원 실패");
            assert(restored.Players.All(p => p.Reserve + p.Fallen + p.GoalScores.Count + (p.Position is null ? 0 : 1) == 7), "저장된 말 수 불일치");
            store.SetReady(room.Id, "p0", true); room = store.SetReady(room.Id, "p1", true);
            assert(room.Status == CiaoStatus.Playing && room.Players.All(p => p.GoalScores.Count == 0 && p.Reserve == 6 && p.Position == 0), "자동 정산 후 재대전 실패");
        });
        check("차오차오: 여러 방 동시 저장·게임 중 나가기 보존·완료 방 삭제", () =>
        {
            var folder = Path.Combine(root, "차오 동시 저장"); var store = new CiaoStore(folder, () => 3);
            Parallel.For(0, 12, i => new CiaoStore(folder).Create($"p{i}", $"방 {i}"));
            assert(store.Rooms("p0").Count == 12, "동시 방 생성 중 유실");
            var room = store.Rooms("p0").Single(r => r.Find("p0") is not null);
            store.Join(room.Id, "guest"); store.SetReady(room.Id, "guest", true); room = store.SetReady(room.Id, "p0", true);
            room = store.Roll(room.Id, "p0", room.Revision); store.Leave(room.Id, "p0");
            assert(new CiaoStore(folder).Join(room.Id, "p0").Die == 3, "화면 나가기·재접속 후 주사위 유실");
            var waiting = store.Create("alone", "삭제할 방"); store.Leave(waiting.Id, "alone");
            assert(!store.Rooms("alone").Any(r => r.Id == waiting.Id), "빈 방 삭제 실패");
        });
        check("차오차오: 2~4인 전체 게임 저장·재조회·완료·재대전", () =>
        {
            for (int count = 2; count <= 4; count++)
            {
                var store = new CiaoStore(Path.Combine(root, "차오 전체 진행", count.ToString()), () => 4);
                var room = store.Create("p0", "전체 진행");
                for (int i = 1; i < count; i++) store.Join(room.Id, $"p{i}");
                for (int i = 0; i < count; i++) room = store.SetReady(room.Id, $"p{i}", true);
                int actions = 0;
                while (room.Status == CiaoStatus.Playing && actions++ < 200)
                {
                    var speaker = room.SpeakerId!;
                    room = room.Phase switch
                    {
                        CiaoPhase.Roll => store.Roll(room.Id, speaker, room.Revision),
                        CiaoPhase.Declare => store.Declare(room.Id, speaker, room.Revision, 4),
                        _ => store.Respond(room.Id, room.PendingResponderIds.First(), room.Revision, false),
                    };
                    room = new CiaoStore(store.Folder).Rooms("p0").Single();
                }
                assert(room.Status == CiaoStatus.Finished && room.Winners.Count > 0, "전체 게임 종료·저장 실패");
                assert(room.Players.All(p => p.Reserve + p.Fallen + p.GoalScores.Count + (p.Position is null ? 0 : 1) == 7), "진행 중 말 수 유실");
                for (int i = 0; i < count; i++) room = store.SetReady(room.Id, $"p{i}", true);
                assert(room.Status == CiaoStatus.Playing && room.Turn == 1 && room.Players.All(p => p.Score == 0), "완료한 방 재대전 실패");
            }
        });
        check("차오차오: 쓰기 대기 중 조회·조회 취소", () =>
        {
            var store = new CiaoStore(Path.Combine(root, "차오 조회")); store.Create("p0", "기존 방");
            var held = new FileStream(Path.Combine(store.Folder, ".ddongvoid-ciao.lock"), FileMode.Open, FileAccess.ReadWrite, FileShare.None);
            var pending = Task.Run(() => new CiaoStore(store.Folder).Create("p1", "새 방"));
            try
            {
                var snapshot = store.RoomsAsync("p0").WaitAsync(TimeSpan.FromSeconds(2)).GetAwaiter().GetResult();
                assert(snapshot.Count == 1 && !pending.IsCompleted, "쓰기 대기 중 마지막 완성본 조회 실패");
            }
            finally { held.Dispose(); pending.GetAwaiter().GetResult(); }
            using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
            try { store.RoomsAsync("p0", cancellation.Token).GetAwaiter().GetResult(); throw new Exception("조회 취소 무시"); }
            catch (OperationCanceledException) { }
            assert(store.Rooms("p0").Count == 2, "잠금 해제 후 저장 실패");
        });
        check("차오차오: 손상된 JSON 덮어쓰기 방지", () =>
        {
            var store = new CiaoStore(Path.Combine(root, "차오 손상 보존")); store.Create("p0", "보존");
            foreach (var json in new[] { "{ broken", "{\"Version\":1,\"Rooms\":[null]}" })
            {
                File.WriteAllText(store.FilePath, json);
                try { store.Create("p1", "덮어쓰기 금지"); throw new Exception("손상된 파일에 방 생성 허용"); }
                catch (InvalidDataException) { }
                assert(File.ReadAllText(store.FilePath) == json, "손상된 원본 변경");
            }
        });
    }
}
