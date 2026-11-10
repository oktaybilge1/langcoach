export type UiLang = 'en' | 'tr' | 'es' | 'fr' | 'pt-BR';

// `{n}` is replaced by the caller. Level/achievement names mirror the extension's messages.json.
const en = {
  pageTitle: 'My progress', level: 'Level', streak: 'Day streak', streakFreezes: 'Streak freezes: {n} (protect a missed day)',
  words: 'Words', today: 'Today', dailyGoal: 'Daily XP goal', xp: 'XP', tasksDone: 'done', recentWords: 'Recent words',
  learned: 'learned', weak: 'needs practice', weeklyPlan: 'Weekly plan', dueReviews: 'Reviews due', next7: 'Next 7 days',
  nothingDue: 'Nothing due. Nice!', recentLessons: 'Recent Little Language Lessons', badges: 'Badges', unlocked: 'unlocked',
  locked: 'locked', earnInExtension: 'Earn this in the extension', xpChart: 'XP, last 7 days', more: '+{n} more',
  emptyTitle: 'Your first lesson is waiting', emptyBody: 'Ask your tutor for a lesson and your progress will show up here.',
  noWordsYet: 'No words yet.', noLessonsYet: 'No lessons yet.', noPlan: 'No plan yet.',
  taskNotDone: 'not done', daysDone: '{done}/{total} days done',
  task_tiny_lesson: "Tiny Lesson", task_slang_hang: "Slang Hang", task_review: "Flashcard Review", task_quiz: "Weekly Quiz Review", task_word_cam: "Word Cam",
  level1: 'Newcomer', level2: 'Explorer', level3: 'Learner', level4: 'Speaker', level5: 'Conversationalist',
  level6: 'Storyteller', level7: 'Fluent Friend', level8: 'Polyglot', level9: 'Master', level10: 'Legend',
  ach_first_lesson: 'First Step (1 lesson)', ach_streak_3: '3-Day Streak', ach_streak_7: '7-Day Streak', ach_streak_30: '30-Day Streak',
  ach_cards_50: '50 Words Collected', ach_cards_100: '100 Words Collected', ach_cards_500: '500 Words Collected',
  ach_reviews_100: '100 Card Reviews', ach_perfect_session: 'Perfect session', ach_xp_100_day: '100 XP in one day',
  ach_sessions_10: '10 practice sessions', ach_first_match: 'First match game',
};
export type DashboardStrings = Record<keyof typeof en, string>;

const tr: DashboardStrings = {
  pageTitle: 'İlerlemem', level: 'Seviye', streak: 'Günlük seri', streakFreezes: 'Seri dondurma: {n} (kaçırılan bir günü korur)',
  words: 'Kelimeler', today: 'Bugün', dailyGoal: 'Günlük XP hedefi', xp: 'XP', tasksDone: 'tamam', recentWords: 'Son kelimeler',
  learned: 'öğrenildi', weak: 'tekrar gerekli', weeklyPlan: 'Haftalık plan', dueReviews: 'Bekleyen tekrarlar', next7: 'Önümüzdeki 7 gün',
  nothingDue: 'Bekleyen yok. Harika!', recentLessons: 'Son Little Language Lessons dersleri', badges: 'Rozetler', unlocked: 'açıldı',
  locked: 'kilitli', earnInExtension: 'Bunu uzantıda kazan', xpChart: 'XP, son 7 gün', more: '+{n} daha',
  emptyTitle: 'İlk dersin seni bekliyor', emptyBody: 'Eğitmeninden bir ders iste, ilerlemen burada görünecek.',
  noWordsYet: 'Henüz kelime yok.', noLessonsYet: 'Henüz ders yok.', noPlan: 'Henüz plan yok.',
  taskNotDone: 'tamamlanmadı', daysDone: '{done}/{total} gün tamam',
  task_tiny_lesson: "Tiny Lesson", task_slang_hang: "Slang Hang", task_review: "Kelime Tekrarı", task_quiz: "Haftalık Mini Sınav", task_word_cam: "Word Cam",
  level1: 'Yeni Başlayan', level2: 'Kâşif', level3: 'Öğrenci', level4: 'Konuşmacı', level5: 'Sohbet Ustası',
  level6: 'Hikâye Anlatıcısı', level7: 'Akıcı Dost', level8: 'Çok Dilli', level9: 'Usta', level10: 'Efsane',
  ach_first_lesson: 'İlk Adım (1 ders)', ach_streak_3: '3 Günlük Seri', ach_streak_7: '7 Günlük Seri', ach_streak_30: '30 Günlük Seri',
  ach_cards_50: '50 Kelimeye Ulaşıldı', ach_cards_100: '100 Kelimeye Ulaşıldı', ach_cards_500: '500 Kelimeye Ulaşıldı',
  ach_reviews_100: '100 Kart Tekrarı', ach_perfect_session: 'Kusursuz seans', ach_xp_100_day: 'Bir günde 100 XP',
  ach_sessions_10: '10 alıştırma seansı', ach_first_match: 'İlk eşleştirme oyunu',
};

