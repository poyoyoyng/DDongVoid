using DDongVoid.Core;

namespace DDongVoid.Online;

// The same store calls the screens make on the shared folder, sent to the online server instead.
// The server acts as the signed-in player, so the user ids passed in are only checked, never trusted.
public sealed class RemoteAccountStore(OnlineServer server) : IAccountStore
{
    public OnlineServer Server { get; } = server;
    public string Location => Server.Address;
    private string SignIn(string method, object request)
    {
        var credentials = Server.Call<OnlineCredentials>(method, request);
        Server.SignIn(credentials);
        return credentials.Id;
    }
    public string Register(string id, string password) => SignIn("account.register", new OnlineLogin(id, password));
    public string Login(string id, string password) => SignIn("account.login", new OnlineLogin(id, password));
    public string ResumeSession(string id, string key) => SignIn("account.resume", new OnlineResume(id, key));
    public string SessionKey(string id) => Server.Credentials is { } current && current.Id == id
        ? current.Key : throw new ArgumentException("계정을 찾을 수 없습니다.");
    public void AddRecord(PlayRecord record) { Server.Expect(record.UserId); Server.Call<bool>("account.addRecord", record); }
    public List<PlayRecord> Records(string id) { Server.Expect(id); return Server.Call<List<PlayRecord>>("account.records"); }
    public int BestScore(string id) { Server.Expect(id); return Server.Call<int>("account.best"); }
    public List<RankingEntry> Rankings() => Server.Call<List<RankingEntry>>("account.rankings");
    public IRhythmStore Rhythm() => new RemoteRhythmStore(Server);
    public ISlapStore Slap() => new RemoteSlapStore(Server);
    public ICiaoStore Ciao() => new RemoteCiaoStore(Server);
    public IOneCardStore OneCard() => new RemoteOneCardStore(Server);
}

public sealed class RemoteRhythmStore(OnlineServer server) : IRhythmStore
{
    public void AddRecord(PlayRecord record) { server.Expect(record.UserId); server.Call<bool>("rhythm.addRecord", record); }
    public List<RankingEntry> Rankings() => server.Call<List<RankingEntry>>("rhythm.rankings");
}

public sealed class RemoteSlapStore(OnlineServer server) : ISlapStore
{
    public string Location => server.Address;
    public Task<List<SlapRoom>> RoomsAsync(CancellationToken cancellationToken = default) =>
        server.CallAsync<List<SlapRoom>>("slap.rooms", null, cancellationToken);
    public List<RankingEntry> Rankings() => server.Call<List<RankingEntry>>("slap.rankings");
    private SlapRoom Act(string userId, string method, object request) { server.Expect(userId); return server.Call<SlapRoom>(method, request); }
    public SlapRoom Create(string userId, string title = "맞짱 방") => Act(userId, "slap.create", new OnlineTitle(title));
    public SlapRoom Join(Guid roomId, string userId) => Act(userId, "slap.join", new OnlineRoom(roomId));
    public SlapRoom SetReady(Guid roomId, string userId, bool ready) => Act(userId, "slap.ready", new OnlineReady(roomId, ready));
    public SlapRoom Submit(Guid roomId, string userId, SlapAction action) => Act(userId, "slap.submit", new OnlineSlapSubmit(roomId, action));
    public SlapRoom SetGiveUp(Guid roomId, string userId, bool giveUp) => Act(userId, "slap.giveUp", new OnlineGiveUp(roomId, giveUp));
    public void Leave(Guid roomId, string userId) { server.Expect(userId); server.Call<bool>("slap.leave", new OnlineRoom(roomId)); }
}

public sealed class RemoteCiaoStore(OnlineServer server) : ICiaoStore
{
    public string Location => server.Address;
    private CiaoRoom Local(CiaoRoom room)
    {
        if (room.ResponseDeadline is { } deadline) room.ResponseDeadline = server.ToLocal(deadline);
        return room;
    }
    public async Task<CiaoSnapshot> SnapshotAsync(string viewer, CancellationToken cancellation = default)
    {
        server.Expect(viewer);
        var snapshot = await server.CallAsync<CiaoSnapshot>("ciao.snapshot", null, cancellation).ConfigureAwait(false);
        snapshot.Rooms.ForEach(r => Local(r));
        return snapshot;
    }
    private CiaoRoom Act(string userId, string method, object request) { server.Expect(userId); return Local(server.Call<CiaoRoom>(method, request)); }
    public CiaoRoom Create(string userId, string title) => Act(userId, "ciao.create", new OnlineTitle(title));
    public CiaoRoom Join(Guid id, string userId) => Act(userId, "ciao.join", new OnlineRoom(id));
    public CiaoRoom SetReady(Guid id, string userId, bool ready) => Act(userId, "ciao.ready", new OnlineReady(id, ready));
    public CiaoRoom Roll(Guid id, string userId, int revision) => Act(userId, "ciao.roll", new OnlineRevision(id, revision));
    public CiaoRoom Declare(Guid id, string userId, int revision, int number) => Act(userId, "ciao.declare", new OnlineDeclare(id, revision, number));
    public CiaoRoom Respond(Guid id, string userId, int revision, bool doubt) => Act(userId, "ciao.respond", new OnlineRespond(id, revision, doubt));
    public void DeleteRoom(Guid id, string userId) { server.Expect(userId); server.Call<bool>("ciao.delete", new OnlineRoom(id)); }
    public void Leave(Guid id, string userId) { server.Expect(userId); server.Call<bool>("ciao.leave", new OnlineRoom(id)); }
}

public sealed class RemoteOneCardStore(OnlineServer server) : IOneCardStore
{
    public string Location => server.Address;
    private OneCardRoom Local(OneCardRoom room)
    {
        if (room.CalloutAt is { } calloutAt) room.CalloutAt = server.ToLocal(calloutAt);
        return room;
    }
    public async Task<OneCardSnapshot> SnapshotAsync(string viewer, CancellationToken cancellation = default)
    {
        server.Expect(viewer);
        var snapshot = await server.CallAsync<OneCardSnapshot>("onecard.snapshot", null, cancellation).ConfigureAwait(false);
        snapshot.Rooms.ForEach(r => Local(r));
        return snapshot;
    }
    private OneCardRoom Act(string userId, string method, object request) { server.Expect(userId); return Local(server.Call<OneCardRoom>(method, request)); }
    public OneCardRoom Create(string userId, string title) => Act(userId, "onecard.create", new OnlineTitle(title));
    public OneCardRoom Join(Guid id, string userId) => Act(userId, "onecard.join", new OnlineRoom(id));
    public OneCardRoom SetReady(Guid id, string userId, bool ready) => Act(userId, "onecard.ready", new OnlineReady(id, ready));
    public OneCardRoom Play(Guid id, string userId, int revision, int card, CardSuit? suit = null) =>
        Act(userId, "onecard.play", new OnlinePlay(id, revision, card, suit));
    public OneCardRoom Draw(Guid id, string userId, int revision) => Act(userId, "onecard.draw", new OnlineRevision(id, revision));
    public OneCardRoom Call(Guid id, string userId, int revision, string target) => Act(userId, "onecard.call", new OnlineCall(id, revision, target));
    public void DeleteRoom(Guid id, string userId) { server.Expect(userId); server.Call<bool>("onecard.delete", new OnlineRoom(id)); }
    public void Leave(Guid id, string userId) { server.Expect(userId); server.Call<bool>("onecard.leave", new OnlineRoom(id)); }
}
