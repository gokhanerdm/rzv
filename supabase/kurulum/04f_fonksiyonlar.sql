-- RZV veritabani yapisi — 4/6: FONKSIYONLAR (6/6)
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.staffing_plan(p_restaurant uuid, p_days_ahead integer DEFAULT 7)
 RETURNS TABLE(forecast_date date, weekday integer, predicted_covers numeric, predicted_revenue numeric, covers_per_staff_hour numeric, suggested_staff_hours numeric, suggested_staff_count numeric, estimated_labor_cost numeric, labor_percent numeric, target_labor_percent numeric, confidence text, holiday_name text, basis text)
 LANGUAGE sql
 STABLE
AS $function$
  with saatler as (
    select sum(extract(epoch from (coalesce(sh.ended_at, now()) - sh.started_at))::numeric) / 3600.0 as saat,
           sum(
             (extract(epoch from (coalesce(sh.ended_at, now()) - sh.started_at))::numeric / 3600.0) *
             case when coalesce(sm.hourly_rate, 0) > 0
                  then sm.hourly_rate
                  else coalesce(sm.gross_salary, 0) / 30.0 / 8.0 end
           ) as maliyet
    from staff_shifts sh
    join staff_members sm on sm.id = sh.staff_id
    where sh.restaurant_id = p_restaurant
      and sh.started_at >= (current_date - 56)
  ),
  misafir as (
    select sum(coalesce(o.party_size, 0))::numeric as kisi
    from orders o
    where o.restaurant_id = p_restaurant
      and o.status = 'closed'
      and o.closed_at >= (current_date - 56)
  ),
  oran as (
    select case when coalesce((select saat from saatler), 0) > 0
                then (select kisi from misafir) / (select saat from saatler)
                else null end as kisi_basi_saat,
           case when coalesce((select saat from saatler), 0) > 0
                then (select maliyet from saatler) / (select saat from saatler)
                else null end as saat_maliyeti
  ),
  hedef as (
    select coalesce(target_labor_percent, 30) as yuzde
    from restaurant_settings where restaurant_id = p_restaurant
  )
  select f.forecast_date,
         f.weekday,
         f.predicted_covers,
         f.predicted_revenue,
         round(o.kisi_basi_saat, 2),
         round(case when o.kisi_basi_saat > 0 then f.predicted_covers / o.kisi_basi_saat else null end, 1),
         round(case when o.kisi_basi_saat > 0 then f.predicted_covers / o.kisi_basi_saat / 8.0 else null end, 1),
         round(case when o.kisi_basi_saat > 0 then (f.predicted_covers / o.kisi_basi_saat) * o.saat_maliyeti else null end, 2),
         round(case when o.kisi_basi_saat > 0 and f.predicted_revenue > 0
                    then ((f.predicted_covers / o.kisi_basi_saat) * o.saat_maliyeti) / f.predicted_revenue * 100
                    else null end, 1),
         coalesce((select yuzde from hedef), 30),
         f.confidence,
         f.holiday_name,
         f.basis
  from sales_forecast(p_restaurant, p_days_ahead) f
  cross join oran o
  order by f.forecast_date;
$function$
;

