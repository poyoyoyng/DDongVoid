using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using DDongVoid.Core;

namespace DDongVoid.Online;

// One connection to the game server. Holds the signed-in player for the stores built on it and
// learns how far this PC's clock is from the server's, so shared deadlines appear at the same moment.
public sealed class OnlineServer
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10), OffsetRefresh = TimeSpan.FromMinutes(1);
    private readonly HttpClient http;
    private readonly object gate = new();
    private OnlineCredentials? credentials;
    private TimeSpan clockOffset, bestRoundTrip = TimeSpan.MaxValue;
    private DateTimeOffset offsetMeasuredAt;
    public string Address { get; }

    public OnlineServer(string address, HttpMessageHandler? handler = null)
    {
        Address = Normalize(address);
        http = handler is null ? new HttpClient() : new HttpClient(handler);
        http.BaseAddress = new Uri(Address + "/");
        http.Timeout = System.Threading.Timeout.InfiniteTimeSpan;
    }

    public static string Normalize(string address)
    {
        address = address.Trim();
        if (address.Length == 0) throw new ArgumentException("서버 주소를 입력해 주세요.");
        if (!address.Contains("://", StringComparison.Ordinal)) address = "http://" + address;
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") ||
            uri.UserInfo.Length != 0 || uri.Query.Length != 0 || uri.Fragment.Length != 0)
            throw new ArgumentException("서버 주소가 올바르지 않습니다. 예: http://192.168.0.10:5080 또는 https://game.example.com");
        return uri.GetLeftPart(UriPartial.Path).TrimEnd('/');
    }

    public OnlineCredentials? Credentials { get { lock (gate) return credentials; } }
    public void SignIn(OnlineCredentials signedIn) { lock (gate) credentials = signedIn; }
    public string Expect(string userId)
    {
        var current = Credentials;
        if (current is null || current.Id != userId) throw new ArgumentException("로그인 정보가 바뀌었습니다. 다시 로그인해 주세요.");
        return current.Id;
    }
    // Converts a time stamped by the server into this PC's clock.
    public DateTimeOffset ToLocal(DateTimeOffset serverTime) { lock (gate) return serverTime + clockOffset; }

    public OnlineHealth Health()
    {
        var health = Send<OnlineHealth>(new HttpRequestMessage(HttpMethod.Get, "api/health"), CancellationToken.None);
        if (health.Name != OnlineProtocol.Name) throw new IOException("입력한 주소는 AKC미니게임 서버가 아닙니다.");
        if (health.Protocol != OnlineProtocol.Version) throw new IOException($"서버 버전({health.Version})이 게임과 맞지 않습니다. 서버와 게임을 같은 버전으로 맞춰 주세요.");
        return health;
    }
    public T Call<T>(string method, object? body = null) => Send<T>(Request(method, body), CancellationToken.None);
    public Task<T> CallAsync<T>(string method, object? body, CancellationToken cancellation) =>
        Task.Run(() => Send<T>(Request(method, body), cancellation), cancellation);

    private HttpRequestMessage Request(string method, object? body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "api/" + method) { Content = JsonContent.Create(body ?? new { }, options: OnlineProtocol.Json) };
        if (Credentials is { } signedIn)
        {
            request.Headers.Add(OnlineProtocol.UserHeader, Uri.EscapeDataString(signedIn.Id));
            request.Headers.Add(OnlineProtocol.KeyHeader, signedIn.Key);
        }
        return request;
    }
    private T Send<T>(HttpRequestMessage request, CancellationToken cancellation)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(Timeout);
        var sent = DateTimeOffset.UtcNow; var timer = Stopwatch.StartNew();
        HttpResponseMessage response;
        try { response = http.Send(request, HttpCompletionOption.ResponseContentRead, deadline.Token); }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { throw; }
        catch (OperationCanceledException ex) { throw new IOException("서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.", ex); }
        catch (HttpRequestException ex) { throw new IOException($"서버({Address})에 연결하지 못했습니다. 서버 주소와 서버 실행 상태를 확인해 주세요.", ex); }
        using (request)
        using (response)
        {
            LearnClock(response, sent, timer.Elapsed);
            string text;
            try { text = response.Content.ReadAsStringAsync(deadline.Token).GetAwaiter().GetResult(); }
            catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException && !cancellation.IsCancellationRequested)
            { throw new IOException("서버 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.", ex); }
            if (!response.IsSuccessStatusCode)
            {
                var message = TryRead<OnlineError>(text)?.Message ?? $"서버 오류가 발생했습니다. ({(int)response.StatusCode})";
                throw response.StatusCode switch
                {
                    HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized => new ArgumentException(message),
                    HttpStatusCode.NotFound => new IOException("서버가 요청을 처리하지 못했습니다. 서버 주소와 버전을 확인해 주세요."),
                    _ => new IOException(message),
                };
            }
            try { return JsonSerializer.Deserialize<T>(text, OnlineProtocol.Json)!; }
            catch (JsonException ex) { throw new InvalidDataException("서버 응답 형식이 올바르지 않습니다. 서버와 게임의 버전을 확인해 주세요.", ex); }
        }
    }
    private static T? TryRead<T>(string text) where T : class
    {
        try { return JsonSerializer.Deserialize<T>(text, OnlineProtocol.Json); } catch (JsonException) { return null; }
    }
    // Keeps the estimate from the fastest recent round trip so it stays stable between polls.
    private void LearnClock(HttpResponseMessage response, DateTimeOffset sent, TimeSpan roundTrip)
    {
        if (!response.Headers.TryGetValues(OnlineProtocol.TimeHeader, out var values) || !long.TryParse(values.FirstOrDefault(), out var serverMs)) return;
        var server = DateTimeOffset.FromUnixTimeMilliseconds(serverMs);
        lock (gate)
        {
            var now = DateTimeOffset.UtcNow;
            if (roundTrip > bestRoundTrip && now - offsetMeasuredAt < OffsetRefresh) return;
            var first = bestRoundTrip == TimeSpan.MaxValue;
            bestRoundTrip = roundTrip; offsetMeasuredAt = now;
            // Small corrections would only shift shared times between polls and redraw the room.
            var measured = sent + roundTrip / 2 - server;
            if (first || (measured - clockOffset).Duration() >= TimeSpan.FromMilliseconds(30)) clockOffset = measured;
        }
    }
}
