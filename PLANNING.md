# PLANNING.md — WhatsApp Toplu Mesaj Platformu

## Claude Code Talimatları
Bu dosyayı her oturumda önce oku. Modül modül ilerle. Bir modül bitmeden diğerine geçme. Her modül sonunda çalışır durumda olmalı.

---

## Proje Genel Bakış

WhatsApp üzerinden toplu mesaj gönderimi sağlayan, çok müşterili (multi-tenant) bir SaaS platformu. Baileys kütüphanesi kullanılarak WhatsApp Web protokolü üzerinden bağlantı kurulur.

### Teknoloji Stack
- **Backend:** Node.js + Express.js
- **WhatsApp:** Baileys (@whiskeysockets/baileys)
- **Veritabanı:** PostgreSQL + PgBouncer
- **Kuyruk:** BullMQ (Redis üzerinde)
- **Cache / Pub-Sub:** Redis
- **Frontend:** React.js + TailwindCSS
- **ORM:** Prisma
- **Auth:** JWT (access token 15dk, refresh token 30gün)
- **Dosya yükleme:** Multer (CSV/Excel parse: papaparse + xlsx)
- **Process yönetimi:** PM2

---

## Klasör Yapısı

```
/
├── backend/
│   ├── src/
│   │   ├── config/          # DB, Redis, env ayarları
│   │   ├── middlewares/     # auth, role, error handler
│   │   ├── modules/
│   │   │   ├── auth/        # login, logout, refresh token
│   │   │   ├── admin/       # superadmin işlemleri
│   │   │   ├── customer/    # müşteri işlemleri
│   │   │   ├── whatsapp/    # hesap yönetimi, session
│   │   │   ├── campaign/    # kampanya motoru
│   │   │   ├── queue/       # BullMQ job tanımları
│   │   │   └── report/      # raporlama
│   │   ├── workers/
│   │   │   └── whatsapp.worker.js  # Baileys instance'ları
│   │   └── app.js
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── admin/       # superadmin sayfaları
    │   │   └── customer/    # müşteri sayfaları
    │   ├── components/      # paylaşılan bileşenler
    │   ├── hooks/           # custom hooks
    │   ├── store/           # state yönetimi (Zustand)
    │   └── api/             # axios instance + endpoint'ler
    └── package.json
```

---

## Veritabanı Şeması

### users
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
email         VARCHAR UNIQUE NOT NULL
password_hash VARCHAR NOT NULL
full_name     VARCHAR NOT NULL
role          ENUM('superadmin', 'customer') NOT NULL
credit        INTEGER DEFAULT 0
is_active     BOOLEAN DEFAULT true
created_at    TIMESTAMP DEFAULT NOW()
updated_at    TIMESTAMP DEFAULT NOW()
```

### refresh_tokens
```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id    UUID FK → users.id ON DELETE CASCADE
token_hash VARCHAR NOT NULL
expires_at TIMESTAMP NOT NULL
created_at TIMESTAMP DEFAULT NOW()
```

### whatsapp_accounts
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
phone_number        VARCHAR UNIQUE
display_name        VARCHAR
status              ENUM('disconnected','connecting','connected','banned','suspended') DEFAULT 'disconnected'
type                ENUM('active','backup') DEFAULT 'active'
proxy_host          VARCHAR
proxy_port          INTEGER
proxy_user          VARCHAR
proxy_pass          VARCHAR
worker_id           VARCHAR
session_data        TEXT  -- AES-256-GCM ile şifrelenmiş Baileys auth state
last_connected_at   TIMESTAMP
last_message_sent_at TIMESTAMP
daily_message_count  INTEGER DEFAULT 0
daily_message_limit  INTEGER DEFAULT 300
created_at          TIMESTAMP DEFAULT NOW()
updated_at          TIMESTAMP DEFAULT NOW()
```

