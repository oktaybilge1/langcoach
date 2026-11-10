import type { Cefr } from '@langcoach/core/browser';

export type Goal = 'travel' | 'work' | 'study' | 'moving' | 'family' | 'fun';
export type UiLocale = 'en' | 'tr' | 'es' | 'fr' | 'pt_BR';

export const GOALS: readonly Goal[] = ['travel', 'work', 'study', 'moving', 'family', 'fun'];

type LevelBand = 'beginner' | 'intermediate' | 'advanced';

/**
 * 12 curated Tiny Lesson themes per goal (4 per level band: indices 0..3 beginner, 4..7 intermediate, 8..11 advanced),
 * localized into the 5 UI languages. All themes are strictly <= 40 characters so they stay comfortably within
 * Google Labs Little Language Lessons' 50-character input limit.
 */
const THEMES: Record<UiLocale, Record<Goal, readonly string[]>> = {
  "en": {
    "travel": [
      "ordering coffee at a local cafe",
      "checking into a hotel room",
      "buying a train ticket at the station",
      "asking for walking directions",
      "booking a table at a restaurant",
      "renting a car with insurance",
      "reporting lost luggage at airport",
      "buying medicine at a pharmacy",
      "asking for a late checkout",
      "tour guide questions about history",
      "rebooking a missed flight",
      "explaining symptoms to a doctor"
    ],
    "work": [
      "introducing yourself on day one",
      "scheduling a quick team meeting",
      "asking where the printer is",
      "small talk before a video call",
      "weekly standup project update",
      "clarifying client questions",
      "negotiating a project deadline",
      "writing a post-meeting summary",
      "discussing contract terms",
      "leading a team retrospective",
      "presenting quarterly results",
      "resolving a team disagreement"
    ],
    "study": [
      "introducing yourself in class",
      "borrowing a library textbook",
      "asking for class lecture notes",
      "ordering food at the cafeteria",
      "asking a professor for advice",
      "planning a group presentation",
      "requesting a paper deadline extension",
      "discussing study habits and exams",
      "debating an article in seminar",
      "defending a thesis proposal",
      "interviewing for a fellowship",
      "critiquing research statistics"
    ],
    "moving": [
      "grocery shopping at the market",
      "setting up a mobile phone plan",
      "greeting a new neighbor",
      "asking about trash and recycling",
      "viewing a rental apartment",
      "opening a local bank account",
      "calling a plumber for a leak",
      "registering an address at city hall",
      "reviewing apartment lease terms",
      "explaining car engine troubles",
      "comparing health insurance plans",
      "school enrollment questions"
    ],
    "family": [
      "greeting relatives at a gathering",
      "complimenting home-cooked food",
      "talking about weekend hobbies",
      "birthday wishes and a warm toast",
      "sharing childhood memories",
      "planning a family holiday trip",
      "helping family set up a tablet",
      "talking about family recipes",
      "catching up with an old friend",
      "career advice for a relative",
      "looking at old family photos",
      "hosting a family dinner party"
    ],
    "fun": [
      "talking about favorite movies",
      "ordering cinema snacks and drinks",
      "chatting about favorite music",
      "talking about pets and outdoor fun",
      "discussing a book club novel",
      "talking about street food recipes",
      "board game night with friends",
      "travel stories and photography",
      "debating film endings and directors",
      "analyzing sports match tactics",
      "telling a funny party story",
      "discussing video game design"
    ]
  },
  "tr": {
    "travel": [
      "kafede kahve sipariş etmek",
      "otele giriş ve oda kaydı yapmak",
      "tren bileti ve peron sormak",
      "yolda adres ve yön tarifi sormak",
      "restoranda masa ayırtmak",
      "araç kiralama ve sigorta sormak",
      "havalimanında kayıp bagaj sormak",
      "eczaneden soğuk algınlığı ilacı",
      "geç çıkış ve fatura sormak",
      "rehberle şehir tarihi konuşmak",
      "kaçan uçuşu yeniden ayarlamak",
      "doktora sağlık şikayeti anlatmak"
    ],
    "work": [
      "ilk iş gününde kendini tanıtmak",
      "kısa bir ekip toplantısı istemek",
      "yazıcı ve ofis düzenini sormak",
      "görüntülü görüşme öncesi sohbet",
      "haftalık toplantıda durum raporu",
      "müşteri sorularına net yanıtlar",
      "teslim tarihini yeniden belirlemek",
      "toplantı sonrası özet yazmak",
      "sözleşme şartlarını müzakere",
      "ekip retrospektifi yönetmek",
      "çeyrek sonuçlarını sunmak",
      "ekip içi fikir ayrılığını çözmek"
    ],
    "study": [
      "derste kendini ve hedefini tanıt",
      "kütüphaneden ders kitabı almak",
      "arkadaştan ders notu istemek",
      "öğrenci yemekhanesinde sipariş",
      "ödev için hocaya soru sormak",
      "grup sunumu hazırlamak",
      "ödev için ek süre talep etmek",
      "sınav hazırlığı üzerine konuşmak",
      "akademik bir makaleyi tartışmak",
      "tez önerisini savunmak",
      "araştırma bursu mülakatı",
      "araştırma bulgularını yorumlamak"
    ],
    "moving": [
      "mahalle bakkalından alışveriş",
      "yeni telefon hattı açtırmak",
      "yeni komşuyla selamlaşmak",
      "çöp toplama günlerini sormak",
      "kiralık ev gezmek ve şartlar",
      "banka hesabı açtırmak",
      "su sızdıran lavaboya tesisatçı",
      "belediyede ikamet kaydı yaptırmak",
      "kira sözleşmesi maddeleri",
      "oto tamircide arıza anlatmak",
      "sağlık sigortası karşılaştırma",
      "okul kaydı hakkında bilgi almak"
    ],
    "family": [
      "akrabalarla hal hatır sormak",
      "ev yemeklerini övmek",
      "hafta sonu planları konuşmak",
      "doğum günü kutlamak ve dilekler",
      "çocukluk anılarını anlatmak",
      "birlikte aile tatili planlamak",
      "büyüklere telefon kurmak",
      "geleneksel yemek tarifleri",
      "eski bir dostla hasret gidermek",
      "kariyer tavsiyesi vermek",
      "eski aile fotoğraflarına bakmak",
      "bayram yemeğinde bir araya gelmek"
    ],
    "fun": [
      "sevilen filmler hakkında sohbet",
      "sinemada atıştırmalık almak",
      "sevilen müzik türleri ve şarkılar",
      "evcil hayvanlar üzerine sohbet",
      "okunan romanı tartışmak",
      "sokak lezzetleri ve tarifler",
      "kutu oyunu gecesinde sohbet",
      "tatil ve gezi fotoğrafları",
      "film finallerini tartışmak",
      "maç analizi ve spor taktikleri",
      "komik bir tatil anısı anlatmak",
      "video oyunu tasarımı konuşmak"
    ]
  },
  "es": {
    "travel": [
      "pedir café en una cafetería",
      "hacer el check-in en el hotel",
      "comprar un billete de tren",
      "pedir indicaciones en la calle",
      "reservar mesa en un restaurante",
      "alquilar un coche con seguro",
      "reclamar equipaje en aeropuerto",
      "comprar medicina en la farmacia",
      "pedir salida tardía del hotel",
      "preguntas de historia al guía",
      "reprogramar un vuelo perdido",
      "explicar síntomas a un médico"
    ],
    "work": [
      "presentarte en tu primer día",
      "programar una reunión de equipo",
      "preguntar dónde está la impresora",
      "charla informal antes de videollamada",
      "resumen de estado en el standup",
      "aclarar dudas de un cliente",
      "negociar una fecha de entrega",
      "enviar resumen tras una reunión",
      "negociar términos de contrato",
      "liderar retrospectiva de equipo",
      "presentar resultados trimestrales",
      "resolver un desacuerdo de equipo"
    ],
    "study": [
      "presentarte en clase de idiomas",
      "pedir un libro en la biblioteca",
      "pedir apuntes a un compañero",
      "pedir comida en la cafetería",
      "consultar dudas con un profesor",
      "planear presentación en grupo",
      "pedir prórroga para un trabajo",
      "hablar sobre hábitos de estudio",
      "debatir un artículo en seminario",
      "defender propuesta de tesis",
      "entrevista para una beca",
      "analizar datos de investigación"
    ],
    "moving": [
      "hacer la compra en el mercado",
      "contratar plan de móvil",
      "saludar a un nuevo vecino",
      "preguntar sobre el reciclaje",
      "visitar un piso de alquiler",
      "abrir cuenta en el banco local",
      "llamar fontanero por una fuga",
      "empadronarse en el ayuntamiento",
      "revisar contrato de alquiler",
      "explicar avería en el taller",
      "comparar seguros de salud",
      "preguntar sobre matrícula escolar"
    ],
    "family": [
      "saludar a familiares y parientes",
      "elogiar una comida casera",
      "hablar sobre planes del fin de semana",
      "felicitaciones de cumpleaños",
      "contar recuerdos de la infancia",
      "organizar viaje de vacaciones",
      "ayudar a configurar una tablet",
      "hablar sobre recetas familiares",
      "ponerse al día con un amigo",
      "dar consejos sobre carrera laboral",
      "mirar fotos familiares antiguas",
      "organizar cena familiar festiva"
    ],
    "fun": [
      "hablar sobre películas y series",
      "pedir comida en el cine o concierto",
      "hablar sobre géneros musicales",
      "hablar de mascotas y aficiones",
      "comentar un libro del club",
      "hablar sobre comida callejera",
      "noche de juegos de mesa",
      "contar anécdotas de viajes",
      "debatir sobre finales de cine",
      "analizar tácticas deportivas",
      "contar anécdota cómica en fiesta",
      "charlar sobre diseño de videojuegos"
    ]
  },
  "fr": {
    "travel": [
      "commander un café au bistrot",
      "faire son enregistrement à hôtel",
      "acheter un billet de train",
      "demander son chemin dans la rue",
      "réserver une table au restaurant",
      "louer une voiture avec assurance",
      "déclarer un bagage égaré",
      "demander un médicament en pharmacie",
      "demander un départ tardif hôtel",
      "poser des questions historiques",
      "réserver un nouveau vol manqué",
      "expliquer ses symptômes au médecin"
    ],
    "work": [
      "se présenter le premier jour",
      "planifier une réunion d équipe",
      "demander où est imprimante",
      "discuter avant un appel vidéo",
      "faire le point de statut hebdo",
      "clarifier les attentes client",
      "négocier un délai de livraison",
      "rédiger un compte rendu réunion",
      "négocier les clauses du contrat",
      "animer une rétrospective équipe",
      "présenter les résultats du trimestre",
      "régler un désaccord dans équipe"
    ],
    "study": [
      "se présenter en cours de langue",
      "emprunter un manuel bibliothèque",
      "demander des notes de cours",
      "commander au restaurant campus",
      "poser des questions au professeur",
      "préparer un exposé en groupe",
      "demander un délai pour un devoir",
      "parler des méthodes de révision",
      "débattre d un article universitaire",
      "soutenir un projet de mémoire",
      "entretien pour une bourse détude",
      "commenter des résultats d étude"
    ],
    "moving": [
      "faire des courses au marché",
      "souscrire un forfait mobile",
      "saluer son nouveau voisin",
      "demander les jours de tri sélectif",
      "visiter un appartement à louer",
      "ouvrir un compte bancaire local",
      "appeler un plombier pour une fuite",
      "déclarer son adresse en mairie",
      "relire le bail de location",
      "expliquer une panne au garage",
      "comparer des offres de mutuelle",
      "inscrire un enfant à l école"
    ],
    "family": [
      "prendre des nouvelles des proches",
      "complimenter un bon plat maison",
      "parler des projets du week-end",
      "souhaiter un joyeux anniversaire",
      "évoquer des souvenirs d enfance",
      "organiser des vacances en famille",
      "aider un proche avec sa tablette",
      "partager des recettes de famille",
      "donner des nouvelles à un ami",
      "conseiller un proche sur sa carrière",
      "regarder de vieilles photos famille",
      "organiser un grand repas de fête"
    ],
    "fun": [
      "parler de ses films préférés",
      "prendre un snack au cinéma",
      "discuter de musique et concerts",
      "parler de ses animaux de compagnie",
      "échanger sur un livre lu au club",
      "parler de cuisine de rue",
      "soirée jeux de société entre amis",
      "partager des photos de vacances",
      "débattre de la fin d un film",
      "analyser un match de football",
      "raconter une mésaventure drôle",
      "parler de jeux vidéo et graphismes"
    ]
  },
  "pt_BR": {
    "travel": [
      "pedir café em uma padaria local",
      "fazer check-in no hotel",
      "comprar passagem de trem na estação",
      "pedir informações de caminho",
      "reservar mesa em restaurante",
      "alugar carro com seguro incluso",
      "reclamar bagagem extraviada",
      "comprar remédio na farmácia",
      "pedir check-out tardio no hotel",
      "fazer perguntas históricas ao guia",
      "remarcar um voo perdido",
      "explicar sintomas a um médico"
    ],
    "work": [
      "se apresentar no primeiro dia",
      "agendar uma reunião de equipe",
      "perguntar onde fica a impressora",
      "conversa rápida antes da chamada",
      "dar atualização na reunião diária",
      "esclarecer dúvidas com o cliente",
      "negociar prazo de entrega",
      "enviar resumo pós-reunião",
      "negociar termos de contrato",
      "liderar retrospectiva da equipe",
      "apresentar resultados do trimestre",
      "resolver divergência na equipe"
    ],
    "study": [
      "se apresentar na aula de idiomas",
      "pegar livro na biblioteca",
      "pedir anotações a um colega",
      "pedir almoço no refeitório",
      "tirar dúvidas com o professor",
      "planejar apresentação em grupo",
      "pedir extensão de prazo de trabalho",
      "conversar sobre rotina de estudos",
      "debater artigo em seminário",
      "defender proposta de monografia",
      "entrevista para bolsa de pesquisa",
      "analisar dados de pesquisa"
    ],
    "moving": [
      "fazer compras na feira do bairro",
      "contratar plano de celular",
      "dar bom dia ao novo vizinho",
      "perguntar sobre coleta de lixo",
      "visitar apartamento para alugar",
      "abrir conta em banco local",
      "chamar encanador para vazamento",
      "registrar endereço na prefeitura",
      "ler contrato de aluguel",
      "explicar problema mecânico",
      "comparar planos de saúde",
      "tirar dúvidas sobre matrícula escolar"
    ],
    "family": [
      "cumprimentar parentes e família",
      "elogiar a comida caseira",
      "falar sobre planos do fim de semana",
      "parabenizar por aniversário",
      "contar histórias de infância",
      "planejar viagem em família",
      "ajudar parente a usar o celular",
      "conversar sobre receitas de família",
      "colocar a conversa em dia",
      "dar conselho de carreira a parente",
      "relembrar fotos antigas de família",
      "organizar almoço de domingo"
    ],
    "fun": [
      "conversar sobre filmes e séries",
      "pedir lanche no cinema ou show",
      "falar sobre músicas favoritas",
      "conversar sobre pets e hobbies",
      "debater livro do clube de leitura",
      "falar sobre comida de rua",
      "jogar jogos de tabuleiro com amigos",
      "compartilhar fotos de viagem",
      "debater o final de um filme",
      "analisar táticas esportivas",
      "contar história engraçada em festa",
      "conversar sobre jogos eletrônicos"
    ]
  }
};

