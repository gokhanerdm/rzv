-- LOCADA KİŞİ LİMİTİ (Gökhan, 2026-08-30: "locaya limit girilirse üstü alınmasın... tabi
-- sorsun yani uyarsın, yine de al butonu da olsun").
--
-- Locanın sabit kişi sayısı yoktu: aynı locaya 2 kişi de giriyordu 15 kişi de. İşletme bir
-- sayı yazarsa o sayının üstündeki grupta program uyarıyor; "Yine de al" ile devam ediliyor.
-- Boşsa sınır yok, bugünkü davranış.
alter table public.restaurant_settings add column if not exists loca_kisi integer;
comment on column public.restaurant_settings.loca_kisi is
  'Bir locaya en fazla kaç kişi. Boşsa sınır yok; doluysa üstündeki grupta program uyarır, kullanıcı yine de verebilir.';
