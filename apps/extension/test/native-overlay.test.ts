// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NATIVE_ATTR, createNativeOverlay, type NativeOverlay } from '../src/content/native-overlay';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Markup shaped like the LLL Tiny Lesson result: cards with a term, a speaker button and the meaning. */
function lllCards(): string {
  return `
    <main>
      <h2>Spanish for ordering coffee</h2>
      <div role="tablist"><button>Vocabulary</button><button>Phrases</button></div>
      <ul class="cards">
        <li class="card"><div class="term">el café</div><button aria-label="Play">🔊</button><div class="meaning">coffee</div></li>
        <li class="card"><div class="term">la leche</div><button aria-label="Play">🔊</button><div class="meaning">milk</div></li>
        <li class="card"><div class="term">el camarero (m)
la camarera (f)</div><div class="meaning"><span>waiter/waitress</span></div></li>
        <li class="card"><div class="term">el azúcar</div></li>
      </ul>
      <section class="grammar">
        <p class="sentence">Querría un café con leche, por favor.</p>
        <p class="translation">I would like a coffee with milk, please.</p>
      </section>
      <input value="coffee" />
    </main>`;
}

let overlay: NativeOverlay | undefined;

beforeEach(() => {
  document.body.innerHTML = lllCards();
});
afterEach(() => {
  overlay?.destroy();
  overlay = undefined;
  document.body.innerHTML = '';
});

const spans = () => [...document.querySelectorAll<HTMLElement>(`[${NATIVE_ATTR}]`)];
const entries = [
  { term: 'el café', meaning: 'coffee', native: 'kahve' },
  { term: 'la leche', meaning: 'milk', native: 'süt' },
  { term: 'el camarero (m) / la camarera (f)', meaning: 'waiter/waitress', native: 'garson' },
  { term: 'el azúcar', meaning: 'sugar', native: 'şeker' },
];

describe('native overlay', () => {
  it('adds one small native line under each matching meaning, never changing LLL text', () => {
    overlay = createNativeOverlay(document, { lang: 'tr', debounceMs: 10 });
    overlay.add(entries);
    const s = spans();
    expect(s.map((x) => x.textContent)).toEqual(['kahve', 'süt', 'garson', 'şeker']);
    for (const x of s) {
      expect(x.tagName).toBe('SPAN');
      expect(x.getAttribute('lang')).toBe('tr');
      expect(x.getAttribute('dir')).toBe('auto');
      expect(x.className).toBe('langcoach-native');
      expect(x.style.fontSize).not.toBe('');
    }
    // placed right after the meaning element (sibling), LLL's own nodes keep their text
    const meaning = document.querySelector('.card .meaning')!;
    expect(meaning.textContent).toBe('coffee');
    expect(meaning.nextElementSibling?.textContent).toBe('kahve');
    // a card without a meaning element falls back to the term
    expect(document.querySelectorAll('.card')[3]!.querySelector('.term')!.nextElementSibling?.textContent).toBe('şeker');
    // form fields are never touched
    expect(document.querySelector('input')!.nextElementSibling).toBeNull();
  });

  it('is idempotent and updates an existing line instead of duplicating it', () => {
    overlay = createNativeOverlay(document, { lang: 'tr', debounceMs: 10 });
    overlay.add(entries);
    overlay.add(entries);
    expect(spans()).toHaveLength(4);
    overlay.add([{ term: 'el café', meaning: 'coffee', native: 'kahve (içecek)' }]);
    expect(spans()).toHaveLength(4);
    expect(document.querySelector('.card .meaning')!.nextElementSibling?.textContent).toBe('kahve (içecek)');
  });

  it('translates grammar example translations', () => {
    overlay = createNativeOverlay(document, { lang: 'tr', debounceMs: 10 });
    overlay.add([{ meaning: 'I would like a coffee with milk, please.', native: 'Sütlü kahve rica ederim.' }]);
    expect(document.querySelector('.grammar .translation')!.nextElementSibling?.textContent).toBe('Sütlü kahve rica ederim.');
    expect(document.querySelector('.grammar .sentence')!.nextElementSibling?.className).toBe('translation');
  });

  it('re-applies after LLL re-renders the cards (debounced MutationObserver)', async () => {
    overlay = createNativeOverlay(document, { lang: 'tr', debounceMs: 10 });
    overlay.add(entries);
    document.querySelector('ul.cards')!.outerHTML = `<ul class="cards">
      <li class="card"><div class="term">la leche</div><div class="meaning">milk</div></li>
      <li class="card"><div class="term">el café</div><div class="meaning">coffee</div></li></ul>`;
    expect(spans().length).toBeLessThan(3);
    await wait(40);
    expect(spans().map((x) => x.textContent)).toEqual(['süt', 'kahve']);
  });

  it('removes a stale line when LLL changes the text next to it', async () => {
    overlay = createNativeOverlay(document, { lang: 'tr', debounceMs: 10 });
    overlay.add(entries);
    document.querySelector('.card')!.textContent = 'tea';
    await wait(40);
    expect(spans().map((x) => x.textContent)).not.toContain('kahve');
  });

  it('does nothing when no LLL structure matches', () => {
    document.body.innerHTML = '<main><p>Nothing here</p></main>';
    overlay = createNativeOverlay(document, { lang: 'tr', debounceMs: 10 });
    overlay.add(entries);
    expect(spans()).toHaveLength(0);
    expect(document.body.innerHTML).toBe('<main><p>Nothing here</p></main>');
  });

  it('turns off (removes every line) and back on', async () => {
    overlay = createNativeOverlay(document, { lang: 'tr', debounceMs: 10 });
    overlay.add(entries);
    overlay.setEnabled(false);
    expect(spans()).toHaveLength(0);
    document.querySelector('ul.cards')!.innerHTML += '';
    await wait(40);
    expect(spans()).toHaveLength(0);
    overlay.setEnabled(true);
    expect(spans()).toHaveLength(4);
  });

  it('ignores entries without native text and never throws on odd input', () => {
    overlay = createNativeOverlay(document, { lang: 'tr', debounceMs: 10 });
    expect(() =>
      overlay!.add([
        { meaning: 'coffee', native: '' },
        { meaning: '', native: 'x' },
        null as never,
        { meaning: 5 as never, native: 'y' },
      ]),
    ).not.toThrow();
    expect(spans()).toHaveLength(0);
  });

  it('destroy stops observing and removes the lines', async () => {
    overlay = createNativeOverlay(document, { lang: 'tr', debounceMs: 10 });
    overlay.add(entries);
    overlay.destroy();
    expect(spans()).toHaveLength(0);
    document.body.innerHTML = lllCards();
    await wait(40);
    expect(spans()).toHaveLength(0);
  });
});
