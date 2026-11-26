using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DDongVoid.Core;

public sealed record JeungYutAugment(string Id, string Icon, string Name, string Tier, string Kind, string Desc);
public sealed record JeungYutMove(int Token, int Result, string Route, int Steps, string To, int Count, List<string> Path);
public sealed record JeungYutRecruit(int Reserve, int Target);

public sealed class JeungYutToken
{
    public int Id { get; set; }
    public List<string> Path { get; set; } = [];
    public bool Done { get; set; }
    public bool Returning { get; set; }
}

public sealed class JeungYutPlayer
{
    public string Name { get; set; } = "";
    public int Turn { get; set; }
    public List<JeungYutToken> Tokens { get; set; } = [];
    public List<string> Augments { get; set; } = [];
    public int Shields { get; set; }
    public int Immunity { get; set; }
    public int? DopamineStart { get; set; }
    public int DopamineRelief { get; set; }
    public bool RecruitUsed { get; set; }
    public int Boost { get; set; }
    public bool Rerolled { get; set; }
    public int DraftRerolls { get; set; } = 1;
    public bool StrideUsed { get; set; }
    public bool FinishUsed { get; set; }
}

public sealed class JeungYutResult
{
    public int Id { get; set; }
    public int Value { get; set; }
}

public sealed class JeungYutRoll
{
    public int Id { get; set; }
    public int Owner { get; set; }
    public int Value { get; set; }
    public int Extra { get; set; }
    public bool Reroll { get; set; }
}

public sealed class JeungYutFlick
{
    public int Id { get; set; }
    public int Owner { get; set; }
    public double FromX { get; set; }
    public double FromY { get; set; }
    public double ToX { get; set; }
    public double ToY { get; set; }
    public string? Hit { get; set; }
    public string SourceNode { get; set; } = "";
    public List<int> SourceTokens { get; set; } = [];
    public int Victim { get; set; } = -1;
    public List<int> VictimTokens { get; set; } = [];
    public string Outcome { get; set; } = "miss";
}

// One request from the player to move: type is roll · reroll · move · augment · draftReroll · recruit · flick · skipFlick.
public sealed class JeungYutAction
{
    public string Type { get; set; } = "";
    public int? Value { get; set; }
    public string? Id { get; set; }
    public int? Result { get; set; }
    public int? Token { get; set; }
    public string? Route { get; set; }
    public double? PullX { get; set; }
    public double? PullY { get; set; }
    public int? Reserve { get; set; }
    public int? Target { get; set; }
}

public sealed class JeungYutState
{
    public List<JeungYutPlayer> Players { get; set; } = [];
    public int Active { get; set; }
    public string Phase { get; set; } = JeungYut.Roll;
    public int Round { get; set; } = 1;
    public int Throws { get; set; } = 1;
    public List<JeungYutResult> Pending { get; set; } = [];
    public List<string> Offers { get; set; } = [];
    public List<string> Log { get; set; } = [];
    public int? Winner { get; set; }
    public string? WinReason { get; set; }
    public bool Backdo { get; set; } = true;
    public int NextId { get; set; } = 1;
    public JeungYutFlick? Flick { get; set; }
    public JeungYutRoll? LastRoll { get; set; }
    public int Revision { get; set; }
}

// The web 증윷 (augmented yut) rules ported as they are: the same board, throws, 17 augments and log messages.
// Randomness comes only from the `rng` passed in, so tests can replay a game exactly.
public static class JeungYut
{
    public const string Roll = "roll", Move = "move", Augment = "augment", FlickPhase = "flick", Won = "won";
    public const string Home = "home", Finish = "finish";
    public const double FlickMaxPull = 180, FlickMaxTravel = 760, FlickMinPull = 8, BoardSize = 640;
    public static readonly int[] Milestones = [5, 10, 15];

