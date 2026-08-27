// RESTORAN + EĞLENCE ortak kuralları (Gökhan, 2026-08-27). Akşam yemek servisi veren,
// belirli günlerde geçiş saatinden sonra eğlence düzenine dönen mekân: yemek masaları
// kalkar, gece (bistro) salonu devreye girer. Bu dosya "hangi gün eğlence günü" ve
// "dilim" kavramının TEK yeri — kayıt, ayarlar, rezervasyon ve online sayfa hep buradan
// okur, aynı iş iki yerde yazılmaz.

/** Ayarlardaki isletme_tipi değeri. */
export const RESTORAN_EGLENCE = "restoran_eglence";

/** Rezervasyonun dilimi: yemeğe mi geliyor, geceye mi, ikisine birden mi. */
export type Dilim = "yemek" | "gece" | "yemek_gece";

export const DILIMLER: { anahtar: Dilim; ad: string }[] = [
  { anahtar: "yemek", ad: "Yemek" },
  { anahtar: "gece", ad: "Gece" },
  { anahtar: "yemek_gece", ad: "Yemek + gece" },
];

export const dilimAdi = (d: string | null | undefined) =>
  DILIMLER.find((x) => x.anahtar === d)?.ad ?? "";

/** Ayarlardaki gün anahtarları — çalışma saatlerindeki DAYS ile aynı yedili. */
export const GUN_ANAHTARLARI = ["pzt", "sal", "car", "per", "cum", "cmt", "paz"] as const;

/** "2026-08-28" → "cum". Gün, takvim gününe göre; işletme günü kaydırması burada yok —
 * geçiş saati zaten akşam, gece yarısından önce. */
export function gunAnahtari(tarih: string): string {
  const g = new Date(`${tarih}T12:00:00+03:00`).getDay(); // 0=pazar
  return ["paz", "pzt", "sal", "car", "per", "cum", "cmt"][g];
}

/** Bu tarih işletmenin eğlence günü mü? gunler ayarlardaki eglence_gunleri listesi. */
export function eglenceGunuMu(tarih: string, gunler: string[] | null | undefined): boolean {
  if (!tarih || !gunler || gunler.length === 0) return false;
  return gunler.includes(gunAnahtari(tarih));
}
