-- BİSTRODA KİŞİ HESABI İSTEĞE BAĞLI (Gökhan, 2026-08-30). Linkten gelen başvuruda da aynı
-- kural: ayar boşsa bir başvuru bir bistro tutar, doluluk bistro adediyle ölçülür.

create or replace function public.online_rezervasyon_olustur(
  p_slug text, p_ad text, p_telefon text, p_kisi integer, p_zaman timestamp with time zone,
  p_not text default null, p_alan_id uuid default null, p_dilim text default null
)
 returns jsonb
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
  v_gece_masa int;
  v_gece_dolu numeric;
  v_gun_dolu boolean := false;
  v_bistro_kisi int;
  v_kart uuid;
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

  v_tel := right(regexp_replace(p_telefon, '[^0-9]', '', 'g'), 10);
  if coalesce(v_ayar.online_gelmeyen_engeli, true) and length(v_tel) = 10 and exists (
    select 1 from public.reservations x
    where x.restaurant_id = v_restoran and x.deleted_at is null
      and x.source = 'online' and x.status = 'gelmedi'
      and right(regexp_replace(coalesce(x.guest_phone, ''), '[^0-9]', '', 'g'), 10) = v_tel
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

  -- O GÜN DOLU MU — başvuru yine alınır, misafire doğru cümle söylenebilsin diye bakılıyor.
  -- Bekleyen başvurular yer tutmaz; sadece onaylanmış rezervasyonlar sayılır.
  if coalesce(v_dilim, 'yemek') <> 'gece' then
    select coalesce(sum(t.seat_count), 0) into v_koltuk
    from public.restaurant_tables t
    left join public.dining_areas a on a.id = t.area_id
    where t.restaurant_id = v_restoran and t.deleted_at is null
      and coalesce(a.tur, 'yemek') <> 'gece' and coalesce(t.shape, '') <> 'loca';

    select coalesce(sum(party_size), 0) into v_dolu
    from public.reservations
    where restaurant_id = v_restoran and deleted_at is null and yedek = false
      and status in ('bekleniyor', 'geldi', 'oturdu')
      and coalesce(onay_durumu, 'onaylandi') = 'onaylandi'
      and coalesce(dilim, 'yemek') <> 'gece'
      and (reserved_at at time zone 'Europe/Istanbul')::date = v_gun;

    if v_koltuk > 0 and v_dolu + p_kisi > v_koltuk then
      v_gun_dolu := true;
    end if;
  end if;

  -- Gece tarafı bistro ADEDİYLE ölçülür: 2 kişilik grup da koca bir bistroyu tutar, kişiyle
  -- ölçmek yanıltıyor (Gökhan, 2026-08-29).
  --
  -- BİSTRODA KİŞİ HESABI İSTEĞE BAĞLI (Gökhan, 2026-08-30). Ayar boşsa bir rezervasyon bir
  -- bistro tutar — loca gibi; kalabalık gruba ikinci bistroyu işletmeci elle verir. Ayarda
  -- bir sayı varsa eski hesap: kişi ÷ o sayı, yukarı yuvarlanır.
  v_bistro_kisi := coalesce(v_ayar.bistro_kisi, 0);
  if v_dilim in ('gece', 'yemek_gece') then
    select count(*) into v_gece_masa
    from public.restaurant_tables t
    join public.dining_areas a on a.id = t.area_id and coalesce(a.tur, 'yemek') = 'gece'
    where t.restaurant_id = v_restoran and t.deleted_at is null and t.shape = 'bistro';

    select coalesce(sum(case when v_bistro_kisi > 0
                             then greatest(1, ceil(party_size::numeric / v_bistro_kisi))
                             else 1 end), 0) into v_gece_dolu
    from public.reservations
    where restaurant_id = v_restoran and deleted_at is null and yedek = false
      and status in ('bekleniyor', 'geldi', 'oturdu')
      and coalesce(onay_durumu, 'onaylandi') = 'onaylandi'
      and dilim in ('gece', 'yemek_gece') and coalesce(ayakta, false) = false
      and (reserved_at at time zone 'Europe/Istanbul')::date = v_gun;

    if v_gece_masa > 0 and v_gece_dolu
       + (case when v_bistro_kisi > 0 then greatest(1, ceil(p_kisi::numeric / v_bistro_kisi)) else 1 end)
       > v_gece_masa then
      v_gun_dolu := true;
    end if;
  end if;

  -- KİŞİ KARTI (Gökhan, 2026-08-30: "kayıt yine alınsın, kişi kartı oluşsun"). Numara zaten
  -- bir müşteriye aitse ikinci kart açılmaz, başvuru onun kartına bağlanır.
  insert into public.kisi_kartlari (restaurant_id, phone)
  values (v_restoran, btrim(p_telefon))
  on conflict (restaurant_id, phone) do update set phone = excluded.phone
  returning id into v_kart;

  insert into public.reservations (
    restaurant_id, guest_name, guest_phone, party_size, reserved_at, note,
    status, source, iletisim_kanali, consent_at, tercih_alan_id, dilim, kisi_karti_id, onay_durumu
  ) values (
    v_restoran, btrim(p_ad), btrim(p_telefon), p_kisi, p_zaman, nullif(btrim(p_not), ''),
    'bekleniyor', 'online', 'online', now(), v_alan, v_dilim, v_kart, 'bekliyor'
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'dolu', v_gun_dolu);
end $function$;
