// Writes docs/media/tutorial.svg: a 24 s looping, game-style "quest" walkthrough (spotlight, pulsing
// rings, a cursor that clicks, hint bubbles). A drawn illustration, not a screen recording.
// Run: node scripts/tutorial-art.mjs
import { writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'media', 'tutorial.svg');
const LOOP = 24; // seconds; four scenes of 6 s
const css = [];
let uid = 0;

/** Registers keyframes for one scene: stops are [scene-percent 0-100, declarations]. Returns the animation CSS. */
function anim(scene, stops, pre = '') {
  const name = `a${uid++}`;
  const g = (p) => scene * 25 + p * 0.25;
  const rows = stops.map(([p, d]) => `${g(p).toFixed(3)}%{${d}}`);
  const first = stops[0], last = stops[stops.length - 1];
  const head = g(first[0]) > 0 ? `0%{${first[1].replace(/animation-timing-function:[^;]+;?/, '')}}` : '';
  const tail = g(last[0]) < 100 ? `100%{${last[1].replace(/animation-timing-function:[^;]+;?/, '')}}` : '';
  css.push(`@keyframes ${name}{${head}${rows.join('')}${tail}}`);
  return `style="${pre}animation:${name} ${LOOP}s infinite"`;
}

const INK = '#292524', MUTED = '#6b5d4f', PAPER = '#faf7f2', EDGE = '#eadfcd', ORANGE = '#fb923c', GREEN = '#86efac', DESK = '#2f4a3f';
const EASE = 'animation-timing-function:ease-in-out';
const STEPS = ['Install', 'Connect', 'Study', 'Saved'];

const hud = (active) => {
  let x = 40;
  const pills = STEPS.map((s, i) => {
    const w = 118;
    const done = i < active, now = i === active;
    const g = `<g transform="translate(${x},0)"><rect width="${w}" height="30" rx="15" fill="${now ? ORANGE : done ? '#dcfce7' : 'none'}" stroke="${now ? ORANGE : done ? '#86b07a' : '#f5efe4'}" stroke-opacity="${now || done ? 1 : 0.45}" stroke-width="1.6"/><text x="${w / 2}" y="20" text-anchor="middle" font-size="13" font-weight="700" fill="${now ? '#fff' : done ? '#166534' : '#f5efe4'}" ${!now && !done ? 'fill-opacity=".6"' : ''}>${done ? '✓ ' : `${i + 1} · `}${s}</text></g>`;
    x += w + 10;
    return g;
  }).join('');
  return `<g transform="translate(0,22)"><text x="40" y="-4" font-size="11" font-weight="800" letter-spacing="2" fill="#f5efe4" fill-opacity=".6" style="display:none">QUEST</text>${pills}<text x="920" y="20" text-anchor="end" font-size="13" font-weight="700" fill="#f5efe4" fill-opacity=".7">QUEST ${active + 1} / 4</text></g>`;
};

const cursor = (scene, stops) =>
  `<g ${anim(scene, stops.map(([p, x, y, s = 1]) => [p, `transform:translate(${x}px,${y}px) scale(${s});${EASE}`]))}><path d="M0 0 L0 24 L6.5 18.5 L10.5 27.5 L15 25.5 L11 16.5 L19 16.5 Z" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></g>`;

const ripple = (scene, x, y, at) =>
  `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="${ORANGE}" stroke-width="4" ${anim(scene, [[0, 'opacity:0;transform:scale(.3)'], [at - 0.01, 'opacity:0;transform:scale(.3)'], [at, 'opacity:1;transform:scale(.3)'], [at + 7, 'opacity:0;transform:scale(3.2)']], 'transform-box:fill-box;transform-origin:center;')}/>`;

let maskId = 0;
/** Dim everything except `hole` between scene-percent a and b, with a pulsing outline. */
function spot(scene, hole, a, b) {
  const id = `m${maskId++}`;
  const { x, y, w, h, r = 12 } = hole;
  const fade = anim(scene, [[0, 'opacity:0'], [a, 'opacity:0'], [a + 3, 'opacity:1'], [b - 3, 'opacity:1'], [b, 'opacity:0']]);
  return `<g ${fade}>
    <mask id="${id}"><rect x="40" y="70" width="880" height="380" fill="#fff"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#000"/></mask>
    <rect x="40" y="70" width="880" height="380" rx="16" fill="#0b1411" fill-opacity=".62" mask="url(#${id})"/>
    <rect class="ring" x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="${r + 4}" fill="none" stroke="${ORANGE}" stroke-width="3" stroke-dasharray="9 7"/>
  </g>`;
}

