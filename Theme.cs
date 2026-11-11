using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Shapes;

namespace DDongVoid;

// Every screen is authored in the dark palette. The light theme maps each dark color to a light counterpart
// when the brush is created, so game code keeps one set of color literals.
public static class Theme
{
    public static bool Light { get; private set; }

    // Hand-picked counterparts for the palette; anything else falls back to an inverted lightness.
    private static readonly Dictionary<uint, uint> LightRgb = new()
    {
        // Backgrounds and borders.
        [0x101B17] = 0xF3F6F4, [0x0F1A16] = 0xEAF0EC, [0x101A16] = 0xFFFFFF, [0x18261F] = 0xFBFCFB, [0x182520] = 0xEDF2EF,
        [0x1B2B22] = 0xDCE5DF, [0x14261E] = 0xE5EDE8, [0x22302A] = 0xE2E9E5, [0x26362D] = 0xD7E0DB, [0x27332F] = 0xE2E9E5,
        [0x2B3C32] = 0xCCD8D0, [0x2C4234] = 0xC2D1C7, [0x31583F] = 0xCDEBD9, [0x3A4C42] = 0xBCCBC2, [0x3A4F2E] = 0xFBF1CF,
        [0x3B5044] = 0xB5C5BB, [0x40574A] = 0xA9BBAF, [0x4A5E53] = 0xA3B4AA, [0x253D2E] = 0xD3ECDD, [0x304B3B] = 0xCDEBD9,
        [0x173026] = 0xDDF1E6, [0x392A1F] = 0xF3E6DA, [0x36483D] = 0xC9D5CD, [0x413D2E] = 0xDCD6C3, [0x4B5E51] = 0xB5C3BA,
        // Text, from strongest to faintest.
        [0xFFFFFF] = 0x15241D, [0xEDF4F0] = 0x15241D, [0xE9F1ED] = 0x1B2B23, [0xC9D6CF] = 0x2C3F35, [0xB7C6BE] = 0x3B5146,
        [0xB6C7BC] = 0x3B5146, [0xA8BCAF] = 0x4B6356, [0x93AB9C] = 0x5B7568, [0x91AB9C] = 0x5B7568, [0x728F7D] = 0x6B8678,
        [0x6F8579] = 0x869A8F, [0x698775] = 0x7F978A, [0x658572] = 0x7F978A,
        // Accents darken so they stay readable on white; text drawn on the mint accent turns white.
        [0xA7F3CE] = 0x15885A, [0x10291E] = 0xFFFFFF, [0x122A1E] = 0xFFFFFF, [0xF4C59D] = 0xB9661F, [0xF4B69D] = 0xC0462B,
        [0x99CFFF] = 0x2672C0, [0xD5B2FF] = 0x7D45C9, [0xFFE29A] = 0x9C6A00, [0x9FD3F3] = 0x2479B3, [0xE8E3A1] = 0x8F8113,
        [0xEEE8AA] = 0x9C6A00, [0xFFD378] = 0xC08A00, [0xFFD064] = 0xE0A400,
        // Dice faces are physical objects and look the same in both themes.
        [0xFBF7EC] = 0xFBF7EC, [0xC9C2B0] = 0xC9C2B0, [0xC0392B] = 0xC0392B, [0x1E2B25] = 0x1E2B25,
    };
    // Translucent colors whose meaning changes with alpha.
    private static readonly Dictionary<uint, uint> LightArgb = new()
    {
        [0x2231583F] = 0x2215885A, [0x5531583F] = 0x5515885A, [0x4605110B] = 0x4605110B,
    };

    public static Color Map(Color color)
    {
        if (!Light || color.A <= 1) return color;
        uint argb = (uint)color.A << 24 | (uint)color.R << 16 | (uint)color.G << 8 | color.B;
        if (LightArgb.TryGetValue(argb, out var exact)) return FromArgb(exact);
        if (LightRgb.TryGetValue(argb & 0xFFFFFF, out var rgb)) return FromArgb((uint)color.A << 24 | rgb);
        return Invert(color);
    }
    public static Color Map(string color) => Map((Color)ColorConverter.ConvertFromString(color));
    public static SolidColorBrush Paint(Color color) => new(Map(color));
    public static SolidColorBrush Paint(string color) => new(Map(color));

    private static Color FromArgb(uint v) => Color.FromArgb((byte)(v >> 24), (byte)(v >> 16), (byte)(v >> 8), (byte)v);
    // Keeps hue and saturation and flips lightness, so dark fills turn pale and pale text turns dark.
    private static Color Invert(Color c)
    {
        double r = c.R / 255.0, g = c.G / 255.0, b = c.B / 255.0;
        double max = Math.Max(r, Math.Max(g, b)), min = Math.Min(r, Math.Min(g, b)), l = (max + min) / 2, d = max - min;
        double s = d == 0 ? 0 : d / (1 - Math.Abs(2 * l - 1)), h = 0;
        if (d != 0) h = max == r ? (g - b) / d % 6 : max == g ? (b - r) / d + 2 : (r - g) / d + 4;
        l = 1 - l;
        double chroma = (1 - Math.Abs(2 * l - 1)) * s, x = chroma * (1 - Math.Abs(h % 2 - 1)), m = l - chroma / 2;
        (double R, double G, double B) p = ((int)Math.Floor((h + 6) % 6)) switch
        { 0 => (chroma, x, 0), 1 => (x, chroma, 0), 2 => (0, chroma, x), 3 => (0, x, chroma), 4 => (x, 0, chroma), _ => (chroma, 0, x) };
        byte To(double v) => (byte)Math.Round(Math.Clamp(v + m, 0, 1) * 255);
        return Color.FromArgb(c.A, To(p.R), To(p.G), To(p.B));
    }

    // Colors written in XAML are remembered once and repainted on every theme change.
    private static readonly DependencyProperty[] ColorProperties =
        [.. new[] { Panel.BackgroundProperty, Border.BackgroundProperty, Control.BackgroundProperty, TextElement.ForegroundProperty,
            TextBlock.ForegroundProperty, Control.ForegroundProperty, Border.BorderBrushProperty, Control.BorderBrushProperty,
            Shape.FillProperty, Shape.StrokeProperty }.Distinct()];
    private static readonly List<(DependencyObject Target, DependencyProperty Property, Color Color)> Authored = [];
    public static void Capture(DependencyObject root)
    {
        foreach (var property in ColorProperties)
            if (root.ReadLocalValue(property) is SolidColorBrush brush) Authored.Add((root, property, brush.Color));
        foreach (var child in LogicalTreeHelper.GetChildren(root).OfType<DependencyObject>()) Capture(child);
    }
    public static void Apply(bool light)
    {
        Light = light;
        foreach (var (target, property, color) in Authored) target.SetValue(property, Paint(color));
        var resources = Application.Current.Resources;
        resources["Mint"] = Paint("#A7F3CE");
        resources["ButtonText"] = Paint("#E9F1ED");
        resources["ButtonFill"] = Paint("#27332F");
        resources["PrimaryText"] = Paint("#10291E");
        resources["InputFill"] = Paint("#101A16");
        resources["InputText"] = Paint("#EDF4F0");
        resources["InputBorder"] = Paint("#3A4C42");
    }
}
