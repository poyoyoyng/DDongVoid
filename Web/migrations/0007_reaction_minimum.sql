-- 100ms 미만 반응속도 기록을 삭제하고 정상 기록 중 최고 기록을 복원한다.
DELETE FROM solo_runs WHERE game = 'reaction' AND finished_score < 100;

INSERT INTO solo_bests (game, account_id, score)
SELECT game, account_id, MIN(finished_score)
FROM solo_runs
WHERE game = 'reaction' AND finished_score >= 100
GROUP BY game, account_id
ON CONFLICT(game, account_id) DO UPDATE SET score = excluded.score
WHERE solo_bests.score < 100;

DELETE FROM solo_bests WHERE game = 'reaction' AND score < 100;
