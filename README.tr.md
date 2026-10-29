# LangCoach

[English](https://github.com/oktaybilge1/langcoach/blob/main/README.md) | **Türkçe**

[![CI](https://github.com/oktaybilge1/langcoach/actions/workflows/ci.yml/badge.svg)](https://github.com/oktaybilge1/langcoach/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/langcoach)](https://www.npmjs.com/package/langcoach)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/oktaybilge1/langcoach/blob/main/LICENSE)

**[Little Language Lessons](https://labs.google/lll/en) ve Claude Code için kişisel dil koçun: haftalık plan, günlük görevler, alıştırma oturumları, aralıklı tekrar (FSRS), seri ve XP.**

<!-- Tanıtım GIF'i ve ekran görüntülerini proje sahibi kaydedecek; çekim listesi docs/media/README.md içinde. docs/media/extension-demo.gif hazır olunca görsel buraya eklenecek. -->

Tek seferlik yapay zekâ dil alıştırmaları harika ama sekmeyi kapattığın anda seni unutuyor. **LangCoach** eksik olan yapıyı (kişisel haftalık plan, otomatik kelime yakalama, alıştırma oturumları, FSRS tekrarları, günlük hedef, seri ve XP) iki kapıdan sunar:

1. **Tarayıcı uzantısı (Chrome / Edge / Brave):** [Google Labs Little Language Lessons](https://labs.google/lll/en) sayfasının hemen yanında bir yan panel açar; ürettiğin her Tiny Lesson, Slang Hang ve Word Cam sonucunu yakalar, alıştırmaya ve tekrara dönüştürür.
2. **Claude Code MCP sunucusu:** Terminalde Claude Code'a derslerin, tekrarların ve haftalık planın için kalıcı bir hafıza kazandırır.

- **API anahtarı, hesap ya da sunucu yok.**
- **Yerel veri:** LangCoach hiçbir ağ isteği yapmaz; verin bilgisayarında kalır ([Gizlilik Politikası](https://github.com/oktaybilge1/langcoach/blob/main/docs/PRIVACY.md)).

## 1. Tarayıcı uzantısı (Little Language Lessons koçu)

<!-- TODO: Mağaza onayından sonra Chrome Web Mağazası ve Edge rozetleriyle değiştirilecek -->
**Chrome'a Ekle (yakında)** · **[ZIP'ten kurulum (Paketlenmemiş öğe yükle)](https://github.com/oktaybilge1/langcoach/blob/main/docs/extension/INSTALL.tr.md)**

- **Otomatik yakalama:** `https://labs.google/lll/*` üzerinde Tiny Lesson, Slang Hang veya Word Cam kullandığında kelimeler, ifadeler, telaffuz ve dilbilgisi notları destene kart olarak eklenir; tek tıkla Geri Al ve seçili her metin için sağ tıkla "LangCoach'a kaydet" var.
- **Bugün:** günlük XP hedef halkası, seri alevin ve seri dondurma hakların, haftalık plandan bugünün görevleri ve **tek dokunuşla başlatılan** üç senaryo önerisi (LangCoach Tiny Lesson'da dilini seçer, durumu yazar ve Generate'e basar; sayfa hazır değilse metni senin için kopyalar).
- **Alıştırma oturumları:** altı türde yaklaşık on kısa alıştırma (anlamı seç, kelimeyi seç, dinle ve seç, eşleştir, kelimeyi yaz, boşluğu doldur); büyük/küçük harf, aksan, tek harflik hata ve romanizasyona karşı hoşgörülü kontrol; bilemediğin kelimeler sonda tekrar gelir; kombo sayacı, isteğe bağlı sesler ve kusursuz oturum bonusu.
- **Kelimeler merkezi:** tüm kelimelerin ders durumuna göre gruplanmış; arama, filtreler (Tümü / Tekrar zamanı / Yeni / Zayıf / Favoriler / Öğrenildi), FSRS takviminden güç göstergesi, favoriler, 🔊, kendi çevirini yerinde düzenleme, "Bunu biliyorum" ve kart çevirme modu (`Boşluk` ile çevir, `1–4` ile puanla).
- **Günlük hedef ve seri dondurma:** günde Rahat 10 / Düzenli 20 / Ciddi 30 / Yoğun 50 XP seç. Serinin her 7 gününde bir dondurma hakkı kazanırsın; elindeki hak kaçırdığın bir günü otomatik olarak korur.
- **Seviyeler ve rozetler:** toplam XP'ye göre adlandırılmış seviyeler, 7 günlük XP grafiği ve rozetler (ilk ders, seriler, deste büyüklüğü, kusursuz oturum, bir günde 100 XP ve daha fazlası).
- **Ana diline cihaz üzerinde çeviri:** masaüstü Chrome'da yerleşik Translator API ile (Chrome 138+), yakalanan kelimeler kendi dilinde de bir anlam alır; panelde ve ders sayfasında kelimelerin altında görünür. Çeviri tarayıcıda yapılır; LangCoach hiçbir yere bir şey göndermez. API yoksa kartlar dersin verdiği anlamla kalır.
- **Dışa aktarma:** Ayarlar'dan Anki (metin içe aktarma), Quizlet ve CSV dosyaları ile tekrar içe aktarabileceğin bir JSON yedeği. Dosyalar yerelde oluşturulur.
- **23 LLL hedef dili ve 5 arayüz dili:** Türkçe, English, Español, Français, Português (Brasil); RTL kart desteğiyle.
- **Ağ isteği yok:** uzantının kendisi hiçbir ağ isteği yapmaz ve analiz aracı içermez; desten `chrome.storage.local` içinde kalır. 🔊 düğmesi tarayıcının konuşma seslerini kullanır; bazı seslerde okunan metin tarayıcı üreticisinin sunucularında işlenebilir.

## 2. Claude Code MCP sunucusu

[Node.js](https://nodejs.org) 20+ ve [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (oturumu açık) gerekir.

macOS / Linux / WSL:

```bash
claude mcp add --scope user langcoach "--" npx -y langcoach
```

Windows (yerel PowerShell/CMD, WSL değil):

```bash
claude mcp add --scope user langcoach "--" cmd /c npx -y langcoach
```

**API anahtarı gerekmez.** Dersleri kendi Claude aboneliğin yazar.

Ya da bu depo bağlantısını Claude Code'a yapıştır ve şunu söyle: *LangCoach'u benim için kur*

Ayrıntılar, doğrulama, güncelleme, kaldırma ve sorun giderme: [docs/INSTALL.tr.md](https://github.com/oktaybilge1/langcoach/blob/main/docs/INSTALL.tr.md).

## Kullanım

Claude Code'da `tutor` istemini çalıştır. MCP istemleri `/mcp__langcoach__tutor` gibi bir slash komutu olarak görünür. Ya da Claude'a şunu söylemen yeterli:

> LangCoach ile dil dersime başlayalım

İlk seferde Claude sana birkaç soru sorar (ana dil, hedef dil, CEFR seviyesi, hedef, günlük dakika, haftada kaç gün) ve profilini kaydeder. Sonrasında bu haftanın planını çıkarır, bugünkü görevleri söyler, dersi anlatır, vadesi gelen kartlardan seni yoklar ve her şeyi kaydeder.

## Neden doğrudan bir sohbet botuna sormuyorum?

Sorabilirsin; bir sohbet botu tek bir konuşma için iyi bir öğretmendir. Kendi başına yapmadığı şey, seni haftalar boyunca takip etmek. LangCoach hatırlayan kısımdır:

- **Kalıcı bir plan.** Profilin ve bu haftanın planı kaydedilir; yarın boş bir sohbetten değil, bugün kaldığın yerden başlarsın.
- **Zamanlanmış tekrarlar.** Her kelimeye bir aralıklı tekrar algoritması olan [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) ile bir tekrar tarihi verilir; kelimeyi rastgele değil, büyük olasılıkla unutmadan biraz önce yeniden görürsün.
- **Dürüst sayılar.** Seri, XP, vadesi gelen kartlar ve ilerleme, gerçekten yaptığın ve kaydedilen şeylerden hesaplanır; bir model tarafından tahmin edilmez ya da uydurulmaz.
- **Verin yerelde kalır.** Her şey bilgisayarındaki bir dosyada (MCP) ya da tarayıcının depolamasında (uzantı) durur ve istediğin zaman dışa aktarabilirsin.
- **Kendi hayatından dersler.** Dersler gerçek durumlarından başlar (gelecek ayki gezin, yarınki toplantın): tarayıcıda Tiny Lesson ile ya da terminalde Claude ile.

LangCoach bir öğretmenin ya da kursun yerini tutmaz ve konuşmanı puanlamaz.

## Özellikler (MCP sunucusu)

- **Kişisel profil:** ana dil, hedef dil, seviye (A1-C2), hedef, günlük dakika ve haftalık çalışma günü.
- **Haftalık plan:** ISO haftasına yayılan çalışma günleri; günlük süreni ve hedefinden seçilen bir temayı esas alır.
- **Günlük görevler:** Tiny Lesson tarzı durum odaklı dersler, Slang Hang tarzı gündelik konuşma dersleri, tekrarlar ve son çalışma gününde bir quiz.
- **Aralıklı tekrar:** her ders maddesi, [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) ile zamanlanan bir tekrar kartına dönüşür; aynı maddeler tekrar eklenmez.
- **İlerleme:** seri, toplam XP ve haftalık hedef; her zaman kayıtlı veriden okunur, asla uydurulmaz.
- **Güvenli veri:** atomik yazma, her içe aktarmadan önce yedek ve bozuk dosyaların üzerine yazmak yerine saklanması.
- **Ağ çağrısı yok:** LangCoach hiçbir ağ çağrısı yapmaz; verin bilgisayarında kalır.

### Araçlar

Claude bu araçları senin için kullanır: `set_profile`, `get_weekly_plan`, `get_today`, `save_lesson`, `complete_task`, `get_due_reviews`, `submit_review`, `get_progress`, `export_cards`, `export_data`, `import_data`.

## Verin

Her şey tek bir JSON dosyasında durur: `~/.langcoach/data.json`. Farklı bir klasör için `LANGCOACH_HOME` ortam değişkenini ayarla.

- **Anki / Quizlet / CSV'ye aktarma:** Claude'dan `export_cards` çalıştırmasını iste ya da uzantıda Ayarlar > Kartları dışa aktar'ı kullan. [Anki, Quizlet ve CSV rehberi](https://github.com/oktaybilge1/langcoach/blob/main/docs/ANKI.tr.md).
- **Dışa / içe aktarma:** yedek almak ya da başka bir makineye taşınmak için Claude'dan `export_data`, geri yüklemek için `import_data` çalıştırmasını iste.
- Yazma işlemleri atomiktir; bir çökme yarım yazılmış dosya bırakmaz.
- Paralel araç çağrıları ve birden fazla Claude Code oturumu, kısa ömürlü bir `data.json.lock` dosyasıyla sırayla yazar; hiçbir güncelleme kaybolmaz.
- Veri dosyası bozuksa `data.corrupt-<zaman-damgası>.json` olarak saklanır ve net bir hata alırsın.
- İçe aktarma verini değiştirmeden önce mevcut dosya `data.backup-<zaman-damgası>.json` olarak yedeklenir.

Uzantı kendi destesini tarayıcıda tutar; ikisi senkronize olmaz. Kelimeleri aralarında ve başka uygulamalara taşımak için dışa aktarmayı kullan.

## Yol haritası

Planlanıyor, henüz yapılmadı:

- [ ] Kendi Gemini API anahtarınla tarayıcıda çalışan web uygulaması (PWA) ve GitHub Pages üzerinde canlı demo
- [ ] Word Cam tarzı kamerayla kelime öğrenme (web uygulaması)
- [ ] Topluluk PR'larıyla daha fazla arayüz dili

Her sürümde nelerin değiştiği için [CHANGELOG](https://github.com/oktaybilge1/langcoach/blob/main/CHANGELOG.md) dosyasına bak.

## Katkı

Katkılara açığız. [CONTRIBUTING.md](https://github.com/oktaybilge1/langcoach/blob/main/CONTRIBUTING.md) dosyasına bak.

## Kaynaklar ve sorumluluk reddi

LangCoach, Google Labs'in [Little Language Lessons](https://labs.google/lll/en) projesinden (Tiny Lesson, Slang Hang, Word Cam) ilham alır ve tek seferlik alıştırmaların eksiğini ekler: haftalık plan ve ilerleme takibi.

LangCoach is an independent project and is not affiliated with, endorsed by, or sponsored by Google. (LangCoach bağımsız bir projedir; Google ile bağlantılı değildir, Google tarafından onaylanmamış ya da desteklenmemiştir.)

## Lisans

[MIT](https://github.com/oktaybilge1/langcoach/blob/main/LICENSE) (c) 2026 Oktay Bilge
