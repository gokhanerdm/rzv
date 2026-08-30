// Masa gövde ölçüleri — TEK kaynak. Hem Salon ekranı çizerken hem de planlayıcı birleşen
// masaları yan yana koyarken aynı ölçüyü kullanmalı; iki yerde ayrı hesap tutulursa masalar
// planda üst üste ya da aralıklı çıkar.
//
// Ölçüler gerçek santim: 2 kişilik kare ~70cm, 4 kişilik dikdörtgen 120x70 gibi yaygın
// değerler. Piksele PX_PER_CM ile çevriliyor ki büyük masa küçükten GERÇEKTEN büyük görünsün.

// ÜÇ MASA ŞEKLİ (Gökhan, 2026-08-25: "kare masa olayını kaldırıyoruz, böyle bir masa türü
// çok yerde kullanılmıyor"). Ekranda "dikdortgen"in adı KÖŞELİ; veritabanındaki değer
// değişmedi, eski kare masalar köşeliye çevrildi.
export type Shape = "yuvarlak" | "dikdortgen" | "loca" | "bistro";

export const PX_PER_CM = 0.8;
// Salon planında masanın sürükleme kutusu — gövde bunun ortasında çizilir. Konum (position_x)
// bu kutunun sol kenarıdır, o yüzden sağ sınır hesabında kutu genişliği kullanılır.
export const BOX_W = 148;
export const BOX_H = 108;
export const KOLTUK_SECENEKLERI = [2, 4, 6, 8];
export const MIN_GOVDE_PX = 46;

// SABİT ÖLÇÜLER (Gökhan, 2026-08-25: "bunlar sabit ölçü oluyor, işletme masa ölçüsü
// giremiyor"). Locanın kişi sayısı yok, tek ölçüsü var: 150 en × 300 boy.
export const LOCA_OLCU = { w: 200, h: 120 };
// BİSTRO (Gökhan, 2026-08-27: "locanın yanına bistro ekle ölçüsü 40*40"). Gece düzeninin
// masası: küçük, kare, sabit. Locada olduğu gibi kişi sayısı sorulmaz, sadece adet girilir.
export const BISTRO_OLCU = { w: 40, h: 40 };
// Bir bistronun aldığı en fazla kişi (Gökhan: "5 kişi üzeri 2 bistro hesaplanacak") —
// gece kapasitesi bistro sayısı × bu sayıdan çıkıyor, 6 kişilik bir grup iki bistro tutar.
export const BISTRO_KISI = 5;

export const CM_OLCU: Record<Shape, Record<number, { w: number; h: number }>> = {
  yuvarlak: { 2: { w: 70, h: 70 }, 4: { w: 90, h: 90 }, 6: { w: 150, h: 150 }, 8: { w: 180, h: 180 } },
  dikdortgen: { 2: { w: 70, h: 70 }, 4: { w: 120, h: 70 }, 6: { w: 180, h: 70 }, 8: { w: 220, h: 70 } },
  loca: { 2: LOCA_OLCU, 4: LOCA_OLCU, 6: LOCA_OLCU, 8: LOCA_OLCU },
  bistro: { 2: BISTRO_OLCU, 4: BISTRO_OLCU, 6: BISTRO_OLCU, 8: BISTRO_OLCU },
};

// En yakın tanımlı kişi sayısına yuvarlar — 2/4/6/8 arası serbest sayı da girilebiliyor
// (ör. 5 kişilik masa 4'ün ölçüsünü kullanır, tam santim hassasiyeti önemli değil).
export const enYakinKoltuk = (seats: number) =>
  KOLTUK_SECENEKLERI.reduce((a, b) => (Math.abs(b - seats) < Math.abs(a - seats) ? b : a));

// Ölçü işletmeye göre değişmez; yukarıdaki tablo tek kaynaktır.
export const govdeOlcusu = (shape: Shape, seats: number): { width: number; height: number } => {
  const cm = shape === "loca" ? LOCA_OLCU : shape === "bistro" ? BISTRO_OLCU : CM_OLCU[shape][enYakinKoltuk(seats)];
  return {
    width: Math.max(MIN_GOVDE_PX, Math.round(cm.w * PX_PER_CM)),
    height: Math.max(MIN_GOVDE_PX, Math.round(cm.h * PX_PER_CM)),
  };
};

// Köşeli ve loca masa çevrilmişse en/boy yer değiştirir.
export const govdeCizim = (shape: Shape, seats: number, rotated: boolean) => {
  const o = govdeOlcusu(shape, seats);
  // Yuvarlak ve bistro kare olduğu için çevrilse de en/boy değişmez.
  return shape !== "yuvarlak" && shape !== "bistro" && rotated ? { width: o.height, height: o.width } : o;
};

