using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using DDongVoid.Core;

namespace DDongVoid;

// Animations of the yut room, timed like the web version: the sticks tumble, then show the result;
// a flicked piece flies and knocks its target away; moved pieces hop along the board one point at a time.
// Every screen sees them, because each one is started by a new state arriving, not by the click that made it.
public partial class MainWindow
{
    private const double YutRollMs = 760, YutRevealMs = 1150, YutBackdoRevealMs = 1000, YutAfterFlightMs = 480, YutStepMs = 120, YutMaxHopMs = 900, YutFadeMs = 350;
    private static readonly (double X, double Y) YutHomePoint = (604, 610), YutFinishPoint = (612, 612);
    private sealed record YutHop(int Owner, string Label, List<(double X, double Y)> Points, bool FadeOut, string? HideNode)
    {
        public double StepMs => Math.Min(YutStepMs, YutMaxHopMs / Math.Max(1, Points.Count - 1));
        public double TravelMs => StepMs * (Points.Count - 1);
    }
    private sealed record YutFade(int Owner, string Label, (double X, double Y) At, double Delay);
    private sealed record YutMotion(List<YutHop> Hops, List<YutFade> Fades, double Start, double Duration);

    private readonly DispatcherTimer yutFrameTimer = new(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(16) };
    private readonly Stopwatch yutClock = Stopwatch.StartNew();
    private bool yutFrameHooked;
    // Animations belong to one match of one room; entering it shows the current state without replaying the past.
    private (Guid Room, int Match)? yutAnimationScope;
    private JeungYutState? yutPreviousGame;
    private int? yutSeenRoll, yutSeenFlick;
    private (JeungYutRoll Roll, string Owner, double Start)? yutThrow;
    private (JeungYutFlick Shot, double Start)? yutFlight;
    private YutMotion? yutMotion;
    private string? yutDrawnAnimation;
    // Per-frame updates of the moving elements on the board drawn last.
    private readonly List<Action<double>> yutFrames = [];
    private double YutNow => yutClock.Elapsed.TotalMilliseconds;
    // Throws and flicks hold the controls until they land; hops do not.
    private bool YutAnimating => yutThrow is not null || yutFlight is not null;
    private bool YutThrowRevealed => yutThrow is { } t && YutNow - t.Start >= YutRollMs;
    private string YutAnimationKey() =>
        $"{(yutThrow is { } t ? (YutThrowRevealed ? "R" : "T") + t.Roll.Id : "")}|{yutFlight?.Shot.Id}|{yutMotion?.Start}";
    private static double YutFlightMs(JeungYutFlick shot) =>
        Math.Clamp(Math.Sqrt(Math.Pow(shot.ToX - shot.FromX, 2) + Math.Pow(shot.ToY - shot.FromY, 2)) / .9, 250, 600);

    private void StopYutAnimations()
    {
        yutThrow = null; yutFlight = null; yutMotion = null; yutFrames.Clear(); yutFrameTimer.Stop();
    }
    private void DetectYutAnimations(JeungYutRoom room)
    {
        if (room.Game is not { } game) { StopYutAnimations(); yutAnimationScope = null; return; }
        if (yutAnimationScope != (room.Id, room.Match))
        {
            StopYutAnimations();
            yutAnimationScope = (room.Id, room.Match); yutPreviousGame = game;
            yutSeenRoll = game.LastRoll?.Id; yutSeenFlick = game.Flick?.Id;
            return;
        }
        var now = YutNow;
        var newShot = game.Flick is { } f && f.Id != yutSeenFlick;
        if (yutPreviousGame is { } before && game.Revision > before.Revision)
        {
            // A flick's own flight shows what happened to the pieces it touched.
            if (!newShot && YutMotionBetween(before, game, now) is { } motion) yutMotion = motion;
            yutPreviousGame = game;
        }
        if (game.LastRoll is { } roll && roll.Id != yutSeenRoll)
        {
            yutSeenRoll = roll.Id; yutThrow = (roll, room.Players[roll.Owner].Id, now);
        }
        if (newShot) { yutSeenFlick = game.Flick!.Id; yutFlight = (game.Flick!, now); }
        if (yutThrow is null && yutFlight is null && yutMotion is null) return;
        if (!yutFrameHooked) { yutFrameTimer.Tick += (_, _) => YutFrame(); yutFrameHooked = true; }
        yutFrameTimer.Start();
    }
    private void YutFrame()
    {
        var now = YutNow;
        if (yutThrow is { } t && now - t.Start >= YutRollMs + (t.Roll.Value == -1 ? YutBackdoRevealMs : YutRevealMs)) yutThrow = null;
        if (yutFlight is { } f && now - f.Start >= YutFlightMs(f.Shot) + YutAfterFlightMs) yutFlight = null;
        if (yutMotion is { } m && now - m.Start >= m.Duration) yutMotion = null;
        if (panel != "jeungyut-room") { StopYutAnimations(); return; }
        foreach (var frame in yutFrames.ToArray()) frame(now);
        // Redraw only when a stage starts or ends; in between the frames move the existing elements.
        if (YutAnimationKey() != yutDrawnAnimation) DrawYutRoom();
        if (yutThrow is null && yutFlight is null && yutMotion is null) yutFrameTimer.Stop();
    }

