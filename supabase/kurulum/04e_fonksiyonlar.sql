-- RZV veritabani yapisi — 4/6: FONKSIYONLAR (5/6)
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.release_order_course(p_order_id uuid, p_course_no integer, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update order_items
  set sent_at = now(),
      course_released_at = now(),
      sent_by_staff_id = coalesce(p_staff_id, sent_by_staff_id)
  where order_id = p_order_id
    and course_no = p_course_no
    and status = 'active'
    and sent_at is null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sales_forecast(p_restaurant uuid, p_days_ahead integer DEFAULT 7)
 RETURNS TABLE(forecast_date date, weekday integer, predicted_covers numeric, predicted_revenue numeric, sample_count integer, confidence text, holiday_name text, holiday_kind text, basis text)
 LANGUAGE sql
 STABLE
AS $function$
  with gunluk as (
    select (o.closed_at at time zone 'Europe/Istanbul')::date as gun,
           extract(isodow from (o.closed_at at time zone 'Europe/Istanbul'))::int as hg,
           sum(o.total_amount) as ciro,
           sum(coalesce(o.party_size, 0)) as kisi
    from orders o
    where o.restaurant_id = p_restaurant
      and o.status = 'closed'
      and o.closed_at >= (current_date - 730)
    group by 1, 2
  ),
  gunluk_tatil as (
    select g.*, h.kind as tatil_turu
    from gunluk g
    left join public_holidays h on h.holiday_date = g.gun
  ),
  hafta_gunu as (
    select hg,
           sum(ciro * w) / nullif(sum(w), 0) as ciro,
           sum(kisi * w) / nullif(sum(w), 0) as kisi,
           count(*)::int as ornek,
           coalesce(stddev_pop(ciro), 0) as sapma,
           nullif(avg(ciro), 0) as ort
    from (
      select hg, ciro, kisi, case when gun >= current_date - 28 then 2 else 1 end as w
      from gunluk_tatil
      where tatil_turu is null and gun >= current_date - 56
    ) x
    group by hg
  ),
  tatil_turu_ort as (
    select tatil_turu,
           avg(ciro) as ciro,
           avg(kisi) as kisi,
           count(*)::int as ornek,
           coalesce(stddev_pop(ciro), 0) as sapma,
           nullif(avg(ciro), 0) as ort
    from gunluk_tatil
    where tatil_turu is not null
    group by tatil_turu
  ),
  gelecek as (
    select (current_date + s)::date as d
    from generate_series(1, greatest(1, least(60, p_days_ahead))) as s
  ),
  birlesik as (
    select g.d,
           extract(isodow from g.d)::int as hg,
           h.name as tatil_adi,
           h.kind as tatil_turu,
           t.ciro as t_ciro, t.kisi as t_kisi, t.ornek as t_ornek, t.sapma as t_sapma, t.ort as t_ort,
           w.ciro as w_ciro, w.kisi as w_kisi, w.ornek as w_ornek, w.sapma as w_sapma, w.ort as w_ort
    from gelecek g
    left join public_holidays h on h.holiday_date = g.d
    left join tatil_turu_ort t on t.tatil_turu = h.kind
    left join hafta_gunu w on w.hg = extract(isodow from g.d)::int
  )
  select b.d,
         b.hg,
         round(coalesce(case when b.tatil_turu is not null and b.t_ornek > 0 then b.t_kisi else b.w_kisi end, 0), 1),
         round(coalesce(case when b.tatil_turu is not null and b.t_ornek > 0 then b.t_ciro else b.w_ciro end, 0), 2),
         coalesce(case when b.tatil_turu is not null and b.t_ornek > 0 then b.t_ornek else b.w_ornek end, 0),
         case
           when b.tatil_turu is not null and coalesce(b.t_ornek, 0) = 0 then 'dusuk'
           when b.tatil_turu is not null and b.t_ornek < 2 then 'dusuk'
           when b.tatil_turu is not null and b.t_sapma / b.t_ort > 0.35 then 'orta'
           when b.tatil_turu is not null then 'orta'
           when coalesce(b.w_ornek, 0) < 2 then 'dusuk'
           when b.w_ort is null then 'dusuk'
           when b.w_sapma / b.w_ort > 0.35 then 'orta'
           when coalesce(b.w_ornek, 0) >= 4 then 'yuksek'
           else 'orta'
         end,
         b.tatil_adi,
         b.tatil_turu,
         case
           when b.tatil_turu is not null and coalesce(b.t_ornek, 0) > 0 then 'benzer_tatil'
           when b.tatil_turu is not null then 'tatil_veri_yok'
           else 'hafta_gunu'
         end
  from birlesik b
  order by b.d;
$function$
;

CREATE OR REPLACE FUNCTION public.sarf_usage_radar(p_restaurant uuid)
 RETURNS TABLE(ingredient_id uuid, ingredient_name text, unit text, baseline_ratio numeric, recent_ratio numeric, deviation_percent numeric, status text)
 LANGUAGE sql
 STABLE
AS $function$
  with cust as (
    select
      coalesce(sum(o.party_size) filter (where o.opened_at <  now() - interval '30 days'), 0) as base_cust,
      coalesce(sum(o.party_size) filter (where o.opened_at >= now() - interval '30 days'), 0) as recent_cust
    from orders o
    where o.restaurant_id = p_restaurant
  ),
  buys as (
    select pi.ingredient_id,
      coalesce(sum(pi.quantity) filter (where p.purchased_at <  now() - interval '30 days'), 0) as base_qty,
      count(distinct p.id) filter (where p.purchased_at <  now() - interval '30 days')          as base_purchases,
      coalesce(sum(pi.quantity) filter (where p.purchased_at >= now() - interval '30 days'), 0) as recent_qty
    from purchase_items pi
    join purchases p on p.id = pi.purchase_id and p.deleted_at is null
    where pi.restaurant_id = p_restaurant
    group by pi.ingredient_id
  ),
  calc as (
    select i.id, i.name, i.unit,
      case when c.base_cust   > 0 then b.base_qty   / c.base_cust   end as baseline_ratio,
      case when c.recent_cust > 0 then b.recent_qty / c.recent_cust end as recent_ratio,
      b.base_purchases, c.base_cust, c.recent_cust
    from ingredients i
    join buys b on b.ingredient_id = i.id
    cross join cust c
    where i.restaurant_id = p_restaurant and i.deleted_at is null and i.category = 'sarf'
  )
  select id, name, unit,
    round(baseline_ratio, 3),
    round(recent_ratio, 3),
    case when baseline_ratio > 0 and recent_ratio is not null
         then round((recent_ratio / baseline_ratio - 1) * 100, 1) end,
    case
      when base_cust < 100 or base_purchases < 2 or coalesce(baseline_ratio, 0) = 0 then 'ogreniyor'
      when recent_cust >= 30 and recent_ratio > baseline_ratio * 1.30 then 'sapma'
      else 'normal'
    end
  from calc
  order by name;
$function$
;

CREATE OR REPLACE FUNCTION public.seat_reservation(p_reservation_id uuid, p_table_id uuid, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_rest uuid;
  v_guest_name text;
  v_masa_id uuid;
  v_not text;
begin
  select restaurant_id, guest_name into v_rest, v_guest_name
  from reservations where id = p_reservation_id and status in ('bekleniyor', 'geldi');
  if not found then
    raise exception 'Rezervasyon bulunamadı ya da zaten oturmuş/iptal edilmiş';
  end if;

  if exists (
    select 1 from reservations
    where table_id = p_table_id and status = 'oturdu' and id <> p_reservation_id
  ) then
    raise exception 'Bu masada zaten oturan bir misafir var';
  end if;

  insert into reservation_tables (reservation_id, table_id)
  values (p_reservation_id, p_table_id)
  on conflict (reservation_id, table_id) do nothing;

  update reservations
  set status = 'oturdu', seated_at = now(), left_at = null, table_id = p_table_id,
      oturtan = coalesce(auth.uid(), oturtan)   -- kim oturttu (Gökhan, 2026-08-20)
  where id = p_reservation_id;

  -- Masanın üzerinde görünecek yazı: saat · isim · kişi (rezervedeki biçimin aynısı).
  select to_char(reserved_at at time zone 'Europe/Istanbul', 'HH24:MI') || ' · ' || guest_name
         || ' · ' || coalesce(gelen_kisi, party_size)::text || ' kişi'
  into v_not
  from reservations where id = p_reservation_id;

  for v_masa_id in select table_id from reservation_tables where reservation_id = p_reservation_id loop
    update restaurant_tables
    set status = 'occupied', reservation_note = v_not, updated_at = now()
    where id = v_masa_id;
  end loop;

  update valet_entries
  set matched_table_id = p_table_id
  where id = (
    select id from valet_entries
    where restaurant_id = v_rest and status = 'bekliyor' and matched_table_id is null
      and lower(trim(guest_name)) = lower(trim(v_guest_name))
    order by parked_at desc
    limit 1
  );

  return p_reservation_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.service_speed_today(p_restaurant uuid)
 RETURNS TABLE(avg_prep_minutes numeric, avg_service_minutes numeric, items_measured integer)
 LANGUAGE sql
 STABLE
AS $function$
  select
    round(avg(extract(epoch from (oi.ready_at - oi.sent_at)) / 60)::numeric, 1) as avg_prep_minutes,
    round(avg(extract(epoch from (oi.served_at - oi.ready_at)) / 60)::numeric, 1) as avg_service_minutes,
    count(*)::int as items_measured
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.restaurant_id = p_restaurant
    and oi.status in ('active', 'ikram')
    and oi.sent_at is not null and oi.ready_at is not null and oi.served_at is not null
    and (oi.served_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;
$function$
;

CREATE OR REPLACE FUNCTION public.set_reservation_status(p_reservation_id uuid, p_status text, p_cancel_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_masa_id uuid;
begin
  update reservations
  set status = p_status,
      arrived_at = case when p_status = 'geldi' then now() else arrived_at end,
      left_at    = case when p_status = 'tamamlandi' then now() else left_at end,
      cancel_reason = case when p_status = 'iptal' then nullif(trim(coalesce(p_cancel_reason, '')), '') else cancel_reason end,
      cancelled_at = case when p_status = 'iptal' then now() else cancelled_at end,
      -- KİM YAPTI izleri (Gökhan, 2026-08-20).
      geldi_yazan = case when p_status = 'geldi' then coalesce(auth.uid(), geldi_yazan) else geldi_yazan end,
      iptal_eden  = case when p_status in ('iptal','gelmedi') then coalesce(auth.uid(), iptal_eden) else iptal_eden end
  where id = p_reservation_id;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if p_status in ('iptal', 'gelmedi', 'tamamlandi') then
    for v_masa_id in select table_id from reservation_tables where reservation_id = p_reservation_id loop
      update restaurant_tables
      set status = 'empty', reservation_note = null, updated_at = now()
      where id = v_masa_id and status in ('reserved', 'occupied');
    end loop;
  end if;

  -- Masaya hiç oturulmadı: bağ tamamen kalkıyor, masa gerçekten serbest.
  if p_status in ('iptal', 'gelmedi') then
    delete from reservation_tables where reservation_id = p_reservation_id;
    update reservations set table_id = null where id = p_reservation_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_staff_pin(p_staff_id uuid, p_new_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_restoran uuid;
begin
  select restaurant_id into v_restoran from staff_members where id = p_staff_id;
  if v_restoran is null then
    raise exception 'Personel bulunamadı';
  end if;
  if not (public.yonetici_mi() or v_restoran in (select public.erisilen_restoranlar())) then
    raise exception 'Bu personelin şifresini değiştirme yetkiniz yok';
  end if;
  update staff_members set pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = p_staff_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.settlement_status(p_restaurant uuid, p_day date DEFAULT NULL::date)
 RETURNS TABLE(provider_id uuid, provider_name text, method text, commission_rate numeric, settlement_days integer, day_gross numeric, day_net numeric, day_due_date date, expected_net_total numeric, received_total numeric, outstanding numeric, overdue numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with defaults as (
    select method, id
    from payment_providers
    where restaurant_id = p_restaurant and is_default and deleted_at is null
  ),
  pay as (
    select coalesce(op.provider_id, d.id) as pid,
           (op.paid_at at time zone 'Europe/Istanbul')::date as sale_date,
           op.amount
    from order_payments op
    left join defaults d on d.method = op.method
    where op.restaurant_id = p_restaurant
      and op.method in ('kart', 'yemek_karti')
  ),
  pay_p as (
    select p.pid, p.sale_date, p.amount, pp.commission_rate, pp.settlement_days
    from pay p
    join payment_providers pp on pp.id = p.pid and pp.deleted_at is null
  ),
  agg as (
    select pid,
           sum(amount * (1 - commission_rate / 100.0)) as expected_net_total,
           sum(amount * (1 - commission_rate / 100.0))
             filter (where sale_date + settlement_days <= current_date) as overdue_net,
           sum(amount) filter (where sale_date = p_day) as day_gross,
           sum(amount * (1 - commission_rate / 100.0)) filter (where sale_date = p_day) as day_net
    from pay_p
    group by pid
  ),
  rec as (
    select sr.provider_id, sum(sr.amount) as received_total
    from settlement_receipts sr
    where sr.restaurant_id = p_restaurant
    group by sr.provider_id
  )
  select pp.id,
         pp.name,
         pp.method,
         pp.commission_rate,
         pp.settlement_days,
         round(coalesce(a.day_gross, 0), 2),
         round(coalesce(a.day_net, 0), 2),
         (p_day + pp.settlement_days)::date,
         round(coalesce(a.expected_net_total, 0), 2),
         round(coalesce(r.received_total, 0), 2),
         round(coalesce(a.expected_net_total, 0) - coalesce(r.received_total, 0), 2),
         round(greatest(0, coalesce(a.overdue_net, 0) - coalesce(r.received_total, 0)), 2)
  from payment_providers pp
  left join agg a on a.pid = pp.id
  left join rec r on r.provider_id = pp.id
  where pp.restaurant_id = p_restaurant and pp.deleted_at is null and pp.is_active
  order by pp.method, pp.sort_order, pp.name;
$function$
;

CREATE OR REPLACE FUNCTION public.split_order(p_order_id uuid, p_item_ids uuid[], p_new_table_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source orders%rowtype;
  v_new_order_id uuid;
  v_moved int;
begin
  select * into v_source from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  if not (public.yonetici_mi() or v_source.restaurant_id in (select public.erisilen_restoranlar())) then
    raise exception 'Bu siparişe erişim yetkiniz yok';
  end if;

  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    raise exception 'Ayrılacak kalem seçilmedi';
  end if;

  if p_new_table_id is not null
     and exists (select 1 from orders where table_id = p_new_table_id and status = 'open') then
    raise exception 'Hedef masada zaten açık bir sipariş var';
  end if;

  insert into orders (restaurant_id, table_id, status, channel, party_size,
                      split_from_order_id, split_from_table_id)
  values (v_source.restaurant_id, p_new_table_id, 'open', v_source.channel, 1,
          v_source.id, v_source.table_id)
  returning id into v_new_order_id;

  update order_items
  set order_id = v_new_order_id,
      original_table_id = coalesce(original_table_id, v_source.table_id)
  where order_id = p_order_id and id = any(p_item_ids);

  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    delete from orders where id = v_new_order_id;
    raise exception 'Seçilen kalemler bu siparişte bulunamadı';
  end if;

  update order_discounts
  set order_id = v_new_order_id
  where order_id = p_order_id and order_item_id = any(p_item_ids);

  if p_new_table_id is not null then
    update restaurant_tables set status = 'occupied', updated_at = now() where id = p_new_table_id;
  end if;

  return v_new_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_daily_summary(p_restaurant_id uuid, p_staff_id uuid)
 RETURNS TABLE(full_name text, role text, own_sales numeric, own_orders_served bigint, own_items_prepared bigint, comparison_enabled boolean, sales_percent numeric)
 LANGUAGE plpgsql
AS $function$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_role text;
  v_name text;
  v_sales numeric := 0;
  v_orders bigint := 0;
  v_items bigint := 0;
  v_total_role_sales numeric := 0;
  v_enabled boolean := false;
begin
  select s.full_name, s.role into v_name, v_role from staff_members s where s.id = p_staff_id;

  select r.staff_comparison_enabled into v_enabled from restaurant_settings r where r.restaurant_id = p_restaurant_id;
  v_enabled := coalesce(v_enabled, false);

  select coalesce(sum(o.total_amount), 0), count(*) into v_sales, v_orders
  from orders o
  where o.restaurant_id = p_restaurant_id and o.closed_by_staff_id = p_staff_id
    and o.status = 'closed' and o.closed_at >= v_day_start;

  select count(*) into v_items
  from order_items oi
  where oi.prepared_by_staff_id = p_staff_id and oi.created_at >= v_day_start;

  if v_enabled and v_role = 'garson' then
    select coalesce(sum(o.total_amount), 0) into v_total_role_sales
    from orders o
    join staff_members sm on sm.id = o.closed_by_staff_id
    where o.restaurant_id = p_restaurant_id and o.status = 'closed' and o.closed_at >= v_day_start
      and sm.role = 'garson';
  end if;

  return query select
    v_name, v_role, v_sales, v_orders, v_items, v_enabled,
    case when v_enabled and v_role = 'garson' and v_total_role_sales > 0
      then round(v_sales / v_total_role_sales * 100, 1)
      else null end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_meal_cost(p_restaurant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(staff_id uuid, full_name text, adet bigint, menu_tutari numeric, maliyet numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with kalem as (
    select oi.staff_meal_for_id as sid,
           oi.quantity,
           oi.quantity * oi.unit_price as menu_tutar,
           oi.quantity * coalesce((
             select sum(ri.quantity * i.current_unit_cost)
             from recipe_items ri
             join ingredients i on i.id = ri.ingredient_id
             where ri.menu_item_id = oi.menu_item_id
           ), 0) as maliyet
    from order_items oi
    where oi.restaurant_id = p_restaurant
      and oi.status = 'personel'
      and coalesce(oi.ready_at, oi.sent_at, oi.created_at) >= p_from
      and coalesce(oi.ready_at, oi.sent_at, oi.created_at) < p_to
  )
  select k.sid,
         coalesce(sm.full_name, 'Kime gittiği girilmemiş'),
         sum(k.quantity)::bigint,
         round(sum(k.menu_tutar), 2),
         round(sum(k.maliyet), 2)
  from kalem k
  left join staff_members sm on sm.id = k.sid
  group by k.sid, sm.full_name
  order by 5 desc;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_shift_cost(p_restaurant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(staff_id uuid, full_name text, role text, toplam_saat numeric, maliyet numeric, yontem text)
 LANGUAGE sql
 STABLE
AS $function$
  with sure as (
    select
      sh.staff_id as sid,
      sum(
        greatest(
          0,
          extract(epoch from (
            least(coalesce(sh.ended_at, now()), p_to) - greatest(sh.started_at, p_from)
          ))
        )::numeric
      ) / 3600.0 as saat
    from staff_shifts sh
    where sh.restaurant_id = p_restaurant_id
      and sh.started_at < p_to
      and coalesce(sh.ended_at, now()) > p_from
    group by sh.staff_id
  )
  select
    sm.id,
    sm.full_name,
    sm.role,
    round(sure.saat, 2) as toplam_saat,
    round(
      case
        when coalesce(sm.hourly_rate, 0) > 0 then sure.saat * sm.hourly_rate
        else sure.saat * (coalesce(sm.gross_salary, 0) / 30.0 / 8.0)
      end
    , 2) as maliyet,
    case when coalesce(sm.hourly_rate, 0) > 0 then 'saatlik' else 'maastan_tahmin' end as yontem
  from sure
  join staff_members sm on sm.id = sure.sid
  order by sm.full_name;
$function$
;
