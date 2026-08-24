-- RZV veritabani yapisi — 5/6: TETIKLEYICILER + VERI KILIDI (RLS)

CREATE TRIGGER trg_restaurant_tables_status BEFORE UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION trg_log_table_status_change();
CREATE TRIGGER trg_valet_notify AFTER UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION trg_notify_valet_on_bill_requested();

alter table public.aktif_oturumlar enable row level security;
alter table public.business_expenses enable row level security;
alter table public.cash_movements enable row level security;
alter table public.companies enable row level security;
alter table public.concept_categories enable row level security;
alter table public.concept_ingredients enable row level security;
alter table public.concept_items enable row level security;
alter table public.concept_recipe_items enable row level security;
alter table public.concept_templates enable row level security;
alter table public.day_closures enable row level security;
alter table public.dining_areas enable row level security;
alter table public.dolu_gun_talepleri enable row level security;
alter table public.efatura_connections enable row level security;
alter table public.fix_menuler enable row level security;
alter table public.ingredients enable row level security;
alter table public.inventory_count_items enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.katilim_kodlari enable row level security;
alter table public.kisi_kart_baglantilari enable row level security;
alter table public.kisi_kartlari enable row level security;
alter table public.masa_garson enable row level security;
alter table public.masa_gruplari enable row level security;
alter table public.masa_olculeri enable row level security;
alter table public.masa_paketleri enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_item_modifier_groups enable row level security;
alter table public.menu_items enable row level security;
alter table public.mesajlar enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifiers enable row level security;
alter table public.not_kurallari enable row level security;
alter table public.order_discounts enable row level security;
alter table public.order_item_modifiers enable row level security;
alter table public.order_items enable row level security;
alter table public.order_payments enable row level security;
alter table public.orders enable row level security;
alter table public.overtime_consents enable row level security;
alter table public.ozel_gece_fiyatlari enable row level security;
alter table public.ozel_geceler enable row level security;
alter table public.payment_providers enable row level security;
alter table public.personel_hesaplari enable row level security;
alter table public.platform_yoneticileri enable row level security;
alter table public.posta_masalari enable row level security;
alter table public.posta_personelleri enable row level security;
alter table public.postalar enable row level security;
alter table public.product_variants enable row level security;
alter table public.profiles enable row level security;
alter table public.public_holidays enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchases enable row level security;
alter table public.recipe_items enable row level security;
alter table public.reservation_tables enable row level security;
alter table public.reservations enable row level security;
alter table public.restaurant_photos enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.restaurants enable row level security;
alter table public.rezervasyon_etiketleri enable row level security;
alter table public.salon_ogeleri enable row level security;
alter table public.settlement_receipts enable row level security;
alter table public.staff_leaves enable row level security;
alter table public.staff_members enable row level security;
alter table public.staff_shifts enable row level security;
alter table public.stations enable row level security;
alter table public.stock_groups enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.table_status_events enable row level security;
alter table public.valet_entries enable row level security;

-- KURALLAR
create policy "kendi_oturumum_gunceller" on public.aktif_oturumlar as PERMISSIVE for UPDATE to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "kendi_oturumum_okur" on public.aktif_oturumlar as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy "kendi_oturumum_yazar" on public.aktif_oturumlar as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));
create policy "isletme_erisimi" on public.business_expenses as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.cash_movements as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.companies as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (owner_user_id = auth.uid()))) with check ((yonetici_mi() OR (owner_user_id = auth.uid())));
create policy "ortak_okuma" on public.concept_categories as PERMISSIVE for SELECT to authenticated using (true);
create policy "yonetici_yazma" on public.concept_categories as PERMISSIVE for ALL to authenticated using (yonetici_mi()) with check (yonetici_mi());
create policy "ortak_okuma" on public.concept_ingredients as PERMISSIVE for SELECT to authenticated using (true);
create policy "yonetici_yazma" on public.concept_ingredients as PERMISSIVE for ALL to authenticated using (yonetici_mi()) with check (yonetici_mi());
create policy "ortak_okuma" on public.concept_items as PERMISSIVE for SELECT to authenticated using (true);
create policy "yonetici_yazma" on public.concept_items as PERMISSIVE for ALL to authenticated using (yonetici_mi()) with check (yonetici_mi());
create policy "ortak_okuma" on public.concept_recipe_items as PERMISSIVE for SELECT to authenticated using (true);
create policy "yonetici_yazma" on public.concept_recipe_items as PERMISSIVE for ALL to authenticated using (yonetici_mi()) with check (yonetici_mi());
create policy "ortak_okuma" on public.concept_templates as PERMISSIVE for SELECT to authenticated using (true);
create policy "yonetici_yazma" on public.concept_templates as PERMISSIVE for ALL to authenticated using (yonetici_mi()) with check (yonetici_mi());
create policy "isletme_erisimi" on public.day_closures as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.dining_areas as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.dolu_gun_talepleri as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.efatura_connections as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.fix_menuler as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.ingredients as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.inventory_count_items as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.inventory_counts as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.katilim_kodlari as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT r.id
   FROM restaurants r
  WHERE ((r.owner_user_id = auth.uid()) AND (r.deleted_at IS NULL)))))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT r.id
   FROM restaurants r
  WHERE ((r.owner_user_id = auth.uid()) AND (r.deleted_at IS NULL))))));
