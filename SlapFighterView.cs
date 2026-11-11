using System.Globalization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using DDongVoid.Core;

namespace DDongVoid;

public sealed class SlapFighterView : FrameworkElement
{
    private static readonly Dictionary<(int Character, SlapPose Pose), ImageSource> Sprites = [];
    private static readonly Typeface Typeface = new("Malgun Gothic");
    private static Brush Ink => Theme.Paint(Color.FromRgb(182, 199, 188));
    private static Brush Mint => Theme.Paint(Color.FromRgb(167, 243, 206));
    private static Brush Gold => Theme.Paint(Color.FromRgb(255, 211, 120));
    private static readonly DependencyProperty MotionProperty = DependencyProperty.Register(nameof(Motion), typeof(double), typeof(SlapFighterView),
        new FrameworkPropertyMetadata(1d, FrameworkPropertyMetadataOptions.AffectsRender));
    public double Motion { get => (double)GetValue(MotionProperty); set => SetValue(MotionProperty, value); }
    public required string PlayerId { get; init; }
    public required SlapFighterVisual Visual { get; init; }
    public int Character { get; init; }
    public int Hp { get; init; } = SlapRules.MaxHp;
    public int Gauge { get; init; }
    public bool FacingLeft { get; init; }
    public bool Empty { get; init; }

    public SlapFighterView()
    {
        Height = 182; ClipToBounds = true;
        Loaded += (_, _) =>
        {
            if (!Empty && Visual is { } visual && (visual.Pose != SlapPose.Idle || visual.Charging))
                BeginAnimation(MotionProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(650)) { FillBehavior = FillBehavior.Stop });
        };
        Unloaded += (_, _) => BeginAnimation(MotionProperty, null);
    }
    private static ImageSource Sprite(int character, SlapPose pose)
    {
        var key = (character, pose);
        if (Sprites.TryGetValue(key, out var image)) return image;
        string characterName = character == 0 ? "mint" : "cat";
        if (pose == SlapPose.Charge)
        {
            var charge = new BitmapImage(new Uri($"pack://application:,,,/DDongVoid;component/Assets/Slap/{characterName}-charge.png"));
            charge.Freeze(); Sprites[key] = charge; return charge;
        }
        var atlas = new BitmapImage(new Uri($"pack://application:,,,/DDongVoid;component/Assets/Slap/{characterName}-atlas.png"));
        atlas.Freeze();
        int cellWidth = atlas.PixelWidth / 3, cellHeight = atlas.PixelHeight / 2, index = (int)pose;
        var frame = new CroppedBitmap(atlas, new Int32Rect(index % 3 * cellWidth, index / 3 * cellHeight, cellWidth, cellHeight));
        frame.Freeze(); Sprites[key] = frame; return frame;
    }
    private void Text(DrawingContext dc, string text, double x, double y, Brush brush, double size = 10)
        => dc.DrawText(new FormattedText(text, CultureInfo.CurrentUICulture, FlowDirection.LeftToRight, Typeface, size, brush,
            VisualTreeHelper.GetDpi(this).PixelsPerDip), new Point(x, y));
    protected override void OnRender(DrawingContext dc)
    {
        base.OnRender(dc);
        double width = ActualWidth;
        if (width <= 0) return;
        dc.PushOpacity(Empty ? .25 : 1);
        dc.DrawRoundedRectangle(Theme.Paint(Character == 0 ? Color.FromRgb(23, 48, 38) : Color.FromRgb(57, 42, 31)), null,
            new Rect(0, 0, width, 89), 12, 12);
        Text(dc, "체력", 8, 5, Ink);
        Text(dc, $"{Hp}/{SlapRules.MaxHp}", Math.Max(47, width - 29), 5, Mint);
        double barWidth = Math.Max(5, (width - 35 - 34 - 2 * (SlapRules.MaxHp - 1)) / SlapRules.MaxHp);
        for (int i = 0; i < SlapRules.MaxHp; i++)
            dc.DrawRoundedRectangle(i < Hp ? Mint : Theme.Paint(Color.FromRgb(54, 72, 61)), null,
                new Rect(35 + i * (barWidth + 2), 10, barWidth, 6), 2, 2);
        Text(dc, "기력", 8, 23, Ink);
        for (int i = 0; i < SlapRules.MaxGauge; i++)
            dc.DrawEllipse(i < Gauge ? Gold : Theme.Paint(Color.FromRgb(65, 61, 46)), null, new Point(41 + i * 15, 31), 4, 4);
        Text(dc, $"{Gauge}/{SlapRules.MaxGauge}", Math.Max(88, width - 29), 23, Gold);

        double size = Math.Min(width + 12, 152), p = Motion, pulse = Math.Sin(p * Math.PI);
        double direction = FacingLeft ? -1 : 1;
        double offset = Visual.Pose switch
        {
            SlapPose.AttackSuccess => direction * pulse * 10,
            SlapPose.AttackFailed => -direction * pulse * 6,
            SlapPose.Hit => -direction * Math.Sin(p * Math.PI * 6) * (1 - p) * 8,
            _ => 0,
        };
        var center = new Point(width / 2 + offset, 111);
        dc.DrawEllipse(Theme.Paint(Color.FromArgb(70, 5, 17, 11)), null, new Point(width / 2, 168), width * .32, 5);
        if (Visual.Charging)
        {
            dc.DrawEllipse(Theme.Paint(Color.FromArgb((byte)(32 + 32 * pulse), 255, 208, 100)), new Pen(Gold, 1.5), center, size * .34, size * .36);
            Text(dc, "✦", width / 2 - size * .4, 91, Gold, 18);
            Text(dc, "✦", width / 2 + size * .29, 65, Gold, 13);
        }
        dc.PushTransform(new TranslateTransform(offset, Visual.Pose switch { SlapPose.Guard => -pulse * 3, SlapPose.Charge => -pulse * 4, _ => 0 }));
        if (FacingLeft) dc.PushTransform(new ScaleTransform(-1, 1, width / 2, 0));
        dc.DrawImage(Sprite(Character, Visual.Pose), new Rect((width - size) / 2, 39 + (140 - size) / 2, size, size));
        if (FacingLeft) dc.Pop();
        dc.Pop();
        if (Visual.Zone is { } zone)
        {
            for (int i = 0; i < 3; i++)
                dc.DrawRoundedRectangle(i == (int)zone ? Gold : Theme.Paint(Color.FromArgb(130, 75, 94, 81)), null,
                    new Rect(width - 15, 59 + i * 10, 8, 5), 2, 2);
        }
        if (Visual.Submitted)
        {
            dc.DrawEllipse(Mint, null, new Point(width - 13, 165), 8, 8);
            Text(dc, "✓", width - 18, 157, Theme.Paint(Color.FromRgb(18, 42, 30)), 12);
        }
        dc.Pop();
    }
}
