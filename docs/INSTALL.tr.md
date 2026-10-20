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

Claude [AGENTS.md](https://github.com/oktaybilge1/langcoach/blob/main/AGENTS.md) dosyasını okur, sistemini kontrol eder ve doğru komutları çalıştırır. Sistem yazılımını sessizce kurmaz; Node.js eksikse nasıl kuracağını sana söyler.

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
claude mcp add --scope user langcoach -- npx -y langcoach
```

### Windows (yerel PowerShell ya da CMD, WSL değil)

```powershell
claude mcp add --scope user langcoach -- cmd /c npx -y langcoach
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

## Verim nerede?

Tek bir dosyada: `~/.langcoach/data.json`. Windows'ta bu `C:\Users\<sen>\.langcoach\data.json` olur.

Başka bir klasör kullanmak için sunucuyu eklerken `LANGCOACH_HOME` ayarla:

```bash
claude mcp add --scope user langcoach -e LANGCOACH_HOME=/klasor/yolu -- npx -y langcoach
```

Yedek almak ya da taşımak için Claude'dan `export_data` aracını çalıştırmasını iste; geri yüklemek için `import_data` kullanılır.

## Güncelleme

`npx`, önbelleği yenilendiğinde yayınlanan en son sürümü getirir. `npx clear-npx-cache` bunu zorlamak için güvenilir değildir. Bunun yerine şunlardan birini yap:

- kaldırıp yeniden ekle:

  ```bash
  claude mcp remove langcoach
  claude mcp add --scope user langcoach -- npx -y langcoach
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
| Windows: `spawn npx ENOENT` ya da sunucu başlamıyor | `cmd /c` biçimini kullan: `claude mcp add --scope user langcoach -- cmd /c npx -y langcoach` |
| `claude mcp list` içinde `langcoach` başarısız (failed) görünüyor | Terminalde `npx -y langcoach` çalıştır. Sessizce beklemesi gerekir (stdin üzerinden MCP konuşur); durdurmak için Ctrl+C bas. Bunun yerine hata yazarsa nedeni odur. |
| npm kayıt sunucusu engelli ya da kurumsal proxy | npm'i proxy'ne göre ayarla (bkz. https://docs.npmjs.com/cli/configuring-npm/npmrc), sonra tekrar dene. |
| "data folder is not writable" | `~/.langcoach` üzerindeki izinleri düzelt ya da `LANGCOACH_HOME` ile yazabildiğin bir klasör göster. |
| "data file is busy" | Şu an başka bir oturum yazıyor. Biraz bekleyip tekrar dene. |
| Bozuk veri dosyası | LangCoach bozuk dosyayı `data.corrupt-<zaman-damgası>.json` olarak saklar. Bir `data.backup-<zaman-damgası>.json` dosyasından `import_data` ile geri yükle ya da `data.json` dosyasını kenara taşıyıp sıfırdan başla. |

## Kaynaktan çalıştırma

`langcoach` paketi npm'de yayınlanana kadar kaynaktan kur:

```bash
git clone https://github.com/oktaybilge1/langcoach.git
cd langcoach
npm install
npm run build
claude mcp add --scope user langcoach -- node /mutlak/yol/langcoach/packages/mcp/dist/index.js
```

Windows'ta ileri eğik çizgi kullan, örneğin `C:/Users/sen/langcoach/packages/mcp/dist/index.js`.

## Web uygulaması (yakında)

Tarayıcı sürümü planlanıyor ama **henüz yapılmadı**. Google AI Studio'dan ücretsiz bir Gemini API anahtarı isteyecek: https://aistudio.google.com/apikey adresini aç, Google hesabınla giriş yap ve "Create API key" düğmesine tıkla. Anahtar tarayıcında kalır. Claude Code modu buna asla ihtiyaç duymaz.
