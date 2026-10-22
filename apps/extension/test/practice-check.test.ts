import { describe, expect, it } from 'vitest';
import {
  checkTyped,
  damerauLevenshtein,
  expectedVariants,
  normalizeAnswer,
  ratingForResult,
} from '../src/lib/practice/check';
import { mulberry32, shuffle } from '../src/lib/practice/rng';

describe('rng', () => {
  it('mulberry32 is deterministic per seed and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 50 }, () => a());
    const ys = Array.from({ length: 50 }, () => b());
    expect(xs).toEqual(ys);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    const c = mulberry32(43);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(xs.slice(0, 5));
  });
  it('shuffle is a deterministic permutation and does not mutate', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = shuffle(arr, mulberry32(7));
    const s2 = shuffle(arr, mulberry32(7));
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('damerauLevenshtein', () => {
  it('counts insert/delete/substitute/transpose as 1', () => {
    expect(damerauLevenshtein('cerveza', 'cerveza')).toBe(0);
    expect(damerauLevenshtein('cerveza', 'cerveze')).toBe(1);
    expect(damerauLevenshtein('cerveza', 'cerevza')).toBe(1);
    expect(damerauLevenshtein('cerveza', 'cervez')).toBe(1);
    expect(damerauLevenshtein('cerveza', 'cervezaa')).toBe(1);
    expect(damerauLevenshtein('cerveza', 'cebveze')).toBe(2);
  });
});

describe('normalizeAnswer', () => {
  it('strips Spanish accents, punctuation and case', () => {
    expect(normalizeAnswer('¿Dónde está el baño?', 'es-ES')).toBe('donde esta el bano');
    expect(normalizeAnswer('  ¡Hola,   amigo!  ', 'es-ES')).toBe('hola amigo');
    expect(normalizeAnswer('«Ça va»', 'fr-FR')).toBe('ca va');
    expect(normalizeAnswer('“Quote” ‘x’', 'en-US')).toBe('quote x');
  });
  it('uses Turkish case folding', () => {
    expect(normalizeAnswer('İstanbul', 'tr-TR')).toBe('istanbul');
    expect(normalizeAnswer('IŞIK', 'tr')).toBe('ısık');
  });
  it('normalizes Arabic harakat, tatweel, alef variants, ya and ta marbuta', () => {
    expect(normalizeAnswer('مَدْرَسَةٌ', 'ar')).toBe(normalizeAnswer('مدرسه', 'ar'));
    expect(normalizeAnswer('كـتـاب', 'ar')).toBe('كتاب');
    expect(normalizeAnswer('أنا', 'ar')).toBe('انا');
    expect(normalizeAnswer('إلى', 'ar')).toBe('الي');
    expect(normalizeAnswer('آسف', 'ar')).toBe('اسف');
  });
  it('maps Japanese katakana to hiragana and keeps dakuten', () => {
    expect(normalizeAnswer('コーヒー', 'ja')).toBe(normalizeAnswer('こーひー', 'ja'));
    expect(normalizeAnswer('ｺｰﾋｰ', 'ja')).toBe(normalizeAnswer('こーひー', 'ja'));
    expect(normalizeAnswer('が', 'ja')).not.toBe(normalizeAnswer('か', 'ja'));
  });
  it('keeps Hindi vowel signs and Korean syllables', () => {
    expect(normalizeAnswer('काम', 'hi')).not.toBe(normalizeAnswer('कम', 'hi'));
    expect(normalizeAnswer('감사합니다', 'ko')).toBe('감사합니다');
  });
});

describe('checkTyped', () => {
  it('Spanish: accents, case and punctuation tolerated', () => {
    expect(checkTyped('donde esta el bano', '¿Dónde está el baño?', 'es-ES')).toBe('correct');
    expect(checkTyped('CAFÉ', 'café', 'es-ES')).toBe('correct');
    expect(checkTyped('cafe', 'café', 'es-ES')).toBe('correct');
  });
  it('does not accept wrong words', () => {
    expect(checkTyped('casa', 'cosa', 'es-ES')).toBe('wrong');
    expect(checkTyped('perro', 'pero', 'es-ES')).toBe('wrong');
    expect(checkTyped('gato', 'perro', 'es-ES')).toBe('wrong');
    expect(checkTyped('el', 'el camarero', 'es-ES')).toBe('wrong');
  });
  it('almost = exactly one edit for expected length >= 6', () => {
    expect(checkTyped('cerbeza', 'cerveza', 'es-ES')).toBe('almost');
    expect(checkTyped('cerevza', 'cerveza', 'es-ES')).toBe('almost');
    expect(checkTyped('cebveze', 'cerveza', 'es-ES')).toBe('wrong');
    expect(checkTyped('playz', 'playa', 'es-ES')).toBe('wrong'); // length 5
    expect(checkTyped('amigo', 'amigos', 'es-ES')).toBe('almost'); // length 6
  });
  it('empty input is wrong', () => {
    expect(checkTyped('', 'hola', 'es-ES')).toBe('wrong');
    expect(checkTyped('   ', 'hola', 'es-ES')).toBe('wrong');
    expect(checkTyped('¿?', 'hola', 'es-ES')).toBe('wrong');
  });
  it('gendered pairs accept either side and strip (m)/(f) markers', () => {
    const t = 'el camarero (m) / la camarera (f)';
    expect(expectedVariants(t)).toEqual(['el camarero', 'la camarera']);
    expect(checkTyped('el camarero', t, 'es-ES')).toBe('correct');
    expect(checkTyped('La camarera', t, 'es-ES')).toBe('correct');
    expect(checkTyped('el camarera', t, 'es-ES')).toBe('almost');
    expect(checkTyped('el cocinero', t, 'es-ES')).toBe('wrong');
  });
  it('Turkish dotted/dotless i', () => {
    expect(checkTyped('istanbul', 'İstanbul', 'tr')).toBe('correct');
    expect(checkTyped('İSTANBUL', 'istanbul', 'tr-TR')).toBe('correct');
    expect(checkTyped('ısık', 'ışık', 'tr')).toBe('correct');
    expect(checkTyped('kız', 'kız', 'tr')).toBe('correct');
    expect(checkTyped('kiz', 'kız', 'tr')).toBe('wrong');
  });
  it('Arabic: harakat-free and alef-variant input accepted, other words not', () => {
    expect(checkTyped('مدرسة', 'مَدْرَسَةٌ', 'ar')).toBe('correct');
    expect(checkTyped('انا', 'أنا', 'ar')).toBe('correct');
    expect(checkTyped('كتاب', 'كِتَاب', 'ar')).toBe('correct');
    expect(checkTyped('كلب', 'كتاب', 'ar')).toBe('wrong');
  });
  it('Japanese: katakana vs hiragana accepted; kanji vs kana not; dakuten matter', () => {
    expect(checkTyped('こーひー', 'コーヒー', 'ja')).toBe('correct');
    expect(checkTyped('コーヒー', 'こーひー', 'ja-JP')).toBe('correct');
    expect(checkTyped('みず', '水', 'ja')).toBe('wrong');
    expect(checkTyped('かき', 'かぎ', 'ja')).toBe('wrong');
    expect(checkTyped('ありがとう。', 'ありがとう', 'ja')).toBe('correct');
  });
  it('Chinese: exact characters only (punctuation/fullwidth tolerated)', () => {
    expect(checkTyped('你好', '你好', 'zh-CN')).toBe('correct');
    expect(checkTyped('你好！', '你好', 'zh-CN')).toBe('correct');
    expect(checkTyped('您好', '你好', 'zh-CN')).toBe('wrong');
    expect(checkTyped('谢谢', '你好', 'zh-CN')).toBe('wrong');
  });
  it('Korean: NFC compare', () => {
    expect(checkTyped('감사합니다', '감사합니다', 'ko')).toBe('correct');
    expect(checkTyped('감사합니다'.normalize('NFD'), '감사합니다', 'ko')).toBe('correct');
    expect(checkTyped('감사함니다', '감사합니다', 'ko')).toBe('wrong'); // 5 syllables: no typo tolerance
    expect(checkTyped('만나서 반갑슴니다', '만나서 반갑습니다', 'ko')).toBe('almost');
    expect(checkTyped('고마워', '감사합니다', 'ko')).toBe('wrong');
  });
  it('German ß and invalid locale tags do not throw', () => {
    expect(checkTyped('strasse', 'Straße', 'de')).toBe('correct');
    expect(checkTyped('hola', 'hola', 'not a locale!!')).toBe('correct');
  });
  it('maps results to FSRS ratings', () => {
    expect(ratingForResult('correct')).toBe(3);
    expect(ratingForResult('almost')).toBe(2);
    expect(ratingForResult('wrong')).toBe(1);
  });
});
