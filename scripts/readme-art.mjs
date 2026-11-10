// README art in the sticker-notebook look (packages/core/src/theme.ts).
// Writes docs/media/hero{,.tr}.svg, features{,.tr}.svg, h-*.svg and social-preview.png (1280×640).
// Usage: node scripts/readme-art.mjs. SVGs are inline CSS only (GitHub strips scripts and external fonts).
import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const media = fileURLToPath(new URL('../docs/media/', import.meta.url));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SANS = 'ui-sans-serif, system-ui, -apple-system, &quot;Segoe UI&quot;, Roboto, sans-serif';
const SERIF = 'Georgia, &quot;Times New Roman&quot;, serif';
const EMOJI = '&quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;, &quot;Noto Color Emoji&quot;, sans-serif';
const INK = '#292524', MUTED = '#6b5d4f', PAPER = '#faf7f2', RULE = '#efe7da', EDGE = '#eadfcd', DESK = '#2f4a3f';
// Every animation ends where the static picture is, so reduced motion just switches animations off.
const REDUCED = '@media (prefers-reduced-motion: reduce) { *, *::before { animation: none !important; } }';

const deskDefs = `
    <pattern id="grain" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".7" fill="#ffffff" opacity=".05"/></pattern>
    <pattern id="tapeA" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#fb923c"/><rect width="4" height="10" fill="#fdba74"/></pattern>
    <pattern id="tapeB" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#86efac"/><circle cx="4" cy="4" r="1.6" fill="#dcfce7"/></pattern>
    <linearGradient id="xp" x1="0" x2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#facc15"/></linearGradient>
    <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#facc15"/></linearGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".28"/></filter>`;

const desk = (w, h) => `
  <rect width="${w}" height="${h}" rx="28" fill="${DESK}"/>
  <rect width="${w}" height="${h}" rx="28" fill="url(#grain)"/>
  <rect x="14" y="14" width="${w - 28}" height="${h - 28}" rx="18" fill="none" stroke="#f5efe4" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="7 6"/>`;

const sticker = ({ x, y, rot, w, h, fill, text, size = 22, cls = '', serif = true, color = INK }) => `
  <g transform="translate(${x},${y}) rotate(${rot})"><g class="pop ${cls}">
    <rect x="${-w / 2 - 6}" y="${-h / 2 - 6}" width="${w + 12}" height="${h + 12}" rx="${h / 2 + 6}" fill="#fff" filter="url(#drop)"/>
    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>
    <text y="${size * 0.36}" text-anchor="middle" font-size="${size}" font-weight="700" fill="${color}"${serif ? ' class="serif"' : ''}>${esc(text)}</text>
  </g></g>`;

