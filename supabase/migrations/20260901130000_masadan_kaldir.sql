-- MASADAN KALDIR (Gökhan, 2026-09-01: "misafiri masadan alacak, rezervasyon sonlandırmak
-- onun işi değil"). Rezervasyonun bütün masaları bırakılıyor, masalar boşa dönüyor;
-- rezervasyonun kendisi ve durumu olduğu gibi kalıyor — masasız bir rezervasyon oluyor.
-- Oturmuş misafirin masası da bırakılabiliyor: masayı boşaltmak ziyareti bitirmek değil.
create or replace function public.clear_reservation_tables(p_reservation_id uuid)
returns void
language plpgsql
as $$
declare
  v_rest uuid;
begin
  select restaurant_id into v_rest from reservations where id = p_reservation_id;
  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  -- Sadece bu rezervasyona ayrılmış masalar boşa çevriliyor; başkasının oturduğu masaya
  -- dokunulmuyor.
  update restaurant_tables rt
  set status = 'empty', reservation_note = null, updated_at = now()
  where rt.restaurant_id = v_rest
    and rt.id in (select table_id from reservation_tables where reservation_id = p_reservation_id);

  delete from reservation_tables where reservation_id = p_reservation_id;
  update reservations set table_id = null where id = p_reservation_id;
end;
$$;

grant execute on function public.clear_reservation_tables(uuid) to authenticated;
