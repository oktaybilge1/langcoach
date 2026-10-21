# LangCoach Tarayıcı Uzantısı Kurulum Rehberi

[English](https://github.com/oktaybilge1/langcoach/blob/main/docs/extension/INSTALL.md) | **Türkçe**

LangCoach; **Google Chrome**, **Microsoft Edge**, **Brave** ve diğer Chromium tabanlı tarayıcılarda (sürüm 116+) çalışır. Hesap veya API anahtarı gerekmez.

---

## Seçenek 1: Mağazadan Kurulum (Yakında)

- **Chrome Web Mağazası:** _Bağlantı eklenecek (inceleme aşamasında)_
- **Microsoft Edge Eklentileri:** _Bağlantı eklenecek (inceleme aşamasında)_

---

## Seçenek 2: GitHub Sürümlerinden veya Kaynaktan Kurulum (Paketlenmemiş Öğe Yükle)

1. [GitHub Releases](https://github.com/oktaybilge1/langcoach/releases) sayfasından en güncel `langcoach-extension-0.1.0.zip` dosyasını indirip bir klasöre çıkartın.
   - Ya da kaynak koddan derleyin:
     ```bash
     git clone https://github.com/oktaybilge1/langcoach.git
     cd langcoach
     npm install
     npm run build
     ```
     Derlenen uzantı `apps/extension/dist` klasöründe oluşacaktır.
2. Tarayıcınızın uzantılar sayfasını açın:
   - **Chrome:** `chrome://extensions`
   - **Edge:** `edge://extensions`
   - **Brave:** `brave://extensions`
3. **Geliştirici modu** (Developer mode) anahtarını açın (Chrome/Brave'de sağ üstte, Edge'de sol menüde).
4. **Paketlenmemiş öğe yükle** (Load unpacked) düğmesine tıklayın ve çıkarttığınız klasörü (veya kaynaktan derlediyseniz içinde doğrudan `manifest.json` bulunan `apps/extension/dist` klasörünü) seçin.
5. Tarayıcı araç çubuğundan **LangCoach** simgesini sabitleyip tıklayarak Yan Paneli açın ve [Little Language Lessons](https://labs.google/lll/en) sayfasına gidin.

<!-- Ekran görüntüsü yer tutucusu: docs/media/install-unpacked.png -->

---

## Sorun Giderme

| Sorun | Çözüm |
| --- | --- |
| "Manifest dosyası eksik veya okunamıyor" | Depo kök klasörünü değil, içinde doğrudan `manifest.json` bulunan klasörü (`apps/extension/dist` veya ZIP'ten çıkan klasör) seçin. |
| `labs.google/lll/*` üzerinde ders üretildiğinde bildirim çıkmıyor | Uzantıyı kurduktan veya güncelledikten sonra açık olan `labs.google/lll/*` sekmesini bir kez yenileyin (`F5`). |
| Simgeye tıklayınca yan panel açılmıyor | Tarayıcınızın Chromium 116+ olduğundan emin olun veya araç çubuğundaki LangCoach simgesine sağ tıklayıp **Yan paneli aç** seçeneğini kullanın. |
| Başka bir bilgisayara taşınma | Yan panelde **Ayarlar → Dışa aktar (JSON)** ile yedeğinizi indirin, yeni bilgisayarda **İçe aktar (JSON)** ile geri yükleyin. |
