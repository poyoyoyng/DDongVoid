namespace DDongVoid.Core;

public enum RhythmJudgement { Perfect, Great, Good, Miss }

public sealed class RhythmNote
{
    public int Lane { get; init; }
    public char Key { get; init; }
    // Moment the note reaches the hit line, on the engine clock.
    public double Time { get; init; }
    public double Travel { get; init; }
}

public sealed class RhythmEngine
{
    public const double PerfectWindow = .05, GreatWindow = .1, GoodWindow = .16;
    public static readonly string[] LaneKeys = ["QWERTASDFGZXCVB", "YUIOPHJKLNM[];',./"];
    // Labels follow the Korean 2-set layout printed on the same physical keys.
    private const string Latin = "QWERTYUIOPASDFGHJKLZXCVBNM", Hangul = "ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡ";
    private readonly int? seed;
    private Random random;
    private double nextNoteTime;
    public List<RhythmNote> Notes { get; } = [];
    public double Seconds { get; private set; }
    public int Score { get; private set; }
    public int Combo { get; private set; }
    public int MaxCombo { get; private set; }
    public int Perfect { get; private set; }
    public int Great { get; private set; }
    public int Good { get; private set; }
    public int Miss { get; private set; }
    // Whole points avoid floating drift: ten misses from full always end the run.
    public int Life { get; private set; } = 100;
    public bool IsOver => Life <= 0;
    public int Level => 1 + (int)(Seconds / 20);
    public double NoteInterval => Math.Max(.25, .75 / (1 + Seconds / 40));
    // Fall time shrinks steadily: 2x speed at 60s, 3x at 120s, capped near 3.3x.
    public double TravelTime => Math.Max(.55, 1.8 / (1 + Seconds / 60));
    public double SpeedMultiplier => 1.8 / TravelTime;
    // Share of beats that drop one note in each lane at the same moment.
    public double BothHandsChance => Math.Min(.45, .2 + Seconds / 300);
    public RhythmJudgement?[] LastJudgement { get; } = new RhythmJudgement?[2];
    public double[] LastJudgementTime { get; } = new double[2];
    public double[] LastPressTime { get; } = new double[2];
    public RhythmEngine(int? seed = null) { this.seed = seed; random = NewRandom(); Reset(); }
    // Unseeded runs draw a fresh random seed every game, so no two plays share a pattern.
    private Random NewRandom() => seed.HasValue ? new Random(seed.Value) : new Random(Random.Shared.Next());
    public static int LaneOf(char key) => Array.FindIndex(LaneKeys, keys => keys.Contains(char.ToUpperInvariant(key)));
    public static string LabelOf(char key)
    {
        var index = Latin.IndexOf(char.ToUpperInvariant(key));
        return index < 0 ? key.ToString() : Hangul[index].ToString();
    }
    public void Reset()
    {
        random = NewRandom(); Notes.Clear(); Seconds = 0; Score = Combo = MaxCombo = Perfect = Great = Good = Miss = 0; Life = 100; nextNoteTime = 2;
        Array.Clear(LastJudgement); Array.Fill(LastJudgementTime, double.NegativeInfinity); Array.Fill(LastPressTime, double.NegativeInfinity);
    }
    public void Update(double seconds)
    {
        if (IsOver || seconds <= 0) return;
        Seconds += Math.Min(seconds, .1);
        while (nextNoteTime < Seconds + TravelTime)
        {
            var bothHands = random.NextDouble() < BothHandsChance;
            if (bothHands) { AddNote(0); AddNote(1); } else AddNote(random.Next(LaneKeys.Length));
            // A two-hand beat gets a little more room before the next one.
            nextNoteTime += NoteInterval * (bothHands ? 1.25 : 1) * (.85 + random.NextDouble() * .3);
        }
        for (int i = Notes.Count - 1; i >= 0 && !IsOver; i--)
            if (Seconds - Notes[i].Time > GoodWindow) { var lane = Notes[i].Lane; Notes.RemoveAt(i); Judge(RhythmJudgement.Miss, lane); }
    }
    private void AddNote(int lane) =>
        Notes.Add(new RhythmNote { Lane = lane, Key = LaneKeys[lane][random.Next(LaneKeys[lane].Length)], Time = nextNoteTime, Travel = TravelTime });
    public RhythmJudgement? Hit(char key)
    {
        if (IsOver) return null;
        key = char.ToUpperInvariant(key);
        var pressedLane = LaneOf(key);
        if (pressedLane >= 0) LastPressTime[pressedLane] = Seconds;
        // Presses with no note in reach are ignored, so early taps are not punished.
        var note = Notes.Where(n => n.Key == key && Math.Abs(n.Time - Seconds) <= GoodWindow).MinBy(n => n.Time);
        if (note is null) return null;
        Notes.Remove(note);
        var delta = Math.Abs(note.Time - Seconds);
        var judgement = delta <= PerfectWindow ? RhythmJudgement.Perfect : delta <= GreatWindow ? RhythmJudgement.Great : RhythmJudgement.Good;
        Judge(judgement, note.Lane);
        return judgement;
    }
    private void Judge(RhythmJudgement judgement, int lane)
    {
        var points = judgement switch { RhythmJudgement.Perfect => 300, RhythmJudgement.Great => 200, RhythmJudgement.Good => 100, _ => 0 };
        switch (judgement)
        {
            case RhythmJudgement.Perfect: Perfect++; Life += 2; break;
            case RhythmJudgement.Great: Great++; Life += 1; break;
            case RhythmJudgement.Good: Good++; break;
            default: Miss++; Life -= 10; break;
        }
        if (judgement == RhythmJudgement.Miss) Combo = 0;
        else { Score += points + Math.Min(Combo, 100) * 2; Combo++; MaxCombo = Math.Max(MaxCombo, Combo); }
        Life = Math.Clamp(Life, 0, 100);
        LastJudgement[lane] = judgement; LastJudgementTime[lane] = Seconds;
    }
}
