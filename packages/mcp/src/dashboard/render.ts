import {
  achievements,
  addDays,
  isDue,
  isoWeek,
  isWeak,
  levelFor,
  NOTEBOOK_TOKENS,
  progressOf,
  strengthOf,
  toLocalDate,
  weekDates,
  xpFor,
  type AchievementId,
  type State,
} from '@langcoach/core';
import { escapeHtml as esc } from './escape.js';
import { resolveLocale, strings, type DashboardStrings } from './i18n.js';

const TOKENS = NOTEBOOK_TOKENS; // shared look with the extension side panel

const MAX_WORDS = 30;
const MAX_LESSONS = 5;
const TASK_EMOJI = { tiny_lesson: '📘', slang_hang: '💬', review: '🔁', quiz: '📝', word_cam: '📷' } as const;
const BADGE_EMOJI: Record<AchievementId, string> = {
  first_lesson: '👣', streak_3: '🔥', streak_7: '🌟', streak_30: '🏆', cards_50: '🌱', cards_100: '🌿', cards_500: '🌳',
  reviews_100: '🔁', perfect_session: '💯', xp_100_day: '⚡', sessions_10: '🎯', first_match: '🧩',
};
const PRACTICE_ONLY: readonly AchievementId[] = ['perfect_session', 'sessions_10', 'first_match'];

