@AGENTS.md

# RZV — Rezervasyon

Restoran, gece kulübü ve benzeri mekânlar için rezervasyon programı. Next.js (app router),
TypeScript, Supabase. Ekranlar `app/` altında her biri kendi klasöründe, ortak yardımcılar
`lib/`, veritabanı `supabase/migrations/`.

Bu program **restoran-aios**'un içindeki Rezervasyon modülünden ayrılarak kendi başına
satılacak bir ürün olarak çıkarıldı (2026-08-24). Kendi deposu, kendi Vercel adresi ve kendi
Supabase projesi var. Burada bitirildikten sonra AIOS'a da geri konacak — yani ikisi birden
yaşayacak. Bu yüzden rezervasyonun AIOS'a bağlanan hiçbir yeni bağı olmamalı.

Kod kopyalanırken AIOS'un stok, menü, sipariş, kasa ekranları da gelmişti; 2026-08-25'te
hepsi çıkarıldı — ekranlar da veritabanı da. Geriye rezervasyon, ekip ve misafirin gördüğü
online rezervasyon sayfası kaldı.

## Kimler girer
Web'e sadece işletme girer: RZV'den kaydolur, girişini oradan yapar. Personel web'e hiç
girmez — kendi hesabıyla **Ekip**'ten kaydolur, işletmenin verdiği katılım koduyla bağlanır,
mobil girişini de oradan yapar. İşletme de mobilde Ekip'i kullanır.

Bu yüzden personel tek yerde tutulur: `personel_hesaplari`. Eski programın ayrı personel
kaydı (`staff_members`) kaldırıldı; masaya garson atama, rezervasyonu alan kişi ve halkla
ilişkiler sorumlusu hep Ekip hesabına bağlıdır.

## Veri
Birden fazla tabloyu etkileyen ya da atomik olması gereken işlemler (masa atama, oturtma)
Supabase RPC ile yapılır, ayrı ayrı client insert'lerle değil.

Basit CRUD (salon/masa/grup ekle, sil, yeniden adlandır) doğrudan client insert/update ile
yapılır. Bu projenin kendi geleneği, düzeltilecek bir şey değil.

Silme, `deleted_at` alanını doldurmaktır. O alana sahip tabloda gerçek DELETE yok.

## Kontrol
Kodu değiştirdikten sonra iş sırasında `npx tsc --noEmit` çalıştır — hatayı ilerlerken yakala,
sona bırakma.

## Gönderim
İş bitip kontrol geçince o işin dosyaları commit'lenip push edilir, ayrıca sorulmaz. Dal
`main`, Vercel oradan yayına alıyor.

`git add -A` kullanılmaz — sadece o işe ait dosyalar tek tek eklenir.

`git push --force` kullanılmaz. Gönderim öncesi `git pull --rebase`.

Her iş kendi commit'i olur, başlığı ne değiştiğini Türkçe söyler.