    public static readonly JeungYutAugment[] Augments =
    [
        new("tower", "♜", "사단 합체", "prism", "특수 승리", "판 위에서 내 말 4개를 한 칸에 업으면 즉시 승리합니다."),
        new("line", "⁙", "일렬횡대", "prism", "특수 승리", "판 위의 직선 경로에서 서로 다른 연속 4칸에 말을 하나씩 세우면 즉시 승리합니다."),
        new("choice", "⑫", "작지만 확실한", "gold", "운명 선택", "윷을 던지는 대신 도 또는 개를 직접 고릅니다. 윷·모는 나오지 않습니다."),
        new("flick", "↗", "알까기의 달인", "prism", "미니게임", "내 4·8·12…번째 턴에 알을 뒤로 당겨 발사! 당긴 길이로 파워를 조절합니다. 명중하면 상대 묶음을 잡고 한 번 더, 빗나가면 내 묶음이 탈락해 대기로 돌아갑니다."),
        new("reroll", "⟳", "한 번 더 생각해", "silver", "행운", "매 턴 한 번, 도·개·걸·빽도 결과 하나를 다시 던질 수 있습니다. 도·개 선택 증강과 함께라면 다시 고릅니다."),
        new("shield", "♧", "든든한 호신부", "gold", "방어", "이번 판에 상대의 잡기 또는 알까기를 총 2회 막습니다. 잡으러 온 말은 이동 전 자리로 돌아갑니다."),
        new("stride", "⇉", "세 번째 큰 걸음", "silver", "기동", "내 3·6·9…번째 턴의 첫 전진 이동 거리가 1칸 늘어납니다."),
        new("hunter", "⌖", "추격 본능", "gold", "공격", "잡기에 성공할 때마다 다음 전진 이동 거리가 1칸 늘어납니다. 누적은 최대 2칸입니다."),
        new("solo", "♟", "나 홀로 산책", "silver", "기동", "업지 않은 말 하나를 도로 움직이면 1칸 더 갑니다."),
        new("comeback", "⤴", "다시 출발", "silver", "재기", "잡혔던 말은 대기에서 다시 출발할 때 딱 한 번 2칸 더 갑니다."),
        new("forward", "↑", "앞으로만", "silver", "안정", "내 빽도 결과가 모두 도로 바뀝니다."),
        new("finish", "⚑", "완주의 기세", "gold", "연계", "말을 완주시키면 추가 던지기 1회를 얻습니다. 한 턴에 한 번 발동합니다."),
        new("dopamine", "↟", "도파민장아찌", "gold", "선불 쾌감", "선택한 턴부터 내 7턴 동안 전진 이동 +1칸, 이후 10턴 동안 −1칸입니다. 상대 잡기·내 말 완주 한 번마다 디버프가 1턴 줄어듭니다. 버프 중 성공도 미리 차감하며, 디버프 종료 후 정상 이동합니다. 빽도는 그대로입니다."),
        new("aunt", "✋", "어쩌라고아줌마", "gold", "잡힘 면역", "잡히려는 순간 “어쩌라고” 하며 잡기·알까기를 총 3회 무시합니다. 업힌 묶음 전체를 보호하며, 한 번의 공격에 1회만 소모합니다."),
        new("banchan", "🍱", "반찬맨", "gold", "뜻밖의 한 상", "평소에는 도·개·걸만 나옵니다. 가끔 모가 나오면 두 번 더 던집니다! 윷·빽도는 나오지 않습니다."),
        new("stutter", "〰", "성어말?", "silver", "말 더듬기", "말을 더둠어서 전진 이동을 확정하면 +1칸 15%, −1칸 15%, 정상 이동 70%로 예정 목적지가 달라집니다. 실제 도착 칸에서 잡기·업기·완주를 판정합니다. 빽도는 그대로, 최소 이동은 0칸입니다."),
        new("recruit", "♙", "뒹학 사람좀 모아봐", "gold", "일회 집결", "내 말이 정확히 2개 완주한 상태에서 판당 딱 한 번! 창고의 말 하나를 달리고 있는 내 말에 업습니다. 사용하면 남은 이동·추가 던지기를 포기하고 즉시 턴이 끝납니다."),
    ];
    public static JeungYutAugment AugmentOf(string id) => Augments.First(a => a.Id == id);

    // 20 outer points counter-clockwise from the start (bottom right), then the two diagonals through the center.
    public static readonly IReadOnlyDictionary<string, (double X, double Y)> Nodes = BuildNodes();
    private static Dictionary<string, (double X, double Y)> BuildNodes()
    {
        var nodes = new Dictionary<string, (double X, double Y)>();
        for (var i = 0; i < 20; i++)
            nodes["o" + i] = i <= 5 ? (560, 560 - i * 96) : i <= 10 ? (560 - (i - 5) * 96, 80) : i <= 15 ? (80, 80 + (i - 10) * 96) : (80 + (i - 15) * 96, 560);
        foreach (var (id, x, y) in new[] { ("a1", 480, 160), ("a2", 400, 240), ("c", 320, 320), ("a4", 240, 400), ("a5", 160, 480),
            ("b1", 160, 160), ("b2", 240, 240), ("b4", 400, 400), ("b5", 480, 480) })
            nodes[id] = (x, y);
        return nodes;
    }
    public static readonly string[][] Lines =
    [
        ["o0", "o1", "o2", "o3", "o4", "o5"], ["o5", "o6", "o7", "o8", "o9", "o10"],
        ["o10", "o11", "o12", "o13", "o14", "o15"], ["o15", "o16", "o17", "o18", "o19", "o0"],
        ["o5", "a1", "a2", "c", "a4", "a5", "o15"], ["o10", "b1", "b2", "c", "b4", "b5", "o0"],
    ];
    private static readonly Dictionary<string, string> Next = new()
    {
        ["a1"] = "a2", ["a2"] = "c", ["a4"] = "a5", ["a5"] = "o15", ["b1"] = "b2", ["b2"] = "c", ["b4"] = "b5", ["b5"] = "o0",
    };

    public static bool OnBoard(string node) => Nodes.ContainsKey(node);
    public static string Position(JeungYutToken t) => t.Done ? Finish : t.Path.Count > 0 ? t.Path[^1] : Home;
    public static bool Has(JeungYutState s, int p, string id) => s.Players[p].Augments.Contains(id);
    public static string Label(int value) => value switch { -1 => "빽도", 1 => "도", 2 => "개", 3 => "걸", 4 => "윷", 5 => "모", _ => "" };

    public static int DopamineTurnsLeft(JeungYutPlayer p) =>
        p.Augments.Contains("dopamine") && p.DopamineStart is int start ? Math.Max(0, 7 - (p.Turn - start)) : 0;
    public static int DopamineDebuffTurnsLeft(JeungYutPlayer p)
    {
        if (!p.Augments.Contains("dopamine") || p.DopamineStart is not int start) return 0;
        var elapsed = Math.Max(0, p.Turn - start - 7);
        return Math.Max(0, 10 - elapsed - p.DopamineRelief);
    }
    private static void RelieveDopamine(JeungYutState s, int owner, string reason)
    {
        var p = s.Players[owner]; var left = DopamineDebuffTurnsLeft(p);
        if (left == 0) return;
        p.DopamineRelief++;
        Note(s, $"{p.Name} · {reason}! 도파민 디버프 1턴 감소 ({left - 1}턴 남음)");
    }