CREATE OR REPLACE FUNCTION public.suggested_purchase_list(p_restaurant uuid)
 RETURNS TABLE(ingredient_id uuid, ingredient_name text, unit text, current_stock numeric, par_level numeric, avg_daily_usage numeric, days_until_delivery integer, suggested_qty numeric, supplier_id uuid, supplier_name text, current_unit_cost numeric, estimated_cost numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with today as (
    select extract(isodow from now() at time zone 'Europe/Istanbul')::int as dow
  ),
  stock_now as (
    select sm.ingredient_id, sum(sm.quantity) as qty
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
    group by sm.ingredient_id
  ),
  usage_28d as (
    select sm.ingredient_id, sum(-sm.quantity) / 28.0 as avg_daily
    from stock_movements sm
    where sm.restaurant_id = p_restaurant
      and sm.movement_type in ('consumption', 'waste')
      and sm.occurred_at >= now() - interval '28 days'
    group by sm.ingredient_id
  ),
  islemde as (
    select ingredient_id from purchase_requests
    where restaurant_id = p_restaurant
      and (status in ('bekliyor', 'onaylandi', 'siparis_verildi')
        or (status = 'reddedildi' and created_at >= now() - interval '2 days'))
  )
  select
    i.id, i.name, i.unit,
    coalesce(sn.qty, 0) as current_stock,
    i.par_level,
    coalesce(u.avg_daily, 0) as avg_daily_usage,
    coalesce((
      select min(case when d > t.dow then d - t.dow else d - t.dow + 7 end)
      from unnest(s.delivery_days) as d, today t
    ), 7) as days_until_delivery,
    greatest(0, round(
      coalesce(u.avg_daily, 0)
      * coalesce((
          select min(case when d > t.dow then d - t.dow else d - t.dow + 7 end)
          from unnest(s.delivery_days) as d, today t
        ), 7)
      * 1.10
      - coalesce(sn.qty, 0)
    , 2)) as suggested_qty,
    i.supplier_id, s.name,
    i.current_unit_cost,
    round(greatest(0,
      coalesce(u.avg_daily, 0)
      * coalesce((
          select min(case when d > t.dow then d - t.dow else d - t.dow + 7 end)
          from unnest(s.delivery_days) as d, today t
        ), 7)
      * 1.10
      - coalesce(sn.qty, 0)
    ) * i.current_unit_cost, 2) as estimated_cost
  from ingredients i
  join suppliers s on s.id = i.supplier_id and s.deleted_at is null
  left join stock_now sn on sn.ingredient_id = i.id
  left join usage_28d u on u.ingredient_id = i.id
  where i.restaurant_id = p_restaurant and i.deleted_at is null
    and i.par_level > 0
    and coalesce(sn.qty, 0) <= i.par_level
    and i.id not in (select ingredient_id from islemde)
  order by (coalesce(sn.qty, 0) / nullif(i.par_level, 0)) asc;
$function$
;

CREATE OR REPLACE FUNCTION public.test_rolumu_degistir(p_rol text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'GIRIS_GEREKLI';
  end if;
  if p_rol not in ('garson', 'salon_sefi', 'mutfak', 'karsilama', 'pr', 'yonetici') then
    raise exception 'ROL_YANLIS';
  end if;

  select id into v_id
    from public.personel_hesaplari
   where user_id = auth.uid() and durum = 'onayli' and rol = p_rol
   order by created_at
   limit 1;

  if v_id is not null then
    update public.personel_hesaplari
       set test_aktif = (id = v_id)
     where user_id = auth.uid() and durum = 'onayli';
  else
    update public.personel_hesaplari
       set rol = p_rol
     where user_id = auth.uid() and durum = 'onayli'
       and (test_aktif or not exists (
         select 1 from public.personel_hesaplari x
          where x.user_id = auth.uid() and x.durum = 'onayli' and x.test_aktif));
    if not found then
      raise exception 'KAYIT_YOK';
    end if;
  end if;

  return p_rol;
end $function$
;

CREATE OR REPLACE FUNCTION public.tip_pool_distribution(p_restaurant uuid, p_day date)
 RETURNS TABLE(staff_id uuid, full_name text, role text, points numeric, hours_worked numeric, point_hours numeric, pool text, share_amount numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_start timestamptz := (p_day::text || ' 00:00:00+03')::timestamptz;
  v_end timestamptz := v_start + interval '1 day';
  v_total_tip numeric;
  v_kitchen_percent numeric;
  v_kitchen_pool numeric;
  v_salon_pool numeric;
  v_points jsonb;
begin
  select coalesce(sum(op.tip_amount), 0) into v_total_tip
  from order_payments op
  where op.restaurant_id = p_restaurant and op.paid_at >= v_start and op.paid_at < v_end;

  select coalesce(kitchen_tip_percent, 0), coalesce(tip_points, '{}'::jsonb)
    into v_kitchen_percent, v_points
  from restaurant_settings where restaurant_id = p_restaurant;

  v_kitchen_pool := round(v_total_tip * coalesce(v_kitchen_percent, 0) / 100.0, 2);
  v_salon_pool := v_total_tip - v_kitchen_pool;

  return query
  with saatler as (
    select sh.staff_id as sid,
           sum(greatest(0, extract(epoch from (
             least(coalesce(sh.ended_at, now()), v_end) - greatest(sh.started_at, v_start)
           ))::numeric)) / 3600.0 as saat
    from staff_shifts sh
    where sh.restaurant_id = p_restaurant
      and sh.started_at < v_end
      and coalesce(sh.ended_at, now()) > v_start
    group by sh.staff_id
  ),
  kisi as (
    select sm.id, sm.full_name, sm.role,
           coalesce((v_points ->> sm.role)::numeric, 0) as puan,
           coalesce(s.saat, 0) as saat,
           case when sm.role = 'mutfak' then 'mutfak' else 'salon' end as havuz
    from staff_members sm
    left join saatler s on s.sid = sm.id
    where sm.restaurant_id = p_restaurant and sm.active and sm.deleted_at is null
      and coalesce(s.saat, 0) > 0
  ),
  puan_saat as (
    select *, puan * saat as ps from kisi
  ),
  havuz_toplam as (
    select havuz, sum(ps) as toplam_ps from puan_saat group by havuz
  )
  select k.id, k.full_name, k.role, k.puan, round(k.saat, 2), round(k.ps, 2), k.havuz,
         round(
           case
             when h.toplam_ps > 0 and k.havuz = 'mutfak' then k.ps / h.toplam_ps * v_kitchen_pool
             when h.toplam_ps > 0 and k.havuz = 'salon' then k.ps / h.toplam_ps * v_salon_pool
             else 0
           end, 2) as share_amount
  from puan_saat k
  join havuz_toplam h on h.havuz = k.havuz
  order by k.havuz, share_amount desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.toggle_staff_break(p_staff_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  v_new boolean;
begin
  update staff_members
  set on_break = not on_break,
      break_started_at = case when not on_break then now() else null end
  where id = p_staff_id
  returning on_break into v_new;
  return v_new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_table_order(p_source_table_id uuid, p_target_table_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_source_order orders%rowtype;
  v_target_order_id uuid;
  v_restaurant_id uuid;
begin
  select * into v_source_order from orders where table_id = p_source_table_id and status = 'open' limit 1;

  if v_source_order.id is null then
    update restaurant_tables set merged_into_table_id = p_target_table_id where id = p_source_table_id;
    return;
  end if;

  v_restaurant_id := v_source_order.restaurant_id;

  select id into v_target_order_id from orders where table_id = p_target_table_id and status = 'open' limit 1;
  if v_target_order_id is null then
    insert into orders (restaurant_id, table_id, status, channel, party_size)
    values (v_restaurant_id, p_target_table_id, 'open', 'dine_in', 0)
    returning id into v_target_order_id;
    update restaurant_tables set status = 'occupied' where id = p_target_table_id;
  end if;

  update order_items
  set order_id = v_target_order_id, original_table_id = coalesce(original_table_id, p_source_table_id)
  where order_id = v_source_order.id;

  update order_discounts set order_id = v_target_order_id where order_id = v_source_order.id;
  update order_payments set order_id = v_target_order_id where order_id = v_source_order.id;

  update orders set party_size = party_size + v_source_order.party_size where id = v_target_order_id;
  update orders set status = 'transferred', closed_at = now() where id = v_source_order.id;

  update restaurant_tables set status = 'empty', merged_into_table_id = null where id = p_source_table_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_log_table_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status is distinct from old.status then
    insert into table_status_events (restaurant_id, table_id, from_status, to_status)
    values (new.restaurant_id, new.id, old.status, new.status);
    if new.status = 'toplanacak' then
      new.became_toplanacak_at := now();
    elsif old.status = 'toplanacak' then
      new.became_toplanacak_at := null;
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_notify_valet_on_bill_requested()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status = 'bill_requested' and old.status is distinct from 'bill_requested' then
    update valet_entries
    set status = 'cagrildi', called_at = now()
    where matched_table_id = new.id and status = 'bekliyor';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_staff_pin(p_restaurant_id uuid, p_pin text)
 RETURNS TABLE(id uuid, full_name text, role text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select s.id, s.full_name, s.role
  from staff_members s
  where s.restaurant_id = p_restaurant_id
    and s.active
    and s.deleted_at is null
    and s.pin_hash = crypt(p_pin, s.pin_hash)
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.weekly_timesheet(p_restaurant uuid, p_week_start date)
 RETURNS TABLE(staff_id uuid, full_name text, role text, work_date date, hours numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select sh.staff_id,
         sm.full_name,
         sm.role,
         (sh.started_at at time zone 'Europe/Istanbul')::date,
         round(sum(extract(epoch from (coalesce(sh.ended_at, now()) - sh.started_at))::numeric) / 3600.0, 2)
  from staff_shifts sh
  join staff_members sm on sm.id = sh.staff_id
  where sh.restaurant_id = p_restaurant
    and (sh.started_at at time zone 'Europe/Istanbul')::date >= p_week_start
    and (sh.started_at at time zone 'Europe/Istanbul')::date < p_week_start + 7
  group by sh.staff_id, sm.full_name, sm.role, (sh.started_at at time zone 'Europe/Istanbul')::date
  order by sm.full_name, 4;
$function$
;

CREATE OR REPLACE FUNCTION public.yonetici_mi()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.platform_yoneticileri y where y.user_id = auth.uid());
$function$
;
