import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

const fx = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url)), 'utf8');

const FIXTURES = {
  termsEs: fx('terms-es.json'),
  termsAr: fx('terms-ar.json'),
  grammarEs: fx('grammar-es.json'),
  conversationZh: fx('conversation-zh.json'),
  descriptorsJa: fx('object-descriptors-ja.json'),
};

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mock Little Language Lessons</title>
  </head>
  <body>
    <h1>Mock Little Language Lessons</h1>
    <button id="btn-terms-es" type="button">Run Tiny Lesson (ES)</button>
    <button id="btn-grammar-es" type="button">Run Grammar (ES)</button>
    <button id="btn-terms-ar" type="button">Run Tiny Lesson (AR)</button>
    <button id="btn-slang-zh" type="button">Run Slang Hang (ZH)</button>
    <button id="btn-wordcam-ja" type="button">Run Word Cam (JA)</button>
    <button id="btn-unknown-shape" type="button">Run Unknown API Shape</button>
    <pre id="out"></pre>
    <script>
      const out = document.getElementById('out');
      async function post(path, body) {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        out.textContent = JSON.stringify(data).slice(0, 120);
      }
      document.getElementById('btn-terms-es').addEventListener('click', () =>
        post('/lll/api/insights/terms', {
          sourceLanguage: 'English',
          targetLanguage: 'European Spanish',
          purpose: 'ordering coffee at a cafe',
        })
      );
      document.getElementById('btn-grammar-es').addEventListener('click', () =>
        post('/lll/api/insights/grammar', {
          sourceLanguage: 'English',
          targetLanguage: 'European Spanish',
          purpose: 'ordering coffee at a cafe',
        })
      );
      document.getElementById('btn-terms-ar').addEventListener('click', () =>
        post('/lll/api/insights/terms', {
          sourceLanguage: 'English',
          targetLanguage: 'Arabic',
          purpose: 'coffee',
        })
      );
      document.getElementById('btn-slang-zh').addEventListener('click', () =>
        post('/lll/api/insights/conversation', {
          sourceLanguage: 'English',
          targetLanguage: 'Mandarin Chinese',
        })
      );
      document.getElementById('btn-wordcam-ja').addEventListener('click', () =>
        post('/lll/api/insights/object-descriptors', {
          sourceLanguage: 'English',
          targetLanguage: 'Japanese',
          object: 'coffee cup',
        })
      );
      document.getElementById('btn-unknown-shape').addEventListener('click', () =>
        post('/lll/api/insights/terms', {
          sourceLanguage: 'English',
          targetLanguage: 'European Spanish',
          purpose: '__unexpected__',
        })
      );
    </script>
  </body>
</html>`;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
  });
}

export async function startMockLllServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const srv = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    if (req.method === 'POST' && url.startsWith('/lll/api/insights/')) {
      const raw = await readBody(req);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      if (parsed.purpose === '__unexpected__') {
        res.end(JSON.stringify({ unexpected: true }));
        return;
      }
      if (url.endsWith('/terms')) {
        res.end(parsed.targetLanguage === 'Arabic' ? FIXTURES.termsAr : FIXTURES.termsEs);
        return;
      }
      if (url.endsWith('/grammar')) {
        res.end(FIXTURES.grammarEs);
        return;
      }
      if (url.endsWith('/conversation')) {
        res.end(FIXTURES.conversationZh);
        return;
      }
      if (url.endsWith('/object-descriptors')) {
        res.end(FIXTURES.descriptorsJa);
        return;
      }
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
  });

  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const { port } = srv.address() as AddressInfo;
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve, reject) => srv.close((err) => (err ? reject(err) : resolve()))),
  };
}