    private static JeungYutPlayer NewPlayer(string name) => new()
    {
        Name = name, Tokens = [.. Enumerable.Range(0, 4).Select(id => new JeungYutToken { Id = id })],
    };
    public static JeungYutState Create(IReadOnlyList<string> names, bool backdo, Func<double> rng)
    {
        if (names.Count is < 2 or > 4) throw new ArgumentException("개인전은 2~4명으로 진행합니다.");
        var s = new JeungYutState { Players = [.. names.Select(NewPlayer)], Active = (int)Math.Floor(rng() * names.Count), Backdo = backdo };
        BeginTurn(s, rng); return s;
    }
    private static void Note(JeungYutState s, string message)
    {
        s.Log.Insert(0, message);
        if (s.Log.Count > 40) s.Log.RemoveRange(40, s.Log.Count - 40);
    }
    private static List<string> Sample(IEnumerable<string> pool, int n, Func<double> rng)
    {
        var a = pool.ToList(); var picked = new List<string>();
        while (picked.Count < n && a.Count > 0)
        {
            var i = (int)Math.Floor(rng() * a.Count);
            picked.Add(a[i]); a.RemoveAt(i);
        }
        return picked;
    }
    private static IEnumerable<JeungYutAugment> AvailableAugments(JeungYutState s) => Augments.Where(a => !Has(s, s.Active, a.Id) &&
        !(a.Id == "choice" && Has(s, s.Active, "banchan")) && !(a.Id == "banchan" && Has(s, s.Active, "choice")));
    private static void Draft(JeungYutState s, Func<double> rng)
    {
        s.Offers = Sample(AvailableAugments(s).Select(a => a.Id), 3, rng); s.Phase = Augment;
    }
    private static void BeginTurn(JeungYutState s, Func<double> rng)
    {
        var p = s.Players[s.Active];
        p.Turn++; p.Rerolled = false; p.StrideUsed = false; p.FinishUsed = false; s.Throws = 1; s.Pending = []; s.Flick = null;
        Note(s, $"{p.Name} · {p.Turn}번째 턴");
        var milestone = Array.IndexOf(Milestones, p.Turn);
        if (milestone >= 0 && p.Augments.Count < milestone + 1) Draft(s, rng); else AfterDraft(s);
    }
    private static void AfterDraft(JeungYutState s)
    {
        var p = s.Active;
        s.Phase = Has(s, p, "flick") && s.Players[p].Turn % 4 == 0 && s.Players[p].Tokens.Any(t => OnBoard(Position(t))) &&
            s.Players.Where((_, i) => i != p).Any(other => other.Tokens.Any(t => OnBoard(Position(t)))) ? FlickPhase : Roll;
    }
    private static void Win(JeungYutState s, int p, string reason)
    {
        s.Winner = p; s.WinReason = reason; s.Phase = Won; Note(s, $"{s.Players[p].Name} 승리! {reason}");
    }
    public static void CheckWin(JeungYutState s, int p)
    {
        var tokens = s.Players[p].Tokens;
        if (tokens.All(t => t.Done)) { Win(s, p, "말 4개 모두 완주"); return; }
        var pos = tokens.Select(Position).ToList();
        if (Has(s, p, "tower") && OnBoard(pos[0]) && pos.All(x => x == pos[0])) { Win(s, p, "사단 합체 · 말 4개 업기"); return; }
        if (Has(s, p, "line") && pos.Distinct().Count() == 4 && pos.All(OnBoard) &&
            Lines.Any(l => Enumerable.Range(0, l.Length - 3).Any(i => l.Skip(i).Take(4).All(pos.Contains))))
            Win(s, p, "일렬횡대 · 연속 4칸");
    }
    private static int RolledValue(JeungYutState s, Func<double> rng)
    {
        if (Has(s, s.Active, "banchan"))
        {
            double draw = rng(), moChance = .33 / 16;
            if (draw < moChance) return 5;
            var ordinary = (draw - moChance) / (1 - moChance);
            return ordinary < 4.0 / 14 ? 1 : ordinary < 10.0 / 14 ? 2 : 3;
        }
        var bits = (int)Math.Floor(rng() * 16); var count = System.Numerics.BitOperations.PopCount((uint)bits);
        var value = count == 0 ? 5 : count;
        if (s.Backdo && bits == 1) value = -1;
        if (value == -1 && Has(s, s.Active, "forward")) value = 1;
        return value;
    }
    private static int ExtraThrows(JeungYutState s, int value) => value == 5 && Has(s, s.Active, "banchan") ? 2 : value >= 4 ? 1 : 0;