### campaigns
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID FK → users.id
title           VARCHAR NOT NULL
message_template TEXT NOT NULL   -- {{visitorname}} içerebilir
status          ENUM('pending','running','completed','failed') DEFAULT 'pending'
total_count     INTEGER DEFAULT 0
success_count   INTEGER DEFAULT 0
failed_count    INTEGER DEFAULT 0
credit_used     INTEGER DEFAULT 0
credit_refunded INTEGER DEFAULT 0
whatsapp_account_id UUID FK → whatsapp_accounts.id
started_at      TIMESTAMP
completed_at    TIMESTAMP
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

### campaign_recipients
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
campaign_id  UUID FK → campaigns.id ON DELETE CASCADE
phone_number VARCHAR NOT NULL
name         VARCHAR  -- {{visitorname}} için
status       ENUM('pending','sent','failed') DEFAULT 'pending'
wa_message_id VARCHAR
error_message VARCHAR
sent_at      TIMESTAMP
created_at   TIMESTAMP DEFAULT NOW()

INDEX(campaign_id, status)
```

### credit_transactions
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID FK → users.id
type        ENUM('load','deduct','refund') NOT NULL
amount      INTEGER NOT NULL
description VARCHAR
campaign_id UUID FK → campaigns.id  -- nullable
created_at  TIMESTAMP DEFAULT NOW()
```

---

## Modül Planı

---

### MODÜL 1 — Veritabanı Kurulumu
**Dosyalar:** `prisma/schema.prisma`, `src/config/database.js`

**Yapılacaklar:**
- Prisma schema yaz (yukarıdaki tablolar)
- Migration çalıştır
- DB bağlantı config dosyası
- Seed: 1 adet superadmin kullanıcısı oluştur

**Tamamlanma kriteri:** `npx prisma migrate dev` hatasız çalışır, superadmin seed'i veritabanına girer.

---

### MODÜL 2 — Auth Sistemi
**Dosyalar:** `src/modules/auth/`

**Yapılacaklar:**
- `POST /api/auth/login` — email + şifre → access token + refresh token
- `POST /api/auth/refresh` — refresh token → yeni access token
- `POST /api/auth/logout` — refresh token sil
- `POST /api/auth/change-password` — şifre değiştir (eski şifre doğrula)
- JWT middleware (her korumalı route için)
- Role middleware (`requireSuperAdmin`, `requireCustomer`)
- Refresh token'lar veritabanında hash'lenmiş saklanır
- Şifreler bcrypt ile hash'lenir (salt rounds: 12)

**Tamamlanma kriteri:** Login → token alınır, korumalı route'a token ile istek atılır, role kontrolü çalışır.

---

### MODÜL 3 — SuperAdmin: Müşteri ve Kredi Yönetimi
**Dosyalar:** `src/modules/admin/`

**Endpoint'ler:**
```
POST   /api/admin/customers              — Müşteri oluştur
GET    /api/admin/customers              — Müşteri listesi
GET    /api/admin/customers/:id          — Müşteri detayı
POST   /api/admin/customers/:id/credit   — Kredi yükle
GET    /api/admin/customers/:id/credit-history — Kredi geçmişi
```

**İş Kuralları:**
- Müşteri oluşturulunca rastgele şifre üret, response'da döndür (bir kez gösterilir)
- Kredi yüklemek credit_transactions tablosuna `type: 'load'` kaydı atar
- Kredi yüklenince users.credit alanı güncellenir

**Tamamlanma kriteri:** Superadmin müşteri oluşturabilir, kredi yükleyebilir, geçmişi görebilir.

---

### MODÜL 4 — WhatsApp Hesap Yönetimi
**Dosyalar:** `src/modules/whatsapp/`, `src/workers/whatsapp.worker.js`