    // Which stacks moved between two states of the same match, and along which points of the board.
    private static YutMotion? YutMotionBetween(JeungYutState before, JeungYutState after, double start)
    {
        if (before.Players.Count != after.Players.Count) return null;
        (double X, double Y) Point(string node) => node == JeungYut.Home ? YutHomePoint : node == JeungYut.Finish ? YutFinishPoint : JeungYut.Nodes[node];
        var mover = before.Active;
        var hops = new Dictionary<(int Owner, string Route), List<JeungYutToken>>();
        var caught = new Dictionary<(int Owner, string Node), List<JeungYutToken>>();
        var routes = new Dictionary<(int, string), (List<string> Nodes, bool FadeOut)>();
        for (var owner = 0; owner < after.Players.Count; owner++)
            foreach (var t in after.Players[owner].Tokens)
            {
                var old = before.Players[owner].Tokens.FirstOrDefault(x => x.Id == t.Id);
                if (old is null || (old.Done == t.Done && old.Path.SequenceEqual(t.Path))) continue;
                var from = JeungYut.Position(old);
                List<string> nodes; var fadeOut = false;
                if (!old.Done && t.Path.Count >= old.Path.Count && t.Path.Take(old.Path.Count).SequenceEqual(old.Path) && (t.Done || t.Path.Count > old.Path.Count))
                {
                    nodes = [from, .. t.Path.Skip(old.Path.Count)];
                    if (t.Done) { nodes.Add(JeungYut.Finish); fadeOut = true; }
                }
                else if (owner == mover && !old.Done && !t.Done && t.Path.Count == old.Path.Count - 1 && old.Path.Take(t.Path.Count).SequenceEqual(t.Path))
                {
                    nodes = [from, JeungYut.Position(t)]; fadeOut = t.Path.Count == 0;
                }
                else
                {
                    if (owner != mover && JeungYut.OnBoard(from) && JeungYut.Position(t) == JeungYut.Home)
                    {
                        if (!caught.TryGetValue((owner, from), out var victims)) caught[(owner, from)] = victims = [];
                        victims.Add(t);
                    }
                    continue;
                }
                var key = (owner, string.Join(">", nodes));
                if (!hops.TryGetValue(key, out var group)) { hops[key] = group = []; routes[key] = (nodes, fadeOut); }
                group.Add(t);
            }
        if (hops.Count == 0 && caught.Count == 0) return null;
        static string Label(List<JeungYutToken> tokens) => tokens.Count > 1 ? $"×{tokens.Count}" : (tokens[0].Id + 1).ToString();
        var hopList = hops.Select(h =>
        {
            var (nodes, fadeOut) = routes[h.Key];
            var end = nodes[^1];
            return new YutHop(h.Key.Owner, Label(h.Value), [.. nodes.Select(Point)], fadeOut, JeungYut.OnBoard(end) ? end : null);
        }).ToList();
        var arrival = hopList.Select(h => h.TravelMs).DefaultIfEmpty(0).Max();
        var fades = caught.Select(c => new YutFade(c.Key.Owner, Label(c.Value), JeungYut.Nodes[c.Key.Node], arrival)).ToList();
        var duration = Math.Max(hopList.Select(h => h.TravelMs + (h.FadeOut ? YutFadeMs : 0)).DefaultIfEmpty(0).Max(),
            fades.Select(f => f.Delay + YutFadeMs).DefaultIfEmpty(0).Max()) + 40;
        return new(hopList, fades, start, duration);
    }