    public static JeungYutToken Walk(JeungYutToken token, int steps, string route = "outer")
    {
        var t = new JeungYutToken { Id = token.Id, Path = [.. token.Path], Done = token.Done, Returning = token.Returning };
        if (steps < 0) { if (t.Path.Count > 0) t.Path.RemoveAt(t.Path.Count - 1); return t; }
        for (var i = 0; i < steps && !t.Done; i++)
        {
            var here = Position(t); string next;
            if (here == Home) next = "o1";
            else if (here == "o0") { t.Done = true; continue; }
            else if (i == 0 && route == "shortcut" && here is "o5" or "o10") next = here == "o5" ? "a1" : "b1";
            // A shortcut stays straight when passing the center; stopping there allows the short exit next turn.
            else if (here == "c") next = i == 0 ? (route == "long" ? "a4" : "b4") : (t.Path.Count >= 2 && t.Path[^2] == "a2" ? "a4" : "b4");
            else next = Next.TryGetValue(here, out var n) ? n : "o" + (int.Parse(here[1..]) + 1) % 20;
            t.Path.Add(next);
        }
        return t;
    }
    private static List<JeungYutToken> Group(JeungYutState s, int p, int id)
    {
        var t = s.Players[p].Tokens.FirstOrDefault(t => t.Id == id);
        if (t is null || t.Done) return [];
        var pos = Position(t);
        return pos == Home ? [t] : [.. s.Players[p].Tokens.Where(x => Position(x) == pos)];
    }
    private static int Distance(JeungYutState s, JeungYutResult result, List<JeungYutToken> g)
    {
        if (result.Value < 0) return -1;
        var p = s.Players[s.Active]; var n = result.Value;
        if (Has(s, s.Active, "stride") && p.Turn % 3 == 0 && !p.StrideUsed) n++;
        if (Has(s, s.Active, "solo") && g.Count == 1 && n > 0 && result.Value == 1) n++;
        if (Has(s, s.Active, "comeback") && Position(g[0]) == Home && g[0].Returning) n += 2;
        if (DopamineTurnsLeft(p) > 0) n++;
        else if (DopamineDebuffTurnsLeft(p) > 0) n--;
        return Math.Max(0, n + p.Boost);
    }
    public static List<JeungYutMove> LegalMoves(JeungYutState s)
    {
        if (s.Phase is not (Roll or Move)) return [];
        var p = s.Active; var moves = new List<JeungYutMove>(); var seen = new HashSet<string>();
        foreach (var t in s.Players[p].Tokens)
        {
            var pos = Position(t);
            if (t.Done || seen.Contains(pos)) continue;
            if (pos != Home) seen.Add(pos);
            var g = Group(s, p, t.Id);
            foreach (var result in s.Pending)
            {
                if (result.Value < 0 && pos == Home) continue;
                var steps = Distance(s, result, g);
                string[] routes = steps <= 0 ? ["outer"] : pos is "o5" or "o10" ? ["outer", "shortcut"] : pos == "c" ? ["short", "long"] : ["outer"];
                foreach (var route in routes)
                {
                    var moved = Walk(t, steps, route);
                    moves.Add(new(t.Id, result.Id, route, steps, Position(moved), g.Count, moved.Path));
                }
            }
        }
        return moves;
    }
    public static List<JeungYutRecruit> RecruitOptions(JeungYutState s)
    {
        var p = s.Players[s.Active];
        if (s.Winner is not null || s.Phase is not (Roll or Move or FlickPhase) || !Has(s, s.Active, "recruit") || p.RecruitUsed || p.Tokens.Count(t => t.Done) != 2) return [];
        var reserves = p.Tokens.Where(t => Position(t) == Home).ToList(); var runners = p.Tokens.Where(t => OnBoard(Position(t))).ToList();
        return [.. reserves.SelectMany(reserve => runners.Select(target => new JeungYutRecruit(reserve.Id, target.Id)))];
    }
    private static void Settle(JeungYutState s, Func<double> rng)
    {
        if (s.Winner is not null) return;
        if (s.Throws > 0) { s.Phase = Roll; return; }
        s.Phase = Move;
        if (LegalMoves(s).Count > 0) return;
        if (s.Pending.Count > 0) Note(s, "움직일 말이 없어 빽도를 소모합니다.");
        s.Pending = []; s.Active = (s.Active + 1) % s.Players.Count; s.Round++; BeginTurn(s, rng);
    }
    private static (int Caught, bool Blocked) Capture(JeungYutState s, int owner, string at)
    {
        var victim = s.Players.Where((_, i) => i != owner).FirstOrDefault(p => p.Tokens.Any(t => Position(t) == at));
        if (victim is null) return (0, false);
        var caught = victim.Tokens.Where(t => Position(t) == at).ToList();
        if (victim.Immunity > 0) { victim.Immunity--; Note(s, $"{victim.Name}: “어쩌라고!” 잡힘 면역 ({victim.Immunity}/3회 남음)"); return (0, true); }
        if (victim.Shields > 0) { victim.Shields--; Note(s, $"{victim.Name}의 호신부가 잡기를 막았습니다. ({victim.Shields}회 남음)"); return (0, true); }
        foreach (var t in caught) { t.Path = []; t.Done = false; t.Returning = true; }
        Note(s, $"{s.Players[owner].Name}, {victim.Name}의 말 {caught.Count}개 잡기!");
        RelieveDopamine(s, owner, "상대 잡기");
        if (Has(s, owner, "hunter")) s.Players[owner].Boost = Math.Min(2, s.Players[owner].Boost + 1);
        return (caught.Count, false);
    }

