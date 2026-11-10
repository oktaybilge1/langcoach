// Fabricated demo learner for README screenshots: Turkish native, Spanish A2, 5-day streak.
// Deterministic: fixed date and a seeded random generator, no real people or places beyond the lesson topics.

/** Midday UTC, so the local date is 2026-11-10 in every time zone from UTC-11 to UTC+11. */
export const DEMO_NOW = new Date('2026-11-10T12:00:00Z');

const DAY = 86_400_000;
const at = (offsetDays, hour = 12) => new Date(DEMO_NOW.getTime() + offsetDays * DAY + (hour - 12) * 3_600_000).toISOString();
const date = (offsetDays) => at(offsetDays).slice(0, 10);

/** Each lesson: day offset, kind, situation [en, tr], items "es|en|tr". */
const LESSONS = [
  { day: -7, kind: 'tiny_lesson', situation: ['Ordering at a café', 'Kafede sipariş vermek'], items: [
    'café con leche|coffee with milk|sütlü kahve', 'la cuenta|the bill|hesap', 'para llevar|to go|paket',
    'un vaso de agua|a glass of water|bir bardak su', 'la tostada|toast|kızarmış ekmek', 'el zumo de naranja|orange juice|portakal suyu',
    '¿me pone…?|could I have…?|… alabilir miyim?', 'sin azúcar|without sugar|şekersiz', 'la propina|the tip|bahşiş',
    'la mesa|the table|masa', 'el camarero|the waiter|garson', 'la carta|the menu|menü',
    'pagar con tarjeta|to pay by card|kartla ödemek', 'el bocadillo|sandwich|sandviç', '¿algo más?|anything else?|başka bir şey?'] },
  { day: -4, kind: 'tiny_lesson', situation: ['Asking for directions', 'Yol sormak'], items: [
    'a la derecha|on the right|sağda', 'a la izquierda|on the left|solda', 'todo recto|straight ahead|dümdüz',
    'la esquina|the corner|köşe', 'cerca de|near|yakınında', 'lejos|far|uzak',
    'el semáforo|traffic light|trafik ışığı', 'la parada de autobús|bus stop|otobüs durağı', 'cruzar la calle|to cross the street|caddeyi geçmek',
    '¿dónde está…?|where is…?|… nerede?', 'la plaza|the square|meydan', 'el metro|the metro|metro',
    'perdone|excuse me|affedersiniz', 'la estación|the station|istasyon', 'a cinco minutos|five minutes away|beş dakika uzakta'] },
  { day: -3, kind: 'tiny_lesson', situation: ['Shopping at the market', 'Pazarda alışveriş'], items: [
    'un kilo de|a kilo of|bir kilo', 'las manzanas|apples|elmalar', 'los tomates|tomatoes|domatesler',
    '¿cuánto cuesta?|how much is it?|ne kadar?', 'barato|cheap|ucuz', 'caro|expensive|pahalı',
    'la bolsa|the bag|poşet', 'el queso|cheese|peynir', 'el pan|bread|ekmek',
    'maduro|ripe|olgun', 'medio kilo|half a kilo|yarım kilo', 'las fresas|strawberries|çilekler',
    'la frutería|fruit shop|manav', 'el cambio|change|para üstü', '¿me da…?|can I have…?|… verir misiniz?'] },
  { day: -2, kind: 'tiny_lesson', situation: ['Checking in at a hotel', 'Otele giriş yapmak'], items: [
    'la reserva|the booking|rezervasyon', 'la habitación doble|double room|çift kişilik oda', 'la llave|the key|anahtar',
    'el desayuno|breakfast|kahvaltı', 'la recepción|reception|resepsiyon', 'el ascensor|the lift|asansör',
    'la toalla|towel|havlu', 'el pasaporte|passport|pasaport', 'dos noches|two nights|iki gece',
    'la salida|check-out|çıkış', '¿a qué hora?|at what time?|saat kaçta?', 'la planta|the floor|kat',
    'el aire acondicionado|air conditioning|klima', 'la contraseña del wifi|wifi password|wifi şifresi', 'incluido|included|dahil'] },
  { day: -1, kind: 'slang_hang', situation: ['Small talk with neighbours', 'Komşularla sohbet'], items: [
    '¿qué tal?|how is it going?|nasılsın?', '¡qué guay!|how cool!|ne güzel!', 'vale|okay|tamam',
    'tío|mate|kanka', '¿de dónde eres?|where are you from?|nerelisin?', 'soy de Turquía|I am from Turkey|Türkiyeliyim',
    '¡qué calor!|it is so hot!|ne sıcak!', 'el fin de semana|the weekend|hafta sonu', 'me encanta|I love it|bayılıyorum',
    '¡nos vemos!|see you!|görüşürüz!', '¿qué haces?|what are you up to?|ne yapıyorsun?', 'un rato|a while|biraz',
    '¡anda!|no way!|hadi canım!', 'quedar|to meet up|buluşmak', '¡qué pena!|what a pity!|ne yazık!'] },
  { day: 0, kind: 'tiny_lesson', situation: ['At the pharmacy', 'Eczanede'], items: [
    'me duele la cabeza|I have a headache|başım ağrıyor', 'la receta|the prescription|reçete', 'las pastillas|pills|haplar',
    'la tos|cough|öksürük', 'la fiebre|fever|ateş', 'el jarabe|syrup|şurup',
    'tres veces al día|three times a day|günde üç kez', 'la alergia|allergy|alerji', 'la tirita|plaster|yara bandı',
    'estoy resfriado|I have a cold|soğuk algınlığım var', 'la crema solar|sunscreen|güneş kremi', 'después de comer|after eating|yemekten sonra',
    '¿necesito receta?|do I need a prescription?|reçete gerekir mi?', 'el dolor|pain|ağrı', 'mejorarse|to get better|iyileşmek'] },
];