**Endpoint'ler:**
```
POST   /api/admin/whatsapp/accounts           — Hesap ekle (numara + proxy bilgisi)
GET    /api/admin/whatsapp/accounts           — Hesap listesi (durum, sağlık bilgisi)
POST   /api/admin/whatsapp/accounts/:id/connect    — Bağlantı başlat → SMS kodu iste
POST   /api/admin/whatsapp/accounts/:id/verify     — SMS kodunu gir → oturum aç
POST   /api/admin/whatsapp/accounts/:id/disconnect — Bağlantıyı kes
PATCH  /api/admin/whatsapp/accounts/:id/type       — active/backup değiştir
GET    /api/admin/whatsapp/accounts/:id/health     — Sağlık detayı

WebSocket: /ws/admin/whatsapp/:id/status     — Bağlantı durumu canlı takip
```

**Baileys Entegrasyonu:**
- Her WhatsApp hesabı için ayrı Baileys socket instance'ı
- Bağlantı state'i Redis'te tutulur (key: `wa:session:{accountId}`)
- Auth state (session_data) AES-256-GCM ile şifrelenmiş PostgreSQL'e kaydedilir
- Şifreleme anahtarı: `process.env.SESSION_ENCRYPTION_KEY`
- Proxy: Her hesaba atanmış SOCKS5 proxy üzerinden bağlanır
- Reconnect stratejisi: exponential backoff (5s, 15s, 45s, 2dk, 5dk, 15dk)
- Ban tespiti: connection.update event'inde `DisconnectReason.loggedOut` → status: 'banned'
- Daily message count: Her gece 00:00'da sıfırlanır (cron job)

**Worker Mimarisi:**
- Her worker process belirli hesapları yönetir
- Worker'lar Redis pub/sub üzerinden API ile iletişim kurar
- API → Redis publish: `{command: 'send', accountId, recipient, message}`
- Worker → Redis publish: `{event: 'sent', accountId, messageId, status}`

**Tamamlanma kriteri:** Hesap eklenir, SMS kodu ile bağlanır, bağlantı durumu panelde görünür.

---

### MODÜL 5 — Kampanya Motoru
**Dosyalar:** `src/modules/campaign/`, `src/modules/queue/`

**Endpoint'ler:**
```
POST   /api/customer/campaigns              — Kampanya oluştur + başlat
GET    /api/customer/campaigns/active       — Aktif kampanya (varsa)
GET    /api/customer/campaigns/:id/progress — İlerleme bilgisi (WebSocket için de)
GET    /api/customer/campaigns              — Kampanya geçmişi (raporlar)
GET    /api/customer/campaigns/:id          — Kampanya detayı

WebSocket: /ws/customer/campaigns/:id/progress — Canlı ilerleme
```

**Kampanya Oluşturma Akışı:**
```
1. Kullanıcının aktif kampanyası var mı? → Varsa hata döndür
2. Alıcı listesi parse edilir (CSV/Excel veya manuel numara listesi)
3. Toplam alıcı sayısı hesaplanır
4. Kullanıcının kredisi yeterli mi? → Yetersizse hata döndür
5. Kredi anında düşülür (credit_transactions: type 'deduct')
6. Campaign kaydı oluşturulur (status: 'pending')
7. campaign_recipients toplu insert edilir
8. BullMQ'ya kampanya job'u eklenir
9. Campaign status: 'running' olur
```

**Mesaj Gönderimi:**
- BullMQ worker kampanyayı alır
- Aktif WhatsApp hesapları arasından müsait olanı seçer (daily_limit kontrolü)
- Her alıcı için ayrı job oluşturulur (delay: hesap başına 72 saniye aralık)
- `{{visitorname}}` → alıcının name alanıyla değiştirilir
- Gönderim sonucu:
  - Başarılı: `campaign_recipients.status = 'sent'`, `campaigns.success_count++`
  - Başarısız: `campaign_recipients.status = 'failed'`, `campaigns.failed_count++`

