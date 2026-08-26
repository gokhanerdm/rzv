"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cikisYap as rzvCikisYap } from "@/lib/supabase/reservationAccount";
import { rolAdi } from "@/lib/roller";
import { dugmeAna } from "@/lib/olcu";

// PROFİLİM — Ekip uygulamasının altında, kişinin kendi kaydı (Gökhan, 2026-08-26: "mobil
// kullanımda profilim diye bir sekme yok, onu koyalım ekip uygulamasına").
//
// Şimdilik SADECE GÖSTERİR ("şimdilik standart bir profilim sayfası yapalım") — düzenleme
// sonraki iş. Çıkış düğmesi buraya indi: işletme adı satırındaki çıkış simgesi kalktı,
// yerini profil simgesi aldı.
//
// İki tür kullanıcı da bu sayfayı açabilir: Ekip'ten giren personel (rolü ve bağlı olduğu
// işletme yazar) ve web'den giren işletme sahibi (rol satırı çıkmaz).

type Profil = {
  adSoyad: string;
  eposta: string;
  telefon: string;
  rol: string | null;
  isletme: string;
};

export default function ProfilimPage() {
  const router = useRouter();
  const [profil, setProfil] = useState<Profil | null | undefined>(undefined); // undefined = yükleniyor
  const [err, setErr] = useState<string | null>(null);

  const oku = useCallback(async () => {
    // Oturum yoksa profil de yok — giriş ekranına gönderiyoruz.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/ekip"); return; }

    const eposta = session.user.email ?? "";
    // Ad ve telefon kayıt sırasında hesabın üstüne yazılıyor; personel kaydı varsa oradaki
    // daha günceldir, onu tercih ediyoruz.
    const meta = (session.user.user_metadata ?? {}) as { ad_soyad?: string; telefon?: string };

    try {
      const [{ data: rol }, { data: hesap }] = await Promise.all([
        supabase.rpc("personel_rolum"),
        supabase.from("personel_hesaplari")
          .select("ad_soyad, telefon, rol")
          .eq("user_id", session.user.id)
          .limit(1),
      ]);
      const r = (rol as { isletme_adi: string; rol: string; durum: string }[] | null)?.[0] ?? null;
      const h = (hesap as { ad_soyad: string; telefon: string | null; rol: string }[] | null)?.[0] ?? null;

      setProfil({
        adSoyad: h?.ad_soyad || meta.ad_soyad || "—",
        eposta,
        telefon: h?.telefon || meta.telefon || "—",
        rol: r?.rol ?? h?.rol ?? null,
        isletme: r?.isletme_adi ?? "—",
      });
    } catch {
      setErr("Bilgiler yüklenemedi. İnternetini kontrol edip tekrar dene.");
      setProfil({ adSoyad: meta.ad_soyad || "—", eposta, telefon: meta.telefon || "—", rol: null, isletme: "—" });
    }
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => { oku(); }, 0);
    return () => clearTimeout(t);
  }, [oku]);

  return (
    <div style={sayfa}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Geri"
          style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", color: "var(--muted)" }}
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-green)" }}>Profilim</div>
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: "10px 13px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{err}</div>
      )}

      {!profil ? (
        <div style={{ color: "var(--muted)", fontSize: 13.5, textAlign: "center", paddingTop: 40 }}>Yükleniyor…</div>
      ) : (
        <>
          <div style={kart}>
            <Satir ad="Ad soyad" deger={profil.adSoyad} />
            <Satir ad="E-posta" deger={profil.eposta} />
            <Satir ad="Telefon" deger={profil.telefon} />
            {profil.rol && <Satir ad="Rol" deger={rolAdi(profil.rol)} />}
            <Satir ad="İşletme" deger={profil.isletme} son />
          </div>

          <button onClick={() => rzvCikisYap()} style={{ ...dugmeAna, marginTop: 18 }}>Çıkış yap</button>
        </>
      )}
    </div>
  );
}

/** Etiket solda, değer sağda — satır tabanlı liste kuralı (bkz. ekran kuralları). */
function Satir({ ad, deger, son }: { ad: string; deger: string; son?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "9px 0", borderBottom: son ? "none" : "1px solid var(--line)",
    }}>
      <span style={{ fontSize: 12.5, color: "var(--muted)", flexShrink: 0 }}>{ad}</span>
      <span style={{ fontSize: 14, color: "var(--ink)", textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{deger}</span>
    </div>
  );
}

// Ekip uygulamasının ekranlarıyla aynı çerçeve — dar, ortalanmış, telefon önceliğli.
const sayfa: React.CSSProperties = {
  background: "var(--canvas)", minHeight: "100vh", padding: "34px 18px 40px",
  maxWidth: 420, margin: "0 auto", boxSizing: "border-box",
};
const kart: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16,
  padding: "4px 16px", display: "flex", flexDirection: "column",
};
