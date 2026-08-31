"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyReservationRestaurantId } from "@/lib/supabase/reservationAccount";
import PostaPaneli from "./PostaPaneli";
import RezervasyonAltNav, { ALT_NAV_YUKSEKLIK, useYatayMobil } from "../../components/RezervasyonAltNav";
import { MenuBaslik, MenuNav } from "../../components/RezervasyonMenu";

// POSTA EKRANI — telefonda nav'daki ayrı sayfa (Gökhan, 2026-08-17: "mobilde ayrı bir ekran
// olacak, nav'da duracak"). Masaüstünde aynı panel Salon ekranının içinde bir kip olarak
// çıkıyor; ikisi de aynı bileşeni kullanıyor.
//
// Yetki ayrı değil: salonu gören postayı da görür (Gökhan).

export default function PostaSayfasi() {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const yatayMobil = useYatayMobil();

  useEffect(() => {
    let acik = true;
    getMyReservationRestaurantId().then((id) => {
      if (!acik) return;
      if (!id) { router.replace("/rezervasyon/giris"); return; }
      setRestaurantId(id);
    });
    return () => { acik = false; };
  }, [router]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Sol menüdeki düğme kutusu — panel düğmelerini buraya çiziyor (Gökhan, 2026-08-31).
  const [dugmeYuva, setDugmeYuva] = useState<HTMLDivElement | null>(null);

  if (!restaurantId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 13.5, color: "var(--muted)" }}>Yükleniyor…</div>
      </div>
    );
  }

  return (
    <div className="posta-sayfa" style={{
      background: "var(--canvas)", padding: "20px 24px",
      paddingBottom: yatayMobil ? 10 : (isMobile ? ALT_NAV_YUKSEKLIK + 12 : 24),
      height: isMobile ? undefined : "calc(100vh - 4px)",
      display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden",
      // İki parmak sayfayı değil, sadece planı yakınlaştırsın (Gökhan, 2026-08-17).
      touchAction: isMobile ? "pan-x pan-y" : undefined,
    }}>
      {/* SAYFA YÜKSEKLİĞİ — kart nav'ın altına girmesin (Gökhan, 2026-08-17). Salon
          sayfasındaki ile aynı: telefon tarayıcısında 100vh adres çubuğunu saymadığı için
          dvh de yazılıyor, tarayıcı hangisini anlıyorsa onu kullanıyor. */}
      {isMobile && <style>{`
        .posta-sayfa { height: calc(100vh - 4px); height: calc(100svh - 4px); height: calc(100dvh - 4px); }
      `}</style>}
      {/* İşletme adı ve sayfa adı posta ekranında yok (Gökhan, 2026-08-17) — ekranın tepesi
          salon planına kalıyor. */}
      <div style={{ display: "flex", gap: isMobile ? 0 : 12, flex: 1, minHeight: 0 }}>
        {!isMobile && (
          <aside style={{
            width: 226, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
            border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)",
            padding: 12, boxSizing: "border-box", overflowY: "auto", overflowX: "hidden",
          }}>
            {/* Standart sol menü (Gökhan, 2026-08-31): rozet + işletme adı + sayfa adı,
                çizgi, geçiş simgeleri. Eskiden burada sadece simgeler vardı — 17 Ağustos'ta
                "ekranın tepesi salon planına kalsın" diye başlık çıkarılmıştı. */}
            <MenuBaslik restaurantId={restaurantId} sayfaBaslik="Posta" />
            <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />
            <MenuNav />
            <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />
            {/* "Posta kur" ve tam ekran düğmeleri planın üstünden buraya alındı
                (Gökhan, 2026-08-31). Düğmeleri panelin kendisi çiziyor. */}
            <div ref={setDugmeYuva} style={{ display: "flex", flexDirection: "column", gap: 6 }} />
          </aside>
        )}

        {/* Beyaz kart artık panelin içinde: salon adı ve oklar kartın üstünde duruyor
            (Gökhan, 2026-08-17). */}
        <div style={{
          flex: 1, minWidth: 320, display: "flex", flexDirection: "column", minHeight: 0,
        }}>
          {/* Telefondaki Posta salon ekranı artık sadece gösteriyor — seçme, listeleme ve
              garson atama Posta listesine taşındı (Gökhan, 2026-08-18). */}
          <PostaPaneli restaurantId={restaurantId} atamaVar={false} dugmeHedefi={isMobile ? null : dugmeYuva} />
        </div>
      </div>

      <RezervasyonAltNav />
    </div>
  );
}
