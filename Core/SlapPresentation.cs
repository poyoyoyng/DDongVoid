namespace DDongVoid.Core;

public enum SlapPose { Idle, Charge, AttackSuccess, AttackFailed, Guard, Hit }

public sealed record SlapFighterVisual(SlapPose Pose, string Caption, string Description,
    bool Charging = false, bool Submitted = false, bool CurrentChoice = false, SlapZone? Zone = null);

public static class SlapPresentation
{
    public static bool ShowsResult(SlapRoom room) => room.LastResult is not null
        && !room.Players.Any(p => p.Submitted || p.GaveUp);

    public static string DescribeChoice(SlapAction action) => action.Move switch
    {
        SlapMove.Charge => "기 모으기",
        SlapMove.Slap => $"{SlapRules.ZoneName(action.Zone!.Value)} {SlapRules.PowerName(action.Power)}",
        _ => $"{SlapRules.ZoneName(action.Zone!.Value)} 막기",
    };

    public static SlapFighterVisual ForPlayer(SlapRoom room, string playerId, string viewerId)
    {
        var player = room.Find(playerId) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (room.Status == SlapStatus.Waiting)
            return new(SlapPose.Idle, player.Ready ? "준비 완료 ✓" : "준비 대기", player.Ready ? "준비 완료 ✓" : "대기 중");
        if (room.Status == SlapStatus.Finished && room.Winner is null)
            return new(SlapPose.Idle, "대전 종료", "두 사람 모두 포기하여 대전 종료");
        if (room.Status == SlapStatus.Playing && room.Players.Any(p => p.GaveUp))
            return new(SlapPose.Idle, player.GaveUp ? "포기 요청" : "응답 대기", player.GaveUp ? "포기 요청" : "상대의 포기 요청에 응답 대기");
        if (room.Status == SlapStatus.Playing && room.Players.Any(p => p.Submitted))
        {
            // Only a participant's own current choice is public on their screen.
            if (playerId == viewerId && player.Choice is { } choice)
                return new(choice.Move switch { SlapMove.Charge => SlapPose.Charge, SlapMove.Block => SlapPose.Guard, _ => SlapPose.Idle },
                    choice.Move switch { SlapMove.Slap => "입력 완료 ✓", SlapMove.Block => "막기 준비", _ => "기 모으기" },
                    $"선택 완료 · {DescribeChoice(choice)}", choice.Move == SlapMove.Charge, true, true, choice.Zone);
            return new(SlapPose.Idle, player.Submitted ? "입력 완료 ✓" : "선택 대기",
                player.Submitted ? "입력 완료 ✓" : "선택 대기", Submitted: player.Submitted);
        }
        if (room.LastResult is { } result)
        {
            if (playerId == result.Attacker)
            {
                if (result.Attack.Move == SlapMove.Charge)
                    return new(SlapPose.Charge, "기 모으기", "기 모으기 · 기력 +1", Charging: true);
                var success = !result.Blocked && result.Damage > 0;
                return new(success ? SlapPose.AttackSuccess : SlapPose.AttackFailed, success ? "공격 성공!" : "공격 실패",
                    $"{DescribeChoice(result.Attack)} · {(success ? $"피해 {result.Damage}" : "막혔어요")}", Zone: result.Attack.Zone);
            }
            if (playerId == result.Defender)
            {
                if (result.Blocked) return new(SlapPose.Guard, "막았다!", $"{DescribeChoice(result.Defense)} · 방어 성공", Zone: result.Defense.Zone);
                if (result.Damage > 0) return new(SlapPose.Hit, result.Defense.Move == SlapMove.Charge ? "기 모으기 · 맞았다!" : "맞았다!",
                    $"{DescribeChoice(result.Defense)} · 체력 -{result.Damage}{(result.Defense.Move == SlapMove.Charge ? " · 기력 +1" : "")}",
                    Charging: result.Defense.Move == SlapMove.Charge);
                return new(result.Defense.Move == SlapMove.Block ? SlapPose.Guard : SlapPose.Charge,
                    result.Defense.Move == SlapMove.Block ? "막기" : "기 모으기", DescribeChoice(result.Defense),
                    Charging: result.Defense.Move == SlapMove.Charge, Zone: result.Defense.Zone);
            }
        }
        return new(SlapPose.Idle, room.Status == SlapStatus.Finished ? "대전 종료" : "평소", "평소");
    }
}
