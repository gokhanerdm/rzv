-- MASAYA GEÇİCİ SANDALYE (Gökhan, 2026-09-01: "sadece gerekli zamanlarda sandalye eklenir,
-- masa kalkınca normale döner"). Sandalye masanın kalıcı koltuk sayısını değiştirmiyor;
-- oturan rezervasyonun üstünde duruyor, misafir kalkınca kendiliğinden düşüyor.
-- Kaç sandalye eklenebileceği restaurant_settings.masa_ek_sandalye ile sınırlı.
alter table reservations add column if not exists eklenen_sandalye integer not null default 0;

comment on column reservations.eklenen_sandalye is 'Bu rezervasyon için masaya geçici eklenen sandalye sayısı; ziyaret bitince anlamını yitirir.';
