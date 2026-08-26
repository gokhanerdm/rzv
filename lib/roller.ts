// PERSONEL ROLLERİ — tek kaynak.
//
// Aynı liste kurulumda, ayarlarda ve profil ekranında ayrı ayrı yazılıydı; üçüncü kopya
// yazmak yerine buraya alındı (Gökhan'ın kuralı: aynı iş iki yerde yazılmaz).
export const PERSONEL_ROLLERI: { anahtar: string; ad: string }[] = [
  { anahtar: "garson", ad: "Garson" },
  { anahtar: "salon_sefi", ad: "Salon şefi" },
  { anahtar: "mutfak", ad: "Mutfak şefi" },
  { anahtar: "karsilama", ad: "Karşılama" },
  { anahtar: "pr", ad: "PR" },
  { anahtar: "yonetici", ad: "Yönetici" },
];

/** Rolün ekranda görünen adı. Tanınmayan bir anahtar gelirse anahtarın kendisi yazılır. */
export const rolAdi = (anahtar: string | null | undefined): string =>
  PERSONEL_ROLLERI.find((r) => r.anahtar === anahtar)?.ad ?? (anahtar || "—");
