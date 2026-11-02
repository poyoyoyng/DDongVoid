namespace DDongVoid.Core;

internal static class SlapSnapshotReader
{
    public static async Task<List<SlapRoom>> ReadAsync(Func<CancellationToken, Task<List<SlapRoom>>> read,
        TimeSpan timeout, CancellationToken cancellationToken = default)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(timeout);
        var readToken = deadline.Token;
        try
        {
            // Opening an unavailable network file can block even before its first async read.
            return await Task.Run(() => read(readToken), readToken).WaitAsync(readToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("대전 정보 조회가 지연되고 있습니다. 자동으로 다시 확인합니다.");
        }
    }
}
