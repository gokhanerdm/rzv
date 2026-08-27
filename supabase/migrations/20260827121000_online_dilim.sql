-- ONLINE REZERVASYONDA YEMEK/GECE SEÇİMİ (Gökhan, 2026-08-27). Restoran + eğlence
-- işletmesinde, ayarlardan açıksa misafir dilimi kendisi seçer; kapalıysa eğlence günü
-- rezervasyonları yemek olarak düşer. Gece dilimi bistro kapasitesinden, bistrolar
-- bitince ayakta kapasitesinden yer tutar.

create or replace function public.online_rezervasyon_bilgi(p_slug text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
    'dilim_secimi', (coalesce(s.isletme_tipi, '') = 'restoran_eglence' and coalesce(s.online_dilim_secimi, false)),
    'eglence_gunleri', case when coalesce(s.isletme_tipi, '') = 'restoran_eglence'
      then coalesce(s.eglence_gunleri, '["cum","cmt"]'::jsonb) else '[]'::jsonb end,
    'salonlar', case when coalesce(s.online_salon_secimi, false) then (
      select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by a.sort_order, a.name), '[]'::jsonb)
      from public.dining_areas a
      where a.restaurant_id = r.id and a.deleted_at is null and a.online_acik
        -- Gece (bistro) salonu misafire seçtirilmez — o, geçiş saatinden sonraki düzendir.
        and coalesce(a.tur, 'yemek') <> 'gece'
    ) else '[]'::jsonb end
  )
  from public.restaurants r
  left join public.restaurant_settings s on s.restaurant_id = r.id
  where r.slug = p_slug and r.deleted_at is null
  limit 1;
$function$;

create or replace function public.online_rezervasyon_olustur(
  p_slug text, p_ad text, p_telefon text, p_kisi integer, p_zaman timestamp with time zone,
  p_not text default null, p_alan_id uuid default null, p_dilim text default null
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_restoran uuid;
  v_id uuid;
  v_gun date;
  v_koltuk int;
  v_dolu int;
  v_ayar public.restaurant_settings%rowtype;
  v_tel text;
  v_alan uuid;
  v_dilim text;
  v_ayakta boolean := false;
  v_gece_koltuk int;
  v_gece_dolu int;
  v_ayakta_dolu int;
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

  -- DİLİM (restoran + eğlence). Sadece eğlence gününde yazılır; seçim ayarı kapalıysa
  -- misafirin gönderdiği yok sayılır ve yemek kabul edilir. Diğer türlerde hep NULL.
  v_dilim := null;
  if coalesce(v_ayar.isletme_tipi, '') = 'restoran_eglence'
     and coalesce(v_ayar.eglence_gunleri, '["cum","cmt"]'::jsonb)
         ? (array['paz','pzt','sal','car','per','cum','cmt'])[extract(dow from v_gun)::int + 1] then
    if coalesce(v_ayar.online_dilim_secimi, false) and p_dilim in ('yemek', 'gece', 'yemek_gece') then
      v_dilim := p_dilim;
    else
      v_dilim := 'yemek';
    end if;
  end if;

  -- YEMEK KAPASİTESİ — gece (bistro) salonunun masaları sayılmaz; sadece geceye gelen
  -- misafir de yemek kapasitesini tutmaz.
  if coalesce(v_dilim, 'yemek') <> 'gece' then
    select coalesce(sum(t.seat_count), 0) into v_koltuk
    from public.restaurant_tables t
    left join public.dining_areas a on a.id = t.area_id
    where t.restaurant_id = v_restoran and t.deleted_at is null
      and coalesce(a.tur, 'yemek') <> 'gece';

    select coalesce(sum(party_size), 0) into v_dolu
    from public.reservations
    where restaurant_id = v_restoran and deleted_at is null and yedek = false
      and status in ('bekleniyor', 'geldi', 'oturdu')
      and coalesce(dilim, 'yemek') <> 'gece'
      and (reserved_at at time zone 'Europe/Istanbul')::date = v_gun;

    if v_koltuk > 0 and v_dolu + p_kisi > v_koltuk then
      insert into public.dolu_gun_talepleri (restaurant_id, gun, kisi, ad, telefon, kanal)
      values (v_restoran, v_gun, p_kisi, btrim(p_ad), btrim(p_telefon), 'online');
      raise exception 'KAPASITE_DOLU';
    end if;
  end if;

  -- GECE (BİSTRO) KAPASİTESİ — geceye kalanlar bistrodan, bistrolar bitince ayakta
  -- kapasitesinden yer tutar; o da bitince alınmaz (talep listesine yazılır).
  if v_dilim in ('gece', 'yemek_gece') then
    select coalesce(sum(t.seat_count), 0) into v_gece_koltuk
    from public.restaurant_tables t
    join public.dining_areas a on a.id = t.area_id and coalesce(a.tur, 'yemek') = 'gece'
    where t.restaurant_id = v_restoran and t.deleted_at is null;

    select coalesce(sum(party_size), 0) into v_gece_dolu
    from public.reservations
    where restaurant_id = v_restoran and deleted_at is null and yedek = false
      and status in ('bekleniyor', 'geldi', 'oturdu')
      and dilim in ('gece', 'yemek_gece') and ayakta = false
      and (reserved_at at time zone 'Europe/Istanbul')::date = v_gun;

    if v_gece_dolu + p_kisi > v_gece_koltuk then
      select coalesce(sum(party_size), 0) into v_ayakta_dolu
      from public.reservations
      where restaurant_id = v_restoran and deleted_at is null and yedek = false
        and status in ('bekleniyor', 'geldi', 'oturdu')
        and ayakta = true
        and (reserved_at at time zone 'Europe/Istanbul')::date = v_gun;

      if coalesce(v_ayar.ayakta_kapasite, 0) - v_ayakta_dolu >= p_kisi then
        v_ayakta := true;
      else
        insert into public.dolu_gun_talepleri (restaurant_id, gun, kisi, ad, telefon, kanal)
        values (v_restoran, v_gun, p_kisi, btrim(p_ad), btrim(p_telefon), 'online');
        raise exception 'KAPASITE_DOLU';
      end if;
    end if;
  end if;

  insert into public.reservations (
    restaurant_id, guest_name, guest_phone, party_size, reserved_at, note,
    status, source, iletisim_kanali, consent_at, tercih_alan_id, dilim, ayakta
  ) values (
    v_restoran, btrim(p_ad), btrim(p_telefon), p_kisi, p_zaman, nullif(btrim(p_not), ''),
    'bekleniyor', 'online', 'online', now(), v_alan, v_dilim, v_ayakta
  ) returning id into v_id;

  return v_id;
end $function$;