**Kampanya Tamamlanma:**
```
Tüm alıcılar işlendi
      ↓
campaigns.status = 'completed'
campaigns.completed_at = NOW()
      ↓
failed_count kadar kredi hesaplanır
credit_transactions: type 'refund' kaydı atılır
users.credit += failed_count
campaigns.credit_refunded = failed_count
```

**BullMQ Kuyrukları:**
- `campaign-dispatch` — Kampanyayı alıcılara böler
- `message-send` — Tekil mesaj gönderimi (concurrency: hesap başına 1)
- `campaign-finalize` — Kampanya tamamlanma işlemleri

**Tamamlanma kriteri:** Kampanya oluşturulur, mesajlar gider, kredi düşer, başarısız olanlar iade edilir.

---

### MODÜL 6 — SuperAdmin Dashboard ve Operasyonel Kontroller
**Dosyalar:** `src/modules/admin/dashboard.js`

**Endpoint'ler:**
```
GET    /api/admin/dashboard              — Sistem genel durumu
GET    /api/admin/campaigns              — Tüm aktif kampanyalar
POST   /api/admin/campaigns/:id/stop    — Kampanyayı durdur (sadece admin)
GET    /api/admin/queue/stats           — Kuyruk istatistikleri
POST   /api/admin/queue/clear           — Kuyruğu temizle
```

**Dashboard Verileri:**
```json
{
  "today_messages_sent": 12400,
  "active_campaigns": 3,
  "queue_waiting": 450,
  "whatsapp_accounts": {
    "connected": 95,
    "backup": 48,
    "banned": 5,
    "disconnected": 2
  },
  "server_health": {
    "cpu_percent": 34,
    "ram_used_gb": 8.2,
    "ram_total_gb": 16,
    "redis_memory_mb": 245
  }
}
```

**Tamamlanma kriteri:** Dashboard verileri doğru görünür, admin kampanya durdurabilir.

---

### MODÜL 7 — Frontend: SuperAdmin Paneli
**Sayfalar:** `frontend/src/pages/admin/`

**Sayfalar:**
```
/admin/login                 — Giriş
/admin/dashboard             — Ana sayfa (sistem durumu)
/admin/whatsapp              — WhatsApp hesap listesi
/admin/whatsapp/add          — Hesap ekle + bağla
/admin/customers             — Müşteri listesi
/admin/customers/new         — Müşteri oluştur
/admin/customers/:id         — Müşteri detay + kredi yükle
```

**Teknik Notlar:**
- TailwindCSS ile dark tema
- Axios instance: `baseURL = /api`, token header otomatik eklenir
- Token refresh: 401 gelince otomatik refresh dener, olmuyorsa login'e yönlendirir
- WebSocket: WhatsApp bağlantı durumu için

**Tamamlanma kriteri:** Admin tüm işlemleri arayüzden yapabilir.

---

### MODÜL 8 — Frontend: Müşteri Paneli
**Sayfalar:** `frontend/src/pages/customer/`

**Sayfalar:**
```
/login                       — Giriş
/dashboard                   — Kampanya oluştur (ana sayfa)
/campaign/active             — Aktif kampanya takibi
/reports                     — Geçmiş kampanyalar
/reports/:id                 — Kampanya detayı
/settings                    — Şifre değiştir
```

**Kampanya Oluşturma Sayfası Bileşenleri:**
```
├── Kredi bakiyesi (sağ üstte, layout'ta sabit)
├── Numara giriş alanı
│     ├── Tab 1: Manuel giriş (her satıra bir numara)
│     └── Tab 2: CSV / Excel yükle
├── Mesaj yazma alanı
│     ├── Textarea
│     ├── "{{visitorname}} kullanarak alıcı adını ekleyebilirsiniz" notu
│     └── Karakter sayacı
├── WhatsApp önizleme (sağ panel)
│     └── Gerçek WhatsApp balonu görünümü, canlı güncellenir
└── Gönder butonu
      ├── Kredi yeterliyse + aktif kampanya yoksa: AKTİF
      └── Diğer durumlarda: PASİF + açıklama mesajı
```

