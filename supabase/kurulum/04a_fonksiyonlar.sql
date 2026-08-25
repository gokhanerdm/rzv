-- RZV veritabani yapisi — 4/6: FONKSIYONLAR (1/4)
set check_function_bodies = off;

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