function caption(scene, n, lines) {
  // lines: [[from, to, text]]
  const texts = lines
    .map(([a, b, t]) => `<text x="106" y="498" font-size="19" font-weight="700" ${anim(scene, [[0, 'opacity:0'], [a, 'opacity:0'], [a + 2, 'opacity:1'], [b - 2, 'opacity:1'], [b, 'opacity:0']])}>${t}</text>`)
    .join('');
  return `<g><rect x="40" y="466" width="880" height="56" rx="16" fill="#eadfcd"/><rect x="40" y="463" width="880" height="56" rx="16" fill="#fff" stroke="${EDGE}"/>
  <circle cx="76" cy="491" r="17" fill="${ORANGE}"/><text x="76" y="498" text-anchor="middle" font-size="19" font-weight="800" fill="#fff">${n}</text>${texts}</g>`;
}

const scene = (i, body) =>
  `<g ${anim(i, [[0, 'opacity:0'], [1.5, 'opacity:1'], [96, 'opacity:1'], [100, 'opacity:0']])}>${hud(i)}${body}</g>`;

const chrome = (title) =>
  `<rect x="40" y="70" width="880" height="380" rx="16" fill="#fff" stroke="${EDGE}"/>
   <path d="M40 86a16 16 0 0 1 16-16h848a16 16 0 0 1 16 16v18H40z" fill="#f3ece1"/>
   <circle cx="64" cy="87" r="5" fill="#f87171"/><circle cx="82" cy="87" r="5" fill="#fbbf24"/><circle cx="100" cy="87" r="5" fill="#86efac"/>
   <rect x="130" y="76" width="400" height="22" rx="11" fill="#fff" stroke="${EDGE}"/><text x="146" y="92" font-size="12" fill="${MUTED}">${title}</text>`;

// ---- Scene 1: install -------------------------------------------------------------------------------------------------
const s1 = scene(0, `
  <rect x="40" y="70" width="880" height="380" rx="16" fill="#1d2723"/>
  <path d="M40 86a16 16 0 0 1 16-16h848a16 16 0 0 1 16 16v18H40z" fill="#26332e"/>
  <circle cx="64" cy="87" r="5" fill="#f87171"/><circle cx="82" cy="87" r="5" fill="#fbbf24"/><circle cx="100" cy="87" r="5" fill="#86efac"/>
  <text x="130" y="92" font-size="13" fill="#9fb3a8">Claude Code</text>
  <text x="72" y="150" font-size="20" font-weight="700" fill="${ORANGE}" font-family="Georgia,serif" font-style="italic">Claude Code</text>
  <text x="72" y="182" font-size="15" fill="#9fb3a8">What would you like to do today?</text>
  <g ${anim(0, [[0, 'opacity:0'], [78, 'opacity:0'], [82, 'opacity:1']])} font-family="ui-monospace,Consolas,monospace" font-size="15">
    <text x="72" y="236" fill="#86efac">● Adding the langcoach MCP server…</text>
    <text x="72" y="264" fill="#86efac">✓ Server added. Start a new session and say “Connect LangCoach to Little Language Lessons”.</text>
  </g>
  <rect x="72" y="338" width="776" height="56" rx="12" fill="#25322d" stroke="${ORANGE}" stroke-width="2"/>
  <text x="92" y="372" font-size="17" fill="${ORANGE}" font-family="ui-monospace,Consolas,monospace">&gt;</text>
  <g clip-path="url(#c1)"><text x="116" y="372" font-size="16" fill="#f5efe4" font-family="ui-monospace,Consolas,monospace">Install LangCoach for me: https://github.com/oktaybilge1/langcoach</text>
    <rect x="112" y="344" width="720" height="44" fill="#25322d" ${anim(0, [[0, 'transform:translateX(0)'], [18, 'transform:translateX(0);animation-timing-function:steps(34,end)'], [58, 'transform:translateX(720px)']])}/></g>
  <g ${anim(0, [[0, 'opacity:0'], [62, 'opacity:0'], [64, 'opacity:1'], [76, 'opacity:1'], [78, 'opacity:0']])}><rect class="ring" x="776" y="346" width="64" height="40" rx="9" fill="#f5efe4"/><text x="808" y="372" text-anchor="middle" font-size="15" font-weight="800" fill="${INK}">⏎ Enter</text></g>
  ${spot(0, { x: 72, y: 338, w: 776, h: 56 }, 4, 78)}
  ${ripple(0, 200, 366, 14)}
  ${cursor(0, [[0, 780, 140], [12, 200, 368], [14, 200, 368, 0.85], [17, 205, 368], [60, 300, 440], [66, 824, 372], [68, 824, 372, 0.85], [72, 826, 374]])}
  ${caption(0, 1, [[0, 78, 'Paste one sentence into Claude Code'], [78, 100, 'Your agent sets up the server for you']])}
`);

