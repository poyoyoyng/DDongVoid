using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using DDongVoid.Core;

namespace DDongVoid;

public sealed class GameSurface : FrameworkElement
{
    public GameEngine Engine { get; } = new();
    public bool TransparentMode { get; set; }
    public double BackgroundStrength { get; set; } = 1;
    public double PlayerAlpha { get; set; } = 1;
    public double HazardAlpha { get; set; } = 1;
    public bool Demo { get; set; } = true;
    private static SolidColorBrush Brush(string color) { var b = (SolidColorBrush)new BrushConverter().ConvertFromString(color)!; b.Freeze(); return b; }
    private static readonly Brush Mint = Brush("#A7F3CE"), Ink = Brush("#122A1E"), Brown = Brush("#AD7756"), LightBrown = Brush("#C6926D");
    // Compose each sprite once so its overlapping shapes share one uniform alpha.
    private static readonly BitmapSource PlayerSprite = CreateSprite(dc => PaintPlayer(dc, 32, 32));
    private static readonly BitmapSource HazardSprite = CreateSprite(dc => PaintPoop(dc, 32, 32, 20));
    private static BitmapSource CreateSprite(Action<DrawingContext> paint)
    {
        var visual = new DrawingVisual(); using (var dc = visual.RenderOpen()) paint(dc);
        // 96 DPI keeps sprite coordinates in logical pixels on every display scale.
        var bitmap = new RenderTargetBitmap(64, 64, 96, 96, PixelFormats.Pbgra32);
        bitmap.Render(visual); bitmap.Freeze(); return bitmap;
    }
    protected override void OnRenderSizeChanged(SizeChangedInfo info) { base.OnRenderSizeChanged(info); Engine.Resize(ActualWidth, ActualHeight); InvalidateVisual(); }
    protected override void OnRender(DrawingContext dc)
    {
        base.OnRender(dc);
        DrawScene(dc);
    }
    internal void DrawScene(DrawingContext dc)
    {
        if (!TransparentMode)
        {
            dc.PushOpacity(BackgroundStrength);
            dc.DrawRectangle(Brush("#101B17"), null, new Rect(RenderSize));
            var pen = new Pen(Brush("#1B2B22"), .6);
            for (double x = 24; x < ActualWidth; x += 36)
                for (double y = 24; y < ActualHeight; y += 36) dc.DrawEllipse(Brush("#2C4234"), null, new Point(x, y), .8, .8);
            dc.DrawLine(pen, new Point(24, Engine.PlayerY + 25), new Point(ActualWidth - 24, Engine.PlayerY + 25));
            dc.Pop();
        }
        dc.PushOpacity(HazardAlpha);
        if (Demo)
        {
            DrawPoop(dc, ActualWidth * .17, ActualHeight * .26, 19, -.15);
            DrawPoop(dc, ActualWidth * .82, ActualHeight * .42, 24, .15);
            DrawPoop(dc, ActualWidth * .64, ActualHeight * .12, 14, -.25);
        }
        foreach (var h in Engine.Hazards) DrawPoop(dc, h.X, h.Y, h.Radius, Math.Sin(Engine.Seconds * 3 + h.Wobble) * .12);
        dc.Pop();
        dc.PushOpacity(PlayerAlpha);
        DrawPlayer(dc, Engine.PlayerX, Engine.PlayerY);
        dc.Pop();
    }
    private static void DrawPlayer(DrawingContext dc, double x, double y)
        => dc.DrawImage(PlayerSprite, new Rect(x - 32, y - 32, 64, 64));
    private static void DrawPoop(DrawingContext dc, double x, double y, double r, double angle)
    {
        dc.PushTransform(new RotateTransform(angle * 180 / Math.PI, x, y));
        dc.DrawImage(HazardSprite, new Rect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2));
        dc.Pop();
    }
    private static void PaintPlayer(DrawingContext dc, double x, double y)
    {
        dc.DrawEllipse(Brush("#303F6A4C"), null, new Point(x, y + 23), 24, 5);
        dc.DrawRoundedRectangle(Mint, null, new Rect(x - 17, y - 20, 34, 40), 14, 14);
        dc.DrawRoundedRectangle(Mint, null, new Rect(x - 14, y + 12, 9, 12), 4, 4);
        dc.DrawRoundedRectangle(Mint, null, new Rect(x + 5, y + 12, 9, 12), 4, 4);
        dc.DrawEllipse(Ink, null, new Point(x - 6, y - 4), 2.4, 3.2);
        dc.DrawEllipse(Ink, null, new Point(x + 6, y - 4), 2.4, 3.2);
        dc.DrawLine(new Pen(Ink, 1.6), new Point(x - 3, y + 5), new Point(x + 3, y + 5));
        dc.DrawEllipse(Brush("#58AD83"), null, new Point(x - 11, y + 2), 3, 1.6);
        dc.DrawEllipse(Brush("#58AD83"), null, new Point(x + 11, y + 2), 3, 1.6);
    }
    private static void PaintPoop(DrawingContext dc, double x, double y, double r)
    {
        dc.DrawEllipse(Brown, null, new Point(x, y + r * .35), r, r * .5);
        dc.DrawEllipse(LightBrown, null, new Point(x, y - r * .1), r * .73, r * .5);
        dc.DrawEllipse(Brown, null, new Point(x + r * .07, y - r * .52), r * .44, r * .4);
        var tip = new StreamGeometry();
        using (var c = tip.Open()) { c.BeginFigure(new Point(x - r * .25, y - r * .55), true, true); c.QuadraticBezierTo(new Point(x + r * .5, y - r * 1.5), new Point(x + r * .39, y - r * .5), true, false); }
        dc.DrawGeometry(Brown, null, tip);
        dc.DrawEllipse(Ink, null, new Point(x - r * .3, y + r * .23), r * .09, r * .12);
        dc.DrawEllipse(Ink, null, new Point(x + r * .3, y + r * .23), r * .09, r * .12);
    }
}
