import { DurableObject } from 'cloudflare:workers';
import { replayRhythm, tickRate as rhythmTickRate } from '../public/rhythm-model.js';
import { replayScore, tickRate as dodgeTickRate } from '../public/solo-model.js';
import { replaySides, tickRate as sidesTickRate } from '../public/sides-model.js';
import { minReactionMs, validReaction } from '../public/reaction-model.js';
import { errorResponse, json, readBody, requireThat } from './http.js';

const soloGames = {
  dodge: { replay: replayScore, tickRate: dodgeTickRate },
  rhythm: { replay: replayRhythm, tickRate: rhythmTickRate },
  sides: { replay: replaySides, tickRate: sidesTickRate },
};
export const isSoloGame = game => game === 'reaction' || Object.hasOwn(soloGames, game);
const maxAge = 48 * 60 * 60 * 1000;

export async function startSolo(request, env, account) {
  const { game } = await readBody(request);
  requireThat(isSoloGame(game), '싱글 게임을 선택해 주세요.');
  const { success } = await env.AUTH_LIMIT.limit({ key: 'solo:' + account.id });
  requireThat(success, '잠시 기다린 후 새 게임을 시작해 주세요.', 429);
  const id = crypto.randomUUID();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM solo_runs WHERE account_id = ? AND game = ? AND started_at < ?').bind(account.id, game, now - maxAge),
    env.DB.prepare('INSERT INTO solo_runs (id, account_id, game, seed, started_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, account.id, game, seed, now),
  ]);
  return json({ id, seed }, 201);
}

export class ScoreVerifier extends DurableObject {
  async fetch(request) {
    try {
      const account = request.headers.get('x-player');
      const { id, tick, events, reactionMs, elapsedMs } = await readBody(request, 750_000);
      requireThat(account && typeof id === 'string' && id.length === 36, '기록할 게임이 없습니다.');
      const db = this.env.DB;
      const run = await db.prepare('SELECT * FROM solo_runs WHERE id = ? AND account_id = ?').bind(id, account).first();
      requireThat(run && isSoloGame(run.game) && Date.now() - run.started_at < maxAge, '기록 보관 시간이 지났거나 게임을 찾을 수 없습니다.', 404);
      if (run.finished_score !== null) return json({ score: run.finished_score });
      let score;
      if (run.game === 'reaction') {
        requireThat(!(typeof reactionMs === 'number' && reactionMs < minReactionMs), '예측하지마라잉?');
        requireThat(validReaction(run.seed, reactionMs, elapsedMs, Date.now() - run.started_at), '반응 시간 기록을 확인할 수 없습니다.');
        score = reactionMs;
      } else {
        const { replay, tickRate } = soloGames[run.game];
        requireThat(Number.isInteger(tick) && tick * 1000 / tickRate <= Date.now() - run.started_at + 1000, '게임 시간이 올바르지 않습니다.');
        score = replay(run.seed, tick, events);
      }
      requireThat(score !== null, '플레이 기록을 확인할 수 없습니다.');
      const [, , result] = await db.batch([
        db.prepare('UPDATE solo_runs SET finished_score = ? WHERE id = ? AND finished_score IS NULL').bind(score, id),
        db.prepare(`
          INSERT INTO solo_bests (game, account_id, score)
          SELECT game, account_id, finished_score FROM solo_runs WHERE id = ?
          ON CONFLICT(game, account_id) DO UPDATE SET score = CASE
            WHEN excluded.game = 'reaction' THEN MIN(solo_bests.score, excluded.score)
            ELSE MAX(solo_bests.score, excluded.score) END
        `).bind(id),
        db.prepare('SELECT finished_score FROM solo_runs WHERE id = ?').bind(id),
      ]);
      return json({ score: result.results[0].finished_score });
    } catch (error) {
      return errorResponse(error);
    }
  }
}
