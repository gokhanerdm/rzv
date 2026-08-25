-- RZV veritabani yapisi — 4/6: FONKSIYONLAR (3/4)
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.isletme_turu_slug(p_tur text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case lower(btrim(coalesce(p_tur, '')))
    when 'gece kulübü'                then 'gece_kulubu'
    when 'gece kulübü - canlı müzik'  then 'gece_kulubu_canli'
    when 'gece kulübü — canlı müzik'  then 'gece_kulubu_canli'
    when 'canlı müzik - gece'         then 'gece_kulubu_canli'
    when 'bar / pub'                  then 'bar_pub'
    when 'meyhane'                    then 'meyhane'
    when 'yeni nesil meyhane'         then 'yn_meyhane'
    when 'canlı müzik'                then 'canli_muzik'
    when 'canlı müzik / gazino'       then 'canli_muzik'
    when 'gazino'                     then 'gazino'
    when 'kafe'                       then 'kafe'
    when 'kafeterya'                  then 'kafeterya'
    when 'pastane / fırın'            then 'pastane'
    when 'fast food'                  then 'fast_food'
    when 'restoran'                   then 'restoran'
    when 'otel restoranı'             then 'restoran'
    else 'diger'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_genel_ozet(p_restaurant uuid, p_baslangic timestamp with time zone, p_bitis timestamp with time zone, p_onceki_baslangic timestamp with time zone, p_onceki_bitis timestamp with time zone)
 RETURNS TABLE(toplam_rezervasyon bigint, toplam_misafir bigint, gelen_rezervasyon bigint, gelen_misafir bigint, iptal_sayisi bigint, gelmedi_sayisi bigint, walkin_sayisi bigint, ortalama_kisi numeric, doluluk_orani numeric, yeni_musteri_sayisi bigint, tekrar_orani numeric, onceki_toplam_rezervasyon bigint, onceki_toplam_misafir bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_toplam_kapasite int;
  v_gun_sayisi numeric;
begin
  select coalesce(sum(seat_count), 0) into v_toplam_kapasite
  from restaurant_tables where restaurant_id = p_restaurant and deleted_at is null;

  v_gun_sayisi := greatest(extract(epoch from (p_bitis - p_baslangic)) / 86400, 1);

  return query
  with donem as (
    select * from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at >= p_baslangic and r.reserved_at < p_bitis
  ),
  gelenler as (
    select * from donem where status in ('geldi', 'oturdu', 'tamamlandi')
  ),
  kisi_anahtari as (
    select g.id,
      coalesce(g.kisi_karti_id::text, nullif(regexp_replace(coalesce(g.guest_phone, ''), '\D', '', 'g'), ''), lower(trim(g.guest_name))) as anahtar
    from gelenler g
  ),
  eski_musteriler as (
    select distinct coalesce(r.kisi_karti_id::text, nullif(regexp_replace(coalesce(r.guest_phone, ''), '\D', '', 'g'), ''), lower(trim(r.guest_name))) as anahtar
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at < p_baslangic and r.status in ('geldi', 'oturdu', 'tamamlandi')
  )
  select
    (select count(*) from donem)::bigint,
    (select coalesce(sum(party_size), 0) from donem)::bigint,
    (select count(*) from gelenler)::bigint,
    (select coalesce(sum(party_size), 0) from gelenler)::bigint,
    (select count(*) from donem where status = 'iptal')::bigint,
    (select count(*) from donem where status = 'gelmedi')::bigint,
    (select count(*) from donem where source = 'kapi')::bigint,
    (select round(avg(party_size), 1) from donem),
    case when v_toplam_kapasite > 0
      then round((select coalesce(sum(party_size), 0) from gelenler)::numeric / (v_toplam_kapasite * v_gun_sayisi) * 100, 1)
      else null end,
    (select count(distinct ka.anahtar) from kisi_anahtari ka
       where not exists (select 1 from eski_musteriler em where em.anahtar = ka.anahtar))::bigint,
    case when (select count(distinct anahtar) from kisi_anahtari) > 0
      then round((select count(distinct ka.anahtar) from kisi_anahtari ka
             where exists (select 1 from eski_musteriler em where em.anahtar = ka.anahtar))::numeric
           / (select count(distinct anahtar) from kisi_anahtari) * 100, 1)
      else null end,
    (select count(*) from reservations r where r.restaurant_id = p_restaurant and r.deleted_at is null
       and r.reserved_at >= p_onceki_baslangic and r.reserved_at < p_onceki_bitis)::bigint,
    (select coalesce(sum(party_size), 0) from reservations r where r.restaurant_id = p_restaurant and r.deleted_at is null
       and r.reserved_at >= p_onceki_baslangic and r.reserved_at < p_onceki_bitis)::bigint;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_iptal_gelmedi(p_restaurant uuid, p_baslangic timestamp with time zone, p_bitis timestamp with time zone)
 RETURNS TABLE(toplam_rezervasyon bigint, toplam_iptal bigint, iptal_orani numeric, iptal_kapasite bigint, ortalama_iptal_saat_once numeric, ayni_gun_iptal_orani numeric, iptal_gun_dagilimi jsonb, iptal_saat_dagilimi jsonb, toplam_gelmedi bigint, gelmedi_orani numeric, gelmedi_kapasite bigint, tekrarlayan_gelmedi_musteri bigint, gelmedi_gun_dagilimi jsonb, gelmedi_saat_dagilimi jsonb, gelmedi_grup_dagilimi jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  with donem as (
    select r.*, (r.reserved_at at time zone 'Europe/Istanbul') as yerel
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at >= p_baslangic and r.reserved_at < p_bitis
  ),
  iptaller as (select * from donem where status = 'iptal'),
  gelmediler as (select * from donem where status = 'gelmedi'),
  gelmedi_anahtar as (
    select coalesce(kisi_karti_id::text, nullif(regexp_replace(coalesce(guest_phone, ''), '\D', '', 'g'), ''), lower(trim(guest_name))) as anahtar
    from gelmediler
  )
  select
    (select count(*) from donem)::bigint,
    (select count(*) from iptaller)::bigint,
    case when (select count(*) from donem) > 0 then round((select count(*) from iptaller)::numeric / (select count(*) from donem) * 100, 1) else null end,
    (select coalesce(sum(party_size), 0) from iptaller)::bigint,
    (select round(avg(extract(epoch from (reserved_at - cancelled_at)) / 3600)::numeric, 1) from iptaller where cancelled_at is not null),
    case when (select count(*) from iptaller where cancelled_at is not null) > 0
      then round((select count(*) from iptaller where cancelled_at is not null and (cancelled_at at time zone 'Europe/Istanbul')::date = (reserved_at at time zone 'Europe/Istanbul')::date)::numeric
           / (select count(*) from iptaller where cancelled_at is not null) * 100, 1)
      else null end,
    (select coalesce(jsonb_agg(jsonb_build_object('gun_no', g.gun_no, 'adet', g.adet)), '[]'::jsonb)
       from (select ((extract(dow from yerel)::int + 6) % 7) as gun_no, count(*) as adet from iptaller group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('saat', g.saat, 'adet', g.adet)), '[]'::jsonb)
       from (select extract(hour from yerel)::int as saat, count(*) as adet from iptaller group by 1) g),
    (select count(*) from gelmediler)::bigint,
    case when (select count(*) from donem) > 0 then round((select count(*) from gelmediler)::numeric / (select count(*) from donem) * 100, 1) else null end,
    (select coalesce(sum(party_size), 0) from gelmediler)::bigint,
    (select count(*) from (
       select ga.anahtar from gelmedi_anahtar ga group by ga.anahtar having count(*) > 1
     ) x)::bigint,
    (select coalesce(jsonb_agg(jsonb_build_object('gun_no', g.gun_no, 'adet', g.adet)), '[]'::jsonb)
       from (select ((extract(dow from yerel)::int + 6) % 7) as gun_no, count(*) as adet from gelmediler group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('saat', g.saat, 'adet', g.adet)), '[]'::jsonb)
       from (select extract(hour from yerel)::int as saat, count(*) as adet from gelmediler group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('grup', g.grup, 'adet', g.adet)), '[]'::jsonb)
       from (select case when party_size <= 2 then '1-2' when party_size <= 4 then '3-4' when party_size <= 6 then '5-6' else '7+' end as grup, count(*) as adet
             from gelmediler group by 1) g);
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_kanal(p_restaurant uuid, p_baslangic timestamp with time zone, p_bitis timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kanal', coalesce(k.iletisim_kanali, 'telefon'),
    'rezervasyon', k.rezervasyon, 'misafir', k.misafir,
    'geldi', k.geldi, 'iptal', k.iptal, 'gelmedi', k.gelmedi,
    'gerceklesen_orani', case when k.rezervasyon > 0 then round(k.geldi::numeric / k.rezervasyon * 100, 1) else null end
  ) order by k.rezervasyon desc), '[]'::jsonb)
  from (
    select iletisim_kanali, count(*) as rezervasyon, sum(party_size) as misafir,
      count(*) filter (where status in ('geldi', 'oturdu', 'tamamlandi')) as geldi,
      count(*) filter (where status = 'iptal') as iptal,
      count(*) filter (where status = 'gelmedi') as gelmedi
    from reservations
    where restaurant_id = p_restaurant and deleted_at is null
      and reserved_at >= p_baslangic and reserved_at < p_bitis
    group by iletisim_kanali
  ) k;
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_masa(p_restaurant uuid, p_baslangic timestamp with time zone, p_bitis timestamp with time zone)
 RETURNS TABLE(masa_performans jsonb, salon_performans jsonb, isi_haritasi jsonb, kalis_2 numeric, kalis_3_4 numeric, kalis_5_plus numeric, kaybedilen_iptal_kisi bigint, kaybedilen_gelmedi_kisi bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with gelenler as (
    select r.id, r.party_size, r.arrived_at, r.left_at,
      (r.reserved_at at time zone 'Europe/Istanbul') as yerel,
      extract(epoch from (r.left_at - r.arrived_at)) / 60 as kalis_dk
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at >= p_baslangic and r.reserved_at < p_bitis
      and r.status in ('oturdu', 'tamamlandi')
  ),
  masa_kullanim as (
    select rt.table_id, count(distinct rt.reservation_id) as kullanim_sayisi,
      sum(g.party_size) as toplam_oturan, avg(g.party_size) as ortalama_kisi, avg(g.kalis_dk) as ortalama_dakika
    from reservation_tables rt
    join gelenler g on g.id = rt.reservation_id
    group by rt.table_id
  ),
  masa_liste as (
    select t.id, t.name, t.seat_count, t.area_id,
      coalesce(mk.kullanim_sayisi, 0) as kullanim_sayisi, coalesce(mk.toplam_oturan, 0) as toplam_oturan,
      mk.ortalama_kisi, mk.ortalama_dakika
    from restaurant_tables t
    left join masa_kullanim mk on mk.table_id = t.id
    where t.restaurant_id = p_restaurant and t.deleted_at is null
  ),
  salon_kullanim as (
    select coalesce(a.name, 'DİĞER') as salon_adi, sum(ml.kullanim_sayisi) as kullanim_sayisi,
      sum(ml.toplam_oturan) as misafir, avg(ml.ortalama_dakika) as ortalama_dakika
    from masa_liste ml
    left join dining_areas a on a.id = ml.area_id
    group by 1
  ),
  isi as (
    select ((extract(dow from yerel)::int + 6) % 7) as gun_no, extract(hour from yerel)::int as saat, count(*) as adet
    from gelenler
    group by 1, 2
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', ml.id, 'ad', ml.name, 'kapasite', ml.seat_count, 'kullanim', ml.kullanim_sayisi,
        'toplam_oturan', ml.toplam_oturan,
        'ortalama_kisi', round(ml.ortalama_kisi::numeric, 1),
        'ortalama_dakika', round(ml.ortalama_dakika::numeric)
      ) order by ml.kullanim_sayisi desc, ml.name), '[]'::jsonb)
     from masa_liste ml),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'salon', sk.salon_adi, 'kullanim', sk.kullanim_sayisi, 'misafir', sk.misafir,
        'ortalama_dakika', round(sk.ortalama_dakika::numeric)
      ) order by sk.kullanim_sayisi desc), '[]'::jsonb)
     from salon_kullanim sk),
    (select coalesce(jsonb_agg(jsonb_build_object('gun_no', i.gun_no, 'saat', i.saat, 'adet', i.adet)), '[]'::jsonb) from isi i),
    (select round(avg(kalis_dk)::numeric, 0) from gelenler where party_size <= 2 and kalis_dk is not null),
    (select round(avg(kalis_dk)::numeric, 0) from gelenler where party_size between 3 and 4 and kalis_dk is not null),
    (select round(avg(kalis_dk)::numeric, 0) from gelenler where party_size >= 5 and kalis_dk is not null),
    (select coalesce(sum(party_size), 0) from reservations where restaurant_id = p_restaurant and deleted_at is null
       and reserved_at >= p_baslangic and reserved_at < p_bitis and status = 'iptal')::bigint,
    (select coalesce(sum(party_size), 0) from reservations where restaurant_id = p_restaurant and deleted_at is null
       and reserved_at >= p_baslangic and reserved_at < p_bitis and status = 'gelmedi')::bigint;
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_musteri(p_restaurant uuid, p_baslangic timestamp with time zone, p_bitis timestamp with time zone)
 RETURNS TABLE(toplam_kayitli_musteri bigint, vip_sayisi bigint, donem_musteri_sayisi bigint, yeni_musteri_sayisi bigint, uzun_suredir_gelmeyen_sayisi bigint, ortalama_ziyaret_sikligi_gun numeric, ortalama_ziyaret_sayisi numeric, musteri_basina_rezervasyon numeric, ilk_kez bigint, ikinci_kez bigint, uc_bes bigint, alti_on bigint, on_plus bigint, en_sik_gelenler jsonb, en_cok_kisi_getirenler jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  with tum_ziyaretler as (
    select r.id, r.guest_name, r.guest_phone, r.party_size, r.reserved_at,
      coalesce(r.kisi_karti_id::text, nullif(regexp_replace(coalesce(r.guest_phone, ''), '\D', '', 'g'), ''), lower(trim(r.guest_name))) as anahtar
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null and r.status in ('oturdu', 'tamamlandi')
  ),
  musteri_ozet as (
    select anahtar, (array_agg(guest_name order by reserved_at desc))[1] as isim,
      (array_agg(guest_phone order by reserved_at desc))[1] as telefon,
      count(*) as toplam_ziyaret, min(reserved_at) as ilk_ziyaret, max(reserved_at) as son_ziyaret,
      sum(party_size) as toplam_getirdigi_kisi
    from tum_ziyaretler
    group by anahtar
  ),
  donem_musteriler as (
    select distinct anahtar from tum_ziyaretler where reserved_at >= p_baslangic and reserved_at < p_bitis
  ),
  donem_frekans as (
    select mo.anahtar, mo.toplam_ziyaret,
      case when mo.toplam_ziyaret > 1 then extract(epoch from (mo.son_ziyaret - mo.ilk_ziyaret)) / 86400 / (mo.toplam_ziyaret - 1) end as sikliği_gun
    from musteri_ozet mo join donem_musteriler dm on dm.anahtar = mo.anahtar
  )
  select
    (select count(*) from kisi_kartlari where restaurant_id = p_restaurant)::bigint,
    (select count(*) from kisi_kartlari where restaurant_id = p_restaurant and vip)::bigint,
    (select count(*) from donem_musteriler)::bigint,
    (select count(*) from musteri_ozet mo join donem_musteriler dm on dm.anahtar = mo.anahtar where mo.ilk_ziyaret >= p_baslangic)::bigint,
    (select count(*) from musteri_ozet where son_ziyaret < p_bitis - interval '90 days')::bigint,
    (select round(avg(sikliği_gun)::numeric, 1) from donem_frekans where sikliği_gun is not null),
    (select round(avg(toplam_ziyaret)::numeric, 1) from donem_frekans),
    case when (select count(*) from donem_musteriler) > 0
      then round((select count(*) from tum_ziyaretler where reserved_at >= p_baslangic and reserved_at < p_bitis)::numeric / (select count(*) from donem_musteriler), 1)
      else null end,
    (select count(*) from donem_frekans where toplam_ziyaret = 1)::bigint,
    (select count(*) from donem_frekans where toplam_ziyaret = 2)::bigint,
    (select count(*) from donem_frekans where toplam_ziyaret between 3 and 5)::bigint,
    (select count(*) from donem_frekans where toplam_ziyaret between 6 and 10)::bigint,
    (select count(*) from donem_frekans where toplam_ziyaret > 10)::bigint,
    (select coalesce(jsonb_agg(jsonb_build_object('isim', x.isim, 'telefon', x.telefon, 'ziyaret', x.toplam_ziyaret)), '[]'::jsonb)
       from (select isim, telefon, toplam_ziyaret from musteri_ozet order by toplam_ziyaret desc limit 10) x),
    (select coalesce(jsonb_agg(jsonb_build_object('isim', x.isim, 'telefon', x.telefon, 'kisi', x.toplam_getirdigi_kisi)), '[]'::jsonb)
       from (select isim, telefon, toplam_getirdigi_kisi from musteri_ozet order by toplam_getirdigi_kisi desc limit 10) x);
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_rezervasyon(p_restaurant uuid, p_baslangic timestamp with time zone, p_bitis timestamp with time zone)
 RETURNS TABLE(gunluk_dagilim jsonb, saatlik_dagilim jsonb, haftanin_gunu_dagilim jsonb, ortalama_onceden_gun numeric, ayni_gun_orani numeric, grup_1_2 bigint, grup_3_4 bigint, grup_5_6 bigint, grup_7_plus bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with donem as (
    select r.*, (r.reserved_at at time zone 'Europe/Istanbul') as yerel_rez, (r.created_at at time zone 'Europe/Istanbul') as yerel_olusturma
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at >= p_baslangic and r.reserved_at < p_bitis
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('gun', g.gun, 'rezervasyon', g.adet, 'misafir', g.misafir) order by g.gun), '[]'::jsonb)
       from (select yerel_rez::date as gun, count(*) as adet, sum(party_size) as misafir from donem group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('saat', g.saat, 'rezervasyon', g.adet) order by g.saat), '[]'::jsonb)
       from (select extract(hour from yerel_rez)::int as saat, count(*) as adet from donem group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('gun_no', g.gun_no, 'rezervasyon', g.adet) order by g.gun_no), '[]'::jsonb)
       from (select ((extract(dow from yerel_rez)::int + 6) % 7) as gun_no, count(*) as adet from donem group by 1) g),
    (select round(avg(extract(epoch from (reserved_at - created_at)) / 86400), 1) from donem),
    case when count(*) > 0
      then round((count(*) filter (where yerel_olusturma::date = yerel_rez::date))::numeric / count(*) * 100, 1)
      else null end,
    count(*) filter (where party_size <= 2),
    count(*) filter (where party_size between 3 and 4),
    count(*) filter (where party_size between 5 and 6),
    count(*) filter (where party_size >= 7)
  from donem;
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_rezervasyon_gun_karsilastirma(p_restaurant uuid, p_gunler date[])
 RETURNS TABLE(gun date, dolu_masa numeric, dolu_oran numeric, bos_masa numeric, bos_oran numeric, geldi_kap numeric, kapi_kap numeric, toplam numeric, alinan numeric, misafir numeric, geldi numeric, gelmedi numeric, iptal numeric, bekleyen numeric, kapidan numeric, yedek numeric, yedekten numeric, onceden_gun numeric, ayni_gun_oran numeric, son_dk_adet numeric, son_dk_iptal numeric, gelen_kisi numeric, sapma_kisi numeric, doluluk numeric, masa_doluluk numeric, ort_sure numeric, masa_oturma numeric, ciro numeric, kisi_basi numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select g.gun, o.* from unnest(p_gunler) as g(gun)
  cross join lateral public.istatistik_rzv_olculer(p_restaurant, g.gun, (g.gun + 1)) o
  order by g.gun;
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_rezervasyon_ozet_satirlari(p_restaurant uuid, p_referans timestamp with time zone)
 RETURNS TABLE(kategori text, gunluk numeric, haftalik numeric, aylik numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with s as (
    select (p_referans at time zone 'Europe/Istanbul')::date g,
           date_trunc('week',  (p_referans at time zone 'Europe/Istanbul'))::date hb,
           date_trunc('month', (p_referans at time zone 'Europe/Istanbul'))::date ab
  ),
  d as (select o.* from s, lateral public.istatistik_rzv_olculer(p_restaurant, s.g, (s.g + 1)) o),
  w as (select o.* from s, lateral public.istatistik_rzv_olculer(p_restaurant, s.hb, (s.hb + 7)) o),
  m as (select o.* from s, lateral public.istatistik_rzv_olculer(p_restaurant, s.ab, (s.ab + interval '1 month')::date) o)
  select * from (values
    ('toplam',      (select toplam      from d), (select toplam      from w), (select toplam      from m)),
    ('misafir',     (select misafir     from d), (select misafir     from w), (select misafir     from m)),
    ('geldi',       (select geldi       from d), (select geldi       from w), (select geldi       from m)),
    ('gelmedi',     (select gelmedi     from d), (select gelmedi     from w), (select gelmedi     from m)),
    ('iptal',       (select iptal       from d), (select iptal       from w), (select iptal       from m)),
    ('bekleyen',    (select bekleyen    from d), (select bekleyen    from w), (select bekleyen    from m)),
    ('kapidan',     (select kapidan     from d), (select kapidan     from w), (select kapidan     from m)),
    ('yedek',       (select yedek       from d), (select yedek       from w), (select yedek       from m)),
    ('doluluk',     (select doluluk     from d), (select doluluk     from w), (select doluluk     from m)),
    ('ort_sure',    (select ort_sure    from d), (select ort_sure    from w), (select ort_sure    from m)),
    ('masa_oturma', (select masa_oturma from d), (select masa_oturma from w), (select masa_oturma from m)),
    ('ciro',        (select ciro        from d), (select ciro        from w), (select ciro        from m)),
    ('kisi_basi',   (select kisi_basi   from d), (select kisi_basi   from w), (select kisi_basi   from m))
  ) v(kategori, gunluk, haftalik, aylik);
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_rzv_donemler(p_restaurant uuid, p_bugun date)
 RETURNS TABLE(anahtar text, sira integer, dolu_masa numeric, dolu_oran numeric, bos_masa numeric, bos_oran numeric, geldi_kap numeric, kapi_kap numeric, toplam numeric, alinan numeric, misafir numeric, geldi numeric, gelmedi numeric, iptal numeric, bekleyen numeric, kapidan numeric, yedek numeric, yedekten numeric, onceden_gun numeric, ayni_gun_oran numeric, son_dk_adet numeric, son_dk_iptal numeric, gelen_kisi numeric, sapma_kisi numeric, doluluk numeric, masa_doluluk numeric, ort_sure numeric, masa_oturma numeric, ciro numeric, kisi_basi numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with s as (
    select p_bugun b, date_trunc('week', p_bugun)::date hb,
           date_trunc('month', p_bugun)::date ab,
           date_trunc('week', (p_bugun - interval '1 year'))::date gyh
  ),
  d as (
    select * from (values
      ('bugun',            1,  (select b from s),                                (select b + 1 from s)),
      ('gecen_hafta_gun',  2,  (select b - 7 from s),                            (select b - 6 from s)),
      ('dun',              3,  (select b - 1 from s),                            (select b from s)),
      ('gecen_hafta_dun',  4,  (select b - 8 from s),                            (select b - 7 from s)),
      ('bu_hafta',         5,  (select hb from s),                               (select b + 1 from s)),
      ('gecen_hafta',      6,  (select hb - 7 from s),                           (select hb from s)),
      ('gecen_yil_hafta',  7,  (select gyh from s),                              (select gyh + 7 from s)),
      ('bu_ay',            8,  (select ab from s),                               (select b + 1 from s)),
      ('gecen_ay',         9,  (select (ab - interval '1 month')::date from s),   (select ab from s)),
      ('gecen_yil_ay',     10, (select (ab - interval '1 year')::date from s),
                               (select (ab - interval '1 year' + interval '1 month')::date from s))
    ) v(anahtar, sira, bas, bit)
  )
  select d.anahtar, d.sira, o.* from d
  cross join lateral public.istatistik_rzv_olculer(p_restaurant, d.bas, d.bit) o
  order by d.sira;
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_rzv_olculer(p_restaurant uuid, p_bas date, p_bit date)
 RETURNS TABLE(dolu_masa numeric, dolu_oran numeric, bos_masa numeric, bos_oran numeric, geldi_kap numeric, kapi_kap numeric, toplam numeric, alinan numeric, misafir numeric, geldi numeric, gelmedi numeric, iptal numeric, bekleyen numeric, kapidan numeric, yedek numeric, yedekten numeric, onceden_gun numeric, ayni_gun_oran numeric, son_dk_adet numeric, son_dk_iptal numeric, gelen_kisi numeric, sapma_kisi numeric, doluluk numeric, masa_doluluk numeric, ort_sure numeric, masa_oturma numeric, ciro numeric, kisi_basi numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with kap as (
    select coalesce(sum(t.seat_count), 0)::numeric k, count(*)::numeric m
    from restaurant_tables t
    where t.restaurant_id = p_restaurant and t.deleted_at is null
  ),
  gun as (select greatest(1, (p_bit - p_bas))::numeric d),
  kapasite as (select (select m from kap) * (select d from gun) as mg,
                      (select k from kap) * (select d from gun) as kg),
  r as (
    select *,
      ((reserved_at at time zone 'Europe/Istanbul')::date
       - (created_at  at time zone 'Europe/Istanbul')::date) as onceden,
      coalesce(gelen_kisi, party_size) as gercek_kisi
    from reservations
    where restaurant_id = p_restaurant and deleted_at is null
      and (reserved_at at time zone 'Europe/Istanbul')::date >= p_bas
      and (reserved_at at time zone 'Europe/Istanbul')::date <  p_bit
  ),
  n  as (select * from r where not yedek),
  v  as (select * from n where status <> 'iptal'),
  g  as (select * from v where status in ('geldi', 'oturdu', 'tamamlandi')),
  rn as (select * from n where source <> 'kapi'),
  rv as (select * from v where source <> 'kapi'),
  rg as (select * from g where source <> 'kapi'),
  kp as (select * from v where source = 'kapi'),
  ip as (select * from rn where status = 'iptal'),
  sd as (select count(*)::numeric c from ip
         where (cancelled_at at time zone 'Europe/Istanbul')::date
               = (reserved_at at time zone 'Europe/Istanbul')::date),
  d as (select ((select count(*) from rg) + (select count(*) from kp))::numeric dolu)
  select
    (select dolu from d),
    case when (select mg from kapasite) > 0 then round(100.0 * (select dolu from d) / (select mg from kapasite)) end,
    greatest(0, (select mg from kapasite) - (select dolu from d)),
    case when (select mg from kapasite) > 0
      then round(100.0 * greatest(0, (select mg from kapasite) - (select dolu from d)) / (select mg from kapasite)) end,
    case when (select mg from kapasite) > 0 then round(100.0 * (select count(*) from rg) / (select mg from kapasite)) end,
    case when (select mg from kapasite) > 0 then round(100.0 * (select count(*) from kp) / (select mg from kapasite)) end,
    (select count(*) from rv)::numeric,
    (select count(*) from rn)::numeric,
    (select coalesce(sum(party_size), 0) from v)::numeric,
    (select count(*) from rg)::numeric,
    (select count(*) from rv where status = 'gelmedi')::numeric,
    (select count(*) from ip)::numeric,
    (select count(*) from rv where status = 'bekleniyor')::numeric,
    (select count(*) from kp)::numeric,
    (select count(*) from r where yedek)::numeric,
    (select count(*) from rv where yedekten)::numeric,
    (select round(avg(onceden), 1) from rv),
    case when (select count(*) from rv) > 0
      then round(100.0 * (select count(*) from rv where onceden <= 0) / (select count(*) from rv)) end,
    (select c from sd),
    case when (select count(*) from rn) > 0
      then round(100.0 * (select c from sd) / (select count(*) from rn)) end,
    (select coalesce(sum(gercek_kisi), 0) from g)::numeric,
    (select coalesce(sum(gercek_kisi) - sum(party_size), 0) from rg)::numeric,
    case when (select kg from kapasite) > 0
      then round(100.0 * (select coalesce(sum(gercek_kisi), 0) from g) / (select kg from kapasite)) end,
    case when (select mg from kapasite) > 0
      then round(100.0 * (select count(*) from rv) / (select mg from kapasite)) end,
    (select round(avg(extract(epoch from (left_at - seated_at)) / 60))
       from g where left_at is not null and seated_at is not null),
    case when (select count(distinct table_id) from g where table_id is not null) > 0
      then round((select count(*) from g)::numeric
                 / (select count(distinct table_id) from g where table_id is not null), 1) end,
    (select coalesce(sum(hesap_tutari), 0) from g)::numeric,
    case when (select coalesce(sum(gercek_kisi), 0) from g where hesap_tutari is not null) > 0
      then round((select sum(hesap_tutari) from g where hesap_tutari is not null)
                 / (select sum(gercek_kisi) from g where hesap_tutari is not null)) end
$function$
;

CREATE OR REPLACE FUNCTION public.istatistik_walkin(p_restaurant uuid, p_baslangic timestamp with time zone, p_bitis timestamp with time zone)
 RETURNS TABLE(toplam_rezervasyon bigint, toplam_walkin bigint, toplam_walkin_kisi bigint, gun_dagilimi jsonb, saat_dagilimi jsonb, salon_dagilimi jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  with donem as (
    select r.*, (r.reserved_at at time zone 'Europe/Istanbul') as yerel
    from reservations r
    where r.restaurant_id = p_restaurant and r.deleted_at is null
      and r.reserved_at >= p_baslangic and r.reserved_at < p_bitis
  ),
  walkinler as (select * from donem where source = 'kapi')
  select
    (select count(*) from donem)::bigint,
    (select count(*) from walkinler)::bigint,
    (select coalesce(sum(party_size), 0) from walkinler)::bigint,
    (select coalesce(jsonb_agg(jsonb_build_object('gun_no', g.gun_no, 'adet', g.adet)), '[]'::jsonb)
       from (select ((extract(dow from yerel)::int + 6) % 7) as gun_no, count(*) as adet from walkinler group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('saat', g.saat, 'adet', g.adet)), '[]'::jsonb)
       from (select extract(hour from yerel)::int as saat, count(*) as adet from walkinler group by 1) g),
    (select coalesce(jsonb_agg(jsonb_build_object('salon', g.salon, 'adet', g.adet) order by g.adet desc), '[]'::jsonb)
       from (
         select coalesce(a.name, 'DİĞER') as salon, count(distinct w.id) as adet
         from walkinler w
         join reservation_tables rt on rt.reservation_id = w.id
         join restaurant_tables t on t.id = rt.table_id
         left join dining_areas a on a.id = t.area_id
         group by 1
       ) g);
$function$
;

CREATE OR REPLACE FUNCTION public.katilim_kodu_uret()
 RETURNS text
 LANGUAGE sql
AS $function$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 31)::int + 1, 1), '')
  from generate_series(1, 6);
$function$
;

CREATE OR REPLACE FUNCTION public.kisi_karti_getir(p_restaurant uuid, p_phone text, p_kisi_karti_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(kart_id uuid, isim text, kart_notu text, dogum_gunu date, vip boolean, yemek_tercihi text, icki_tercihi text, ziyaret_sayisi bigint, gelmedi_sayisi bigint, iptal_sayisi bigint, toplam_kayit bigint, ilk_kayit_tarihi timestamp with time zone, ilk_ziyaret timestamp with time zone, son_ziyaret timestamp with time zone, son_rezervasyon_durumu text, ortalama_kisi numeric, en_sik_gun_no integer, en_sik_saat integer, en_sik_masa text, ortalama_kalis_dk integer, ortalama_siklik_gun integer, kanal_dagilimi jsonb, tum_gecmis jsonb, baglantilar jsonb, ai_ozet text, ai_ozet_kayit integer, kullanilan_isimler jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_kart_id uuid;
begin
  if p_kisi_karti_id is not null then
    select k.id into v_kart_id from kisi_kartlari k where k.id = p_kisi_karti_id and k.restaurant_id = p_restaurant;
  end if;

  if v_kart_id is null and length(v_digits) >= 10 then
    select k.id into v_kart_id
    from kisi_kartlari k
    where k.restaurant_id = p_restaurant
      and right(regexp_replace(k.phone, '\D', '', 'g'), 10) = v_digits
    limit 1;

    if v_kart_id is null then
      select b.kisi_karti_id into v_kart_id
      from kisi_kart_baglantilari b
      join kisi_kartlari k2 on k2.id = b.kisi_karti_id
      where k2.restaurant_id = p_restaurant
        and right(regexp_replace(b.baglanti_telefon, '\D', '', 'g'), 10) = v_digits
      limit 1;
    end if;
  end if;

  if v_kart_id is null and length(v_digits) < 10 then
    return;
  end if;

  return query
  with numaralar as (
    select v_digits as d where length(v_digits) >= 10
    union
    select right(regexp_replace(k.phone, '\D', '', 'g'), 10) from kisi_kartlari k where k.id = v_kart_id
    union
    select right(regexp_replace(b.baglanti_telefon, '\D', '', 'g'), 10) from kisi_kart_baglantilari b where b.kisi_karti_id = v_kart_id
  ),
  kayitlar as (
    select r.*, (r.reserved_at at time zone 'Europe/Istanbul') as yerel
    from reservations r
    where r.restaurant_id = p_restaurant
      and r.deleted_at is null
      and (
        (v_kart_id is not null and r.kisi_karti_id = v_kart_id)
        or (r.guest_phone is not null and right(regexp_replace(r.guest_phone, '\D', '', 'g'), 10) in (select d from numaralar))
      )
  ),
  ziyaretler as (
    select * from kayitlar where status in ('oturdu', 'tamamlandi')
  )
  select
    v_kart_id,
    (select k.isim from kisi_kartlari k where k.id = v_kart_id),
    (select k.kart_notu from kisi_kartlari k where k.id = v_kart_id),
    (select k.dogum_gunu from kisi_kartlari k where k.id = v_kart_id),
    coalesce((select k.vip from kisi_kartlari k where k.id = v_kart_id), false),
    (select k.yemek_tercihi from kisi_kartlari k where k.id = v_kart_id),
    (select k.icki_tercihi from kisi_kartlari k where k.id = v_kart_id),
    (select count(*) from ziyaretler),
    (select count(*) from kayitlar where status = 'gelmedi'),
    (select count(*) from kayitlar where status = 'iptal'),
    (select count(*) from kayitlar),
    (select min(k.created_at) from kayitlar k),
    (select min(z.reserved_at) from ziyaretler z),
    (select max(z.reserved_at) from ziyaretler z),
    (select k.status from kayitlar k order by k.reserved_at desc limit 1),
    (select round(avg(z.party_size), 1) from ziyaretler z),
    (select extract(dow from z.yerel)::int from ziyaretler z group by 1 order by count(*) desc, 1 limit 1),
    (select extract(hour from z.yerel)::int from ziyaretler z group by 1 order by count(*) desc, 1 limit 1),
    (select t.name from ziyaretler z join restaurant_tables t on t.id = z.table_id group by t.name order by count(*) desc, t.name limit 1),
    (select round(avg(extract(epoch from (z.left_at - z.arrived_at)) / 60))::int
       from ziyaretler z where z.arrived_at is not null and z.left_at is not null),
    (select case when count(*) > 1
       then round(extract(epoch from (max(z.reserved_at) - min(z.reserved_at))) / 86400 / (count(*) - 1))::int
     end from ziyaretler z),
    (select coalesce(jsonb_object_agg(s.source, s.adet), '{}'::jsonb)
       from (select k2.source, count(*) as adet from kayitlar k2 group by k2.source) s),
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.reserved_at desc), '[]'::jsonb) from (
       select k.reserved_at, k.party_size, k.note, k.status, k.cancel_reason, k.hesap_tutari, t.name as masa
       from kayitlar k
       left join restaurant_tables t on t.id = k.table_id
       order by k.reserved_at desc
       limit 30) x),
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', b2.id, 'telefon', b2.baglanti_telefon, 'aciklama', b2.aciklama) order by b2.created_at)
       from kisi_kart_baglantilari b2 where b2.kisi_karti_id = v_kart_id),
      '[]'::jsonb
    ),
    (select k.ai_ozet from kisi_kartlari k where k.id = v_kart_id),
    (select k.ai_ozet_kayit from kisi_kartlari k where k.id = v_kart_id),
    -- Bu numarayla hangi isimlerle gelinmiş (Gökhan, 2026-08-15). Kart tek kalır, personel
    -- farkı görür. En çok kullanılan isim başta.
    (select coalesce(jsonb_agg(x.ad order by x.adet desc, x.ad), '[]'::jsonb) from (
       select btrim(k.guest_name) as ad, count(*) as adet
       from kayitlar k
       where k.guest_name is not null and btrim(k.guest_name) <> ''
       group by btrim(k.guest_name)) x);
end;
$function$
;

