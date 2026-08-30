-- İŞLEYİŞ AYARI (Gökhan, 2026-08-30: "bu tarz konseptler eklenecek bir ayar olması gerek...
-- şimdi bunu demoya yerleştireceğiz, ayarlara bir yere koy").
--
-- Yemek / gece / ayakta / loca bu mekânın işleyişi; başka konseptler (öğle-akşam servisi,
-- VIP oda) başka sınıflarla çalışacak. Ayarlarda kapatılan sınıfın sayacı rezervasyon
-- ekranında hiç çizilmiyor. Boş liste = hepsi açık.
alter table public.restaurant_settings add column if not exists sayac_kapali jsonb not null default '[]'::jsonb;
comment on column public.restaurant_settings.sayac_kapali is
  'Rezervasyon ekranında kapatılmış sayaçlar: yemek / gece / ayakta / loca. Boş liste = hepsi açık.';
