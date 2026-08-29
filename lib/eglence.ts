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

// AYAKTA SEÇENEKLERİ (Gökhan, 2026-08-29: "bistro bitince rezervasyon türünde ayakta çıksın").
// Bunlar ayrı bir dilim DEĞİL — rezervasyonun dilimi yine gece ya da yemek + gece olur, üstüne
// "ayakta" işareti konur. Sadece bistro kalmadığında kutuda görünürler; bistro varken misafir
// zaten bistroya oturur.
export type TurSecimi = Dilim | "ayakta" | "yemek_ayakta";

export const AYAKTA_SECENEKLERI: { anahtar: TurSecimi; ad: string }[] = [
  { anahtar: "ayakta", ad: "Ayakta" },
  { anahtar: "yemek_ayakta", ad: "Yemek + ayakta" },
];

/** Kutudaki seçimi kayda çevirir: hangi dilim, ayakta mı. */
export const turuCoz = (t: TurSecimi): { dilim: Dilim; ayakta: boolean } =>
  t === "ayakta" ? { dilim: "gece", ayakta: true }
    : t === "yemek_ayakta" ? { dilim: "yemek_gece", ayakta: true }
      : { dilim: t, ayakta: false };

/** Kayıttan kutudaki seçime döner — satırdaki tür penceresi bunu kullanıyor. */
export const turSecimi = (dilim: string | null | undefined, ayakta: boolean | null | undefined): TurSecimi => {
  if (!ayakta) return (dilim as Dilim) ?? "yemek";
  return dilim === "yemek_gece" ? "yemek_ayakta" : "ayakta";
};

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
