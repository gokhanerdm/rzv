-- RZV veritabani yapisi — 4/6: FONKSIYONLAR (4/6)
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.mark_item_ready(p_order_item_id uuid, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_rest uuid;
  v_menu_item uuid;
  v_qty int;
  v_updated int;
begin
  select restaurant_id, menu_item_id, quantity into v_rest, v_menu_item, v_qty
  from order_items
  where id = p_order_item_id
    and status in ('active', 'ikram', 'personel')
    and sent_at is not null and ready_at is null;
  if not found then
    return;
  end if;

  update order_items set ready_at = now(), prepared_by_staff_id = p_staff_id
  where id = p_order_item_id and ready_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return;
  end if;

  insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id)
  select v_rest, ri.ingredient_id, 'consumption',
         -(ri.quantity * v_qty), i.current_unit_cost, 'order', p_order_item_id
  from recipe_items ri
  join ingredients i on i.id = ri.ingredient_id
  where ri.menu_item_id = v_menu_item;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_item_served(p_order_item_id uuid, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_order_id uuid;
  v_menu_item uuid;
  v_variant uuid;
  v_price numeric;
  v_status text;
  v_qty int;
  v_updated int;
  v_target_id uuid;
  v_has_modifiers boolean;
  v_has_discount boolean;
begin
  select order_id, menu_item_id, variant_id, unit_price, status, quantity
  into v_order_id, v_menu_item, v_variant, v_price, v_status, v_qty
  from order_items
  where id = p_order_item_id and ready_at is not null and served_at is null;
  if not found then
    return;
  end if;

  update order_items set served_at = now()
  where id = p_order_item_id and served_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return;
  end if;

  select exists(select 1 from order_item_modifiers where order_item_id = p_order_item_id) into v_has_modifiers;
  select exists(select 1 from order_discounts where order_item_id = p_order_item_id) into v_has_discount;
  if v_has_modifiers or v_has_discount then
    return;
  end if;

  select oi.id into v_target_id
  from order_items oi
  where oi.order_id = v_order_id and oi.id <> p_order_item_id
    and oi.menu_item_id = v_menu_item
    and oi.variant_id is not distinct from v_variant
    and oi.unit_price = v_price
    and oi.status = v_status
    and oi.served_at is not null
    and not exists (select 1 from order_item_modifiers m where m.order_item_id = oi.id)
    and not exists (select 1 from order_discounts d where d.order_item_id = oi.id)
  order by oi.created_at
  limit 1;

  if v_target_id is not null then
    update order_items set quantity = quantity + v_qty where id = v_target_id;
    delete from order_items where id = p_order_item_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_order_payment_collected(p_order_id uuid, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_table uuid;
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_discounts numeric(12,2);
begin
  select table_id into v_table from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_total from order_items where order_id = p_order_id and status = 'active';
  select coalesce(sum(amount), 0) into v_discounts from order_discounts where order_id = p_order_id;
  v_total := greatest(0, v_total - v_discounts);

  select coalesce(sum(amount), 0) into v_paid from order_payments where order_id = p_order_id;
  if v_paid + 0.001 < v_total then
    raise exception 'Ödeme tamamlanmadan kasaya devredilemez (kalan %)', round(v_total - v_paid, 2);
  end if;

  update orders set status = 'pending_cashier', payment_collected_at = now(), payment_collected_by = p_staff_id, updated_at = now()
  where id = p_order_id;

  if v_table is not null then
    update restaurant_tables set status = 'kasa_bekliyor', updated_at = now() where id = v_table;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_table_ready(p_table_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_status text;
begin
  select status into v_status from restaurant_tables where id = p_table_id;
  if v_status is distinct from 'toplanacak' then
    return;
  end if;
  update restaurant_tables set status = 'empty', updated_at = now() where id = p_table_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.menu_items_stock_status(p_restaurant uuid)
 RETURNS TABLE(menu_item_id uuid, servings_left numeric, is_86d boolean, low_stock boolean)
 LANGUAGE sql
 STABLE
AS $function$
  with stock_now as (
    select sm.ingredient_id, sum(sm.quantity) as qty
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
    group by sm.ingredient_id
  ),
  per_item as (
    select ri.menu_item_id,
           min(floor(coalesce(sn.qty, 0) / nullif(ri.quantity, 0))) as servings_left
    from recipe_items ri
    left join stock_now sn on sn.ingredient_id = ri.ingredient_id
    where ri.restaurant_id = p_restaurant
    group by ri.menu_item_id
  )
  select mi.id,
         p.servings_left,
         coalesce(p.servings_left <= 0, false),
         coalesce(p.servings_left > 0 and p.servings_left <= 3, false)
  from menu_items mi
  left join per_item p on p.menu_item_id = mi.id
  where mi.restaurant_id = p_restaurant and mi.deleted_at is null;
$function$
;

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

CREATE OR REPLACE FUNCTION public.open_table_order(p_restaurant_id uuid, p_table_id uuid, p_party_size integer, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_order_id uuid;
  v_status text;
begin
  select status into v_status from restaurant_tables where id = p_table_id and restaurant_id = p_restaurant_id and deleted_at is null;
  if v_status is null then
    raise exception 'Masa bulunamadı';
  end if;
  if v_status not in ('empty', 'reserved') then
    raise exception 'Masa müsait değil (durum: %)', v_status;
  end if;
  if exists (select 1 from orders where table_id = p_table_id and status = 'open') then
    raise exception 'Bu masada zaten açık bir sipariş var';
  end if;

  insert into orders (restaurant_id, table_id, status, channel, party_size)
  values (p_restaurant_id, p_table_id, 'open', 'dine_in', greatest(1, p_party_size))
  returning id into v_order_id;

  update restaurant_tables set status = 'occupied', reservation_note = null, updated_at = now() where id = p_table_id;

  return v_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operational_alerts_live(p_restaurant uuid)
 RETURNS TABLE(alert_type text, subject text, since timestamp with time zone, minutes_late numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select 'siparis_alinmadi' as alert_type, rt.name as subject, o.opened_at as since, round(extract(epoch from (now() - o.opened_at)) / 60.0, 1) as minutes_late
  from orders o
  join restaurant_tables rt on rt.id = o.table_id
  where o.restaurant_id = p_restaurant and o.status = 'open'
    and o.opened_at < now() - interval '5 minutes'
    and not exists (select 1 from order_items oi where oi.order_id = o.id and oi.sent_at is not null)

  union all
  select 'hazir_bekliyor', coalesce(rt.name, 'Ayrık hesap') || ' — ' || mi.name, oi.ready_at,
         round(extract(epoch from (now() - oi.ready_at)) / 60.0, 1)
  from order_items oi
  join orders o on o.id = oi.order_id
  left join restaurant_tables rt on rt.id = o.table_id
  join menu_items mi on mi.id = oi.menu_item_id
  where oi.restaurant_id = p_restaurant and o.status = 'open'
    and oi.ready_at is not null and oi.served_at is null
    and oi.ready_at < now() - interval '5 minutes'

  union all
  select 'hesap_bekliyor', rt.name,
         coalesce((select max(tse.changed_at) from table_status_events tse where tse.table_id = rt.id and tse.to_status = 'bill_requested'), rt.updated_at),
         round(extract(epoch from (now() - coalesce((select max(tse.changed_at) from table_status_events tse where tse.table_id = rt.id and tse.to_status = 'bill_requested'), rt.updated_at))) / 60.0, 1)
  from restaurant_tables rt
  where rt.restaurant_id = p_restaurant and rt.status = 'bill_requested' and rt.deleted_at is null
    and coalesce((select max(tse.changed_at) from table_status_events tse where tse.table_id = rt.id and tse.to_status = 'bill_requested'), rt.updated_at) < now() - interval '5 minutes'

  union all
  select 'kalem_suresi_asti', coalesce(rt.name, 'Ayrık hesap') || ' — ' || mi.name, oi.sent_at,
         round(extract(epoch from (now() - oi.sent_at)) / 60.0, 1)
  from order_items oi
  join orders o on o.id = oi.order_id
  left join restaurant_tables rt on rt.id = o.table_id
  join menu_items mi on mi.id = oi.menu_item_id
  where oi.restaurant_id = p_restaurant and o.status = 'open'
    and oi.status in ('active', 'ikram', 'personel')
    and oi.sent_at is not null and oi.ready_at is null
    and oi.sent_at < now() - (coalesce(mi.prep_minutes, 10) || ' minutes')::interval

  union all
  select 'masa_toplanmadi', rt.name, rt.became_toplanacak_at,
         round(extract(epoch from (now() - rt.became_toplanacak_at)) / 60.0, 1)
  from restaurant_tables rt
  where rt.restaurant_id = p_restaurant and rt.status = 'toplanacak' and rt.deleted_at is null
    and rt.became_toplanacak_at < now() - interval '15 minutes'

  union all
  select 'kasa_onayi_gecikti', coalesce(rt.name, 'Ayrık hesap'), o.payment_collected_at,
         round(extract(epoch from (now() - o.payment_collected_at)) / 60.0, 1)
  from orders o
  left join restaurant_tables rt on rt.id = o.table_id
  where o.restaurant_id = p_restaurant and o.status = 'pending_cashier'
    and o.payment_collected_at < now() - interval '10 minutes'

  union all
  -- 7) Başlangıç (course 1) teslim edildi, sonraki servis (course_no>=2) hâlâ garson
  -- tarafından serbest bırakılmadı (15 dk üstü) — servis sırası açık restoranlarda garson unutmuş olabilir.
  select 'baslangic_bekletiliyor', coalesce(rt.name, 'Ayrık hesap'), course1_done.done_at,
         round(extract(epoch from (now() - course1_done.done_at)) / 60.0, 1)
  from orders o
  left join restaurant_tables rt on rt.id = o.table_id
  join lateral (
    select max(oi1.served_at) as done_at
    from order_items oi1
    where oi1.order_id = o.id and oi1.course_no = 1
    having count(*) > 0 and count(*) filter (where oi1.served_at is null) = 0
  ) course1_done on true
  where o.restaurant_id = p_restaurant and o.status = 'open'
    and course1_done.done_at < now() - interval '15 minutes'
    and exists (
      select 1 from order_items oi2
      where oi2.order_id = o.id and oi2.course_no >= 2 and oi2.status = 'active' and oi2.sent_at is null
    )

  union all
  -- 8) Garson molada, üzerine atanmış dolu masalar var — "herkese açık" sayılsa da şefin
  -- haberi olsun (ROADMAP §O3/§O9). Masa başına değil garson başına tek satır: kaç masa bekliyor.
  select 'garson_molada_masa_var', sm.full_name || ' — ' || count(*) || ' masa', sm.break_started_at,
         round(extract(epoch from (now() - sm.break_started_at)) / 60.0, 1)
  from restaurant_tables rt
  join staff_members sm on sm.id = rt.assigned_staff_id
  where rt.restaurant_id = p_restaurant and rt.deleted_at is null
    and rt.status = 'occupied' and sm.on_break = true
    and sm.break_started_at < now() - interval '10 minutes'
  group by sm.id, sm.full_name, sm.break_started_at

  order by minutes_late desc;
$function$
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

CREATE OR REPLACE FUNCTION public.pending_cashier_orders(p_restaurant uuid)
 RETURNS TABLE(order_id uuid, table_id uuid, table_name text, total_amount numeric, payment_collected_at timestamp with time zone, staff_id uuid, staff_name text, minutes_waiting numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select o.id,
         o.table_id,
         coalesce(rt.name, 'Ayrık hesap'),
         greatest(0,
           coalesce((select sum(oi.quantity * oi.unit_price) from order_items oi where oi.order_id = o.id and oi.status = 'active'), 0)
           - coalesce((select sum(d.amount) from order_discounts d where d.order_id = o.id), 0)
         ),
         o.payment_collected_at,
         o.payment_collected_by,
         coalesce(sm.full_name, 'Bilinmiyor'),
         round(extract(epoch from (now() - o.payment_collected_at)) / 60.0, 1)
  from orders o
  left join restaurant_tables rt on rt.id = o.table_id
  left join staff_members sm on sm.id = o.payment_collected_by
  where o.restaurant_id = p_restaurant and o.status = 'pending_cashier'
  order by o.payment_collected_at;
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

CREATE OR REPLACE FUNCTION public.qr_menu(p_slug text, p_masa uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (
    select id, name from public.restaurants where slug = p_slug and deleted_at is null limit 1
  )
  select jsonb_build_object(
    'restaurant', jsonb_build_object('id', r.id, 'name', r.name),
    'settings', (
      select jsonb_build_object('default_menu_design', s.default_menu_design, 'kvkk_notice', s.kvkk_notice)
        from public.restaurant_settings s where s.restaurant_id = r.id
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'parent_id', c.parent_id)
                       order by c.sort_order, c.name)
        from public.menu_categories c
       where c.restaurant_id = r.id and c.deleted_at is null
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.name, 'sale_price', m.sale_price, 'vat_rate', m.vat_rate,
               'category_id', m.category_id, 'calorie_override', m.calorie_override,
               'description', m.description, 'image_url', m.image_url,
               'ingredients_text', m.ingredients_text, 'allergens_override', m.allergens_override,
               'recipe_items', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'quantity', ri.quantity,
                          'ingredients', case when ing.id is null then null else jsonb_build_object(
                            'name', ing.name, 'kcal_per_unit', ing.kcal_per_unit,
                            'diet_class', ing.diet_class, 'allergens', ing.allergens) end))
                   from public.recipe_items ri
                   left join public.ingredients ing on ing.id = ri.ingredient_id and ing.deleted_at is null
                  where ri.menu_item_id = m.id
               ), '[]'::jsonb))
             order by m.sort_order, m.name)
        from public.menu_items m
       where m.restaurant_id = r.id and m.is_active and m.available_dine_in and m.deleted_at is null
    ), '[]'::jsonb),
    'stock', coalesce((
      select jsonb_agg(jsonb_build_object('menu_item_id', s.menu_item_id, 'servings_left', s.servings_left,
                                          'is_86d', s.is_86d, 'low_stock', s.low_stock))
        from public.menu_items_stock_status(r.id) s
    ), '[]'::jsonb),
    'table', (
      select jsonb_build_object('id', t.id, 'name', t.name)
        from public.restaurant_tables t
       where t.id = p_masa and t.restaurant_id = r.id and t.deleted_at is null
    )
  )
  from r;
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
