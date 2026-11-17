import assert from 'node:assert/strict';
import test from 'node:test';
import { music, musicKey } from '../src/music.js';

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
