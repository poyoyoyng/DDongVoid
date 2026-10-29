using System.Globalization;
using System.Windows;
using System.Windows.Media;
using DDongVoid.Core;

namespace DDongVoid;

public sealed class RhythmSurface : FrameworkElement
{
    public RhythmEngine Engine { get; } = new();
    public bool TransparentMode { get; set; }
    public double BackgroundStrength { get; set; } = 1;
    public double NoteAlpha { get; set; } = 1;
    private const double Side = 16, Gap = 12, BlockHeight = 38, HitOffset = 72;
    private static SolidColorBrush Brush(string color) { var b = (SolidColorBrush)new BrushConverter().ConvertFromString(color)!; b.Freeze(); return b; }
    private static readonly Brush[] LaneBrushes = [Brush("#A7F3CE"), Brush("#F4C59D")];
    private static readonly Brush Ink = Brush("#122A1E"), LaneFill = Brush("#14261E"), LaneEdge = Brush("#2C4234"), Muted = Brush("#91AB9C");
    private static readonly Typeface KeyFace = new(new FontFamily("Consolas"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal);
    private static readonly Typeface LabelFace = new(new FontFamily("Malgun Gothic"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal);
    private static readonly Dictionary<RhythmJudgement, Brush> JudgementBrushes = new()
    {
        [RhythmJudgement.Perfect] = Brush("#A7F3CE"), [RhythmJudgement.Great] = Brush("#9FD3F3"),
        [RhythmJudgement.Good] = Brush("#E8E3A1"), [RhythmJudgement.Miss] = Brush("#F4B69D"),
    };
    private double LaneWidth => Math.Max(40, (ActualWidth - Side * 2 - Gap) / 2);
    private double LaneLeft(int lane) => Side + lane * (LaneWidth + Gap);
    private double HitY => Math.Max(BlockHeight * 2, ActualHeight - HitOffset);
    protected override void OnRender(DrawingContext dc)
    {
        base.OnRender(dc);
        var dpi = VisualTreeHelper.GetDpi(this).PixelsPerDip;
        if (!TransparentMode)
        {
            dc.PushOpacity(BackgroundStrength);
            dc.DrawRectangle(Brush("#101B17"), null, new Rect(RenderSize));
            dc.Pop();
        }
        // Lanes and the hit line stay faintly visible even in transparent mode; timing is unplayable without them.
        var laneOpacity = TransparentMode ? .35 : BackgroundStrength;
        var hitPen = new Pen(Brush("#A7F3CE"), 2);
        for (int lane = 0; lane < 2; lane++)
        {
            var x = LaneLeft(lane);
            dc.PushOpacity(laneOpacity);
            dc.DrawRoundedRectangle(TransparentMode ? null : LaneFill, new Pen(LaneEdge, 1), new Rect(x, 8, LaneWidth, ActualHeight - 16), 10, 10);
            dc.Pop();
            var pressed = Engine.LastPressLane == lane && Engine.Seconds - Engine.LastPressTime < .12;
            dc.PushOpacity(pressed ? .45 : .14);
            dc.DrawRoundedRectangle(LaneBrushes[lane], null, new Rect(x + 4, HitY - BlockHeight / 2, LaneWidth - 8, BlockHeight), 8, 8);
            dc.Pop();
            dc.PushOpacity(.85);
            dc.DrawLine(hitPen, new Point(x + 4, HitY), new Point(x + LaneWidth - 4, HitY));
            dc.Pop();
            DrawText(dc, lane == 0 ? "왼손" : "오른손", LabelFace, 10, Muted, x + LaneWidth / 2, HitY + BlockHeight / 2 + 14, dpi, .8);
        }
        dc.PushOpacity(NoteAlpha);
        var blockWidth = Math.Min(LaneWidth - 20, 140);
        foreach (var note in Engine.Notes)
        {
            var progress = 1 - (note.Time - Engine.Seconds) / note.Travel;
            var y = -BlockHeight + progress * (HitY + BlockHeight);
            var x = LaneLeft(note.Lane) + (LaneWidth - blockWidth) / 2;
            dc.DrawRoundedRectangle(LaneBrushes[note.Lane], null, new Rect(x, y - BlockHeight / 2, blockWidth, BlockHeight), 9, 9);
            DrawText(dc, note.Key.ToString(), KeyFace, 20, Ink, x + blockWidth / 2, y, dpi);
        }
        dc.Pop();
        var sinceJudgement = Engine.Seconds - Engine.LastJudgementTime;
        if (Engine.LastJudgement is RhythmJudgement judgement && sinceJudgement < .45)
            DrawText(dc, judgement.ToString().ToUpperInvariant(), KeyFace, 18, JudgementBrushes[judgement],
                LaneLeft(Engine.LastJudgementLane) + LaneWidth / 2, HitY - 64 - sinceJudgement * 30, dpi, 1 - sinceJudgement / .45);
        DrawText(dc, $"SPEED ×{Engine.SpeedMultiplier:0.0}", KeyFace, 11, Muted, ActualWidth / 2, 22, dpi, .7);
        if (Engine.Combo >= 2) DrawText(dc, $"{Engine.Combo} COMBO", KeyFace, 22, Brushes.White, ActualWidth / 2, ActualHeight * .3, dpi, .75);
        var lifeWidth = ActualWidth - Side * 2;
        dc.DrawRectangle(LaneEdge, null, new Rect(Side, ActualHeight - 6, lifeWidth, 3));
        dc.DrawRectangle(Engine.Life > 30 ? LaneBrushes[0] : JudgementBrushes[RhythmJudgement.Miss], null, new Rect(Side, ActualHeight - 6, lifeWidth * Engine.Life / 100, 3));
    }
    private static void DrawText(DrawingContext dc, string text, Typeface face, double size, Brush brush, double centerX, double centerY, double dpi, double opacity = 1)
    {
        var formatted = new FormattedText(text, CultureInfo.CurrentUICulture, FlowDirection.LeftToRight, face, size, brush, dpi);
        dc.PushOpacity(opacity);
        dc.DrawText(formatted, new Point(centerX - formatted.Width / 2, centerY - formatted.Height / 2));
        dc.Pop();
    }
}
