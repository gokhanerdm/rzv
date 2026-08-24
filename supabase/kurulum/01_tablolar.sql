-- RZV veritabani yapisi — 1/6: TABLOLAR
-- restoran-aios projesinden 2026-08-24'te cikarildi. Veri yok, sadece yapi.

create table if not exists public.aktif_oturumlar (
  user_id uuid not null,
  oturum_kodu text not null,
  cihaz text,
  guncellendi timestamp with time zone default now() not null
);

create table if not exists public.business_expenses (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  name text not null,
  monthly_amount numeric(12,2) default 0 not null,
  active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  vat_rate numeric(5,2) default 20 not null
);

create table if not exists public.cash_movements (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  movement_type text not null,
  amount numeric(12,2) not null,
  note text,
  occurred_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null
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

create table if not exists public.concept_categories (
  id uuid default gen_random_uuid() not null,
  concept_id uuid not null,
  name text not null,
  sort_order integer default 0 not null
);

create table if not exists public.concept_ingredients (
  id uuid default gen_random_uuid() not null,
  concept_id uuid not null,
  name text not null,
  unit text not null,
  default_unit_cost numeric(12,4) default 0 not null,
  waste_tolerance_percent numeric(5,2) default 0 not null
);

create table if not exists public.concept_items (
  id uuid default gen_random_uuid() not null,
  concept_id uuid not null,
  category_id uuid not null,
  name text not null,
  suggested_price numeric(12,2) default 0 not null,
  sort_order integer default 0 not null
);

create table if not exists public.concept_recipe_items (
  id uuid default gen_random_uuid() not null,
  item_id uuid not null,
  ingredient_id uuid not null,
  quantity numeric(12,4) not null
);

create table if not exists public.concept_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.day_closures (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  closure_date date not null,
  expected_cash numeric(12,2) default 0 not null,
  counted_cash numeric(12,2) default 0 not null,
  difference numeric(12,2) default 0 not null,
  note text,
  created_at timestamp with time zone default now() not null
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

create table if not exists public.efatura_connections (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  provider text not null,
  provider_name text,
  status text default 'bagli_degil'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
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

create table if not exists public.ingredients (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  name text not null,
  unit text not null,
  waste_tolerance_percent numeric(5,2) default 0 not null,
  current_unit_cost numeric(12,4) default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  par_level numeric(12,4) default 0 not null,
  kcal_per_unit numeric(10,2) default 0 not null,
  diet_class text default 'bitkisel'::text not null,
  allergens text[] default '{}'::text[] not null,
  category text default 'gida'::text not null,
  supplier_id uuid,
  stock_group_id uuid,
  sort_order integer default 0 not null
);

create table if not exists public.inventory_count_items (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  count_id uuid not null,
  ingredient_id uuid not null,
  counted_quantity numeric(12,4) not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.inventory_counts (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  counted_at timestamp with time zone default now() not null,
  note text,
  created_at timestamp with time zone default now() not null
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
  staff_id uuid,
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

create table if not exists public.menu_categories (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  name text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  parent_id uuid,
  vat_rate numeric(4,1),
  target_food_cost_percent numeric(5,2),
  default_station_id uuid,
  course_no integer
);

create table if not exists public.menu_item_modifier_groups (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  menu_item_id uuid not null,
  group_id uuid not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.menu_items (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  category_id uuid,
  name text not null,
  sale_price numeric(12,2) not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  vat_rate numeric(4,1) default 10 not null,
  sort_order integer default 0 not null,
  calorie_override numeric(10,2),
  description text,
  ingredients_text text,
  image_url text,
  allergens_override text[],
  available_dine_in boolean default true not null,
  available_takeaway boolean default true not null,
  available_quick_sale boolean default true not null,
  recommended_price numeric(12,2),
  variable_cost_override numeric(12,2),
  fixed_cost_share_override numeric(12,2),
  station_override_id uuid,
  prep_minutes integer,
  expected_daily_share numeric(5,2)
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

create table if not exists public.modifier_groups (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  name text not null,
  min_select integer default 0 not null,
  max_select integer default 1 not null,
  required boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.modifiers (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  group_id uuid not null,
  name text not null,
  price_delta numeric(12,2) default 0 not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
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

create table if not exists public.order_discounts (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  order_id uuid not null,
  order_item_id uuid,
  amount numeric(12,2) not null,
  percent numeric(5,2),
  reason text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.order_item_modifiers (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  order_item_id uuid not null,
  modifier_id uuid,
  name text not null,
  price_delta numeric(12,2) default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.order_items (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  order_id uuid not null,
  menu_item_id uuid not null,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  status text default 'active'::text not null,
  created_at timestamp with time zone default now() not null,
  voided_by uuid,
  void_reason text,
  voided_at timestamp with time zone,
  variant_id uuid,
  sent_at timestamp with time zone,
  preparing_at timestamp with time zone,
  ready_at timestamp with time zone,
  served_at timestamp with time zone,
  original_table_id uuid,
  sent_by_staff_id uuid,
  prepared_by_staff_id uuid,
  vat_rate numeric(4,1) default 10 not null,
  needs_approval boolean default false not null,
  staff_meal_for_id uuid,
  course_no integer,
  course_released_at timestamp with time zone
);

create table if not exists public.order_payments (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  order_id uuid not null,
  amount numeric(12,2) not null,
  method text not null,
  paid_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  tip_amount numeric(12,2) default 0 not null,
  provider_id uuid
);

create table if not exists public.orders (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  table_id uuid,
  status text default 'open'::text not null,
  opened_at timestamp with time zone default now() not null,
  closed_at timestamp with time zone,
  total_amount numeric(12,2) default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  channel text default 'dine_in'::text not null,
  party_size integer default 1 not null,
  closed_by_staff_id uuid,
  split_from_order_id uuid,
  split_from_table_id uuid,
  source text default 'kasa'::text,
  payment_collected_at timestamp with time zone,
  payment_collected_by uuid,
  cashier_confirmed_at timestamp with time zone,
  cashier_confirmed_by uuid,
  cashier_note text
);

create table if not exists public.overtime_consents (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  staff_id uuid not null,
  consent_year integer not null,
  consented_at timestamp with time zone default now() not null,
  note text
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

create table if not exists public.payment_providers (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  name text not null,
  method text not null,
  commission_rate numeric(5,2) default 0 not null,
  settlement_days integer default 1 not null,
  is_default boolean default false not null,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.personel_hesaplari (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  restaurant_id uuid not null,
  staff_id uuid,
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

create table if not exists public.product_variants (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  menu_item_id uuid not null,
  name text not null,
  sale_price numeric(12,2) not null,
  is_default boolean default false not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.profiles (
  id uuid not null,
  restaurant_id uuid not null,
  full_name text,
  role text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.public_holidays (
  id uuid default gen_random_uuid() not null,
  holiday_date date not null,
  name text not null,
  kind text default 'resmi'::text not null
);

create table if not exists public.purchase_items (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  purchase_id uuid not null,
  ingredient_id uuid not null,
  quantity numeric(12,4) not null,
  unit_price numeric(12,4) not null,
  created_at timestamp with time zone default now() not null,
  remaining_quantity numeric(12,4) default 0 not null
);

create table if not exists public.purchase_requests (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  ingredient_id uuid not null,
  supplier_id uuid,
  suggested_qty numeric(12,4) not null,
  reason text,
  status text default 'bekliyor'::text not null,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  approved_by_staff_id uuid,
  purchase_id uuid,
  target_days integer
);

create table if not exists public.purchases (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  supplier_name text,
  purchased_at timestamp with time zone default now() not null,
  total_amount numeric(12,2) default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  supplier_id uuid,
  source text default 'manuel'::text not null,
  invoice_ref text
);

create table if not exists public.recipe_items (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  menu_item_id uuid not null,
  ingredient_id uuid not null,
  quantity numeric(12,4) not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
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
  seated_order_id uuid,
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
  pr_id uuid,
  alan_personel_id uuid,
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
  default_vat_rate numeric(4,1) default 10 not null,
  default_menu_design text default 'listeli'::text not null,
  default_variable_cost_per_cover numeric(12,2) default 0 not null,
  default_fixed_cost_share_percent numeric(5,2) default 0 not null,
  role_visibility jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  fixed_cost_days_override integer,
  staff_comparison_enabled boolean default false not null,
  sgk_employer_rate numeric(5,2) default 0 not null,
  opening_hours jsonb,
  background_choice text,
  purchase_approval_roles text[] default '{yonetici}'::text[] not null,
  kvkk_notice text,
  kvkk_retention_days integer default 365 not null,
  target_labor_percent numeric(5,2) default 30 not null,
  table_flow_mode text default 'basit'::text not null,
  tip_points jsonb default '{}'::jsonb not null,
  kitchen_tip_percent numeric(5,2) default 0 not null,
  course_sequencing_enabled boolean default false not null,
  evening_start_hour integer default 17 not null,
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
  assigned_staff_id uuid,
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

create table if not exists public.settlement_receipts (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  provider_id uuid not null,
  received_date date not null,
  amount numeric(12,2) not null,
  note text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.staff_leaves (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  staff_id uuid not null,
  leave_type text default 'yillik'::text not null,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.staff_members (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  full_name text not null,
  pin_hash text not null,
  role text not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  gross_salary numeric(10,2) default 0 not null,
  hourly_rate numeric(10,2),
  hire_date date,
  annual_leave_override_days integer,
  on_break boolean default false not null,
  break_started_at timestamp with time zone
);

create table if not exists public.staff_shifts (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  staff_id uuid not null,
  started_at timestamp with time zone default now() not null,
  ended_at timestamp with time zone,
  note text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.stations (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  name text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.stock_groups (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  name text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.stock_movements (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  ingredient_id uuid not null,
  movement_type text not null,
  quantity numeric(12,4) not null,
  unit_cost numeric(12,4) default 0 not null,
  source_type text,
  source_id uuid,
  occurred_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.suppliers (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  name text not null,
  contact text,
  delivery_frequency text default 'weekly'::text not null,
  delivery_days integer[] default '{}'::integer[] not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.table_status_events (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  table_id uuid not null,
  from_status text,
  to_status text not null,
  changed_at timestamp with time zone default now() not null
);

create table if not exists public.valet_entries (
  id uuid default gen_random_uuid() not null,
  restaurant_id uuid not null,
  guest_name text not null,
  plate_no text not null,
  status text default 'bekliyor'::text not null,
  matched_table_id uuid,
  parked_at timestamp with time zone default now() not null,
  called_at timestamp with time zone,
  delivered_at timestamp with time zone
);