    private bool YutHiddenStack(int owner, string node) =>
        (yutMotion is { } m && m.Hops.Any(h => h.Owner == owner && h.HideNode == node)) ||
        (yutFlight is { } f && f.Shot.Owner == owner && f.Shot.SourceNode == node && f.Shot.Outcome != "miss");
    private static Grid YutDisc(int owner, string label)
    {
        var disc = new Grid { Width = 72, Height = 72, IsHitTestVisible = false, RenderTransformOrigin = new Point(.5, .5) };
        disc.Children.Add(new Ellipse { Width = 52, Height = 52, Fill = Theme.Paint(YutPieceFill[owner]), Stroke = Brushes.White, StrokeThickness = 4 });
        disc.Children.Add(new TextBlock { Text = label, FontSize = 26, FontWeight = FontWeights.Bold, Foreground = Brushes.White,
            HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });
        return disc;
    }
    private static void MoveYutDisc(FrameworkElement disc, double x, double y, double opacity = 1)
    {
        Canvas.SetLeft(disc, x - disc.Width / 2); Canvas.SetTop(disc, y - disc.Height / 2); disc.Opacity = Math.Clamp(opacity, 0, 1);
    }
    // Adds the hopping, flying and fading pieces to the board and registers how each one moves per frame.
    private void AddYutBoardAnimations(Canvas canvas)
    {
        void Animate(FrameworkElement element, Action<double> frame) { canvas.Children.Add(element); yutFrames.Add(frame); frame(YutNow); }
        if (yutMotion is { } motion)
        {
            foreach (var fade in motion.Fades)
            {
                var disc = YutDisc(fade.Owner, fade.Label); var scale = new ScaleTransform(); disc.RenderTransform = scale;
                Animate(disc, now =>
                {
                    var gone = Math.Clamp((now - motion.Start - fade.Delay) / YutFadeMs, 0, 1);
                    scale.ScaleX = scale.ScaleY = 1 + gone * .4;
                    MoveYutDisc(disc, fade.At.X, fade.At.Y - gone * 30, 1 - gone);
                });
            }
            foreach (var hop in motion.Hops)
            {
                var disc = YutDisc(hop.Owner, hop.Label);
                Animate(disc, now =>
                {
                    var age = now - motion.Start;
                    if (age >= hop.TravelMs)
                    {
                        var end = hop.Points[^1];
                        MoveYutDisc(disc, end.X, end.Y, hop.FadeOut ? 1 - (age - hop.TravelMs) / YutFadeMs : 1); return;
                    }
                    var step = (int)(age / hop.StepMs); var f = (age - step * hop.StepMs) / hop.StepMs;
                    var (a, b) = (hop.Points[step], hop.Points[step + 1]);
                    var ease = f * f * (3 - 2 * f);
                    MoveYutDisc(disc, a.X + (b.X - a.X) * ease, a.Y + (b.Y - a.Y) * ease - 26 * Math.Sin(Math.PI * f));
                });
            }
        }
        if (yutFlight is { } flight)
        {
            var shot = flight.Shot; var flightMs = YutFlightMs(shot);
            double dx = shot.ToX - shot.FromX, dy = shot.ToY - shot.FromY, length = Math.Sqrt(dx * dx + dy * dy);
            (dx, dy) = length > .001 ? (dx / length, dy / length) : (0, -1);
            if (shot.Outcome == "hit" && shot.Hit is { } hit && shot.Victim >= 0)
            {
                var target = JeungYut.Nodes[hit];
                var knocked = YutDisc(shot.Victim, shot.VictimTokens.Count > 1 ? $"×{shot.VictimTokens.Count}" : (shot.VictimTokens[0] + 1).ToString());
                var spin = new RotateTransform(); knocked.RenderTransform = spin;
                Animate(knocked, now =>
                {
                    var after = Math.Clamp((now - flight.Start - flightMs) / YutAfterFlightMs, 0, 1);
                    spin.Angle = 120 * after;
                    MoveYutDisc(knocked, target.X + dx * 300 * after, target.Y + dy * 300 * after + 100 * after * after, 1 - after);
                });
            }
            var disc = YutDisc(shot.Owner, shot.SourceTokens.Count > 1 ? $"×{shot.SourceTokens.Count}" : (shot.SourceTokens[0] + 1).ToString());
            Animate(disc, now =>
            {
                var age = now - flight.Start;
                double first = Math.Min(1, age / flightMs), after = Math.Clamp((age - flightMs) / YutAfterFlightMs, 0, 1), ease = 1 - (1 - first) * (1 - first);
                double x = shot.FromX + (shot.ToX - shot.FromX) * ease, y = shot.FromY + (shot.ToY - shot.FromY) * ease, opacity = 1;
                if (after > 0)
                {
                    if (shot.Outcome == "miss") { x = shot.ToX + dx * 280 * after; y = shot.ToY + dy * 280 * after + 130 * after * after; opacity = 1 - after; }
                    else { var back = after * after * (3 - 2 * after); x = shot.ToX + (shot.FromX - shot.ToX) * back; y = shot.ToY + (shot.FromY - shot.ToY) * back; }
                }
                MoveYutDisc(disc, x, y, opacity);
            });
        }
    }

