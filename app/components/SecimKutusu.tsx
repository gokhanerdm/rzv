"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { kutu, kutuDar } from "@/lib/olcu";

// PROGRAMIN KENDİ SEÇİM KUTUSU (Gökhan, 2026-08-28: "kutular bizim olacak, tarayıcı
// kutularıyla ne işimiz var, her tarayıcıda farklı çalışıyor").
//
// Tarayıcının kendi açılır listesi işletim sisteminin penceresi: görünüşü her tarayıcıda
// başka, tuşları da bize kapalı. Bu yüzden program kendi listesini çiziyor — ölçüsü ve rengi
// ortak dosyadan geliyor, her ekranda aynı.
//
// TUŞ DÜZENİ (Gökhan, 2026-08-28: "tab sadece değiştirmek içindir, seçeneğine geldiğinde
// entera basarsın"):
//   Tab ile kutuya gelmek       → liste açılır
//   Tab / aşağı-yukarı okları   → seçenekler arasında dolaşır, sondan başa döner
//   Enter                       → seçer, kapatır ve SIRADAKİ kutuya geçer
//   Escape                      → seçmeden kapatır
//   Harf                        → o harfle başlayan seçeneğe atlar
//   Fareyle tıklamak            → seçer
//
// LİSTE KUTUNUN DIŞINA ÇİZİLİYOR (Gökhan, 2026-08-28: "akordion kutunun dışına açılsın, bu
// bütün sorunu çözer"). Pencerelerin içi kaydırmalı; liste pencerenin içinde çizilince alt
// kısmı kırpılıyor, seçenek değiştikçe pencere uzayıp yanında kaydırma çubuğu çıkıyordu.
// Artık sayfanın en üstüne çiziliyor, kutunun altına hizalanıyor; aşağıda yer yoksa yukarı
// açılıyor.

export type Secenek = { deger: string; ad: string };

