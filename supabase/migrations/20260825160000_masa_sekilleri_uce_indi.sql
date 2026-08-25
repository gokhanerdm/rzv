-- Masa sekli uce indi: koseli (dikdortgen), yuvarlak, loca. "Kare" kaldirildi
-- (Gokhan, 2026-08-25: "kare masa olayini kaldiriyoruz, boyle bir masa turu cok yerde
-- kullanilmiyor"). Ekranda dikdortgenin adi KOSELI; veritabanindaki deger ayni kaldi,
-- eski kare masalar koseliye cevrildi.
--
-- Olculer de sabitlendi ve artik isletme kendi olcusunu giremiyor ("bunlar sabit olcu
-- oluyor, isletme masa olcusu giremiyor"): olculer app/rezervasyon/masaOlcu.ts icinde
-- tek kaynakta duruyor. masa_olculeri tablosu bosta kaliyor, silinmedi.
update public.restaurant_tables set shape = 'dikdortgen' where shape = 'kare';
update public.masa_olculeri set shape = 'dikdortgen' where shape = 'kare';

alter table public.restaurant_tables drop constraint if exists restaurant_tables_shape_check;
alter table public.restaurant_tables add constraint restaurant_tables_shape_check
  CHECK (shape = ANY (ARRAY['yuvarlak'::text, 'dikdortgen'::text, 'loca'::text]));

alter table public.masa_olculeri drop constraint if exists masa_olculeri_shape_check;
alter table public.masa_olculeri add constraint masa_olculeri_shape_check
  CHECK (shape = ANY (ARRAY['yuvarlak'::text, 'dikdortgen'::text, 'loca'::text]));
