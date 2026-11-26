import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

test('100ms 미만 반응 기록을 정리하고 정상 최고 기록을 복원하며 다른 게임은 유지한다', context => {
  const db = new DatabaseSync(':memory:');
  context.after(() => db.close());
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  const account = db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?)');
  for (const id of ['restore', 'invalid-only', 'boundary', 'manual', 'missing']) account.run(id, id, id, '', 0);
  const run = db.prepare('INSERT INTO solo_runs VALUES (?, ?, ?, ?, ?, ?)');
  run.run('bad', 'restore', 'reaction', 0, 0, 99);
  run.run('good', 'restore', 'reaction', 0, 0, 221);
  run.run('slower', 'restore', 'reaction', 0, 0, 300);
  run.run('only-bad', 'invalid-only', 'reaction', 0, 0, 42);
  run.run('exactly-100', 'boundary', 'reaction', 0, 0, 100);
  run.run('unfinished', 'boundary', 'reaction', 0, 0, null);
  run.run('missing-best', 'missing', 'reaction', 0, 0, 200);
  run.run('other-game', 'invalid-only', 'dodge', 0, 0, 27);
  db.exec(`INSERT INTO solo_bests VALUES
    ('reaction', 'restore', 27), ('reaction', 'invalid-only', 42),
    ('reaction', 'boundary', 100), ('reaction', 'manual', 150), ('dodge', 'invalid-only', 27)`);
  const migration = readFileSync(new URL('../migrations/0007_reaction_minimum.sql', import.meta.url), 'utf8');
  db.exec(migration);
  const bests = () => db.prepare('SELECT game, account_id, score FROM solo_bests ORDER BY game, account_id')
    .all().map(row => ({ ...row }));
  const expected = [
    { game: 'dodge', account_id: 'invalid-only', score: 27 },
    { game: 'reaction', account_id: 'boundary', score: 100 },
    { game: 'reaction', account_id: 'manual', score: 150 },
    { game: 'reaction', account_id: 'missing', score: 200 },
    { game: 'reaction', account_id: 'restore', score: 221 },
  ];
  assert.deepEqual(bests(), expected);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM solo_runs WHERE game = 'reaction' AND finished_score < 100").get().n, 0);
  assert.equal(db.prepare('SELECT finished_score FROM solo_runs WHERE id = ?').get('exactly-100').finished_score, 100);
  assert.equal(db.prepare('SELECT finished_score FROM solo_runs WHERE id = ?').get('unfinished').finished_score, null);
  assert.equal(db.prepare('SELECT finished_score FROM solo_runs WHERE id = ?').get('other-game').finished_score, 27);
  db.exec(migration);
  assert.deepEqual(bests(), expected);
});
