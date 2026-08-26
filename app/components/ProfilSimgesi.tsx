"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

// PROFİL SİMGESİ — simgenin altında giriş yapanın adı (Gökhan, 2026-08-26: "profil
// işaretinin altında kullanıcının adı yazsın", "ad yeterli").
//
// SOYAD YAZILMIYOR: satırın sağ ucunda duruyor, "Mehmet Karaosmanoğlu" gibi bir ad satırı
// şişirip telefonda taşırıyordu. İlk kelime alınıyor.
//
// Üç yerde birden var — telefondaki işletme adı satırı, masaüstü üst barı ve sol menünün
// altı. Aynı iş üç kere yazılmasın diye tek parça (bkz. ekran kuralları: "aynı iş iki yerde
// yazılmaz").

// Ad oturum boyunca değişmiyor; her ekran geçişinde yeniden sorulmasın diye bir kere okunup
// burada tutuluyor. Çıkışta sayfa baştan yükleniyor, önbellek de onunla sıfırlanıyor.
let onbellek: string | null = null;

export function useKullaniciAdi() {
  const [ad, setAd] = useState(onbellek ?? "");
  useEffect(() => {
    if (onbellek !== null) return;
    let acik = true;
    (async () => {
      let tam = "";
      try {
        // Ad kayıt sırasında hesabın üstüne yazılıyor — internete çıkmadan elimizde.
        const { data: { session } } = await supabase.auth.getSession();
        tam = ((session?.user.user_metadata ?? {}) as { ad_soyad?: string }).ad_soyad ?? "";
        // Eski hesaplarda o alan boş olabiliyor; o zaman personel kaydından okunuyor.
        if (!tam) {
          const { data } = await supabase.rpc("personel_rolum");
          tam = (data as { ad_soyad?: string }[] | null)?.[0]?.ad_soyad ?? "";
        }
      } catch { /* ad okunamadıysa simge tek başına durur, ekran çalışmaya devam eder */ }
      const ilk = tam.trim().split(/\s+/)[0] ?? "";
      onbellek = ilk;
      if (acik) setAd(ilk);
    })();
    return () => { acik = false; };
  }, []);
  return ad;
}

/** dikey=true: dar sol menü (40px) — yan dolgu kısılıyor, yoksa kenardan taşıyor. */
export default function ProfilSimgesi({ dikey }: { dikey?: boolean }) {
  const ad = useKullaniciAdi();
  return (
    <Link
      href="/ekip/profil" aria-label="Profilim" title="Profilim"
      style={{
        all: "unset", cursor: "pointer", display: "flex", flexDirection: "column",
        alignItems: "center", gap: 1, padding: dikey ? 4 : 6, borderRadius: 8,
        color: "var(--muted)", flexShrink: 0,
      }}
    >
      <User size={19} />
      {ad && (
        <span style={{
          fontSize: 10, lineHeight: 1.1, maxWidth: 56,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {ad}
        </span>
      )}
    </Link>
  );
}