create policy "isletme_erisimi" on public.kisi_kart_baglantilari as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (EXISTS ( SELECT 1
   FROM kisi_kartlari k
  WHERE ((k.id = kisi_kart_baglantilari.kisi_karti_id) AND (k.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))))))) with check ((yonetici_mi() OR (EXISTS ( SELECT 1
   FROM kisi_kartlari k
  WHERE ((k.id = kisi_kart_baglantilari.kisi_karti_id) AND (k.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))))));
create policy "isletme_erisimi" on public.kisi_kartlari as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.masa_garson as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.masa_gruplari as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.masa_olculeri as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.masa_paketleri as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.menu_categories as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.menu_item_modifier_groups as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.menu_items as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "mesajlar_kendi_isletmesi" on public.mesajlar as PERMISSIVE for ALL to public using ((restaurant_id IN ( SELECT restaurants.id
   FROM restaurants
  WHERE (restaurants.owner_user_id = auth.uid())))) with check ((restaurant_id IN ( SELECT restaurants.id
   FROM restaurants
  WHERE (restaurants.owner_user_id = auth.uid()))));
create policy "isletme_erisimi" on public.modifier_groups as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.modifiers as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.not_kurallari as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.order_discounts as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.order_item_modifiers as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.order_items as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.order_payments as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.orders as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.overtime_consents as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.ozel_gece_fiyatlari as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM ozel_geceler g
  WHERE ((g.id = ozel_gece_fiyatlari.ozel_gece_id) AND (yonetici_mi() OR (g.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))))))) with check ((EXISTS ( SELECT 1
   FROM ozel_geceler g
  WHERE ((g.id = ozel_gece_fiyatlari.ozel_gece_id) AND (yonetici_mi() OR (g.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))))));
create policy "isletme_erisimi" on public.ozel_geceler as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.payment_providers as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_yonetir" on public.personel_hesaplari as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT r.id
   FROM restaurants r
  WHERE ((r.owner_user_id = auth.uid()) AND (r.deleted_at IS NULL)))))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT r.id
   FROM restaurants r
  WHERE ((r.owner_user_id = auth.uid()) AND (r.deleted_at IS NULL))))));
create policy "kendi_kaydim" on public.personel_hesaplari as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy "isletme_erisimi" on public.posta_masalari as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM postalar p
  WHERE ((p.id = posta_masalari.posta_id) AND (yonetici_mi() OR (p.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))))))) with check ((EXISTS ( SELECT 1
   FROM postalar p
  WHERE ((p.id = posta_masalari.posta_id) AND (yonetici_mi() OR (p.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))))));
create policy "isletme_erisimi" on public.posta_personelleri as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM postalar p
  WHERE ((p.id = posta_personelleri.posta_id) AND (yonetici_mi() OR (p.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))))))) with check ((EXISTS ( SELECT 1
   FROM postalar p
  WHERE ((p.id = posta_personelleri.posta_id) AND (yonetici_mi() OR (p.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))))));
create policy "isletme_erisimi" on public.postalar as PERMISSIVE for ALL to public using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.product_variants as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.profiles as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (id = auth.uid()) OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (id = auth.uid()) OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "ortak_okuma" on public.public_holidays as PERMISSIVE for SELECT to authenticated using (true);
create policy "yonetici_yazma" on public.public_holidays as PERMISSIVE for ALL to authenticated using (yonetici_mi()) with check (yonetici_mi());
create policy "isletme_erisimi" on public.purchase_items as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.purchase_requests as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.purchases as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.recipe_items as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.reservation_tables as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (EXISTS ( SELECT 1
   FROM reservations v
  WHERE ((v.id = reservation_tables.reservation_id) AND (v.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))))))) with check ((yonetici_mi() OR (EXISTS ( SELECT 1
   FROM reservations v
  WHERE ((v.id = reservation_tables.reservation_id) AND (v.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))))));
create policy "isletme_erisimi" on public.reservations as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "restaurant_photos_erisimi" on public.restaurant_photos as PERMISSIVE for ALL to public using ((restaurant_id IN ( SELECT restaurants.id
   FROM restaurants))) with check ((restaurant_id IN ( SELECT restaurants.id
   FROM restaurants)));
create policy "isletme_erisimi" on public.restaurant_settings as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.restaurant_tables as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.restaurants as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (owner_user_id = auth.uid()) OR (id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (owner_user_id = auth.uid())));
create policy "isletme_erisimi" on public.rezervasyon_etiketleri as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.salon_ogeleri as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.settlement_receipts as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.staff_leaves as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.staff_members as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.staff_shifts as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.stations as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.stock_groups as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.stock_movements as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.suppliers as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.table_status_events as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.valet_entries as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
