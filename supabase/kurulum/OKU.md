# Sifirdan veritabani kurulumu

Bu klasordeki dosyalar, restoran-aios veritabaninin 2026-08-24'teki yapisinin birebir
kopyasi. Veri yok, sadece yapi: 70 tablo, 89 fonksiyon, tetikleyiciler, veri kilidi
kurallari ve depolama kovasi.

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
