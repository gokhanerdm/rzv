"use client";

// Rezervasyon programının ortak kabuğu. Görsel bir şey eklemiyor — sayfaların kendi
// düzenine dokunmuyor.
//
// TEK OTURUM BEKÇİSİ ŞİMDİLİK KAPALI (Gökhan, 2026-08-30: "aynı zamanda web uygulamasına
// ve mobile de girmem gerekli, o engeli şu an kaldır"). Kural 20 Ağustos'ta konmuştu: bir
// profil aynı anda tek yerde açık kalsın, son giren kazansın. Bekçinin kendisi ve
// veritabanındaki oturum tablosu duruyor; geri açmak için aşağıdaki iki satırı geri almak
// yeterli.
// import TekOturum from "../components/TekOturum";

export default function RezervasyonLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* <TekOturum /> */}
      {children}
    </>
  );
}