// ---- Scene 2: connect -------------------------------------------------------------------------------------------------
const s2 = scene(1, `
  ${chrome('chrome://extensions')}
  <rect x="40" y="104" width="880" height="56" fill="#fff"/><line x1="40" x2="920" y1="160" y2="160" stroke="${EDGE}"/>
  <text x="70" y="140" font-size="22" font-weight="700" fill="${INK}">Extensions</text>
  <text x="716" y="138" font-size="15" fill="${MUTED}" text-anchor="end">Developer mode</text>
  <rect x="728" y="118" width="52" height="28" rx="14" fill="#d6c7b0"/><circle cx="742" cy="132" r="10" fill="#fff"/>
  <g ${anim(1, [[0, 'opacity:0'], [31, 'opacity:0'], [33, 'opacity:1']])}><rect x="728" y="118" width="52" height="28" rx="14" fill="${ORANGE}"/><circle cx="766" cy="132" r="10" fill="#fff"/></g>
  <g ${anim(1, [[0, 'opacity:0'], [33, 'opacity:0'], [37, 'opacity:1']])}>
    <rect x="40" y="161" width="880" height="62" fill="#f3ece1"/>
    <rect x="70" y="172" width="148" height="40" rx="20" fill="#fff" stroke="${ORANGE}" stroke-width="2"/><text x="144" y="198" text-anchor="middle" font-size="15" font-weight="700" fill="#c2410c">Load unpacked</text>
    <rect x="232" y="172" width="148" height="40" rx="20" fill="#fff" stroke="${EDGE}"/><text x="306" y="198" text-anchor="middle" font-size="15" fill="${MUTED}">Pack extension</text>
    <rect x="394" y="172" width="100" height="40" rx="20" fill="#fff" stroke="${EDGE}"/><text x="444" y="198" text-anchor="middle" font-size="15" fill="${MUTED}">Update</text>
  </g>
  <g ${anim(1, [[0, 'opacity:0'], [62, 'opacity:0'], [64, 'opacity:1'], [78, 'opacity:1'], [80, 'opacity:0']])}>
    <rect x="236" y="226" width="330" height="40" rx="10" fill="#fff" stroke="${EDGE}"/><text x="252" y="251" font-size="14" fill="${MUTED}" font-family="ui-monospace,Consolas,monospace">…/.langcoach/extension   Ctrl+V</text>
  </g>
  <g ${anim(1, [[0, 'opacity:0;transform:scale(.6)'], [80, 'opacity:0;transform:scale(.6)'], [86, 'opacity:1;transform:scale(1)']], 'transform-box:fill-box;transform-origin:center;')}>
    <rect x="70" y="262" width="420" height="104" rx="14" fill="#fff" stroke="${EDGE}"/>
    <rect x="90" y="284" width="48" height="48" rx="12" fill="#fff1e0" stroke="${EDGE}"/><text x="114" y="316" text-anchor="middle" font-size="26">🧠</text>
    <text x="152" y="304" font-size="18" font-weight="800" fill="${INK}">LangCoach</text><text x="152" y="326" font-size="13" fill="${MUTED}">Little Language Lessons, now with a memory.</text>
    <rect x="152" y="338" width="44" height="20" rx="10" fill="${ORANGE}"/><circle cx="186" cy="348" r="7" fill="#fff"/>
  </g>
  ${spot(1, { x: 596, y: 108, w: 196, h: 50, r: 14 }, 4, 38)}
  ${spot(1, { x: 66, y: 166, w: 158, h: 52, r: 26 }, 40, 78)}
  ${spot(1, { x: 66, y: 258, w: 428, h: 112 }, 80, 100)}
  ${ripple(1, 754, 132, 32)}
  ${ripple(1, 144, 192, 62)}
  ${cursor(1, [[0, 820, 390], [8, 820, 390], [28, 752, 134], [30, 752, 134, 0.85], [33, 756, 136], [40, 756, 136], [58, 140, 196], [60, 140, 196, 0.85], [63, 144, 196], [100, 560, 330]])}
  ${caption(1, 2, [[0, 40, 'Turn on Developer mode (top right)'], [40, 80, 'Click Load unpacked, then paste the folder path your agent gave you'], [80, 100, 'LangCoach is on. Open Little Language Lessons next.']])}
`);

