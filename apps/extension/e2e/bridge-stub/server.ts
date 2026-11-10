import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

/** Must match the fake pairing file scripts/build.mjs writes into the e2e dist. */
export const E2E_TOKEN = 'e2e0'.repeat(16);
export const E2E_BRIDGE_PORT = 47822;

export interface StubOptions {
  port?: number;
  token?: string;
  /** 'wrong': answers ping with a proof made from another secret (an impostor on the port). */
  proof?: 'good' | 'wrong';
}

export interface ReceivedLesson {
  id: string;
  kind: string;
  situation: string;
  items: unknown[];
  capturedAt: string;
  [k: string]: unknown;
}

/**
 * Small stand-in for the langcoach MCP bridge (protocol v1 + pairing): trust checks (chrome-extension
 * Origin, X-LangCoach, Host), CORS preflight, nonce proof on ping, token on POST, idempotent ids.
 */
export async function startBridgeStub(opts: StubOptions = {}) {
  const port = opts.port ?? E2E_BRIDGE_PORT;
  const token = opts.token ?? E2E_TOKEN;
  const proofKey = opts.proof === 'wrong' ? 'f'.repeat(32) : token;
  const lessons = new Map<string, ReceivedLesson>();
  const requests: { method: string; path: string }[] = [];

  const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    requests.push({ method: req.method ?? '', path: url.pathname });
    const origin = String(req.headers.origin ?? '');
    const send = (status: number, body: unknown, extra: Record<string, string> = {}) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        ...(origin.startsWith('chrome-extension://') ? { 'access-control-allow-origin': origin } : {}),
        ...extra,
      });
      res.end(JSON.stringify(body));
    };
    const hostOk = req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`;
    // Chrome omits Origin on an extension's GET to a host it has permission for (verified in e2e);
    // POST always carries it. The ping reveals nothing without the token, so it is allowed without one.
    const pingWithoutOrigin = origin === '' && req.method === 'GET' && url.pathname === '/v1/ping';
    if ((!origin.startsWith('chrome-extension://') && !pingWithoutOrigin) || !hostOk) {
      return send(403, { ok: false, error: 'forbidden' });
    }
    if (req.method === 'OPTIONS') {
      return send(204, {}, {
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type, X-LangCoach, X-LangCoach-Token',
        'access-control-max-age': '600',
      });
    }
    if (req.headers['x-langcoach'] !== '1') return send(403, { ok: false, error: 'forbidden' });

    if (req.method === 'GET' && url.pathname === '/v1/ping') {
      const nonce = url.searchParams.get('nonce') ?? '';
      if (!/^[0-9a-f]{8,64}$/i.test(nonce)) return send(400, { ok: false, error: 'bad nonce' });
      const proof = createHmac('sha256', proofKey).update(nonce).digest('hex');
      return send(200, { ok: true, app: 'langcoach', bridge: 1, version: '0.0.0-stub', proof });
    }
    if (req.method === 'POST' && url.pathname === '/v1/lessons') {
      if (req.headers['x-langcoach-token'] !== token) return send(401, { ok: false, error: 'not paired' });
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        let body: { lessons?: ReceivedLesson[] };
        try {
          body = JSON.parse(raw);
        } catch {
          return send(400, { ok: false, error: 'malformed JSON' });
        }
        if (!Array.isArray(body.lessons) || body.lessons.length > 20) return send(400, { ok: false, error: 'bad lessons' });
        const results = body.lessons.map((l) => {
          if (lessons.has(l.id)) return { id: l.id, status: 'duplicate' };
          lessons.set(l.id, l);
          return { id: l.id, status: 'saved', newCards: l.items.length };
        });
        send(200, { ok: true, results });
      });
      return;
    }
    send(404, { ok: false, error: 'not found' });
  });

  await new Promise<void>((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve());
  });
  return {
    lessons,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        srv.close(() => resolve());
        srv.closeAllConnections();
      }),
  };
}
