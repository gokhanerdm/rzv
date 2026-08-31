-- İşletme logosunun şekli (Gökhan, 2026-08-31: "şu an köşeli yap ama ayarlarda seçilebilsin,
-- yine işletme profilinde olsun o seçim"). Logo görselinin adresi zaten restaurants.logo_url
-- alanında duruyordu; eksik olan sadece şekil tercihiydi.
alter table restaurants add column if not exists logo_koseli boolean not null default true;

comment on column restaurants.logo_koseli is 'İşletme adının yanındaki rozet köşeli mi (true) yoksa yuvarlak mı (false) çizilsin.';
