# Sifirdan veritabani kurulumu

RZV'nin veritabani yapisi. Veri yok, sadece yapi: 30 tablo, 43 fonksiyon, veri kilidi
kurallari ve depolama kovasi.

Yapi restoran-aios'tan kopyalanmisti; 2026-08-25'te o programa ait ne varsa cikarildi
(40 tablo, 43 fonksiyon, iki tetikleyici, ayarlar tablosundaki 16 kolon). Geriye sadece
rezervasyon ve ekip kaldi.

Bos bir Supabase projesine **sirayla** uygulanir:

1. `01_tablolar.sql`
2. `02_kisitlar.sql`
3. `03_indeksler.sql`
4. `04a` → `04f` fonksiyonlar
5. `05_tetikleyici_guvenlik.sql`
6. `06_depolama.sql`

Sonra `supabase/functions/send-reservation-notification` dagitilir.

`supabase/migrations/` klasoru eski projenin tarihcesi; yeni projeye o degil bu klasor
uygulanir. Yeni degisiklikler bundan sonra yine migrations altina yazilir.
