// ZORUNLU ALAN UYARISI — programın tek kaynağı.
//
// Ekranlar kendi cümlesini YAZMAZ (Gökhan, 2026-08-25: "her sayfada tek tek mi
// konuşacağız... bunu programın temelinde değiştir, yüzeysel yamalı işler yapma").
// Bir ekran zorunlu alan kontrolü yapacaksa buradaki iki yardımcıyı çağırır; cümlenin
// dili burada değişir, bütün program birden değişir.
//
// Kural: uyarı SADECE gerçekten boş olan alanların adını sayar. Eskiden her ekran
// "şu, şu ve şu gerekli" diye hepsini sayıyordu; kullanıcı doldurduğu alanı da eksik
// sanıyordu.

/** Boş alanların adından tek cümle kurar. Liste boşsa boş metin döner. */
export function eksikCumlesi(alanlar: string[]): string {
  const temiz = alanlar.filter((a) => a && a.trim());
  if (temiz.length === 0) return "";
  const liste = temiz.length > 1
    ? `${temiz.slice(0, -1).join(", ")} ve ${temiz[temiz.length - 1]}`
    : temiz[0];
  const bas = `${liste.charAt(0).toLocaleUpperCase("tr-TR")}${liste.slice(1)}`;
  return `${bas} ${temiz.length > 1 ? "alanları" : "alanı"} boş bırakılamaz!`;
}

/**
 * Ekranların çağırdığı hâli: [boşMu, alanAdı] çiftleri verilir, boş olanlar toplanır.
 * Hepsi doluysa null döner — çağıran taraf "null değilse dur" der.
 *
 *   const eksik = eksikAlan([[!isim.trim(), "işletme adı"], [!telefon.trim(), "telefon"]]);
 *   if (eksik) { setErr(eksik); return; }
 */
export function eksikAlan(kontroller: [boolean, string][]): string | null {
  const eksik = kontroller.filter(([bosMu]) => bosMu).map(([, ad]) => ad);
  return eksik.length > 0 ? eksikCumlesi(eksik) : null;
}
