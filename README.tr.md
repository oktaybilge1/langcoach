# LangCoach

[English](README.md) | **Türkçe**

[![CI](https://github.com/oktaybilge1/langcoach/actions/workflows/ci.yml/badge.svg)](https://github.com/oktaybilge1/langcoach/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/langcoach)](https://www.npmjs.com/package/langcoach)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Claude Code içindeki dil koçun: haftalık plan, günlük görevler, aralıklı tekrar, seri ve XP. Her dil çifti için.**

<!-- TODO: gerçek bir oturumun tanıtım GIF dosyası buraya gelecek: docs/media/demo.gif (henüz kaydedilmedi) -->

Yapay zekâ ile dil dersleri harika, ama çoğu sohbet kapanınca seni unutuyor. LangCoach, Claude'a öğrenmen için bir hafıza kazandıran bir MCP sunucusudur: dersleri hedef dilinde Claude yazar, planını, tekrarlarını ve ilerlemeni LangCoach kendi bilgisayarında saklar.

- API anahtarı, hesap ya da sunucu yok.
- Her ana dil + hedef dil çiftiyle çalışır.
- Verin bilgisayarında kalır.

## Kurulum

```bash
claude mcp add langcoach -- npx -y langcoach
```

Node 20+ gerekir. (`langcoach` paketi henüz npm'de yayınlanmadı; yayınlanana kadar aşağıdaki "Kaynaktan çalıştırma" yöntemini kullan.)

### Kaynaktan çalıştırma

```bash
git clone https://github.com/oktaybilge1/langcoach.git
cd langcoach
npm install
npm run build
claude mcp add langcoach -- node <mutlak-yol>/packages/mcp/dist/index.js
```

## Kullanım

Claude Code'da `tutor` istemini çalıştır. MCP istemleri `/mcp__langcoach__tutor` gibi bir slash komutu olarak görünür. Ya da Claude'a şunu söylemen yeterli:

> LangCoach ile dil dersime başlayalım

İlk seferde Claude sana birkaç soru sorar (ana dil, hedef dil, CEFR seviyesi, hedef, günlük dakika, haftada kaç gün) ve profilini kaydeder. Sonrasında bu haftanın planını çıkarır, bugünkü görevleri söyler, dersi anlatır, vadesi gelen kartlardan seni yoklar ve her şeyi kaydeder.

## Özellikler

- **Kişisel profil:** ana dil, hedef dil, seviye (A1-C2), hedef, günlük dakika ve haftalık çalışma günü.
- **Haftalık plan:** ISO haftasına yayılan çalışma günleri; günlük süreni ve hedefinden seçilen bir temayı esas alır.
- **Günlük görevler:** Tiny Lesson tarzı durum odaklı dersler, Slang Hang tarzı gündelik konuşma dersleri, tekrarlar ve son çalışma gününde bir quiz.
- **Aralıklı tekrar:** her ders maddesi, [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) ile zamanlanan bir tekrar kartına dönüşür; aynı maddeler tekrar eklenmez.
- **İlerleme:** seri, toplam XP ve haftalık hedef; her zaman kayıtlı veriden okunur, asla uydurulmaz.
- **Güvenli veri:** atomik yazma, her içe aktarmadan önce yedek ve bozuk dosyaların üzerine yazmak yerine saklanması.
- **Ağ çağrısı yok:** LangCoach hiçbir ağ çağrısı yapmaz; verin bilgisayarında kalır.

### Araçlar

Claude bu araçları senin için kullanır: `set_profile`, `get_weekly_plan`, `get_today`, `save_lesson`, `complete_task`, `get_due_reviews`, `submit_review`, `get_progress`, `export_data`, `import_data`.

## Verin

Her şey tek bir JSON dosyasında durur: `~/.langcoach/data.json`. Farklı bir klasör için `LANGCOACH_HOME` ortam değişkenini ayarla.

- **Dışa / içe aktarma:** yedek almak ya da başka bir makineye taşınmak için Claude'dan `export_data`, geri yüklemek için `import_data` çalıştırmasını iste.
- Yazma işlemleri atomiktir; bir çökme yarım yazılmış dosya bırakmaz.
- Veri dosyası bozuksa `data.corrupt-<zaman-damgası>.json` olarak saklanır ve net bir hata alırsın.
- İçe aktarma verini değiştirmeden önce mevcut dosya `data.backup-<zaman-damgası>.json` olarak yedeklenir.

## Yol haritası

Planlanıyor, henüz yapılmadı:

- [ ] Kendi Gemini API anahtarınla tarayıcıda çalışan web uygulaması (PWA) ve GitHub Pages üzerinde canlı demo
- [ ] Word Cam tarzı kamerayla kelime öğrenme (web uygulaması)
- [ ] Topluluk PR'larıyla daha fazla arayüz dili

## Katkı

Katkılara açığız. [CONTRIBUTING.md](CONTRIBUTING.md) dosyasına bak.

## Kaynaklar ve sorumluluk reddi

LangCoach, Google Labs'in [Little Language Lessons](https://labs.google/lll/en) projesinden (Tiny Lesson, Slang Hang, Word Cam) ilham alır ve tek seferlik alıştırmaların eksiğini ekler: haftalık plan ve ilerleme takibi.

LangCoach is an independent project and is not affiliated with, endorsed by, or sponsored by Google. (LangCoach bağımsız bir projedir; Google ile bağlantılı değildir, Google tarafından onaylanmamış ya da desteklenmemiştir.)

## Lisans

[MIT](LICENSE) (c) 2026 Oktay Bilge
