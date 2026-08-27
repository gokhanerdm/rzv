-- RESTORAN + EĞLENCE (Gökhan, 2026-08-27). Akşam yemek servisi veren, belirli günlerde
-- geçiş saatinden sonra eğlence düzenine dönen mekân. Yemek masaları kalkar, bistro
-- masaları gelir; geceye kalanlar gece kapasitesinden düşer, bistrolar bitince ayakta
-- müşteri kapasitesi kadar masasız rezervasyon alınır.

-- Salonun türü: yemek düzeni salonu mu, gece (bistro) düzeni salonu mu. Gece salonu ayrı
-- bir salonmuş gibi davranır — kendi yerleşimi vardır. En fazla bir gece salonu olur
-- (uygulama katmanında uyarılıyor).
alter table public.dining_areas
  add column if not exists tur text not null default 'yemek'
  check (tur in ('yemek','gece'));

-- Mekânın geneline ait eğlence ayarları. Sadece isletme_tipi='restoran_eglence' iken
-- ekranda görünür.
alter table public.restaurant_settings
  add column if not exists eglence_gunleri jsonb not null default '["cum","cmt"]'::jsonb,
  add column if not exists eglence_gecis_saati text not null default '22:00',
  add column if not exists ayakta_kapasite integer not null default 0,
  add column if not exists online_dilim_secimi boolean not null default false;

-- Rezervasyonun dilimi: yemek / gece / yemek_gece (yemeğe gelip geceye kalan). Eğlence
-- günü olmayan günlerde ve diğer işletme türlerinde NULL kalır.
-- ayakta: bistrolar dolunca masasız alınan gece rezervasyonu — masa sütununda "Ayakta" yazar.
alter table public.reservations
  add column if not exists dilim text
  check (dilim is null or dilim in ('yemek','gece','yemek_gece')),
  add column if not exists ayakta boolean not null default false;

-- Kayıt ekranındaki tür adı → slug.
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

-- Tür seçilince ayarların açılacağı varsayılanlar. restoran_eglence: 13:00–01:00, gün
-- 01:00'de biter, masa süresi 2 saat; fix menü / minimum harcama / masa paketi / özel gece
-- açık, PR / misafir listesi / masa hesabı kapalı (Gökhan simülasyonda düzeltecek).
create or replace function public.isletme_tipi_varsayilani(p_tip text)
 returns jsonb
 language sql
 immutable
as $function$
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
    when 'restoran_eglence' then jsonb_build_object(
      'acilis', '13:00', 'kapanis', '01:00', 'isletme_gunu_saati', '01:00',
      'default_duration_minutes', 120, 'saate_gore_masa', false,
      'fix_menu_acik', true, 'minimum_harcama_acik', true, 'masa_paketi_acik', true,
      'ozel_gece_acik', true, 'pr_acik', false, 'guest_list_acik', false,
      'masa_hesabi_acik', false)
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
$function$;