// ---- Scene 3: study ---------------------------------------------------------------------------------------------------
const card = (x, emoji, title, sub) =>
  `<g><rect x="${x}" y="150" width="240" height="150" rx="16" fill="#fff" stroke="${EDGE}" stroke-width="1.5"/><text x="${x + 120}" y="212" text-anchor="middle" font-size="42">${emoji}</text>
  <text x="${x + 120}" y="248" text-anchor="middle" font-size="20" font-weight="800" fill="${INK}">${title}</text><text x="${x + 120}" y="272" text-anchor="middle" font-size="13" fill="${MUTED}">${sub}</text></g>`;
const lessonPage = `${chrome('labs.google/lll/en')}
  <text x="480" y="134" text-anchor="middle" font-size="21" font-weight="700" fill="${INK}" font-family="Georgia,serif" font-style="italic">Little Language Lessons</text>
  ${card(76, '📘', 'Tiny Lesson', 'Words for a real situation')}${card(360, '💬', 'Slang Hang', 'Talk like a local')}${card(644, '📷', 'Word Cam', 'Name what you see')}`;
const s3 = scene(2, `
  ${lessonPage}
  <g ${anim(2, [[0, 'opacity:0'], [31, 'opacity:0'], [33, 'opacity:1']])}><rect x="76" y="150" width="240" height="150" rx="16" fill="none" stroke="${ORANGE}" stroke-width="4"/></g>
  <g ${anim(2, [[0, 'opacity:0'], [33, 'opacity:0'], [37, 'opacity:1']])}>
    <rect x="360" y="334" width="240" height="56" rx="28" fill="${ORANGE}"/><text x="480" y="369" text-anchor="middle" font-size="20" font-weight="800" fill="#fff">Start</text>
  </g>
  <g ${anim(2, [[0, 'opacity:0'], [70, 'opacity:0'], [73, 'opacity:1']])}><rect x="300" y="326" width="360" height="72" rx="16" fill="#fff" stroke="${EDGE}"/><text x="480" y="368" text-anchor="middle" font-size="17" font-weight="700" fill="${INK}">Your lesson is ready ✨</text></g>
  ${spot(2, { x: 72, y: 146, w: 248, h: 158, r: 18 }, 4, 38)}
  ${spot(2, { x: 356, y: 330, w: 248, h: 64, r: 32 }, 40, 70)}
  ${ripple(2, 196, 226, 30)}
  ${ripple(2, 480, 362, 62)}
  ${cursor(2, [[0, 860, 410], [8, 860, 410], [26, 192, 232], [28, 192, 232, 0.85], [31, 196, 232], [40, 196, 232], [58, 476, 368], [60, 476, 368, 0.85], [63, 480, 368], [100, 560, 430]])}
  ${caption(2, 3, [[0, 40, 'Open Little Language Lessons and pick a lesson'], [40, 100, 'Press Start and study as usual']])}
`);

