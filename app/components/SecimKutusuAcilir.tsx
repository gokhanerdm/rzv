"use client";

import { useEffect } from "react";

// TAB İLE SEÇİM KUTUSUNA GELİNCE KUTU KENDİ AÇILIR (Gökhan, 2026-08-28: "tabla geçiliyorsa
// her kutu akordion ise açılacak"). Klavyeyle form dolduran personel seçim kutusuna gelince
// ayrıca tıklamak zorunda kalmasın.
//
// Tüm programda geçerli: tek yerde duruyor, her ekrana ayrı ayrı yazılmıyor. Ekrana hiçbir
// şey çizmiyor, sadece davranış ekliyor — üst üste binme gibi bir riski yok.
//
// SADECE KLAVYEYLE gelindiğinde açılıyor. Fareyle tıklandığında kutu zaten kendi açılıyor;
// bir de biz açmaya kalkarsak açılan kutu hemen kapanıyordu.
export default function SecimKutusuAcilir() {
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
    document.addEventListener("keydown", tus, true);
    document.addEventListener("pointerdown", fare, true);
    document.addEventListener("focusin", odak);
    return () => {
      document.removeEventListener("keydown", tus, true);
      document.removeEventListener("pointerdown", fare, true);
      document.removeEventListener("focusin", odak);
    };
  }, []);
  return null;
}
