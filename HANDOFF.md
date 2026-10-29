# LangCoach — Devir Notu (Claude Code → Antigravity)

Son güncelleme: 2026-10-20. Bu dosya projeyi devralan kod ajanı içindir. Önce bunu, sonra aşağıdaki belgeleri oku.

## 1. Projenin amacı (değişmez)
Google Labs'in **Little Language Lessons** aracı (https://labs.google/lll/en — Tiny Lesson, Slang Hang, Word Cam; Gemini tabanlı) tek seferlik dil alıştırmaları sunuyor ama **hafıza, haftalık plan, günlük görev, ilerleme takibi yok**. LangCoach bu eksik katmanı ekleyen **açık kaynak, dil bağımsız** bir "dil koçu":
- Kişisel profil (ana dil, hedef dil, CEFR seviyesi, amaç, günlük dakika, haftalık gün)
- Kişiye özel haftalık plan + "bugünün görevleri"
- FSRS aralıklı tekrar (ts-fsrs) ile kelime/kalıp tekrarı
- Seri (streak), XP, haftalık hedef
- Sıfır maliyet: backend yok, hesap yok. Claude Code (MCP) modunda dersleri kullanıcının kendi Claude'u yazar; LangCoach sadece durumu saklar. Web modunda (planlanan) kullanıcı kendi Gemini API anahtarını girer.
- Hedef: GitHub'da çok yıldız alan, Duolingo'ya kişisel/AI tabanlı açık kaynak alternatif. **Kalite çıtası tasarım belgesinde.**

Kesin kurallar:
- Ürün adı **LangCoach**. "Google" ve "Little Language Lessons" asla ürün/paket/araç adında geçmez; sadece README'de kaynak gösterme + şu sorumluluk reddi: "LangCoach is an independent project and is not affiliated with, endorsed by, or sponsored by Google."
- Öğrencinin verisi asla sessizce kaybolmaz.
- Ağ çağrısı / telemetri yok (core ve mcp).
- **GitHub'a push, repoyu public yapma, `npm publish` ve main'e merge yalnızca kullanıcı açıkça "yap" dediğinde.**

## 2. Okunacak belgeler (sırayla)
1. `docs/superpowers/specs/2026-10-20-langcoach-design.md` — tasarım/spesifikasyon (bağlayıcı otorite)
2. `docs/superpowers/plans/2026-10-20-langcoach-core-mcp.md` — uygulanan plan (7 görev)
3. `.superpowers/sdd/2026-10-20-langcoach-core-mcp/progress.md` — kayıt defteri: her görev, verilen kararlar ("Ruling:"), ertelenen küçük bulgular
4. `.superpowers/sdd/2026-10-20-langcoach-core-mcp/final-fix-findings.md` ve `final-fix-report.md` — son değerlendirmenin bulguları ve düzeltmeleri
5. `README.md`, `CONTRIBUTING.md`