// ---- Scene 4: saved ---------------------------------------------------------------------------------------------------
const s4 = scene(3, `
  ${lessonPage}
  <rect x="40" y="104" width="880" height="346" fill="#fff" fill-opacity=".75" ${anim(3, [[0, 'opacity:0'], [30, 'opacity:0'], [34, 'opacity:1']])}/>
  <g ${anim(3, [[0, 'opacity:0;transform:translateY(30px)'], [8, 'opacity:0;transform:translateY(30px)'], [14, 'opacity:1;transform:translateY(0)']])}>
    <rect x="68" y="372" width="340" height="62" rx="14" fill="#eadfcd" transform="translate(0,3)"/>
    <rect x="68" y="372" width="340" height="62" rx="14" fill="#fff" stroke="${EDGE}"/>
    <circle cx="100" cy="403" r="14" fill="#dcfce7"/><path d="M93 403l5 5 9-11" fill="none" stroke="#166534" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="124" y="398" font-size="15" font-weight="800" fill="${INK}">Saved 6 words</text><text x="124" y="418" font-size="13" fill="${MUTED}">Sent to your agent</text>
  </g>
  <g ${anim(3, [[0, 'opacity:0;transform:translateX(300px)'], [36, 'opacity:0;transform:translateX(300px)'], [46, 'opacity:1;transform:translateX(0)']])}>
    <rect x="620" y="104" width="300" height="346" fill="#faf7f2" stroke="${EDGE}"/>
    <text x="644" y="140" font-size="19" font-weight="700" font-family="Georgia,serif" font-style="italic" fill="${INK}">LangCoach</text>
    <rect x="644" y="158" width="122" height="84" rx="14" fill="#fff1e0" stroke="${EDGE}"/><text x="662" y="204" font-size="34" font-weight="800" fill="${INK}">1</text><text x="662" y="228" font-size="13" fill="${MUTED}">day streak</text><text x="730" y="196" font-size="26">🔥</text>
    <rect x="778" y="158" width="122" height="84" rx="14" fill="#eef6e8" stroke="${EDGE}"/><text x="796" y="204" font-size="34" font-weight="800" fill="${INK}">6</text><text x="796" y="228" font-size="13" fill="${MUTED}">words saved</text>
    <text x="644" y="276" font-size="15" font-weight="800" fill="${INK}">Level 1</text><text x="900" y="276" text-anchor="end" font-size="13" fill="${MUTED}">10 XP</text>
    <rect x="644" y="286" width="256" height="14" rx="7" fill="#f3ece1" stroke="${EDGE}"/>
    <rect x="644" y="286" width="256" height="14" rx="7" fill="url(#xp)" ${anim(3, [[0, 'transform:scaleX(0)'], [50, 'transform:scaleX(0)'], [66, 'transform:scaleX(.22)']], 'transform-box:fill-box;transform-origin:0 50%;')}/>
    <rect x="644" y="322" width="256" height="36" rx="10" fill="#fff" stroke="${EDGE}"/><text x="660" y="345" font-size="13" fill="${INK}">🔁 Reviews due tomorrow: 6</text>
  </g>
  ${spot(3, { x: 64, y: 368, w: 348, h: 70 }, 4, 36)}
  ${spot(3, { x: 616, y: 104, w: 308, h: 346, r: 6 }, 38, 100)}
  <g transform="translate(330,236) rotate(-6)" ${anim(3, [[0, 'opacity:0'], [70, 'opacity:0'], [76, 'opacity:1']])}>
    <rect x="-118" y="-28" width="236" height="56" rx="28" fill="#fff" filter="url(#drop)"/><rect x="-111" y="-21" width="222" height="42" rx="21" fill="#fde68a"/>
    <text y="7" text-anchor="middle" font-size="20" font-weight="800" fill="${INK}" font-family="Georgia,serif" font-style="italic">Quest complete! +10 XP</text>
  </g>
  ${caption(3, 4, [[0, 55, 'LangCoach saves the lesson and sends it to your agent'], [55, 100, 'Say “show my dashboard” any time to see your progress']])}
`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="960" height="540" role="img" aria-label="Quest walkthrough in four steps: paste the install sentence into Claude Code, turn on Developer mode and Load unpacked in the browser, start a Tiny Lesson in Little Language Lessons, then see the lesson saved and sent to your agent. A drawn illustration.">
<defs>
  <linearGradient id="xp" x1="0" x2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#facc15"/></linearGradient>
  <filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".28"/></filter>
  <clipPath id="c1"><rect x="112" y="344" width="728" height="44"/></clipPath>
  <style>
    text{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    .ring{animation:ring 1.3s ease-in-out infinite}
    @keyframes ring{0%,100%{stroke-opacity:1}50%{stroke-opacity:.25}}
    ${css.join('\n    ')}
    @media (prefers-reduced-motion:reduce){*{animation:none!important}}
  </style>
</defs>
<rect width="960" height="540" rx="26" fill="${DESK}"/>
<rect x="8" y="8" width="944" height="524" rx="20" fill="none" stroke="#f5efe4" stroke-opacity=".3" stroke-width="1.5" stroke-dasharray="7 6"/>
${s1}${s2}${s3}${s4}
</svg>
`;
writeFileSync(out, svg);
console.log(`tutorial.svg  ${(statSync(out).size / 1024).toFixed(1)} KB`);
