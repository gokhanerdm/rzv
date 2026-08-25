-- RZV veritabani yapisi — 4/6: FONKSIYONLAR (4/6)
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.my_reservation_restaurant()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select id from restaurants where owner_user_id = auth.uid() and deleted_at is null limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.online_rezervasyon_bilgi(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'telefon', nullif(concat(coalesce(r.ulke_kodu, '+90'), ' ', r.phone), coalesce(r.ulke_kodu, '+90') || ' '),
    'kvkk_notice', s.kvkk_notice,
    'online_acik', coalesce(s.online_acik, true),
    'gun_ufku', coalesce(s.rezervasyon_gun_ufku, 60),
    'min_kisi', coalesce(s.online_min_kisi, 1),
    'max_kisi', coalesce(s.online_max_kisi, 12),
    'telefon_esigi', coalesce(s.online_telefon_esigi, 12),
    'slot_dakika', coalesce(s.online_slot_dakika, 15),
    'salon_secimi', coalesce(s.online_salon_secimi, false),
    'opening_hours', s.opening_hours,
    'salonlar', case when coalesce(s.online_salon_secimi, false) then (
      select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by a.sort_order, a.name), '[]'::jsonb)
      from public.dining_areas a
      where a.restaurant_id = r.id and a.deleted_at is null and a.online_acik
    ) else '[]'::jsonb end
  )
  from public.restaurants r
  left join public.restaurant_settings s on s.restaurant_id = r.id
  where r.slug = p_slug and r.deleted_at is null
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.online_rezervasyon_olustur(p_slug text, p_ad text, p_telefon text, p_kisi integer, p_zaman timestamp with time zone, p_not text DEFAULT NULL::text, p_alan_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_restoran uuid;
  v_id uuid;
  v_gun date;
  v_koltuk int;
  v_dolu int;
  v_ayar public.restaurant_settings%rowtype;
  v_tel text;
  v_alan uuid;
begin
  select id into v_restoran from public.restaurants where slug = p_slug and deleted_at is null;
  if v_restoran is null then
    raise exception 'İşletme bulunamadı';
  end if;
  if coalesce(btrim(p_ad), '') = '' or coalesce(btrim(p_telefon), '') = ''
     or p_kisi is null or p_kisi <= 0 or p_kisi > 100 or p_zaman is null then
    raise exception 'Eksik ya da geçersiz bilgi';
  end if;

  select * into v_ayar from public.restaurant_settings where restaurant_id = v_restoran;

  if not coalesce(v_ayar.online_acik, true) then
    raise exception 'ONLINE_KAPALI';
  end if;

  v_gun := (p_zaman at time zone 'Europe/Istanbul')::date;

  if v_gun < (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'GECMIS_GUN';
  end if;
  if coalesce(v_ayar.rezervasyon_gun_ufku, 60) > 0
     and v_gun > (now() at time zone 'Europe/Istanbul')::date + coalesce(v_ayar.rezervasyon_gun_ufku, 60) then
    raise exception 'GUN_UFKU';
  end if;

  if p_kisi < coalesce(v_ayar.online_min_kisi, 1) then
    raise exception 'GRUP_KUCUK';
  end if;
  if p_kisi > coalesce(v_ayar.online_max_kisi, 12) then
    raise exception 'GRUP_BUYUK';
  end if;
  if coalesce(v_ayar.online_telefon_esigi, 0) > 0 and p_kisi > v_ayar.online_telefon_esigi then
    raise exception 'TELEFONLA';
  end if;

  v_tel := right(regexp_replace(p_telefon, '\D', '', 'g'), 10);
  if coalesce(v_ayar.online_gelmeyen_engeli, true) and length(v_tel) = 10 and exists (
    select 1 from public.reservations x
    where x.restaurant_id = v_restoran and x.deleted_at is null
      and x.source = 'online' and x.status = 'gelmedi'
      and right(regexp_replace(coalesce(x.guest_phone, ''), '\D', '', 'g'), 10) = v_tel
  ) then
    raise exception 'ONLINE_ENGEL';
  end if;

  if p_alan_id is not null then
    select a.id into v_alan from public.dining_areas a
    where a.id = p_alan_id and a.restaurant_id = v_restoran and a.deleted_at is null and a.online_acik;
  end if;

  select coalesce(sum(seat_count), 0) into v_koltuk
  from public.restaurant_tables
  where restaurant_id = v_restoran and deleted_at is null;

  select coalesce(sum(party_size), 0) into v_dolu
  from public.reservations
  where restaurant_id = v_restoran and deleted_at is null and yedek = false
    and status in ('bekleniyor', 'geldi', 'oturdu')
    and (reserved_at at time zone 'Europe/Istanbul')::date = v_gun;

  if v_koltuk > 0 and v_dolu + p_kisi > v_koltuk then
    insert into public.dolu_gun_talepleri (restaurant_id, gun, kisi, ad, telefon, kanal)
    values (v_restoran, v_gun, p_kisi, btrim(p_ad), btrim(p_telefon), 'online');
    raise exception 'KAPASITE_DOLU';
  end if;

  insert into public.reservations (
    restaurant_id, guest_name, guest_phone, party_size, reserved_at, note,
    status, source, iletisim_kanali, consent_at, tercih_alan_id
  ) values (
    v_restoran, btrim(p_ad), btrim(p_telefon), p_kisi, p_zaman, nullif(btrim(p_not), ''),
    'bekleniyor', 'online', 'online', now(), v_alan
  ) returning id into v_id;

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.oturumu_devral(p_kod text, p_cihaz text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.aktif_oturumlar (user_id, oturum_kodu, cihaz, guncellendi)
  values (auth.uid(), p_kod, p_cihaz, now())
  on conflict (user_id) do update
    set oturum_kodu = excluded.oturum_kodu,
        cihaz = excluded.cihaz,
        guncellendi = now();
$function$
;

CREATE OR REPLACE FUNCTION public.personal_data_status(p_restaurant uuid)
 RETURNS TABLE(retention_days integer, total_records bigint, expired_pending bigint, anonymized_count bigint, oldest_record date)
 LANGUAGE sql
 STABLE
AS $function$
  with s as (
    select coalesce(kvkk_retention_days, 365) as days
    from restaurant_settings where restaurant_id = p_restaurant
  ),
  d as (select coalesce((select days from s), 365) as days)
  select (select days from d)::int,
         count(*),
         count(*) filter (
           where r.anonymized_at is null
             and r.reserved_at < now() - ((select days from d) || ' days')::interval
         ),
         count(*) filter (where r.anonymized_at is not null),
         min((r.reserved_at at time zone 'Europe/Istanbul')::date)
  from reservations r
  where r.restaurant_id = p_restaurant and r.deleted_at is null;
$function$
;

CREATE OR REPLACE FUNCTION public.personel_kodla_baglan(p_kod text, p_ad text, p_telefon text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_restoran uuid;
  v_rol text;
  v_mevcut text;
begin
  if auth.uid() is null then
    raise exception 'GIRIS_GEREKLI';
  end if;
  if coalesce(btrim(p_ad), '') = '' then
    raise exception 'AD_GEREKLI';
  end if;

  select k.restaurant_id, k.rol into v_restoran, v_rol
  from public.katilim_kodlari k
  join public.restaurants r on r.id = k.restaurant_id and r.deleted_at is null
  where upper(btrim(k.kod)) = upper(btrim(p_kod));

  -- Eski tek kod hâlâ kabul ediliyor; rolü garson sayılır.
  if v_restoran is null then
    select id, 'garson' into v_restoran, v_rol from public.restaurants
     where upper(btrim(katilim_kodu)) = upper(btrim(p_kod)) and deleted_at is null;
  end if;

  if v_restoran is null then
    raise exception 'KOD_YANLIS';
  end if;

  select durum into v_mevcut from public.personel_hesaplari
   where user_id = auth.uid() and restaurant_id = v_restoran;

  if v_mevcut is not null then
    -- Zaten bağlıysa rolü tazeleniyor; beklemedeyse aynı anda açılıyor.
    update public.personel_hesaplari
       set rol = v_rol,
           durum = case when durum = 'kapali' then durum else 'onayli' end,
           onay_at = case when durum = 'kapali' then onay_at else coalesce(onay_at, now()) end
     where user_id = auth.uid() and restaurant_id = v_restoran;
    select durum into v_mevcut from public.personel_hesaplari
     where user_id = auth.uid() and restaurant_id = v_restoran;
    return v_mevcut;
  end if;

  insert into public.personel_hesaplari (user_id, restaurant_id, ad_soyad, telefon, rol, durum, onay_at)
  values (auth.uid(), v_restoran, btrim(p_ad), nullif(btrim(p_telefon), ''), v_rol, 'onayli', now());
  return 'onayli';
end $function$
;

CREATE OR REPLACE FUNCTION public.personel_rolum()
 RETURNS TABLE(restaurant_id uuid, isletme_adi text, rol text, durum text, ad_soyad text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select h.restaurant_id, r.name, h.rol, h.durum, h.ad_soyad
  from public.personel_hesaplari h
  join public.restaurants r on r.id = h.restaurant_id
  where h.user_id = auth.uid()
  order by (h.durum = 'onayli' and h.test_aktif) desc, (h.durum = 'onayli') desc, h.created_at desc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.postam()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct pm.table_id
  from public.posta_masalari pm
  join public.postalar p on p.id = pm.posta_id and p.deleted_at is null
  join public.posta_personelleri pp on pp.posta_id = p.id
  join public.personel_hesaplari h on h.id = pp.personel_id
  where h.user_id = auth.uid()
    and h.durum = 'onayli'
    and (h.test_aktif or not exists (
      select 1 from public.personel_hesaplari x
       where x.user_id = auth.uid() and x.durum = 'onayli' and x.test_aktif));
$function$
;

CREATE OR REPLACE FUNCTION public.quick_reserve_table(p_restaurant uuid, p_table_id uuid, p_guest_name text, p_party_size integer, p_reserved_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_id uuid;
begin
  insert into reservations (restaurant_id, guest_name, party_size, reserved_at, table_id)
  values (p_restaurant, p_guest_name, greatest(coalesce(p_party_size, 1), 1), p_reserved_at, p_table_id)
  returning id into v_id;

  perform assign_reservation_table(v_id, p_table_id);
  return v_id;
end;
$function$
;
