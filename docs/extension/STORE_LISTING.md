# Chrome Web Store & Microsoft Edge Add-ons Listing

Copy-ready texts for the store dashboards. Every claim below matches the 0.2.0 code (permissions in `apps/extension/public/manifest.json`, no network requests, features in the README).

## Metadata

- **Name (English):** LangCoach: Study Plan & Spaced Repetition
- **Name (Turkish):** LangCoach: Çalışma Planı ve Aralıklı Tekrar
- **Name in the manifest:** `LangCoach` (`__MSG_extName__`, all locales)
- **Category:** Education
- **Version:** 0.2.0
- **Package:** `apps/extension/langcoach-extension-0.2.0.zip` (`npm run build` then `npm run zip -w @langcoach/extension`)
- **Primary language:** English (also `tr`, `es`, `fr`, `pt_BR`)
- **Minimum Chrome:** 116
- **Website / support:** https://github.com/oktaybilge1/langcoach (issues: https://github.com/oktaybilge1/langcoach/issues)
- **Privacy policy URL:** https://github.com/oktaybilge1/langcoach/blob/main/docs/PRIVACY.md

---

## English listing

### Short description (≤ 132 characters)

Weekly plan, practice sessions, spaced-repetition reviews (FSRS), streak and XP for Little Language Lessons. Local data only.

### Detailed description

Turn one-off exercises on Little Language Lessons (`labs.google/lll`) into a daily habit. LangCoach opens a side panel next to the page, saves the words from every lesson you generate, and brings them back in short practice sessions and scheduled reviews.

**What you get**
- **Automatic capture:** words, phrases, pronunciation and grammar notes from Tiny Lesson, Slang Hang and Word Cam are saved to your deck as you use them, with one-click Undo. Select any text and right-click "Save to LangCoach" to add it yourself.
- **Practice sessions:** about ten quick exercises of six kinds (pick the meaning, pick the word, listen, match pairs, type the word, fill the blank). Forgiving checks for accents and small typos; missed words come back at the end.
- **Spaced repetition (FSRS):** every word gets a review date, so you see it again shortly before you would forget it. Flip-card mode with keyboard shortcuts (`Space` to flip, `1–4` to rate).
- **Words hub:** your words grouped by lesson situation, with search, filters (Due, New, Weak, Favorites, Mastered), a strength meter, favorites, pronunciation and "I know this".
- **Daily goal and streak:** pick 10, 20, 30 or 50 XP a day. Keep your streak; you earn a streak freeze for every 7 days of streak, and it covers a missed day automatically.
- **Levels and achievements**, plus a 7-day XP chart.
- **One-tap scenarios:** pick a suggested situation and LangCoach selects your language in Tiny Lesson, fills in the purpose and presses Generate.
- **Your native language, on device:** in desktop Chrome 138+, captured words can also be translated into your own language with Chrome's built-in Translator API. The translation runs in the browser.
- **Export:** Anki, Quizlet and CSV files, plus a JSON backup you can import again. Files are created on your device.
- **23 target languages, 5 interface languages** (English, Türkçe, Español, Français, Português (Brasil)), with right-to-left card support.

**Private by design**
No account, no API key, no servers and no analytics. LangCoach itself makes no network requests; your data stays in your browser (`chrome.storage.local`). The 🔊 button uses your browser's speech voices; for some voices the browser vendor may process the spoken text. On-device translation uses Chrome's built-in Translator API; Chrome may download the language model the first time.

**Disclaimer:** LangCoach is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Google.

---

## Türkçe mağaza metni

### Kısa açıklama (≤ 132 karakter)

Little Language Lessons için haftalık plan, alıştırma oturumları, aralıklı tekrar (FSRS), seri ve XP. Veriler yalnızca cihazında.

### Ayrıntılı açıklama

Little Language Lessons (`labs.google/lll`) üzerindeki tek seferlik alıştırmaları günlük bir alışkanlığa dönüştür. LangCoach sayfanın yanında bir yan panel açar, ürettiğin her dersteki kelimeleri kaydeder ve onları kısa alıştırma oturumlarında ve zamanlanmış tekrarlarda geri getirir.

