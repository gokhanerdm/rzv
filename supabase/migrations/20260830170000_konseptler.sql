-- KONSEPTLER (Gökhan, 2026-08-30: "her sektör kendine göre oluşturacak... yeni kurdum
-- programı, sadece salonum var, buradan ismini de yazıp konsept eklemeliyim").
--
-- Yemek / gece / ayakta programa gömülüydü. Artık işletme kendi konseptlerini ayarlardan
-- kuruyor; rezervasyon türü kutusunda o adlar çıkıyor, seçilen ad rezervasyona yazılıyor.
-- Liste boşken programın kendi seçenekleri çıkmaya devam ediyor — hiçbir şey değişmiyor.
--
-- Arkadaki hesap (kapasite, bistro sayımı, yerleşim) bu adımda DEĞİŞMEDİ: adı programın
-- bildiği bir işleyişe denk geliyorsa o işleyişle çalışıyor, denk gelmiyorsa yemek sayılıyor.
-- Gerçek bağlantı işletme türü/kurulum işine gelince kurulacak.
alter table public.restaurant_settings add column if not exists konseptler jsonb not null default '[]'::jsonb;
comment on column public.restaurant_settings.konseptler is
  'İşletmenin kendi tanımladığı konsept adları. Rezervasyon türü kutusunda bunlar çıkar; boşsa programın kendi seçenekleri çıkar.';

alter table public.reservations add column if not exists konsept text;
comment on column public.reservations.konsept is
  'Rezervasyon alınırken seçilen konseptin adı. Programın kendi seçenekleri kullanıldıysa boş.';

-- Bir önceki adımdaki sabit sayaç kutuları kaldırıldı; yerini konsept listesi aldı.
alter table public.restaurant_settings drop column if exists sayac_kapali;