const es: DashboardStrings = {
  pageTitle: 'Mi progreso', level: 'Nivel', streak: 'Días de racha', streakFreezes: 'Protectores de racha: {n} (cubren un día perdido)',
  words: 'Palabras', today: 'Hoy', dailyGoal: 'Meta diaria de XP', xp: 'XP', tasksDone: 'hecho', recentWords: 'Palabras recientes',
  learned: 'aprendida', weak: 'por repasar', weeklyPlan: 'Plan semanal', dueReviews: 'Repasos pendientes', next7: 'Próximos 7 días',
  nothingDue: 'Nada pendiente. ¡Genial!', recentLessons: 'Lecciones recientes de Little Language Lessons', badges: 'Insignias',
  unlocked: 'desbloqueada', locked: 'bloqueada', earnInExtension: 'Consíguela en la extensión', xpChart: 'XP, últimos 7 días',
  more: '+{n} más', emptyTitle: 'Tu primera lección te espera', emptyBody: 'Pide una lección a tu tutor y tu progreso aparecerá aquí.',
  noWordsYet: 'Aún no hay palabras.', noLessonsYet: 'Aún no hay lecciones.', noPlan: 'Aún no hay plan.',
  taskNotDone: 'pendiente', daysDone: '{done}/{total} días hechos',
  task_tiny_lesson: "Tiny Lesson", task_slang_hang: "Slang Hang", task_review: "Repaso de tarjetas", task_quiz: "Cuestionario semanal", task_word_cam: "Word Cam",
  level1: 'Recién llegado', level2: 'Explorador', level3: 'Aprendiz', level4: 'Hablante', level5: 'Conversador',
  level6: 'Narrador', level7: 'Amigo fluido', level8: 'Políglota', level9: 'Maestro', level10: 'Leyenda',
  ach_first_lesson: 'Primer paso (1 lección)', ach_streak_3: 'Racha de 3 días', ach_streak_7: 'Racha de 7 días', ach_streak_30: 'Racha de 30 días',
  ach_cards_50: '50 palabras guardadas', ach_cards_100: '100 palabras guardadas', ach_cards_500: '500 palabras guardadas',
  ach_reviews_100: '100 repasos completados', ach_perfect_session: 'Sesión perfecta', ach_xp_100_day: '100 XP en un día',
  ach_sessions_10: '10 sesiones de práctica', ach_first_match: 'Primer juego de parejas',
};

const fr: DashboardStrings = {
  pageTitle: 'Ma progression', level: 'Niveau', streak: 'Jours de série', streakFreezes: 'Gels de série : {n} (protègent un jour manqué)',
  words: 'Mots', today: "Aujourd'hui", dailyGoal: 'Objectif XP du jour', xp: 'XP', tasksDone: 'fait', recentWords: 'Mots récents',
  learned: 'appris', weak: 'à retravailler', weeklyPlan: 'Plan de la semaine', dueReviews: 'Révisions à faire', next7: '7 prochains jours',
  nothingDue: 'Rien à réviser. Bravo !', recentLessons: 'Leçons récentes de Little Language Lessons', badges: 'Badges',
  unlocked: 'débloqué', locked: 'verrouillé', earnInExtension: "À gagner dans l'extension", xpChart: 'XP, 7 derniers jours',
  more: '+{n} de plus', emptyTitle: "Ta première leçon t'attend", emptyBody: 'Demande une leçon à ton tuteur et ta progression apparaîtra ici.',
  noWordsYet: 'Pas encore de mots.', noLessonsYet: 'Pas encore de leçons.', noPlan: 'Pas encore de plan.',
  taskNotDone: 'à faire', daysDone: '{done}/{total} jours faits',
  task_tiny_lesson: "Tiny Lesson", task_slang_hang: "Slang Hang", task_review: "Révision de cartes", task_quiz: "Quiz hebdomadaire", task_word_cam: "Word Cam",
  level1: 'Nouveau venu', level2: 'Explorateur', level3: 'Apprenti', level4: 'Locuteur', level5: 'Causeur',
  level6: 'Conteur', level7: 'Ami fluide', level8: 'Polyglotte', level9: 'Maître', level10: 'Légende',
  ach_first_lesson: 'Premier pas (1 leçon)', ach_streak_3: 'Série de 3 jours', ach_streak_7: 'Série de 7 jours', ach_streak_30: 'Série de 30 jours',
  ach_cards_50: '50 mots collectés', ach_cards_100: '100 mots collectés', ach_cards_500: '500 mots collectés',
  ach_reviews_100: '100 révisions de cartes', ach_perfect_session: 'Séance parfaite', ach_xp_100_day: '100 XP en une journée',
  ach_sessions_10: "10 séances d'entraînement", ach_first_match: "Premier jeu d'association",
};

