import { kindFromUrl, type CaptureKind } from '../lib/parse';

export interface RawCapture {
  kind: CaptureKind;
  /** Parsed JSON request body, or undefined if it was not a JSON string. */
  request: unknown;
  response: unknown;
  url: string;
}

export interface WrapOptions {
  /** Base for relative URLs (the page's current location.href; a getter follows SPA navigation). */
  base?: string | (() => string);
  /** E2E builds also observe the local mock server. */
  allowLocalhost?: boolean;
}

function urlOf(input: unknown, base: WrapOptions['base']): string {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : typeof Request !== 'undefined' && input instanceof Request
          ? input.url
          : String(input);
  return new URL(raw, typeof base === 'function' ? base() : base).href;
}

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * Wraps fetch so lesson responses can be observed. The page's call path is untouched: the original is
 * called with identical `this` and arguments and its own promise is returned (no extra await, same
 * Response object, same rejection). Only insights responses are cloned; the clone is read in a
 * detached promise and every failure there is swallowed.
 */
export function wrapFetch(
  original: typeof fetch,
  onCapture: (c: RawCapture) => void,
  opts: WrapOptions = {},
): typeof fetch {
  return function langcoachFetch(this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
    const p = original.apply(this, args);
    try {
      const url = urlOf(args[0], opts.base);
      const kind = kindFromUrl(url, { allowLocalhost: opts.allowLocalhost });
      if (kind) {
        const body = args[1]?.body;
        // Registered before the page's own handlers, so the clone happens before the page reads the body.
        p.then(
          (res) => {
            if (!res.ok) return;
            res
              .clone()
              .json()
              .then((response: unknown) => {
                onCapture({ kind, request: parseBody(body), response, url });
              })
              .catch(() => {});
          },
          () => {},
        ).catch(() => {});
      }
    } catch {
      // never break the page
    }
    return p;
  } as typeof fetch;
}
