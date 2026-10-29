using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;

namespace DDongVoid.Core;

public sealed record AvailableUpdate(Version Version, string Tag, Uri DownloadUri, string Sha256, long Size);

public sealed class UpdateService
{
    public const string Repository = "poyoyoyng/DDongVoid";
    public const string AssetName = "DDongVoid-win-x64.zip";
    private readonly HttpClient client;
    public static Version CurrentVersion => NormalizeVersion(Assembly.GetEntryAssembly()?.GetName().Version ?? new Version(1, 0, 0));
    public UpdateService(HttpClient? client = null)
    {
        this.client = client ?? new HttpClient { Timeout = TimeSpan.FromSeconds(90) };
        this.client.DefaultRequestHeaders.UserAgent.ParseAdd("DDongVoid/" + CurrentVersion);
        this.client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        this.client.DefaultRequestHeaders.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");
    }
    public static Version NormalizeVersion(Version version) => new(version.Major, version.Minor, Math.Max(0, version.Build));
    public async Task<AvailableUpdate?> CheckAsync(CancellationToken cancellationToken = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        using var response = await client.GetAsync($"https://api.github.com/repos/{Repository}/releases/latest", HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(timeout.Token);
        if (json.Length > 1024 * 1024) throw new InvalidDataException("업데이트 정보가 너무 큽니다.");
        return ParseRelease(json, CurrentVersion);
    }
    public static AvailableUpdate? ParseRelease(string json, Version currentVersion)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (root.GetProperty("draft").GetBoolean() || root.GetProperty("prerelease").GetBoolean()) return null;
        var tag = root.GetProperty("tag_name").GetString() ?? "";
        if (!Version.TryParse(tag.TrimStart('v', 'V'), out var version) || NormalizeVersion(version) <= NormalizeVersion(currentVersion)) return null;
        var asset = root.GetProperty("assets").EnumerateArray().FirstOrDefault(a => a.GetProperty("name").GetString() == AssetName);
        if (asset.ValueKind == JsonValueKind.Undefined) throw new InvalidDataException("새 버전의 Windows 배포 파일이 아직 준비되지 않았습니다.");
        var uriText = asset.GetProperty("browser_download_url").GetString();
        if (!Uri.TryCreate(uriText, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.Host != "github.com" ||
            !uri.AbsolutePath.StartsWith($"/{Repository}/releases/download/", StringComparison.Ordinal) ||
            !uri.AbsolutePath.EndsWith("/" + AssetName, StringComparison.Ordinal) || uri.Query.Length != 0 || uri.UserInfo.Length != 0)
            throw new InvalidDataException("업데이트 다운로드 주소가 올바르지 않습니다.");
        var digest = asset.TryGetProperty("digest", out var digestValue) ? digestValue.GetString() : null;
        if (digest is null || !digest.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase) ||
            digest.Length != 71 || !digest[7..].All(Uri.IsHexDigit))
            throw new InvalidDataException("업데이트 파일의 SHA-256 검증 정보가 없습니다.");
        var size = asset.GetProperty("size").GetInt64();
        if (size <= 0 || size > UpdatePackage.MaximumBytes) throw new InvalidDataException("업데이트 파일 크기가 올바르지 않습니다.");
        return new AvailableUpdate(NormalizeVersion(version), tag, uri, digest[7..], size);
    }
    public async Task<string> PrepareAsync(AvailableUpdate update, CancellationToken cancellationToken = default)
    {
        var staging = Path.Combine(Path.GetTempPath(), "DDongVoid", "updates", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(staging);
        var archivePath = Path.Combine(staging, "update.zip");
        using var response = await client.GetAsync(update.DownloadUri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        long total = 0;
        await using (var output = new FileStream(archivePath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        await using (var input = await response.Content.ReadAsStreamAsync(cancellationToken))
        {
            var buffer = new byte[81920]; int count;
            while ((count = await input.ReadAsync(buffer, cancellationToken)) > 0)
            {
                total += count;
                if (total > update.Size || total > UpdatePackage.MaximumBytes) throw new InvalidDataException("업데이트 다운로드 크기가 일치하지 않습니다.");
                hash.AppendData(buffer, 0, count); await output.WriteAsync(buffer.AsMemory(0, count), cancellationToken);
            }
        }
        if (total != update.Size || !Convert.ToHexString(hash.GetHashAndReset()).Equals(update.Sha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("업데이트 파일 검증에 실패했습니다. 기존 버전은 유지됩니다.");
        var payload = Path.Combine(staging, "payload");
        UpdatePackage.Extract(archivePath, payload);
        var assemblyVersion = AssemblyName.GetAssemblyName(Path.Combine(payload, "DDongVoid.dll")).Version;
        if (assemblyVersion is null || NormalizeVersion(assemblyVersion) != update.Version)
            throw new InvalidDataException("업데이트 파일의 버전이 배포 정보와 일치하지 않습니다.");
        return payload;
    }
}