**Neler var**
- **Otomatik yakalama:** Tiny Lesson, Slang Hang ve Word Cam'deki kelimeler, ifadeler, telaffuz ve dilbilgisi notları sen kullandıkça destene kaydedilir; tek tıkla Geri Al. Herhangi bir metni seçip sağ tıklayarak "LangCoach'a kaydet" ile kendin de ekleyebilirsin.
- **Alıştırma oturumları:** altı türde yaklaşık on kısa alıştırma (anlamı seç, kelimeyi seç, dinle, eşleştir, kelimeyi yaz, boşluğu doldur). Aksan ve küçük yazım hatalarına hoşgörülü kontrol; bilemediğin kelimeler sonda tekrar gelir.
- **Aralıklı tekrar (FSRS):** her kelimeye bir tekrar tarihi verilir; kelimeyi unutmadan biraz önce yeniden görürsün. Klavye kısayollu kart modu (`Boşluk` ile çevir, `1–4` ile puanla).
- **Kelimeler merkezi:** kelimelerin ders durumuna göre gruplanmış; arama, filtreler (Tekrar zamanı, Yeni, Zayıf, Favoriler, Öğrenildi), güç göstergesi, favoriler, telaffuz ve "Bunu biliyorum".
- **Günlük hedef ve seri:** günde 10, 20, 30 ya da 50 XP seç. Serini koru; serinin her 7 gününde bir dondurma hakkı kazanırsın ve bu hak kaçırdığın bir günü otomatik olarak korur.
- **Seviyeler ve rozetler**, ayrıca 7 günlük XP grafiği.
- **Tek dokunuşla senaryolar:** önerilen bir durumu seç; LangCoach Tiny Lesson'da dilini seçer, amacı yazar ve Generate'e basar.
- **Ana dilinde, cihaz üzerinde:** masaüstü Chrome 138+ sürümünde yakalanan kelimeler, Chrome'un yerleşik Translator API'siyle kendi diline de çevrilebilir. Çeviri tarayıcıda yapılır.
- **Dışa aktarma:** Anki, Quizlet ve CSV dosyaları ile tekrar içe aktarabileceğin bir JSON yedeği. Dosyalar cihazında oluşturulur.
- **23 hedef dil, 5 arayüz dili** (Türkçe, English, Español, Français, Português (Brasil)); sağdan sola kart desteği.

**Gizlilik esaslı**
Hesap, API anahtarı, sunucu ve analiz aracı yok. LangCoach'ın kendisi hiçbir ağ isteği yapmaz; verin tarayıcında (`chrome.storage.local`) kalır. 🔊 düğmesi tarayıcının konuşma seslerini kullanır; bazı seslerde okunan metin tarayıcı üreticisi tarafından işlenebilir. Cihaz üzerinde çeviri Chrome'un yerleşik Translator API'sini kullanır; Chrome ilk seferde dil modelini indirebilir.

**Sorumluluk reddi:** LangCoach bağımsız bir açık kaynak projesidir; Google ile bağlantılı değildir, Google tarafından onaylanmamış ya da desteklenmemiştir.

---

## Screenshots (1280×800, PNG) — to be recorded

Placeholders; see [docs/media/README.md](https://github.com/oktaybilge1/langcoach/blob/main/docs/media/README.md) for the shot list and setup. None of these files exist yet.

1. `docs/media/store-1-today.png`: side panel next to Tiny Lesson: goal ring, streak flame, scenario cards, and the on-page toast "20 words saved".
2. `docs/media/store-2-practice.png`: a practice exercise (pick the meaning) with the feedback sheet.
3. `docs/media/store-3-words.png`: Words hub with groups, filters, strength meters and a favorite.
4. `docs/media/store-4-progress.png`: Progress with level bar, week XP chart and achievements.
5. `docs/media/store-5-export.png`: Settings with Export cards (Anki / Quizlet / CSV) and the local-data note.

Optional small promo tile (440×280): logo plus "Plan · Practice · Review".

---

## Privacy practices answers (Chrome Web Store dashboard)

- **Single purpose:** a study companion for Little Language Lessons (`https://labs.google/lll/*`): it saves the words from your lessons and gives you a plan, practice and spaced-repetition reviews in a side panel.
- **Does the extension collect or transmit user data?** **No.** Nothing is collected or transmitted. All data is stored locally in `chrome.storage.local`.
- **Data usage disclosures:** check none of the data categories (no personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity or website content is collected). Certify: not sold, not used for unrelated purposes, not used for creditworthiness.
- **Remote code:** No. All code is in the package; no remote scripts, no `eval`.
- **Permission justifications:**
  - `storage`: stores the learner's profile, plan, cards, progress and settings locally.
  - `unlimitedStorage`: a large deck plus a few rolling local safety backups can exceed the default 10 MB extension storage quota; this keeps them from being cut off.
  - `sidePanel`: shows the LangCoach UI next to Little Language Lessons.
  - `contextMenus`: the "Save to LangCoach" right-click item for selected text on `https://labs.google/lll/*`.
  - `alarms`: the daily rollover (streak and freezes) and the optional, user-set daily reminder.
  - `notifications`: shows the optional daily reminder.
  - Host permission `https://labs.google/lll/*`: captures the lesson results the user generates, shows the in-page toast and translation lines, and fills the Tiny Lesson form when the user starts a scenario.
- **Third-party processing to mention in the description:** the 🔊 button uses the browser's speech voices (some voices are processed by the browser vendor); on-device translation uses Chrome's built-in Translator API (the model is downloaded by Chrome).

## Microsoft Edge Add-ons

Use the same English and Turkish texts. Chrome's built-in Translator API may be missing in Edge or Brave; LangCoach detects that and then simply keeps the lesson's own meanings. Everything else works the same.