export default function SecimKutusu({
  deger, secenekler, onDegis, dar, genislik, baslik, yerTutucu, style, id,
}: {
  deger: string;
  secenekler: Secenek[];
  onDegis: (v: string) => void;
  /** Sıkışık yerlerde küçük yazı — liste satırı, ayarların yan yana alanları. */
  dar?: boolean;
  genislik?: number | string;
  /** Fare üstüne gelince çıkan açıklama. */
  baslik?: string;
  /** Değer boşken görünen yazı. */
  yerTutucu?: string;
  style?: React.CSSProperties;
  id?: string;
}) {
  const [acik, setAcik] = useState(false);
  // Listenin ekrandaki yeri — kutu neredeyse oraya hizalanıyor (sayfanın en üstüne çiziliyor).
  const [yer, setYer] = useState<{ left: number; top?: number; bottom?: number; width: number; enBoy: number } | null>(null);
  const [imlec, setImlec] = useState(0);
  const dugmeRef = useRef<HTMLButtonElement | null>(null);
  const listeRef = useRef<HTMLDivElement | null>(null);
  const harfRef = useRef<{ metin: string; zaman: number }>({ metin: "", zaman: 0 });
  // Enter'dan sonra sıradaki kutuya geçilecek mi — kapanma sırasında okunuyor.
  const gecRef = useRef(false);
  // Bu açılış fareyle mi oldu — odak olayının kutuyu ikinci kez açmasını engelliyor.
  const fareRef = useRef(false);

  const secili = useMemo(() => secenekler.find((s) => s.deger === deger) ?? null, [secenekler, deger]);
  const taban = dar ? kutuDar : kutu;

  /** Listeyi kutunun altına (yer yoksa üstüne) hizalar. */
  const yeriHesapla = useCallback(() => {
    const el = dugmeRef.current;
    if (!el) return;
    const k = el.getBoundingClientRect();
    const altBosluk = window.innerHeight - k.bottom;
    const yukariAc = altBosluk < 180 && k.top > altBosluk;
    // LİSTE EKRANIN DIŞINA TAŞMAZ (Gökhan, 2026-08-30: "açılan liste ekranın altında
    // kayboluyor, kendi içinde yukarı aşağı oynasın"). Boy sabit 260'tı; altta o kadar yer
    // yoksa listenin sonu ekranın dışında kalıyordu. Artık kalan yere göre kısalıyor ve
    // seçenekler kendi içinde kayıyor.
    const bosluk = yukariAc ? k.top : altBosluk;
    setYer({
      left: k.left, width: k.width,
      enBoy: Math.min(260, Math.max(96, bosluk - 12)),
      ...(yukariAc ? { bottom: window.innerHeight - k.top + 4 } : { top: k.bottom + 4 }),
    });
  }, []);

  const ac = useCallback(() => {
    const i = secenekler.findIndex((s) => s.deger === deger);
    setImlec(i >= 0 ? i : 0);
    yeriHesapla();
    setAcik(true);
  }, [secenekler, deger, yeriHesapla]);

  /**
   * Sıradaki odaklanabilir öğeye geç — Enter'la seçtikten sonra (Gökhan, 2026-08-28).
   * Bir sonraki çizime bırakılıyor: liste henüz ekrandayken sıradakini aramak, listenin
   * kendi seçeneklerini bulup odağı oraya veriyordu; liste kapanınca da odak boşa düşüyordu.
   */
  const sonrakineGec = useCallback(() => {
    requestAnimationFrame(() => {
      const el = dugmeRef.current;
      if (!el) return;
      const liste = [...document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((x) => x.getClientRects().length > 0 && x.getAttribute("tabindex") !== "-1");
      const i = liste.indexOf(el);
      if (i >= 0 && liste[i + 1]) liste[i + 1].focus();
    });
  }, []);

  const sec = useCallback((i: number) => {
    const s = secenekler[i];
    if (s) onDegis(s.deger);
    setAcik(false);
    if (gecRef.current) { gecRef.current = false; sonrakineGec(); }
  }, [secenekler, onDegis, sonrakineGec]);

  // Dışarı tıklayınca kapanır.
  useEffect(() => {
    if (!acik) return;
    const disari = (e: PointerEvent) => {
      const h = e.target as Node;
      if (dugmeRef.current?.contains(h) || listeRef.current?.contains(h)) return;
      setAcik(false);
    };
    document.addEventListener("pointerdown", disari, true);
    return () => document.removeEventListener("pointerdown", disari, true);
  }, [acik]);

  // Sayfa kaydırılınca ya da pencere boyutu değişince liste kutunun altında kalmaya devam eder.
  useEffect(() => {
    if (!acik) return;
    const guncelle = () => yeriHesapla();
    window.addEventListener("scroll", guncelle, true);
    window.addEventListener("resize", guncelle);
    return () => {
      window.removeEventListener("scroll", guncelle, true);
      window.removeEventListener("resize", guncelle);
    };
  }, [acik, yeriHesapla]);

  // İmleç listenin görünen kısmında kalsın.
  useEffect(() => {
    if (!acik) return;
    listeRef.current?.querySelector<HTMLElement>(`[data-i="${imlec}"]`)?.scrollIntoView({ block: "nearest" });
  }, [acik, imlec]);

  const tus = (e: React.KeyboardEvent) => {
    if (!acik) {
      // Kapalıyken Enter, boşluk ve aşağı ok listeyi açar; tab normal çalışır (dışarı çıkar).
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); ac(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setAcik(false); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      gecRef.current = true;
      sec(imlec);
      return;
    }
    // Tab ve oklar dolaştırır, sondan başa döner — seçmez (Gökhan, 2026-08-28).
    if (e.key === "Tab" || e.key === "ArrowDown") {
      e.preventDefault();
      setImlec((i) => (secenekler.length === 0 ? 0 : (i + (e.key === "Tab" && e.shiftKey ? -1 : 1) + secenekler.length) % secenekler.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setImlec((i) => (secenekler.length === 0 ? 0 : (i - 1 + secenekler.length) % secenekler.length));
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const simdi = Date.now();
      const onceki = simdi - harfRef.current.zaman < 800 ? harfRef.current.metin : "";
      const metin = (onceki + e.key).toLocaleLowerCase("tr-TR");
      harfRef.current = { metin, zaman: simdi };
      const i = secenekler.findIndex((s) => s.ad.toLocaleLowerCase("tr-TR").startsWith(metin));
      if (i >= 0) { e.preventDefault(); setImlec(i); }
    }
  };

  return (
    <div style={{ position: "relative", width: genislik ?? "100%", flexShrink: genislik ? 0 : undefined, minWidth: 0 }}>
      <button
        ref={dugmeRef} type="button" id={id} title={baslik}
        // Fareyle tıklamak burada açıp kapatıyor; klavyeyle gelindiğinde odak açıyor.
        // İkisi ayrı tutuluyor, yoksa tıklama önce odakla açıp sonra tıklamayla kapatıyordu.
        onPointerDown={() => {
          fareRef.current = true;
          if (acik) setAcik(false); else ac();
          // Odak olayı hemen ardından geliyor; bayrak ondan sonra sıfırlanıyor.
          setTimeout(() => { fareRef.current = false; }, 0);
        }}
        onFocus={() => { if (!fareRef.current && !acik) ac(); }}
        onKeyDown={tus}
        style={{
          ...taban, width: "100%", cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
          ...style,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: secili ? "var(--ink)" : "var(--muted-2)" }}>
          {secili?.ad ?? yerTutucu ?? ""}
        </span>
        <ChevronDown size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
      </button>
      {acik && yer && typeof document !== "undefined" && createPortal(
        <div
          ref={listeRef}
          style={{
            position: "fixed", left: yer.left, minWidth: yer.width, zIndex: 200,
            ...(yer.top !== undefined ? { top: yer.top } : { bottom: yer.bottom }),
            background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(30,25,15,0.16)", padding: 4, boxSizing: "border-box",
            maxHeight: yer.enBoy, overflowY: "auto", overflowX: "hidden",
          }}
        >
          {secenekler.map((s, i) => (
            <button
              key={s.deger} type="button" data-i={i} tabIndex={-1}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => sec(i)}
              onMouseEnter={() => setImlec(i)}
              style={{
                all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box",
                padding: "7px 10px", borderRadius: 8, fontSize: dar ? 13 : 14,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                background: i === imlec ? "var(--recede)" : "transparent",
                color: s.deger === deger ? "var(--brand-strong)" : "var(--ink)",
                fontWeight: s.deger === deger ? 600 : 400,
              }}
            >
              {s.ad}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