const CSS = `
:root{--paper:${TOKENS.paper};--rule:${TOKENS.rule};--border:${TOKENS.border};--shadow:${TOKENS.shadow};
--streak:${TOKENS.streakTile};--words:${TOKENS.wordsTile};--sticker:${TOKENS.sticker};--tilt:${TOKENS.stickerRotate};
--xp-from:${TOKENS.xpFrom};--xp-to:${TOKENS.xpTo};--learned-bg:${TOKENS.learnedBg};--learned-fg:${TOKENS.learnedFg};
--weak-bg:${TOKENS.weakBg};--weak-fg:${TOKENS.weakFg};--radius:${TOKENS.radius};--serif:${TOKENS.serif};--sans:${TOKENS.sans};
--ink:#292524;--muted:#6b5d4f;--margin:#f3c7c7}
*{box-sizing:border-box}
html{background:var(--paper)}
body{margin:0;color:var(--ink);font:15px/1.45 var(--sans);background-color:var(--paper);
background-image:linear-gradient(90deg,transparent 0 46px,var(--margin) 46px 47px,transparent 47px),
repeating-linear-gradient(transparent 0 27px,var(--rule) 27px 28px);min-height:100vh}
main{max-width:1120px;margin:0 auto;padding:22px 24px 48px 64px}
:focus-visible{outline:3px solid #c2410c;outline-offset:2px;border-radius:6px}
h1,h2,p{margin:0}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
h1{font:italic 400 30px/1.15 var(--serif);letter-spacing:.2px}
h1 small{display:block;font:500 13px/1.4 var(--sans);color:var(--muted);font-style:normal;margin-top:2px}
.sticker{display:inline-flex;flex-direction:column;align-items:center;transform:rotate(var(--tilt));background:var(--sticker);
padding:8px 14px 7px;border-radius:8px;box-shadow:0 3px 0 #e5c76b;font-weight:800;font-size:15px;line-height:1.2;animation:pop .5s ease-out both}
.sticker span{font-weight:600;font-size:12px}
.grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:18px;margin-top:16px;align-items:start}
.col{display:grid;gap:14px;min-width:0}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card,.tile{background:#fff;border:1px solid var(--border);box-shadow:var(--shadow);border-radius:var(--radius);padding:14px 16px;min-width:0}
.tile.s{background:var(--streak)}.tile.w{background:var(--words)}
.big{font-size:34px;font-weight:800;line-height:1}
.lbl{font-size:13px;color:var(--muted);margin-top:5px}
h2{font-size:15px;font-weight:700;display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px}
h2 .n{font-weight:600;font-size:13px;color:var(--muted)}
.bar{height:10px;border-radius:99px;background:#eee4d6;overflow:hidden}
.bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--xp-from),var(--xp-to));transform-origin:left;animation:fill .9s ease-out both}
ul,ol{list-style:none;margin:0;padding:0}
svg{display:block;max-height:170px}
.tasks{display:grid;gap:6px;margin-top:10px}
.task{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--paper);font-size:14px}
.task .st{width:20px;text-align:center;color:var(--muted)}
.task.done .st{color:#15803d;font-weight:800}
.task.done .nm{color:var(--muted);text-decoration:line-through;text-decoration-color:#a8a29e}
.task .xp{margin-left:auto;font-size:12px;font-weight:700;color:#9a3412;background:var(--streak);border-radius:99px;padding:2px 8px;white-space:nowrap}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-block;font-size:13px;padding:3px 10px;border-radius:999px;background:#fff;border:1px solid var(--border);overflow-wrap:anywhere;max-width:100%}
.chip.k{background:var(--learned-bg);border-color:#bbf7d0;color:var(--learned-fg)}
.chip.wk{background:var(--weak-bg);border-color:#fecdd3;color:var(--weak-fg)}
.chip.more{background:transparent;border-style:dashed;color:var(--muted)}
.legend{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.legend .chip{font-size:12px;font-weight:700}
.empty{background:var(--streak);border-radius:10px;padding:12px 14px}
.empty b{display:block;font:italic 600 18px/1.3 var(--serif)}
.empty p,.muted{color:var(--muted);font-size:14px}
.more-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:22px}
.wide{grid-column:1/-1}
.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.day{text-align:center;border:1px solid var(--border);border-radius:10px;padding:6px 2px;background:var(--paper);font-size:12px;color:var(--muted)}
.day b{display:block;font-size:16px;color:var(--ink);margin-top:2px;letter-spacing:1px}
.day.today{background:var(--sticker);border-color:#e5c76b;color:var(--ink)}
.day.full b{color:#15803d}
.due{display:flex;align-items:center;gap:14px}
.spark{display:flex;align-items:flex-end;gap:5px;margin-top:8px}
.spark div{flex:1;text-align:center;font-size:11px;color:var(--muted)}
.spark i{display:block;margin:0 auto 3px;width:70%;max-width:22px;background:#fed7aa;border-radius:4px 4px 2px 2px;min-height:2px}
.lessons li{display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px dashed var(--border);font-size:14px}
.lessons li:last-child{border-bottom:0}
.lessons .sit{overflow-wrap:anywhere;min-width:0}
.lessons time{margin-left:auto;font-size:12px;color:var(--muted);white-space:nowrap}
.badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.badge{display:flex;gap:10px;align-items:center;border:1px solid var(--border);border-radius:12px;padding:9px 10px;background:var(--paper);font-size:13px;line-height:1.3}
.badge .e{font-size:24px}
.badge.on{background:#fffbeb;border-color:#fcd34d;box-shadow:0 2px 0 #fcd34d}
.badge.off .e{filter:grayscale(1);opacity:.45}
.badge small{display:block;color:var(--muted);font-size:12px}
svg text{font:11px var(--sans);fill:var(--muted)}
@keyframes fill{from{transform:scaleX(0)}}
@keyframes pop{from{transform:rotate(var(--tilt)) scale(.6);opacity:0}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
@media (max-width:820px){.grid,.more-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:520px){main{padding:16px 16px 40px 30px}body{background-image:linear-gradient(90deg,transparent 0 18px,var(--margin) 18px 19px,transparent 19px),repeating-linear-gradient(transparent 0 27px,var(--rule) 27px 28px)}
h1{font-size:24px}.big{font-size:28px}.week{gap:3px}.day{font-size:11px}}
`;

