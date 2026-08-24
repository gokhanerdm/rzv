-- RZV veritabani yapisi — 6/6: DEPOLAMA KOVASI
-- Isletme fotograflari/logosu bu kovada duruyor. Herkese acik okuma, giris yapana yazma/silme.

insert into storage.buckets (id, name, public)
values ('isletme', 'isletme', true)
on conflict (id) do nothing;

create policy "isletme_foto_oku" on storage.objects for select to public using ((bucket_id = 'isletme'::text));
create policy "isletme_foto_yaz" on storage.objects for insert to authenticated with check ((bucket_id = 'isletme'::text));
create policy "isletme_foto_sil" on storage.objects for delete to authenticated using ((bucket_id = 'isletme'::text));
