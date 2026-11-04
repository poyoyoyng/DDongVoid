namespace DDongVoid.Core;

// Screens talk to these so the same code runs against the shared-folder files (server, tests)
// or against the online server through HTTP (game client).
public interface IAccountStore
{
    // Where the accounts live: a folder path or a server address. Used to drop results from a previous location.
    string Location { get; }
    string Register(string id, string password);
    string Login(string id, string password);
    string SessionKey(string id);
    string ResumeSession(string id, string key);
    void AddRecord(PlayRecord record);
    List<PlayRecord> Records(string id);
    int BestScore(string id);
    List<RankingEntry> Rankings();
    IRhythmStore Rhythm();
    ISlapStore Slap();
    ICiaoStore Ciao();
    IOneCardStore OneCard();
}

public interface IRhythmStore
{
    void AddRecord(PlayRecord record);
    List<RankingEntry> Rankings();
}

public interface ISlapStore
{
    string Location { get; }
    Task<List<SlapRoom>> RoomsAsync(CancellationToken cancellationToken = default);
    List<RankingEntry> Rankings();
    SlapRoom Create(string userId, string title = "맞짱 방");
    SlapRoom Join(Guid roomId, string userId);
    SlapRoom SetReady(Guid roomId, string userId, bool ready);
    SlapRoom Submit(Guid roomId, string userId, SlapAction action);
    SlapRoom SetGiveUp(Guid roomId, string userId, bool giveUp);
    void Leave(Guid roomId, string userId);
}

public interface ICiaoStore
{
    string Location { get; }
    Task<CiaoSnapshot> SnapshotAsync(string viewer, CancellationToken cancellation = default);
    CiaoRoom Create(string userId, string title);
    CiaoRoom Join(Guid id, string userId);
    CiaoRoom SetReady(Guid id, string userId, bool ready);
    CiaoRoom Roll(Guid id, string userId, int revision);
    CiaoRoom Declare(Guid id, string userId, int revision, int number);
    CiaoRoom Respond(Guid id, string userId, int revision, bool doubt);
    void DeleteRoom(Guid id, string userId);
    void Leave(Guid id, string userId);
}

public interface IOneCardStore
{
    string Location { get; }
    Task<OneCardSnapshot> SnapshotAsync(string viewer, CancellationToken cancellation = default);
    OneCardRoom Create(string userId, string title);
    OneCardRoom Join(Guid id, string userId);
    OneCardRoom SetReady(Guid id, string userId, bool ready);
    OneCardRoom Play(Guid id, string userId, int revision, int card, CardSuit? suit = null);
    OneCardRoom Draw(Guid id, string userId, int revision);
    OneCardRoom Call(Guid id, string userId, int revision, string target);
    void DeleteRoom(Guid id, string userId);
    void Leave(Guid id, string userId);
}