/** mulberry32: tiny seeded PRNG so every run makes the same deck. */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function srsFor(age, i, rand) {
  const base = { difficulty: 5, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, lapses: 0 };
  if (age === 0) {
    // Today's lesson: ten brand-new words due now, the rest seen once.
    return i < 10
      ? { ...base, due: at(0, 10), stability: 0, reps: 0, state: 0 }
      : { ...base, due: at(1, 9), stability: 0.5, reps: 1, state: 1, last_review: at(0, 11) };
  }
  const r = rand();
  const stability = Math.round((1 + age * (1.5 + rand() * 4)) * 10) / 10;
  const dueIn = rand() < 0.1 ? -1 : 1 + Math.floor(rand() * 7);
  return {
    ...base,
    due: at(dueIn, 9),
    stability,
    reps: 1 + Math.floor(age / 2) + Math.floor(rand() * 2),
    lapses: r < 0.15 ? 1 : 0,
    state: r < 0.15 ? 3 : 2,
    scheduled_days: Math.max(1, dueIn),
    last_review: at(-1 - Math.floor(rand() * Math.min(age, 3)), 18),
  };
}

/** Demo state; `lang` picks the learner's native language (and so the dashboard language). */
export function demoState(lang = 'tr') {
  const L = lang === 'tr' ? 1 : 0;
  const rand = rng(46);
  const lessons = [];
  const cards = [];
  LESSONS.forEach((l, li) => {
    const id = `demo-lesson-${li + 1}`;
    const items = l.items.map((s) => {
      const [term, en, tr] = s.split('|');
      return { term, translation: L ? tr : en, example: '' };
    });
    lessons.push({
      id, kind: l.kind, situation: l.situation[L], items, createdAt: at(l.day, 17), origin: 'bridge', externalId: id,
      source: { app: 'lll', targetLanguage: 'es-ES', sourceLanguage: L ? 'tr' : 'en', purpose: l.situation[L] },
    });
    items.forEach((it, i) => {
      cards.push({ id: `demo-card-${cards.length + 1}`, lessonId: id, term: it.term, translation: it.translation, example: '', srs: srsFor(-l.day, i, rand) });
    });
  });

  // Week 2026-W46 (Mon 9 Nov): five study days.
  const task = (n, off, type, minutes, done) => ({
    id: `demo-task-${n}`, date: date(off), type, minutes, status: done ? 'done' : 'todo', ...(done ? { completedAt: at(off, 18) } : {}),
  });
  const tasks = [
    task(1, -1, 'slang_hang', 10, true), task(2, -1, 'review', 5, true),
    task(3, 0, 'tiny_lesson', 10, true), task(4, 0, 'review', 5, false),
    task(5, 1, 'quiz', 10, false), task(6, 1, 'review', 5, false),
    task(7, 2, 'tiny_lesson', 10, false),
    task(8, 4, 'word_cam', 10, false), task(9, 4, 'review', 5, false),
  ];

  // XP log: one day on 3 Nov, then 6–10 Nov in a row (5-day streak).
  const log = [];
  const xp = (off, taskId, type, amount, hour = 18) => log.push({ at: at(off, hour), date: date(off), taskId, type, xp: amount });
  xp(-7, 'demo-old-1', 'tiny_lesson', 20);
  xp(-7, 'demo-old-2', 'review', 14, 19);
  xp(-4, 'demo-old-3', 'tiny_lesson', 20);
  xp(-3, 'demo-old-4', 'tiny_lesson', 20);
  xp(-3, 'demo-old-5', 'review', 22, 20);
  xp(-2, 'demo-old-6', 'tiny_lesson', 20);
  xp(-1, 'demo-task-1', 'slang_hang', 20);
  xp(-1, 'demo-task-2', 'review', 18, 19);
  xp(0, 'demo-task-3', 'tiny_lesson', 20, 17);

  const sessions = [];
  const session = (n, off, exercises, correct, matchGames = 0) => {
    const id = `demo-session-${n}`;
    const perfect = correct === exercises;
    const gained = correct + (perfect ? 10 : 5);
    sessions.push({ id, at: at(off, 21), date: date(off), exercises, correct, xp: gained, perfect, matchGames });
    xp(off, `practice:${id}`, 'review', gained, 21);
  };
  session(1, -4, 8, 6);
  session(2, -3, 8, 8);
  session(3, -2, 10, 7, 1);
  session(4, -1, 8, 7);
  session(5, 0, 6, 5);

  return {
    version: 1,
    profile: {
      nativeLanguage: L ? 'Turkish' : 'English', targetLanguage: 'Spanish', level: 'A2',
      goal: L ? 'Aralık’taki Madrid gezisi' : 'A trip to Madrid in December',
      minutesPerDay: 15, daysPerWeek: 5, dailyGoalXp: 30, createdAt: at(-7, 16),
    },
    plans: { '2026-W46': { week: '2026-W46', theme: L ? 'Madrid’de günlük hayat' : 'Everyday life in Madrid', tasks } },
    lessons, cards, log, sessions, streakFreezes: 1,
  };
}
