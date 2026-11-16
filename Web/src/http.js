export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireThat(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}

export const json = (value, status = 200, headers = {}) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});

export function errorResponse(error) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: '서버에서 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }, 500);
}

export async function readBody(request, maximum = 4096) {
  requireThat(request.headers.get('Content-Type')?.split(';')[0] === 'application/json', 'JSON 요청이 필요합니다.', 415);
  requireThat(Number(request.headers.get('Content-Length')) <= maximum, '요청이 너무 큽니다.', 413);
  requireThat(request.body, '요청 본문이 필요합니다.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maximum) {
      await reader.cancel();
      throw new HttpError(413, '요청이 너무 큽니다.');
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    const value = JSON.parse(text + decoder.decode());
    requireThat(value && typeof value === 'object' && !Array.isArray(value), 'JSON 객체가 필요합니다.');
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, '요청 형식이 올바르지 않습니다.');
  }
}

export function randomInt(maximum) {
  const word = new Uint32Array(1);
  const limit = 0x100000000 - (0x100000000 % maximum);
  do { crypto.getRandomValues(word); } while (word[0] >= limit);
  return word[0] % maximum;
}
