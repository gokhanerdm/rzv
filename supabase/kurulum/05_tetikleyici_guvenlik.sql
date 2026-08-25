-- RZV veritabani yapisi — 5/6: TETIKLEYICILER + VERI KILIDI (RLS)

alter table public.aktif_oturumlar enable row level security;
alter table public.companies enable row level security;
alter table public.dining_areas enable row level security;
alter table public.dolu_gun_talepleri enable row level security;
alter table public.fix_menuler enable row level security;
alter table public.katilim_kodlari enable row level security;
alter table public.kisi_kart_baglantilari enable row level security;
alter table public.kisi_kartlari enable row level security;
alter table public.masa_garson enable row level security;
alter table public.masa_gruplari enable row level security;
alter table public.masa_olculeri enable row level security;
alter table public.masa_paketleri enable row level security;
alter table public.mesajlar enable row level security;
alter table public.not_kurallari enable row level security;
alter table public.ozel_gece_fiyatlari enable row level security;
alter table public.ozel_geceler enable row level security;
alter table public.personel_hesaplari enable row level security;
alter table public.platform_yoneticileri enable row level security;
alter table public.posta_masalari enable row level security;
alter table public.posta_personelleri enable row level security;
alter table public.postalar enable row level security;
alter table public.reservation_tables enable row level security;
alter table public.reservations enable row level security;
alter table public.restaurant_photos enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.restaurants enable row level security;
alter table public.rezervasyon_etiketleri enable row level security;
alter table public.salon_ogeleri enable row level security;
create policy "kendi_oturumum_gunceller" on public.aktif_oturumlar as PERMISSIVE for UPDATE to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "kendi_oturumum_okur" on public.aktif_oturumlar as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy "kendi_oturumum_yazar" on public.aktif_oturumlar as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));
create policy "isletme_erisimi" on public.companies as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (owner_user_id = auth.uid()))) with check ((yonetici_mi() OR (owner_user_id = auth.uid())));
create policy "isletme_erisimi" on public.dining_areas as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.dolu_gun_talepleri as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.fix_menuler as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
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
create policy "mesajlar_kendi_isletmesi" on public.mesajlar as PERMISSIVE for ALL to public using ((restaurant_id IN ( SELECT restaurants.id
   FROM restaurants
  WHERE (restaurants.owner_user_id = auth.uid())))) with check ((restaurant_id IN ( SELECT restaurants.id
   FROM restaurants
  WHERE (restaurants.owner_user_id = auth.uid()))));
create policy "isletme_erisimi" on public.not_kurallari as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
create policy "isletme_erisimi" on public.ozel_gece_fiyatlari as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM ozel_geceler g
  WHERE ((g.id = ozel_gece_fiyatlari.ozel_gece_id) AND (yonetici_mi() OR (g.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))))))) with check ((EXISTS ( SELECT 1
   FROM ozel_geceler g
  WHERE ((g.id = ozel_gece_fiyatlari.ozel_gece_id) AND (yonetici_mi() OR (g.restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))))));
create policy "isletme_erisimi" on public.ozel_geceler as PERMISSIVE for ALL to authenticated using ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar)))) with check ((yonetici_mi() OR (restaurant_id IN ( SELECT erisilen_restoranlar() AS erisilen_restoranlar))));
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
