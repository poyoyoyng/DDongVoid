import { HttpError } from './http.js';
import { musicTracks } from '../public/music-library.js';

// Retained for installations that optionally serve Circles from R2.
export const musicKey = 'bgm';

// Audio elements fetch in byte ranges, so a Range request gets the matching 206 slice.
export async function music(request, env, trackId = 'circles') {
  if (!musicTracks.some(track => track.id === trackId)) throw new HttpError(404, '음악을 찾을 수 없습니다.');
  if (!env.MUSIC || trackId !== 'circles') {
    if (!env.ASSETS) throw new HttpError(404, '배경음악이 설정되지 않았습니다.');
    // /api/* always runs the Worker first. Only this authenticated handler can read the asset.
    const path = trackId === 'circles' ? '/api/music.mp3' : `/api/music-files/${trackId}.mp3`;
    const asset = await env.ASSETS.fetch(new Request(new URL(path, request.url), request));
    if (asset.status === 404 || (asset.ok && !asset.headers.get('Content-Type')?.startsWith('audio/'))) {
      throw new HttpError(404, '배경음악 파일이 없습니다.');
    }
    const headers = new Headers(asset.headers);
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('Accept-Ranges', 'bytes');
    // Workers static assets return the full file even when Range is requested.
    const requestedRange = request.headers.get('Range');
    const ifRange = request.headers.get('If-Range');
    if (asset.status === 200 && requestedRange && (!ifRange || ifRange === asset.headers.get('ETag'))) {
      const blob = await asset.blob();
      const match = /^bytes=(\d*)-(\d*)$/.exec(requestedRange);
      const suffix = match && match[1] === '';
      const start = match ? suffix ? Math.max(blob.size - Number(match[2]), 0) : Number(match[1]) : -1;
      const end = match ? suffix || match[2] === '' ? blob.size - 1 : Math.min(Number(match[2]), blob.size - 1) : -1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
          || start < 0 || start >= blob.size || end < start) {
        headers.set('Content-Range', `bytes */${blob.size}`);
        headers.set('Content-Length', '0');
        return new Response(null, { status: 416, headers });
      }
      headers.set('Content-Range', `bytes ${start}-${end}/${blob.size}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(blob.slice(start, end + 1), { status: 206, headers });
    }
    return new Response(asset.body, { status: asset.status, headers });
  }
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
