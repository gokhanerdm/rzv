"use client";

import { useEffect } from "react";

// KLAVYE DAVRANIŞLARI — bütün programda geçerli, tek yerde duruyor. Ekrana hiçbir şey
// çizmiyor, sadece davranış ekliyor.
//
// 1) TAB İLE SEÇİM KUTUSUNA GELİNCE KUTU KENDİ AÇILIR (Gökhan, 2026-08-28: "tabla geçiliyorsa
//    her kutu akordion ise açılacak"). Klavyeyle form dolduran personel seçim kutusuna
//    gelince ayrıca tıklamak zorunda kalmasın.
//
// 2) SAAT KUTUSU TEK DURAK (Gökhan, 2026-08-28: "saatte önce saate, sonra dakikaya, sonra
//    saat sembolüne geçiyor — o kutuyu tek algılasın"). Tarayıcı saat kutusunu üç ayrı durak
//    sayıyor; tab bir kere girip bir kere çıkacak.
//
// Tüm programda geçerli: tek yerde duruyor, her ekrana ayrı ayrı yazılmıyor. Ekrana hiçbir
// şey çizmiyor, sadece davranış ekliyor — üst üste binme gibi bir riski yok.
//
// SADECE KLAVYEYLE gelindiğinde açılıyor. Fareyle tıklandığında kutu zaten kendi açılıyor;
// bir de biz açmaya kalkarsak açılan kutu hemen kapanıyordu.
export default function KlavyeDavranisi() {
  useEffect(() => {
    let klavyeyle = false;
    const tus = (e: KeyboardEvent) => { if (e.key === "Tab") klavyeyle = true; };
    const fare = () => { klavyeyle = false; };
    const odak = (e: FocusEvent) => {
      const hedef = e.target as HTMLElement | null;
      if (!klavyeyle || !hedef || hedef.tagName !== "SELECT") return;
      klavyeyle = false;
      // Eski tarayıcıda bu yol yok, bazı durumlarda da izin verilmiyor; olmazsa kutu normal
      // çalışmaya devam eder, hata görünmez.
      try {
        (hedef as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
      } catch { /* yok sayılır */ }
    };
    // Saat/tarih kutusundan tab ile TEK SEFERDE çıkılır — saat, dakika ve takvim simgesi
    // ayrı ayrı duraklanmaz.
    const TEK_DURAK = ["time", "date", "datetime-local", "month", "week"];
    const odaklanabilir = () => [...document.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((el) => el.getClientRects().length > 0 && el.getAttribute("tabindex") !== "-1");
    // Görünürlük ölçüsü olarak offsetParent KULLANILMAZ: pencereler position:fixed olduğu
    // için içlerindeki her şey offsetParent'ı null döndürüyor, liste boş kalıyordu.
    const tabAtla = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const el = document.activeElement as HTMLInputElement | null;
      if (!el || el.tagName !== "INPUT" || !TEK_DURAK.includes(el.type)) return;
      const liste = odaklanabilir();
      const i = liste.indexOf(el);
      if (i < 0) return;
      const hedef = liste[e.shiftKey ? i - 1 : i + 1];
      if (!hedef) return;
      e.preventDefault();
      hedef.focus();
    };
    document.addEventListener("keydown", tabAtla, true);
    document.addEventListener("keydown", tus, true);
    document.addEventListener("pointerdown", fare, true);
    document.addEventListener("focusin", odak);
    return () => {
      document.removeEventListener("keydown", tabAtla, true);
      document.removeEventListener("keydown", tus, true);
      document.removeEventListener("pointerdown", fare, true);
      document.removeEventListener("focusin", odak);
    };
  }, []);
  return null;
}
