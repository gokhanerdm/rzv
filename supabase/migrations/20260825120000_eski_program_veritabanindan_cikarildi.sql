-- Eski restoran programina (restoran-aios) ait ne varsa veritabanindan cikarildi.
-- Rezervasyon ve ekip disinda hicbir sey kalmadi (Gokhan, 2026-08-25).
--
-- Once iki fonksiyon yamaniyor: erisim izni artik silinecek kullanici tablosuna
-- bakmiyor, oturtma islemi de vale kaydina yazmiyor. Yoksa tablolar dusunce bu
-- ikisi calisma aninda patlardi.

CREATE OR REPLACE FUNCTION public.erisilen_restoranlar()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id from public.restaurants r
   where r.owner_user_id = auth.uid() and r.deleted_at is null
  union
  select h.restaurant_id from public.personel_hesaplari h
   where h.user_id = auth.uid() and h.durum = 'onayli';
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


  return p_reservation_id;
end;
$function$
;

-- Eski programin masa tablosuna asilmis tetikleyicileri.
drop trigger if exists trg_restaurant_tables_status on public.restaurant_tables;
drop trigger if exists trg_valet_notify on public.restaurant_tables;

-- Eski programin fonksiyonlari (43 adet). Ayni adin birden fazla imzasi olabilir,
-- o yuzden katalogdan taranarak dusuruluyor.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as imza
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'add_purchase_invoice',
       'add_stock_purchase',
       'add_valet_entry',
       'apply_concept_template',
       'approve_purchase_request',
       'bootstrap_restaurant_account',
       'category_daily_ingredient_needs',
       'close_order',
       'confirm_cashier_payment',
       'daily_prep_report',
       'daily_summary',
       'get_or_create_staff_meal_order',
       'ingredient_expected_usage',
       'labor_compliance',
       'mark_item_ready',
       'mark_item_served',
       'mark_order_payment_collected',
       'mark_table_ready',
       'menu_items_stock_status',
       'open_table_order',
       'operational_alerts_live',
       'pending_cashier_orders',
       'qr_menu',
       'release_order_course',
       'sales_forecast',
       'sarf_usage_radar',
       'service_speed_today',
       'set_staff_pin',
       'settlement_status',
       'split_order',
       'staff_daily_summary',
       'staff_meal_cost',
       'staff_shift_cost',
       'staffing_plan',
       'suggested_purchase_list',
       'test_rolumu_degistir',
       'tip_pool_distribution',
       'toggle_staff_break',
       'transfer_table_order',
       'trg_log_table_status_change',
       'trg_notify_valet_on_bill_requested',
       'verify_staff_pin',
       'weekly_timesheet'
     )
  loop
    execute 'drop function if exists ' || f.imza || ' cascade';
  end loop;
end $$;

-- Eski programin tablolari (40 adet).
drop table if exists public.business_expenses cascade;
drop table if exists public.cash_movements cascade;
drop table if exists public.concept_categories cascade;
drop table if exists public.concept_ingredients cascade;
drop table if exists public.concept_items cascade;
drop table if exists public.concept_recipe_items cascade;
drop table if exists public.concept_templates cascade;
drop table if exists public.day_closures cascade;
drop table if exists public.efatura_connections cascade;
drop table if exists public.ingredients cascade;
drop table if exists public.inventory_count_items cascade;
drop table if exists public.inventory_counts cascade;
drop table if exists public.menu_categories cascade;
drop table if exists public.menu_item_modifier_groups cascade;
drop table if exists public.menu_items cascade;
drop table if exists public.modifier_groups cascade;
drop table if exists public.modifiers cascade;
drop table if exists public.order_discounts cascade;
drop table if exists public.order_item_modifiers cascade;
drop table if exists public.order_items cascade;
drop table if exists public.order_payments cascade;
drop table if exists public.orders cascade;
drop table if exists public.overtime_consents cascade;
drop table if exists public.payment_providers cascade;
drop table if exists public.product_variants cascade;
drop table if exists public.profiles cascade;
drop table if exists public.public_holidays cascade;
drop table if exists public.purchase_items cascade;
drop table if exists public.purchase_requests cascade;
drop table if exists public.purchases cascade;
drop table if exists public.recipe_items cascade;
drop table if exists public.settlement_receipts cascade;
drop table if exists public.staff_leaves cascade;
drop table if exists public.staff_shifts cascade;
drop table if exists public.stations cascade;
drop table if exists public.stock_groups cascade;
drop table if exists public.stock_movements cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.table_status_events cascade;
drop table if exists public.valet_entries cascade;

-- Ortak tablolarda kalan eski program kolonlari (17 adet).
alter table public.reservations drop column if exists seated_order_id;
alter table public.restaurant_settings drop column if exists default_vat_rate;
alter table public.restaurant_settings drop column if exists default_menu_design;
alter table public.restaurant_settings drop column if exists default_variable_cost_per_cover;
alter table public.restaurant_settings drop column if exists default_fixed_cost_share_percent;
alter table public.restaurant_settings drop column if exists role_visibility;
alter table public.restaurant_settings drop column if exists fixed_cost_days_override;
alter table public.restaurant_settings drop column if exists staff_comparison_enabled;
alter table public.restaurant_settings drop column if exists sgk_employer_rate;
alter table public.restaurant_settings drop column if exists background_choice;
alter table public.restaurant_settings drop column if exists purchase_approval_roles;
alter table public.restaurant_settings drop column if exists target_labor_percent;
alter table public.restaurant_settings drop column if exists table_flow_mode;
alter table public.restaurant_settings drop column if exists tip_points;
alter table public.restaurant_settings drop column if exists kitchen_tip_percent;
alter table public.restaurant_settings drop column if exists course_sequencing_enabled;
alter table public.restaurant_settings drop column if exists evening_start_hour;
