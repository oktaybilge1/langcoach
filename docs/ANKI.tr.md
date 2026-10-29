# Kartlarını Anki, Quizlet veya CSV olarak dışa aktar

LangCoach tekrar kartlarını Anki, Quizlet ve tablo programlarının anladığı düz metin dosyaları olarak dışa aktarabilir. Eklenti, hesap ya da ağ gerekmez: dosya bilgisayarında oluşturulur.

- **Tarayıcı uzantısı:** yan paneli aç, **Ayarlar > Kartları dışa aktar** bölümüne git ve **Anki**, **Quizlet** ya da **CSV** düğmesine bas.
- **Claude Code:** Claude'dan `export_cards` aracını (biçim: `anki`, `quizlet` veya `csv`) çalıştırıp sonucu senin için bir dosyaya kaydetmesini iste.

Dosya adları: `langcoach-anki-YYYY-AA-GG.txt`, `langcoach-quizlet-YYYY-AA-GG.txt` ve `langcoach-cards-YYYY-AA-GG.csv`.

## Anki Masaüstü (2.1.54 ve üzeri)

1. Anki'yi aç ve **Dosya > İçe Aktar**'ı seç.
2. `langcoach-anki-….txt` dosyasını seç.
3. İçe aktarma penceresi dosyanın başlığını okur; ayırıcı (sekme), HTML, deste (`LangCoach`) ve etiketler hazır gelir. **Not türü**nün **Basic (Temel)** ve destenin istediğin deste olduğunu kontrol et.
4. Eşleme şöyle olmalı: 1. sütun = GUID, 2. sütun = Ön, 3. sütun = Arka, 4. sütun = Etiketler.
5. **Mevcut notlar** altında **Güncelle**'yi seç; böylece sonradan yeniden dışa aktarınca kopya oluşmaz, var olan notlar güncellenir. Her kartın bunun için sabit bir GUID'i (LangCoach kart kimliği) vardır.
6. **İçe Aktar**'a bas.

Her notun önünde kelime (varsa okunuşuyla) yer alır. Arkada önce ana dilindeki anlam (varsa), sonra özgün çeviri, italik örnek cümle ve not görünür. Etiketler: `langcoach`, hedef dil ve ders durumu.

## AnkiMobile (iPhone/iPad) ve AnkiDroid

En güvenilir yol masaüstünde içe aktarıp AnkiWeb ile eşitlemektir. AnkiDroid ve AnkiMobile `.txt` dosyasını doğrudan da açabilir (dosyayı uygulamaya paylaş); seçenekler sürüme göre değişir ve eski sürümler başlık satırlarını anlamayabilir. Sütunlar yanlış görünürse masaüstünde içe aktar.

## Quizlet

Yeni bir çalışma seti aç, **İçe aktar**'ı seç ve `langcoach-quizlet-….txt` içeriğini yapıştır. Terim ile tanım arasında **Sekme**, kartlar arasında **Yeni satır** ayırıcısını koru. Tanım çeviridir; varsa " / " işaretinden sonra ana dilindeki çeviri gelir.

## CSV

`.csv` dosyasının sütunları: `term, translation, native_translation, example, pronunciation, note, lesson, language, favorite, mastered, due`. UTF-8'dir ve BOM (bayt sırası işareti) içerir; böylece Windows'ta Excel dosyaya çift tıklayınca Türkçe, Arapça, Çince ve diğer aksanlı metni doğru gösterir. Google Sheets ve LibreOffice doğrudan açar. (Anki ve Quizlet dosyalarında BOM yoktur.)

Tablo programlarının metni formül sanıp çalıştırmasını önlemek için, ilk anlamlı karakteri (baştaki boşluk, kontrol ve sıfır genişlikli karakterlerden sonra) `=`, `+`, `-` veya `@` olan ve sekme, CR ya da LF ile başlayan her CSV hücresinin başına kesme işareti eklenir. Bu `-ing suffix` gibi zararsız girdileri de etkiler. Anki ve Quizlet dosyaları bu şekilde değiştirilmez.

## Nelerin aktarıldığı ve aktarılmadığı

- Aktarılır: terim, okunuş, çeviri, ana dil çevirisi, örnek, not, dil, ders durumu ve (yalnızca CSV'de) favori ile öğrenildi işaretleri.
- **Aktarılmaz: tekrar zamanlaması.** Kartlar Anki'de sıfırdan başlar; tekrar geçmişi, vade tarihleri ve kolaylık değeri taşınmaz. LangCoach kendi takvimini tutmaya devam eder.
- Terimi boş olan kartlar atlanır. Claude Code'da öğrenilmiş kartları dışarıda bırakabilirsin (`includeMastered: false`). Claude Code üzerinden 2 MB'ı aşan dışa aktarmalar reddedilir; uzantı düğmesini kullan ya da öğrenilmiş kartları çıkar.
