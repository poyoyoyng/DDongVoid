namespace DDongVoid.Core;

public sealed class Hazard
{
    public double X { get; set; }
    public double Y { get; set; }
    public double Radius { get; init; }
    public double Speed { get; init; }
    public double Wobble { get; init; }
}

public sealed class GameEngine
{
    private readonly Random random;
    private double spawnIn;
    public List<Hazard> Hazards { get; } = [];
    public double Width { get; private set; } = 900;
    public double Height { get; private set; } = 450;
    public double PlayerX { get; private set; } = 450;
    public double PlayerY => Height - 39;
    public double Seconds { get; private set; }
    public int Dodged { get; private set; }
    public int Level => 1 + (int)(Seconds / 12);
    public double FallSpeedMultiplier => 1 + Math.Min(Seconds / 60, 3);
    public double SpawnInterval => Math.Max(.12, .7 / (1 + Seconds / 30));
    public int Score => (int)(Seconds * 10) + Dodged * 25;
    public bool IsOver { get; private set; }
    public GameEngine(int? seed = null) => random = seed.HasValue ? new Random(seed.Value) : new Random();
    public void Resize(double width, double height)
    {
        width = Math.Max(200, width); height = Math.Max(150, height);
        PlayerX = Math.Clamp(PlayerX / Width * width, 22, width - 22);
        foreach (var h in Hazards) { h.X *= width / Width; h.Y *= height / Height; }
        Width = width; Height = height;
    }
    public void Reset()
    {
        Hazards.Clear(); Seconds = 0; Dodged = 0; IsOver = false; spawnIn = .55; PlayerX = Width / 2;
    }
    public void Update(double seconds, int direction)
    {
        if (IsOver || seconds <= 0) return;
        // Small steps avoid tunnelling through the player after a delayed frame.
        var remaining = Math.Min(seconds, .1);
        while (remaining > 0 && !IsOver)
        {
            var dt = Math.Min(remaining, 1.0 / 120); remaining -= dt;
            Seconds += dt;
            PlayerX = Math.Clamp(PlayerX + Math.Clamp(direction, -1, 1) * 390 * dt, 22, Width - 22);
            spawnIn -= dt;
            if (spawnIn <= 0)
            {
                var r = random.Next(13, 22);
                Hazards.Add(new Hazard { X = r + random.NextDouble() * (Width - 2 * r), Y = -30, Radius = r,
                    Speed = 160 + random.NextDouble() * 60, Wobble = random.NextDouble() * 6 });
                spawnIn += SpawnInterval * (.8 + random.NextDouble() * .4);
            }
            for (int i = Hazards.Count - 1; i >= 0; i--)
            {
                var h = Hazards[i]; h.Y += h.Speed * FallSpeedMultiplier * dt;
                var dx = h.X - PlayerX; var dy = h.Y - PlayerY;
                if (dx * dx + dy * dy < Math.Pow(h.Radius * .8 + 15, 2)) { IsOver = true; break; }
                if (h.Y - h.Radius > Height) { Hazards.RemoveAt(i); Dodged++; }
            }
        }
    }
}