## 3. Mevcut durum
- Repo: `C:\Users\Acer\Desktop\Projeler\langcoach` (bağımsız git deposu). Remote: https://github.com/oktaybilge1/langcoach (şu an **private**). `main` ve `feat/mvp-core-mcp-web` push edildi (aynı commit).
- Kurulum belgeleri: `docs/INSTALL.md`, `docs/INSTALL.tr.md`, `AGENTS.md`, `CLAUDE.md` (kullanıcı Claude Code'a repo linkini verip "kur" deyince izlenecek adımlar).
- npm paketi **`langcoach@0.1.0` yayınlandı** (2026-10-21, hesap numlock11, 2FA açık; kullanıcı kendi terminalinden publish etti). Registry'den temiz klasöre kurulum + `scripts/smoke-stdio.mjs` testi GEÇTİ: 10 araç, exit 0, stderr boş, data.json oluşmadı. Artık `npx -y langcoach` (Windows: `cmd /c npx -y langcoach`) çalışıyor.
- Arayüz: ayrı UI yok; Claude Code sohbeti arayüz. Kullanıcıya test adımları verildi (`claude mcp add --scope user langcoach -- node .../packages/mcp/dist/index.js`, yeni oturumda `/mcp__langcoach__tutor`). Web PWA henüz yok.
- Repo artık **public** (2026-10-21).
- Kullanıcının makinesine LangCoach kuruldu: `claude mcp add --scope user langcoach "--" cmd /c npx -y langcoach` → `claude mcp get langcoach` = Connected.
- Bulunan hata: PowerShell tırnaksız `--` işaretini siliyor → belgelerdeki Windows komutu "unknown option" veriyordu. Tüm belgelerde `"--"` yapıldı (PowerShell+CMD+bash'te doğrulandı), commit ea31f36, main'e push edildi → CI ilk kez tetiklendi (sonucu kontrol edilmeli).
- npm'deki 0.1.0 README'si eski (tırnaksız `--`). Bir sonraki sürümde (0.1.1) düzelir: `packages/mcp/package.json` version artır → kullanıcı `npm publish -w langcoach --access public` (2FA onayı kullanıcıda).
- Yapı: npm workspaces. `packages/core` (types, dates, schema, store, srs, planner, progress, coach, errors) + `packages/mcp` (npm adı `langcoach`, 10 araç + `tutor` prompt, tsup ile paketleniyor).
- Araçlar: set_profile, get_weekly_plan, get_today, save_lesson, complete_task, get_due_reviews, submit_review, get_progress, export_data, import_data.
- Testler: 92 test geçiyor; typecheck ve build temiz; paket duman testi (`scripts/smoke-stdio.mjs`) geçiyor.
- Sürüm araçları: Node 24 yerelde (hedef >=20), TypeScript 7, vitest 5, zod 4, ts-fsrs 5, @modelcontextprotocol/sdk 1.32, tsup 9.

Komutlar:
```
npm ci
npm run typecheck
npx vitest run
npm run build
```

### ÖNEMLİ YÖN DEĞİŞİKLİĞİ (2026-10-21)
Kullanıcının asıl isteği: **Little Language Lessons'ı kullanan sıradan insanlar için bir arayüz** — Google'ın sitesine Duolingo benzeri özellikler (plan, görev, seri, XP, kelime tekrarı) eklemek. Claude Code/MCP sürümü bunu karşılamıyor (geliştiriciye yönelik). Karar: **Chrome eklentisi** (kullanıcı seçti). labs.google/lll sayfasına yan panel ekler, Tiny Lesson/Slang Hang çıktılarındaki kelimeleri tek tıkla tekrar listesine kaydeder; API anahtarı gerekmez; `packages/core` (planner, srs, progress, Coach) yeniden kullanılır (Store için chrome.storage tabanlı bir uygulama gerekir). Risk: Google DOM değişiklikleri; Chrome Web Store incelemesi. Sıradaki adım: sayfa yapısı keşfi → tasarım belgesi → plan → uygulama.
- Keşif TAMAM: `docs/research/2026-10-21-lll-site-recon.md` (API JSON şekilleri: `/lll/api/insights/{terms,grammar,conversation,detect-objects,object-descriptors}`, fetch ile yakalanabiliyor; 23 hedef dil; 4 arayüz dili).
- Tasarım belgesi YAZILDI: `docs/superpowers/specs/2026-10-21-langcoach-extension-design.md` (MV3, yan panel, otomatik yakalama + toast + geri al, seçili metni kaydet, FSRS tekrar, plan/görev otomatik tamamlama, seri/XP/başarımlar, hatırlatma, 5 arayüz dili, Playwright E2E yerel mock ile). Kullanıcı ONAYLADI (2026-10-21).
- Plan: `docs/superpowers/plans/2026-10-21-langcoach-extension.md` (9 görev). Kayıt defteri: `.superpowers/sdd/2026-10-21-langcoach-extension/progress.md` — hangi görevin bittiğini oradan oku, `Task N: complete` olanları tekrar yapma.
- Büyüme/gelir planı: `docs/growth-and-monetization.md` (ücretsiz+açık kaynak kalır; Sponsors/Ko-fi; Mangudai tanıtımı YAPILMAYACAK (kullanıcı istemedi)).
- Uygulama subagent-driven yöntemle sürüyor. Durum (2026-10-21): Task 1 ✅, Task 2 ✅ (1 düzeltme turu: her kayıtta tam şema doğrulaması), Task 3 ✅ (2 düzeltme turu), Task 4 ✅ (2 düzeltme turu: gönderen kontrolü, içerik doğrulama, bozuk kopya tekilleştirme, unlimitedStorage + 3 yedek, zod jitless), Task 5 ✅ (`0bccff8`), Task 6 ✅ (`ecb43a3`), Task 7 ✅ (`cafd981`), Task 8 ✅ (`7b8764a`), Task 9 ✅ (tamamlandı). **9 görevlik Chrome uzantısı planının (`docs/superpowers/plans/2026-10-21-langcoach-extension.md`) tamamı bitti ve doğrulandı!** Güncel kayıt defteri: `.superpowers/sdd/2026-10-21-langcoach-extension/progress.md`.

### Antigravity Çalışma Günlüğü (Claude Code için tam devir raporu)
Claude Code oturum sınırına takıldıktan sonra Antigravity tarafından tamamlanan ve commitlenen tüm çalışmalar:

1. **Task 5 Tamamlandı (`0bccff8` — `feat(extension): capture LLL lessons with toast, undo and manual save`):**
   - Yarım kalan 5 dildeki (`en`, `tr`, `es`, `fr`, `pt_BR`) toast ve sağ tık menüsü çeviri anahtarları (`apps/extension/public/_locales/*/messages.json`) tamamlandı.
   - `apps/extension/test/content.test.ts` içindeki TypeScript mock tip hatası düzeltildi.
   - 27 test dosyası (272 test), `npm run typecheck` ve `npm run build -w @langcoach/extension` doğrulandı.

2. **Task 6 Tamamlandı (`ecb43a3` — `feat(extension): side panel with onboarding, today, review, plan, progress, settings`):**
   - Saf yardımcı modüller ve birim testleri oluşturuldu:
     - `apps/extension/src/lib/achievements.ts` + `apps/extension/test/achievements.test.ts` (8 rozet eşiği: `first_lesson`, `streak_3`, `streak_7`, `streak_30`, `cards_50`, `cards_100`, `cards_500`, `reviews_100`)
     - `apps/extension/src/lib/deeplink.ts` + `apps/extension/test/deeplink.test.ts` (`siteLangFromUi` + LLL deney bağlantıları)
     - `apps/extension/src/lib/themes.ts` + `apps/extension/test/themes.test.ts` (6 hedef × 5 arayüz dili × 12+ küratörlü Tiny Lesson teması)
   - Mesaj yönlendirici ve güvenlik politikası genişletildi (`apps/extension/src/shared/messages.ts`, `src/background/router.ts`, `src/background/policy.ts`):
     - `createPlan`, `completeReview` mesajları ve `Snapshot.state` eklendi.
     - Yan panelden (extension page) `undo` ve `saveManual` çağrılarına izin verildi (`BOTH_TYPES`).
   - Preact yan panel uygulaması oluşturuldu (`apps/extension/src/sidepanel/`):
     - `main.tsx` (ilk satırda `../background/zod-config` import eder), `App.tsx`, `i18n.ts` (runtime dil değiştirme destekli + `chrome.i18n` uyumlu), `styles.css` (açık/koyu tema, AA kontrast, RTL ve klavye erişilebilirliği).
     - Görünümler: `views/Onboarding.tsx`, `views/Today.tsx`, `views/Review.tsx` (`Space`/`Enter` çevirme, `1–4` puanlama, `speechSynthesis` seslendirme, satır içi çeviri düzenleme, otomatik tekrar görevi tamamlama), `views/Plan.tsx`, `views/Progress.tsx`, `views/Settings.tsx` (profil düzenleme, otomatik kaydetme, hatırlatıcı saati, arayüz dili, JSON dışa/içe aktarma, çift onaylı sıfırlama).
   - 5 dilde (`en`, `tr`, `es`, `fr`, `pt_BR`) tüm yan panel çeviri anahtarları eklendi ve `apps/extension/test/panel.test.tsx` ile hem bileşen davranışları hem de tüm kaynak koddaki `t('...')` anahtarlarının 5 dilde eksiksiz olduğu test edildi (287 test).

3. **Task 7 Tamamlandı (`cafd981` — `feat(extension): optional daily reminder`):**
   - `apps/extension/src/background/reminder.ts` ve `apps/extension/test/reminder.test.ts` oluşturuldu.
   - `nextReminderAt` (DST güvenli yerel saat hesabı), `scheduleReminder` (`chrome.alarms`), `handleReminderAlarm` (yalnızca bugünün görevleri bitmemişse `chrome.notifications.create`) ve bildirim tıklaması (`sidePanel.open` veya LLL sekmesi açma) `src/background/index.ts` ve `router.ts` (`onSettingsChanged`) içine bağlandı (292 test).

4. **Task 8 Tamamlandı (`7b8764a` — `test(extension): end-to-end flows against a local LLL mock`):**
   - `vitest.config.ts` (Playwright `e2e/` klasörünü Vitest'ten ayırır), `apps/extension/e2e/mock-lll/server.ts` (Task 3 gerçek API yanıtlarını sunan yerel HTTP sunucusu), `apps/extension/playwright.config.ts` ve `apps/extension/e2e/extension.spec.ts` oluşturuldu.
   - `apps/extension/scripts/build.mjs` güncellendi: yalnızca `--mode e2e` verildiğinde `dist/manifest.json` içine `http://localhost/*` ve `http://127.0.0.1/*` eklenir; üretim (`npm run build`) manifest'inde localhost bulunmadığı `manifest.test.ts` ile garanti altına alındı.
   - `apps/extension/src/content/toast.ts` güncellendi: `__E2E__` modunda shadow root `'open'` (Playwright erişimi için), üretim ve birim testlerinde `'closed'`.
   - 13 senaryoyu kapsayan 5 Playwright E2E testi gerçek Chromium + MV3 uzantısı üzerinde çalıştırıldı ve tamamı geçti (`5 passed`).

5. **Task 9 Tamamlandı (Paketleme, Belgeler, Mağaza Metni ve CI):**
   - `apps/extension/scripts/zip.mjs`: Sıfır ek bağımlılıkla (`node:zlib` + CRC32 + ZIP yerel/merkezi dizin yazıcısı) `apps/extension/dist/` içeriğini kök dizinde `manifest.json` olacak şekilde `apps/extension/langcoach-extension-0.1.0.zip` olarak paketler (`npm run zip -w @langcoach/extension`).
   - Belgeler oluşturuldu: `docs/PRIVACY.md`, `docs/extension/STORE_LISTING.md` (EN + TR), `docs/extension/INSTALL.md`, `docs/extension/INSTALL.tr.md`, `.github/FUNDING.yml`.
   - Güncellenen dosyalar: `README.md`, `README.tr.md` (Chrome uzantısı birinci kapı, Claude Code MCP ikinci kapı), `.github/workflows/ci.yml` (`extension-e2e` işi ve ZIP artifact yüklemesi eklendi), `AGENTS.md`.
   - Son durum: **32 Vitest dosyası (292 birim/entegrasyon testi) + 5 Playwright E2E testi + TypeScript typecheck + üretim build + ZIP paketleme tamamen yeşil.**

6. **Kullanıcı Canlı Testi Sonrası UI/UX ve Dayanıklılık İyileştirmeleri (2026-10-21):**
   - **Google Labs 50 Harf Sınırı Düzeltmesi:**
     - Kullanıcı canlı testinde 'su kaçıran mutfak lavabosu için tesisatçı çağırmak' (51 karakter) temasını denerken Google'ın giriş kutusundaki 50/50 sınırına takıldığı ve Next.js'in çöktüğü gözlemlendi.
     - `apps/extension/src/lib/themes.ts` içindeki 5 dilde (`en`, `tr`, `es`, `fr`, `pt_BR`) 360 temanın tamamı strictly **<= 40 karakter** olacak şekilde kısaltıldı.
     - `apps/extension/test/themes.test.ts` içine tüm temaların `<= 45` karakter olduğunu garanti eden test eklendi.
   - **Tek Tıkla Kutuya Yazdırma (`fillTheme`):**
     - `apps/extension/src/content/isolated.ts` içine `fillTheme` mesaj dinleyicisi eklendi.
     - `Today.tsx` içine `[Kutuya Yaz]` butonu konuldu; kullanıcı kopyala-yapıştır yapmadan tek tıkla Google'ın giriş kutusuna temayı otomatik doldurur.
   - **Sekme Yeniden Kullanımı (`openExperimentUrl`):**
     - Google Labs Next.js doğrudan yeni sekmede açıldığında `next-intl` bağlam eksikliğinden çökebiliyordu. `openExperimentUrl` fonksiyonu mevcut açık `labs.google/lll` sekmesini güncelleyecek şekilde geliştirildi.
   - **Doğrudan Kelime Listesi (Sözlük Görünümü):**
     - Kullanıcı geri bildirimi: *"tek tek cevabı göster iyi kötü seç falan sevmedim, kelimeler listelensin işte direkt"*.
     - `Review.tsx` içine `[ 📋 Kelime Listesi ]` ve `[ 🎴 Kart Modu ]` seçenekleri eklendi, kullanıcının tercihi `localStorage`'da saklanıyor.
     - Liste görünümünde: arama kutusu, kelime, telaffuz dinleme (🔊), satır içi Türkçe çeviri düzenleme (✏️ [Düzenle]), ve tek tıkla [✅ Öğrendim (+5 XP)] butonu yer alıyor.
   - **Kullanıcının Ürün Vizyonu ("Google bile keşke böyle çıkarsaydık demeli"):**
     - Sonraki adımlar için yol haritası: Otomatik Türkçe çeviri katmanı, interaktif mini quiz/eşleştirme alıştırmaları, sayfa içi zenginleştirme butonları ve Web Speech mikrofon telaffuz değerlendirmesi.

## 4. Yarım kalan iş (buradan devam et)
Son düzeltmeler (F1–F10, N1–N4) yapıldı ve bağımsız değerlendiriciden geçti. Kalanlar:
1. CI'ın GitHub Actions'ta (Windows/macOS/Linux + pack-smoke) geçtiğini doğrula; kırılırsa düzelt.
2. Kullanıcı `npm login` yaptıktan sonra: `npm publish -w langcoach --access public` (prepack build alır). Sonra temiz bir klasörde `npx -y langcoach` ile dene.
3. Repoyu public yap (GitHub → Settings → Change visibility) — npm yayınıyla aynı anda; topics/Discussions ayarları.
4. Kayıt defterindeki "can wait" küçük bulguları (cardsReviewed üst sınırı, lessonId varlık kontrolü, dönen .bak yedeği vb.) — isteğe bağlı.
5. **Gerçek Claude Code uçtan uca test:** `claude mcp add langcoach -- node <abs>/packages/mcp/dist/index.js` (Windows'ta npx için `cmd /c` gerekir), tutor prompt ile profil → plan → ders → görev tamamla → `~/.langcoach/data.json` güncelleniyor mu.

## 5. Sonraki büyük işler (duyurudan önce hepsi gerekli — tasarım belgesindeki "Launch quality bar")
1. **Web PWA (ayrı plan yazılmalı):** `apps/web`, aynı `packages/core`'u kullanır; kullanıcının kendi Gemini API anahtarı (tarayıcıda, açıkça belgelenmiş risk); Tiny Lesson + Slang Hang modları, sonra Word Cam (kamera); IndexedDB; JSON dışa/içe aktarma (MCP ile aynı format); i18n (EN varsayılan, TR ilk çeviri); GitHub Pages'e canlı demo (`https://oktaybilge1.github.io/langcoach`). İsteğe bağlı "Google'ın aracında aç" düğmesi + "bitirdim" işaretleme.
2. README hero GIF'i (`docs/media/demo.gif`), sosyal önizleme görseli (1280×640).
3. `npm publish` (kullanıcı onayıyla), v0.1.0 release.
4. Repo ayarları: topics, Discussions, Pages, main dal koruması; good-first-issue'lar.
5. Duyuru: Show HN, r/languagelearning, r/opensource, Product Hunt, LinkedIn/X, Türk toplulukları; ardından içerik üreticiler (sponsorlu içerikte reklam etiketi zorunlu).

## 6. Çalışma tarzı
- Önce test yaz (TDD), küçük ve odaklı dosyalar, her mantıklı adımda commit.
- Kararlarını `progress.md`'ye "Ruling: <karar> — <neden> — <yanlışsa maliyeti>" biçiminde ekle.
- Kullanıcı Türkçe konuşuyor; açıklamaları Türkçe yap, kod/README İngilizce (TR README ayrı).

> **GÜNCEL-6 (2026-10-28):** Yerel klasör silinmişti → GitHub'dan yeniden klonlandı (Desktop\Projeler\langcoach). Kaybolan Task 6 A/B/C bölümleri yeniden yazıldı ve push edildi (e59ad91, c160580, 598febd); kalıcı plan: `docs/superpowers/plans/2026-10-28-extension-v2-finish.md` (DERS: commit'lenmemiş/pushlanmamış iş kaybolabilir → ajanlar her adımda commit+push yapsın; `.superpowers` defteri depoda yok, kalıcı bilgi docs/ altında tutulmalı). Kalan: Task 6 D (panel UI: Words hub, Today/Progress/Onboarding/Settings), Task 7 (cila, e2e, 0.2.0 zip). Anki/Quizlet/CSV dışa aktarma ayrı worktree dalında yazılıyor (core `export-cards.ts`, MCP `export_cards`, Ayarlar düğmeleri, docs/ANKI*.md) → Task 6 bitince main'e birleştir.
> **Agensi (skill pazar yeri) teklifi:** Premium skill AÇIK REPODA DEĞİL: `C:\Users\Acer\Desktop\Projeler\langcoach-skill\` (langcoach-tutor/ + zip-skill.mjs + langcoach-tutor-skill.zip). Test oturumunda uçtan uca çalıştı (profil, plan, ders kaydı). Konumlandırma: "unutmayan, planı olan, kişisel hayata göre ders veren, verisi kullanıcıda kalan öğretmen". Satış için kullanıcı Agensi hesabı + Stripe KYC yapmalı.
> **Bilinen tuzak:** `npx -y langcoach` repo klasörünün İÇİNDE çalıştırılırsa yerel workspace paketine çözülür ve MCP bağlanamaz; başka klasörlerde çalışır (INSTALL belgesine eklenecek).

> **GÜNCEL-7 (2026-10-28, kullanım sınırı):** Arka planda 2 ajan çalışıyor/çalışmıştı: (1) Task 6 D (panel UI: Words hub, Today/Progress/Onboarding/Settings) main'e küçük commit+push ile ilerliyor (`git log origin/main`); (2) Anki/Quizlet/CSV dışa aktarma: worktree dalı `worktree-agent-ab96bc02ffd4c33ac` (klasör `.claude/worktrees/agent-ab96bc02ffd4c33ac`), son bilinen commit 78b9113, 675 test; bağımsız değerlendirme "With fixes" → ajana verilen düzeltmeler: CSV'ye UTF-8 BOM (yalnızca CSV), GUID temizleme, MCP 2 MB sınırı JSON üzerinden, hata metni, test global sızıntısı, LF kuralı. ADIMLAR: (a) o dalın son commit'lerini kontrol et, `npx vitest run` yeşilse main'e birleştir (Settings.tsx ve _locales/*.json'da küçük çatışma beklenir; main'in commitlenmemiş locale değişiklikleri önce commitlenmeli); (b) Task 6 D'nin bittiğini doğrula (tam test + e2e); (c) Task 7 (docs/superpowers/plans/2026-10-28-extension-v2-finish.md); (d) MCP 0.2.0 yayını (export_cards için) kullanıcı 2FA ile; (e) skill: `Desktop\Projeler\langcoach-skill\` (zip güncel). GitHub Actions hiç çalışmamış: repo Settings > Actions kontrol edilmeli. Güvenlik incelemesi eklentisi son commit için HTTP 429 verdi (log: C:\Users\Acer\.claude\security\log.txt).

> **GÜNCEL-8 (2026-10-29):** Task 6 TAMAM (A–D; 695 test, e2e 9/9) ve Anki/Quizlet/CSV dışa aktarma main'e BİRLEŞTİRİLDİ (5f3793f; 736 test, typecheck+build+e2e 9/9 yeşil; CSV'de UTF-8 BOM, GUID temizleme, 2 MB sınırı). Şu an: Task 7 (a11y cilası, v2 belgeleri, CHANGELOG, 0.2.0 sürümleri, mağaza zip'i `apps/extension/langcoach-extension-0.2.0.zip`, doğrulama betiği) arka planda; rapor: `docs/superpowers/reports/task-7-report.md`.
> **Kullanıcının yapacakları (0.2.0 için):** (1) `npm publish -w langcoach --access public` (MCP 0.2.0, `export_cards` aracı; 2FA) — sonra temiz klasörde `npx -y langcoach` + `scripts/smoke-stdio.mjs` ile dene; (2) Chrome Web Store (bir kerelik 5 $) / Edge Add-ons'a zip yükleme; (3) GitHub Settings → Actions'ı etkinleştirme (CI hiç çalışmadı); (4) demo GIF'i (docs/media/README.md); (5) isteğe bağlı: Agensi hesabı + Stripe KYC → `langcoach-skill\langcoach-tutor-skill.zip`.
> **Doğrulanmamış (canlı sitede elle bakılmalı):** startScenario'nun gerçek labs.google/lll sayfasındaki splash + dil seçimi + Generate akışı (yalnızca jsdom ve Playwright mock'ta test edildi); Türkçe satır kaplaması (native overlay) gerçek LLL DOM'unda.

> **GÜNCEL-9 (2026-10-29): 0.2.0 YAYINA HAZIR.** Task 7 bitti (0abb3a4). Bağımsız doğrulama: 756 test + typecheck + e2e 9/9; üretim zip'i `apps/extension/langcoach-extension-0.2.0.zip` (199 KB; manifest kökte, 6 izin: alarms/contextMenus/notifications/sidePanel/storage/unlimitedStorage, tek host `https://labs.google/lll/*`, localhost ve e2e izi yok, 5 dil, 4 ikon); `npm pack` = LICENSE, README.md, dist/index.js, package.json (langcoach@0.2.0, 11 araç). Yan worktree temizlendi. **Kullanıcıdan kalanlar:** `npm publish -w langcoach --access public` (2FA); Chrome Web Store/Edge'e zip (+ GitHub Release v0.2.0, repoda hiç tag yok); GitHub Settings → Actions'ı aç; demo GIF/ekran görüntüleri (docs/media/README.md); canlı sitede startScenario + Türkçe satır kaplamasını elle dene; gerçek ekran okuyucu testi yapılmadı; Edge/Brave'de Translator API denenmedi.