    // Pulling back launches the other way; a longer pull travels further, up to a cap the client cannot exceed.
    public static (double Dx, double Dy, double Power, double Length) FlickFromPull(double pullX, double pullY)
    {
        var length = Math.Sqrt(pullX * pullX + pullY * pullY);
        if (!double.IsFinite(pullX) || !double.IsFinite(pullY) || !double.IsFinite(length)) throw new ArgumentException("잘못된 알까기 드래그입니다.");
        var power = Math.Min(1, length / FlickMaxPull) * FlickMaxTravel;
        return (pullX != 0 ? -pullX / length : 0, pullY != 0 ? -pullY / length : 0, power, length);
    }
    // The disc travels in a straight line and stops at the first opponent stack within its radius.
    public static ((double X, double Y) To, string? Hit) SimulateFlick((double X, double Y) source, double dx, double dy, double power,
        IEnumerable<(double X, double Y, string Node)> targets)
    {
        var mag = Math.Sqrt(dx * dx + dy * dy);
        if (mag < .001) return (source, null);
        double travel = Math.Clamp(power, 0, FlickMaxTravel), ux = dx / mag, uy = dy / mag, best = travel;
        string? hit = null;
        foreach (var target in targets)
        {
            double tx = target.X - source.X, ty = target.Y - source.Y, along = tx * ux + ty * uy, perp2 = tx * tx + ty * ty - along * along;
            if (perp2 > 42 * 42 || along < 0) continue;
            var near = Math.Max(0, along - Math.Sqrt(42 * 42 - perp2));
            if (near <= best) { best = near; hit = target.Node; }
        }
        return ((source.X + ux * best, source.Y + uy * best), hit);
    }