/** Self-contained, offline notebook page of the learner's progress. All state text is escaped. */
export function renderDashboard(state: State, now: Date): string {
  const { ui, locale } = resolveLocale(state.profile?.nativeLanguage);
  const s = strings(ui);
  const num = new Intl.NumberFormat(locale);
  const n = (v: number) => esc(num.format(v));
  const date = (d: Date, o: Intl.DateTimeFormatOptions) => (Number.isNaN(d.getTime()) ? '' : esc(new Intl.DateTimeFormat(locale, o).format(d)));
  const day = (iso: string, o: Intl.DateTimeFormatOptions) => date(new Date(`${iso}T12:00:00`), o);
  const more = (k: number) => esc(s.more.replace('{n}', num.format(k)));
  const dateLang = locale.split('-')[0] === ui.split('-')[0] ? '' : ` lang="${esc(locale)}"`;

  const today = toLocalDate(now);
  const p = progressOf(state, now);
  const lvl = levelFor(p.totalXp);
  const isEmpty = state.lessons.length === 0 && state.cards.length === 0 && state.log.length === 0;
  const plan = state.plans[isoWeek(now)];

  // Header
  const header = `<header class="top">
<h1><span${dateLang}>${date(now, { weekday: 'long', day: 'numeric', month: 'long' })}</span><small>${esc(s.pageTitle)}</small></h1>
<div class="sticker" aria-label="${esc(s.level)} ${lvl.level}: ${esc(s[lvl.key as keyof DashboardStrings])}">${esc(s.level)} ${lvl.level} ⭐<span>${esc(s[lvl.key as keyof DashboardStrings])} · ${n(p.totalXp)} ${esc(s.xp)}</span></div>
</header>`;

  // Tiles
  const freezes = state.streakFreezes === undefined ? '' : `<div class="lbl">🧊 ${esc(s.streakFreezes.replace('{n}', num.format(state.streakFreezes)))}</div>`;
  const tiles = `<div class="tiles">
<section class="tile s" aria-label="${esc(s.streak)}"><div class="big">🔥 ${n(p.streak)}</div><div class="lbl">${esc(s.streak)}</div>${freezes}</section>
<section class="tile w" aria-label="${esc(s.words)}"><div class="big">🌱 ${n(state.cards.length)}</div><div class="lbl">${esc(s.words)}</div></section>
</div>`;

  // Today
  const pct = Math.min(100, Math.round((p.todayXp / Math.max(1, p.dailyGoalXp)) * 100));
  const todays = (plan?.tasks ?? []).filter((t) => t.date === today);
  const taskXp = (id: string) => state.log.filter((e) => e.taskId === id).reduce((a, e) => a + e.xp, 0);
  const tasks = todays.length
    ? `<ul class="tasks">${todays
        .map((t) => {
          const done = t.status === 'done';
          const xp = done ? taskXp(t.id) || xpFor(t.type) : xpFor(t.type);
          return `<li class="task${done ? ' done' : ''}"><span class="st" aria-label="${esc(done ? s.tasksDone : '')}">${done ? '✓' : '○'}</span><span>${TASK_EMOJI[t.type] ?? ''}</span><span class="nm">${esc(s[`task_${t.type}` as keyof DashboardStrings] ?? t.type)}</span><span class="xp">+${n(xp)} ${esc(s.xp)}</span></li>`;
        })
        .join('')}</ul>`
    : isEmpty
      ? `<div class="empty" style="margin-top:10px"><b>✏️ ${esc(s.emptyTitle)}</b><p>${esc(s.emptyBody)}</p></div>`
      : `<p class="muted" style="margin-top:10px">${esc(s.noPlan)}</p>`;
  const doneCount = todays.filter((t) => t.status === 'done').length;
  const todayCard = `<section class="card" aria-labelledby="h-today">
<h2 id="h-today">${esc(s.today)}<span class="n">${todays.length ? `${n(doneCount)}/${n(todays.length)} ${esc(s.tasksDone)}` : ''}</span></h2>
<div class="lbl" style="margin:0 0 6px;display:flex;justify-content:space-between"><span>${esc(s.dailyGoal)}</span><span><b style="color:var(--ink)">${n(p.todayXp)}</b> / ${n(p.dailyGoalXp)} ${esc(s.xp)}</span></div>
<div class="bar" role="progressbar" aria-label="${esc(s.dailyGoal)}" aria-valuemin="0" aria-valuemax="${p.dailyGoalXp}" aria-valuenow="${Math.min(p.todayXp, p.dailyGoalXp)}"><i style="width:${pct}%"></i></div>
${tasks}
</section>`;

  // Recent words (newest first)
  const learned = state.cards.filter((c) => strengthOf(c) >= 4).length;
  const weak = state.cards.filter(isWeak).length;
  const recent = state.cards.slice(-MAX_WORDS).reverse();
  const chips = recent
    .map((c) => {
      const k = strengthOf(c) >= 4 ? 'k' : isWeak(c) ? 'wk' : '';
      const tip = k === 'k' ? s.learned : k === 'wk' ? s.weak : '';
      return `<li class="chip${k ? ` ${k}` : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(c.term)}${k === 'k' ? ' ✓' : ''}${tip ? `<span class="sr"> (${esc(tip)})</span>` : ''}</li>`;
    })
    .join('');
  const extra = state.cards.length - recent.length;
  const wordsCard = `<section class="card" aria-labelledby="h-words">
<h2 id="h-words">${esc(s.recentWords)}<span class="n">${n(state.cards.length)}</span></h2>
${state.cards.length
  ? `<div class="legend"><span class="chip k">✓ ${n(learned)} ${esc(s.learned)}</span><span class="chip wk">${n(weak)} ${esc(s.weak)}</span></div>
<ul class="chips">${chips}${extra > 0 ? `<li class="chip more">${more(extra)}</li>` : ''}</ul>`
  : isEmpty ? `<p class="muted">🌱 ${esc(s.noWordsYet)}</p>` : `<p class="muted">${esc(s.noWordsYet)}</p>`}
</section>`;

  // Weekly plan
  const dates = weekDates(isoWeek(now));
  const planCard = `<section class="card" aria-labelledby="h-plan">
<h2 id="h-plan">${esc(s.weeklyPlan)}${plan ? `<span class="n">${n(p.weekly.done)}/${n(p.weekly.planned)}</span>` : ''}</h2>
${plan
  ? `<ol class="week">${dates
      .map((d) => {
        const ts = plan.tasks.filter((t) => t.date === d);
        const full = ts.length > 0 && ts.every((t) => t.status === 'done');
        const marks = ts.length ? ts.map((t) => (t.status === 'done' ? '●' : '○')).join('') : '·';
        return `<li class="day${d === today ? ' today' : ''}${full ? ' full' : ''}">${day(d, { weekday: 'short' })}<b aria-label="${n(ts.filter((t) => t.status === 'done').length)}/${n(ts.length)}">${marks}</b></li>`;
      })
      .join('')}</ol>${plan.theme ? `<p class="muted" style="margin-top:8px">${esc(plan.theme)}</p>` : ''}`
  : `<p class="muted">${esc(s.noPlan)}</p>`}
</section>`;

  // Reviews
  const next = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i + 1);
    return { d, c: state.cards.filter((c) => !isDue(c.srs, now) && toLocalDate(new Date(c.srs.due)) === d).length };
  });
  const maxNext = Math.max(1, ...next.map((x) => x.c));
  const reviewCard = `<section class="card" aria-labelledby="h-due">
<h2 id="h-due">${esc(s.dueReviews)}</h2>
<div class="due"><div class="big">🔁 ${n(p.dueCount)}</div>${p.dueCount === 0 ? `<p class="muted">${esc(s.nothingDue)}</p>` : ''}</div>
<div class="lbl" style="margin-top:10px">${esc(s.next7)}</div>
<div class="spark">${next.map((x) => `<div><i style="height:${Math.round((x.c / maxNext) * 30) + 2}px"></i>${n(x.c)}<br>${day(x.d, { weekday: 'narrow' })}</div>`).join('')}</div>
</section>`;

  // Recent LLL lessons
  const lll = state.lessons
    .filter((l) => l.source?.app === 'lll' || l.origin === 'bridge')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const lessonsCard = `<section class="card" aria-labelledby="h-lll">
<h2 id="h-lll">${esc(s.recentLessons)}${lll.length ? `<span class="n">${n(lll.length)}</span>` : ''}</h2>
${lll.length
  ? `<ul class="lessons">${lll
      .slice(0, MAX_LESSONS)
      .map((l) => `<li><span>${TASK_EMOJI[l.kind] ?? '📘'}</span><span class="sit">${esc(l.situation)}</span><time>${date(new Date(l.createdAt), { day: 'numeric', month: 'short' })}</time></li>`)
      .join('')}${lll.length > MAX_LESSONS ? `<li class="muted">${more(lll.length - MAX_LESSONS)}</li>` : ''}</ul>`
  : `<p class="muted">${esc(s.noLessonsYet)}</p>`}
</section>`;

  // XP chart (inline SVG)
  const W = 420, H = 150, bw = 34, gap = (W - 7 * bw) / 6, top = 16, base = H - 20;
  const maxXp = Math.max(p.dailyGoalXp, ...p.weekXp.map((x) => x.xp));
  const y = (v: number) => base - ((base - top) * v) / maxXp;
  const bars = p.weekXp
    .map((x, i) => {
      const bx = i * (bw + gap);
      const h = Math.max(2, base - y(x.xp));
      return `<rect x="${bx.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="5" fill="${x.date === today ? 'url(#g)' : '#fed7aa'}"/><text x="${(bx + bw / 2).toFixed(1)}" y="${(base - h - 4).toFixed(1)}" text-anchor="middle">${n(x.xp)}</text><text x="${(bx + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${day(x.date, { weekday: 'short' })}</text>`;
    })
    .join('');
  const chartLabel = p.weekXp.map((x) => `${day(x.date, { weekday: 'short' })} ${num.format(x.xp)}`).join(', ');
  const chartCard = `<section class="card" aria-labelledby="h-xp">
<h2 id="h-xp">${esc(s.xpChart)}<span class="n">${n(p.weekXp.reduce((a, x) => a + x.xp, 0))} ${esc(s.xp)}</span></h2>
<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(chartLabel)}"><defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${TOKENS.xpFrom}"/><stop offset="1" stop-color="${TOKENS.xpTo}"/></linearGradient></defs>
<line x1="0" x2="${W}" y1="${y(p.dailyGoalXp).toFixed(1)}" y2="${y(p.dailyGoalXp).toFixed(1)}" stroke="#d6c7b0" stroke-dasharray="4 4"/>${bars}</svg>
</section>`;

  // Badges
  const noSessions = !state.sessions?.length;
  const badges = achievements(state, today)
    .map((a) => {
      const practice = noSessions && PRACTICE_ONLY.includes(a.id);
      const status = a.unlocked ? s.unlocked : practice ? s.earnInExtension : `${num.format(a.progress)}/${num.format(a.goal)}`;
      return `<li class="badge ${a.unlocked ? 'on' : 'off'}"><span class="e" aria-hidden="true">${BADGE_EMOJI[a.id]}</span><span>${esc(s[`ach_${a.id}` as keyof DashboardStrings])}<small>${a.unlocked ? '★ ' : '🔒 '}${esc(status)}</small></span></li>`;
    })
    .join('');
  const unlocked = achievements(state, today).filter((a) => a.unlocked).length;
  const badgesCard = `<section class="card wide" aria-labelledby="h-badges">
<h2 id="h-badges">${esc(s.badges)}<span class="n">${n(unlocked)}/12 ${esc(s.unlocked)}</span></h2>
<ul class="badges">${badges}</ul>
</section>`;

  return `<!doctype html>
<html lang="${esc(ui)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${esc(s.pageTitle)} · LangCoach</title>
<style>${CSS}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}</style>
</head>
<body>
<main>
${header}
<div class="grid">
<div class="col">${tiles}${todayCard}</div>
<div class="col">${wordsCard}</div>
</div>
<div class="more-grid">
${planCard}${reviewCard}${lessonsCard}${chartCard}${badgesCard}
</div>
</main>
</body>
</html>
`;
}
