-- Eski programin kendi personel kaydi kaldirildi. Personel artik komple Ekip'ten giriyor
-- (Gokhan, 2026-08-25: "personel komple ekipten giris yapacak").
--
-- Programda iki personel listesi vardi: eski programdan gelen personel kaydi (maas, PIN,
-- mola, ise giris tarihi) ve Ekip'in hesaplari. Calisan ekranlar zaten Ekip hesaplarini
-- kullaniyordu; eskisine yazan da okuyan da kalmamisti.

-- Eski kayda personel ekleyen fonksiyon (PIN uretiyordu).
drop function if exists public.add_staff_member(uuid, text, text, text) cascade;

-- Eski personel kaydi.
drop table if exists public.staff_members cascade;

-- Eski kayda giden baglar. Her birinin Ekip tarafindaki karsiligi zaten duruyor:
-- masa_garson.personel_id, reservations.alan_hesap_id, personel_hesaplari.user_id.
alter table public.masa_garson drop column if exists staff_id;
alter table public.reservations drop column if exists alan_personel_id;
alter table public.reservations drop column if exists pr_id;
alter table public.restaurant_tables drop column if exists assigned_staff_id;
alter table public.personel_hesaplari drop column if exists staff_id;
