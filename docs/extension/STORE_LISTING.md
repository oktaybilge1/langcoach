# Chrome Web Store & Microsoft Edge Add-ons Listing

## Metadata

- **Name (English):** LangCoach — Study Plan & Spaced Repetition
- **Name (Turkish):** LangCoach — Çalışma Planı ve Aralıklı Tekrar
- **Category:** Education
- **Version:** 0.1.0
- **Primary Language:** English (with `tr`, `es`, `fr`, `pt_BR` locales)

---

## English Listing

### Short Description (≤ 132 characters)

Weekly study plan, spaced-repetition flashcards (FSRS), streak & XP for Google Labs' Little Language Lessons. 100% local.

### Detailed Description

Turn one-off language exercises on Google Labs' Little Language Lessons (`labs.google/lll/*`) into a daily habit with a weekly study plan, automatic vocabulary capture, spaced-repetition flashcards, streaks, and XP.

**How it works:**
- **Automatic lesson capture:** As you use Tiny Lesson, Slang Hang, or Word Cam on `labs.google/lll/*`, LangCoach automatically saves new words, phrases, idioms, pronunciation, and grammar points into your personal deck—with a quick Undo button whenever you want to skip a lesson.
- **Weekly study plan:** Pick your target language (23 languages supported), CEFR level (A1–C2), learning goal (travel, work, study, moving, family, fun), daily minutes, and study days per week.
- **Spaced repetition (FSRS):** Review due flashcards inside the browser Side Panel with keyboard shortcuts (`Space` to flip, `1–4` to rate Again / Hard / Good / Easy) and built-in pronunciation audio (`speechSynthesis`).
- **Right-click to save:** Highlight any word or phrase on Little Language Lessons and select "Save to LangCoach".
- **Progress & achievements:** Track your daily streak, total XP, level, words learned, and unlock milestone badges.
- **100% local & private:** Zero accounts, zero servers, zero analytics, and zero network requests. Your data stays in `chrome.storage.local` and can be exported/imported as JSON anytime.

**Disclaimer:** LangCoach is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Google.

---

## Türkçe Mağaza Metni (Turkish Listing)

### Kısa Açıklama (≤ 132 karakter)

Google Labs Little Language Lessons için haftalık plan, aralıklı tekrar kartları (FSRS), seri ve XP koçu. %100 yerel ve reklamsız.

### Detaylı Açıklama

Google Labs'in Little Language Lessons (`labs.google/lll/*`) deneylerindeki tek seferlik alıştırmaları haftalık çalışma planı, otomatik kelime yakalama, aralıklı tekrar kartları, günlük seri ve XP ile düzenli bir dil öğrenme alışkanlığına dönüştürün.

**Öne Çıkan Özellikler:**
- **Otomatik Ders Yakalama:** Tiny Lesson, Slang Hang veya Word Cam kullandığınızda yeni kelimeleri, deyimleri, telaffuzları ve dilbilgisi notlarını otomatik olarak kişisel destenize kaydeder (tek tıkla Geri Al seçeneğiyle).
- **Haftalık Çalışma Planı:** Hedef dilinizi (23 dil), CEFR seviyenizi (A1–C2), hedefinizi (seyahat, iş, eğitim, taşınma, aile, eğlence), günlük sürenizi ve haftalık çalışma günlerinizi seçin.
- **Aralıklı Tekrar (FSRS):** Yan panelde vadesi gelen kelime kartlarını klavye kısayolları (`Boşluk` ile çevir, `1–4` ile puanla) ve sesli telaffuz desteğiyle tekrar edin.
- **Sağ Tıkla Kaydet:** Sayfadaki herhangi bir kelimeyi seçip sağ tıklayarak "LangCoach'a kaydet" ile destenize ekleyin.
- **%100 Yerel ve Gizli:** Hesap, sunucu, takip kodu veya ağ isteği yoktur. Tüm veriniz tarayıcınızda (`chrome.storage.local`) saklanır; istediğiniz zaman JSON olarak dışa/içe aktarabilirsiniz.

**Sorumluluk Reddi:** LangCoach bağımsız bir açık kaynak projesidir; Google ile bağlantılı değildir, Google tarafından onaylanmamış ya da desteklenmemiştir.

---

## Screenshots Plan (1280×800 or 640×400)

1. `docs/media/store-1-today.png` — Side panel open next to Tiny Lesson showing Today's ring, streak, suggested theme, and on-page toast (`✓ 20 words saved to LangCoach`).
2. `docs/media/store-2-review.png` — FSRS flashcard review in the side panel with pronunciation button and Again/Hard/Good/Easy ratings.
3. `docs/media/store-3-plan.png` — Weekly study plan (Mon–Sun) tailored to learner's goal and daily minutes.
4. `docs/media/store-4-progress.png` — Progress & unlocked achievements grid.
5. `docs/media/store-5-privacy.png` — Settings tab showing JSON export/import and 100% local storage guarantee.

---

## Privacy Practices Answers (Chrome Web Store Dashboard)

- **Single purpose description:** Provides a personal study plan, automatic vocabulary capture, and spaced-repetition flashcard reviews alongside Google Labs' Little Language Lessons (`https://labs.google/lll/*`).
- **Does this extension collect or transmit any user data?** **No.** All data is stored locally on the user's device via `chrome.storage.local`.
- **Permission justifications:**
  - `storage`: Stores the learner's profile, weekly plan, flashcards, and settings locally.
  - `unlimitedStorage`: Ensures large flashcard decks and rolling safety backups are never truncated by the 10 MB default quota.
  - `sidePanel`: Displays the LangCoach study plan and flashcard review UI next to Little Language Lessons.
  - `alarms`: Triggers the optional user-configured daily study reminder.
  - `notifications`: Displays the optional daily study reminder notification.
  - `contextMenus`: Adds the "Save to LangCoach" right-click menu item on `https://labs.google/lll/*`.
  - `host_permissions` (`https://labs.google/lll/*`): Captures lesson responses generated during the user's own Little Language Lessons sessions and renders the in-page confirmation toast.