    public static void Act(JeungYutState s, JeungYutAction action, Func<double> rng)
    {
        if (s.Phase == Won) throw new ArgumentException("이미 끝난 게임입니다.");
        var p = s.Players[s.Active];
        switch (action.Type)
        {
            case "augment":
            {
                if (s.Phase != Augment || action.Id is null || !s.Offers.Contains(action.Id)) throw new ArgumentException("선택할 수 없는 증강입니다.");
                p.Augments.Add(action.Id);
                if (action.Id == "shield") p.Shields = 2;
                if (action.Id == "dopamine") { p.DopamineStart = p.Turn; p.DopamineRelief = 0; }
                if (action.Id == "aunt") p.Immunity = 3;
                if (action.Id == "recruit") p.RecruitUsed = false;
                Note(s, $"{p.Name}의 증강: {AugmentOf(action.Id).Name}"); s.Offers = [];
                CheckWin(s, s.Active); if (s.Winner is null) AfterDraft(s);
                break;
            }
            case "draftReroll":
            {
                if (s.Phase != Augment || p.DraftRerolls <= 0) throw new ArgumentException("증강 재선택을 사용할 수 없습니다.");
                var previous = s.Offers.ToList(); p.DraftRerolls--;
                s.Offers = Sample(AvailableAugments(s).Where(a => !previous.Contains(a.Id)).Select(a => a.Id), 3, rng);
                break;
            }
            case "roll":
            {
                if (s.Phase is not (Roll or Move) || s.Throws <= 0) throw new ArgumentException("던질 수 없는 차례입니다.");
                int value;
                if (Has(s, s.Active, "choice"))
                {
                    if (action.Value is not (1 or 2)) throw new ArgumentException("도 또는 개를 고르세요.");
                    value = action.Value.Value;
                }
                else value = RolledValue(s, rng);
                var extra = ExtraThrows(s, value); s.Throws = s.Throws - 1 + extra;
                s.LastRoll = new() { Id = s.Revision + 1, Owner = s.Active, Value = value, Extra = extra };
                s.Pending.Add(new() { Id = s.NextId++, Value = value });
                Note(s, $"{p.Name} · {Label(value)}{(extra == 2 ? "! 반찬맨, 두 번 더!" : extra == 1 ? "! 한 번 더" : "")}"); Settle(s, rng);
                break;
            }
            case "reroll":
            {
                var r = s.Pending.FirstOrDefault(x => x.Id == action.Result);
                if (s.Phase is not (Roll or Move) || !Has(s, s.Active, "reroll") || p.Rerolled || r is null || r.Value >= 4) throw new ArgumentException("이 결과는 다시 던질 수 없습니다.");
                var choice = Has(s, s.Active, "choice");
                if (choice && action.Value is not (1 or 2)) throw new ArgumentException("도 또는 개를 고르세요.");
                p.Rerolled = true; r.Value = choice ? action.Value!.Value : RolledValue(s, rng);
                var extra = ExtraThrows(s, r.Value); s.Throws += extra;
                s.LastRoll = new() { Id = s.Revision + 1, Owner = s.Active, Value = r.Value, Extra = extra, Reroll = true };
                Note(s, $"{p.Name} · 다시 던져 {Label(r.Value)}{(extra == 2 ? "! 반찬맨, 두 번 더!" : "")}"); Settle(s, rng);
                break;
            }
            case "move":
            {
                var move = LegalMoves(s).FirstOrDefault(m => m.Token == action.Token && m.Result == action.Result && m.Route == action.Route)
                    ?? throw new ArgumentException("이동할 수 없는 자리입니다.");
                var result = s.Pending.First(x => x.Id == move.Result); var g = Group(s, s.Active, move.Token);
                var offset = 0;
                if (result.Value > 0 && Has(s, s.Active, "stutter")) { var draw = rng(); offset = draw < .15 ? 1 : draw < .3 ? -1 : 0; }
                var steps = result.Value < 0 ? move.Steps : Math.Max(0, move.Steps + offset);
                var moved = Walk(g[0], steps, move.Route); var to = Position(moved);
                var stumble = offset != 0 ? $" · “성어말?” {(offset > 0 ? "+1" : "−1")}칸! (예정 {move.Steps} → 실제 {steps}칸)" : "";
                s.Pending.RemoveAll(x => x.Id == move.Result);
                // Consume the old boost before applying a newly earned capture boost.
                if (result.Value > 0) { p.Boost = 0; p.StrideUsed = true; }
                var outcome = OnBoard(to) ? Capture(s, s.Active, to) : (Caught: 0, Blocked: false);
                if (!outcome.Blocked)
                {
                    foreach (var t in g) { t.Path = [.. moved.Path]; t.Done = moved.Done; if (steps > 0) t.Returning = false; }
                    Note(s, $"{p.Name} {string.Join("·", g.Select(t => t.Id + 1))}번 말 {(steps == -1 ? "뒤로 1" : steps.ToString())}칸{stumble}{(moved.Done ? " · 완주!" : "")}");
                    if (moved.Done) RelieveDopamine(s, s.Active, "말 완주");
                    if (outcome.Caught > 0 && result.Value < 4) s.Throws++;
                    if (moved.Done && Has(s, s.Active, "finish") && !p.FinishUsed) { s.Throws++; p.FinishUsed = true; Note(s, "완주의 기세 · 한 번 더!"); }
                }
                else if (offset != 0) Note(s, $"{p.Name}{stumble} · {s.Log[0]}");
                CheckWin(s, s.Active); Settle(s, rng);
                break;
            }
            case "recruit":
            {
                if (!RecruitOptions(s).Any(o => o.Reserve == action.Reserve && o.Target == action.Target))
                    throw new ArgumentException("내 말 2개가 완주하고 창고 말과 달리는 말이 있어야 판당 한 번 사용할 수 있습니다.");
                var reserve = p.Tokens.First(t => t.Id == action.Reserve); var target = p.Tokens.First(t => t.Id == action.Target);
                reserve.Path = [.. target.Path]; reserve.Done = false; reserve.Returning = false; p.RecruitUsed = true;
                Note(s, $"{p.Name}: “뒹학 사람좀 모아봐!” {reserve.Id + 1}번 말을 {target.Id + 1}번 말에 업었습니다. 턴 종료!");
                s.Pending = []; s.Throws = 0; Settle(s, rng);
                break;
            }
            case "flick":
            {
                if (s.Phase != FlickPhase) throw new ArgumentException("알까기 차례가 아닙니다.");
                if (action.PullX is not double pullX || action.PullY is not double pullY) throw new ArgumentException("잘못된 알까기 드래그입니다.");
                var launch = FlickFromPull(pullX, pullY);
                if (launch.Length < FlickMinPull) throw new ArgumentException("알을 조금 더 당긴 뒤 놓으세요.");
                var t = p.Tokens.FirstOrDefault(t => t.Id == action.Token);
                if (t is null || !OnBoard(Position(t))) throw new ArgumentException("판 위의 내 말을 선택하세요.");
                var sourceNode = Position(t); var source = Nodes[sourceNode]; var shooters = Group(s, s.Active, t.Id);
                var targets = s.Players.Where((_, i) => i != s.Active).SelectMany(o => o.Tokens.Select(Position)).Distinct().Where(OnBoard)
                    .Select(node => (Nodes[node].X, Nodes[node].Y, node)).ToList();
                var shot = SimulateFlick(source, launch.Dx, launch.Dy, launch.Power, targets);
                var victim = shot.Hit is null ? -1 : s.Players.FindIndex(o => o != p && o.Tokens.Any(x => Position(x) == shot.Hit));
                s.Flick = new()
                {
                    Id = s.Revision + 1, Owner = s.Active, FromX = source.X, FromY = source.Y, ToX = shot.To.X, ToY = shot.To.Y, Hit = shot.Hit,
                    SourceNode = sourceNode, SourceTokens = [.. shooters.Select(x => x.Id)], Victim = victim,
                    VictimTokens = victim < 0 ? [] : [.. s.Players[victim].Tokens.Where(x => Position(x) == shot.Hit).Select(x => x.Id)],
                };
                if (shot.Hit is not null)
                {
                    var hit = Capture(s, s.Active, shot.Hit); s.Flick.Outcome = hit.Blocked ? "blocked" : "hit";
                    if (hit.Caught > 0) s.Throws++;
                }
                else
                {
                    foreach (var token in shooters) { token.Path = []; token.Done = false; token.Returning = true; }
                    Note(s, $"{p.Name} · 알까기 빗나감! 내 말 {shooters.Count}개가 날아가 탈락했습니다.");
                }
                s.Phase = Roll;
                break;
            }
            case "skipFlick":
                if (s.Phase != FlickPhase) throw new ArgumentException("알까기 차례가 아닙니다.");
                s.Phase = Roll;
                break;
            default: throw new ArgumentException("알 수 없는 행동입니다.");
        }
        s.Revision++;
    }
}

public enum JeungYutStatus { Waiting, Playing, Finished }

public sealed class JeungYutSeat
{
    public string Id { get; set; } = "";
    public bool Ready { get; set; }
}

