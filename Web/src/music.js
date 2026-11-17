import { HttpError } from './http.js';

// The background track sits in a private R2 bucket under this key and is served only to signed-in players.
export const musicKey = 'bgm';

// Audio elements fetch in byte ranges, so a Range request gets the matching 206 slice.
export async function music(request, env) {
  if (!env.MUSIC) throw new HttpError(404, '배경음악이 설정되지 않았습니다.');
  const ranged = request.headers.has('Range');
  let object;
  try {
    object = await env.MUSIC.get(musicKey, ranged ? { range: request.headers } : undefined);
  } catch {
    throw new HttpError(416, '요청한 구간을 읽을 수 없습니다.');
  }
  if (!object) throw new HttpError(404, '배경음악 파일이 없습니다.');
  const headers = new Headers({ 'Cache-Control': 'private, max-age=3600', 'Accept-Ranges': 'bytes', ETag: object.httpEtag });
  object.writeHttpMetadata(headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'audio/mpeg');
  const range = object.range;
  if (!ranged || !range) {
    headers.set('Content-Length', String(object.size));
    return new Response(object.body, { headers });
  }
  // R2 fills in every field of the range, leaving the unused ones undefined.
  const suffix = range.suffix !== undefined;
  const start = suffix ? Math.max(object.size - range.suffix, 0) : range.offset ?? 0;
  const end = suffix || range.length === undefined ? object.size - 1 : Math.min(start + range.length, object.size) - 1;
  headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(object.body, { status: 206, headers });
}
