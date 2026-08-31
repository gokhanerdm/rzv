"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cikisYap as rzvCikisYap } from "@/lib/supabase/reservationAccount";
import { rolAdi } from "@/lib/roller";
import { dugmeAna, dugmeSilik } from "@/lib/olcu";
import { isletmeRozetiUnut } from "@/app/components/IsletmeRozeti";

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

/** Isletme hesabinin kendi kaydi - logo bolumu sadece bu doluyken ciziliyor. */
type Isletmem = { id: string; logo: string | null; koseli: boolean };

export default function ProfilimPage() {
  const router = useRouter();
  const [profil, setProfil] = useState<Profil | null | undefined>(undefined); // undefined = yükleniyor
  const [err, setErr] = useState<string | null>(null);
  // LOGO (Gökhan, 2026-08-31: "işletme logosunu koyduğunda isminin yanındaki rozet onun
  // logosu olacak") — yükleme ve köşeli/yuvarlak seçimi işletme profilinde.
  const [isletmem, setIsletmem] = useState<Isletmem | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

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

      // İŞLETME HESABI (Gökhan, 2026-08-30: "işletmeye tekrar iş yaptırmayalım, okusun ve
      // doldursun"). Personel kaydı olmayan kullanıcı işletmenin kendisidir; adı, telefonu ve
      // işletme adı kurulumda zaten girilmişti — satırlar oradan doluyor, yeniden sorulmuyor.
      let isletme: { name: string; contact_name: string | null; phone: string | null } | null = null;
      if (!h) {
        const { data: iData } = await supabase.from("restaurants")
          .select("id, name, contact_name, phone, logo_url, logo_koseli")
          .eq("owner_user_id", session.user.id).is("deleted_at", null).limit(1);
        const kayit = (iData as {
          id: string; name: string; contact_name: string | null; phone: string | null;
          logo_url: string | null; logo_koseli: boolean | null;
        }[] | null)?.[0] ?? null;
        isletme = kayit;
        setIsletmem(kayit ? { id: kayit.id, logo: kayit.logo_url, koseli: kayit.logo_koseli ?? true } : null);
      }

      setProfil({
        adSoyad: h?.ad_soyad || meta.ad_soyad || isletme?.contact_name || "—",
        eposta,
        telefon: h?.telefon || meta.telefon || isletme?.phone || "—",
        rol: r?.rol ?? h?.rol ?? null,
        isletme: r?.isletme_adi ?? isletme?.name ?? "—",
      });
    } catch {
      setErr("Bilgiler yüklenemedi. İnternetini kontrol edip tekrar dene.");
      setProfil({ adSoyad: meta.ad_soyad || "—", eposta, telefon: meta.telefon || "—", rol: null, isletme: "—" });
    }
  }, [router]);

  /** Seçilen görsel kovaya yükleniyor, adresi işletme kaydına yazılıyor. */
  const logoYukle = async (dosya: File) => {
    if (!isletmem || logoBusy) return;
    setLogoBusy(true);
    setErr(null);
    try {
      const uzanti = dosya.name.split(".").pop()?.toLocaleLowerCase("tr") || "png";
      const yol = `${isletmem.id}/logo-${Date.now()}.${uzanti}`;
      const { error: yuklemeHatasi } = await supabase.storage.from("isletme").upload(yol, dosya, { contentType: dosya.type });
      if (yuklemeHatasi) throw yuklemeHatasi;
      const adres = supabase.storage.from("isletme").getPublicUrl(yol).data.publicUrl;
      const { error: yazmaHatasi } = await supabase.from("restaurants").update({ logo_url: adres }).eq("id", isletmem.id);
      if (yazmaHatasi) throw yazmaHatasi;
      setIsletmem({ ...isletmem, logo: adres });
      isletmeRozetiUnut(isletmem.id);
    } catch {
      setErr("Logo yüklenemedi. İnternetini kontrol edip tekrar dene.");
    }
    setLogoBusy(false);
  };

  const logoKaldir = async () => {
    if (!isletmem || logoBusy) return;
    setLogoBusy(true);
    setErr(null);
    const { error } = await supabase.from("restaurants").update({ logo_url: null }).eq("id", isletmem.id);
    if (error) setErr("Logo kaldırılamadı. Tekrar dene.");
    else { setIsletmem({ ...isletmem, logo: null }); isletmeRozetiUnut(isletmem.id); }
    setLogoBusy(false);
  };

  const sekliSec = async (koseli: boolean) => {
    if (!isletmem || isletmem.koseli === koseli) return;
    setIsletmem({ ...isletmem, koseli });
    isletmeRozetiUnut(isletmem.id);
    const { error } = await supabase.from("restaurants").update({ logo_koseli: koseli }).eq("id", isletmem.id);
    if (error) setErr("Seçim kaydedilemedi. Tekrar dene.");
  };

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

          {/* LOGO — sadece işletme hesabında. Yüklenmemişse rozet işletme adının baş
              harfini gösteriyor (Gökhan, 2026-08-31). */}
          {isletmem && (
            <div style={{ ...kart, marginTop: 14, padding: 16, gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 52, height: 52, flexShrink: 0, borderRadius: isletmem.koseli ? 10 : "50%",
                  overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--brand)", color: "#fff", fontWeight: 700, fontSize: 23,
                }}>
                  {isletmem.logo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={isletmem.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : profil.isletme.trim().charAt(0).toLocaleUpperCase("tr")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                  <label style={{ ...dugmeSilik, display: "inline-flex", justifyContent: "center", opacity: logoBusy ? 0.5 : 1 }}>
                    {logoBusy ? "Yükleniyor…" : isletmem.logo ? "Logoyu değiştir" : "Logo yükle"}
                    <input
                      type="file" accept="image/*" disabled={logoBusy}
                      onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ""; if (d) logoYukle(d); }}
                      style={{ display: "none" }}
                    />
                  </label>
                  {isletmem.logo && (
                    <button onClick={logoKaldir} disabled={logoBusy} style={{ ...dugmeSilik, justifyContent: "center", color: "var(--danger)", opacity: logoBusy ? 0.5 : 1 }}>
                      Logoyu kaldır
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {([[true, "Köşeli"], [false, "Yuvarlak"]] as const).map(([k, ad]) => (
                  <button
                    key={ad} onClick={() => sekliSec(k)}
                    style={{
                      ...dugmeSilik, flex: 1, justifyContent: "center", display: "flex",
                      borderColor: isletmem.koseli === k ? "var(--brand-strong)" : "var(--line-2)",
                      color: isletmem.koseli === k ? "var(--brand-strong)" : "var(--ink)",
                      background: isletmem.koseli === k ? "var(--recede)" : "var(--card)",
                    }}
                  >
                    {ad}
                  </button>
                ))}
              </div>
            </div>
          )}

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
