-- BİSTRO MASA ŞEKLİ (Gökhan, 2026-08-27). 40×40 sabit ölçü, kişi sayısı sorulmaz —
-- locadaki gibi sadece adet girilir. Gece (bistro) düzeninin masası budur.
alter table public.restaurant_tables drop constraint if exists restaurant_tables_shape_check;
alter table public.restaurant_tables add constraint restaurant_tables_shape_check
  check (shape = any (array['yuvarlak'::text, 'dikdortgen'::text, 'loca'::text, 'bistro'::text]));
