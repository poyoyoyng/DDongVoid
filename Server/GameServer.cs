using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using DDongVoid.Core;

namespace DDongVoid.Server;

public sealed class OnlineAuthException() : Exception("로그인이 만료되었습니다. 다시 로그인해 주세요.");

// Runs every game action against the JSON files in one data folder. Only this process touches
// the files, so players anywhere see one consistent state and never read each other's hands.
public sealed class GameServer
{
    private static readonly TimeSpan SessionCache = TimeSpan.FromMinutes(1);
    private readonly LocalStore accounts;
    private readonly RhythmStore rhythm;
    private readonly SlapStore slap;
    private readonly CiaoStore ciao;
    private readonly OneCardStore oneCard;
    private readonly ConcurrentDictionary<string, (string Id, DateTimeOffset Until)> sessions = new();
    public string DataFolder { get; }
    public static string Version => (Assembly.GetExecutingAssembly().GetName().Version ?? new Version(1, 0, 0)).ToString(3);

    public GameServer(string dataFolder)
    {
        DataFolder = Path.GetFullPath(dataFolder);
        Directory.CreateDirectory(DataFolder);
        accounts = new(DataFolder); rhythm = new(DataFolder); slap = new(DataFolder); ciao = new(DataFolder); oneCard = new(DataFolder);
    }

