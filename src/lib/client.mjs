import http from 'node:http';

const PIPE_PATH = process.env.MIHOMO_PIPE || '\\\\.\\pipe\\verge-mihomo';
const HTTP_BASE = (process.env.MIHOMO_HTTP || '').replace(/\/+$/, '');
const SECRET = process.env.MIHOMO_SECRET || '';

export function channelName() {
  return HTTP_BASE ? `HTTP ${HTTP_BASE}` : `named pipe ${PIPE_PATH}`;
}

function parseBody(text, statusCode) {
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (statusCode >= 400) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data ?? '');
    throw new Error(`mihomo API HTTP ${statusCode}: ${detail}`);
  }
  return data;
}

function viaPipe(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        socketPath: PIPE_PATH,
        path,
        method,
        host: 'localhost',
        headers: {
          ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(parseBody(Buffer.concat(chunks).toString('utf8'), res.statusCode));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('mihomo API request timeout')));
    req.end(payload ?? undefined);
  });
}

async function viaHttp(method, path, body) {
  const res = await fetch(HTTP_BASE + path, {
    method,
    headers: {
      ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return parseBody(await res.text(), res.status);
}

/**
 * 调 mihomo 内核 RESTful API。
 * 默认走 Windows 命名管道(与 Clash Verge GUI 同一通道),设置 MIHOMO_HTTP 后改走 HTTP。
 */
export function mihomoRequest(method, path, body) {
  return HTTP_BASE ? viaHttp(method, path, body) : viaPipe(method, path, body);
}