public sealed class JeungYutRoom
{
    public const int MinPlayers = 2, MaxPlayers = 4, MaxTitleLength = 40;
    public static readonly TimeSpan MatchPollInterval = TimeSpan.FromSeconds(.5);
    public Guid Id { get; set; }
    public string Title { get; set; } = "증강윷놀이 방";
    public DateTimeOffset CreatedAt { get; set; }
    public JeungYutStatus Status { get; set; }
    public int Revision { get; set; }
    public int Match { get; set; }
    public List<JeungYutSeat> Players { get; set; } = [];
    public JeungYutState? Game { get; set; }
    public List<string> Winners { get; set; } = [];
    public string? LastMessage { get; set; }
    public string? HostId => Players.FirstOrDefault()?.Id;
    public string? CurrentPlayerId => Status == JeungYutStatus.Playing && Game is { } g ? Players[g.Active].Id : null;
    public JeungYutSeat? Find(string id) => Players.FirstOrDefault(p => p.Id == id);
    public int IndexOf(string id) => Players.FindIndex(p => p.Id == id);

    public void SetReady(string id, bool ready, Func<double> rng)
    {
        var player = Find(id) ?? throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status == JeungYutStatus.Playing) throw new ArgumentException("이미 게임이 진행 중입니다.");
        player.Ready = ready; Revision++;
        if (Players.Count < MinPlayers || Players.Any(p => !p.Ready)) return;
        foreach (var p in Players) p.Ready = false;
        Match++; Winners.Clear();
        Game = JeungYut.Create([.. Players.Select(p => p.Id)], true, rng);
        Status = JeungYutStatus.Playing;
        LastMessage = $"{Players[Game.Active].Id}님부터 시작합니다.";
    }
    private void CheckAction(string id, int revision)
    {
        if (Find(id) is null) throw new ArgumentException("이 방의 참가자가 아닙니다.");
        if (Status != JeungYutStatus.Playing || Game is null) throw new ArgumentException("게임이 진행 중이 아닙니다.");
        if (Revision != revision) throw new ArgumentException("방 상태가 바뀌었습니다. 최신 화면에서 다시 선택해 주세요.");
    }
    public void Act(string id, int revision, JeungYutAction action, Func<double> rng)
    {
        CheckAction(id, revision);
        if (CurrentPlayerId != id) throw new ArgumentException("내 차례가 아닙니다.");
        JeungYut.Act(Game!, action, rng);
        Revision++; LastMessage = Game!.Log.FirstOrDefault();
        if (Game.Winner is int winner) Finish([Players[winner].Id], $"{Players[winner].Id} 승리! {Game.WinReason}");
    }
    // Resigning ends the match: whoever else has finished the most pieces wins, sharing the win on a tie.
    public void Resign(string id, int revision)
    {
        CheckAction(id, revision);
        var others = Players.Select((p, i) => (p.Id, Done: Game!.Players[i].Tokens.Count(t => t.Done))).Where(p => p.Id != id).ToList();
        var best = others.Max(p => p.Done);
        Revision++;
        Finish([.. others.Where(p => p.Done == best).Select(p => p.Id)], $"{id} 기권 · 완주한 말이 가장 많은 사람이 승리");
    }
    private void Finish(List<string> winners, string message)
    {
        Winners = winners; LastMessage = message; Status = JeungYutStatus.Finished;
    }
    public JeungYutRoom Copy() => JsonSerializer.Deserialize<JeungYutRoom>(JsonSerializer.Serialize(this))!;
}

public sealed class JeungYutDatabase
{
    public int Version { get; set; } = 1;
    public List<JeungYutRoom> Rooms { get; set; } = [];
    public List<Guid> DeletedRoomIds { get; set; } = [];
}

public sealed record JeungYutSnapshot(List<JeungYutRoom> Rooms, List<Guid> DeletedRoomIds);