    public static WebApplication Build(string dataFolder, params string[] urls)
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.SetMinimumLevel(LogLevel.Warning);
        builder.WebHost.UseUrls(urls);
        var app = builder.Build();
        var server = new GameServer(dataFolder);
        app.MapGet("/api/health", () => Results.Json(new OnlineHealth(OnlineProtocol.Name, OnlineProtocol.Version, Version), OnlineProtocol.Json));
        app.MapPost("/api/{method}", (string method, HttpContext http) => server.HandleAsync(method, http));
        return app;
    }

    public async Task<IResult> HandleAsync(string method, HttpContext http)
    {
        http.Response.Headers[OnlineProtocol.TimeHeader] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        try
        {
            using var body = http.Request.ContentLength is > 0 || http.Request.Headers.TransferEncoding.Count > 0
                ? await JsonDocument.ParseAsync(http.Request.Body, cancellationToken: http.RequestAborted)
                : JsonDocument.Parse("{}");
            var result = await DispatchAsync(method, body.RootElement, http);
            return Results.Json(result, OnlineProtocol.Json);
        }
        catch (OnlineAuthException ex) { return Error(StatusCodes.Status401Unauthorized, ex.Message); }
        catch (ArgumentException ex) { return Error(StatusCodes.Status400BadRequest, ex.Message); }
        catch (JsonException) { return Error(StatusCodes.Status400BadRequest, "요청 형식이 올바르지 않습니다. 게임과 서버의 버전을 확인해 주세요."); }
        catch (Exception ex) when (ex is IOException or InvalidDataException or UnauthorizedAccessException)
        {
            return Error(StatusCodes.Status503ServiceUnavailable, "서버에서 데이터를 저장하거나 읽지 못했습니다. " + ex.Message);
        }
    }
    private static IResult Error(int status, string message) => Results.Json(new OnlineError(message), OnlineProtocol.Json, statusCode: status);

    private async Task<object?> DispatchAsync(string method, JsonElement body, HttpContext http)
    {
        T Arg<T>() => body.Deserialize<T>(OnlineProtocol.Json) ?? throw new JsonException();
        string? me = null;
        string Me() => me ??= Authenticate(http);
        var aborted = http.RequestAborted;
        return method switch
        {
            "account.register" => SignIn(accounts.Register(Arg<OnlineLogin>().Id, Arg<OnlineLogin>().Password)),
            "account.login" => SignIn(accounts.Login(Arg<OnlineLogin>().Id, Arg<OnlineLogin>().Password)),
            "account.resume" => Resume(Arg<OnlineResume>()),
            "account.records" => accounts.Records(Me()),
            "account.best" => accounts.BestScore(Me()),
            "account.addRecord" => Done(() => accounts.AddRecord(Arg<PlayRecord>() with { UserId = Me() })),
            "account.rankings" => accounts.Rankings(),
            "rhythm.addRecord" => Done(() => rhythm.AddRecord(Arg<PlayRecord>() with { UserId = Me() })),
            "rhythm.rankings" => rhythm.Rankings(),

            "slap.rooms" => (await slap.RoomsAsync(aborted)).Select(r => HideChoice(r, Me())).ToList(),
            "slap.rankings" => slap.Rankings(),
            "slap.create" => HideChoice(slap.Create(Me(), Arg<OnlineTitle>().Title), Me()),
            "slap.join" => HideChoice(slap.Join(Arg<OnlineRoom>().Room, Me()), Me()),
            "slap.ready" => HideChoice(slap.SetReady(Arg<OnlineReady>().Room, Me(), Arg<OnlineReady>().Ready), Me()),
            "slap.submit" => HideChoice(slap.Submit(Arg<OnlineSlapSubmit>().Room, Me(), Arg<OnlineSlapSubmit>().Action), Me()),
            "slap.giveUp" => HideChoice(slap.SetGiveUp(Arg<OnlineGiveUp>().Room, Me(), Arg<OnlineGiveUp>().GiveUp), Me()),
            "slap.leave" => Done(() => slap.Leave(Arg<OnlineRoom>().Room, Me())),

            "ciao.snapshot" => await ciao.SnapshotAsync(Me(), aborted),
            "ciao.create" => ciao.Create(Me(), Arg<OnlineTitle>().Title),
            "ciao.join" => ciao.Join(Arg<OnlineRoom>().Room, Me()),
            "ciao.ready" => ciao.SetReady(Arg<OnlineReady>().Room, Me(), Arg<OnlineReady>().Ready),
            "ciao.roll" => ciao.Roll(Arg<OnlineRevision>().Room, Me(), Arg<OnlineRevision>().Revision),
            "ciao.declare" => ciao.Declare(Arg<OnlineDeclare>().Room, Me(), Arg<OnlineDeclare>().Revision, Arg<OnlineDeclare>().Number),
            "ciao.respond" => ciao.Respond(Arg<OnlineRespond>().Room, Me(), Arg<OnlineRespond>().Revision, Arg<OnlineRespond>().Doubt),
            "ciao.delete" => Done(() => ciao.DeleteRoom(Arg<OnlineRoom>().Room, Me())),
            "ciao.leave" => Done(() => ciao.Leave(Arg<OnlineRoom>().Room, Me())),

            "onecard.snapshot" => await oneCard.SnapshotAsync(Me(), aborted),
            "onecard.create" => oneCard.Create(Me(), Arg<OnlineTitle>().Title),
            "onecard.join" => oneCard.Join(Arg<OnlineRoom>().Room, Me()),
            "onecard.ready" => oneCard.SetReady(Arg<OnlineReady>().Room, Me(), Arg<OnlineReady>().Ready),
            "onecard.play" => oneCard.Play(Arg<OnlinePlay>().Room, Me(), Arg<OnlinePlay>().Revision, Arg<OnlinePlay>().Card, Arg<OnlinePlay>().Suit),
            "onecard.draw" => oneCard.Draw(Arg<OnlineRevision>().Room, Me(), Arg<OnlineRevision>().Revision),
            "onecard.call" => oneCard.Call(Arg<OnlineCall>().Room, Me(), Arg<OnlineCall>().Revision, Arg<OnlineCall>().Target),
            "onecard.delete" => Done(() => oneCard.DeleteRoom(Arg<OnlineRoom>().Room, Me())),
            "onecard.leave" => Done(() => oneCard.Leave(Arg<OnlineRoom>().Room, Me())),
            _ => throw new ArgumentException("서버가 모르는 요청입니다. 게임과 서버의 버전을 확인해 주세요."),
        };
    }
    private static bool Done(Action action) { action(); return true; }

    private OnlineCredentials SignIn(string id)
    {
        var key = accounts.SessionKey(id);
        sessions[key] = (id, DateTimeOffset.UtcNow + SessionCache);
        return new(id, key);
    }
    private OnlineCredentials Resume(OnlineResume request) => SignIn(accounts.ResumeSession(request.Id, request.Key));
    // The key is the account's session digest, so a cached entry is only a shortcut around re-reading the accounts file.
    private string Authenticate(HttpContext http)
    {
        var id = Uri.UnescapeDataString(http.Request.Headers[OnlineProtocol.UserHeader].ToString());
        var key = http.Request.Headers[OnlineProtocol.KeyHeader].ToString();
        if (id.Length == 0 || key.Length == 0) throw new OnlineAuthException();
        if (sessions.TryGetValue(key, out var cached) && cached.Id == id && cached.Until > DateTimeOffset.UtcNow) return cached.Id;
        try { return SignIn(accounts.ResumeSession(id, key)).Id; }
        catch (ArgumentException) { throw new OnlineAuthException(); }
    }

    // A submitted move stays visible as "submitted" without revealing which move the opponent chose.
    private static SlapRoom HideChoice(SlapRoom room, string viewer)
    {
        var copy = JsonSerializer.Deserialize<SlapRoom>(JsonSerializer.Serialize(room, OnlineProtocol.Json), OnlineProtocol.Json)!;
        foreach (var player in copy.Players)
            if (player.Id != viewer && player.Choice is not null) player.Choice = new SlapAction(SlapMove.Charge);
        return copy;
    }
}