    private static DoubleAnimationUsingKeyFrames YutKeys(double ms, bool forever, double delay, params (double At, double Value)[] keys)
    {
        var animation = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(ms), BeginTime = TimeSpan.FromMilliseconds(delay) };
        if (forever) animation.RepeatBehavior = RepeatBehavior.Forever;
        foreach (var (at, value) in keys)
            animation.KeyFrames.Add(new EasingDoubleKeyFrame(value, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(ms * at)), new SineEase { EasingMode = EasingMode.EaseInOut }));
        return animation;
    }
    // The web's throw stage: four sticks tumbling in the air, then landing with the result and its move.
    private void AddYutThrowStage(JeungYutRoll roll, string owner)
    {
        var revealed = YutThrowRevealed;
        // Sticks on the left and the result on the right keep the stage short enough to sit under the board.
        var stage = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
        var sticks = new StackPanel { Orientation = Orientation.Horizontal, Height = 74, Margin = new Thickness(0, 0, 14, 0) };
        var flat = roll.Value == -1 ? 1 : roll.Value == 5 ? 0 : roll.Value;
        for (var i = 0; i < 4; i++)
        {
            var face = !revealed || i < flat;
            var stick = new Border
            {
                Width = 13, Height = 50, CornerRadius = new CornerRadius(6.5), Margin = new Thickness(6, 0, 6, 0), BorderThickness = new Thickness(1.5),
                BorderBrush = Theme.Paint("#B88A3E"), Background = Theme.Paint(!revealed ? "#DCB36A" : face ? "#F7F7F2" : "#5B4220"),
                VerticalAlignment = VerticalAlignment.Center, RenderTransformOrigin = new Point(.5, .5),
            };
            if (revealed && roll.Value == -1 && i == 0)
                stick.Child = new Ellipse { Width = 7, Height = 7, Fill = Theme.Paint("#E5484D"), VerticalAlignment = VerticalAlignment.Center };
            else if (revealed && face)
                stick.Child = new TextBlock { Text = "×\n×\n×", FontSize = 8, LineHeight = 10, Foreground = Theme.Paint("#B88A3E"), TextAlignment = TextAlignment.Center,
                    HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            var scale = new ScaleTransform(); var rotate = new RotateTransform(); var move = new TranslateTransform();
            stick.RenderTransform = new TransformGroup { Children = { scale, rotate, move } };
            if (!revealed)
            {
                double start = i * 15 - 24;
                move.BeginAnimation(TranslateTransform.YProperty, YutKeys(YutRollMs, true, 0, (0, 10), (.45, -14), (.8, 5), (1, 10)));
                rotate.BeginAnimation(RotateTransform.AngleProperty, YutKeys(YutRollMs, true, 0, (0, start), (.45, i * -24 + 32), (.8, i * 18 - 25), (1, start)));
                // Turning over around the stick's long side shows as its width shrinking and growing.
                scale.BeginAnimation(ScaleTransform.ScaleXProperty, YutKeys(YutRollMs * .5, true, i * 60, (0, 1), (.5, .15), (1, 1)));
            }
            else
            {
                move.Y = -18; stick.Opacity = .5;
                move.BeginAnimation(TranslateTransform.YProperty, YutKeys(350, false, i * 40, (0, -18), (.65, 5), (1, 0)));
                stick.BeginAnimation(OpacityProperty, YutKeys(350, false, i * 40, (0, .5), (.65, 1), (1, 1)));
            }
            sticks.Children.Add(stick);
        }
        stage.Children.Add(sticks);
        var outcome = new StackPanel { VerticalAlignment = VerticalAlignment.Center, MinWidth = 130, RenderTransformOrigin = new Point(0, .5) };
        outcome.Children.Add(new TextBlock { Text = $"{owner} · {(revealed ? roll.Reroll ? "다시 던진 결과" : "던진 결과" : "윷 던지기")}", FontSize = 10.5,
            Foreground = Theme.Paint("#91AB9C"), TextTrimming = TextTrimming.CharacterEllipsis });
        outcome.Children.Add(new TextBlock { Text = revealed ? $"{JeungYut.Label(roll.Value)}!" : "윷이 구르는 중…", FontSize = revealed ? 26 : 14, FontWeight = FontWeights.Bold,
            Foreground = Theme.Paint(revealed ? "#FFE29A" : "#EDF4F0"), Margin = new Thickness(0, revealed ? 0 : 4, 0, revealed ? 0 : 4) });
        outcome.Children.Add(new TextBlock { Text = revealed ? (roll.Value < 0 ? "뒤로 1칸" : $"{roll.Value}칸 이동") + (roll.Extra > 0 ? $" · {roll.Extra}번 더 던져요!" : "") : "어떤 수가 나올까요?",
            FontSize = 11, Foreground = Theme.Paint("#C9D6CF") });
        if (revealed)
        {
            var pop = new ScaleTransform(.7, .7); outcome.RenderTransform = pop; outcome.Opacity = 0;
            var grow = YutKeys(250, false, 0, (0, .7), (1, 1));
            pop.BeginAnimation(ScaleTransform.ScaleXProperty, grow); pop.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            outcome.BeginAnimation(OpacityProperty, YutKeys(250, false, 0, (0, 0), (1, 1)));
        }
        stage.Children.Add(outcome);
        var border = new Border { Name = "YutThrowStage", Child = stage, Padding = new Thickness(10, 6, 10, 6), Margin = new Thickness(0, 0, 0, 6),
            CornerRadius = new CornerRadius(10), Background = Theme.Paint("#0F1A16") };
        // The room scrolls when the window is small: bring the throw into sight wherever the player was looking.
        border.Loaded += (_, _) => border.BringIntoView();
        DialogContent.Children.Add(border);
    }
    private void AddYutFlightResult(JeungYutFlick shot)
    {
        var (title, hint) = shot.Outcome switch
        {
            "miss" => ("앗, 빗나갔어요!", "날아간 말이 대기로 돌아갑니다."),
            "blocked" => ("상대가 막았어요!", "양쪽 말은 제자리에 남습니다."),
            _ => ("제대로 맞았다!", "상대 묶음 탈락! 한 번 더 던질 수 있어요."),
        };
        AddText(title, 17, "#FFE29A", 2, 2, true);
        AddText(hint, 11, "#C9D6CF", 0, 6);
    }
}
