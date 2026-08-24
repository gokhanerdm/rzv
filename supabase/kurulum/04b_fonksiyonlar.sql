-- RZV veritabani yapisi — 4/6: FONKSIYONLAR (2/4)
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.daily_summary(p_restaurant uuid, p_date date)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
declare
  result json;
begin
  with closed as (
    select o.id, o.total_amount, o.channel
    from orders o
    where o.restaurant_id = p_restaurant
      and o.status = 'closed'
      and (o.closed_at at time zone 'Europe/Istanbul')::date = p_date
  ),
  cost as (
    select coalesce(sum(-sm.quantity * sm.unit_cost), 0) as total_cost
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
      and sm.movement_type = 'consumption'
      and (sm.occurred_at at time zone 'Europe/Istanbul')::date = p_date
  ),
  prod as (
    select mi.id, mi.name,
      sum(oi.quantity * oi.unit_price) as revenue,
      coalesce(sum(oi.quantity * (
        select coalesce(sum(ri.quantity * ing.current_unit_cost), 0)
        from recipe_items ri
        join ingredients ing on ing.id = ri.ingredient_id
        where ri.menu_item_id = mi.id
      )), 0) as cost
    from order_items oi
    join closed c on c.id = oi.order_id
    join menu_items mi on mi.id = oi.menu_item_id
    where oi.status = 'active'
    group by mi.id, mi.name
  )
  select json_build_object(
    'ciro', (select coalesce(sum(total_amount), 0) from closed),
    'maliyet', (select total_cost from cost),
    'adisyon', (select count(*) from closed),
    'kanal', (select coalesce(json_agg(json_build_object('channel', channel, 'ciro', s)), '[]')
              from (select channel, sum(total_amount) s from closed group by channel) k),
    'urunler', (select coalesce(json_agg(json_build_object('name', name, 'kar', round(revenue - cost, 2)) order by (revenue - cost) desc), '[]')
                from prod)
  ) into result;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.end_reservation_visit(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_masa_id uuid;
begin
  update reservations
  set status = 'tamamlandi', left_at = now()
  where id = p_reservation_id and status = 'oturdu';
  if not found then
    raise exception 'Oturan bir rezervasyon bulunamadı';
  end if;

  for v_masa_id in select table_id from reservation_tables where reservation_id = p_reservation_id loop
    update restaurant_tables
    set status = 'empty', reservation_note = null, updated_at = now()
    where id = v_masa_id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.erisilen_restoranlar()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id from public.restaurants r
   where r.owner_user_id = auth.uid() and r.deleted_at is null
  union
  select p.restaurant_id from public.profiles p
   where p.id = auth.uid() and p.restaurant_id is not null
  union
  select h.restaurant_id from public.personel_hesaplari h
   where h.user_id = auth.uid() and h.durum = 'onayli';
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_staff_meal_order(p_restaurant_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_order_id uuid;
begin
  select id into v_order_id from orders
  where restaurant_id = p_restaurant_id and channel = 'personel' and status = 'open'
  limit 1;

  if v_order_id is not null then
    return v_order_id;
  end if;

  insert into orders (restaurant_id, table_id, status, channel, party_size)
  values (p_restaurant_id, null, 'open', 'personel', 1)
  returning id into v_order_id;

  return v_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gorebildigim_sayfalar()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when exists (select 1 from public.restaurants r
                  where r.owner_user_id = auth.uid() and r.deleted_at is null)
      then array['rezervasyon', 'posta', 'salon', 'istatistik', 'ayarlar']
    else coalesce((
      select array(select jsonb_array_elements_text(
               coalesce(s.rol_sayfalari -> h.rol, '["rezervasyon"]'::jsonb)))
      from public.personel_hesaplari h
      join public.restaurant_settings s on s.restaurant_id = h.restaurant_id
      where h.user_id = auth.uid() and h.durum = 'onayli'
      order by h.test_aktif desc, h.created_at desc
      limit 1
    ), array[]::text[])
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.guest_history(p_restaurant uuid, p_phone text)
 RETURNS TABLE(ziyaret_sayisi bigint, son_not text, son_tarih timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select
    count(*)::bigint,
    (array_agg(note order by reserved_at desc) filter (where note is not null and trim(note) <> ''))[1],
    max(reserved_at)
  from reservations
  where restaurant_id = p_restaurant
    and status = 'oturdu'
    and guest_phone is not null
    and length(regexp_replace(p_phone, '\D', '', 'g')) >= 10
    and right(regexp_replace(guest_phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
$function$
;

CREATE OR REPLACE FUNCTION public.ingredient_expected_usage(p_restaurant uuid, p_days_ahead integer DEFAULT 7)
 RETURNS TABLE(ingredient_id uuid, ingredient_name text, category text, unit text, par_level numeric, current_unit_cost numeric, current_stock numeric, avg_daily_usage numeric, expected_usage numeric, supplier_id uuid, supplier_name text, stock_group_id uuid, stock_group_name text, sort_order integer)
 LANGUAGE sql
AS $function$
  with stock_now as (
    select sm.ingredient_id, sum(sm.quantity) as qty
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
    group by sm.ingredient_id
  ),
  recent_usage as (
    select sm.ingredient_id, sum(-sm.quantity) / 28.0 as avg_daily
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
      and sm.movement_type in ('consumption', 'waste')
      and sm.occurred_at >= now() - interval '28 days'
    group by sm.ingredient_id
  )
  select
    i.id, i.name, i.category, i.unit, i.par_level, i.current_unit_cost,
    coalesce(sn.qty, 0),
    coalesce(ru.avg_daily, 0),
    coalesce(ru.avg_daily, 0) * p_days_ahead,
    i.supplier_id, s.name,
    i.stock_group_id, g.name,
    i.sort_order
  from ingredients i
  left join stock_now sn on sn.ingredient_id = i.id
  left join recent_usage ru on ru.ingredient_id = i.id
  left join suppliers s on s.id = i.supplier_id
  left join stock_groups g on g.id = i.stock_group_id
  where i.restaurant_id = p_restaurant and i.deleted_at is null
  order by i.sort_order;
$function$
;

CREATE OR REPLACE FUNCTION public.isim_ile_gecmis(p_restaurant uuid, p_isim text)
 RETURNS TABLE(bulunan_telefon text, ziyaret_sayisi bigint, gelmedi_sayisi bigint, iptal_sayisi bigint, toplam_kayit bigint, son_ziyaret timestamp with time zone, ortalama_kisi numeric, en_sik_masa text, son_kayitlar jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_isim text := lower(trim(coalesce(p_isim, '')));
begin
  if length(v_isim) < 3 then
    return;
  end if;

  return query
  with kayitlar as (
    select r.* from reservations r
    where r.restaurant_id = p_restaurant
      and r.deleted_at is null
      and lower(trim(r.guest_name)) = v_isim
  ),
  ziyaretler as (
    select * from kayitlar where status in ('oturdu', 'tamamlandi')
  )
  select
    (select k.guest_phone from kayitlar k where k.guest_phone is not null order by k.created_at desc limit 1),
    (select count(*) from ziyaretler),
    (select count(*) from kayitlar where status = 'gelmedi'),
    (select count(*) from kayitlar where status = 'iptal'),
    (select count(*) from kayitlar),
    (select max(z.reserved_at) from ziyaretler z),
    (select round(avg(z.party_size), 1) from ziyaretler z),
    (select t.name from ziyaretler z join restaurant_tables t on t.id = z.table_id group by t.name order by count(*) desc, t.name limit 1),
    (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
       select k.reserved_at, k.party_size, k.status, k.guest_phone, k.note
       from kayitlar k
       order by k.reserved_at desc
       limit 5) x);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.isim_soyad_ile_ara(p_restaurant uuid, p_isim text, p_soyad_prefix text)
 RETURNS TABLE(kisi_karti_id uuid, guest_name text, guest_phone text, son_gorulen timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  with eslesen as (
    select
      r.guest_name, r.guest_phone, r.reserved_at, r.kisi_karti_id,
      right(regexp_replace(r.guest_phone, '\D', '', 'g'), 10) as digits
    from reservations r
    where r.restaurant_id = p_restaurant
      and r.deleted_at is null
      and r.guest_phone is not null
      and length(regexp_replace(r.guest_phone, '\D', '', 'g')) >= 10
      and lower(split_part(trim(r.guest_name), ' ', 1)) = lower(trim(p_isim))
      and lower(trim(substring(trim(r.guest_name) from length(split_part(trim(r.guest_name), ' ', 1)) + 1)))
          like lower(trim(p_soyad_prefix)) || '%'
  ),
  gruplu as (
    select
      digits,
      (array_agg(guest_name order by reserved_at desc))[1] as guest_name,
      (array_agg(guest_phone order by reserved_at desc))[1] as guest_phone,
      (array_agg(kisi_karti_id order by reserved_at desc) filter (where kisi_karti_id is not null))[1] as kisi_karti_id_rez,
      max(reserved_at) as son_gorulen
    from eslesen
    group by digits
  )
  select coalesce(g.kisi_karti_id_rez, k.id), g.guest_name, g.guest_phone, g.son_gorulen
  from gruplu g
  left join kisi_kartlari k
    on k.restaurant_id = p_restaurant
    and right(regexp_replace(k.phone, '\D', '', 'g'), 10) = g.digits
  order by g.son_gorulen desc
  limit 8;
$function$
;

CREATE OR REPLACE FUNCTION public.isletme_personeli(p_restaurant uuid)
 RETURNS TABLE(id uuid, ad_soyad text, rol text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select h.id, h.ad_soyad, h.rol
  from public.personel_hesaplari h
  where h.restaurant_id = p_restaurant
    and h.durum = 'onayli'
    and (public.yonetici_mi() or p_restaurant in (select public.erisilen_restoranlar()))
  order by h.ad_soyad;
$function$
;

CREATE OR REPLACE FUNCTION public.isletme_tipi_varsayilani(p_tip text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_tip
    when 'gece_kulubu' then jsonb_build_object(
      'acilis', '23:00', 'kapanis', '06:00', 'isletme_gunu_saati', '06:00',
      'default_duration_minutes', 180, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', true, 'masa_paketi_acik', true,
      'ozel_gece_acik', true, 'pr_acik', true, 'guest_list_acik', true,
      'masa_hesabi_acik', true)
    when 'gece_kulubu_canli' then jsonb_build_object(
      'acilis', '00:00', 'kapanis', '06:00', 'isletme_gunu_saati', '06:00',
      'default_duration_minutes', 180, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', true, 'masa_paketi_acik', true,
      'ozel_gece_acik', true, 'pr_acik', true, 'guest_list_acik', true,
      'masa_hesabi_acik', true)
    when 'yn_meyhane' then jsonb_build_object(
      'acilis', '20:00', 'kapanis', '04:00', 'isletme_gunu_saati', '04:00',
      'default_duration_minutes', 180, 'saate_gore_masa', false,
      'fix_menu_acik', true, 'minimum_harcama_acik', true, 'masa_paketi_acik', true,
      'ozel_gece_acik', true, 'pr_acik', true, 'guest_list_acik', true,
      'masa_hesabi_acik', false)
    when 'gazino' then jsonb_build_object(
      'acilis', '20:00', 'kapanis', '04:00', 'isletme_gunu_saati', '04:00',
      'default_duration_minutes', 240, 'saate_gore_masa', false,
      'fix_menu_acik', true, 'minimum_harcama_acik', true, 'masa_paketi_acik', true,
      'ozel_gece_acik', true, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
    when 'canli_muzik' then jsonb_build_object(
      'acilis', '18:00', 'kapanis', '01:00', 'isletme_gunu_saati', '01:00',
      'default_duration_minutes', 180, 'saate_gore_masa', false,
      'fix_menu_acik', true, 'minimum_harcama_acik', true, 'masa_paketi_acik', true,
      'ozel_gece_acik', true, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
    when 'meyhane' then jsonb_build_object(
      'acilis', '18:00', 'kapanis', '03:00', 'isletme_gunu_saati', '03:00',
      'default_duration_minutes', 180, 'saate_gore_masa', false,
      'fix_menu_acik', true, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', true, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
    when 'bar_pub' then jsonb_build_object(
      'acilis', '18:00', 'kapanis', '04:00', 'isletme_gunu_saati', '04:00',
      'default_duration_minutes', 120, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', true, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
    when 'kafe' then jsonb_build_object(
      'acilis', '08:00', 'kapanis', '23:00', 'isletme_gunu_saati', '00:00',
      'default_duration_minutes', 60, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
    when 'kafeterya' then jsonb_build_object(
      'acilis', '08:00', 'kapanis', '23:00', 'isletme_gunu_saati', '00:00',
      'default_duration_minutes', 60, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
    when 'pastane' then jsonb_build_object(
      'acilis', '07:00', 'kapanis', '21:00', 'isletme_gunu_saati', '00:00',
      'default_duration_minutes', 45, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
    when 'fast_food' then jsonb_build_object(
      'acilis', '10:00', 'kapanis', '23:59', 'isletme_gunu_saati', '00:00',
      'default_duration_minutes', 30, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
    when 'restoran' then jsonb_build_object(
      'acilis', '12:00', 'kapanis', '23:59', 'isletme_gunu_saati', '00:00',
      'default_duration_minutes', 90, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
    else jsonb_build_object(
      'acilis', '09:00', 'kapanis', '23:00', 'isletme_gunu_saati', '00:00',
      'default_duration_minutes', 90, 'saate_gore_masa', false,
      'fix_menu_acik', false, 'minimum_harcama_acik', false, 'masa_paketi_acik', false,
      'ozel_gece_acik', false, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
  end;
$function$
;
