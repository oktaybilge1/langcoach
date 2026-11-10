# LangCoach Kurulumu

[English](https://github.com/oktaybilge1/langcoach/blob/main/docs/INSTALL.md) | **Türkçe**

LangCoach, [Claude Code](https://docs.anthropic.com/en/docs/claude-code) içinde çalışan bir dil öğrenme koçudur. Bu rehber bilerek çok açık yazıldı: her adım, her komut, işletim sistemine göre.

## API anahtarı gerekir mi?

**Hayır.** Claude Code modunda API anahtarı, ek hesap ya da sunucu gerekmez. Dersleri senin Claude aboneliğin (Claude Code'un zaten kullandığı) yazar. LangCoach yalnızca planını, tekrarlarını ve ilerlemeni bilgisayarında saklar.

Planlanan web uygulaması (yakında, henüz yapılmadı) ücretsiz bir Gemini API anahtarı isteyecek. Claude Code modu buna asla ihtiyaç duymaz. Bkz. [Web uygulaması (yakında)](#web-uygulaması-yakında).

## En kolay yol: kurulumu Claude yapsın

1. Herhangi bir klasörde Claude Code'u aç (`claude`).
2. Depo bağlantısını yapıştır ve şunu söyle: *LangCoach'u benim için kur*

   `https://github.com/oktaybilge1/langcoach`

Claude [AGENTS.md](https://github.com/oktaybilge1/langcoach/blob/main/AGENTS.md) dosyasını okur, sistemini kontrol eder ve doğru komutları çalıştırır. Sistem yazılımını sessizce kurmaz; Node.js eksikse nasıl kuracağını sana söyler. Ardından tarayıcı uzantısıyla [Little Language Lessons'ı bağlamayı](#little-language-lessonsı-bağla-tarayıcı-köprüsü) önerir (isteğe bağlı).

Yalnızca Claude Code test edildi. MCP destekleyen diğer ajanlar aynı `npx -y langcoach` komutuyla çalışmalı, ama bu test edilmedi.

## Gerekenler

| Gereksinim | Nereden alınır | Kontrol |
| --- | --- | --- |
| Node.js 20 veya üstü | https://nodejs.org (**LTS** yükleyicisini indir) | `node -v` çıktısı `v20.x.x` ya da daha yüksek |
| Kurulu ve oturumu açık Claude Code | https://docs.anthropic.com/en/docs/claude-code | `claude --version` bir sürüm yazdırır |

Başka bir şey gerekmez.

## Elle kurulum

Bir terminal aç (macOS: Terminal; Linux: terminalin; Windows: PowerShell ya da Komut İstemi) ve aşağıdaki komutlardan **birini** çalıştır.

### macOS, Linux ve WSL

```bash
claude mcp add --scope user langcoach "--" npx -y langcoach
```

### Windows (yerel PowerShell ya da CMD, WSL değil)

```powershell
claude mcp add --scope user langcoach "--" cmd /c npx -y langcoach
```

Yerel Windows'ta Claude Code `npx` komutunu doğrudan başlatamaz, bu yüzden `cmd /c` ile sarmalanır. WSL kullanıyorsan WSL içinde macOS/Linux komutunu çalıştır.

### Hangi kapsam?

- `--scope user` (önerilir): LangCoach her klasörde çalışır.
- `--scope` olmadan `claude mcp add` yalnızca bulunduğun proje klasörü için kayıt yapar; Claude Code'u başka yerde açarsan LangCoach görünmez.

## Doğrulama

```bash
claude mcp list
```

`langcoach` bağlı (connected) görünmelidir. Claude Code içinde `/mcp` yazarak durumunu ve araçlarını görebilirsin.

## İlk dersin

1. `claude` komutunu başlat (zaten açıksa yeni bir oturum başlat ki yeni sunucuyu görsün).
2. `/mcp__langcoach__tutor` istemini çalıştır ya da şunu söyle: *LangCoach ile dil dersime başlayalım*
3. Claude sana sorular sorar: ana dil, hedef dil, seviye (A1 - C2), hedef, günlük dakika ve haftada kaç gün. Sonra ilk haftalık planını çıkarır.

## Little Language Lessons'ı bağla (tarayıcı köprüsü)

İsteğe bağlı. [Little Language Lessons](https://labs.google/lll/en)'ı (LLL, Google Labs) her zamanki gibi sesi, kamerası ve tasarımıyla kullanmaya devam et; LangCoach tarayıcı uzantısı orada yaptığın her dersi bilgisayarındaki `langcoach` sunucusuna iletir. Böylece Claude ne çalıştığını bilir; plan yapabilir, tekrar ettirebilir, dışa aktarabilir. Chrome, Edge ve Brave'de (masaüstü) çalışır.

### Kurulumu Claude yapsın

Yeni bir Claude Code oturumunda şunu söyle: *LangCoach'u Little Language Lessons'a bağla*. Claude:

1. hangi tarayıcıyı kullandığını sorar;
2. `bridge_prepare_extension` aracını çağırır; uzantı `~/.langcoach/extension` klasörüne kopyalanır ve bu bilgisayarla eşleştirilir;
3. senin onayınla uzantılar sayfasını açar ve klasör yolunu panoya kopyalar;
4. aşağıdaki üç tıklamayı söyler;
5. https://labs.google/lll/en üzerinde bir Tiny Lesson yapmanı ister ve gelip gelmediğini `bridge_status` ile `get_recent_lessons` üzerinden kontrol eder.

Tarayıcı bir uzantıyı sessizce kuramaz: tıklaman gerekir.

### Elle

1. Claude Code'da Claude'dan `bridge_prepare_extension` aracını çalıştırmasını ve döndürdüğü `path` değerini söylemesini iste.
2. Uzantılar sayfasını aç: `chrome://extensions` (Chrome), `edge://extensions` (Edge) ya da `brave://extensions` (Brave). Terminalden:
   - Windows: `start chrome "chrome://extensions"`
   - macOS: `open -a "Google Chrome" "chrome://extensions"`
   - Linux: `google-chrome chrome://extensions`
3. **Geliştirici modu**'nu aç, **Paketlenmemiş öğe yükle**'ye (Load unpacked) tıkla ve 1. adımdaki klasörü seç.
4. https://labs.google/lll/en üzerinde bir Tiny Lesson yap. Bildirimde *Saved · sent to your agent* yazar. Claude'a sor: *LLL dersim geldi mi?*

Klasörü silme: tarayıcı uzantıyı oradan yükler. `bridge_prepare_extension` yeniden çalışırsa klasör yenilenir; ardından uzantı kartındaki yenile simgesine tıkla.

### Köprü nasıl çalışır, neyi paylaşır

- Uzantı dersleri yalnızca `http://127.0.0.1:47821` adresine, yani kendi bilgisayarındaki `langcoach` sürecine gönderir. İnternete hiçbir şey gitmez; hesap ya da bulut yoktur.
- İsteğe bağlıdır: dinleyici yalnızca `bridge_prepare_extension` `~/.langcoach/bridge-token` dosyasını oluşturduktan sonra açılır. Kapalı tutmak için `LANGCOACH_BRIDGE=off` ayarla ya da uzantı Ayarlar'ında "Your AI agent" anahtarını kapat.
- Eşleştirme: her kurulum rastgele bir anahtar (token) alır. Uzantı bir şey göndermeden önce sunucu bu anahtarı bildiğini kanıtlamak zorundadır; sunucu da dersleri yalnızca bu anahtarla kabul eder. Eşleştirmeyi kaldırmak için `~/.langcoach/bridge-token` dosyasını sil ve uzantıyı kaldır.
- Sunucu yalnızca bir Claude Code oturumu açıkken dinler. Bu arada yaptığın dersler uzantıda bekler ve sonra gönderilir.
- Ders metni bir web sayfasından gelir. Claude onu çalışma verisi olarak görür ve içindeki talimatlara asla uymaz.
- Kalan risk: bilgisayarındaki başka bir uzantı ya da program dinleyiciye ulaşabilir, ama anahtar olmadan hiçbir şey kaydedemez. Dosyalarını okuyabilen bir program, diğer yerel veriler gibi anahtarı da okuyabilir.

### Köprü sorunları

| Sorun | Çözüm |
| --- | --- |
| Uzantı Ayarlar'ında "Waiting for your agent" yazıyor | Claude Code'u başlat (sunucu yalnızca oturum açıkken çalışır) ve Claude'dan `bridge_status` çalıştırmasını iste. |
| `bridge_status` port hatası gösteriyor | 47821 portunu başka bir program kullanıyor. Onu kapat; ikinci bir LangCoach oturumu zaten bekler ve 30 sn'de bir yeniden dener. Uzantı yalnızca 47821'e bağlandığı için sunucuyu `LANGCOACH_BRIDGE_PORT` ile taşımak bağlantıyı koparır. |
| "Not paired" | Klasörde geçerli bir eşleştirme dosyası yok ya da anahtar değişti. `bridge_prepare_extension` aracını yeniden çalıştır ve uzantılar sayfasında uzantıyı yenile. |
| "Server not verified" | 47821'deki bir şey anahtarı kanıtlayamıyor (eski ya da yabancı bir sunucu). Diğer LangCoach sürümlerini kapat, `bridge_prepare_extension` aracını yeniden çalıştır ve uzantıyı yenile. |
| Tarayıcı yerel ağa erişim izni istiyor | LangCoach için izin ver; `127.0.0.1` adresine ulaşması gerekir. Yeni Chrome sürümleri bunu sorabilir (her sürümde doğrulanmadı). |
| Hiçbir şey gelmiyor | Ayarlar'daki "Your AI agent" anahtarını ve `LANGCOACH_BRIDGE` değerinin `off` olmadığını kontrol et. Yalnızca `https://labs.google/lll/*` üzerindeki dersler yakalanır. |

## Verim nerede?

Tek bir dosyada: `~/.langcoach/data.json`. Windows'ta bu `C:\Users\<sen>\.langcoach\data.json` olur.

Başka bir klasör kullanmak için sunucuyu eklerken `LANGCOACH_HOME` ayarla:

```bash
claude mcp add --scope user langcoach -e LANGCOACH_HOME=/klasor/yolu "--" npx -y langcoach
```

Yedek almak ya da taşımak için Claude'dan `export_data` aracını çalıştırmasını iste; geri yüklemek için `import_data` kullanılır.

## Güncelleme

`npx`, önbelleği yenilendiğinde yayınlanan en son sürümü getirir. `npx clear-npx-cache` bunu zorlamak için güvenilir değildir. Bunun yerine şunlardan birini yap:

- kaldırıp yeniden ekle:

  ```bash
  claude mcp remove langcoach
  claude mcp add --scope user langcoach "--" npx -y langcoach
  ```

  (Yerel Windows: `cmd /c` biçimini kullan.)
- ya da sürümü sabitle: `--` sonrasındaki komutta `npx -y langcoach@<sürüm>`.

`--scope user` ile eklediysen `claude mcp remove langcoach --scope user` kullan.

## Kaldırma

```bash
claude mcp remove langcoach
```

`--scope user` ile eklediysen onu da ekle. İstersen veri klasörü `~/.langcoach` dizinini sil (ilerlemen silinir; yedek istiyorsan önce dışa aktar).

## Sorun giderme

| Sorun | Çözüm |
| --- | --- |
| `node` bulunamıyor ya da sürüm 20'nin altında | https://nodejs.org adresinden LTS sürümünü kur, terminali kapatıp yeniden aç ve `node -v` komutunu tekrar çalıştır. |
| Windows: `spawn npx ENOENT` ya da sunucu başlamıyor | `cmd /c` biçimini kullan: `claude mcp add --scope user langcoach "--" cmd /c npx -y langcoach` |
| Windows PowerShell: eklerken `error: unknown option` | PowerShell tırnaksız `--` işaretini siler. Tırnaklı yaz: `"--"` (PowerShell ve CMD'de çalışır). |
| `claude mcp list` içinde `langcoach` başarısız (failed) görünüyor | Terminalde `npx -y langcoach` çalıştır. Sessizce beklemesi gerekir (stdin üzerinden MCP konuşur); durdurmak için Ctrl+C bas. Bunun yerine hata yazarsa nedeni odur. |
| `claude mcp list` içinde `langcoach` başarısız görünüyor ya da `npx -y langcoach` hata veriyor, ama yalnızca bu deponun bir kopyasının içindeyken | LangCoach deposunun içinde npm, `langcoach` adını yayınlanmış paket yerine yerel çalışma alanı paketine (`packages/mcp`) çözer; onun `dist/` klasörü henüz yoksa sunucu başlayamaz. `claude mcp list` / `npx -y langcoach` komutunu başka herhangi bir klasörden çalıştır ya da önce kopyada `npm install` ve `npm run build` çalıştır. |
| npm kayıt sunucusu engelli ya da kurumsal proxy | npm'i proxy'ne göre ayarla (bkz. https://docs.npmjs.com/cli/configuring-npm/npmrc), sonra tekrar dene. |
| "data folder is not writable" | `~/.langcoach` üzerindeki izinleri düzelt ya da `LANGCOACH_HOME` ile yazabildiğin bir klasör göster. |
| "data file is busy" | Şu an başka bir oturum yazıyor. Biraz bekleyip tekrar dene. |
| Bozuk veri dosyası | LangCoach bozuk dosyayı `data.corrupt-<zaman-damgası>.json` olarak saklar. Bir `data.backup-<zaman-damgası>.json` dosyasından `import_data` ile geri yükle ya da `data.json` dosyasını kenara taşıyıp sıfırdan başla. |

## Kaynaktan çalıştırma

npm paketi yerine bu depodaki en güncel kodu çalıştırmak için:

```bash
git clone https://github.com/oktaybilge1/langcoach.git
cd langcoach
npm install
npm run build
claude mcp add --scope user langcoach "--" node /mutlak/yol/langcoach/packages/mcp/dist/index.js
```

Windows'ta ileri eğik çizgi kullan, örneğin `C:/Users/sen/langcoach/packages/mcp/dist/index.js`.

## Web uygulaması (yakında)

Tarayıcı sürümü planlanıyor ama **henüz yapılmadı**. Google AI Studio'dan ücretsiz bir Gemini API anahtarı isteyecek: https://aistudio.google.com/apikey adresini aç, Google hesabınla giriş yap ve "Create API key" düğmesine tıkla. Anahtar tarayıcında kalır. Claude Code modu buna asla ihtiyaç duymaz.
