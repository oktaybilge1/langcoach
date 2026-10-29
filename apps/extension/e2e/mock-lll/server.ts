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
    <button id="btn-rerender" type="button">Re-render lesson</button>
    <pre id="out"></pre>
    <div id="lesson"></div>
    <script>
      const out = document.getElementById('out');
      const lesson = document.getElementById('lesson');
      let last = null;
      // Renders cards roughly like LLL: term, speaker button, meaning (fresh nodes each time, as React would).
      function renderLesson() {
        lesson.replaceChildren();
        if (!last) return;
        const list = document.createElement('ul');
        for (const it of [...(last.vocabulary || []), ...(last.phrases || [])]) {
          const li = document.createElement('li');
          li.className = 'lll-card';
          const term = document.createElement('div');
          term.className = 'lll-term';
          term.textContent = it.term || it.phrase || '';
          const play = document.createElement('button');
          play.type = 'button';
          play.textContent = 'Play';
          const meaning = document.createElement('div');
          meaning.className = 'lll-meaning';
          meaning.textContent = it.translation || '';
          li.append(term, play, meaning);
          list.append(li);
        }
        for (const g of last.relevantGrammar || []) {
          for (const x of g.examples || []) {
            const li = document.createElement('li');
            const s = document.createElement('p');
            s.textContent = x.sentence;
            const tr = document.createElement('p');
            tr.className = 'lll-example-translation';
            tr.textContent = x.translation;
            li.append(s, tr);
            list.append(li);
          }
        }
        lesson.append(list);
      }
      document.getElementById('btn-rerender').addEventListener('click', renderLesson);
      async function post(path, body) {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        out.textContent = JSON.stringify(data).slice(0, 120);
        last = data;
        renderLesson();
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


/**
 * Tiny Lesson form as the live page renders it (verified 2026-10-22/23): a react-select language picker
 * (lll-select__* classes, role=combobox input, role=option DIVs that appear on mousedown on the control),
 * the purpose input (no form, no type, no maxLength) and Generate, enabled once both are set.
 * Generate posts the terms request, so a one-tap scenario ends in a real capture.
 */
const SCENARIO_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mock Tiny Lesson</title>
  </head>
  <body>
    <main>
      <div class="lll-select-container" id="picker">
        <div class="lll-select__control" id="control">
          <div class="lll-select__value-container" id="value-box">
            <div class="lll-select__placeholder">Select...</div>
            <div class="lll-select__input-container"><input role="combobox" aria-label="Select Language" aria-expanded="false" /></div>
          </div>
        </div>
      </div>
      <div><input id="purpose" placeholder="going on a first date" /></div>
      <button id="generate" type="button" disabled>Generate</button>
      <pre id="state"></pre>
    </main>
    <script>
      const OPTIONS = ['Arabic', 'English (US)', 'French (France)', 'Japanese', 'Spanish (Spain)', 'Turkish'];
      const LANG_API = { 'Spanish (Spain)': 'European Spanish', 'Arabic': 'Arabic' };
      let language = '';
      let purpose = '';
      const control = document.getElementById('control');
      const box = document.getElementById('value-box');
      const inputBox = box.querySelector('.lll-select__input-container');
      const gen = document.getElementById('generate');
      const state = document.getElementById('state');
      window.__generated = [];
      function renderValue() {
        const v = document.createElement('div');
        v.className = language ? 'lll-select__single-value' : 'lll-select__placeholder';
        v.textContent = language || 'Select...';
        box.replaceChildren(v, inputBox);
      }
      function update() {
        gen.disabled = !(language && purpose.trim());
        state.textContent = JSON.stringify({ language, purpose });
      }
      let menu = null;
      control.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (menu) { menu.remove(); menu = null; return; }
        menu = document.createElement('div');
        menu.className = 'lll-select__menu';
        const list = document.createElement('div');
        list.setAttribute('role', 'listbox');
        for (const label of OPTIONS) {
          const o = document.createElement('div');
          o.setAttribute('role', 'option');
          o.className = 'lll-select__option';
          o.textContent = label;
          o.addEventListener('click', () => {
            language = label;
            menu.remove();
            menu = null;
            renderValue();
            update();
          });
          list.append(o);
        }
        menu.append(list);
        setTimeout(() => menu && document.getElementById('picker').append(menu), 20);
      });
      // React-controlled input: React keeps its own value tracker and only reacts to real input events.
      const purposeEl = document.getElementById('purpose');
      purposeEl.addEventListener('input', () => {
        purpose = purposeEl.value;
        setTimeout(update, 30); // React re-renders a moment later
      });
      gen.addEventListener('click', async () => {
        if (gen.disabled) return;
        window.__generated.push(language + '|' + purpose);
        await fetch('/lll/api/insights/terms', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sourceLanguage: 'English', targetLanguage: LANG_API[language] || language, purpose }),
        });
      });
      renderValue();
      update();
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
    res.end(url.includes('scenario=1') ? SCENARIO_HTML : PAGE_HTML);
  });

  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const { port } = srv.address() as AddressInfo;
  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve, reject) => srv.close((err) => (err ? reject(err) : resolve()))),
  };
}
