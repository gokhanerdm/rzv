-- RZV veritabani yapisi — 4/6: FONKSIYONLAR (1/4)
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_purchase_invoice(p_restaurant uuid, p_supplier uuid, p_invoice_ref text, p_purchased_at timestamp with time zone, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_purchase uuid;
  v_when timestamptz := coalesce(p_purchased_at, now());
  v_total numeric := 0;
  it jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Fatura en az bir kalem içermeli';
  end if;

  select sum((x->>'quantity')::numeric * (x->>'unit_price')::numeric)
  into v_total from jsonb_array_elements(p_items) x;

  insert into purchases (restaurant_id, supplier_id, purchased_at, total_amount, source, invoice_ref)
  values (p_restaurant, p_supplier, v_when, coalesce(v_total, 0), 'manuel', nullif(trim(p_invoice_ref), ''))
  returning id into v_purchase;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into purchase_items (restaurant_id, purchase_id, ingredient_id, quantity, unit_price)
    values (p_restaurant, v_purchase, (it->>'ingredient_id')::uuid,
            (it->>'quantity')::numeric, (it->>'unit_price')::numeric);

    insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id, occurred_at)
    values (p_restaurant, (it->>'ingredient_id')::uuid, 'purchase',
            (it->>'quantity')::numeric, (it->>'unit_price')::numeric, 'purchase', v_purchase, v_when);

    update ingredients set current_unit_cost = (it->>'unit_price')::numeric, updated_at = now()
    where id = (it->>'ingredient_id')::uuid;
  end loop;

  return v_purchase;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_purchase_invoice(p_restaurant uuid, p_supplier uuid, p_invoice_ref text, p_purchased_at timestamp with time zone, p_items jsonb, p_purchase_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_purchase uuid;
  v_when timestamptz := coalesce(p_purchased_at, now());
  v_total numeric := 0;
  it jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Fatura en az bir kalem içermeli';
  end if;

  select sum((x->>'quantity')::numeric * (x->>'unit_price')::numeric)
  into v_total from jsonb_array_elements(p_items) x;

  insert into purchases (restaurant_id, supplier_id, purchased_at, total_amount, source, invoice_ref)
  values (p_restaurant, p_supplier, v_when, coalesce(v_total, 0), 'manuel', nullif(trim(p_invoice_ref), ''))
  returning id into v_purchase;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into purchase_items (restaurant_id, purchase_id, ingredient_id, quantity, unit_price)
    values (p_restaurant, v_purchase, (it->>'ingredient_id')::uuid,
            (it->>'quantity')::numeric, (it->>'unit_price')::numeric);

    insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id, occurred_at)
    values (p_restaurant, (it->>'ingredient_id')::uuid, 'purchase',
            (it->>'quantity')::numeric, (it->>'unit_price')::numeric, 'purchase', v_purchase, v_when);

    update ingredients set current_unit_cost = (it->>'unit_price')::numeric, updated_at = now()
    where id = (it->>'ingredient_id')::uuid;
  end loop;

  if p_purchase_request_id is not null then
    update purchase_requests
    set status = 'karsilandi', purchase_id = v_purchase
    where id = p_purchase_request_id and restaurant_id = p_restaurant;
  end if;

  return v_purchase;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_reservation_branch(p_user_id uuid, p_branch_name text, p_branch_phone text, p_il text, p_ilce text, p_address text, p_opening_hours jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_company uuid;
  v_business_type text;
  v_contact_name text;
  v_restaurant uuid;
begin
  select c.id, c.business_type, c.contact_name
  into v_company, v_business_type, v_contact_name
  from companies c
  where c.owner_user_id = p_user_id and c.deleted_at is null
  order by c.created_at
  limit 1;

  if v_company is null then
    raise exception 'Bu hesapta çok şubeli bir marka kaydı yok';
  end if;
  if trim(coalesce(p_branch_name, '')) = '' then
    raise exception 'Şube adı boş olamaz';
  end if;

  insert into restaurants (name, owner_user_id, business_type, contact_name, phone, il, ilce, address, company_id)
  values (
    trim(p_branch_name), p_user_id, v_business_type, v_contact_name,
    nullif(trim(coalesce(p_branch_phone, '')), ''), nullif(trim(coalesce(p_il, '')), ''),
    nullif(trim(coalesce(p_ilce, '')), ''), nullif(trim(coalesce(p_address, '')), ''), v_company
  )
  returning id into v_restaurant;

  insert into restaurant_settings (restaurant_id, opening_hours) values (v_restaurant, p_opening_hours);

  return v_restaurant;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_staff_member(p_restaurant_id uuid, p_full_name text, p_pin text, p_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
  if not (public.yonetici_mi() or p_restaurant_id in (select public.erisilen_restoranlar())) then
    raise exception 'Bu işletmede personel ekleme yetkiniz yok';
  end if;
  insert into staff_members (restaurant_id, full_name, pin_hash, role)
  values (p_restaurant_id, p_full_name, crypt(p_pin, gen_salt('bf')), p_role)
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_stock_purchase(p_restaurant uuid, p_ingredient uuid, p_supplier uuid, p_quantity numeric, p_unit_price numeric, p_source text DEFAULT 'manuel'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_purchase uuid;
begin
  insert into purchases (restaurant_id, supplier_id, total_amount, source)
  values (p_restaurant, p_supplier, p_quantity * p_unit_price, p_source)
  returning id into v_purchase;

  insert into purchase_items (restaurant_id, purchase_id, ingredient_id, quantity, unit_price)
  values (p_restaurant, v_purchase, p_ingredient, p_quantity, p_unit_price);

  insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id)
  values (p_restaurant, p_ingredient, 'purchase', p_quantity, p_unit_price, 'purchase', v_purchase);

  update ingredients set current_unit_cost = p_unit_price, updated_at = now() where id = p_ingredient;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_valet_entry(p_restaurant uuid, p_guest_name text, p_plate_no text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_table uuid;
  v_id uuid;
begin
  select w.seated_table_id into v_table
  from waitlist_entries w
  where w.restaurant_id = p_restaurant and w.status = 'oturdu'
    and lower(trim(w.guest_name)) = lower(trim(p_guest_name))
  order by w.seated_at desc
  limit 1;

  insert into valet_entries (restaurant_id, guest_name, plate_no, matched_table_id)
  values (p_restaurant, p_guest_name, p_plate_no, v_table)
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_valet_entry(p_restaurant uuid, p_guest_name text, p_plate_no text, p_party_size integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_table uuid;
  v_id uuid;
begin
  select r.table_id into v_table
  from reservations r
  where r.restaurant_id = p_restaurant and r.status = 'oturdu'
    and lower(trim(r.guest_name)) = lower(trim(p_guest_name))
  order by r.seated_at desc
  limit 1;

  insert into valet_entries (restaurant_id, guest_name, plate_no, matched_table_id)
  values (p_restaurant, p_guest_name, p_plate_no, v_table)
  returning id into v_id;

  if p_party_size is not null then
    perform check_in_arrival(p_restaurant, p_guest_name, p_party_size);
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.anonymize_expired_personal_data(p_restaurant uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_days int;
  v_count int;
begin
  select coalesce(kvkk_retention_days, 365) into v_days
  from restaurant_settings where restaurant_id = p_restaurant;
  v_days := coalesce(v_days, 365);

  with hedef as (
    select id from reservations
    where restaurant_id = p_restaurant
      and deleted_at is null
      and anonymized_at is null
      and reserved_at < now() - (v_days || ' days')::interval
  )
  update reservations r
  set guest_name = 'Anonimleştirildi',
      guest_phone = null,
      note = null,
      anonymized_at = now()
  from hedef h
  where r.id = h.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_concept_template(p_restaurant_id uuid, p_concept_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  insert into menu_categories (restaurant_id, name, sort_order)
  select p_restaurant_id, cc.name, cc.sort_order
  from concept_categories cc
  where cc.concept_id = p_concept_id
    and not exists (
      select 1 from menu_categories mc
      where mc.restaurant_id = p_restaurant_id and mc.name = cc.name and mc.deleted_at is null
    );

  insert into ingredients (restaurant_id, name, unit, current_unit_cost, waste_tolerance_percent)
  select p_restaurant_id, ci.name, ci.unit, ci.default_unit_cost, ci.waste_tolerance_percent
  from concept_ingredients ci
  where ci.concept_id = p_concept_id
    and not exists (
      select 1 from ingredients i
      where i.restaurant_id = p_restaurant_id and i.name = ci.name and i.deleted_at is null
    );

  insert into menu_items (restaurant_id, category_id, name, sale_price, vat_rate, sort_order)
  select p_restaurant_id, mc.id, cit.name, cit.suggested_price, 10, cit.sort_order
  from concept_items cit
  join concept_categories cc on cc.id = cit.category_id
  join menu_categories mc on mc.restaurant_id = p_restaurant_id and mc.name = cc.name and mc.deleted_at is null
  where cit.concept_id = p_concept_id
    and not exists (
      select 1 from menu_items mi
      where mi.restaurant_id = p_restaurant_id and mi.category_id = mc.id and mi.name = cit.name and mi.deleted_at is null
    );

  insert into recipe_items (restaurant_id, menu_item_id, ingredient_id, quantity)
  select p_restaurant_id, mi.id, i.id, cri.quantity
  from concept_recipe_items cri
  join concept_items cit on cit.id = cri.item_id
  join concept_categories cc on cc.id = cit.category_id
  join menu_categories mc on mc.restaurant_id = p_restaurant_id and mc.name = cc.name and mc.deleted_at is null
  join menu_items mi on mi.restaurant_id = p_restaurant_id and mi.category_id = mc.id and mi.name = cit.name and mi.deleted_at is null
  join concept_ingredients ci on ci.id = cri.ingredient_id
  join ingredients i on i.restaurant_id = p_restaurant_id and i.name = ci.name and i.deleted_at is null
  where cit.concept_id = p_concept_id
    and not exists (
      select 1 from recipe_items ri
      where ri.restaurant_id = p_restaurant_id and ri.menu_item_id = mi.id and ri.ingredient_id = i.id
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_seating_plan(p_restaurant uuid, p_plan jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_ids uuid[];
  v_kayit jsonb;
  v_rez uuid;
  v_masalar uuid[];
  v_note text;
begin
  select coalesce(array_agg((x->>'reservation_id')::uuid), '{}') into v_ids
  from jsonb_array_elements(p_plan) as x;
  if array_length(v_ids, 1) is null then return; end if;

  update restaurant_tables rt
  set status = 'empty', reservation_note = null, updated_at = now()
  where rt.restaurant_id = p_restaurant
    and rt.status = 'reserved'
    and rt.id in (select table_id from reservation_tables where reservation_id = any (v_ids));
  delete from reservation_tables where reservation_id = any (v_ids);

  for v_kayit in select * from jsonb_array_elements(p_plan) loop
    v_rez := (v_kayit->>'reservation_id')::uuid;
    select coalesce(array_agg((t)::uuid), '{}') into v_masalar
    from jsonb_array_elements_text(v_kayit->'table_ids') as t;
    if array_length(v_masalar, 1) is null then continue; end if;

    insert into reservation_tables (reservation_id, table_id)
    select v_rez, m from unnest(v_masalar) as m
    on conflict do nothing;

    update reservations set table_id = v_masalar[1] where id = v_rez;

    select to_char(reserved_at at time zone 'Europe/Istanbul', 'HH24:MI') || ' · ' || guest_name || ' · ' || party_size || ' kişi'
    into v_note from reservations where id = v_rez;

    -- "sadece boşsa işaretle" değil, "misafir oturmuyorsa işaretle": masa o an başka bir
    -- rezervasyonda görünüyorsa atlanıyordu, sonra o rezervasyon masayı bırakınca masa
    -- rezerve edilmiş rezervasyona bağlı olduğu hâlde boş renkte kalıyordu (Gökhan:
    -- "isim gelmiş ama dolu rengi yok").
    update restaurant_tables
    set status = 'reserved', reservation_note = v_note, updated_at = now()
    where id = any (v_masalar) and restaurant_id = p_restaurant and status <> 'occupied';
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_purchase_request(p_restaurant uuid, p_ingredient_id uuid, p_supplier_id uuid, p_quantity numeric, p_days integer, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_id uuid;
begin
  insert into purchase_requests (restaurant_id, ingredient_id, supplier_id, suggested_qty, target_days, reason, status, approved_by_staff_id, approved_at)
  values (p_restaurant, p_ingredient_id, p_supplier_id, p_quantity, p_days,
          p_days || ' günlük sarfiyat + %10 pay ile önerildi', 'onaylandi', p_staff_id, now())
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_reservation_table(p_reservation_id uuid, p_table_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_rest uuid;
  v_name text;
  v_party int;
  v_saat text;
  v_old_table uuid;
begin
  select restaurant_id, guest_name, party_size, to_char(reserved_at at time zone 'Europe/Istanbul', 'HH24:MI'), table_id
  into v_rest, v_name, v_party, v_saat, v_old_table
  from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if v_old_table is not null and v_old_table <> p_table_id then
    update restaurant_tables set status = 'empty', reservation_note = null
    where id = v_old_table and status = 'reserved';
  end if;

  update reservations set table_id = p_table_id where id = p_reservation_id;

  update restaurant_tables
  set status = 'reserved', reservation_note = v_saat || ' · ' || v_name || ' · ' || v_party || ' kişi'
  where id = p_table_id and restaurant_id = v_rest and status = 'empty';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_reservation_tables(p_reservation_id uuid, p_table_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_rest uuid;
  v_name text;
  v_party int;
  v_saat text;
  v_note text;
  v_gun date;
  v_cakisan text;
begin
  if p_table_ids is null or array_length(p_table_ids, 1) is null or array_length(p_table_ids, 1) = 0 then
    raise exception 'En az bir masa seçilmeli';
  end if;

  select restaurant_id, guest_name, party_size,
         to_char(reserved_at at time zone 'Europe/Istanbul', 'HH24:MI'),
         (reserved_at at time zone 'Europe/Istanbul')::date
  into v_rest, v_name, v_party, v_saat, v_gun
  from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  select string_agg(distinct r.guest_name, ', ') into v_cakisan
  from reservation_tables rt
  join reservations r on r.id = rt.reservation_id
  where rt.table_id = any (p_table_ids)
    and r.id <> p_reservation_id
    and r.deleted_at is null
    and r.status in ('bekleniyor', 'geldi', 'oturdu')
    and (r.reserved_at at time zone 'Europe/Istanbul')::date = v_gun;
  if v_cakisan is not null then
    raise exception 'Bu masa aynı gün başka bir rezervasyona ayrılmış (%). Önce oradan boşaltın.', v_cakisan;
  end if;

  update restaurant_tables rt
  set status = 'empty', reservation_note = null
  where rt.status = 'reserved'
    and rt.id in (select table_id from reservation_tables where reservation_id = p_reservation_id)
    and rt.id <> all (p_table_ids);

  delete from reservation_tables where reservation_id = p_reservation_id;
  insert into reservation_tables (reservation_id, table_id)
  select p_reservation_id, t from unnest(p_table_ids) as t;

  update reservations set table_id = p_table_ids[1] where id = p_reservation_id;

  v_note := v_saat || ' · ' || v_name || ' · ' || v_party || ' kişi';
  update restaurant_tables
  set status = 'reserved', reservation_note = v_note
  where id = any (p_table_ids) and restaurant_id = v_rest and status = 'empty';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bootstrap_reservation_account(p_user_id uuid, p_kind text, p_business_name text, p_business_type text, p_contact_name text, p_phone text, p_email text, p_branch_name text, p_branch_phone text, p_il text, p_ilce text, p_address text, p_opening_hours jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_company uuid;
  v_restaurant uuid;
  v_tip text;
  v_var jsonb;
  v_saatler jsonb;
  v_gun text;
  v_eposta text;
begin
  if p_user_id is null then
    raise exception 'Kullanıcı kimliği gerekli';
  end if;
  if auth.uid() is not null and p_user_id <> auth.uid() then
    raise exception 'Başka bir kullanıcı adına işletme kaydı açılamaz';
  end if;
  if auth.uid() is null and not exists (
    select 1 from auth.users u where u.id = p_user_id and u.created_at > now() - interval '15 minutes'
  ) then
    raise exception 'Geçersiz kayıt isteği';
  end if;

  if exists (select 1 from restaurants where owner_user_id = p_user_id and deleted_at is null) then
    raise exception 'Bu kullanıcı için zaten bir işletme kaydı var';
  end if;
  if trim(coalesce(p_business_name, '')) = '' then
    raise exception 'İşletme adı boş olamaz';
  end if;

  v_eposta := nullif(lower(trim(coalesce(p_email, ''))), '');

  if p_kind = 'cok' then
    insert into companies (name, business_type, contact_name, phone, email, owner_user_id)
    values (trim(p_business_name), nullif(trim(coalesce(p_business_type,'')),''), nullif(trim(coalesce(p_contact_name,'')),''),
            nullif(trim(coalesce(p_phone,'')),''), v_eposta, p_user_id)
    returning id into v_company;

    insert into restaurants (name, owner_user_id, business_type, contact_name, phone, eposta, il, ilce, address, company_id)
    values (trim(coalesce(nullif(trim(p_branch_name),''), p_business_name)), p_user_id,
            nullif(trim(coalesce(p_business_type,'')),''), nullif(trim(coalesce(p_contact_name,'')),''),
            nullif(trim(coalesce(p_branch_phone,'')),''), v_eposta, nullif(trim(coalesce(p_il,'')),''),
            nullif(trim(coalesce(p_ilce,'')),''), nullif(trim(coalesce(p_address,'')),''), v_company)
    returning id into v_restaurant;
  else
    insert into restaurants (name, owner_user_id, business_type, contact_name, phone, eposta, il, ilce, address)
    values (trim(p_business_name), p_user_id,
            nullif(trim(coalesce(p_business_type,'')),''), nullif(trim(coalesce(p_contact_name,'')),''),
            nullif(trim(coalesce(p_phone,'')),''), v_eposta, nullif(trim(coalesce(p_il,'')),''),
            nullif(trim(coalesce(p_ilce,'')),''), nullif(trim(coalesce(p_address,'')),''))
    returning id into v_restaurant;
  end if;

  v_tip := public.isletme_turu_slug(p_business_type);
  v_var := public.isletme_tipi_varsayilani(v_tip);

  v_saatler := coalesce(p_opening_hours, '{}'::jsonb);
  foreach v_gun in array array['pzt','sal','car','per','cum','cmt','paz'] loop
    v_saatler := jsonb_set(v_saatler, array[v_gun], jsonb_build_object(
      'acilis', v_var->>'acilis',
      'kapanis', v_var->>'kapanis',
      'kapali', coalesce((v_saatler->v_gun->>'kapali')::boolean, false)
    ), true);
  end loop;

  insert into restaurant_settings (
    restaurant_id, opening_hours, isletme_tipi, isletme_gunu_saati, default_duration_minutes,
    saate_gore_masa, fix_menu_acik, minimum_harcama_acik, masa_paketi_acik, ozel_gece_acik,
    pr_acik, guest_list_acik
  )
  values (
    v_restaurant, v_saatler, v_tip,
    v_var->>'isletme_gunu_saati', (v_var->>'default_duration_minutes')::int,
    false, (v_var->>'fix_menu_acik')::boolean,
    (v_var->>'minimum_harcama_acik')::boolean, (v_var->>'masa_paketi_acik')::boolean,
    (v_var->>'ozel_gece_acik')::boolean, (v_var->>'pr_acik')::boolean,
    (v_var->>'guest_list_acik')::boolean
  );

  return v_restaurant;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bootstrap_restaurant_account(p_user_id uuid, p_restaurant_name text, p_full_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_restaurant uuid;
  v_base_slug text;
  v_slug text;
  v_suffix int := 1;
begin
  if p_user_id is null then
    raise exception 'Kullanıcı kimliği gerekli';
  end if;
  if auth.uid() is not null and p_user_id <> auth.uid() then
    raise exception 'Başka bir kullanıcı adına işletme kaydı açılamaz';
  end if;
  if auth.uid() is null and not exists (
    select 1 from auth.users u where u.id = p_user_id and u.created_at > now() - interval '15 minutes'
  ) then
    raise exception 'Geçersiz kayıt isteği';
  end if;

  if exists (select 1 from profiles where id = p_user_id) then
    raise exception 'Bu kullanıcı için zaten bir işletme kaydı var';
  end if;
  if trim(coalesce(p_restaurant_name, '')) = '' then
    raise exception 'İşletme adı boş olamaz';
  end if;

  v_base_slug := translate(p_restaurant_name, 'çÇğĞıİöÖşŞüÜ', 'ccggiioosuu');
  v_base_slug := lower(v_base_slug);
  v_base_slug := regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g');
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then v_base_slug := 'isletme'; end if;

  v_slug := v_base_slug;
  while exists (select 1 from restaurants where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into restaurants (name, slug) values (trim(p_restaurant_name), v_slug)
  returning id into v_restaurant;

  insert into profiles (id, restaurant_id, full_name, role)
  values (p_user_id, v_restaurant, nullif(trim(p_full_name), ''), 'admin');

  return v_restaurant;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.category_daily_ingredient_needs(p_restaurant_id uuid, p_category_id uuid, p_total_covers integer)
 RETURNS TABLE(ingredient_id uuid, ingredient_name text, unit text, needed_quantity numeric, current_stock numeric, shortfall numeric, unit_cost numeric, estimated_cost numeric)
 LANGUAGE plpgsql
AS $function$
declare
  v_set_sum numeric;
  v_unset_count int;
  v_remaining numeric;
begin
  select coalesce(sum(expected_daily_share), 0), count(*) filter (where expected_daily_share is null)
    into v_set_sum, v_unset_count
  from menu_items
  where restaurant_id = p_restaurant_id and category_id = p_category_id and deleted_at is null and is_active;

  v_remaining := greatest(0, 100 - v_set_sum);

  return query
  with shares as (
    select mi.id as menu_item_id,
      coalesce(mi.expected_daily_share, case when v_unset_count > 0 then v_remaining / v_unset_count else 0 end) as raw_share
    from menu_items mi
    where mi.restaurant_id = p_restaurant_id and mi.category_id = p_category_id and mi.deleted_at is null and mi.is_active
  ),
  total as (
    select coalesce(sum(raw_share), 0) as total_share from shares
  ),
  counts as (
    select s.menu_item_id,
      case when t.total_share > 0 then p_total_covers * s.raw_share / t.total_share else 0 end as est_qty
    from shares s cross join total t
  ),
  needs as (
    select ri.ingredient_id, sum(ri.quantity * c.est_qty) as needed_qty
    from counts c
    join recipe_items ri on ri.menu_item_id = c.menu_item_id
    group by ri.ingredient_id
  ),
  stock as (
    select sm.ingredient_id, coalesce(sum(sm.quantity), 0) as current_stock
    from stock_movements sm
    where sm.restaurant_id = p_restaurant_id
    group by sm.ingredient_id
  )
  select i.id, i.name, i.unit, n.needed_qty,
    coalesce(st.current_stock, 0),
    greatest(0, n.needed_qty - coalesce(st.current_stock, 0)),
    i.current_unit_cost,
    n.needed_qty * i.current_unit_cost
  from needs n
  join ingredients i on i.id = n.ingredient_id
  left join stock st on st.ingredient_id = i.id
  order by n.needed_qty desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_in_arrival(p_restaurant uuid, p_guest_name text, p_party_size integer, p_guest_phone text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_kisi_karti_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_id uuid;
begin
  update reservations
  set status = 'geldi', arrived_at = now(),
      kisi_karti_id = coalesce(reservations.kisi_karti_id, p_kisi_karti_id),
      geldi_yazan = coalesce(auth.uid(), geldi_yazan)
  where id = (
    select id from reservations
    where restaurant_id = p_restaurant and status = 'bekleniyor'
      and (reserved_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date
      and lower(trim(guest_name)) = lower(trim(p_guest_name))
    order by reserved_at asc
    limit 1
  )
  returning id into v_id;

  if v_id is null then
    insert into reservations (
      restaurant_id, guest_name, guest_phone, party_size, reserved_at, status, arrived_at, note,
      consent_at, source, kisi_karti_id, iletisim_kanali, created_by, geldi_yazan
    )
    values (
      p_restaurant, p_guest_name, nullif(trim(coalesce(p_guest_phone, '')), ''),
      greatest(coalesce(p_party_size, 1), 1), now(), 'geldi', now(),
      nullif(trim(coalesce(p_note, '')), ''),
      case when trim(coalesce(p_guest_phone, '')) <> '' then now() else null end,
      'kapi', p_kisi_karti_id, 'yuz_yuze', auth.uid(), auth.uid()
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_table_reservation(p_table_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_res_id uuid;
begin
  select id into v_res_id from reservations
  where table_id = p_table_id and status in ('bekleniyor', 'geldi')
  order by reserved_at desc limit 1;

  if v_res_id is not null then
    perform set_reservation_status(v_res_id, 'iptal');
  else
    update restaurant_tables set status = 'empty', reservation_note = null where id = p_table_id and status = 'reserved';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.close_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_total numeric(12,2);
  v_discounts numeric(12,2);
  v_table uuid;
  v_rest uuid;
begin
  select table_id, restaurant_id into v_table, v_rest
  from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_total
  from order_items where order_id = p_order_id and status = 'active';

  select coalesce(sum(amount), 0) into v_discounts
  from order_discounts where order_id = p_order_id;
  v_total := greatest(0, v_total - v_discounts);

  insert into stock_movements (restaurant_id, ingredient_id, movement_type, quantity, unit_cost, source_type, source_id)
  select v_rest, ri.ingredient_id, 'consumption',
         -(ri.quantity * oi.quantity), i.current_unit_cost, 'order', p_order_id
  from order_items oi
  join recipe_items ri on ri.menu_item_id = oi.menu_item_id
  join ingredients i on i.id = ri.ingredient_id
  where oi.order_id = p_order_id and oi.status in ('active', 'ikram');

  update orders set status = 'closed', closed_at = now(), total_amount = v_total, updated_at = now()
  where id = p_order_id;

  if v_table is not null then
    update restaurant_tables set status = 'empty', updated_at = now() where id = v_table;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.close_order(p_order_id uuid, p_staff_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_total numeric(12,2);
  v_discounts numeric(12,2);
  v_table uuid;
begin
  select table_id into v_table
  from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_total
  from order_items where order_id = p_order_id and status = 'active';

  select coalesce(sum(amount), 0) into v_discounts
  from order_discounts where order_id = p_order_id;
  v_total := greatest(0, v_total - v_discounts);

  update orders set status = 'closed', closed_at = now(), total_amount = v_total, updated_at = now(),
    closed_by_staff_id = p_staff_id
  where id = p_order_id;

  if v_table is not null then
    update restaurant_tables set status = 'empty', updated_at = now() where id = v_table;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_cashier_payment(p_order_id uuid, p_staff_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_table uuid;
  v_rest uuid;
  v_mode text;
  v_total numeric(12,2);
  v_discounts numeric(12,2);
begin
  select table_id, restaurant_id into v_table, v_rest from orders where id = p_order_id and status = 'pending_cashier';
  if not found then
    raise exception 'Kasa onayı bekleyen sipariş bulunamadı';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_total from order_items where order_id = p_order_id and status = 'active';
  select coalesce(sum(amount), 0) into v_discounts from order_discounts where order_id = p_order_id;
  v_total := greatest(0, v_total - v_discounts);

  update orders set status = 'closed', closed_at = now(), total_amount = v_total,
    cashier_confirmed_at = now(), cashier_confirmed_by = p_staff_id, cashier_note = p_note, updated_at = now()
  where id = p_order_id;

  if v_table is not null then
    select table_flow_mode into v_mode from restaurant_settings where restaurant_id = v_rest;
    if coalesce(v_mode, 'basit') = 'basit' then
      update restaurant_tables set status = 'empty', updated_at = now() where id = v_table;
    else
      update restaurant_tables set status = 'toplanacak', updated_at = now() where id = v_table;
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.daily_prep_report(p_restaurant uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
declare
  v_tomorrow date := (now() at time zone 'Europe/Istanbul')::date + 1;
  v_dow int := extract(isodow from v_tomorrow);
  v_is_holiday boolean;
  v_avg_customers numeric;
  v_last_same_day numeric;
  result json;
begin
  select exists(select 1 from public_holidays where holiday_date = v_tomorrow) into v_is_holiday;

  select avg(daily_count) into v_avg_customers
  from (
    select (o.opened_at at time zone 'Europe/Istanbul')::date as d,
           sum(o.party_size) as daily_count
    from orders o
    where o.restaurant_id = p_restaurant
      and extract(isodow from (o.opened_at at time zone 'Europe/Istanbul')) = v_dow
      and (o.opened_at at time zone 'Europe/Istanbul')::date >= v_tomorrow - interval '35 days'
    group by 1
  ) x;

  select daily_count into v_last_same_day
  from (
    select (o.opened_at at time zone 'Europe/Istanbul')::date as d,
           sum(o.party_size) as daily_count
    from orders o
    where o.restaurant_id = p_restaurant
      and extract(isodow from (o.opened_at at time zone 'Europe/Istanbul')) = v_dow
      and (o.opened_at at time zone 'Europe/Istanbul')::date < v_tomorrow
    group by 1 order by 1 desc limit 1
  ) y;

  select json_build_object(
    'tarih', v_tomorrow,
    'resmi_tatil', coalesce(v_is_holiday, false),
    'beklenen_musteri', round(coalesce(v_avg_customers, 0)),
    'gecen_hafta_ayni_gun', coalesce(v_last_same_day, 0),
    'kritik_stoklar', (
      select coalesce(json_agg(json_build_object(
        'malzeme', t.name, 'mevcut', t.mevcut, 'par_seviye', t.par_level
      )), '[]')
      from (
        select i.name, i.par_level, coalesce(sum(sm.quantity), 0) as mevcut
        from ingredients i
        left join stock_movements sm on sm.ingredient_id = i.id and sm.restaurant_id = p_restaurant
        where i.restaurant_id = p_restaurant and i.deleted_at is null and i.par_level > 0
        group by i.id, i.name, i.par_level
        having coalesce(sum(sm.quantity), 0) <= i.par_level
      ) t
    )
  ) into result;
  return result;
end;
$function$
;
