-- RZV veritabani yapisi — 1/6: TABLOLAR
-- Sadece rezervasyon ve ekip. Veri yok, sadece yapi.

create table if not exists public.aktif_oturumlar (
  user_id uuid not null,
  oturum_kodu text not null,
  cihaz text,
  guncellendi timestamp with time zone default now() not null
);

create table if not exists public.companies (
  id uuid default gen_random_uuid() not null,
  name text not null,
  business_type text,
  contact_name text,
  phone text,
  email text,
  owner_user_id uuid not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.dining_areas (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  name text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  genislik_cm numeric,
  derinlik_cm numeric,
  online_acik boolean default true not null
);

create table if not exists public.dolu_gun_talepleri (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  gun date not null,
  kisi integer not null,
  ad text,
  telefon text,
  kanal text default 'online'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.fix_menuler (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  ad text not null,
  kisi_basi_fiyat numeric default 0 not null,
  aciklama text,
  sira integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.katilim_kodlari (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  rol text not null,
  kod text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.kisi_kart_baglantilari (
  id uuid default gen_random_uuid() not null,
  kisi_karti_id uuid not null,
  baglanti_telefon text not null,
  aciklama text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.kisi_kartlari (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  phone text not null,
  isim text,
  kart_notu text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  dogum_gunu date,
  vip boolean default false not null,
  yemek_tercihi text,
  icki_tercihi text,
  ai_ozet text,
  ai_ozet_kayit integer,
  ai_ozet_tarih timestamp with time zone
);

create table if not exists public.masa_garson (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  table_id uuid not null,
  gun date not null,
  created_at timestamp with time zone default now() not null,
  personel_id uuid
);

create table if not exists public.masa_gruplari (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  ad text not null,
  fiyatlama_modu text default 'yok'::text not null,
  tutar numeric default 0 not null,
  dahil_kisi integer,
  asan_kisi_ucreti numeric,
  sira integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  renk text default '#8B93A7'::text not null,
  en_fazla_kisi integer,
  loca boolean default false not null
);

create table if not exists public.masa_olculeri (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  shape text not null,
  seat_tier integer not null,
  width_cm numeric not null,
  height_cm numeric not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.masa_paketleri (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  ad text not null,
  fiyat numeric default 0 not null,
  icindekiler text,
  kisi_tavani integer,
  sira integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  sise_adedi integer,
  masa_hakki integer default 1 not null,
  loca_paketi boolean default false not null
);

create table if not exists public.mesajlar (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  reservation_id uuid,
  tur text not null,
  kanal text default 'whatsapp'::text not null,
  telefon text,
  metin text not null,
  planlanan_zaman timestamp with time zone default now() not null,
  durum text default 'kuyrukta'::text not null,
  gonderim_zamani timestamp with time zone,
  hata text,
  cevap text,
  cevap_zamani timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.not_kurallari (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  kelime text not null,
  tip text not null,
  alan_id uuid,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.ozel_gece_fiyatlari (
  id uuid default gen_random_uuid() not null,
  ozel_gece_id uuid not null,
  grup_id uuid,
  paket_id uuid,
  tutar numeric default 0 not null
);

create table if not exists public.ozel_geceler (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  gun date not null,
  ad text not null,
  sanatci text,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.personel_hesaplari (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  restaurant_id uuid not null,
  ad_soyad text not null,
  telefon text,
  rol text default 'garson'::text not null,
  durum text default 'bekliyor'::text not null,
  created_at timestamp with time zone default now() not null,
  onay_at timestamp with time zone,
  test_aktif boolean default false not null,
  test_hesabi boolean default false not null
);

create table if not exists public.platform_yoneticileri (
  user_id uuid not null,
  eklendi_at timestamp with time zone default now() not null
);

create table if not exists public.posta_masalari (
  posta_id uuid not null,
  table_id uuid not null
);

create table if not exists public.posta_personelleri (
  posta_id uuid not null,
  personel_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.postalar (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  ad text not null,
  renk text default '#3F7CAC'::text not null,
  sira integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.reservation_tables (
  id uuid default gen_random_uuid() not null,
  reservation_id uuid not null,
  table_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.reservations (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  table_id uuid,
  guest_name text not null,
  guest_phone text,
  party_size integer not null,
  reserved_at timestamp with time zone not null,
  duration_minutes integer default 90 not null,
  status text default 'bekleniyor'::text not null,
  note text,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  consent_at timestamp with time zone,
  anonymized_at timestamp with time zone,
  arrived_at timestamp with time zone,
  seated_at timestamp with time zone,
  cancel_reason text,
  source text default 'rezervasyon'::text not null,
  left_at timestamp with time zone,
  masa_kilit boolean default false not null,
  kisi_karti_id uuid,
  kadin_sayisi integer,
  erkek_sayisi integer,
  created_by uuid,
  iletisim_kanali text,
  cancelled_at timestamp with time zone,
  hesap_tutari numeric(12,2),
  yedek boolean default false not null,
  yedekten boolean default false not null,
  gelen_kisi integer,
  misafir_masasi boolean default false not null,
  misafir_yakin boolean,
  tercih_alan_id uuid,
  alan_hesap_id uuid,
  servis_tipi text,
  fix_menu_id uuid,
  fix_kisi integer,
  bekleme boolean default false not null,
  bekleme_baslangic timestamp with time zone,
  bekleme_dakika integer,
  teyit_durumu text default 'yok'::text not null,
  teyit_zamani timestamp with time zone,
  oturtan uuid,
  geldi_yazan uuid,
  iptal_eden uuid,
  stok_masa integer default 0 not null,
  kapora_tutar numeric,
  kapora_alindi boolean default false not null,
  masa_paketi_id uuid,
  gelen_kadin integer,
  gelen_erkek integer
);

create table if not exists public.restaurant_photos (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  dosya_yolu text not null,
  sira integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.restaurant_settings (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  opening_hours jsonb,
  kvkk_notice text,
  kvkk_retention_days integer default 365 not null,
  notif_channel text default 'kapali'::text not null,
  notif_onay boolean default true not null,
  notif_hatirlatma boolean default true not null,
  default_duration_minutes integer default 90 not null,
  auto_seating boolean default false not null,
  saate_gore_masa boolean default false not null,
  masa_arasi_pay integer default 0 not null,
  varsayilan_rezervasyon_saati text default '19:00'::text not null,
  musteri_sadakat_ziyaret_esigi integer default 5 not null,
  musteri_no_show_risk_yuzde integer default 30 not null,
  yedek_otomatik boolean default true not null,
  masa_ek_sandalye integer default 1 not null,
  sadik_masa_gecmis_sayisi integer default 3 not null,
  gun_kapanis text default 'sor'::text not null,
  rezervasyon_gun_ufku integer default 3650 not null,
  online_acik boolean default true not null,
  online_min_kisi integer default 1 not null,
  online_max_kisi integer default 12 not null,
  online_telefon_esigi integer default 12 not null,
  online_slot_dakika integer default 15 not null,
  online_salon_secimi boolean default false not null,
  online_gelmeyen_engeli boolean default true not null,
  isletme_tipi text default 'restoran'::text not null,
  isletme_gunu_saati text default '01:00'::text not null,
  fix_menu_acik boolean default false not null,
  karma_fix_alakart boolean default false not null,
  minimum_harcama_acik boolean default false not null,
  masa_paketi_acik boolean default false not null,
  ozel_gece_acik boolean default false not null,
  pr_acik boolean default false not null,
  pr_komisyon_tipi text default 'kisi'::text not null,
  pr_komisyon_tutar numeric default 0 not null,
  pr_kendi_gorsun boolean default false not null,
  pr_sadece_gelene boolean default true not null,
  guest_list_acik boolean default false not null,
  rezervasyon_alan_gorunsun boolean default true not null,
  yapilandirilmis_not_acik boolean default true not null,
  silme_yetkisi text default 'yonetici'::text not null,
  hesap_girme_yetkisi text default 'yonetici'::text not null,
  ayar_yetkisi text default 'yonetici'::text not null,
  ai_ozet_acik boolean default true not null,
  ai_isim_maskele boolean default true not null,
  varsayilana_getir_acik boolean default true not null,
  online_onay_gerekli boolean default true not null,
  rol_sayfalari jsonb default '{"pr": ["rezervasyon", "salon"], "garson": ["rezervasyon", "salon"], "mutfak": ["rezervasyon"], "yonetici": ["rezervasyon", "salon", "istatistik", "ayarlar"], "karsilama": ["rezervasyon", "salon", "istatistik"], "salon_sefi": ["rezervasyon", "salon"]}'::jsonb not null,
  garson_sadece_kendi_salonu boolean default true not null,
  sadece_ana_panel_rezervasyon boolean default false not null,
  mesaj_acik boolean default false not null,
  mesaj_kanal text default 'whatsapp'::text not null,
  mesaj_onay_acik boolean default true not null,
  mesaj_onay_metni text,
  mesaj_teyit_acik boolean default true not null,
  mesaj_teyit_saat time without time zone default '12:00:00'::time without time zone not null,
  mesaj_teyit_bitis time without time zone default '13:00:00'::time without time zone not null,
  mesaj_teyit_metni text,
  mesaj_sessiz_baslangic time without time zone default '23:00:00'::time without time zone not null,
  mesaj_sessiz_bitis time without time zone default '09:00:00'::time without time zone not null,
  mesaj_anket_acik boolean default false not null,
  mesaj_anket_metni text,
  masa_hesabi_acik boolean default false not null,
  masa_en_fazla_kisi integer default 5 not null,
  sinir_asilinca text default 'sor'::text not null,
  masa_stogu_adet integer default 0 not null,
  masa_stogu_kisi integer default 5 not null,
  stok_bitince_arka_sira boolean default true not null,
  loca_kapora_acik boolean default false not null,
  loca_kapora_tutar numeric,
  loca_kapora_zorunlu boolean default false not null,
  loca_satis_yetkisi text default 'herkes'::text not null,
  loca_walkin_acik boolean default true not null,
  loca_paket_zorunlu boolean default false not null,
  kurulum_tamam boolean default false not null,
  kurulum_adim text default 'isletme'::text not null,
  kapasite_kisi integer default 0 not null,
  kvkk_sozlesme_onay boolean default false not null,
  kvkk_sozlesme_onay_at timestamp with time zone,
  kvkk_metin_onay boolean default false not null,
  kvkk_metin_onay_at timestamp with time zone
);

create table if not exists public.restaurant_tables (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  name text not null,
  area text,
  status text default 'empty'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  area_id uuid,
  sort_order integer default 0 not null,
  position_x numeric,
  position_y numeric,
  reservation_note text,
  merged_into_table_id uuid,
  seat_count integer default 4 not null,
  became_toplanacak_at timestamp with time zone,
  shape text default 'kare'::text not null,
  rotated boolean default false not null,
  normal_x numeric,
  normal_y numeric,
  grup_id uuid,
  normal_rotated boolean,
  varsayilan_x numeric,
  varsayilan_y numeric,
  varsayilan_rotated boolean,
  en_fazla_kisi integer,
  stok boolean default false not null,
  stok_gun date,
  tasindi_gun date
);

create table if not exists public.restaurants (
  id uuid default gen_random_uuid() not null,
  name text not null,
  timezone text default 'Europe/Istanbul'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  slug text,
  address text,
  phone text,
  tax_office text,
  tax_number text,
  logo_url text,
  owner_user_id uuid,
  business_type text,
  contact_name text,
  il text,
  ilce text,
  company_id uuid,
  ulke_kodu text default '+90'::text,
  instagram text,
  eposta text,
  harita_linki text,
  katilim_kodu text
);

create table if not exists public.rezervasyon_etiketleri (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  ad text not null,
  mutfaga_gitsin boolean default false not null,
  uyari boolean default false not null,
  sira integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.salon_ogeleri (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  area_id uuid not null,
  type text not null,
  name text not null,
  x1 numeric not null,
  y1 numeric not null,
  x2 numeric,
  y2 numeric,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  rotated boolean default false not null
);
