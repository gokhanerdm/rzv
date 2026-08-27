-- İşletme türünün ekranda yazan adı "Yemekli gece mekânı" oldu (Gökhan, 2026-08-27).
-- Eski yazım da eşleşmeye devam ediyor: o adla kaydolmuş işletme varsa türü kaybolmasın.
create or replace function public.isletme_turu_slug(p_tur text)
 returns text
 language sql
 immutable
as $function$
  select case lower(btrim(coalesce(p_tur, '')))
    when 'gece kulübü'                then 'gece_kulubu'
    when 'gece kulübü - canlı müzik'  then 'gece_kulubu_canli'
    when 'gece kulübü — canlı müzik'  then 'gece_kulubu_canli'
    when 'canlı müzik - gece'         then 'gece_kulubu_canli'
    when 'yemekli gece mekânı'        then 'restoran_eglence'
    when 'yemekli gece mekani'        then 'restoran_eglence'
    when 'restoran + eğlence'         then 'restoran_eglence'
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
$function$;
