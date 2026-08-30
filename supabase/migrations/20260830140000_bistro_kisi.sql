-- BİSTRODA KİŞİ HESABI İSTEĞE BAĞLI (Gökhan, 2026-08-30: "bistro olayında kişi sayısı
-- koymasak, her rezervasyon tek bistroya alınsa, işletmeci ekler fazla rezervasyonlara
-- bistroyu... aynen loca gibi davransın").
--
-- Bugüne kadar bir bistro sabit 5 kişilikti: 6 kişilik grup iki bistro tutuyordu, kapasite
-- de bistro sayısı × 5 kişiden çıkıyordu. Artık varsayılan loca gibi: bir rezervasyon bir
-- bistro tutar, kalabalık gruba ikinci bistroyu işletmeci elle verir.
--
-- Boş bırakılırsa kişi hesabı yok. Bir sayı yazılırsa eski davranış geri gelir: gereken
-- bistro = kişi ÷ o sayı, yukarı yuvarlanır.
alter table public.restaurant_settings add column if not exists bistro_kisi integer;
comment on column public.restaurant_settings.bistro_kisi is
  'Bir bistronun aldığı en fazla kişi. Boşsa kişi hesabı yok: bir rezervasyon bir bistro.';