public sealed class JeungYutStore
{
    public string Folder { get; }
    public string FilePath => Path.Combine(Folder, "ddongvoid-jeungyut.json");
    private readonly Func<double> rng;

    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, Converters = { new JsonStringEnumConverter() } };
    public JeungYutStore(string folder, Func<double>? rng = null) { Folder = Path.GetFullPath(folder); this.rng = rng ?? Random.Shared.NextDouble; }
    private static JeungYutDatabase Validate(JeungYutDatabase? db)
    {
        if (db is null || db.Version != 1 || db.Rooms is null || db.DeletedRoomIds is null ||
            db.DeletedRoomIds.Any(id => id == Guid.Empty) || db.DeletedRoomIds.Distinct().Count() != db.DeletedRoomIds.Count ||
            db.Rooms.Select(r => r?.Id).Distinct().Count() != db.Rooms.Count) throw new JsonException();
        foreach (var r in db.Rooms)
        {
            if (r is null || r.Id == Guid.Empty || db.DeletedRoomIds.Contains(r.Id) ||
                string.IsNullOrWhiteSpace(r.Title) || r.Title.Length > JeungYutRoom.MaxTitleLength ||
                r.Players is null || r.Players.Count is < 1 or > JeungYutRoom.MaxPlayers ||
                r.Players.Any(p => p is null || string.IsNullOrWhiteSpace(p.Id)) ||
                r.Players.Select(p => p.Id).Distinct().Count() != r.Players.Count ||
                !Enum.IsDefined(r.Status) || r.Revision < 0 || r.Match < 0 ||
                r.Winners is null || r.Winners.Distinct().Count() != r.Winners.Count || r.Winners.Any(id => r.Find(id) is null))
                throw new JsonException();
            if (r.Status == JeungYutStatus.Waiting)
            {
                if (r.Winners.Count != 0 || r.Game is not null) throw new JsonException();
            }
            else if (r.Game is not { } g || g.Players is null || g.Players.Count != r.Players.Count || g.Active < 0 || g.Active >= r.Players.Count ||
                g.Pending is null || g.Offers is null || g.Log is null ||
                g.Players.Any(p => p is null || p.Augments is null || p.Tokens is null || p.Tokens.Count != 4 || p.Tokens.Any(t => t is null || t.Path is null)) ||
                (r.Status == JeungYutStatus.Playing && r.Winners.Count != 0) ||
                (r.Status == JeungYutStatus.Finished && r.Winners.Count == 0))
                throw new JsonException();
        }
        return db;
    }
    private async Task<JeungYutDatabase> ReadAsync(CancellationToken cancellation = default)
    {
        cancellation.ThrowIfCancellationRequested();
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                await using var file = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete,
                    4096, FileOptions.Asynchronous | FileOptions.SequentialScan);
                return Validate(await JsonSerializer.DeserializeAsync<JeungYutDatabase>(file, JsonOptions, cancellation).ConfigureAwait(false));
            }
            catch (IOException ex) when (attempt < 20 && (ex.HResult & 0xffff) is 32 or 33)
            { await Task.Delay(25, cancellation).ConfigureAwait(false); }
            catch (FileNotFoundException) { return new(); }
            catch (DirectoryNotFoundException) { return new(); }
            catch (JsonException ex) { throw new InvalidDataException("증강윷놀이 JSON 형식이 올바르지 않습니다. 기존 방을 보호하기 위해 파일을 보존했습니다.", ex); }
        }
    }
    private T Write<T>(Func<JeungYutDatabase, T> action) => SharedFile.Locked(FilePath, ".ddongvoid-jeungyut.lock", true,
        "다른 PC에서 증강윷놀이 정보를 저장 중입니다. 잠시 후 다시 시도해 주세요.", () =>
        {
            var db = ReadAsync().GetAwaiter().GetResult();
            var finished = db.Rooms.ToDictionary(r => r.Id, r => r.Status == JeungYutStatus.Finished);
            var result = action(db); Validate(db);
            GameResultStore.RecordFinished(Folder, GameResultStore.JeungYut, db.Rooms, finished,
                r => (r.Id, r.Revision, r.Status == JeungYutStatus.Finished, r.Players.Select(p => p.Id).ToList(), r.Winners));
            SharedFile.WriteAtomic(FilePath, db, JsonOptions); return result;
        });
    private static JeungYutRoom Room(JeungYutDatabase db, Guid id) => db.Rooms.FirstOrDefault(r => r.Id == id)
        ?? throw new ArgumentException("방이 사라졌습니다. 방 목록에서 다시 골라 주세요.");
    public async Task<JeungYutSnapshot> SnapshotAsync(CancellationToken cancellation = default)
    {
        var db = await ReadAsync(cancellation).ConfigureAwait(false);
        return new(db.Rooms.OrderBy(r => r.CreatedAt).ToList(), db.DeletedRoomIds.ToList());
    }
    public List<JeungYutRoom> Rooms() => SnapshotAsync().GetAwaiter().GetResult().Rooms;
    public JeungYutRoom Create(string userId, string title)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("방 제목을 입력해 주세요.");
        title = title.Trim();
        if (title.Length > JeungYutRoom.MaxTitleLength) throw new ArgumentException($"방 제목은 {JeungYutRoom.MaxTitleLength}자까지 입력할 수 있습니다.");
        return Write(db =>
        {
            var room = new JeungYutRoom { Id = Guid.NewGuid(), Title = title, CreatedAt = DateTimeOffset.UtcNow, Players = [new() { Id = userId }] };
            db.Rooms.Add(room); return room.Copy();
        });
    }
    private JeungYutRoom? Member(Guid id, string userId) =>
        ReadAsync().GetAwaiter().GetResult().Rooms.FirstOrDefault(r => r.Id == id && r.Find(userId) is not null);
    // Re-entering a room you already play in only reads it, so a failing shared-folder write can never lock you out of your own game.
    public JeungYutRoom Join(Guid id, string userId) => Member(id, userId) is { } current ? current.Copy() : Write(db =>
    {
        var room = Room(db, id);
        if (room.Find(userId) is not null) return room.Copy();
        if (room.Status != JeungYutStatus.Waiting) throw new ArgumentException("이미 시작했거나 종료한 방입니다.");
        if (room.Players.Count >= JeungYutRoom.MaxPlayers) throw new ArgumentException($"이미 {JeungYutRoom.MaxPlayers}명이 참가한 방입니다.");
        room.Players.Add(new() { Id = userId }); room.Revision++; return room.Copy();
    });
    private JeungYutRoom Act(Guid id, Action<JeungYutRoom> action) => Write(db =>
    {
        var room = Room(db, id); action(room); return room.Copy();
    });
    public JeungYutRoom SetReady(Guid id, string userId, bool ready) => Act(id, room => room.SetReady(userId, ready, rng));
    public JeungYutRoom Play(Guid id, string userId, int revision, JeungYutAction action) => Act(id, room => room.Act(userId, revision, action, rng));
    public JeungYutRoom Resign(Guid id, string userId, int revision) => Act(id, room => room.Resign(userId, revision));
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
        if (room.Status == JeungYutStatus.Playing) return false; // Closing the view preserves an ongoing game.
        room.Players.RemoveAll(p => p.Id == userId);
        foreach (var player in room.Players) player.Ready = false;
        room.Status = JeungYutStatus.Waiting; room.Game = null; room.Winners.Clear(); room.LastMessage = null;
        room.Revision++;
        if (room.Players.Count == 0) { db.Rooms.Remove(room); db.DeletedRoomIds.Add(id); }
        return true;
    });
}
