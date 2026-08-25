// Masa gövde ölçüleri — TEK kaynak. Hem Salon ekranı çizerken hem de planlayıcı birleşen
// masaları yan yana koyarken aynı ölçüyü kullanmalı; iki yerde ayrı hesap tutulursa masalar
// planda üst üste ya da aralıklı çıkar.
//
// Ölçüler gerçek santim: 2 kişilik kare ~70cm, 4 kişilik dikdörtgen 120x70 gibi yaygın
// değerler. Piksele PX_PER_CM ile çevriliyor ki büyük masa küçükten GERÇEKTEN büyük görünsün.

// ÜÇ MASA ŞEKLİ (Gökhan, 2026-08-25: "kare masa olayını kaldırıyoruz, böyle bir masa türü
// çok yerde kullanılmıyor"). Ekranda "dikdortgen"in adı KÖŞELİ; veritabanındaki değer
// değişmedi, eski kare masalar köşeliye çevrildi.
export type Shape = "yuvarlak" | "dikdortgen" | "loca";

export const PX_PER_CM = 0.8;
// Salon planında masanın sürükleme kutusu — gövde bunun ortasında çizilir. Konum (position_x)
// bu kutunun sol kenarıdır, o yüzden sağ sınır hesabında kutu genişliği kullanılır.
export const BOX_W = 148;
export const BOX_H = 108;
export const KOLTUK_SECENEKLERI = [2, 4, 6, 8];
export const MIN_GOVDE_PX = 46;

// SABİT ÖLÇÜLER (Gökhan, 2026-08-25: "bunlar sabit ölçü oluyor, işletme masa ölçüsü
// giremiyor"). Locanın kişi sayısı yok, tek ölçüsü var: 150 en × 300 boy.
export const LOCA_OLCU = { w: 150, h: 300 };

export const CM_OLCU: Record<Shape, Record<number, { w: number; h: number }>> = {
  yuvarlak: { 2: { w: 70, h: 70 }, 4: { w: 90, h: 90 }, 6: { w: 150, h: 150 }, 8: { w: 180, h: 180 } },
  dikdortgen: { 2: { w: 70, h: 70 }, 4: { w: 120, h: 70 }, 6: { w: 180, h: 70 }, 8: { w: 220, h: 70 } },
  loca: { 2: LOCA_OLCU, 4: LOCA_OLCU, 6: LOCA_OLCU, 8: LOCA_OLCU },
};

// En yakın tanımlı kişi sayısına yuvarlar — 2/4/6/8 arası serbest sayı da girilebiliyor
// (ör. 5 kişilik masa 4'ün ölçüsünü kullanır, tam santim hassasiyeti önemli değil).
export const enYakinKoltuk = (seats: number) =>
  KOLTUK_SECENEKLERI.reduce((a, b) => (Math.abs(b - seats) < Math.abs(a - seats) ? b : a));

// Ölçü işletmeye göre değişmez; yukarıdaki tablo tek kaynaktır.
export const govdeOlcusu = (shape: Shape, seats: number): { width: number; height: number } => {
  const cm = shape === "loca" ? LOCA_OLCU : CM_OLCU[shape][enYakinKoltuk(seats)];
  return {
    width: Math.max(MIN_GOVDE_PX, Math.round(cm.w * PX_PER_CM)),
    height: Math.max(MIN_GOVDE_PX, Math.round(cm.h * PX_PER_CM)),
  };
};

// Köşeli ve loca masa çevrilmişse en/boy yer değiştirir.
export const govdeCizim = (shape: Shape, seats: number, rotated: boolean) => {
  const o = govdeOlcusu(shape, seats);
  return shape !== "yuvarlak" && rotated ? { width: o.height, height: o.width } : o;
};

// Masa şekli listesi ve rozeti — Salon ekranı ile Kurulum aynı listeyi ve aynı çizimi
// kullanır (Gökhan, 2026-08-25: "aynen salon eklede olduğu gibi"). Şekil ve kişi sayısı
// AYRI seçilir; yuvarlak masa da altı kişilik olabilir.
export const SEKILLER: { shape: Shape; label: string }[] = [
  { shape: "dikdortgen", label: "Köşeli" },
  { shape: "yuvarlak", label: "Yuvarlak" },
  { shape: "loca", label: "Loca" },
];

/**
 * Locada kişi sayısı sorulmaz, sadece adedi girilir (Gökhan, 2026-08-25). Çizim ve ölçü
 * için bir kademe gerektiğinden orta boy kullanılır.
 */
export const LOCA_KADEME = 6;

/** Şeklin küçük görsel rozeti — gerçek en/boy oranıyla, kare yuvarlak görünmesin diye. */
export const sekilRozeti = (shape: Shape, taban: number) => {
  if (shape === "yuvarlak") return { width: taban, height: taban, borderRadius: "50%" };
  if (shape === "loca") return { width: taban * 0.5, height: taban, borderRadius: 12 };
  return { width: taban * 1.5, height: taban * 0.7, borderRadius: 4 };
};
