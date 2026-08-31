"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

// İŞLETME ROZETİ (Gökhan, 2026-08-31: "işletme logosunu koyduğunda isminin yanındaki rozet
// onun logosu olacak"). İşletme adının yanında duran rozet:
//   logo yüklenmişse  → logonun kendisi
//   yüklenmemişse     → işletme adının baş harfi
// Şekli işletme profilinden seçiliyor; varsayılan köşeli.
//
// Simge satırındaki RZV rozeti bundan ayrı, o değişmiyor (Gökhan: "işletme adının yanındaki").

type Bilgi = { logo: string | null; koseli: boolean; harf: string };

// Aynı bilgi her ekranda tekrar sorulmasın diye işletme başına bir kere okunuyor.
const onbellek = new Map<string, Bilgi>();

export function isletmeRozetiUnut(restaurantId: string) {
  onbellek.delete(restaurantId);
}

export default function IsletmeRozeti({ restaurantId, boy = 30 }: {
  restaurantId: string | null;
  /** Rozetin kenar uzunluğu — durduğu satıra göre değişiyor. */
  boy?: number;
}) {
  // Önbellekte varsa ilk çizimde zaten elimizde; yoksa okunuyor.
  const [bilgi, setBilgi] = useState<Bilgi | null>(restaurantId ? onbellek.get(restaurantId) ?? null : null);
  const hazir = restaurantId ? onbellek.get(restaurantId) ?? null : null;
  const gosterilen = bilgi ?? hazir;

  useEffect(() => {
    if (!restaurantId || onbellek.has(restaurantId)) return;
    let acik = true;
    supabase.from("restaurants").select("name, logo_url, logo_koseli").eq("id", restaurantId).maybeSingle()
      .then(({ data }) => {
        const r = data as { name: string | null; logo_url: string | null; logo_koseli: boolean | null } | null;
        const yeni: Bilgi = {
          logo: r?.logo_url ?? null,
          koseli: r?.logo_koseli ?? true,
          harf: (r?.name ?? "").trim().charAt(0).toLocaleUpperCase("tr"),
        };
        onbellek.set(restaurantId, yeni);
        if (acik) setBilgi(yeni);
      });
    return () => { acik = false; };
  }, [restaurantId]);

  const kose = gosterilen?.koseli === false ? "50%" : 10;
  const ortak: React.CSSProperties = {
    width: boy, height: boy, borderRadius: kose, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", textDecoration: "none",
  };

  return (
    <Link href="/rezervasyon" aria-label="Rezervasyonlar" title="Rezervasyonlar" style={ortak}>
      {gosterilen?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={gosterilen.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--brand)", color: "#fff", fontWeight: 700, fontSize: boy * 0.45,
        }}>
          {gosterilen?.harf ?? ""}
        </span>
      )}
    </Link>
  );
}