// Masa şekli listesi ve rozeti — Salon ekranı ile Kurulum aynı listeyi ve aynı çizimi
// kullanır (Gökhan, 2026-08-25: "aynen salon eklede olduğu gibi"). Şekil ve kişi sayısı
// AYRI seçilir; yuvarlak masa da altı kişilik olabilir.
export const SEKILLER: { shape: Shape; label: string }[] = [
  { shape: "dikdortgen", label: "Köşeli" },
  { shape: "yuvarlak", label: "Yuvarlak" },
  { shape: "loca", label: "Loca" },
  { shape: "bistro", label: "Bistro" },
];

/**
 * Locada kişi sayısı sorulmaz, sadece adedi girilir (Gökhan, 2026-08-25). Çizim ve ölçü
 * için bir kademe gerektiğinden orta boy kullanılır.
 */
export const LOCA_KADEME = 6;

/**
 * KİŞİ SAYISI SORULMAYAN ŞEKİLLER — ölçüsü sabit olduğu için kademesi de tek: masa
 * girilirken sadece adet sorulur (Gökhan: locada 2026-08-25, bistroda 2026-08-27).
 * Kayıtta bir sayı tutulmak zorunda; loca çizim için orta kademeyi, bistro aldığı en
 * fazla kişiyi kullanır.
 */
export const TEK_KADEME: Partial<Record<Shape, number>> = { loca: LOCA_KADEME, bistro: BISTRO_KISI };
export const kisiSorulurMu = (shape: Shape) => TEK_KADEME[shape] === undefined;
/** Masa girme tablosunda o şekil için hangi kişi kademeleri sorulacak. */
export const kademeler = (shape: Shape): number[] =>
  kisiSorulurMu(shape) ? KOLTUK_SECENEKLERI : [TEK_KADEME[shape] as number];

/** Şeklin küçük görsel rozeti — gerçek en/boy oranıyla, kare yuvarlak görünmesin diye. */
export const sekilRozeti = (shape: Shape, taban: number) => {
  if (shape === "yuvarlak") return { width: taban, height: taban, borderRadius: "50%" };
  if (shape === "loca") return { width: taban * 0.5, height: taban, borderRadius: 12 };
  // Bistro 40×40 — küçük ve kare; yanındaki köşeli masadan bir bakışta ayrılsın diye ufak.
  if (shape === "bistro") return { width: taban * 0.6, height: taban * 0.6, borderRadius: 4 };
  return { width: taban * 1.5, height: taban * 0.7, borderRadius: 4 };
};

/**
 * YAZININ KAPLADIĞI EN (Gökhan, 2026-08-30: "bistroların içine masa isimleri sığmıyor,
 * kural belli sığacak, istisna yok").
 *
 * Masanın içindeki yazı BOYUNA göre küçültülüyordu ama ENİNE hiç bakılmıyordu: 40×40'lık
 * bistro 32 piksel geliyor, "Bistro 1" oraya sığmıyor ve yanlardan kesiliyordu. Artık en
 * uzun satırın gerçek eni ölçülüp ölçek ona göre de kısılıyor.
 *
 * Ölçü tahmin edilmiyor, tarayıcının kendi yazı tipiyle alınıyor. Sunucuda çizilirken
 * (tarayıcı yokken) harf başına kaba bir pay kullanılıyor. Aynı yazı ikinci kez ölçülmüyor.
 */
const yaziEnOnbellek = new Map<string, number>();
let yaziOlcer: CanvasRenderingContext2D | null = null;
let yaziAilesi = "";
export const yaziEniPx = (metin: string, punto: number, kalin = false): number => {
  const t = (metin ?? "").trim();
  if (!t) return 0;
  const anahtar = `${kalin ? "k" : "n"}|${punto}|${t}`;
  const hazir = yaziEnOnbellek.get(anahtar);
  if (hazir !== undefined) return hazir;
  let en = t.length * punto * 0.62;
  if (typeof document !== "undefined") {
    if (!yaziOlcer) {
      yaziOlcer = document.createElement("canvas").getContext("2d");
      yaziAilesi = getComputedStyle(document.body).fontFamily || "sans-serif";
    }
    if (yaziOlcer) {
      yaziOlcer.font = `${kalin ? 700 : 400} ${punto}px ${yaziAilesi}`;
      // Yazı tipi tam yüklenmemişken ölçü birkaç piksel şaşabiliyor; küçük bir pay bırakılıyor.
      en = yaziOlcer.measureText(t).width * 1.03;
    }
  }
  yaziEnOnbellek.set(anahtar, en);
  return en;
};
