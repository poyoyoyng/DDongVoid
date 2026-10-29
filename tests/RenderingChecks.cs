using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using DDongVoid;
using DDongVoid.Core;

internal static class RenderingChecks
{
    [STAThread]
    private static void Main()
    {
        var surface = new GameSurface { TransparentMode = true, Demo = false, PlayerAlpha = .25, HazardAlpha = .5 };
        surface.Measure(new Size(600, 400)); surface.Arrange(new Rect(0, 0, 600, 400));
        surface.Engine.Resize(600, 400);
        surface.Engine.Reset();
        surface.Engine.Hazards.Add(new Hazard { X = 120, Y = 80, Radius = 20, Speed = 100 });
        byte[] Render()
        {
            var scene = new DrawingVisual();
            using (var dc = scene.RenderOpen()) surface.DrawScene(dc);
            var bmp = new RenderTargetBitmap(600, 400, 96, 96, PixelFormats.Pbgra32); bmp.Render(scene);
            var bytes = new byte[600 * 400 * 4]; bmp.CopyPixels(bytes, 600 * 4, 0); return bytes;
        }
        byte Alpha(byte[] pixels, int x, int y) => pixels[(y * 600 + x) * 4 + 3];
        void Assert(bool condition, string text) { if (!condition) throw new Exception(text); Console.WriteLine("통과: " + text); }
        var transparent = Render();
        Assert(Alpha(transparent, 300, 100) == 0 && Alpha(transparent, 10, 10) == 0, "투명 모드 배경 알파가 정확히 0");
        Assert(Math.Abs(Alpha(transparent, 300, 348) - 64) <= 1, "캐릭터 알파 25% 독립 적용");
        Assert(Math.Abs(Alpha(transparent, 120, 87) - 128) <= 1, $"똥 알파 50% 독립 적용 (측정값 {Alpha(transparent, 120, 87)})");
        surface.PlayerAlpha = surface.HazardAlpha = 0;
        var hidden = Render();
        Assert(Enumerable.Range(0, 600 * 400).All(i => hidden[i * 4 + 3] == 0), "오브젝트 알파 0일 때 전체 영역 투명");
        surface.TransparentMode = false; surface.BackgroundStrength = .3;
        var tinted = Render();
        Assert(Math.Abs(Alpha(tinted, 300, 100) - 77) <= 1, "일반 모드 배경 불투명도 독립 적용");
        Console.WriteLine("총 5개 렌더링 검증 통과");
    }
}
