import type { CSSProperties } from "react";

// PROGRAMIN ÖLÇÜ STANDARDI — tek kaynak.
//
// Kutuların ve düğmelerin boyu BURADA durur. Hiçbir ekran kendi ölçüsünü yazmaz
// (Gökhan, 2026-08-25: "bunları standarta bağlayalım ve hep bunlar uygulansın, benim
// derdim de bu zaten"). Bir ölçü burada değişir, bütün program birden değişir.
//
// Ölçü birimi MİLİMETRE — Gökhan ölçüleri mm veriyor, program da mm konuşsun.
// (CSS'te 1mm = 96/25.4 piksel; 11mm ≈ 42 piksel.)

/** Form kutusunun boyu. Giriş, kayıt, kurulum, ayarlar — kullanıcının doldurduğu her kutu. */
export const KUTU_BOY = "11mm";
/** Sıkışık yerlerdeki kutu: liste içi, satır içi düzenleme, yan yana küçük alanlar. */
export const KUTU_BOY_DAR = "9mm";

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

/** Çok satırlı kutu — boyu içeriğe göre büyür, yanları standart kutuyla aynı. */
export const kutuCokSatir: CSSProperties = {
  ...kutu, height: undefined, padding: "9px 13px", resize: "vertical",
};

/** Formu bitiren ana düğme — kutularla aynı boyda, kutunun altında tam genişlik. */
export const dugmeAna: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
  width: "100%", height: KUTU_BOY, border: "none", borderRadius: 980,
  background: "var(--brand-strong)", color: "#fff", fontSize: 15, fontWeight: 500,
  boxSizing: "border-box", cursor: "pointer",
};

/** Satır içindeki ana düğme — başlığın yanında, listenin üstünde. */
export const dugmeAnaSatir: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
  border: "none", borderRadius: 980, padding: "9px 14px",
  background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500,
  flexShrink: 0, cursor: "pointer",
};

/** İkinci derece düğme — çerçeveli, zemini kart rengi. */
export const dugmeIkincil: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px",
  background: "var(--card)", color: "var(--ink-green)", fontSize: 13,
  flexShrink: 0, cursor: "pointer",
};

/** Silik düğme — satır aralarındaki küçük eylemler. */
export const dugmeSilik: CSSProperties = {
  border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px",
  background: "var(--card)", color: "var(--ink)", fontSize: 12,
  flexShrink: 0, cursor: "pointer",
};

/** Dolu küçük düğme — liste satırındaki onay/oturt gibi kısa eylemler. */
export const dugmeKucuk: CSSProperties = {
  border: "none", borderRadius: 980, padding: "7px 14px",
  background: "var(--ink-green)", color: "#fff", fontSize: 12.5,
  flexShrink: 0, cursor: "pointer",
};

/** Yalnız simgeden oluşan düğme — üst bar, menü, tarih seçici. */
export const dugmeSimge: CSSProperties = {
  all: "unset", cursor: "pointer", display: "flex", alignItems: "center",
  padding: 6, borderRadius: 8, color: "var(--muted)",
};
