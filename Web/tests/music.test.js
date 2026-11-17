import assert from 'node:assert/strict';
import test from 'node:test';
import { music, musicKey } from '../src/music.js';
import { musicTracks } from '../public/music-library.js';

const track = new TextEncoder().encode('0123456789');

// Mirrors how an R2 bucket answers a get with `range: request.headers`.
function bucket(contentType = 'audio/mpeg') {
  return {
    async get(key, options) {
      if (key !== musicKey) return null;
      const header = options?.range?.get('Range');
      let range;
      if (header) {
        const [, from, to] = header.match(/^bytes=(\d*)-(\d*)$/);
        // Like R2, every field is present and the unused ones are undefined.
        range = from === '' ? { offset: undefined, length: undefined, suffix: Number(to) }
          : { offset: Number(from), length: to === '' ? undefined : Number(to) - Number(from) + 1, suffix: undefined };
      }
      const start = range ? range.suffix !== undefined ? track.length - range.suffix : range.offset : 0;
      const end = range?.length ? start + range.length : track.length;
      return {
        size: track.length, range, httpEtag: '"v1"', body: track.slice(start, end),
        writeHttpMetadata(headers) { if (contentType) headers.set('Content-Type', contentType); },
      };
    },
  };
}
const request = range => new Request('https://example.test/api/music', { headers: range ? { Range: range } : {} });
const text = async response => new TextDecoder().decode(await response.arrayBuffer());

test('the whole track is served with its type and size', async () => {
  const response = await music(request(), { MUSIC: bucket() });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Content-Length'), '10');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.match(response.headers.get('Cache-Control'), /^private/);
  assert.equal(await text(response), '0123456789');
});

test('byte ranges answer with 206 and the matching Content-Range', async () => {
  for (const [range, expected, body] of [['bytes=2-5', 'bytes 2-5/10', '2345'], ['bytes=7-', 'bytes 7-9/10', '789'], ['bytes=-3', 'bytes 7-9/10', '789']]) {
    const response = await music(request(range), { MUSIC: bucket() });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('Content-Range'), expected, range);
    assert.equal(response.headers.get('Content-Length'), String(body.length), range);
    assert.equal(await text(response), body, range);
  }
});

test('a track uploaded without a type is still served as audio', async () => {
  const response = await music(request(), { MUSIC: bucket(null) });
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
});

test('a missing bucket or track is a 404', async () => {
  await assert.rejects(music(request(), {}), { status: 404 });
  await assert.rejects(music(request(), { MUSIC: { get: async () => null } }), { status: 404 });
});

test('호스팅 음원은 내부 자산에서 읽고 구간 요청과 비공개 캐시를 유지한다', async () => {
  const response = await music(request('bytes=2-5'), { ASSETS: {
    async fetch(input) {
      assert.equal(new URL(input.url).pathname, '/api/music.mp3');
      assert.equal(input.headers.get('Range'), 'bytes=2-5');
      return new Response('2345', { status: 206, headers: {
        'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 2-5/10',
        'Content-Length': '4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=0',
      } });
    },
  } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(response.headers.get('Content-Length'), '4');
  assert.match(response.headers.get('Cache-Control'), /^private/);
  assert.equal(await text(response), '2345');
});

test('음원 누락 시 SPA 대체 페이지도 음악으로 응답하지 않는다', async () => {
  for (const status of [200, 404]) {
    await assert.rejects(music(request(), { ASSETS: {
      fetch: async () => new Response('<html></html>', { status, headers: { 'Content-Type': 'text/html' } }),
    } }), { status: 404 });
  }
});

test('정적 자산이 전체 파일을 반환해도 지정 구간과 잘못된 범위를 처리한다', async () => {
  const env = { ASSETS: { fetch: async () => new Response(track, { headers: { 'Content-Type': 'audio/mpeg' } }) } };
  for (const [range, expected, body] of [
    ['bytes=2-5', 'bytes 2-5/10', '2345'], ['bytes=7-', 'bytes 7-9/10', '789'],
    ['bytes=-3', 'bytes 7-9/10', '789'], ['bytes=8-99', 'bytes 8-9/10', '89'],
  ]) {
    const response = await music(request(range), env);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('Content-Range'), expected);
    assert.equal(await text(response), body);
  }
  for (const range of ['bytes=10-', 'bytes=-0', 'bytes=5-2', 'bytes=-', 'invalid']) {
    const response = await music(request(range), env);
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('Content-Range'), 'bytes */10');
  }
});

test('목록의 여섯 곡을 각각의 비공개 자산에서 읽는다', async () => {
  assert.equal(musicTracks.length, 6);
  for (const track of musicTracks) {
    const response = await music(request(), { ASSETS: {
      fetch: async input => {
        assert.equal(new URL(input.url).pathname, track.id === 'circles' ? '/api/music.mp3' : `/api/music-files/${track.id}.mp3`);
        return new Response(track.id, { headers: { 'Content-Type': 'audio/mpeg' } });
      },
    } }, track.id);
    assert.equal(await response.text(), track.id);
  }
});

test('등록되지 않은 곡과 경로는 자산 저장소에 접근하지 못한다', async () => {
  const env = { ASSETS: { fetch: async () => assert.fail('등록되지 않은 파일 접근') } };
  for (const id of ['missing', '../music', 'circles.mp3', '']) {
    await assert.rejects(music(request(), env, id), { status: 404 });
  }
});
