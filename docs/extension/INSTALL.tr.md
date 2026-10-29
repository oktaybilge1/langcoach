# LangCoach Tarayıcı Uzantısı Kurulum Rehberi

[English](https://github.com/oktaybilge1/langcoach/blob/main/docs/extension/INSTALL.md) | **Türkçe**

LangCoach; **Google Chrome**, **Microsoft Edge**, **Brave** ve diğer Chromium tabanlı tarayıcılarda (sürüm 116 veya üstü) çalışır. Hesap veya API anahtarı gerekmez.

---

## Seçenek 1: Mağazadan kurulum (yakında)

- **Chrome Web Mağazası:** _inceleme sonrası bağlantı eklenecek_
- **Microsoft Edge Eklentileri:** _inceleme sonrası bağlantı eklenecek_

---

## Seçenek 2: ZIP'ten kurulum (Paketlenmemiş öğe yükle)

1. [GitHub Releases](https://github.com/oktaybilge1/langcoach/releases) sayfasından `langcoach-extension-0.2.0.zip` dosyasını indir ve saklayacağın bir klasöre **çıkart** (örneğin `Belgeler/langcoach-extension`). Bu klasörü sonra silme: tarayıcı uzantıyı oradan yükler.
2. Tarayıcının uzantılar sayfasını aç:
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
   - **Brave:** `brave://extensions`
3. **Geliştirici modu** (Developer mode) anahtarını aç (Chrome/Brave'de sağ üstte, Edge'de sol menüde).
4. **Paketlenmemiş öğe yükle** (Load unpacked) düğmesine tıkla ve çıkarttığın klasörü, yani içinde doğrudan `manifest.json` bulunan klasörü seç.
5. Araç çubuğunda **LangCoach**'u sabitle, simgesine tıklayarak yan paneli aç ve [Little Language Lessons](https://labs.google/lll/en) sayfasına git. Little Language Lessons sekmesi zaten açıksa bir kez yenile.

Tarayıcı açılışta "Geliştirici modu uzantıları" uyarısı gösterebilir; bu şekilde yüklenen uzantılar için normaldir.

### Yeni bir ZIP'e güncelleme

Yeni ZIP'i aynı klasörün üzerine (ya da yeni bir klasöre) çıkart, sonra uzantılar sayfasındaki LangCoach kartında **yeniden yükle** simgesine tıkla (ya da uzantıyı kaldırıp yeniden Paketlenmemiş öğe yükle). Uzantıyı kaldırmadığın sürece verin korunur. Güvenli olsun diye önce **Ayarlar**'dan bir JSON yedeği al.

### Kendin derle (kaynaktan)

```bash
git clone https://github.com/oktaybilge1/langcoach.git
cd langcoach
npm install
npm run build
npm run zip -w @langcoach/extension   # isteğe bağlı: apps/extension/langcoach-extension-<sürüm>.zip yazar
```

Sonra `apps/extension/dist` klasörünü (içinde doğrudan `manifest.json` var) Paketlenmemiş öğe olarak yükle.

---

## İsteğe bağlı: ana dile çeviri

Masaüstü Chrome 138 veya üstünde LangCoach, yakalanan kelimeleri Chrome'un yerleşik Translator API'siyle cihazında ana diline çevirebilir. İlk seferde Chrome'un dil modelini indirmesi gerekebilir; panel bunun için bir düğme gösterir. Bu API'nin olmadığı tarayıcılarda kartlar dersin verdiği anlamlarla kalır.

---

## Sorun giderme

| Sorun | Çözüm |
| --- | --- |
| "Manifest dosyası eksik veya okunamıyor" | ZIP dosyasının kendisini ya da depo kök klasörünü değil, içinde doğrudan `manifest.json` bulunan klasörü (ZIP'ten çıkan klasör veya `apps/extension/dist`) seç. |
| `labs.google/lll/*` üzerinde ders üretince bildirim çıkmıyor | Uzantıyı kurduktan veya yeniden yükledikten sonra açık `labs.google/lll/*` sekmesini bir kez yenile. |
| Simgeye tıklayınca yan panel açılmıyor | Tarayıcının 116 veya üstü olduğundan emin ol ya da araç çubuğundaki LangCoach simgesine sağ tıklayıp **Yan paneli aç**'ı seç. |
| Bir senaryo kartında "Başla", başlatmak yerine metni kopyalıyor | Tiny Lesson sayfası hazır değildi (örneğin ilk ziyaret tanıtımı açıktı). Tiny Lesson'ı aç, tanıtımı bir kez geç, sonra tekrar Başla'ya bas ya da kopyalanan metni kendin yapıştır. |
| Başka bir bilgisayara taşınma | Yan panelde **Ayarlar**'ı aç, JSON yedeğini dışa aktar, yeni bilgisayarda içe aktar. |

LangCoach bağımsız bir projedir; Google ile bağlantılı değildir, Google tarafından onaylanmamış ya da desteklenmemiştir.