**Aktif Kampanya Sayfası:**
```
├── Kampanya başlığı
├── Progress bar (success_count / total_count)
├── Sayaçlar: Toplam / Başarılı / Başarısız
├── Durum: "Gönderim devam ediyor..." (canlı, WebSocket)
└── Tamamlanınca: "Kampanya tamamlandı, X kredi iade edildi"
```

**Raporlar Sayfası:**
```
├── Kampanya listesi (tarih sıralı, en yeni üstte)
└── Her satır:
      ├── Tarih / saat
      ├── Toplam hedef
      ├── Başarılı / Başarısız
      ├── Kullanılan kredi / İade edilen kredi
      └── "Detay" butonu
```

**Tamamlanma kriteri:** Müşteri kampanya oluşturabilir, takip edebilir, raporları görebilir.

---

## Güvenlik Gereksinimleri

```
- Tüm şifreler bcrypt (rounds: 12)
- JWT access token: 15 dakika TTL
- JWT refresh token: 30 gün TTL, veritabanında hash'lenmiş
- WhatsApp session_data: AES-256-GCM şifreli
- SESSION_ENCRYPTION_KEY: .env'de, asla kod içinde olmaz
- Rate limiting: express-rate-limit (login: dakikada 5 istek)
- Helmet.js: güvenlik header'ları
- CORS: sadece frontend domain'i
- Input validation: express-validator
- SQL injection: Prisma ORM (parameterized queries)
- Her API isteğinde kullanıcının kendi verisine eriştiği kontrol edilir
```

---

## Environment Variables (.env)

```env
# Uygulama
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost:3000

# Veritabanı
DATABASE_URL=postgresql://user:pass@localhost:5432/whatsapp_platform

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_ACCESS_SECRET=<random-256-bit>
JWT_REFRESH_SECRET=<random-256-bit>

# Şifreleme
SESSION_ENCRYPTION_KEY=<random-256-bit-hex>

# Superadmin Seed
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=<güçlü-şifre>
```

---

## Geliştirme Sırası (Kesin)

```
[x] MODÜL 1 — Veritabanı kurulumu ve seed
[x] MODÜL 2 — Auth sistemi
[x] MODÜL 3 — Müşteri ve kredi yönetimi (backend)
[x] MODÜL 4 — WhatsApp hesap yönetimi (backend)
[x] MODÜL 5 — Kampanya motoru (backend)
[x] MODÜL 6 — Admin dashboard ve operasyonel kontroller
[x] MODÜL 7 — Frontend: SuperAdmin paneli
[x] MODÜL 8 — Frontend: Müşteri paneli
```

---

## Her Modül İçin Claude Code Talimatı

Her modüle başlarken şunu söyle:
> "PLANNING.md dosyasını oku. Şu an MODÜL X üzerindeyiz. Sadece bu modülü yaz. Başka modüle geçme."

Modül bitince şunu söyle:
> "MODÜL X tamamlandı. PLANNING.md'de checkbox'ı işaretle. Bir sonraki modüle geçmeye hazır mıyız?"

---

## Notlar

- Baileys versiyonu: `@whiskeysockets/baileys` en güncel stable
- Proxy bağlantısı: `socks-proxy-agent` paketi ile
- CSV parse: `papaparse`
- Excel parse: `xlsx` (SheetJS)
- WebSocket: `ws` paketi (Socket.io değil, daha hafif)
- Her WhatsApp hesabı için mesajlar arası minimum 72 saniye bekleme
- Günlük mesaj limiti hesap başına 300 (whatsapp_accounts.daily_message_limit)
- Gece 00:00'da cron job: tüm hesapların daily_message_count sıfırlanır
- PM2 ile çalıştır: API server + Worker process ayrı ayrı
