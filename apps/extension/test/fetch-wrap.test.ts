import { describe, expect, it, vi } from 'vitest';
import { wrapFetch, type RawCapture } from '../src/content/fetch-wrap';

const TERMS = 'https://labs.google/lll/api/insights/terms';
const reqBody = JSON.stringify({ sourceLanguage: 'English', targetLanguage: 'European Spanish', purpose: 'coffee' });
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
/** Let detached promise chains (clone → json → onCapture) settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('wrapFetch', () => {
  it('returns the very same Response instance and passes identical args', async () => {
    const res = json({ vocabulary: [] });
    const original = vi.fn(async () => res) as unknown as typeof fetch;
    const wrapped = wrapFetch(original, () => {});
    const init = { method: 'POST', body: reqBody };
    const out = await wrapped(TERMS, init);
    expect(out).toBe(res);
    expect(original).toHaveBeenCalledWith(TERMS, init);
    // the page can still read the body
    expect(await out.json()).toEqual({ vocabulary: [] });
  });

  it('returns the original promise object (no extra awaits on the page path)', () => {
    const p = Promise.resolve(json({}));
    const wrapped = wrapFetch((() => p) as unknown as typeof fetch, () => {});
    expect(wrapped(TERMS, { method: 'POST', body: reqBody })).toBe(p);
    const q = Promise.resolve(json({}));
    const w2 = wrapFetch((() => q) as unknown as typeof fetch, () => {});
    expect(w2('https://labs.google/lll/other')).toBe(q);
  });

  it('calls onCapture with parsed request and response JSON for insights URLs', async () => {
    const caps: RawCapture[] = [];
    const wrapped = wrapFetch((async () => json({ vocabulary: [1] })) as unknown as typeof fetch, (c) => caps.push(c));
    const res = await wrapped(TERMS, { method: 'POST', body: reqBody });
    await res.text(); // page consumes the body; our clone is independent
    await flush();
    expect(caps).toEqual([
      {
        kind: 'terms',
        request: JSON.parse(reqBody),
        response: { vocabulary: [1] },
        url: TERMS,
      },
    ]);
  });

  it('resolves relative URLs, URL objects and Request objects against the base', async () => {
    const caps: RawCapture[] = [];
    const wrapped = wrapFetch((async () => json({ a: 1 })) as unknown as typeof fetch, (c) => caps.push(c), {
      base: 'https://labs.google/lll/en/experiments/tiny-lesson',
    });
    await wrapped('/lll/api/insights/grammar', { method: 'POST', body: reqBody });
    await wrapped(new URL('https://labs.google/lll/api/insights/conversation'), { method: 'POST', body: reqBody });
    await wrapped(new Request('https://labs.google/lll/api/insights/object-descriptors', { method: 'POST', body: reqBody }));
    await flush();
    expect(caps.map((c) => c.kind)).toEqual(['grammar', 'conversation', 'object-descriptors']);
    // Request body is not a string we can read without consuming → request undefined
    expect(caps[2]?.request).toBeUndefined();
  });

  it('does not clone or capture non-insights requests', async () => {
    const res = json({ a: 1 });
    const clone = vi.spyOn(res, 'clone');
    const onCapture = vi.fn();
    const wrapped = wrapFetch((async () => res) as unknown as typeof fetch, onCapture);
    await wrapped('https://labs.google/lll/api/insights/detect-objects', { method: 'POST', body: reqBody });
    await wrapped('https://example.com/lll/api/insights/terms');
    await flush();
    expect(clone).not.toHaveBeenCalled();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('propagates the original rejection unchanged and captures nothing', async () => {
    const err = new TypeError('Failed to fetch');
    const onCapture = vi.fn();
    const wrapped = wrapFetch((() => Promise.reject(err)) as unknown as typeof fetch, onCapture);
    await expect(wrapped(TERMS, { method: 'POST', body: reqBody })).rejects.toBe(err);
    await flush();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('propagates a synchronous throw from the original unchanged', () => {
    const err = new TypeError('bad init');
    const wrapped = wrapFetch(
      (() => {
        throw err;
      }) as unknown as typeof fetch,
      () => {},
    );
    expect(() => wrapped(TERMS)).toThrow(err);
  });

  it('swallows JSON parse errors, non-OK responses and onCapture errors', async () => {
    const onCapture = vi.fn();
    const bad = wrapFetch((async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch, onCapture);
    await expect(bad(TERMS, { method: 'POST', body: reqBody })).resolves.toBeInstanceOf(Response);
    const notOk = wrapFetch((async () => json({ a: 1 }, 500)) as unknown as typeof fetch, onCapture);
    await notOk(TERMS, { method: 'POST', body: reqBody });
    await flush();
    expect(onCapture).not.toHaveBeenCalled();

    const thrower = wrapFetch((async () => json({ a: 1 })) as unknown as typeof fetch, () => {
      throw new Error('boom');
    });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await expect(thrower(TERMS, { method: 'POST', body: reqBody })).resolves.toBeInstanceOf(Response);
    await flush();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('keeps a non-JSON string request body as undefined request', async () => {
    const caps: RawCapture[] = [];
    const wrapped = wrapFetch((async () => json({ a: 1 })) as unknown as typeof fetch, (c) => caps.push(c));
    await wrapped(TERMS, { method: 'POST', body: 'not json' });
    await flush();
    expect(caps[0]?.request).toBeUndefined();
  });

  it('allows localhost only when asked', async () => {
    const onCapture = vi.fn();
    const local = 'http://localhost:5173/lll/api/insights/terms';
    await wrapFetch((async () => json({})) as unknown as typeof fetch, onCapture)(local, { body: reqBody });
    await flush();
    expect(onCapture).not.toHaveBeenCalled();
    await wrapFetch((async () => json({})) as unknown as typeof fetch, onCapture, { allowDevHosts: true })(local, {
      body: reqBody,
    });
    await flush();
    expect(onCapture).toHaveBeenCalledOnce();
  });
});
