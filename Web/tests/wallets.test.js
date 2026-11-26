import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { walletStatements } from '../src/wallets.js';

function setup(context) {
  const sqlite = new DatabaseSync(':memory:');
  context.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0006_wallets.sql', import.meta.url), 'utf8'));
  const account = sqlite.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?)');
  for (const id of ['loser', 'winner', 'new']) account.run(id, id, id, '', 0);
  const db = { prepare: sql => ({ bind: (...values) => () => sqlite.prepare(sql).run(...values) }) };
  const wallet = id => ({ ...sqlite.prepare('SELECT balance, bankruptcies FROM wallets WHERE account_id = ?').get(id) });
  function settle(match, money) {
    const result = { id: 'seotda-room', match, money };
    sqlite.exec('BEGIN');
    for (const statement of walletStatements(db, result)) statement();
    for (const { id } of money) sqlite.prepare('INSERT OR IGNORE INTO match_results VALUES (?, ?, ?, ?, ?)')
      .run(result.id, match, 'seotda', id, 'L');
    sqlite.exec('COMMIT');
  }
  return { sqlite, wallet, settle };
}

test('0원으로 끝난 지갑을 즉시 충전하고 정산 재시도로 중복 충전하지 않는다', context => {
  const { sqlite, wallet, settle } = setup(context);
  sqlite.exec("INSERT INTO wallets VALUES ('loser', 200000, 2), ('winner', 1000000, 0)");
  const money = [{ id: 'loser', delta: -200_000, refill: false }, { id: 'winner', delta: 200_000, refill: false }];
  settle(1, money);
  assert.deepEqual(wallet('loser'), { balance: 3_000_000, bankruptcies: 3 });
  assert.deepEqual(wallet('winner'), { balance: 1_200_000, bankruptcies: 0 });
  settle(1, money);
  assert.deepEqual(wallet('loser'), { balance: 3_000_000, bankruptcies: 3 });
  assert.deepEqual(wallet('winner'), { balance: 1_200_000, bankruptcies: 0 });
  settle(2, [{ id: 'loser', delta: -10_000, refill: false }]);
  assert.deepEqual(wallet('loser'), { balance: 2_990_000, bankruptcies: 3 });
});

test('다음 판 시작 충전과 최초 지갑 생성도 300만원을 기준으로 정산한다', context => {
  const { sqlite, wallet, settle } = setup(context);
  sqlite.exec("INSERT INTO wallets VALUES ('loser', 100000, 0)");
  settle(1, [{ id: 'loser', delta: -10_000, refill: true }, { id: 'new', delta: -10_000, refill: true }]);
  assert.deepEqual(wallet('loser'), { balance: 2_990_000, bankruptcies: 1 });
  assert.deepEqual(wallet('new'), { balance: 2_990_000, bankruptcies: 1 });
});

test('충전 후 같은 판에 다시 전액을 잃으면 두 번째 파산도 반영한다', context => {
  const { sqlite, wallet, settle } = setup(context);
  sqlite.exec("INSERT INTO wallets VALUES ('loser', 0, 0)");
  settle(1, [{ id: 'loser', delta: -3_000_000, refill: true }]);
  assert.deepEqual(wallet('loser'), { balance: 3_000_000, bankruptcies: 2 });
});

test('기존 0원 지갑만 충전하는 마이그레이션은 재실행해도 중복 지급하지 않는다', context => {
  const { sqlite, wallet } = setup(context);
  sqlite.exec("INSERT INTO wallets VALUES ('loser', 0, 2), ('winner', 100000, 0), ('new', 5000000, 0)");
  const migration = readFileSync(new URL('../migrations/0008_seotda_zero_wallets.sql', import.meta.url), 'utf8');
  sqlite.exec(migration);
  assert.deepEqual(wallet('loser'), { balance: 3_000_000, bankruptcies: 3 });
  assert.deepEqual(wallet('winner'), { balance: 100_000, bankruptcies: 0 });
  assert.deepEqual(wallet('new'), { balance: 5_000_000, bankruptcies: 0 });
  sqlite.exec(migration);
  assert.deepEqual(wallet('loser'), { balance: 3_000_000, bankruptcies: 3 });
});
