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
                room.Respond(room.ResponderId!, room.Revision, false);
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
        check("차오차오: 순서대로 PASS·전원 동의 후 이동·중복 및 늦은 입력 거부", () =>
        {
            var room = Ready(4);
            Reject(() => room.Declare("p0", room.Revision, 3));
            Reject(() => room.Roll("p1", room.Revision, 2));
            room.Roll("p0", room.Revision, 2);
            Reject(() => room.Declare("p0", room.Revision, 0));
            Reject(() => room.Declare("p0", room.Revision, CiaoRules.MaxDeclaration + 1));
            room.Declare("p0", room.Revision, 3);
            Reject(() => room.Respond("p2", room.Revision, true));
            var old = room.Revision; room.Respond("p1", old, false);
            Reject(() => room.Respond("p1", old, true));
            assert(room.Players[0].Position == 0 && room.ResponderId == "p2", "모두 응답 전 이동");
            room.Respond("p2", room.Revision, false);
            assert(room.ResponderId == "p3", "마지막 응답자 건너뜀");
            room.Respond("p3", room.Revision, false);
            assert(room.Players[0].Position == 3 && room.SpeakerId == "p1" && room.Turn == 2, "이동 또는 차례 교대 실패");
            Reject(() => room.Roll("p1", old, 1));
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
                && room.Turn == 1 && room.LastResult is null, "재대전 초기화 실패");
            Reject(() => room.Roll("p0", old, 1));
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
            assert(room.ResponderId == "p2", "완전 탈락자를 응답 순서에서 제외하지 않음");
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
            assert(room.ResponderId == opponent.Id, "도착 말이 있는 상대의 응답 생략");
            room.Respond(opponent.Id, room.Revision, false);
            assert(room.Status == CiaoStatus.Playing && room.Players[0].GoalScores.Count == 0 && room.Players[0].Position == 2,
                "도착 말이 남은 상대가 있는데 자동 정산");
            Claim(room, 1, 1); room.Respond(opponent.Id, room.Revision, true);
            assert(room.Status == CiaoStatus.Finished && room.Players[0].GoalScores.Count == 7 && room.Players[0].Score == 28,
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
                        _ => store.Respond(room.Id, room.ResponderId!, room.Revision, false),
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
