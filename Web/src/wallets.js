import { refillMoney, startMoney } from '../public/seotda.js';

// These run in the same batch before match_results, so retries never pay out or refill twice.
export function walletStatements(db, result) {
  return result.money.flatMap(({ id, delta, refill }) => [
    db.prepare(`
      INSERT INTO wallets (account_id, balance, bankruptcies)
      SELECT ?1, CASE WHEN ?4 THEN ?7 ELSE ?2 END + ?3, ?4
      WHERE NOT EXISTS (SELECT 1 FROM match_results WHERE room_id = ?5 AND match_no = ?6)
      ON CONFLICT (account_id) DO UPDATE SET balance = CASE WHEN ?4 THEN ?7 ELSE wallets.balance END + ?3,
        bankruptcies = wallets.bankruptcies + ?4
    `).bind(id, startMoney, delta, refill ? 1 : 0, result.id, result.match, refillMoney),
    db.prepare(`
      UPDATE wallets SET balance = ?2, bankruptcies = bankruptcies + 1
      WHERE account_id = ?1 AND balance <= 0
        AND NOT EXISTS (SELECT 1 FROM match_results WHERE room_id = ?3 AND match_no = ?4)
    `).bind(id, refillMoney, result.id, result.match),
  ]);
}