const ptBR: DashboardStrings = {
  pageTitle: 'Meu progresso', level: 'Nível', streak: 'Dias de sequência', streakFreezes: 'Congelamentos de ofensiva: {n} (protegem um dia perdido)',
  words: 'Palavras', today: 'Hoje', dailyGoal: 'Meta diária de XP', xp: 'XP', tasksDone: 'feito', recentWords: 'Palavras recentes',
  learned: 'aprendida', weak: 'precisa de prática', weeklyPlan: 'Plano semanal', dueReviews: 'Revisões pendentes', next7: 'Próximos 7 dias',
  nothingDue: 'Nada pendente. Ótimo!', recentLessons: 'Lições recentes do Little Language Lessons', badges: 'Medalhas',
  unlocked: 'desbloqueada', locked: 'bloqueada', earnInExtension: 'Conquiste na extensão', xpChart: 'XP, últimos 7 dias',
  more: '+{n} mais', emptyTitle: 'Sua primeira lição está esperando', emptyBody: 'Peça uma lição ao seu tutor e seu progresso aparecerá aqui.',
  noWordsYet: 'Ainda não há palavras.', noLessonsYet: 'Ainda não há lições.', noPlan: 'Ainda não há plano.',
  taskNotDone: 'pendente', daysDone: '{done}/{total} dias feitos',
  task_tiny_lesson: "Tiny Lesson", task_slang_hang: "Slang Hang", task_review: "Revisão de cartões", task_quiz: "Quiz semanal", task_word_cam: "Word Cam",
  level1: 'Recém-chegado', level2: 'Explorador', level3: 'Aprendiz', level4: 'Falante', level5: 'Bom de papo',
  level6: 'Contador de histórias', level7: 'Amigo fluente', level8: 'Poliglota', level9: 'Mestre', level10: 'Lenda',
  ach_first_lesson: 'Primeiro passo (1 lição)', ach_streak_3: 'Sequência de 3 dias', ach_streak_7: 'Sequência de 7 dias', ach_streak_30: 'Sequência de 30 dias',
  ach_cards_50: '50 palavras salvas', ach_cards_100: '100 palavras salvas', ach_cards_500: '500 palavras salvas',
  ach_reviews_100: '100 revisões de cartões', ach_perfect_session: 'Sessão perfeita', ach_xp_100_day: '100 XP em um dia',
  ach_sessions_10: '10 sessões de prática', ach_first_match: 'Primeiro jogo de pares',
};

const TABLE: Record<UiLang, DashboardStrings> = { en, tr, es, fr, 'pt-BR': ptBR };
export const strings = (ui: UiLang): DashboardStrings => TABLE[ui];

const CODES = 'en tr es fr pt de it nl ru ja ko zh ar hi pl sv da no fi cs el he id th vi uk ro hu bg hr sr sk fa ms bn ur ca ta sw'.split(' ');
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function displayName(code: string, inLocale: string): string | undefined {
  try {
    return new Intl.DisplayNames([inLocale], { type: 'language' }).of(code);
  } catch {
    return undefined;
  }
}

/** Native language (code or name in any common form) -> UI language plus Intl locale. Never throws. */
export function resolveLocale(nativeLanguage: string | undefined): { ui: UiLang; locale: string } {
  const raw = (nativeLanguage ?? '').trim();
  let locale = 'en';
  // Codes only: a 7-letter name like "Turkish" is also structurally valid BCP-47.
  if (/^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(raw)) {
    try {
      locale = Intl.getCanonicalLocales(raw)[0] ?? 'en';
    } catch {
      /* keep en */
    }
  } else if (raw) {
    const want = fold(raw.split(/[(,]/)[0] ?? '');
    const hit = CODES.find((c) => [displayName(c, 'en'), displayName(c, c)].some((n) => n && fold(n) === want));
    if (hit) locale = hit;
  }
  const lang = locale.split('-')[0];
  const ui: UiLang = lang === 'pt' ? 'pt-BR' : lang === 'tr' || lang === 'es' || lang === 'fr' ? lang : 'en';
  return { ui, locale };
}
