import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveLocale, strings, type UiLang } from '../src/dashboard/i18n.js';

describe('resolveLocale', () => {
  it.each([
    ['Turkish', 'tr', 'tr'],
    ['türkçe', 'tr', 'tr'],
    ['TR', 'tr', 'tr'],
    ['tr-TR', 'tr', 'tr-TR'],
    ['Portuguese (Brazil)', 'pt-BR', 'pt'],
    ['pt', 'pt-BR', 'pt'],
    ['Japanese', 'en', 'ja'],
    ['Klingon', 'en', 'en'],
    ['', 'en', 'en'],
    [undefined, 'en', 'en'],
    ['Español', 'es', 'es'],
    ['Português', 'pt-BR', 'pt'],
    ['Deutsch', 'en', 'de'],
  ])('%s', (input, ui, locale) => {
    expect(resolveLocale(input)).toEqual({ ui, locale });
  });
});

describe('strings', () => {
  const langs: [UiLang, string][] = [['en', 'en'], ['tr', 'tr'], ['es', 'es'], ['fr', 'fr'], ['pt-BR', 'pt_BR']];
  it.each(langs)('%s has the same keys as en and extension level names', (ui, dir) => {
    const s = strings(ui) as Record<string, string>;
    expect(Object.keys(s).sort()).toEqual(Object.keys(strings('en')).sort());
    const m = JSON.parse(readFileSync(new URL(`../../../apps/extension/public/_locales/${dir}/messages.json`, import.meta.url), 'utf8'));
    const pairs: [string, string][] = [['task_tiny_lesson', 'taskTinyLesson'], ['task_slang_hang', 'taskSlangHang'], ['task_word_cam', 'taskWordCam'], ['task_review', 'taskReview'], ['task_quiz', 'taskQuiz']];
    for (const a of ['first_lesson', 'streak_3', 'streak_7', 'streak_30', 'cards_50', 'cards_100', 'cards_500', 'reviews_100', 'perfect_session', 'xp_100_day', 'sessions_10', 'first_match']) pairs.push([`ach_${a}`, `ach_${a}`]);
    for (const [k, mk] of pairs) expect(s[k]).toBe(m[mk].message);
    for (let i = 1; i <= 10; i++) expect(s[`level${i}`]).toBe(m[`level${i}`].message);
  });
});
