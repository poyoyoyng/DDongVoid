using System.Text.Json;
using System.Text.Json.Serialization;

namespace DDongVoid.Core;

// Wire format shared by the online server and the game client: every call is POST /api/{method}
// with a JSON body, and the signed-in player is identified by the user/key headers.
public static class OnlineProtocol
{
    public const int Version = 1;
    public const string Name = "DDongVoid";
    public const string UserHeader = "X-DDongVoid-User", KeyHeader = "X-DDongVoid-Key", TimeHeader = "X-DDongVoid-Time";
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
}

public sealed record OnlineHealth(string Name, int Protocol, string Version);
public sealed record OnlineError(string Message);
public sealed record OnlineCredentials(string Id, string Key);
public sealed record OnlineLogin(string Id, string Password);
public sealed record OnlineResume(string Id, string Key);
public sealed record OnlineTitle(string Title);
public sealed record OnlineRoom(Guid Room);
public sealed record OnlineReady(Guid Room, bool Ready);
public sealed record OnlineSlapSubmit(Guid Room, SlapAction Action);
public sealed record OnlineGiveUp(Guid Room, bool GiveUp);
public sealed record OnlineRevision(Guid Room, int Revision);
public sealed record OnlineDeclare(Guid Room, int Revision, int Number);
public sealed record OnlineRespond(Guid Room, int Revision, bool Doubt);
public sealed record OnlinePlay(Guid Room, int Revision, int Card, CardSuit? Suit);
public sealed record OnlineCall(Guid Room, int Revision, string Target);
