-- RZV veritabani yapisi — 4/6: FONKSIYONLAR (5/6)
set check_function_bodies = off;

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