function toUiLocale(uiLang: string): UiLocale {
  const norm = String(uiLang ?? '')
    .trim()
    .toLowerCase();
  if (norm.startsWith('tr')) return 'tr';
  if (norm.startsWith('es')) return 'es';
  if (norm.startsWith('fr')) return 'fr';
  if (norm.startsWith('pt')) return 'pt_BR';
  return 'en';
}

function toBand(level: Cefr | 'unsure'): LevelBand {
  const resolved: Cefr = level === 'unsure' ? 'A2' : level;
  if (resolved === 'A1' || resolved === 'A2') return 'beginner';
  if (resolved === 'B1' || resolved === 'B2') return 'intermediate';
  return 'advanced';
}

/**
 * Returns 3 distinct suggested Tiny Lesson themes for the given goal, CEFR level, UI language and seed.
 */
export function suggestThemes(goal: Goal, level: Cefr | 'unsure', uiLang: string, seed: number): string[] {
  const locale = toUiLocale(uiLang);
  const safeGoal: Goal = GOALS.includes(goal) ? goal : 'travel';
  const pool = THEMES[locale][safeGoal];
  const band = toBand(level);
  const bandStart = band === 'beginner' ? 0 : band === 'intermediate' ? 4 : 8;

  // Order the 12 themes starting with the learner's level band so seed=0 stays in-band while cycling covers all 12.
  const ordered = [
    ...pool.slice(bandStart, bandStart + 4),
    ...pool.slice(0, bandStart),
    ...pool.slice(bandStart + 4),
  ];

  const offset = Math.abs(Math.trunc(Number.isFinite(seed) ? seed : 0)) % ordered.length;
  const out: string[] = [];
  for (let i = 0; i < ordered.length && out.length < 3; i++) {
    const candidate = ordered[(offset + i) % ordered.length]!;
    if (!out.includes(candidate)) out.push(candidate);
  }
  return out;
}