function hero(t) {
  const W = 1200, H = 600;
  const typed = [...t.chat].length;
  const words = t.words.map(([es, gloss, chip], i) => {
    const y = 404 + i * 40;
    const [bg, fg] = chip === t.learned ? ['#dcfce7', '#166534'] : ['#ffe4e6', '#9f1239'];
    const cw = chip.length * 8.4 + 24;
    return `
    <text x="160" y="${y}" font-size="19"><tspan font-weight="700">${esc(es)}</tspan><tspan dx="10" fill="${MUTED}">${esc(gloss)}</tspan></text>
    <rect x="${560 - cw}" y="${y - 18}" width="${cw}" height="24" rx="12" fill="${bg}"/>
    <text x="${560 - cw / 2}" y="${y - 1}" font-size="13" font-weight="700" fill="${fg}" text-anchor="middle">${esc(chip)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(t.aria)}">
  <defs>${deskDefs}
    <pattern id="rules" width="10" height="32" patternUnits="userSpaceOnUse" y="6"><rect width="10" height="32" fill="${PAPER}"/><rect y="31" width="10" height="1" fill="${RULE}"/></pattern>
    <linearGradient id="spine" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <clipPath id="bubble"><rect x="652" y="122" width="406" height="66" rx="12"/></clipPath>
    <style>
      text { font-family: ${SANS}; fill: ${INK}; }
      .serif { font-family: ${SERIF}; font-style: italic; }
      .emoji { font-family: ${EMOJI}; }
      .swoosh { stroke-dasharray: 420; animation: draw 1s .3s ease-out both; }
      @keyframes draw { from { stroke-dashoffset: 420 } to { stroke-dashoffset: 0 } }
      .typer { transform: translateX(400px); animation: type ${(typed * 0.07).toFixed(2)}s 1s steps(${typed}) both; }
      @keyframes type { from { transform: none } to { transform: translateX(400px) } }
      .caret { opacity: 0; animation: caret ${(typed * 0.07 + 0.6).toFixed(2)}s 1s steps(1) both; }
      @keyframes caret { 0%,20%,40%,60%,80% { opacity: 1 } 10%,30%,50%,70%,90%,100% { opacity: 0 } }
      .flicker { transform-box: fill-box; transform-origin: 50% 100%; animation: flick 1.6s ease-in-out infinite; }
      @keyframes flick { 0%,100% { transform: none } 40% { transform: scale(1.06,1.13) rotate(-2deg) } 70% { transform: scale(.97,1.04) rotate(2deg) } }
      .bar { transform-box: fill-box; transform-origin: 0 50%; animation: fill 1.4s 2.5s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes fill { from { transform: scaleX(0) } to { transform: none } }
      .pop { transform-box: fill-box; transform-origin: center; animation: pop .55s cubic-bezier(.3,1.6,.5,1) both; }
      @keyframes pop { from { opacity: 0; transform: scale(.3) rotate(-18deg) } to { opacity: 1; transform: none } }
      .s1 { animation-delay: 3.1s } .s2 { animation-delay: 3.4s } .s3 { animation-delay: 3.7s } .s4 { animation-delay: 4s }
      ${REDUCED}
    </style>
  </defs>
  ${desk(W, H)}

  <!-- open notebook -->
  <rect x="96" y="76" width="1008" height="468" rx="12" fill="#000" opacity=".3" transform="translate(0,8)"/>
  <rect x="90" y="70" width="1020" height="468" rx="12" fill="#e9dfcf"/>
  <rect x="96" y="66" width="1008" height="468" rx="10" fill="url(#rules)"/>
  <rect x="146" y="66" width="1.5" height="468" fill="#f3c7c7"/>
  <rect x="560" y="66" width="80" height="468" fill="url(#spine)"/>
  <rect x="599.5" y="66" width="1" height="468" fill="#d9ccb8"/>

  <!-- washi tape -->
  <rect x="70" y="52" width="150" height="34" fill="url(#tapeA)" opacity=".85" transform="rotate(-14 145 69)"/>
  <rect x="990" y="50" width="140" height="32" fill="url(#tapeB)" opacity=".85" transform="rotate(12 1060 66)"/>

  <!-- left page: wordmark, tagline, words -->
  <text x="156" y="206" font-size="70" font-weight="700" class="serif" letter-spacing="-1">LangCoach</text>
  <path class="swoosh" d="M164 230 C 260 218, 380 216, 520 224 C 450 228, 370 234, 296 246" fill="none" stroke="#fb923c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="160" y="300" font-size="25" class="serif" fill="${MUTED}">${esc(t.tag1)}</text>
  <text x="160" y="332" font-size="25" class="serif" fill="${MUTED}">${esc(t.tag2)}</text>
  ${words}

  <!-- right page: chat line, tiles, XP bar -->
  <rect x="650" y="123" width="410" height="70" rx="14" fill="${EDGE}"/>
  <rect x="650" y="120" width="410" height="70" rx="14" fill="#fff" stroke="${EDGE}"/>
  <path d="M676 190 l-8 16 l24 -16 z" fill="#fff" stroke="${EDGE}"/>
  <rect x="670" y="186" width="30" height="6" fill="#fff"/>
  <text x="676" y="166" font-size="27" font-weight="700">${esc(t.chat).replace('🔥', '<tspan class="emoji" font-size="25">🔥</tspan>')}</text>
  <g clip-path="url(#bubble)"><g class="typer">
    <rect x="672" y="124" width="420" height="62" fill="#fff"/>
    <rect class="caret" x="674" y="140" width="3" height="32" fill="#c2410c"/>
  </g></g>

  <rect x="650" y="233" width="196" height="126" rx="14" fill="${EDGE}"/>
  <rect x="650" y="230" width="196" height="126" rx="14" fill="#fff1e0" stroke="${EDGE}"/>
  <path class="flicker" d="M694 262 c-20 20 -29 38 -18 58 c9 14 31 14 40 0 c9 -14 3 -29 -6 -38 c0 11 -5 18 -11 18 c6 -14 0 -27 -5 -38 z" fill="url(#flame)"/>
  <text x="742" y="300" font-size="44" font-weight="800">5</text>
  <text x="742" y="326" font-size="17" fill="${MUTED}">${esc(t.streak)}</text>

  <rect x="864" y="233" width="196" height="126" rx="14" fill="${EDGE}"/>
  <rect x="864" y="230" width="196" height="126" rx="14" fill="#eef6e8" stroke="${EDGE}"/>
  <text x="888" y="300" font-size="44" font-weight="800">90</text>
  <text x="888" y="326" font-size="17" fill="${MUTED}">${esc(t.wordsSaved)}</text>
  <g transform="translate(1014,276)"><rect x="-16" y="-20" width="32" height="40" rx="5" fill="#fff" stroke="#86b07a" stroke-width="2" transform="rotate(8)"/><rect x="-16" y="-20" width="32" height="40" rx="5" fill="#fff" stroke="#86b07a" stroke-width="2" transform="rotate(-6)"/><path d="M-7 1 l5 5 l10 -11" fill="none" stroke="#166534" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>

  <text x="652" y="414" font-size="20" font-weight="800">${esc(t.level)}</text>
  <text x="1058" y="414" font-size="16" font-weight="700" fill="${MUTED}" text-anchor="end">237 XP</text>
  <rect x="650" y="428" width="410" height="20" rx="10" fill="#f3ece1" stroke="${EDGE}"/>
  <rect class="bar" x="650" y="428" width="300" height="20" rx="10" fill="url(#xp)"/>
  <text x="652" y="480" font-size="17" fill="${MUTED}">${esc(t.week)}</text>

  <!-- stickers -->
  ${sticker({ x: 1062, y: 110, rot: -8, w: 128, h: 50, fill: '#fde68a', text: '¡Hola!', size: 26, cls: 's1' })}
  ${sticker({ x: 186, y: 540, rot: 6, w: 150, h: 48, fill: '#dcfce7', text: 'Merhaba', size: 24, cls: 's2' })}
  ${sticker({ x: 870, y: 548, rot: -5, w: 138, h: 48, fill: '#ffe4e6', text: 'Bonjour', size: 24, cls: 's3' })}
  ${sticker({ x: 1050, y: 494, rot: 9, w: 96, h: 40, fill: '#fed7aa', text: '+10 XP', size: 17, cls: 's4', serif: false })}
</svg>
`;
}

// 8 die-cut stickers that pop in one by one.
function features(t) {
  const W = 1200, H = 560, colors = ['#fde68a', '#dcfce7', '#ffe4e6', '#fed7aa', '#e0f2fe', '#ede9fe', '#fde68a', '#dcfce7'];
  const rots = [-3, 2.5, -1.5, 3, 2, -3, 3.5, -2];
  const items = t.items.map(([emoji, title, l1, l2], i) => {
    const cx = 175 + (i % 4) * 283, cy = 172 + Math.floor(i / 4) * 222;
    return `
  <g transform="translate(${cx},${cy}) rotate(${rots[i]})"><g class="pop" style="animation-delay:${(0.25 + i * 0.22).toFixed(2)}s">
    <rect x="-128" y="-92" width="256" height="184" rx="30" fill="#fff" filter="url(#drop)"/>
    <rect x="-120" y="-84" width="240" height="168" rx="24" fill="${colors[i]}"/>
    <text x="-98" y="-24" font-size="40" class="emoji">${emoji}</text>
    <text x="-98" y="18" font-size="22" font-weight="800">${esc(title)}</text>
    <text x="-98" y="45" font-size="16" fill="${MUTED}">${esc(l1)}</text>
    <text x="-98" y="66" font-size="16" fill="${MUTED}">${esc(l2)}</text>
  </g></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(t.aria)}">
  <defs>${deskDefs}
    <style>
      text { font-family: ${SANS}; fill: ${INK}; }
      .emoji { font-family: ${EMOJI}; }
      .pop { transform-box: fill-box; transform-origin: center; animation: pop .55s cubic-bezier(.3,1.6,.5,1) both; }
      @keyframes pop { from { opacity: 0; transform: scale(.4) rotate(-14deg) } to { opacity: 1; transform: none } }
      ${REDUCED}
    </style>
  </defs>
  ${desk(W, H)}
  <path d="M40 34 H1160 V494 L1110 526 H40 Z" fill="#f8f4ee"/>
  <path d="M1160 494 L1110 526 L1118 488 Z" fill="#e3d8c6"/>
  <path d="M40 34 H1160 V494 L1110 526 H40 Z" fill="none" stroke="${EDGE}"/>
  ${items}
</svg>
`;
}

// Small die-cut accent stickers for section headings (decorative, alt="").
const ICONS = {
  install: ['#fde68a', '<path d="M35 12 L19 35 H30 L27 52 L45 27 H34 Z" fill="#facc15" stroke="#292524" stroke-width="3" stroke-linejoin="round"/>'],
  how: ['#dcfce7', '<path d="M20 30 a12 12 0 0 1 21 -8" fill="none" stroke="#292524" stroke-width="3.5" stroke-linecap="round"/><path d="M44 16 v8 h-8" fill="none" stroke="#292524" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M44 34 a12 12 0 0 1 -21 8" fill="none" stroke="#292524" stroke-width="3.5" stroke-linecap="round"/><path d="M20 48 v-8 h8" fill="none" stroke="#292524" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'],
  progress: ['#fed7aa', '<rect x="19" y="15" width="28" height="35" rx="3" fill="#fff" stroke="#292524" stroke-width="3"/><path d="M25 25 h16 M25 32 h16 M25 39 h10" stroke="#efb27a" stroke-width="2.5" stroke-linecap="round"/><path d="M15 21 h7 M15 32 h7 M15 43 h7" stroke="#292524" stroke-width="3" stroke-linecap="round"/>'],
  features: ['#ede9fe', '<path d="M32 13 l5.6 11.6 12.7 1.7 -9.3 8.8 2.3 12.6 -11.3 -6.1 -11.3 6.1 2.3 -12.6 -9.3 -8.8 12.7 -1.7 z" fill="#facc15" stroke="#292524" stroke-width="3" stroke-linejoin="round"/>'],
  compare: ['#ffe4e6', `<text x="32" y="40" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-weight="700" font-size="24" fill="#292524">vs</text>`],
  privacy: ['#e0f2fe', '<path d="M24 29 v-6 a8 8 0 0 1 16 0 v6" fill="none" stroke="#292524" stroke-width="3.5"/><rect x="18" y="29" width="28" height="21" rx="4" fill="#fde68a" stroke="#292524" stroke-width="3"/><circle cx="32" cy="38" r="2.8" fill="#292524"/><path d="M32 40 v5" stroke="#292524" stroke-width="3" stroke-linecap="round"/>'],
};
const icon = ([bg, art]) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
  <style>.pop { transform-origin: 32px 32px; animation: pop .6s .2s cubic-bezier(.3,1.6,.5,1) both; } @keyframes pop { from { opacity: 0; transform: scale(.3) rotate(-25deg) } to { opacity: 1; transform: none } } ${REDUCED}</style>
  <g class="pop"><g transform="rotate(-6 32 32)">
    <circle cx="32" cy="33.5" r="29" fill="#000" opacity=".18"/>
    <circle cx="32" cy="32" r="29" fill="#fff"/>
    <circle cx="32" cy="32" r="24" fill="${bg}"/>
    ${art}
  </g></g>
</svg>
`;

const T = {
  en: {
    aria: 'LangCoach: Little Language Lessons, now with a memory. A notebook with a 5-day streak, 90 saved words and an XP bar.',
    tag1: 'Little Language Lessons,', tag2: 'now with a memory.',
    words: [['la cuenta', 'the bill', 'learned'], ['el horario', 'the opening hours', 'learned'], ['la receta', 'the prescription', 'review']],
    learned: 'learned', chat: '¡Hola! 🔥 5-day streak', streak: 'day streak', wordsSaved: 'words saved',
    level: 'Level 3', week: '203 XP this week',
    featuresAria: 'What you get: memory, weekly plan, FSRS reviews, real-life lessons, streak and XP, browser extension, Anki, Quizlet and CSV export, any language.',
    items: [
      ['🧠', 'It remembers you', 'Every lesson, word and result', 'is saved for tomorrow.'],
      ['📅', 'Weekly plan', 'Study days and tasks sized', 'to your minutes per day.'],
      ['🔁', 'FSRS reviews', 'Each word comes back just', 'before you would forget it.'],
      ['🎯', 'Real-life lessons', 'Trips, meetings, dates:', 'practise the real situation.'],
      ['🔥', 'Streak and XP', 'Counted from what you did,', 'never invented.'],
      ['🧩', 'Browser extension', 'Saves your LLL lessons, adds', 'a practice side panel.'],
      ['🗂️', 'Anki · Quizlet · CSV', 'Export your deck', 'any time.'],
      ['🌍', 'Any language', 'Any native language,', 'any target language.'],
    ],
  },
  tr: {
    aria: "LangCoach: Little Language Lessons artık hafızalı. 5 günlük seri, 90 kayıtlı kelime ve XP çubuğu olan bir defter.",
    tag1: 'Little Language Lessons', tag2: 'artık hafızalı.',
    words: [['la cuenta', 'hesap', 'öğrenildi'], ['el horario', 'çalışma saatleri', 'öğrenildi'], ['la receta', 'reçete', 'tekrar']],
    learned: 'öğrenildi', chat: '¡Hola! 🔥 5 günlük seri', streak: 'günlük seri', wordsSaved: 'kayıtlı kelime',
    level: 'Seviye 3', week: 'Bu hafta 203 XP',
    featuresAria: 'Neler var: hafıza, haftalık plan, FSRS tekrarları, hayatından dersler, seri ve XP, tarayıcı uzantısı, Anki, Quizlet ve CSV aktarımı, her dil.',
    items: [
      ['🧠', 'Seni hatırlar', 'Her ders, kelime ve sonuç', 'yarın için kaydedilir.'],
      ['📅', 'Haftalık plan', 'Günlük dakikana göre', 'çalışma günleri ve görevler.'],
      ['🔁', 'FSRS tekrarları', 'Her kelime tam unutmadan', 'önce geri gelir.'],
      ['🎯', 'Hayatından dersler', 'Seyahat, toplantı, randevu:', 'gerçek duruma hazırlan.'],
      ['🔥', 'Seri ve XP', 'Yaptıklarından hesaplanır,', 'asla uydurulmaz.'],
      ['🧩', 'Tarayıcı uzantısı', 'LLL derslerini kaydeder,', 'pratik yan paneli ekler.'],
      ['🗂️', 'Anki · Quizlet · CSV', 'Desteni istediğin zaman', 'dışa aktar.'],
      ['🌍', 'Her dil', 'Her ana dil,', 'her hedef dil.'],
    ],
  },
};

const out = [];
const write = (name, text) => { writeFileSync(join(media, name), text); out.push(name); };
for (const [lang, sfx] of [['en', ''], ['tr', '.tr']]) {
  write(`hero${sfx}.svg`, hero(T[lang]));
  write(`features${sfx}.svg`, features({ ...T[lang], aria: T[lang].featuresAria }));
}
for (const [name, def] of Object.entries(ICONS)) write(`h-${name}.svg`, icon(def));

// Social preview: the English hero at rest, on its own desk colour so the rounded corners do not show.
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, reducedMotion: 'reduce' });
  await page.setContent(`<body style="margin:0;background:${DESK}">${hero(T.en).replace('width="1200" height="600"', 'width="1280" height="640"')}</body>`);
  await page.screenshot({ path: join(media, 'social-preview.png') });
  out.push('social-preview.png');
} finally {
  await browser.close();
}

for (const f of out) {
  const kb = statSync(join(media, f)).size / 1024;
  const max = f.endsWith('.png') ? 400 : 60;
  console.log(`${f}  ${kb.toFixed(1)} KB${kb >= max ? `  (over ${max} KB!)` : ''}`);
  if (kb >= max) process.exitCode = 1;
}
