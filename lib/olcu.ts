import type { CSSProperties } from "react";

// PROGRAMIN ÖLÇÜ STANDARDI — tek kaynak.
//
// Kutuların ve düğmelerin boyu BURADA durur. Hiçbir ekran kendi ölçüsünü yazmaz
// (Gökhan, 2026-08-25: "bunları standarta bağlayalım ve hep bunlar uygulansın, benim
// derdim de bu zaten"). Bir ölçü burada değişir, bütün program birden değişir.
//
// Ölçü birimi MİLİMETRE — Gökhan ölçüleri mm veriyor, program da mm konuşsun.
// (CSS'te 1mm = 96/25.4 piksel; 11mm ≈ 42 piksel.)

/**
 * Kutu boyu — programda TEK boy var (Gökhan, 2026-08-25: "onları da 9 mm'ye düşür").
 * Giriş, kayıt, kurulum, ayarlar, liste içi düzenleme; hepsi aynı yükseklikte.
 */
export const KUTU_BOY = "9mm";
/** Aynı boy — sıkışık yerlerde yazı ve iç boşluk küçülür, yükseklik değişmez. */
export const KUTU_BOY_DAR = KUTU_BOY;

/**
 * Düğme eni — Devam, Geri, Kaydet, Giriş yap gibi tuşlar aynı ende durur
 * (Gökhan, 2026-08-25: "devam tuşlarını da bir standarda bağla, 3 cm olur 4 cm olur").
 * Tuşlar esnemez, ekrandan ekrana boyu değişmez.
 */
export const DUGME_EN = "4cm";
// Bu bir EN AZ ölçüsü: kısa yazılı tuşlar hep 4cm, uzun yazılı tuş kadar genişler
// (Gökhan, 2026-08-25: "yazıyı butona tek satır yap, gerekirse butonu genişlet").
// Sabit en verilirse "Bütün rollerin kodunu üret" gibi yazılar tuşun içinde satır atlıyor.
//
// TELEFONDA ALT SINIR KENDİLİĞİNDEN KÜÇÜLÜR (Gökhan, 2026-08-26: "hiçbir ekran
// taşmayacağı konusunda anlaşmıştık"): dar bir satırda 4cm'lik alt sınır kutuyu sağa
// taşırıyordu. min(4cm, 100%) yazınca alt sınır, kapsayıcıdan asla geniş olamıyor.

/** Standart form kutusu. */
export const kutu: CSSProperties = {
  border: "1px solid var(--line-2)", borderRadius: 10,
  height: KUTU_BOY, padding: "0 13px", fontSize: 16,
  background: "var(--card)", color: "var(--ink)", outline: "none",
  width: "100%", minWidth: 0, boxSizing: "border-box",
};

/** Sıkışık yerlerdeki kutu — liste satırı, salon planı, ayarların yan yana alanları. */
export const kutuDar: CSSProperties = {
  ...kutu, height: KUTU_BOY_DAR, padding: "0 10px", fontSize: 14,
};

/** Çok satırlı kutu — boyu içeriğe göre büyür (`rows` çalışsın diye height verilmez). */
export const kutuCokSatir: CSSProperties = {
  ...kutu, height: undefined, padding: "9px 13px", resize: "vertical", fontFamily: "inherit",
};

/** Sıkışık ekranlarda çok satırlı kutu — mesaj şablonları, KVKK metni. */
export const kutuCokSatirDar: CSSProperties = {
  ...kutuCokSatir, padding: "8px 10px", fontSize: 14,
};

/** Formu bitiren ana düğme — kutularla aynı boyda, standart ende. */
export const dugmeAna: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
  minWidth: `min(${DUGME_EN}, 100%)`, height: KUTU_BOY, padding: "0 16px", whiteSpace: "nowrap",
  border: "none", borderRadius: 980,
  background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500,
  // Sabit enli tuş, alt alta dizilmiş bir formda kendiliğinden sola yapışıyordu; ortada durur.
  alignSelf: "center", flexShrink: 0, boxSizing: "border-box", cursor: "pointer",
};

/** Satır içindeki ana düğme — başlığın yanında, listenin üstünde. */
export const dugmeAnaSatir: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
  border: "none", borderRadius: 980, padding: "9px 14px", whiteSpace: "nowrap",
  background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500,
  flexShrink: 0, cursor: "pointer",
};

/** İkinci derece düğme — çerçeveli, zemini kart rengi. */
export const dugmeIkincil: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  minWidth: `min(${DUGME_EN}, 100%)`, height: KUTU_BOY, padding: "0 16px", whiteSpace: "nowrap",
  border: "1px solid var(--line-2)", borderRadius: 980,
  background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5,
  flexShrink: 0, boxSizing: "border-box", cursor: "pointer",
};

/** Silik düğme — satır aralarındaki küçük eylemler. */
export const dugmeSilik: CSSProperties = {
  border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px",
  background: "var(--card)", color: "var(--ink)", fontSize: 12, whiteSpace: "nowrap",
  flexShrink: 0, cursor: "pointer",
};

/** Dolu küçük düğme — liste satırındaki onay/oturt gibi kısa eylemler. */
export const dugmeKucuk: CSSProperties = {
  border: "none", borderRadius: 980, padding: "7px 14px",
  background: "var(--ink-green)", color: "#fff", fontSize: 12.5, whiteSpace: "nowrap",
  flexShrink: 0, cursor: "pointer",
};

/** Yalnız simgeden oluşan düğme — üst bar, menü, tarih seçici. */
export const dugmeSimge: CSSProperties = {
  all: "unset", cursor: "pointer", display: "flex", alignItems: "center",
  padding: 6, borderRadius: 8, color: "var(--muted)",
};
