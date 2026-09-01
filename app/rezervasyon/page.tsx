"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { kutuDar, dugmeAnaSatir, dugmeIkincil, dugmeSilik, dugmeKucuk, dugmeSimge } from "@/lib/olcu";
import { getMyReservationRestaurantId, getMyReservationRestaurants, setAktifSube, girisEkraniYolu, type ReservationBranch } from "@/lib/supabase/reservationAccount";
import { toTitleTr, ilkHarfBuyukTr } from "@/lib/text";
import { istenenSalon, nottaLoca, nottakiLocaMasasi, nottakiGrup } from "./notKurallari";
import { eksikAlan } from "@/lib/zorunluAlan";
import {
  havuzuTuket, havuzDokumu,
  salonuPlanla, birlesikYerlesim, type PlanMasa, type MisafirBagi,
} from "./masaPlan";
import { govdeCizim, BOX_W, BOX_H, type Shape as MasaSekli } from "./masaOlcu";
import SalonPlani from "./posta/SalonPlani";
import { Plus, ChevronLeft, ChevronRight, ChevronDown, LayoutGrid, Settings, User, Search, X, Lock, Unlock, BarChart3, DoorOpen, Trash2 } from "lucide-react";
import { useConfirm } from "../components/useConfirm";
import { RzvRozet } from "../components/RezervasyonMenu";
import DatePicker from "../components/DatePicker";
import { RESTORAN_EGLENCE, DILIMLER, AYAKTA_SECENEKLERI, turuCoz, turSecimi, dilimAdi, konseptiCoz, type Dilim, type TurSecimi, eglenceGunuMu } from "@/lib/eglence";
import ProfilSimgesi from "../components/ProfilSimgesi";
import IsletmeRozeti from "../components/IsletmeRozeti";
import EditableText from "../components/EditableText";
import { ListHeader, HeaderCell, ListRow, RowSep, Cell, ActionsCell, Spacer } from "../components/ListRow";
import RezervasyonAltNav, { ALT_NAV_YUKSEKLIK } from "../components/RezervasyonAltNav";
import SecimKutusu from "../components/SecimKutusu";

// REZERVASYON — kendi başına çalışan ayrı program (Gökhan onayı, 2026-08-04).
//
// Eskiden bu ekran AIOS'un içindeydi (/karsilama), sol menüden açılıyordu ve misafir
// oturunca adisyon açıyordu. Karar değişti: rezervasyon ayrı satılabilecek bir ürün, AIOS
// ile işi yok. Bu yüzden:
//   - AIOS sol menüsü yok. Kendi girişi var (/rezervasyon/giris) — AIOS'un profiles/
//     bootstrap_restaurant_account'ından tamamen ayrı bir hesap sistemi (restaurants.
//     owner_user_id). Oturum yoksa buraya değil /rezervasyon/giris'e düşülür.
//   - Hesap/adisyon yok. Akış kendi içinde kapanır: bekleniyor -> geldi -> oturdu -> tamamlandı
//   - Masayı bu program yönetir: oturunca dolu, ziyaret bitince boş (bkz. seat_reservation ve
//     end_reservation_visit — artık orders tablosuna hiç dokunmuyorlar).
//
// "bekleniyor" = misafir henüz gelmedi. "geldi" = kapıda, masa bekliyor. "oturdu" = masada.
// "tamamlandı" = ziyaret bitti, masa boşaldı. Kapıdan rezervasyonsuz gelen de aynı listeye,
// aynı zincire girer.

type Rez = {
  id: string; guest_name: string; guest_phone: string | null; party_size: number;
  reserved_at: string; status: string; note: string | null; table_id: string | null;
  arrived_at: string | null; created_at: string; cancel_reason: string | null; source: string;
  // Masaya oturduğu an — listede "ne zamandır oturuyor" bundan hesaplanıyor
  // (Gökhan, 2026-08-18).
  seated_at: string | null;
  // Masası kesinleşmiş, müşteriye söz verilmiş rezervasyon — otomatik yerleşme buna dokunmaz.
  masa_kilit: boolean;
  // İsim aramasından seçilen müşterinin kalıcı kimliği (Gökhan: "form o müşterinin ID'siyle
  // devam etsin, sadece isim/telefon metniyle eşleşmesin") — aynı isimli kişiler karışmaz.
  kisi_karti_id: string | null;
  // Kişi sayısının yanında kadın/erkek dağılımı — opsiyonel, sadece yeni rezervasyonda sorulur.
  kadin_sayisi: number | null; erkek_sayisi: number | null;
  // Masanın ödediği tutar — İSTEĞE BAĞLI, iş bittikten sonra elle girilir (Gökhan,
  // 2026-08-10: "sonuçta kartta görmek ister, hangi müşteri harcıyor"). Boş = girilmemiş.
  hesap_tutari: number | null;
  // Kapıda gerçekten gelen kişi sayısı — rezervasyondaki sayıdan farklı olabilir (Gökhan,
  // 2026-08-12: "4 kişilik rezervasyon ama 5 kişi geldi"). Boşsa party_size kadar sayılır.
  gelen_kisi: number | null;
  // Gelenlerin kadın/erkek dağılımı — kapıda "Geldi"ye basılınca soruluyor (Gökhan,
  // 2026-08-24). kadin_sayisi/erkek_sayisi rezervasyonda SÖYLENEN, bunlar GERÇEKLEŞEN.
  gelen_kadin: number | null; gelen_erkek: number | null;
  // Yedek rezervasyon (Gökhan, 2026-08-11: "normal rezervasyon gibi girilsin yedek işareti
  // taşısın") — masa tutmaz, kapasiteye sayılmaz. Bir rezervasyon gelmedi/iptal olunca
  // yedekteki uygun grup onun yerine geçer.
  yedek: boolean;
  // RESTORAN + EĞLENCE dilimi (Gökhan, 2026-08-27): yemeğe mi geliyor, geceye mi, ikisine
  // birden mi. Eğlence günü dışı ve diğer işletme türlerinde null.
  dilim: string | null;
  // Online başvurunun durumu — bekliyor/onaylandi/reddedildi. Personel kaydında null.
  onay_durumu: string | null;
  // Bistrolar dolunca masasız alınan gece misafiri — masa sütununda "Ayakta" yazar.
  ayakta: boolean;
  // Ev sahibinin misafirleri için açtırdığı ikinci masa (Gökhan, 2026-08-15).
  misafir_masasi: boolean;
  misafir_yakin: boolean | null;
  // Misafirin online formda seçtiği salon — söz değil, "mümkünse" (Gökhan, 2026-08-15).
  tercih_alan_id: string | null;
  // Rezervasyonu giren kişi. Garson/PR/şef/mutfak yalnızca kendi girdiği kayıtta kişi
  // kartını açabiliyor (Gökhan, 2026-08-17) — ölçüt PERSONEL kaydı, oturum değil: aynı
  // hesapta birden fazla personel olabiliyor.
  created_by: string | null;
  // Bu rezervasyona stoktan verilen masa adedi (masa hesabı — Gökhan, 2026-08-20).
  stok_masa: number | null;
  // Loca kuralları: kapora alındı mı, hangi paket seçilmiş (Gökhan, 2026-08-20).
  kapora_alindi: boolean | null; kapora_tutar: number | null; masa_paketi_id: string | null;
  alan_hesap_id: string | null;
  // Fix menü mü alakart mı — mutfak şefi listede masa yerine bunu görüyor (Gökhan,
  // 2026-08-17). Sadece ayarlarda fix menü açıkken sorulur.
  servis_tipi: string | null;
  fix_menu_id: string | null;
  fix_kisi: number | null;
  // KAPIDA SIRA BEKLEYEN (Gökhan, 2026-08-18) — kapı girişinde yer yoksa misafir geri
  // çevrilmiyor, sıraya alınıyor. Bekleyen masa tutmaz, kapasiteye girmez; oturunca
  // bekleme kalkar ve kaç dakika beklediği kayda geçer.
  bekleme: boolean;
  bekleme_baslangic: string | null;
  bekleme_dakika: number | null;
  // TEYİT (Gökhan, 2026-08-18): yok | bekliyor (mesaj gitti) | geliyor | iptal |
  // sayildi (teyit saatinden sonra alındı, teyitli sayılıyor).
  teyit_durumu: string;
  teyit_zamani: string | null;
};
// position_x/y salon planındaki yeri — planlayıcı "kendi sırasındaki masa"yı bundan bulur.
// shape/rotated gövde genişliği için (birleşen masalar plana bitişik yazılırken lazım),
// normal_x/y ise masanın asıl yeri — gün kapanınca oraya geri konuyor.
type TableRow = {
  id: string; name: string; seat_count: number; status: string;
  position_x: number | null; position_y: number | null;
  shape: MasaSekli; rotated: boolean; normal_x: number | null; normal_y: number | null;
  // normal_rotated: birleşmek için çevrilmeden önceki asıl duruş (Gökhan, 2026-08-19).
  normal_rotated: boolean | null;
  // varsayilan_*: işletmenin raptiye ile kaydettiği kalıcı düzen — masanın gerçek evi.
  varsayilan_x: number | null; varsayilan_y: number | null; varsayilan_rotated: boolean | null;
  // MASA HESABI (Gökhan, 2026-08-20): gece kulübünde kapasite koltukla değil masayla sayılır.
  // en_fazla_kisi masanın kendi sınırı; boşsa grubunki, o da boşsa işletmenin genel sınırı.
  en_fazla_kisi: number | null; grup_id: string | null;
  area_id: string | null;
  // tasindi_gun: bu masa o gece başka bir masanın yanına taşındı — salon planında çizilmiyor
  // (Gökhan, 2026-08-24: "arka sıradaki masa kaybolur").
  tasindi_gun: string | null;
  // stok: depodan bu gece cikarilmis yedek masa (S1, S2...). Gece sonunda silinir.
  stok: boolean | null;
};

const gunIstanbul = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(iso));
const bugunIstanbul = () => gunIstanbul(new Date().toISOString());
const gunKaydir = (gun: string, delta: number) => {
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + delta);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
};
/** Şu anki saat "HH:MM" — kapı girişinde varsayılan dilimi belirlemek için (Gökhan, 2026-08-29). */
const simdiSaat = () => new Date().toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
const gunSiniri = (gun: string) => {
  const start = `${gun}T00:00:00+03:00`;
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  const end = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d)}T00:00:00+03:00`;
  return { start, end };
};
const saatFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" });
const saat = (iso: string) => saatFmt.format(new Date(iso));
const bekleyenSure = (from: string, now: number) => {
  const dk = Math.max(0, Math.round((now - Date.parse(from)) / 60000));
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)}s ${dk % 60}dk`;
};

// Satır kartının arka planı — açık kahve tonlarının dereceli ailesi (--tan-100..500).
// Sıra "ne kadar bitmiş" mantığında: aktif olanlar en açık, iptal en koyu.
// "tamamlandı" masası boşalmış ama normal biten bir ziyaret — oturdu ile gelmedi arasında.
const DURUM_INFO: Record<string, { label: string; color: string; bg: string }> = {
  bekleniyor: { label: "Bekleniyor", color: "var(--ink)", bg: "var(--tan-100)" },
  geldi: { label: "Geldi", color: "var(--danger)", bg: "var(--tan-100)" },
  oturdu: { label: "Oturdu", color: "var(--brand)", bg: "var(--tan-300)" },
  tamamlandi: { label: "Tamamlandı", color: "var(--ink)", bg: "var(--tan-200)" },
  gelmedi: { label: "Gelmedi", color: "var(--gold-text)", bg: "var(--tan-400)" },
  iptal: { label: "İptal", color: "var(--ink)", bg: "var(--tan-500)" },
};
// Kayıt nereden geldi — istatistik için kayıt anında bir kere yazılır, sonra değişmez.
const SOURCE_INFO: Record<string, { label: string; color: string }> = {
  rezervasyon: { label: "RVZ", color: "var(--brand)" },
  kapi: { label: "Kapı", color: "var(--gold-text)" },
  online: { label: "Online", color: "var(--ink-green)" },
};

// Satır içi düzenleme artık çift tıklamayla değil, masa seçteki gibi küçük bir pencerede
// (Gökhan: "rezervasyon ismi dışındaki her bilgiyi masa seçteki gibi pencereye alalım").
// Misafir ismi bunun dışında — o yerinde düzenlenmeye devam ediyor.
type DuzenleAlan = "saat" | "telefon" | "pax" | "not";
// Yeni rezervasyon formundaki "Yedek" düğmesi — masa tutmayan, sıra bekleyen rezervasyon
// (Gökhan, 2026-08-11). Hap buton, PAGE_STANDARDS madde 7.
function YedekDugmesi({ acik, onTikla, ipucu }: { acik: boolean; onTikla: () => void; ipucu?: string }) {
  return (
    <button
      onClick={onTikla}
      title={ipucu ? `Yedek: masa tutmaz, sıra bekler. Yer boşalınca yerleştirilir.
${ipucu}` : "Yedek: masa tutmaz, sıra bekler. Yer boşalınca yerleştirilir."}
      style={{
        all: "unset", cursor: "pointer", flexShrink: 0, padding: "8px 13px", borderRadius: 10,
        border: `1px solid ${acik ? "var(--brand)" : "var(--line-2)"}`,
        background: acik ? "var(--recede)" : "var(--card)",
        color: acik ? "var(--brand)" : "var(--muted)", fontSize: 12.5, fontWeight: 600,
      }}
    >
      Yedek
    </button>
  );
}

const DUZENLE_BASLIK: Record<DuzenleAlan, string> = { saat: "Saat", telefon: "Telefon", pax: "Kişi sayısı", not: "Not" };
const DUZENLE_IPUCU: Record<DuzenleAlan, string> = { saat: "19:30", telefon: "05xx…", pax: "4", not: "Not…" };
// Açılır pencerelerin ekran konumu — tıklanan düğmenin ölçüsünden hesaplanır (menuKonum).
// Açılır pencerenin ekran konumu. yukari=true ise pencere düğmenin ÜSTÜNE açılıyor; o zaman
// üst kenar değil ALT kenar sabitleniyor (altSinir), böylece pencerenin boyunu önceden
// bilmeye gerek kalmıyor — ne kadar uzarsa yukarı doğru uzuyor.
type Konum = { left: number; top: number; width: number; height: number; yukari: boolean; altSinir: number };

// Yeni "geldi" olan kaydı fark edince kısa bir bip — dosya yok, Web Audio ile üretiliyor,
// izin ilk dokunuşta alınıyor (tarayıcılar sesi kullanıcı hareketi olmadan başlatmıyor).
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtxCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}
function unlockAudio() {
  const Ctx = getAudioCtxCtor();
  if (!Ctx) return;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume().catch(() => {});
}
function playArrivalBeep() {
  try {
    const ctx = sharedAudioCtx;
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch { /* Web Audio desteklenmiyor olabilir — sessizce geç */ }
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([150, 80, 150]);
}

// Kişi Kartı (Gökhan, 2026-08-05: "sistem müşteriyi tanıyacak... kişi kartında beraber
// geldikleri gibi bir seçenek olacak") — telefon numarasına bağlı geçmiş (geldi/gelmedi/
// iptal sayıları), kalıcı not ve elle bağlanmış diğer numaralar. Telefon 10 haneye ulaşınca
// 500ms bekleyip sorar (her tuşta sorgu atmasın).
type KisiZiyaret = { reserved_at: string; party_size: number; note: string | null; status: string; masa: string | null; cancel_reason?: string | null; hesap_tutari?: number | null };
type KisiKarti = {
  kartId: string | null; isim: string | null; kartNotu: string | null;
  dogumGunu: string | null; vip: boolean; yemekTercihi: string | null; ickiTercihi: string | null;
  ziyaretSayisi: number; gelmediSayisi: number; iptalSayisi: number; toplamKayit: number;
  ilkKayitTarihi: string | null; ilkZiyaret: string | null; sonZiyaret: string | null;
  sonRezervasyonDurumu: string | null;
  ortalamaKisi: number | null; enSikGunNo: number | null; enSikSaat: number | null; enSikMasa: string | null;
  ortalamaKalisDk: number | null; ortalamaSiklikGun: number | null;
  kanalDagilimi: Record<string, number>;
  tumGecmis: KisiZiyaret[];
  baglantilar: { id: string; telefon: string; aciklama: string | null }[];
  // Yapay zekânın yazdığı bilgilendirme (Gökhan, 2026-08-15). aiOzetKayit, yazı
  // üretildiği andaki toplam kayıt sayısı — bugünkü sayıdan farklıysa kişi yeni bir
  // ziyaret yapmış demektir, yazı tazelenir.
  aiOzet: string | null;
  aiOzetKayit: number | null;
  // Bu numarayla hangi isimlerle gelinmiş (Gökhan, 2026-08-15). Numara yine kimlik, kart
  // bölünmüyor; birden fazla isim varsa kartta yazıyor, kararı personel veriyor.
  kullanilanIsimler: string[];
} | null;
const GUN_ADI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const KANAL_ADI: Record<string, string> = { rezervasyon: "telefonla", kapi: "kapıdan", online: "online" };
// İletişim kanalı — İstatistikler'deki Kanallar sekmesi için (Gökhan, 2026-08-07: "WhatsApp,
// Instagram, Google gibi ayrımı yapalım"). Kapıdan/online gelenlerde otomatik dolar (soru
// sorulmaz), sadece personel telefonla/elle girerken sorulur.
const ILETISIM_KANALI_ADI: Record<string, string> = {
  telefon: "Telefon", whatsapp: "WhatsApp", instagram: "Instagram", google: "Google",
  web_sitesi: "Web sitesi", yuz_yuze: "Yüz yüze", online: "Online", diger: "Diğer",
};
const ILETISIM_KANALI_SECENEKLERI = ["telefon", "whatsapp", "instagram", "google", "diger"];
const DURUM_KISA: Record<string, string> = { bekleniyor: "Bekliyor", geldi: "Geldi", oturdu: "Oturuyor", tamamlandi: "Tamamlandı", gelmedi: "Gelmedi", iptal: "İptal" };
const DURUM_RENK: Record<string, string> = { bekleniyor: "var(--muted)", geldi: "var(--info)", oturdu: "var(--brand)", tamamlandi: "var(--brand)", gelmedi: "var(--danger)", iptal: "var(--danger)" };
// Yıl yok — kişi kartındaki bu tarihler hep yakın geçmiş, ay+gün yeterli (Gökhan,
// 2026-08-08: "bu değişken bilgilerde yıl kullanmana gerek yok" — dar mobil kartta
// yılın alt satıra taşmasına da bu şekilde gerek kalmıyor).
const tarihKisa = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short" }).format(new Date(iso));
// "3 gün", "2 ay" gibi — kart yazılarında sayı yığını yerine okunur süre.
const sureYazisi = (gun: number) => {
  if (gun < 30) return `${gun} gün`;
  if (gun < 365) return `${Math.round(gun / 30)} ay`;
  return `${Math.round((gun / 365) * 10) / 10} yıl`;
};
// TELEFONDA numaraya dokununca arama ekranı açılır (Gökhan, 2026-08-15).
const telLinki = (tel: string) => `tel:${tel.trim().replace(/^\+/, "00").replace(/\D/g, "")}`;
// BİLGİSAYARDA arama yapacak uygulama yok, tarayıcı "hangi uygulamayla açayım" diye
// soruyordu — orada numara WhatsApp'ta açılıyor (Gökhan: "pc'de tanımlı whatsapp
// açılabilir"). Numara ülke koduyla yazılır: 0532… → 90532…
const waNumarasi = (tel: string) => {
  const d = tel.trim().replace(/^\+/, "").replace(/\D/g, "");
  if (d.startsWith("90")) return d;
  if (d.startsWith("0")) return `90${d.slice(1)}`;
  return d.length === 10 ? `90${d}` : d;
};
const waLinki = (tel: string) => `https://wa.me/${waNumarasi(tel)}`;
// Hesap tutarı yazısı — "12.500 TL". Kuruş gösterilmiyor, listede yer kaplıyor.
const tutarYazisi = (tl: number) => `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(tl)} TL`;
function useKisiKarti(phone: string, restaurantId: string | null, refreshKey: number, kisiKartiId?: string | null): KisiKarti {
  const [kart, setKart] = useState<KisiKarti>(null);
  const digits = phone.replace(/\D/g, "");
  // ID varsa (isim aramasından seçilmiş, kesinleşmiş müşteri) telefon 10 hane olmasa bile
  // arama geçerli — kimlik artık ID'de, metinde değil.
  const gecerli = !!restaurantId && (digits.length >= 10 || !!kisiKartiId);

  // Numara 10 haneden kısaldıysa (silindi/değişti) kartı hemen temizle — render sırasında,
  // effect içinde değil (react-hooks/set-state-in-effect'i tetiklememek için).
  const [oncekiGecerli, setOncekiGecerli] = useState(gecerli);
  if (gecerli !== oncekiGecerli) {
    setOncekiGecerli(gecerli);
    if (!gecerli) setKart(null);
  }

  useEffect(() => {
    if (!gecerli || !restaurantId) return;
    const id = setTimeout(() => {
      supabase.rpc("kisi_karti_getir", { p_restaurant: restaurantId, p_phone: phone, p_kisi_karti_id: kisiKartiId ?? null }).then(({ data }) => {
        const row = (data as {
          kart_id: string | null; isim: string | null; kart_notu: string | null;
          dogum_gunu: string | null; vip: boolean; yemek_tercihi: string | null; icki_tercihi: string | null;
          ziyaret_sayisi: number; gelmedi_sayisi: number; iptal_sayisi: number; toplam_kayit: number;
          ilk_kayit_tarihi: string | null; ilk_ziyaret: string | null; son_ziyaret: string | null;
          son_rezervasyon_durumu: string | null;
          ortalama_kisi: number | null;
          en_sik_gun_no: number | null; en_sik_saat: number | null; en_sik_masa: string | null;
          ortalama_kalis_dk: number | null; ortalama_siklik_gun: number | null;
          kanal_dagilimi: Record<string, number> | null; tum_gecmis: KisiZiyaret[] | null;
          baglantilar: { id: string; telefon: string; aciklama: string | null }[];
          ai_ozet: string | null; ai_ozet_kayit: number | null;
          kullanilan_isimler: string[] | null;
        }[] | null)?.[0];
        if (!row) { setKart(null); return; }
        setKart({
          kartId: row.kart_id, isim: row.isim, kartNotu: row.kart_notu,
          dogumGunu: row.dogum_gunu, vip: row.vip, yemekTercihi: row.yemek_tercihi, ickiTercihi: row.icki_tercihi,
          ziyaretSayisi: row.ziyaret_sayisi, gelmediSayisi: row.gelmedi_sayisi, iptalSayisi: row.iptal_sayisi,
          toplamKayit: row.toplam_kayit, ilkKayitTarihi: row.ilk_kayit_tarihi, ilkZiyaret: row.ilk_ziyaret, sonZiyaret: row.son_ziyaret,
          sonRezervasyonDurumu: row.son_rezervasyon_durumu,
          ortalamaKisi: row.ortalama_kisi === null ? null : Number(row.ortalama_kisi),
          enSikGunNo: row.en_sik_gun_no, enSikSaat: row.en_sik_saat, enSikMasa: row.en_sik_masa,
          ortalamaKalisDk: row.ortalama_kalis_dk, ortalamaSiklikGun: row.ortalama_siklik_gun,
          kanalDagilimi: row.kanal_dagilimi ?? {}, tumGecmis: row.tum_gecmis ?? [],
          baglantilar: row.baglantilar ?? [],
          aiOzet: row.ai_ozet, aiOzetKayit: row.ai_ozet_kayit,
          kullanilanIsimler: row.kullanilan_isimler ?? [],
        });
      });
    }, 500);
    return () => clearTimeout(id);
  }, [phone, restaurantId, refreshKey, gecerli, kisiKartiId]);
  return kart;
}

type IsimKayit = { reserved_at: string; party_size: number; status: string; guest_phone: string | null; note: string | null };
type IsimGecmisi = {
  bulunanTelefon: string | null;
  ziyaretSayisi: number; gelmediSayisi: number; iptalSayisi: number; toplamKayit: number;
  sonZiyaret: string | null; ortalamaKisi: number | null; enSikMasa: string | null;
  sonKayitlar: IsimKayit[];
} | null;

// Telefonu olmayan rezervasyonlar için İSİMLE geçmiş (Gökhan: "telefon numarası yazılmayan
// rezervasyonlara kişi kartı açılmıyor, rezervasyon alınan herkese kişi kartı açılacak").
// Aynı hook, yeni rezervasyon formunda isim yazılırken de kullanılıyor (Gökhan: "Hülya Avşar
// yazarken daha önce o isme rezervasyon varsa çıkacak, kullanıcı ona göre konuşacak").
function useIsimGecmisi(isim: string, restaurantId: string | null, refreshKey: number): IsimGecmisi {
  const [gecmis, setGecmis] = useState<IsimGecmisi>(null);
  const gecerli = !!restaurantId && isim.trim().length >= 3;

  const [oncekiGecerli, setOncekiGecerli] = useState(gecerli);
  if (gecerli !== oncekiGecerli) {
    setOncekiGecerli(gecerli);
    if (!gecerli) setGecmis(null);
  }

  useEffect(() => {
    if (!gecerli || !restaurantId) return;
    const id = setTimeout(() => {
      supabase.rpc("isim_ile_gecmis", { p_restaurant: restaurantId, p_isim: isim }).then(({ data }) => {
        const row = (data as {
          bulunan_telefon: string | null; ziyaret_sayisi: number; gelmedi_sayisi: number; iptal_sayisi: number;
          toplam_kayit: number; son_ziyaret: string | null; ortalama_kisi: number | null; en_sik_masa: string | null;
          son_kayitlar: IsimKayit[];
        }[] | null)?.[0];
        if (!row || row.toplam_kayit === 0) { setGecmis(null); return; }
        setGecmis({
          bulunanTelefon: row.bulunan_telefon, ziyaretSayisi: row.ziyaret_sayisi, gelmediSayisi: row.gelmedi_sayisi,
          iptalSayisi: row.iptal_sayisi, toplamKayit: row.toplam_kayit, sonZiyaret: row.son_ziyaret,
          ortalamaKisi: row.ortalama_kisi === null ? null : Number(row.ortalama_kisi), enSikMasa: row.en_sik_masa,
          sonKayitlar: row.son_kayitlar,
        });
      });
    }, 500);
    return () => clearTimeout(id);
  }, [isim, restaurantId, refreshKey, gecerli]);
  return gecmis;
}

// İsimle geçmiş özeti — kişi kartının aksine düzenlenemez (not eklenemez, numara bağlanamaz):
// telefon olmadığı için tutunacak sabit bir anahtar yok. Sadece "bu isimde daha önce böyle bir
// geçmiş var" bilgisini gösterir.
function IsimGecmisiOzet({ gecmis }: { gecmis: IsimGecmisi }) {
  if (!gecmis) return null;
  return (
    <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6, background: "var(--recede)" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gold-text)", textTransform: "uppercase" }}>Bu isimde geçmiş bulundu</div>
      <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.6 }}>
        Toplam <span className="tnum" style={{ fontWeight: 600 }}>{gecmis.toplamKayit}</span> kayıt ·{" "}
        <span className="tnum" style={{ fontWeight: 600 }}>{gecmis.ziyaretSayisi}</span> geldi ·{" "}
        <span className="tnum" style={{ fontWeight: 600 }}>{gecmis.gelmediSayisi}</span> gelmedi ·{" "}
        <span className="tnum" style={{ fontWeight: 600 }}>{gecmis.iptalSayisi}</span> iptal
        {gecmis.ortalamaKisi !== null && <> · ortalama <span className="tnum">{gecmis.ortalamaKisi}</span> kişi</>}
        {gecmis.enSikMasa && <> · en çok {gecmis.enSikMasa} masasında</>}
      </div>
      {gecmis.bulunanTelefon && (
        <div style={{ fontSize: 12, color: inkSoft }}>Kayıtlı telefon: <span className="tnum">{gecmis.bulunanTelefon}</span></div>
      )}
      {gecmis.sonKayitlar.length > 0 && (
        <div style={{ fontSize: 11.5, color: inkSoft, lineHeight: 1.7 }}>
          {gecmis.sonKayitlar.slice(0, 3).map((k, i) => (
            <div key={i}>{tarihKisa(k.reserved_at)} · {k.party_size} kişi · {DURUM_KISA[k.status] ?? k.status}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// İSİM ARAMA (Gökhan, 2026-08-07): "isim yazıyorum, soy ismi yazmaya geçtiğimde tanımaya
// başlayacak — isimden tanıma yok, isim soy isimden tanımaya başlayacak." Tek "İsim soyisim"
// kutusu — ilk BOŞLUKTAN sonrasına bir harf yazılınca arama tetiklenir, isim kısmı henüz tek
// başına hiçbir şey aramaz.
function isimSoyadAyir(text: string): { isim: string; soyadPrefix: string } | null {
  const t = text.trimStart();
  const i = t.indexOf(" ");
  if (i < 0) return null;
  const isim = t.slice(0, i).trim();
  const soyadPrefix = t.slice(i + 1).trim();
  if (!isim || !soyadPrefix) return null;
  return { isim, soyadPrefix };
}

// "0532 ••• •• 41" — aynı isimde birden fazla aday çıkarsa hangisi olduğunu telefonla ayırt
// etmeye yeter, numarayı tam açık etmez.
const telefonMaskele = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  const norm = d.length === 10 ? `0${d}` : d;
  if (norm.length !== 11) return phone;
  return `${norm.slice(0, 4)} ••• •• ${norm.slice(9, 11)}`;
};

type MusteriAday = { kisiKartiId: string | null; isim: string; telefon: string };

// kilitli: bir aday zaten seçildiyse arama tamamen durur (Gökhan: "müşteri kesinleşir, arama
// listesi kapanır").
function useMusteriAdaylari(text: string, restaurantId: string | null, kilitli: boolean): MusteriAday[] {
  const [adaylar, setAdaylar] = useState<MusteriAday[]>([]);
  const ayrik = kilitli ? null : isimSoyadAyir(text);
  const isimKey = ayrik?.isim ?? "";
  const soyadKey = ayrik?.soyadPrefix ?? "";

  const [oncekiGecerli, setOncekiGecerli] = useState(!!ayrik);
  if (!!ayrik !== oncekiGecerli) {
    setOncekiGecerli(!!ayrik);
    if (!ayrik) setAdaylar([]);
  }

  useEffect(() => {
    if (!ayrik || !restaurantId) return;
    const id = setTimeout(() => {
      supabase.rpc("isim_soyad_ile_ara", { p_restaurant: restaurantId, p_isim: isimKey, p_soyad_prefix: soyadKey }).then(({ data }) => {
        const rows = (data as { kisi_karti_id: string | null; guest_name: string; guest_phone: string }[] | null) ?? [];
        setAdaylar(rows.map((r) => ({ kisiKartiId: r.kisi_karti_id, isim: r.guest_name, telefon: r.guest_phone })));
      });
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isimKey, soyadKey, restaurantId, !!ayrik]);
  return adaylar;
}

function MusteriAdaylariListesi({ adaylar, onSec }: { adaylar: MusteriAday[]; onSec: (a: MusteriAday) => void }) {
  if (adaylar.length === 0) return null;
  return (
    <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, overflow: "hidden" }}>
      {adaylar.map((a, i) => (
        <button
          key={i} type="button" onClick={() => onSec(a)}
          style={{
            all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
            width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 13,
            borderTop: i > 0 ? "1px solid var(--line)" : "none",
          }}
        >
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>{a.isim}</span>
          <span className="tnum" style={{ color: inkSoft }}>{telefonMaskele(a.telefon)}</span>
        </button>
      ))}
    </div>
  );
}

// Mobil rezervasyon listesi (Gökhan, 2026-08-07: "alışveriş listesi gibi yaz, isim karşısında
// kişi sayısı"). Geldi/Gelmedi/İptal/Kalktı satırda yok — isme dokununca açılan kişi kartında
// (bkz. kartFor bloğu). Kategori işareti şimdilik sadece VIP (kisi_kartlari.vip), toplu ve
// tek sorguyla getiriliyor — her satır için ayrı ayrı sorgu atmıyor.
/** MASA VE KAPASİTE ÖZETİ — telefon ve tablette aynı satırlar (Gökhan, 2026-08-30).
 *  Tek yerde durur: telefonda listenin üstünde, tablette tarih ile "Yeni rezervasyon"
 *  arasında çiziliyor. orta: yan çevrilmiş telefonda araya giren gün seçimi. */
type OzetDegerleri = {
  toplamMasa: number; toplamKapasite: number; doluluk: number; yedekMasa: number; yedekPax: number;
  /** Sınıf başına rezervasyon sayısı — webdeki sayaçların RZV rakamı (Gökhan, 2026-08-30). */
  yemekRez: number; geceRez: number; ayaktaRez: number;
  /** Salondaki toplam masa ve kaçının tutulduğu. */
  masaAdet: number; masaDolu: number;
  locaMasa: number; locaPax: number; locaIstendi: number;
  eglenceAktif: boolean; geceKapasite: number; gecePax: number; bistroSayisi: number; geceTalep: number;
  ayaktaKapasite: number; ayaktaPax: number;
  bekleyenMasa: number; bekleyenPax: number; fixAcik: boolean; fixSayisi: number; fixPax: number;
};
function KisaOzet({
  toplamMasa, toplamKapasite, doluluk, yemekRez, geceRez, ayaktaRez, masaAdet, masaDolu, yedekMasa, yedekPax, locaMasa, locaPax, locaIstendi,
  eglenceAktif, geceKapasite, gecePax, bistroSayisi, geceTalep, ayaktaKapasite, ayaktaPax,
  bekleyenMasa, bekleyenPax, fixAcik, fixSayisi, fixPax, orta,
}: OzetDegerleri & { orta?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13, color: inkSoft, flexShrink: 0 }}>
      {/* Rakamlar webdeki sayaçlarla AYNI kaynaktan geliyor (Gökhan, 2026-08-19: "aynı
          yerden çalışamıyor mu"). */}
      {orta && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          {orta}
        </div>
      )}
      {/* SÜTUNLAR HİZALI (Gökhan, 2026-08-30). Sınıf adı büyük harf ve siyah; "Kapasite"
          kelimesi yazılmıyor. Bütün rakamlar sağa yaslı — aynı basamaklar alt alta, tek
          basamaklı sayı iki basamaklının son basamağının altına geliyor.
          Her sayı çifti üç sütuna ayrılıyor — soldaki sağa yaslı, bölü çizgisi ortada,
          sağdaki sola yaslı — böylece bütün satırlarda rakamlar ve çizgiler alt alta.
          Sıra: sınıf adı | kapasite | / | doluluk | pax | adet | / | tutulan | birim. */}
      <div style={{ display: "grid", gridTemplateColumns: "auto auto auto auto auto auto auto auto auto", columnGap: 4, rowGap: 2, alignItems: "baseline" }}>
        <span style={ozetBaslik}>Yemek</span>
        <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{toplamKapasite}</span>
        <span style={{ color: inkSoft }}>/</span>
        <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: doluluk >= toplamKapasite ? "var(--gold-text)" : "var(--ink)" }}>{doluluk}</span>
        <span style={{ paddingRight: 4 }}>pax</span>
        {/* Masa değil REZERVASYON sayılıyor (Gökhan, 2026-08-30: "birleşen masalar tek masa
            olur, rezervasyon sayılır"): solda kaç rezervasyon alınabilir, sağda kaç alınmış. */}
        {masaAdet > 0 ? (<>
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{masaAdet}</span>
          <span style={{ color: inkSoft }}>/</span>
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: yemekRez >= masaAdet ? "var(--gold-text)" : "var(--ink)" }}>{yemekRez}</span>
          <span>rzv</span>
        </>) : (<><span /><span /><span /><span /></>)}

        {/* GECE — bistroda kişi sınırı yoksa kapasite sütunu boş kalıyor ama geceye kalan
            kişi sayısı yazıyor (Gökhan, 2026-08-30: "gecenin de paxı sayılıyor ama orada
            yazmıyor"). */}
        {eglenceAktif && (bistroSayisi > 0 || ayaktaKapasite > 0) && (<>
          <span style={ozetBaslik}>Gece</span>
          {geceKapasite > 0 ? (
            <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{geceKapasite}</span>
          ) : <span />}
          {geceKapasite > 0 ? <span style={{ color: inkSoft }}>/</span> : <span />}
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{gecePax}</span>
          <span style={{ paddingRight: 4 }}>pax</span>
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{bistroSayisi}</span>
          <span style={{ color: inkSoft }}>/</span>
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: geceRez >= bistroSayisi ? "var(--gold-text)" : "var(--ink)" }}>{geceRez}</span>
          <span>rzv</span>
        </>)}

        {eglenceAktif && ayaktaKapasite > 0 && (<>
          <span style={ozetBaslik}>Ayakta</span>
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{ayaktaKapasite}</span>
          <span style={{ color: inkSoft }}>/</span>
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: ayaktaPax >= ayaktaKapasite ? "var(--gold-text)" : "var(--ink)" }}>{ayaktaPax}</span>
          <span style={{ paddingRight: 4 }}>pax</span>
          <span /><span /><span /><span />
        </>)}

        {/* LOCA — locanın kişi kapasitesi yok; pax sütununda sadece oturan kişi sayısı. */}
        {locaMasa > 0 && (<>
          <span style={ozetBaslik}>Loca</span>
          <span /><span />
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{locaPax}</span>
          <span style={{ paddingRight: 4 }}>pax</span>
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{locaMasa}</span>
          <span style={{ color: inkSoft }}>/</span>
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: locaIstendi >= locaMasa ? "var(--gold-text)" : "var(--ink)" }}>{locaIstendi}</span>
          <span>rzv</span>
        </>)}

        {/* Yedek, bekleyen ve fix de aynı ızgarada — rakamları aynı sütunlarda. */}
        {yedekMasa > 0 && (<>
          <span style={ozetBaslik}>Yedek</span>
          <span /><span />
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--brand)" }}>{yedekPax}</span>
          <span style={{ paddingRight: 4 }}>pax</span>
          <span /><span />
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--brand)" }}>{yedekMasa}</span>
          <span>masa</span>
        </>)}
        {bekleyenMasa > 0 && (<>
          <span style={ozetBaslik}>Bekleyen</span>
          <span /><span />
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--gold-text)" }}>{bekleyenPax}</span>
          <span style={{ paddingRight: 4 }}>pax</span>
          <span /><span />
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--gold-text)" }}>{bekleyenMasa}</span>
          <span>masa</span>
        </>)}
        {fixAcik && (<>
          <span style={ozetBaslik}>Fix</span>
          <span /><span />
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{fixPax}</span>
          <span style={{ paddingRight: 4 }}>pax</span>
          <span /><span />
          <span className="tnum" style={{ textAlign: "right", fontWeight: 600, color: "var(--ink)" }}>{fixSayisi}</span>
          <span>rzv</span>
        </>)}
      </div>
    </div>
  );
}

/** Özet satırlarının başlığı — büyük harf ve siyah (Gökhan, 2026-08-30). */
// Tablet başlığındaki kayıt düğmelerinin eni — arama kutusu da bu ölçüden hesaplanıyor
// (Gökhan, 2026-08-30: "arama satırı da kapı girişi butonunun bittiği yerde bitsin").
const TABLET_DUGME_EN = 141; // 160'tan 5 mm kısaldı (Gökhan, 2026-08-30)
const TABLET_DUGME_ARA = 6;

const ozetBaslik: React.CSSProperties = { paddingRight: 4, textTransform: "uppercase", color: "var(--ink)", fontWeight: 600, letterSpacing: 0.2 };

/** ARAMA KUTUSU — telefonda listenin üstünde, tablette üst bölgede aynı parça (Gökhan,
 *  2026-08-30). eni/boy verilmezse kutu bulunduğu yeri doldurur. */
// Listenin üstündeki kayıt düğmeleri — üçü de aynı ende (Gökhan, 2026-08-31).
// Üç yeşil düğme yarım cm daraldı; aramaya o kadar yer açıldı (Gökhan, 2026-08-31).
const ustSatirYesil: React.CSSProperties = { minWidth: "calc(170px - 0.5cm)" };

// Telefondaki dörtlü düğme ızgarası — dar ekrana sığsın diye yazı küçük, kutu alçak
// (Gökhan, 2026-08-31).
const telDugme: React.CSSProperties = {
  // Boyları tarih kutusuyla aynı (Gökhan, 2026-09-01).
  minWidth: 0, height: 38, padding: "0 8px", fontSize: 12, whiteSpace: "nowrap",
  justifyContent: "center", display: "flex", alignItems: "center", boxSizing: "border-box",
};

const ustSatirDugme: React.CSSProperties = {
  flexShrink: 0, minWidth: 170, justifyContent: "center", alignItems: "center",
  display: "flex", whiteSpace: "nowrap",
  // Silik düğme dolu düğmelerden ince kalıyordu; üçünün boyu da aynı (Gökhan, 2026-08-31).
  height: 34, boxSizing: "border-box",
};

// Telefondaki sütun başlıkları — web başlıklarıyla aynı dil, satırlarla aynı sıra
// (Gökhan, 2026-08-31).
const mobilBaslik: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, color: "var(--ink)",
  flexShrink: 0, whiteSpace: "nowrap", textTransform: "uppercase",
};

function AramaKutusu({ arama, onArama, eni, boy }: { arama: string; onArama: (v: string) => void; eni?: number; boy?: number }) {
  return (
    <div style={{ position: "relative", flexShrink: 0, width: eni, maxWidth: "100%" }}>
      <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: inkSoft, pointerEvents: "none" }} />
      <input
        value={arama} onChange={(e) => onArama(e.target.value)}
        placeholder="İsim, telefon, masa, not ara…"
        style={{ ...inp, width: "100%", height: boy ?? inp.height, paddingLeft: 32, paddingRight: arama ? 30 : 10, boxSizing: "border-box" }}
      />
      {arama && (
        <button onClick={() => onArama("")} aria-label="Aramayı temizle" style={{ all: "unset", cursor: "pointer", position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: inkSoft, display: "flex" }}>
          <X size={15} />
        </button>
      )}
    </div>
  );
}

function MobilRezervasyonListesi({
  rows, toplamMasa, toplamKapasite, doluluk, yedekMasa, yedekPax,
  locaMasa, locaPax, locaIstendi,
  eglenceAktif, geceKapasite, gecePax, bistroSayisi, geceTalep, ayaktaKapasite, ayaktaPax,
  bekleyenMasa, bekleyenPax, fixAcik, fixSayisi, fixPax,
  masaBilgi, gun, bugunMu, onGunDegistir, onYeniRezervasyon, onKartAc, onKilit, yemekRez, geceRez, ayaktaRez, masaAdet, masaDolu,
  arama, onArama, yatay, acilir, kendiSuzgeci, kendiEtiketi, benimMi, sadeceBenim, onSadeceBenim, sadeceBaslik, tarihiGizle, aramaEni, aramaBoy, aramayiGizle, ozetiGizle, ustIcerik,
  tutarGirilir, onTutar,
}: {
  rows: Rez[];
  /** O günün rezervasyonları düşüldükten sonra KALAN masa — webdeki "Masa" ile aynı. */
  toplamMasa: number;
  toplamKapasite: number; doluluk: number;
  yedekMasa: number; yedekPax: number;
  /** Loca otomatik dağıtılmadığı için yukarıdaki masa/kapasite sayılarına girmiyor; ayrı satır. */
  locaMasa: number; locaPax: number; locaIstendi: number;
  /** Gece (bistro) düzeninin kapasitesi ve doluluğu — restoran + eğlence dışında hepsi 0. */
  eglenceAktif: boolean; geceKapasite: number; gecePax: number; bistroSayisi: number; geceTalep: number; ayaktaKapasite: number; ayaktaPax: number;
  bekleyenMasa: number; bekleyenPax: number;
  fixAcik: boolean; fixSayisi: number; fixPax: number;
  /** Satırda gösterilecek masa — webdeki masa kutusuyla aynı: esas masa, fazlası "+N",
      kişiye yetmiyorsa uyarı. Masası yoksa null. */
  masaBilgi: (r: Rez) => { ad: string; ekstra: number; yetersiz: boolean } | null;
  gun: string; bugunMu: boolean; onGunDegistir: (g: string) => void;
  onYeniRezervasyon: () => void; onKartAc: (r: Rez) => void; onKilit: (r: Rez) => void;
  arama: string; onArama: (v: string) => void; yatay: boolean;
  /** Bu satır tıklanıp kartı açılabilir mi — kısıtlı rollerde sadece kendi girdikleri. */
  acilir: (r: Rez) => boolean;
  /** Süzgeç düğmesi çıksın mı — garsonda postası dağıtılmışsa, PR'da her zaman. */
  kendiSuzgeci: boolean;
  /** Düğmenin yazısı: garsonda "Benim masalarım", PR'da "Benim rezervasyonlarım". */
  kendiEtiketi: string;
  /** Bu satır bakanın kendi işi mi — garsonda postasındaki masa, PR'da kendi girdiği kayıt. */
  benimMi: (r: Rez) => boolean;
  sadeceBenim: boolean;
  onSadeceBenim: (v: boolean) => void;
  /** Tablette satırları webdeki liste çiziyor — bu bileşen sadece üst kısmı veriyor. */
  sadeceBaslik?: boolean;
  /** Tablette tarih işletme adının yanında duruyor; burada tekrar çizilmiyor. */
  tarihiGizle?: boolean;
  /** Arama kutusunun eni — tablette üstteki tarih öbeğiyle aynı yerde bitiyor. */
  aramaEni?: number;
  /** Arama kutusunun boyu — tablette listedeki satırlarla aynı yükseklikte duruyor. */
  aramaBoy?: number;
  /** Tablette arama kutusunu üst bölge çiziyor; bu bileşen çizmiyor. */
  aramayiGizle?: boolean;
  /** Telefonda kapasite özetini üst bölge çiziyor — sağ üstte (Gökhan, 2026-08-31). */
  ozetiGizle?: boolean;
  /** Telefonda üst beyaz kutunun başına giren blok: kimlik, tarih ve dört düğme
   *  (Gökhan, 2026-08-31: "üstteki her şey üst kutuda"). */
  ustIcerik?: React.ReactNode;
  yemekRez: number; geceRez: number; ayaktaRez: number;
  masaAdet: number; masaDolu: number;
  /** Bu satırda hesap tutarı kutusu çıksın mı — PR'ın işi bitmiş kendi masaları. */
  tutarGirilir: (r: Rez) => boolean;
  onTutar: (r: Rez, metin: string) => void;
}) {
  // VIP yıldızı satırdan kalktı (Gökhan, 2026-08-18) — onu getiren sorgu da kalktı.

  // Gün okları + tarih + "Bugün" + "Yeni rezervasyon" — dik ve yatay düzende aynı düğmeler,
  // sadece durdukları yer değişiyor. Tek yerde tanımlı, iki yere kopyalanmıyor.
  const gunKontrolleri = (
    <>
      {/* Telefonda ileri-geri okları kalktı (Gökhan, 2026-08-31: "tarih oklarını kaldır,
          tarih tıklayınca takvimden değişsin") — gün takvimden seçiliyor. */}
      {!tarihiGizle && (<>
        <DatePicker value={gun} onChange={onGunDegistir} style={{ padding: "8px 10px" }} />
        {!bugunMu && <button onClick={() => onGunDegistir(bugunIstanbul())} style={btnGhost}>Bugün</button>}
      </>)}
      {/* Yatayda tarih ile "Yeni rezervasyon" arasında yaklaşık 1,5 cm boşluk (Gökhan,
          2026-08-10) — sayaçların ortasında yan yana dururken birbirine yapışmasınlar.
          Dik tutulduğunda düğme satırın sonuna dayanıyor: sağ kenarı alttaki rezervasyon
          satırlarının sağ kenarıyla aynı hizada (Gökhan, 2026-08-19). */}
      {/* Düğme üst satıra taşındı (Gökhan, 2026-08-30: "mobilde rezervasyon ekleyi en üst
          satıra al"); sadece yan çevrilmiş telefonda burada kalıyor, orada üst satır yok. */}
      {yatay && <button onClick={onYeniRezervasyon} style={{ ...btnPrimary, marginLeft: 52, padding: "9px 12px" }}><Plus size={14} /> Yeni rezervasyon</button>}
    </>
  );

  return (
    // Sadece başlık çizilirken kutu içeriği kadar yer kaplıyor; altındaki web listesi
    // kalan yeri alıyor (Gökhan, 2026-08-30).
    <div style={{ display: "flex", flexDirection: "column", gap: sadeceBaslik ? 12 : "1mm", flex: sadeceBaslik ? "0 0 auto" : 1, minHeight: 0 }}>
      {/* ÜST BEYAZ KUTU — kimlik, tarih, düğmeler, arama ve sütun başlıkları; rezervasyon
          satırları aşağıdaki kendi kutusunda (Gökhan, 2026-08-31: webdeki düzenin aynısı).
          Tablette bu bileşen sadece başlık çiziyor, kutuyu sayfa veriyor. */}
      <div style={sadeceBaslik ? { display: "contents" } : {
        background: "var(--card)", border: "1px solid var(--line)", borderRadius: yatay ? 10 : 16,
        padding: yatay ? "8px 10px 0" : "12px 12px 0", flexShrink: 0,
        // Tarih ile arama kutusu arası 2,9 mm (Gökhan, 2026-08-31) — kutuların kendi
        // aralarındaki boşluk bu ölçüye çekildi, başlıkların üstündeki boşluk ayrı veriliyor.
        display: "flex", flexDirection: "column", gap: yatay ? 8 : "1.45mm", boxSizing: "border-box",
      }}>
      {ustIcerik}
      {/* Başlık üstteki kimlik satırına taşındı (Gökhan, 2026-08-08: "rezervasyonlar
          yazısını rezervasyon olarak işletme isminin yanına al") — burada gün seçimi ve
          "Yeni rezervasyon" yan yana ("yeni rezervasyon ekle'nin yanına tarihi koyacaktın"). */}
      {/* Hepsi sola toplu, aralar dar — esnek boşluk (flex:1) "Yeni rezervasyon"u sağa itip
          kutunun dışına taşırıyordu (Gökhan, 2026-08-08: "yeni rezervasyon kutunun dışına
          çıkmış, okları kutuya yaklaştır, tarihi sola yaklaştır"). */}
      {/* Dik tutulduğunda gün seçimi + "Yeni rezervasyon" kendi satırında. Yan çevrilince bu
          satır hiç çizilmez; ikisi de aşağıdaki sayaç satırının ORTASINA girer (Gökhan,
          2026-08-10: "yatayda tarih ve yeni rezervasyon ekleyi de bir satır alta, RZV
          masa/masa ile kapasite/doluluğun arasına al") — kısa ekranda bir satır kazanılıyor,
          sayaçların yanındaki boşluk da dolmuş oluyor. */}
      {!yatay && (
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, minWidth: 0 }}>
        {gunKontrolleri}
      </div>
      )}
      {/* Bilgi bölümü — oran değil düz sayı (Gökhan: "oran değil kapasite karşısında
          doluluğu yazacak"). İki blok karşılıklı: solda Rezervasyon/Masa altlı üstlü sola
          yaslı, sağda Kapasite/Doluluk altlı üstlü sağa yaslı — sağdaki rakamlar alttaki
          satırlardaki kişi sayısı rakamlarının (satır dolgusu 14px) üzerine denk gelsin
          diye aynı sağ boşluk (paddingRight:14) kullanılıyor (Gökhan, 2026-08-08). */}
      {!tarihiGizle && !ozetiGizle && (
        <KisaOzet
          toplamMasa={toplamMasa} toplamKapasite={toplamKapasite} doluluk={doluluk}
          yemekRez={yemekRez} geceRez={geceRez} ayaktaRez={ayaktaRez}
          masaAdet={masaAdet} masaDolu={masaDolu}
          yedekMasa={yedekMasa} yedekPax={yedekPax}
          locaMasa={locaMasa} locaPax={locaPax} locaIstendi={locaIstendi}
          eglenceAktif={eglenceAktif} geceKapasite={geceKapasite} gecePax={gecePax} bistroSayisi={bistroSayisi} geceTalep={geceTalep}
          ayaktaKapasite={ayaktaKapasite} ayaktaPax={ayaktaPax}
          bekleyenMasa={bekleyenMasa} bekleyenPax={bekleyenPax}
          fixAcik={fixAcik} fixSayisi={fixSayisi} fixPax={fixPax}
          orta={yatay ? gunKontrolleri : null}
        />
      )}
      {/* Arama — listenin İLK SATIRININ hemen üstünde (Gökhan, 2026-08-10). Tablette bu
          kutuyu üst bölge çiziyor, orada online rezervasyon satırında duruyor. */}
      {!aramayiGizle && <AramaKutusu arama={arama} onArama={onArama} eni={aramaEni} boy={aramaBoy} />}
      {/* BENİM MASALARIM (Gökhan, 2026-08-18: "garson hem listeyi görebilsin hem de sadece
          kendi masalarını"). Liste tam kalıyor; garsonun kendi postasındaki satırlar zaten
          işaretli, bu düğme de tek dokunuşla sadece onları bırakıyor. Postası olmayan
          garsonda düğme hiç çıkmıyor — basınca boş liste kalırdı. */}
      {kendiSuzgeci && (
        <div style={{ display: "flex", flexShrink: 0 }}>
          <button
            onClick={() => onSadeceBenim(!sadeceBenim)}
            style={{
              all: "unset", cursor: "pointer", flexShrink: 0, padding: "6px 12px", borderRadius: 10,
              border: `1px solid ${sadeceBenim ? "var(--brand)" : "var(--line-2)"}`,
              background: sadeceBenim ? "var(--recede)" : "var(--card)",
              color: sadeceBenim ? "var(--brand)" : "var(--muted)", fontSize: 12.5, fontWeight: 600,
            }}
          >
            {kendiEtiketi}
          </button>
        </div>
      )}
      {/* SÜTUN BAŞLIKLARI (Gökhan, 2026-08-31: "başlıklar geri gelsin") — satırlardaki
          sırayla: sıra no, saat, misafir, masa, pax. Üst kutunun en altında. */}
      {!sadeceBaslik && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 calc(14px - 2mm) 8px 0", flexShrink: 0 }}>
          {/* Genişlikler satırdakilerle birebir: sıra no 16, saat 32, misafir esnek,
              masa 60, pax 26, sonda kilidin yeri (Gökhan, 2026-08-31). */}
          <span style={{ ...mobilBaslik, width: 16, textAlign: "right" }}>SN</span>
          <span style={{ ...mobilBaslik, width: 32 }}>SAAT</span>
          <span style={{ ...mobilBaslik, flex: 1, minWidth: 0 }}>MİSAFİR</span>
          <span style={{ ...mobilBaslik, width: 60, textAlign: "center" }}>MASA</span>
          <span style={{ width: 18, flexShrink: 0 }} />
          <span style={{ ...mobilBaslik, width: 26, textAlign: "right" }}>PAX</span>
        </div>
      )}
      </div>

      {/* TABLETTE SATIRLARI BU BİLEŞEN ÇİZMİYOR (Gökhan, 2026-08-30: "sadece az önceki
          görüntüye webdeki satırları istiyorum"). Üst kısım — gün seçimi, sayaçlar, arama —
          aynen duruyor; satırları webdeki liste veriyor. */}
      {!sadeceBaslik && (
      <div style={{
        flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, display: "flex", flexDirection: "column", gap: 6,
        background: "var(--card)", border: "1px solid var(--line)", borderRadius: yatay ? 10 : 16,
        padding: yatay ? "8px 10px" : 12, boxSizing: "border-box",
      }}>
        {rows.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bu gün için kayıt yok.</div>}
        {rows.map((r, i) => {
          const info = DURUM_INFO[r.status] ?? DURUM_INFO.bekleniyor;
          const masa = masaBilgi(r);
          // İKİNCİ SATIR — sadece garsonun kendi listesinde ve notu olan rezervasyonda
          // (Gökhan, 2026-08-18: "garsonun kendi listesinde not varsa ikinci satır açılacak").
          // Yan çevrilince her şey tek satıra döner, orada yer var.
          const notSatiri = sadeceBenim && !yatay && !!r.note?.trim();
          return (
            // SATIR BUTON DEĞİL DIV (Gökhan, 2026-08-19): PR kendi masalarının hesabını satırın
            // içindeki kutuya yazıyor, yazı kutusu butonun içine konamıyor. Dokunuşla kart
            // açılması aynı şekilde çalışıyor.
            <div
              key={r.id}
              role="button" tabIndex={-1}
              // Kartı açamayacak rolde satır hiç tıklanmıyor (Gökhan, 2026-08-17: "hiçbir şey
              // açılmasın, tıklanamasın").
              onClick={acilir(r) ? () => onKartAc(r) : undefined}
              style={{
                all: "unset", cursor: acilir(r) ? "pointer" : "default", display: "flex", alignItems: "center", gap: 8,
                background: info.bg, borderRadius: 10, padding: "12px 14px", boxSizing: "border-box", flexShrink: 0,
                // Kişi sayısı ve kilit 2 mm daha sağa (Gökhan, 2026-08-18) — sağ boşluk o
                // kadar kısılıyor, ikisi birlikte kenara yanaşıyor.
                paddingRight: "calc(14px - 2mm)",
                // Garsonun kendi postasındaki masa, tam listenin içinde bir bakışta ayrılsın
                // diye kenarı işaretli (Gökhan, 2026-08-18).
                borderLeft: kendiSuzgeci && benimMi(r) ? "4px solid var(--brand)" : undefined,
                paddingLeft: kendiSuzgeci && benimMi(r) ? 10 : undefined,
              }}
            >
              {/* SATIRDA NE VAR (Gökhan, 2026-08-18): sıra no, saat, isim soyisim, masa
                  kutusu, kişi sayısı, kilit. VIP yıldızı ve MİSAFİR/YEDEK etiketleri
                  kaldırıldı — telefonda yer dar. Saat artık dik tutarken de yazıyor:
                  akşamın en çok bakılan bilgisi o. */}
              {/* Sıra numarası — masaüstü tablodaki SNO ile aynı (Gökhan, 2026-08-08). */}
              <span className="tnum" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", flexShrink: 0, width: 16, textAlign: "right" }}>{i + 1}</span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", flexShrink: 0, whiteSpace: "nowrap" }}>{saatFmt.format(new Date(r.reserved_at))}</span>
              {notSatiri ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.guest_name}</div>
                  <div style={{ fontSize: 12, color: inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note}</div>
                </div>
              ) : (
                <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.guest_name}</span>
              )}
              {/* MASA KUTUSU — webdekiyle aynı gösterim (Gökhan, 2026-08-19: "masaları da
                  webde nasıl gösteriyorsa aynı şekilde göster"): kutuda sadece esas masa
                  yazıyor, birleştirilmiş masa varsa yanında "+N"; masa kişiye yetmiyorsa
                  uyarı işareti ve kırmızı kenar; masası yoksa tire. */}
              <span
                style={{
                  // Masa kutuları eşit ende (Gökhan, 2026-08-31) — adı uzun olan üç noktayla
                  // kısalıyor, satırlar birbirinden kaymıyor.
                  fontSize: 12, flexShrink: 0, whiteSpace: "nowrap", borderRadius: 8,
                  width: 60, boxSizing: "border-box", overflow: "hidden", textOverflow: "ellipsis",
                  padding: "3px 8px", background: "var(--card)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                  border: `1px solid ${masa?.yetersiz ? "var(--danger)" : "var(--line-2)"}`,
                  color: masa ? (masa.yetersiz ? "var(--danger)" : "var(--ink)") : inkSoft,
                  fontWeight: masa?.yetersiz ? 600 : 400,
                }}
                title={masa?.yetersiz ? `Masa ${r.party_size} kişiye yetmiyor` : undefined}
              >
                {masa ? (masa.yetersiz ? `⚠ ${masa.ad}` : masa.ad) : "—"}
                {masa && masa.ekstra > 0 && (
                  <span style={{ fontSize: 9.5, color: inkSoft, fontWeight: 400 }}>+{masa.ekstra}</span>
                )}
              </span>
              {/* Kilit masa kutusunun yanında (Gökhan, 2026-08-31). Masaüstü tabloda vardı — masaüstü tabloda vardı, kart görünümüne
                  konmamıştı (Gökhan, 2026-08-12: "rezervasyon kilidini unuttuk"). Kart bir
                  buton olduğu için iç içe buton kullanılmıyor; dokunuş kartın açılmasını
                  engelleyip sadece kilidi çeviriyor. */}
              <span
                role="button" tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); onKilit(r); }}
                title={r.masa_kilit ? "Masa kilitli — program oynatmaz" : "Masayı kilitle"}
                aria-label={r.masa_kilit ? "Masa kilidini aç" : "Masayı kilitle"}
                style={{ cursor: "pointer", display: "inline-flex", flexShrink: 0, padding: 2, color: r.masa_kilit ? "var(--brand-strong)" : "var(--gold-text)" }}
              >
                {r.masa_kilit ? <Lock size={14} /> : <Unlock size={14} />}
              </span>
              <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: info.color, flexShrink: 0 }}>{r.party_size} px</span>
              {/* HESAP KUTUSU — PR gece sonunda kendi masalarının hesabını buraya yazıyor
                  (Gökhan, 2026-08-19: "masa kalkmadan hesabı nasıl bilebilir, kalkacak, gece
                  sonunda kendi masalarının hesaplarını öğrenip yazacak"). Bu yüzden kutu
                  yalnızca işi bitmiş kendi masalarında çıkıyor. İleride AIOS'a bağlanınca
                  tutarı program kendisi yazacak, kutu da gerekmeyecek.
                  Dokunuş satıra geçmiyor: kutuya basınca kart açılmıyor, sayı yazılıyor. */}
              {tutarGirilir(r) && (
                <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", flexShrink: 0 }}>
                  <TutarKutusu tutar={r.hesap_tutari} onKaydet={(metin) => onTutar(r, metin)} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

// Kişi kartı — 4 bölüm (Gökhan, 2026-08-07): Kimlik / Ziyaret özeti / Müşteriyi hatırlatan
// bilgiler / Rezervasyon geçmişi. "Alışveriş listesi gibi olmayacak, kullanışlı anlaşılır
// olacak" — istatistik yığını değil, düzenli etiket:değer satırları.
function KisiKartiOzet({
  kart, phone, restaurantId, simdi, onChanged, esikMudavim, esikNoShow, isMobile, sadeceGecmisVarsaGoster,
}: {
  kart: KisiKarti; phone: string; restaurantId: string | null; simdi: number; onChanged: () => void;
  esikMudavim: number; esikNoShow: number; isMobile?: boolean;
  // Yeni rezervasyon/rezervasyon dışı formunda telefon yazarken, kaydedilmemiş bir
  // rezervasyon için "ilk kez geliyor" diye boş kart açılması kafa karıştırıyordu
  // (Gökhan, 2026-08-08). Bu true olunca gerçek geçmişi olmayan biri için hiçbir şey
  // gösterilmiyor — rezervasyon alınıp listeden kart açıldığında (kartFor) bu kısıtlama
  // yok, ilk kez gelen biri için de tercih/VIP eklenebilsin diye kart yine açılıyor.
  sadeceGecmisVarsaGoster?: boolean;
}) {
  const [notTaslak, setNotTaslak] = useState(kart?.kartNotu ?? "");
  const [dogumTaslak, setDogumTaslak] = useState(kart?.dogumGunu ?? "");
  const [yemekTaslak, setYemekTaslak] = useState(kart?.yemekTercihi ?? "");
  const [ickiTaslak, setIckiTaslak] = useState(kart?.ickiTercihi ?? "");
  const [bagAcik, setBagAcik] = useState(false);
  const [bagTelefon, setBagTelefon] = useState("");
  const [bagAciklama, setBagAciklama] = useState("");
  const [acikSatir, setAcikSatir] = useState<number | null>(null);

  // kart değişince (RPC tazelenince) taslakları senkronla — effect değil render-sırası koşullu
  // setState (react-hooks/set-state-in-effect'i tetiklememek için).
  const [oncekiKart, setOncekiKart] = useState(kart);
  if (kart !== oncekiKart) {
    setOncekiKart(kart);
    setNotTaslak(kart?.kartNotu ?? "");
    setDogumTaslak(kart?.dogumGunu ?? "");
    setYemekTaslak(kart?.yemekTercihi ?? "");
    setIckiTaslak(kart?.ickiTercihi ?? "");
  }

  // YAPAY ZEKÂ BİLGİLENDİRMESİ (Gökhan, 2026-08-15). Kart açıldığında yazı yoksa ya da
  // kişi son yazıdan sonra yeni bir kayıt açtıysa bir kez üretilir, karta yazılır.
  // Bir daha çalışmaz — kart her açılışta baştan yazdırmıyor, hem hızlı hem ucuz.
  const [aiYaziliyor, setAiYaziliyor] = useState(false);
  const aiDenenen = useRef<string | null>(null);
  const kartId = kart?.kartId ?? null;
  const toplamKayit = kart?.toplamKayit ?? 0;
  const aiGuncel = !!kart?.aiOzet && kart?.aiOzetKayit === toplamKayit;
  useEffect(() => {
    if (!kartId || !restaurantId || toplamKayit === 0 || aiGuncel) return;
    // Aynı kart+kayıt sayısı için ikinci kez denemiyoruz (hata alsak bile döngüye girmesin).
    const anahtar = `${kartId}:${toplamKayit}`;
    if (aiDenenen.current === anahtar) return;
    aiDenenen.current = anahtar;
    let iptal = false;
    void (async () => {
      setAiYaziliyor(true);
      try {
        const cevap = await fetch("/api/kisi-ozeti", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isim: kart?.isim, kartNotu: kart?.kartNotu, vip: kart?.vip,
            ziyaretSayisi: kart?.ziyaretSayisi, gelmediSayisi: kart?.gelmediSayisi,
            iptalSayisi: kart?.iptalSayisi, toplamKayit,
            ilkZiyaret: kart?.ilkZiyaret, sonZiyaret: kart?.sonZiyaret,
            gecenGun: kart?.sonZiyaret ? Math.floor((simdi - Date.parse(kart.sonZiyaret)) / 86400000) : null,
            ortalamaKisi: kart?.ortalamaKisi, ortalamaSiklikGun: kart?.ortalamaSiklikGun,
            enSikGun: kart?.enSikGunNo !== null && kart?.enSikGunNo !== undefined ? GUN_ADI[kart.enSikGunNo] : null,
            enSikSaat: kart?.enSikSaat !== null && kart?.enSikSaat !== undefined ? `${String(kart.enSikSaat).padStart(2, "0")}:00` : null,
            enSikMasa: kart?.enSikMasa,
            yemekTercihi: kart?.yemekTercihi, ickiTercihi: kart?.ickiTercihi,
            kullanilanIsimler: kart?.kullanilanIsimler ?? [],
            gecmis: kart?.tumGecmis ?? [],
          }),
        });
        if (!cevap.ok) return;
        const { metin } = (await cevap.json()) as { metin?: string };
        if (iptal || !metin) return;
        await supabase.from("kisi_kartlari")
          .update({ ai_ozet: metin, ai_ozet_kayit: toplamKayit, ai_ozet_tarih: new Date().toISOString() })
          .eq("id", kartId);
        if (!iptal) onChanged();
      } catch { /* anahtar yok ya da servis cevap vermedi — ekranda hiçbir şey gösterme */ }
      finally { if (!iptal) setAiYaziliyor(false); }
    })();
    return () => { iptal = true; };
    // kart nesnesinin tamamı değil, tetikleyen alanlar: aynı kart tazelenince tekrar sormasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kartId, toplamKayit, aiGuncel, restaurantId]);

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;

  const notKaydet = async () => {
    if (!restaurantId) return;
    if ((notTaslak.trim() || "") === (kart?.kartNotu ?? "")) return;
    await supabase.from("kisi_kartlari").upsert(
      { restaurant_id: restaurantId, phone, kart_notu: notTaslak.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "restaurant_id,phone" },
    );
    onChanged();
  };
  // DatePicker (rezervasyon formundaki aynı takvim) bir tarih seçilince doğrudan çağırır —
  // native <input type="date"> gibi ayrı bir onBlur anına gerek yok (Gökhan: "doğum günü
  // girme takvimi çok dandik, rezervasyondaki takvimi kullan").
  const dogumSec = async (v: string) => {
    setDogumTaslak(v);
    if (!restaurantId) return;
    if (v === (kart?.dogumGunu ?? "")) return;
    await supabase.from("kisi_kartlari").upsert(
      { restaurant_id: restaurantId, phone, dogum_gunu: v || null, updated_at: new Date().toISOString() },
      { onConflict: "restaurant_id,phone" },
    );
    onChanged();
  };
  const yemekKaydet = async () => {
    if (!restaurantId) return;
    if ((yemekTaslak.trim() || "") === (kart?.yemekTercihi ?? "")) return;
    await supabase.from("kisi_kartlari").upsert(
      { restaurant_id: restaurantId, phone, yemek_tercihi: yemekTaslak.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "restaurant_id,phone" },
    );
    onChanged();
  };
  const ickiKaydet = async () => {
    if (!restaurantId) return;
    if ((ickiTaslak.trim() || "") === (kart?.ickiTercihi ?? "")) return;
    await supabase.from("kisi_kartlari").upsert(
      { restaurant_id: restaurantId, phone, icki_tercihi: ickiTaslak.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "restaurant_id,phone" },
    );
    onChanged();
  };
  const vipDegistir = async () => {
    if (!restaurantId) return;
    await supabase.from("kisi_kartlari").upsert(
      { restaurant_id: restaurantId, phone, vip: !(kart?.vip ?? false), updated_at: new Date().toISOString() },
      { onConflict: "restaurant_id,phone" },
    );
    onChanged();
  };
  const numaraBagla = async () => {
    if (!restaurantId || !bagTelefon.trim()) return;
    const { data: kartRow, error: kartErr } = await supabase.from("kisi_kartlari")
      .upsert({ restaurant_id: restaurantId, phone, kart_notu: notTaslak.trim() || null }, { onConflict: "restaurant_id,phone" })
      .select("id").single();
    if (kartErr || !kartRow) return;
    await supabase.from("kisi_kart_baglantilari").insert({ kisi_karti_id: (kartRow as { id: string }).id, baglanti_telefon: bagTelefon.trim(), aciklama: bagAciklama.trim() || null });
    setBagTelefon(""); setBagAciklama(""); setBagAcik(false);
    onChanged();
  };

  // KAYDI VARSA KART ÇIKAR (Gökhan, 2026-08-28). Eskiden sadece tamamlanmış, gelmemiş ya da
  // iptal olmuş kayıtlar sayılıyordu; henüz bekleyen bir rezervasyonu olan numara "hiç kaydı
  // yok" sayılıp kart hiç görünmüyordu. O yüzden aynı numaraya başka bir isimle ikinci
  // rezervasyon alınırken uyarı çıkmadı. Artık herhangi bir kayıt kartı açıyor — kartın
  // içindeki "bu numarayla gelenler" satırı da böylece görünüyor.
  const gecmisVar = !!kart && kart.toplamKayit > 0;
  if (sadeceGecmisVarsaGoster && !gecmisVar) return null;
  // Program hüküm vermiyor, sadece istatistik veriyor (Gökhan: "biz sadece istatistik
  // verelim, sadakat yorumunu sonra değerlendiririz"). Yorumu işletme yapar.
  // SADECE "gelmedi" sayılır — iptal haber vererek gelmemek demek, hiç haber vermeden masayı
  // boş bırakmakla (gelmedi) aynı kefeye konmamalı (Gökhan onayı, 2026-08-07).
  const gelmemeOrani = kart && kart.toplamKayit > 0
    ? Math.round((kart.gelmediSayisi / kart.toplamKayit) * 100) : 0;
  const gecenGun = kart?.sonZiyaret
    ? Math.floor((simdi - Date.parse(kart.sonZiyaret)) / 86400000) : null;
  const enSikKanal = kart && Object.keys(kart.kanalDagilimi).length > 0
    ? Object.entries(kart.kanalDagilimi).sort((a, b) => b[1] - a[1])[0][0] : null;

  // Etiketler — eşikler sabit kodlanmıyor, Ayarlar'dan geliyor (Gökhan: "ileride ayarlardan
  // değiştirilebilecek mantıkta olsun").
  const otoEtiketler: { text: string; renk: string }[] = [];
  if (kart && kart.ziyaretSayisi >= esikMudavim) otoEtiketler.push({ text: "Müdavim", renk: "var(--brand)" });
  if (kart && kart.toplamKayit >= 3 && gelmemeOrani >= esikNoShow) otoEtiketler.push({ text: "Gelmeme riski", renk: "var(--danger)" });

  // Doğum tarihi PROGRAM TARAFINDAN SORULMAZ (Gökhan, 2026-08-15: "biz hiçbir şekilde
  // doğum tarihi sormayalım") — onay mesajında misafire teklif edilir, veren olursa kartına
  // işlenir. O yüzden kutu yalnızca bilgisi OLAN kartta görünür; boş kartta hiç çıkmaz ki
  // personelin karşısına "doldurulacak alan" gibi durmasın. Görünürken düzeltilebilir.
  const dogumSatiri = dogumTaslak ? (
    <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <span style={{ fontSize: 11, color: inkSoft }}>Doğum günü</span>
      <DatePicker value={dogumTaslak} onChange={dogumSec} style={{ fontSize: 11, padding: "2px 5px", width: 118 }} />
    </div>
  ) : null;

  return (
    <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

      {/* 1. KİMLİK — tek satır: isim → not. Telefon numarası kaldırıldı (Gökhan, 2026-08-15:
          "karttaki ismin yanındaki numarayı kaldır") — numara kartın açıldığı yerde zaten
          yazıyor. Doğum günü de buradan alınıp kart bilgilerinin en altına indirildi. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {/* İsim burada TEKRAR yazılmıyor (Gökhan, 2026-08-15: "kişi kartında 2 kere müşteri
              ismi yazıyor") — kartın başlığında zaten duruyor. */}
          <input
            value={notTaslak} onChange={(e) => setNotTaslak(e.target.value)} onBlur={notKaydet}
            placeholder="Not"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 11.5, color: inkSoft, flex: 1, minWidth: 120, padding: "2px 0" }}
          />
          <button
            onClick={vipDegistir}
            style={{
              all: "unset", cursor: "pointer", fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
              border: "1px solid var(--gold)", color: kart?.vip ? "#fff" : "var(--gold-text)",
              background: kart?.vip ? "var(--gold-text)" : "transparent",
            }}
          >
            VIP
          </button>
          {otoEtiketler.map((e) => (
            <span key={e.text} style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 6, color: e.renk, border: `1px solid ${e.renk}` }}>{e.text}</span>
          ))}
        </div>
        {/* BU NUMARAYLA GELENLER — aynı numara kimlerle kullanılmış (eş, arkadaş, asistan ya
            da ismi farklı yazılmış aynı kişi) personel bunu görsün diye (Gökhan, 2026-08-15).
            Kart bölünmüyor, numara yine kimlik; program hüküm vermiyor, sadece gösteriyor.
            TEK İSİMDE DE ÇIKAR (Gökhan, 2026-08-28): yeni rezervasyon alırken numarayı
            yazınca o numaranın kime ait olduğu görünsün — telefonda teyit edilip "bu kişiyle
            alakanız var mı" diye sorulabilsin. Eskiden tek isimde satır hiç çıkmıyordu. */}
        {(kart?.kullanilanIsimler?.length ?? 0) > 0 && (
          <div style={{ fontSize: 11.5, color: inkSoft }}>
            Bu numarayla gelenler: <span style={{ color: "var(--ink)" }}>{kart!.kullanilanIsimler.join(", ")}</span>
          </div>
        )}
        {/* YAPAY ZEKÂ BİLGİLENDİRMESİ — notun hemen altında. Personelin yazdığı notu,
            geçmiş rezervasyonların notlarını ve kartın rakamlarını okuyup yorumluyor
            (Gökhan, 2026-08-15). Yazı yoksa satır hiç görünmüyor. */}
        {(kart?.aiOzet || aiYaziliyor) && (
          <div style={{ background: "var(--recede)", borderRadius: 8, padding: "7px 9px", marginTop: 2 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: "var(--muted-2)", marginBottom: 2 }}>
              PROGRAMIN NOTU
            </div>
            {kart?.aiOzet
              ? <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.5 }}>{kart.aiOzet}</div>
              : <div style={{ fontSize: 11.5, color: inkSoft }}>Yazılıyor…</div>}
          </div>
        )}
      </div>

      {!gecmisVar ? (
        <>
          <div style={{ fontSize: 11.5, color: inkSoft, borderTop: "1px solid var(--line)", paddingTop: 8 }}>Bu numarayla ilk kez geliyor.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
            <div style={{ color: inkSoft }}>Tercih</div>
            <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 3 }}>
              <SatirDuzenle label="Yemek" value={yemekTaslak} onChange={setYemekTaslak} onBlur={yemekKaydet} />
              <SatirDuzenle label="İçki" value={ickiTaslak} onChange={setIckiTaslak} onBlur={ickiKaydet} />
            </div>
          </div>
          <BagliNumaralar
            kart={kart} bagAcik={bagAcik} setBagAcik={setBagAcik}
            bagTelefon={bagTelefon} setBagTelefon={setBagTelefon} bagAciklama={bagAciklama} setBagAciklama={setBagAciklama} numaraBagla={numaraBagla} isMobile={isMobile}
          />
        </>
      ) : (
        /* Tek ekranda sığsın diye sağlı-sollu iki liste (Gökhan: "kaydırma olmasın, sağlı
            sollu iki liste olabilir") — sol: ziyaret özeti + tercihler, sağ: geçmiş. Dar
            mobil kartta yan yana ikisi de sıkışıp taşıyordu (Gökhan, 2026-08-08: "sol
            tarafta ekrana sığmayan listeleme var alt satıra kayıyor") — mobilde alt alta. */
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* 2. ZİYARET ÖZETİ — işletmenin hızlı bakacağı rakamlar, etiket:değer satırları. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
              <SatirCift label="Ziyaret" value={String(kart!.ziyaretSayisi)} />
              <SatirCift label="Ort. kişi" value={kart!.ortalamaKisi !== null ? String(kart!.ortalamaKisi) : "—"} />
              <SatirCift label="Geliş aralığı" value={kart!.ortalamaSiklikGun ? `${sureYazisi(kart!.ortalamaSiklikGun)}de bir` : "—"} />
              <SatirCift label="Son geliş" value={kart!.sonZiyaret ? `${tarihKisa(kart!.sonZiyaret)}${gecenGun !== null && gecenGun > 0 ? ` (${sureYazisi(gecenGun)} önce)` : ""}` : "—"} />
              <SatirCift label="İlk geliş" value={kart!.ilkZiyaret ? tarihKisa(kart!.ilkZiyaret) : "—"} />
              <SatirCift label="İptal / Gelmedi" value={`${kart!.iptalSayisi} / ${kart!.gelmediSayisi}`} vurgu={gelmemeOrani >= esikNoShow && kart!.toplamKayit >= 3} />
              <SatirCift label="Favori gün" value={kart!.enSikGunNo !== null ? GUN_ADI[kart!.enSikGunNo] : "—"} />
              <SatirCift label="Favori saat" value={kart!.enSikSaat !== null ? `${String(kart!.enSikSaat).padStart(2, "0")}:00` : "—"} />
              <div style={{ color: inkSoft }}>Tercih</div>
              <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                <SatirCift label="Rezervasyon" value={enSikKanal ? (KANAL_ADI[enSikKanal] ?? enSikKanal) : "—"} />
                <SatirCift label="Masa" value={kart!.enSikMasa ?? "—"} />
                <SatirDuzenle label="Yemek" value={yemekTaslak} onChange={setYemekTaslak} onBlur={yemekKaydet} />
                <SatirDuzenle label="İçki" value={ickiTaslak} onChange={setIckiTaslak} onBlur={ickiKaydet} />
              </div>
            </div>
            <BagliNumaralar
              kart={kart} bagAcik={bagAcik} setBagAcik={setBagAcik}
              bagTelefon={bagTelefon} setBagTelefon={setBagTelefon} bagAciklama={bagAciklama} setBagAciklama={setBagAciklama} numaraBagla={numaraBagla} isMobile={isMobile}
            />
          </div>

          {/* 4. REZERVASYON GEÇMİŞİ — rezervasyon listesi biçiminde, satıra basınca not/iptal
              sebebi açılır. Ekrana sığması için en fazla 8 kayıt gösterilir. */}
          {kart && kart.tumGecmis.length > 0 && (
            <div style={isMobile
              ? { flex: 1, minWidth: 0, borderTop: "1px solid var(--line)", paddingTop: 10 }
              : { flex: 1, minWidth: 0, borderLeft: "1px solid var(--line)", paddingLeft: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: "uppercase", marginBottom: 4 }}>Rezervasyon geçmişi</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {kart.tumGecmis.slice(0, 8).map((z, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setAcikSatir(acikSatir === i ? null : i)}
                      style={{
                        all: "unset", cursor: (z.note || z.cancel_reason) ? "pointer" : "default", display: "flex", width: "100%",
                        boxSizing: "border-box", padding: "5px 2px", fontSize: 11.5, borderTop: i > 0 ? "1px solid var(--line)" : "none", gap: 6,
                      }}
                    >
                      <span style={{ color: "var(--ink)", width: 52, flexShrink: 0, whiteSpace: "nowrap" }}>{tarihKisa(z.reserved_at)}</span>
                      <span className="tnum" style={{ color: inkSoft, width: 32, flexShrink: 0 }}>{saatFmt.format(new Date(z.reserved_at))}</span>
                      <span className="tnum" style={{ color: inkSoft, width: 14, flexShrink: 0 }}>{z.party_size}</span>
                      <span style={{ color: inkSoft, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.masa ?? "—"}</span>
                      {/* Hesap tutarı — rezervasyon satırından girilir, geçmişte burada görünür
                          (Gökhan, 2026-08-15). Girilmemişse hiç yazılmaz, sıfır gösterilmez. */}
                      {z.hesap_tutari !== null && z.hesap_tutari !== undefined && (
                        <span className="tnum" style={{ color: "var(--ink)", flexShrink: 0, whiteSpace: "nowrap" }}>{tutarYazisi(z.hesap_tutari)}</span>
                      )}
                      <span style={{ color: DURUM_RENK[z.status] ?? inkSoft, fontWeight: 600, flexShrink: 0 }}>{DURUM_KISA[z.status] ?? z.status}</span>
                    </button>
                    {acikSatir === i && (z.note || z.cancel_reason) && (
                      <div style={{ fontSize: 11, color: inkSoft, padding: "2px 2px 6px 2px", fontStyle: "italic" }}>
                        {z.cancel_reason ? `İptal: ${z.cancel_reason}` : z.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {kart.tumGecmis.length > 8 && (
                <div style={{ fontSize: 10.5, color: "var(--muted-2)", marginTop: 4 }}>+{kart.tumGecmis.length - 8} kayıt daha</div>
              )}
            </div>
          )}
        </div>
      )}
      {dogumSatiri}
    </div>
  );
}

// Bağlı numaralar — bir kişinin farklı telefonlarla geldiği durumlar için.
function BagliNumaralar({
  kart, bagAcik, setBagAcik, bagTelefon, setBagTelefon, bagAciklama, setBagAciklama, numaraBagla, isMobile,
}: {
  kart: KisiKarti; bagAcik: boolean; setBagAcik: (v: boolean) => void;
  bagTelefon: string; setBagTelefon: (v: string) => void; bagAciklama: string; setBagAciklama: (v: string) => void; numaraBagla: () => void;
  isMobile?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {kart && kart.baglantilar.length > 0 && (
        <div style={{ fontSize: 11, color: inkSoft }}>
          Bağlı numaralar:{" "}
          {kart.baglantilar.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ", "}
              <a
                href={isMobile ? telLinki(b.telefon) : waLinki(b.telefon)}
                target={isMobile ? undefined : "_blank"}
                rel={isMobile ? undefined : "noreferrer"}
                title={isMobile ? "Ara" : "WhatsApp'ta aç"}
                className="tnum"
                style={{ color: "var(--brand)", textDecoration: "none" }}
              >
                {b.telefon}
              </a>
              {b.aciklama ? ` (${b.aciklama})` : ""}
            </span>
          ))}
        </div>
      )}
      {!bagAcik ? (
        <button onClick={() => setBagAcik(true)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)" }}>+ Numara bağla</button>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input value={bagTelefon} onChange={(e) => setBagTelefon(e.target.value)} placeholder="Diğer numara" inputMode="tel" style={{ ...inp, fontSize: 12, flex: 1 }} />
          <input value={bagAciklama} onChange={(e) => setBagAciklama(e.target.value)} placeholder="Not (birlikte geldiler…)" style={{ ...inp, fontSize: 12, flex: 1 }} />
          <button onClick={numaraBagla} style={btnSmallRow}>Ekle</button>
        </div>
      )}
    </div>
  );
}

function SatirCift({ label, value, vurgu }: { label: string; value: string; vurgu?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: inkSoft }}>{label}</span>
      <span className="tnum" style={{ color: vurgu ? "var(--danger)" : "var(--ink)", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// Tercih listesindeki elle girilen satırlar (yemek/içki gibi) — istatistik değil, personelin
// yazdığı bilgi, o yüzden değer alanı doğrudan düzenlenebilir.
function SatirDuzenle({ label, value, onChange, onBlur }: { label: string; value: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <span style={{ color: inkSoft, flexShrink: 0 }}>{label}</span>
      <input
        value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        placeholder="—"
        style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, color: "var(--ink)", fontWeight: 600, textAlign: "right", padding: 0, minWidth: 0, width: 110 }}
      />
    </div>
  );
}

// Hesap tutarı kutusu — SADECE "tamamlandı" olan rezervasyon satırında görünür (Gökhan,
// 2026-08-15: "rezervasyona tamamlandı dedikten sonra rezervasyon satırından girilsin").
// Kendi taslağını tutar; liste tazelenip gelen tutar değişirse taslak yeniden eşitlenir
// (effect değil, render-sırası koşullu setState).
function TutarKutusu({ tutar, onKaydet }: { tutar: number | null; onKaydet: (metin: string) => void }) {
  const gelen = tutar === null ? "" : String(tutar);
  const [taslak, setTaslak] = useState(gelen);
  const [onceki, setOnceki] = useState(gelen);
  if (gelen !== onceki) { setOnceki(gelen); setTaslak(gelen); }
  return (
    <input
      value={taslak}
      onChange={(e) => setTaslak(e.target.value.replace(/[^0-9.,]/g, ""))}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onBlur={() => onKaydet(taslak)}
      placeholder="Hesap"
      title="Hesap tutarı (TL) — isteğe bağlı"
      inputMode="decimal"
      className="tnum"
      style={{
        width: 74, fontSize: 12, textAlign: "right", padding: "2px 6px", borderRadius: 6,
        border: "1px solid var(--line-2)", background: "transparent", color: "var(--ink)", outline: "none", flexShrink: 0,
      }}
    />
  );
}

// Onay/hatırlatma bildirimi — SMS/WhatsApp sağlayıcısı henüz bağlı değil, şu an her zaman
// "gönderilmedi" döner. Sonucu beklemeden çağırıyoruz: bildirim gitmese de akış etkilenmesin.
const bildirimGonder = (reservationId: string, tip: "onay" | "hatirlatma") => {
  supabase.functions.invoke("send-reservation-notification", { body: { reservation_id: reservationId, type: tip } }).catch(() => {});
};

export default function RezervasyonPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  // Çok şubeli hesaplarda şube değiştirici — tek şubelide hiç görünmez (liste 1 elemanlı).
  const [subeler, setSubeler] = useState<ReservationBranch[]>([]);
  const [subeSecimiAcik, setSubeSecimiAcik] = useState(false);
  const [gun, setGun] = useState("");
  const [rows, setRows] = useState<Rez[]>([]);
  // Onay bekleyen ve reddedilmiş online başvurular — kendi ekranında listeleniyor.
  const [basvurular, setBasvurular] = useState<Rez[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  // Salon adları — nota yazılan salonu tanımak için (bkz. notKurallari.ts).
  // genislik_cm/derinlik_cm — rezervasyon penceresinden açılan salon planı için (Gökhan,
  // 2026-08-24: "pencere açıkken masa sayfasına geçebileyim"). Plan salon ekranındakiyle
  // aynı geometriyi çizebilsin diye salonun gerçek ölçüsü de okunuyor.
  const [salonlar, setSalonlar] = useState<{ id: string; name: string; genislik_cm: number | null; derinlik_cm: number | null; tur: string }[]>([]);
  // reservation_id -> o rezervasyona bağlı TÜM masa id'leri (masa birleştirme).
  const [rezMasalar, setRezMasalar] = useState<Record<string, string[]>>({});
  const [now, setNow] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kvkkNotice, setKvkkNotice] = useState("");
  const [kvkkAcik, setKvkkAcik] = useState(false);
  // Yeni rezervasyon penceresinin açılış saati — Ayarlar'dan değişebilir.
  const [varsayilanSaat, setVarsayilanSaat] = useState("19:00");
  // Varsayılan oturma süresi Ayarlar'dan geliyor — yeni rezervasyon bu süreyle kaydedilir.
  const [oturmaSuresi, setOturmaSuresi] = useState(90);
  // Ayarlar'daki "Otomatik yerleşme" — açıkken kişi sayısı büyüyünce program masayı kendi
  // tamamlar (Gökhan: "kendisi hemen kendi sırasındaki 2 kişilik masayı çekecek, kapatacak
  // konuyu"). Kapalıyken program hiçbir masayı kendiliğinden oynatmaz.
  const [otoYerlesme, setOtoYerlesme] = useState(false);
  // Geçmiş gün açık kalırsa ne olacağı — ayardan gelir: "sor" ya da "otomatik".
  const [gunKapanis, setGunKapanis] = useState("sor");
  // Müdavim/no-show riski etiketi eşikleri — sabit kodlanmıyor, Ayarlar'dan gelir.
  const [esikMudavim, setEsikMudavim] = useState(5);
  const [esikNoShow, setEsikNoShow] = useState(30);
  const [capacityNotice, setCapacityNotice] = useState<string | null>(null);
  const bildirCapacityNotice = (msg: string) => {
    setCapacityNotice(msg);
    setTimeout(() => setCapacityNotice(null), 7000);
  };
  const { confirm, secim, dialog: confirmDialog } = useConfirm();

  // Yeni rezervasyon formu — buton tıklanınca açılan katman.
  const [newResOpen, setNewResOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fParty, setFParty] = useState("2");
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("");
  const [fNote, setFNote] = useState("");
  // Yedek işareti — masa tutmayan, sıra bekleyen rezervasyon (Gökhan, 2026-08-11).
  const [fYedek, setFYedek] = useState(false);
  // REZERVASYON ALIRKEN MASA SEÇME (Gökhan, 2026-08-24: "rezervasyon girilen pencereye masa
  // seçme ekranı da ekleyelim... pencere açıkken salonda masa seçebilsin").
  //
  // Seçim ANINDA ATANMIYOR: "ondan ona ondan ona gezebilsin, karar verme aşamasında tıklanma
  // sınırı olmasın, ekran kapanmasın". Masalar burada sadece işaretleniyor; rezervasyon
  // "Ekle" ile kaydedilince atanıyor ve KİLİTLENİYOR — masa müşteriye söylenmiştir, otomatik
  // yerleşim de kimse de değiştiremez, sadece yönetici açabilir.
  const [fMasaSecimi, setFMasaSecimi] = useState<string[]>([]);
  // Plan açıkken pencere küçülüp kenara çekiliyor (Gökhan: "pencere küçülüp kenara çekilsin").
  const [fPlanAcik, setFPlanAcik] = useState(false);
  const [fPlanAlanId, setFPlanAlanId] = useState<string | null>(null);
  // Seçilen GÜNDE hangi masa kimde — plan açılınca o güne göre çekiliyor. Masanın anlık
  // durumu (empty/reserved) sadece bugünü anlatıyor; ileri tarihli rezervasyonda işe yaramaz.
  const [fPlanDolu, setFPlanDolu] = useState<Record<string, string>>({});
  // Masayı tutan rezervasyonun kişi sayısı — planda ismin altında kendi satırında yazıyor.
  const [fPlanDoluKisi, setFPlanDoluKisi] = useState<Record<string, number>>({});
  // MİSAFİR MASASI (Gökhan, 2026-08-15). Aynı numara + aynı isim + aynı güne ikinci masa
  // açılıyorsa bu masa misafirler içindir. Program kendisi fark eder; personele sadece
  // "iki masa yakın olsun mu" diye sorar. İki rezervasyon birbirine bağlanmaz.
  const [fMisafirAday, setFMisafirAday] = useState(false);
  const [fMisafirYakin, setFMisafirYakin] = useState(false);
  // FIX / ALAKART (Gökhan, 2026-08-17) — sadece ayarlarda fix menü açıksa sorulur. Mutfak
  // şefi listede masa yerine bunu görüyor.
  const [fServis, setFServis] = useState<"alakart" | "fix">("alakart");
  const [fFixMenu, setFFixMenu] = useState<string>("");
  const [fFixKisi, setFFixKisi] = useState("");
  const [fixMenuler, setFixMenuler] = useState<{ id: string; ad: string }[]>([]);
  const [fixAcik, setFixAcik] = useState(false);
  // MASA HESABI ayarları (Gökhan, 2026-08-20). Açıkken kapasite masayla sayılır; masanın kaç
  // kişi aldığını koltuk değil "en fazla kişi" belirler, sınır aşılınca ikinci masa devreye
  // girer ve o masa önce STOKTAN gelir.
  const [masaHesabi, setMasaHesabi] = useState(false);
  // İşletmenin genel masa sınırı — stok masası bu kadar kişi alır, planlayıcı da bunu görür.
  const [masaEnFazlaKisi, setMasaEnFazlaKisi] = useState(5);
  const [sinirAsilinca, setSinirAsilinca] = useState("sor");
  const [masaStoguAdet, setMasaStoguAdet] = useState(0);
  // SALONSUZ ÇALIŞMA (Gökhan, 2026-08-20: "salon ve masa ayarı yapmayan rezervasyon alabilsin
  // ama yerleşim yapamasın... kapasiteyi yazsın devam etsin"). Kurulumda yazılan toplam kişi
  // kapasitesi; masa yoksa doluluk bu sayıya göre tutulur.
  const [kapasiteKisi, setKapasiteKisi] = useState(0);
  // LOCA KURALLARI (Gökhan, 2026-08-20). Hangi masaların loca olduğu masa grubundaki "loca"
  // işaretinden, kuralların kendisi ayarlardan geliyor.
  const [locaGrupIds, setLocaGrupIds] = useState<Set<string>>(new Set());
  // Masa gruplarının adları — notta geçip geçmediğine bakmak için.
  const [masaGruplari, setMasaGruplari] = useState<{ id: string; ad: string }[]>([]);
  const [locaKaporaAcik, setLocaKaporaAcik] = useState(false);
  const [locaKaporaTutar, setLocaKaporaTutar] = useState<number | null>(null);
  const [locaKaporaZorunlu, setLocaKaporaZorunlu] = useState(false);
  const [locaSatisYetkisi, setLocaSatisYetkisi] = useState("herkes");
  // Locada kişi limiti — ayarda boşsa sınır yok (Gökhan, 2026-08-30).
  const [locaKisi, setLocaKisi] = useState<number | null>(null);
  // Rezervasyonu kim silebilir — Ayarlar > Paneller ve yetkiler (Gökhan, 2026-08-29).
  const [silmeYetkisi, setSilmeYetkisi] = useState("yonetici");
  const [locaWalkinAcik, setLocaWalkinAcik] = useState(true);
  const [locaPaketZorunlu, setLocaPaketZorunlu] = useState(false);
  // İşletme türü — yeni nesil meyhanede rezervasyon satırında fix/alakart da yazıyor
  // (Gökhan, 2026-08-18).
  const [isletmeTipi, setIsletmeTipi] = useState("");
  // RESTORAN + EĞLENCE ayarları (Gökhan, 2026-08-27) — eğlence günleri, gece düzenine geçiş
  // saati, ayakta müşteri kapasitesi. Sadece isletme_tipi restoran_eglence iken işler.
  const [eglenceGunleri, setEglenceGunleri] = useState<string[]>(["cum", "cmt"]);
  const [eglenceGecis, setEglenceGecis] = useState("22:00");
  const [ayaktaKapasite, setAyaktaKapasite] = useState(0);
  // BİSTRODA KİŞİ SINIRI — ayarda boş bırakılabilir (Gökhan, 2026-08-30: "bistro olayında
  // kişi sayısı koymasak, her rezervasyon tek bistroya alınsa... aynen loca gibi davransın").
  // Boşken (null) bir rezervasyon bir bistro tutar; kalabalık gruba ikinci bistroyu işletmeci
  // elle verir. Bir sayı yazılıysa eski hesap: gereken bistro = kişi ÷ o sayı.
  const [bistroKisi, setBistroKisi] = useState<number | null>(null);
  // KONSEPTLER — işletmenin ayarlarda kurduğu kendi türleri (Gökhan, 2026-08-30). Liste
  // doluysa rezervasyon türü kutusunda bunlar çıkıyor; boşsa programın kendi seçenekleri.
  const [konseptler, setKonseptler] = useState<string[]>([]);
  // Seçilen konseptin adı — rezervasyona yazılıyor, arkadaki işleyiş adından çözülüyor.
  const [fKonsept, setFKonsept] = useState("");
  // Yeni rezervasyon formundaki dilim seçimi — masa seçin yanındaki kutu.
  // Kutudaki seçim dilimden geniş: bistro bittiğinde "Ayakta" ve "Yemek + ayakta" da
  // seçilebiliyor (Gökhan, 2026-08-29). Kayda yazılırken dilim + ayakta işaretine çözülüyor.
  const [fDilim, setFDilim] = useState<TurSecimi>("yemek_gece");
  // Kutuya dokunuldu mu — dokunulmadan kaydedilirse yemek sayılıyor ama kaydı giren
  // uyarılıyor (Gökhan, 2026-08-29: "süreç doğru alınmadan kapandıysa sadece yemek olarak
  // kaydetsin ama ekle dediğinde uyarsın, kaydı giren görsün").
  const [fDilimSecildi, setFDilimSecildi] = useState(false);
  // MESAJ AYARLARI (Gökhan, 2026-08-18) — WhatsApp bağlanana kadar mesajlar kuyrukta
  // hazırlanıp bekliyor; ayarlar Ayarlar > Mesajlar bölümünden geliyor.
  const [mesajAyar, setMesajAyar] = useState<{
    acik: boolean; onayAcik: boolean; onayMetni: string | null; retMetni: string | null;
    teyitAcik: boolean; teyitSaat: string; teyitBitis: string; teyitMetni: string | null;
    sessizBas: string; sessizBitis: string;
  } | null>(null);
  const [karmaFix, setKarmaFix] = useState(false);
  // ÖĞRENİLEN YEDEK LİMİTİ (Gökhan, 2026-08-11: "program dolu olan günler için öğrensin,
  // ne kadar masa gelmiyor, ona göre yedek limiti çıkarsın"). Geçmişte AYNI GÜNDE kaç
  // rezervasyonun boşa düştüğüne (gelmedi + iptal) bakar, o oranı masa sayısına uygular.
  // Elle girilen bir sayı değil, işletmenin kendi geçmişinden çıkar.
  const [yedekOneri, setYedekOneri] = useState<{ oran: number; limit: number; ornek: number } | null>(null);
  // Masa başına eklenebilecek sandalye — 4 kişilik masaya 5 kişi oturtmak gibi (Gökhan,
  // 2026-08-12). Ayarlardan gelir, 0 = hiç fazla alınmaz.
  const [ekSandalye, setEkSandalye] = useState(1);
  const [fKartRefresh, setFKartRefresh] = useState(0);
  // İsim aramasından seçilip kesinleşen müşterinin kalıcı kimliği (Gökhan: "form o müşterinin
  // ID'siyle devam etsin") — dolu olduğu sürece arama listesi kapalı kalır, kart bu ID ile açılır.
  const [fSecKartId, setFSecKartId] = useState<string | null>(null);
  // Kişi sayısının yanında kadın/erkek dağılımı — opsiyonel, sadece yeni rezervasyon alınırken
  // sorulur (Gökhan, 2026-08-07).
  const [fKadin, setFKadin] = useState("");
  const [fErkek, setFErkek] = useState("");
  // İletişim kanalı — İstatistikler > Kanallar için (Gökhan, 2026-08-07).
  const [fKanal, setFKanal] = useState("telefon");
  const fKart = useKisiKarti(fPhone, restaurantId, fKartRefresh, fSecKartId);
  const fAdaylar = useMusteriAdaylari(fName, restaurantId, !!fSecKartId);
  const fAdaySec = async (a: MusteriAday) => {
    setFName(a.isim);
    setFPhone(a.telefon);
    let id = a.kisiKartiId;
    if (!id && restaurantId) {
      const { data } = await supabase.from("kisi_kartlari")
        .upsert({ restaurant_id: restaurantId, phone: a.telefon }, { onConflict: "restaurant_id,phone" })
        .select("id").single();
      id = (data as { id: string } | null)?.id ?? null;
    }
    setFSecKartId(id);
  };
  // Rezervasyonsuz, kapıdan gelen — rezervasyon formuyla aynı bilgileri toplar, sadece
  // tarih/saat yok ("şimdi").
  const [walkInOpen, setWalkInOpen] = useState(false);
  // SOL MENÜ DARALTMA (Gökhan, 2026-08-18) — kapalıyken liste genişliyor. Seçim tarayıcıda
  // hatırlanıyor ki her açılışta yeniden daraltmak gerekmesin.
  const [menuKapali, setMenuKapali] = useState(false);
  // Tablette arama kutusu üst bölgenin yarısı kadar (Gökhan, 2026-08-30). Bölge ölçülüyor,
  // sayı elle yazılmıyor.
  const ustBolgeRef = useRef<HTMLDivElement | null>(null);
  const [ustBolgeEni, setUstBolgeEni] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = ustBolgeRef.current;
    if (!el) { setUstBolgeEni(undefined); return; }
    const olc = () => setUstBolgeEni(el.getBoundingClientRect().width || undefined);
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    return () => ro.disconnect();
  });
  const menuKapaliYaz = (v: boolean) => {
    setMenuKapali(v);
    if (typeof window !== "undefined") window.localStorage.setItem("rzv_menu_kapali", v ? "1" : "0");
  };
  // KAYDEDEN — rezervasyonu kim aldı (Gökhan, 2026-08-20). Kullanıcı kimliği ekranda ad olarak
  // görünsün diye eşleme: işletmenin personel kayıtları + işletme sahibi (Ayarlar'daki yetkili
  // adı). Veri zaten created_by'da tutuluyordu, hiçbir yerde gösterilmiyordu.
  const [kimAdlari, setKimAdlari] = useState<Record<string, string>>({});
  const [wName, setWName] = useState("");
  // KAPI GİRİŞİNDE DE REZERVASYON TÜRÜ (Gökhan, 2026-08-29). Eğlence gününde kapıdan gelen
  // misafirin de yemeğe mi geceye mi geldiği belli olmalı; yoksa dilimi boş kalıyor ve
  // oturtma tarafı onu yemek misafiri sayıyor. Varsayılan saate göre: geçiş saatinden önce
  // yemek, sonra gece — mevcut kural zaten gece rezervasyonunu geçişten önceye yazdırmıyor.
  const [wDilim, setWDilim] = useState<TurSecimi>("yemek");
  // Kapı girişinde seçilen konsept — rezervasyondaki kutunun aynısı (Gökhan, 2026-08-30).
  const [wKonsept, setWKonsept] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wParty, setWParty] = useState("2");
  const [wNote, setWNote] = useState("");
  const [wKartRefresh, setWKartRefresh] = useState(0);
  const [wSecKartId, setWSecKartId] = useState<string | null>(null);
  const wKart = useKisiKarti(wPhone, restaurantId, wKartRefresh, wSecKartId);
  const wAdaylar = useMusteriAdaylari(wName, restaurantId, !!wSecKartId);
  const wAdaySec = async (a: MusteriAday) => {
    setWName(a.isim);
    setWPhone(a.telefon);
    let id = a.kisiKartiId;
    if (!id && restaurantId) {
      const { data } = await supabase.from("kisi_kartlari")
        .upsert({ restaurant_id: restaurantId, phone: a.telefon }, { onConflict: "restaurant_id,phone" })
        .select("id").single();
      id = (data as { id: string } | null)?.id ?? null;
    }
    setWSecKartId(id);
  };
  // Kişi kartı penceresi — mevcut bir rezervasyon satırından açılır (Gökhan: "numara
  // aradığında yine isim soyisim çıkacak, ... beraber gelmişlerdi felan"). Telefon yoksa
  // isimle geçmiş gösterilir (Gökhan: "rezervasyon alınan herkese kişi kartı açılacak").
  const [kartFor, setKartFor] = useState<Rez | null>(null);
  // Hesap tutarı — kişi kartının başından kaldırıldı, artık "tamamlandı" olan rezervasyonun
  // KENDİ SATIRINDAN giriliyor (Gökhan, 2026-08-15). Boş bırakılırsa alan NULL'a döner:
  // "girilmemiş" ile "sıfır TL" aynı şey değil.
  const tutarKaydet = async (r: Rez, metinHam: string) => {
    const metin = metinHam.trim().replace(/\./g, "").replace(",", ".");
    const deger = metin === "" ? null : Number(metin);
    if (deger !== null && !Number.isFinite(deger)) return;
    if (deger === r.hesap_tutari) return;
    const { error } = await supabase.from("reservations").update({ hesap_tutari: deger }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    if (kartFor?.id === r.id) setKartFor({ ...kartFor, hesap_tutari: deger });
    await yenile();
  };
  const [kartRefresh, setKartRefresh] = useState(0);
  const kartForKart = useKisiKarti(kartFor?.guest_phone ?? "", restaurantId, kartRefresh, kartFor?.kisi_karti_id);
  const kartForGecmis = useIsimGecmisi(kartFor?.guest_phone ? "" : (kartFor?.guest_name ?? ""), restaurantId, 0);

  const [assigningId, setAssigningId] = useState<string | null>(null);
  // Masa birleştirme seçimi — birden fazla masaya tıklanıp "Ata" ile onaylanır.
  const [masaSecimi, setMasaSecimi] = useState<string[]>([]);
  // Masa ata penceresinin ekran konumu (Gökhan: "masa ata dediğim zaman akordiyon
  // rezervasyonların altında kalıyor, olması gereken yere koyacaksın") — position:fixed,
  // tıklanan noktaya göre, satırların ARKASINDA kalmasın diye.
  const [masaAtaKonum, setMasaAtaKonum] = useState<Konum | null>(null);
  // Liste kaydırılınca pencere düğmenin üstünde kalmaya devam etmesin diye (satıra bitişik
  // görünmesi için) — kaydırma başlayınca kapanır, x/y sabit kaldığı için açık kalırsa satırdan
  // kopmuş gibi asılı kalırdı.
  const listeKaydirRef = useRef<HTMLDivElement | null>(null);
  const [seatingFor, setSeatingFor] = useState<Rez | null>(null);
  // Oturtulan misafir sıradan geliyorsa: hangi kayıt, kaç dakika beklemiş (Gökhan, 2026-08-18).
  const [beklemeBiten, setBeklemeBiten] = useState<{ id: string; dakika: number | null } | null>(null);
  // Masa boşalınca karşılamanın önüne çıkan kutu: hangi masa boşaldı, kaç kişilik ve masanın
  // kimliği (Gökhan, 2026-08-18: "program masa boşaldı bekleyenler diye çıkarsın" ve
  // "karşılama hangisine oturt derse o masaya o geçsin, masa seçmesine gerek kalmasın").
  const [bosalanMasa, setBosalanMasa] = useState<{ ad: string; koltuk: number; masaIds: string[] } | null>(null);
  // Alınmış rezervasyonun dilimini değiştirme penceresi (Gökhan, 2026-08-27: misafir
  // sonradan "geceye de kalacağım" diyebiliyor).
  const [dilimFor, setDilimFor] = useState<{ rez: Rez; konum: Konum } | null>(null);
  const [iptalFor, setIptalFor] = useState<Rez | null>(null);
  const [iptalReason, setIptalReason] = useState("");
  const [filtre, setFiltre] = useState("tumu");
  // Saat/telefon/kişi/not düzenleme penceresi — masa seç penceresiyle aynı konumlandırma.
  const [duzenle, setDuzenle] = useState<{ rezId: string; alan: DuzenleAlan; konum: Konum } | null>(null);
  const [duzenleDeger, setDuzenleDeger] = useState("");
  // Kişi sayısı düzenlenirken kadın/erkek de aynı pencereden düzeltilebilsin (Gökhan,
  // 2026-08-07: "kişi sayısını tekrar tıkladığımda kadın erkek sayılarını da düzeltebileyim").
  const [duzenleKadin, setDuzenleKadin] = useState("");
  const [duzenleErkek, setDuzenleErkek] = useState("");
  // Rezervasyon alınamadığında üstte kırmızı yazı değil, ortada pencere (Gökhan: "yukarıda
  // kırmızı yazı ile değil pencere ile, pencerede de şunu şöyle yaparsan şu masa uygun olur
  // uyarılarını verecek"). Başlık sebebi, satırlar ne yapılacağını söyler.
  const [uyari, setUyari] = useState<{ baslik: string; satirlar: string[] } | null>(null);
  // Pax sütunu başlığından açılan kişi sayısı filtresi (Gökhan: "paxa filtre koyalım,
  // rezervasyon sayısına göre filtrelesin") — null = tümü.
  const [paxFiltre, setPaxFiltre] = useState<number | null>(null);
  const [paxFiltreKonum, setPaxFiltreKonum] = useState<Konum | null>(null);
  // Salon ekranında düzenleme kapalıyken masaya tıklayınca buraya ?arama=<masa adı> ile
  // gelinir (Gökhan: "masaya tıkladığında rezervasyon listesi açılsın") — arama kutusu
  // başlangıç değerini URL'den okuyor (lazy initializer, effect değil).
  const [arama, setArama] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("arama") ?? "";
  });

  const notifiedGeldi = useRef<Set<string>>(new Set());
  const router = useRouter();

  // ROL KISITI (Gökhan, 2026-08-17: "garson, pr ve şef geldi gelmedi ve iptal yapamazlar,
  // kendi girdikleri rezervasyon dışında kişi kartı açamazlar"). İşletme sahibinde rol boş
  // gelir, karşılama ve yönetici de serbesttir.
  const [rolum, setRolum] = useState<string | null>(null);
  const [benimPersonelId, setBenimPersonelId] = useState<string | null>(null);
  // ROL YÜKLENDİ Mİ — `rolum` null İKİ anlama geliyor: "sorgu henüz dönmedi" ve "işletme
  // sahibi, personel kaydı yok". Role bakan işler (geçmiş gün kapatma gibi) sorgu dönmeden
  // karar verirse yanlış davranıyor, o yüzden ayrı bayrak tutuluyor (Gökhan, 2026-08-18).
  const [rolYuklendi, setRolYuklendi] = useState(false);
  // İşletme sahibinde rol boş gelir — o da yöneticidir. Kilitli masayı sadece bu ikisi açar.
  const yoneticiyim = rolum === null || rolum === "yonetici";
  useEffect(() => {
    let acik = true;
    // KENDİ personel kaydım. "RLS zaten yalnızca kendi satırlarımı veriyor" varsayımı yanlıştı:
    // işletme sahibi kendi işletmesinin BÜTÜN personelini görebiliyor (personel_hesaplari'ndeki
    // isletme_yonetir kuralı). Kullanıcı süzgeci olmayınca sahibe, işletmesindeki ilk personelin
    // rolü yapışıyordu — telefonda o role ait kısıtlarla karşılaşıyordu (Gökhan, 2026-08-19:
    // aynı hata girişte de vardı, sahibi Ekip ekranına atıyordu). Aynı hesapta birden fazla kayıt
    // olabiliyor (test kişileri), aktif olan geçerli.
    (async () => {
      const { data: oturum } = await supabase.auth.getUser();
      const benimId = oturum.user?.id ?? null;
      if (!benimId) { if (acik) setRolYuklendi(true); return; }
      const { data } = await supabase.from("personel_hesaplari").select("id, rol, test_aktif, created_at")
        .eq("user_id", benimId)
        .eq("durum", "onayli").order("test_aktif", { ascending: false }).order("created_at");
      if (!acik) return;
      const kayit = (data as { id: string; rol: string }[] | null)?.[0] ?? null;
      setRolum(kayit?.rol ?? null);
      setBenimPersonelId(kayit?.id ?? null);
      setRolYuklendi(true);
    })();
    return () => { acik = false; };
  }, []);

  // GARSONUN KENDİ POSTASI (Gökhan, 2026-08-18: "garson hem listeyi görebilsin hem de sadece
  // kendi masalarını"). Postasındaki masaların kimlikleri; listede kendi satırlarını
  // işaretlemek ve süzmek için. Posta akşam dağıtılıyor, dağıtılmadıysa küme boş kalıyor ve
  // süzme düğmesi hiç çıkmıyor.
  const [postamMasalar, setPostamMasalar] = useState<Set<string>>(new Set());
  const [sadeceBenim, setSadeceBenim] = useState(false);
  useEffect(() => {
    if (rolum !== "garson") return;
    let acik = true;
    supabase.rpc("postam").then(({ data }) => {
      if (acik) setPostamMasalar(new Set((data as string[] | null) ?? []));
    });
    return () => { acik = false; };
  }, [rolum]);

  // İşletme oturumdan çözülür — oturum yoksa ya da hesabın restoranı yoksa girişe düşer.
  // Şube listesi de burada çekiliyor — çok şubeli hesapta değiştirici için (tek şubelide
  // liste 1 elemanlı geleceği için değiştirici zaten hiç görünmeyecek).
  useEffect(() => {
    let active = true;
    getMyReservationRestaurantId().then((id) => {
      if (!active) return;
      // Oturumu olmayan/işletmesi bulunmayan kullanıcı da kendi kapısına gider: Ekip'ten
      // gelen Ekip'e, işletme kendi giriş ekranına (Gökhan, 2026-08-26).
      if (!id) { router.replace(girisEkraniYolu()); return; }
      // KURULUM KİLİDİ (Gökhan, 2026-08-20: "kurulum kilitli olsun"). Zorunlu adımlar
      // bitmeden bu ekran açılmıyor. Sadece İŞLETME SAHİBİ kuruluma gönderiliyor —
      // personelin ayarlara yetkisi yok, onu oraya atmak kilitli kapıya çarpmak olur.
      supabase.from("restaurant_settings").select("kurulum_tamam").eq("restaurant_id", id).maybeSingle()
        .then(async ({ data: ks }) => {
          if (!active || (ks as { kurulum_tamam: boolean } | null)?.kurulum_tamam !== false) return;
          const { data: { session } } = await supabase.auth.getSession();
          const { data: sahip } = await supabase.from("restaurants").select("owner_user_id").eq("id", id).maybeSingle();
          const sahibiMi = Boolean(session && (sahip as { owner_user_id: string } | null)?.owner_user_id === session.user.id);
          if (active && sahibiMi) router.replace("/rezervasyon/kurulum");
        });
      setRestaurantId(id);
      supabase.from("restaurants").select("name").eq("id", id).maybeSingle()
        .then(({ data }) => { if (active) setRestaurantName((data as { name: string } | null)?.name ?? ""); });
    });
    getMyReservationRestaurants().then((list) => { if (active) setSubeler(list); });
    return () => { active = false; };
  }, [router]);

  // Şube değiştirme — bu masaya/ekrana özgü onlarca state'i teker teker sıfırlamak yerine
  // sert bir sayfa yenilemesiyle temiz baştan yükleniyor (Ayarlar dahil her ekran tutarlı kalsın diye).
  const subeDegistir = (id: string) => {
    setAktifSube(id);
    window.location.assign("/rezervasyon");
  };


  const load = useCallback(async (restId: string, targetGun: string) => {
    const { start, end } = gunSiniri(targetGun);
    const [{ data: r, error }, { data: t }, { data: s }] = await Promise.all([
      supabase.from("reservations").select("id, guest_name, guest_phone, party_size, reserved_at, status, note, table_id, arrived_at, seated_at, created_at, cancel_reason, source, masa_kilit, kisi_karti_id, kadin_sayisi, erkek_sayisi, hesap_tutari, yedek, gelen_kisi, gelen_kadin, gelen_erkek, misafir_masasi, misafir_yakin, tercih_alan_id, created_by, alan_hesap_id, servis_tipi, fix_menu_id, fix_kisi, bekleme, bekleme_baslangic, bekleme_dakika, teyit_durumu, teyit_zamani, stok_masa, kapora_alindi, kapora_tutar, masa_paketi_id, dilim, ayakta, onay_durumu")
        .eq("restaurant_id", restId).is("deleted_at", null)
        .gte("reserved_at", start).lt("reserved_at", end)
        // LİSTE GELİŞ SAATİNE GÖRE (Gökhan, 2026-09-01) — önce erken saat. Kayıt zamanı
        // öndeyken sıra, rezervasyonun kaçta girildiğine bağlı kalıyordu.
        // Sıralama üç kademeli olmalı (Gökhan, 2026-08-15: "bazı rezervasyonlar kafasına
        // göre yer değiştiriyor"): aynı saatteki kayıtlarda eşitliği created_at ve id
        // kırıyor, yoksa veritabanı her sorguda başka sırayla döndürüyor ve liste 6
        // saniyede bir tazelendiği için satırlar oynuyordu.
        .order("reserved_at").order("created_at").order("id"),
      supabase.from("restaurant_tables").select("id, name, seat_count, status, position_x, position_y, shape, rotated, normal_x, normal_y, normal_rotated, varsayilan_x, varsayilan_y, varsayilan_rotated, en_fazla_kisi, grup_id, area_id, stok, tasindi_gun").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_settings").select("kvkk_notice, default_duration_minutes, auto_seating, varsayilan_rezervasyon_saati, musteri_sadakat_ziyaret_esigi, musteri_no_show_risk_yuzde, masa_ek_sandalye, gun_kapanis, fix_menu_acik, karma_fix_alakart, isletme_tipi, eglence_gunleri, eglence_gecis_saati, ayakta_kapasite, bistro_kisi, konseptler, mesaj_acik, mesaj_onay_acik, mesaj_onay_metni, mesaj_teyit_acik, mesaj_teyit_saat, mesaj_teyit_bitis, mesaj_teyit_metni, mesaj_sessiz_baslangic, mesaj_sessiz_bitis, masa_hesabi_acik, masa_en_fazla_kisi, sinir_asilinca, masa_stogu_adet, masa_stogu_kisi, stok_bitince_arka_sira, loca_kapora_acik, loca_kapora_tutar, loca_kapora_zorunlu, loca_kisi, loca_satis_yetkisi, loca_walkin_acik, loca_paket_zorunlu, silme_yetkisi").eq("restaurant_id", restId).maybeSingle(),
    ]);
    if (error) { setErr(error.message); return; }
    // ONLINE BAŞVURULAR AYRI EKRANDA (Gökhan, 2026-08-30). Onaylanana kadar rezervasyon
    // listesine düşmezler; kapasiteyi de tutmazlar. Reddedilenler de burada görünmez.
    const tumu = (r as Rez[]) ?? [];
    setBasvurular(tumu.filter((x) => x.onay_durumu === "bekliyor" || x.onay_durumu === "reddedildi"));
    const list = tumu.filter((x) => x.onay_durumu !== "bekliyor" && x.onay_durumu !== "reddedildi");
    setRows(list);
    supabase.from("dining_areas").select("id, name, genislik_cm, derinlik_cm, tur").eq("restaurant_id", restId).is("deleted_at", null)
      .order("sort_order").then(({ data }) => setSalonlar((data as { id: string; name: string; genislik_cm: number | null; derinlik_cm: number | null; tur: string }[]) ?? []));
    // İşletmenin kendi masa ölçüleri — plan salon ekranındakiyle aynı ölçüde çizilsin diye.
    const settingsRow = s as {
      kvkk_notice: string | null; default_duration_minutes: number; auto_seating: boolean;
      varsayilan_rezervasyon_saati: string; musteri_sadakat_ziyaret_esigi: number; musteri_no_show_risk_yuzde: number;
      masa_ek_sandalye: number; gun_kapanis: string;
      fix_menu_acik: boolean | null; karma_fix_alakart: boolean | null; isletme_tipi: string | null;
      eglence_gunleri: string[] | null; eglence_gecis_saati: string | null; ayakta_kapasite: number | null; bistro_kisi: number | null; konseptler: string[] | null;
      masa_hesabi_acik: boolean | null; masa_en_fazla_kisi: number | null; sinir_asilinca: string | null;
      masa_stogu_adet: number | null; masa_stogu_kisi: number | null; stok_bitince_arka_sira: boolean | null;
      kapasite_kisi: number | null;
      loca_kapora_acik: boolean | null; loca_kapora_tutar: number | null; loca_kapora_zorunlu: boolean | null;
      loca_kisi: number | null; loca_satis_yetkisi: string | null; loca_walkin_acik: boolean | null; loca_paket_zorunlu: boolean | null;
      silme_yetkisi: string | null;
      mesaj_acik: boolean | null; mesaj_onay_acik: boolean | null; mesaj_onay_metni: string | null;
      mesaj_ret_metni: string | null;
      mesaj_teyit_acik: boolean | null; mesaj_teyit_saat: string | null; mesaj_teyit_bitis: string | null;
      mesaj_teyit_metni: string | null; mesaj_sessiz_baslangic: string | null; mesaj_sessiz_bitis: string | null;
    } | null;
    setIsletmeTipi(settingsRow?.isletme_tipi ?? "");
    setEglenceGunleri(settingsRow?.eglence_gunleri ?? ["cum", "cmt"]);
    setEglenceGecis(settingsRow?.eglence_gecis_saati ?? "22:00");
    setAyaktaKapasite(settingsRow?.ayakta_kapasite ?? 0);
    setBistroKisi(settingsRow?.bistro_kisi && settingsRow.bistro_kisi > 0 ? settingsRow.bistro_kisi : null);
    setKonseptler(Array.isArray(settingsRow?.konseptler) ? settingsRow.konseptler : []);
    setMesajAyar({
      acik: settingsRow?.mesaj_acik ?? false,
      onayAcik: settingsRow?.mesaj_onay_acik ?? true,
      onayMetni: settingsRow?.mesaj_onay_metni ?? null,
      retMetni: settingsRow?.mesaj_ret_metni ?? null,
      teyitAcik: settingsRow?.mesaj_teyit_acik ?? true,
      teyitSaat: (settingsRow?.mesaj_teyit_saat ?? "12:00").slice(0, 5),
      teyitBitis: (settingsRow?.mesaj_teyit_bitis ?? "13:00").slice(0, 5),
      teyitMetni: settingsRow?.mesaj_teyit_metni ?? null,
      sessizBas: (settingsRow?.mesaj_sessiz_baslangic ?? "23:00").slice(0, 5),
      sessizBitis: (settingsRow?.mesaj_sessiz_bitis ?? "09:00").slice(0, 5),
    });
    // MASA HESABI (Gökhan, 2026-08-20). Gece kulübünde masanın kaç kişi aldığını koltuk değil
    // "en fazla kişi" belirliyor: masanın kendi sınırı → grubunun sınırı (loca 12, normal 5) →
    // işletmenin genel sınırı. Program bunu tek yerden, masayı yüklerken uyguluyor; kapasite,
    // masa seçme, birleştirme, uygunluk kontrolü — hepsi aynı sayıyı görüyor.
    const hamMasalar = (t as TableRow[]) ?? [];
    // Masa grupları: hangi grup LOCA (loca kuralları oraya uygulanır) ve grubun kişi sınırı.
    // Masa hesabı kapalı olsa da loca kuralları çalıştığı için grup listesi her zaman okunuyor.
    const { data: grupData } = await supabase.from("masa_gruplari")
      .select("id, ad, en_fazla_kisi, loca").eq("restaurant_id", restId).is("deleted_at", null);
    setLocaGrupIds(new Set(((grupData as { id: string; loca: boolean }[]) ?? []).filter((g) => g.loca).map((g) => g.id)));
    // Grup adları notta aranıyor — nota "sahne önü" yazılınca o gruptan masa aranır
    // (Gökhan, 2026-08-28). Salon adı kuralının aynısı, ayrıca bir tanım gerekmiyor.
    setMasaGruplari(((grupData as { id: string; ad: string }[]) ?? []).map((g) => ({ id: g.id, ad: g.ad })));
    if (settingsRow?.masa_hesabi_acik) {
      const grupSiniri = new Map(((grupData as { id: string; en_fazla_kisi: number | null }[]) ?? [])
        .map((g) => [g.id, g.en_fazla_kisi]));
      const genel = settingsRow.masa_en_fazla_kisi ?? 5;
      setTables(hamMasalar.map((m) => {
        const grupSiniri_ = m.grup_id ? grupSiniri.get(m.grup_id) ?? null : null;
        const sinir = (m.en_fazla_kisi && m.en_fazla_kisi > 0) ? m.en_fazla_kisi
          : (grupSiniri_ && grupSiniri_ > 0) ? grupSiniri_ : genel;
        return { ...m, seat_count: sinir };
      }));
    } else {
      setTables(hamMasalar);
    }
    setFixAcik(settingsRow?.fix_menu_acik ?? false);
    setMasaHesabi(settingsRow?.masa_hesabi_acik ?? false);
    setMasaEnFazlaKisi(settingsRow?.masa_en_fazla_kisi ?? 5);
    setSinirAsilinca(settingsRow?.sinir_asilinca ?? "sor");
    setKapasiteKisi(settingsRow?.kapasite_kisi ?? 0);
    setMasaStoguAdet(settingsRow?.masa_stogu_adet ?? 0);
    setLocaKaporaAcik(settingsRow?.loca_kapora_acik ?? false);
    setLocaKaporaTutar(settingsRow?.loca_kapora_tutar ?? null);
    setLocaKaporaZorunlu(settingsRow?.loca_kapora_zorunlu ?? false);
    setLocaSatisYetkisi(settingsRow?.loca_satis_yetkisi ?? "herkes");
    setLocaKisi(settingsRow?.loca_kisi && settingsRow.loca_kisi > 0 ? settingsRow.loca_kisi : null);
    setSilmeYetkisi(settingsRow?.silme_yetkisi ?? "yonetici");
    setLocaWalkinAcik(settingsRow?.loca_walkin_acik ?? true);
    setLocaPaketZorunlu(settingsRow?.loca_paket_zorunlu ?? false);
    setKarmaFix(settingsRow?.karma_fix_alakart ?? false);
    supabase.from("fix_menuler").select("id, ad").eq("restaurant_id", restId).is("deleted_at", null).order("sira")
      .then(({ data }) => setFixMenuler((data as { id: string; ad: string }[]) ?? []));
    setKvkkNotice(settingsRow?.kvkk_notice ?? "");
    setVarsayilanSaat(settingsRow?.varsayilan_rezervasyon_saati ?? "19:00");
    setOturmaSuresi(settingsRow?.default_duration_minutes ?? 90);
    setOtoYerlesme(settingsRow?.auto_seating ?? false);
    setEsikMudavim(settingsRow?.musteri_sadakat_ziyaret_esigi ?? 5);
    setEsikNoShow(settingsRow?.musteri_no_show_risk_yuzde ?? 30);
    setEkSandalye(settingsRow?.masa_ek_sandalye ?? 1);
    setGunKapanis(settingsRow?.gun_kapanis ?? "sor");
    setErr(null);

    // Masa birleştirme (Gökhan: "10 kişi kapasite dolana kadar masa seçecek, birden fazla
    // masayı birleştirebilecek") — bir rezervasyona bağlı TÜM masalar, sadece birincisi değil.
    if (list.length > 0) {
      const { data: rt } = await supabase.from("reservation_tables").select("reservation_id, table_id").in("reservation_id", list.map((row) => row.id));
      const map: Record<string, string[]> = {};
      ((rt as { reservation_id: string; table_id: string }[]) ?? []).forEach((row) => {
        (map[row.reservation_id] ??= []).push(row.table_id);
      });
      setRezMasalar(map);
    } else {
      setRezMasalar({});
    }

    if (targetGun === bugunIstanbul()) {
      let yeni = false;
      list.forEach((row) => {
        if (row.status === "geldi") {
          if (!notifiedGeldi.current.has(row.id)) { notifiedGeldi.current.add(row.id); yeni = true; }
        } else {
          notifiedGeldi.current.delete(row.id);
        }
      });
      if (yeni) playArrivalBeep();
    }
  }, []);

  // Açılış günü normalde bugündür. İstatistikler tablosunda bir gün satırına tıklanınca
  // buraya ?gun=YYYY-MM-DD ile geliniyor — rakamdan o günün kaydına tek tıkla inilsin diye
  // (Gökhan, 2026-08-12: tablo "kapı olsun").
  useEffect(() => {
    const istenen = new URLSearchParams(window.location.search).get("gun");
    setGun(istenen && /^\d{4}-\d{2}-\d{2}$/.test(istenen) ? istenen : bugunIstanbul());
  }, []);
  useEffect(() => {
    if (!restaurantId || !gun) return;
    load(restaurantId, gun);
    const id = setInterval(() => load(restaurantId, gun), 6000);
    return () => clearInterval(id);
  }, [restaurantId, gun, load]);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  // Telefon genişliğinde liste tablo yerine kart görünümüne geçer (Gökhan, 2026-08-07:
  // "mobili daha takip ve rezervasyon girişi için tasarlamalıyız") — tablet masaüstüyle
  // aynı kalır, sadece bu eşiğin altı değişir (Adisyon'daki 860px eşiğiyle aynı).
  const [darEkran, setDarEkran] = useState(false);
  // TABLETTE WEB SATIRLARI (Gökhan, 2026-08-30: "rezervasyon listesi tablette webdeki gibi
  // olmalı... o listedeki bilgilerin hepsi olsun"). Ekranın düzeni değişmiyor — üst bar ve
  // alt şerit yerinde, sol menü yok; değişen sadece LİSTE: 768 pikselden geniş ekranda
  // telefon kartı yerine webdeki satır listesi çiziliyor.
  const [genisEkran, setGenisEkran] = useState(false);
  const [dikEkran, setDikEkran] = useState(false);
  useEffect(() => {
    // TABLETTE SOL MENÜ YOK (Gökhan, 2026-08-30) — eşik 860'tan 1024'e çıktı ki yatay tablet
    // de üst bar + alt şerit düzeninde kalsın, sol menü açılmasın.
    const mq = window.matchMedia("(max-width: 1024px)");
    const mqGenis = window.matchMedia("(min-width: 768px)");
    // Dik tablet — yatayda yer var, dikeyde yok: orada "Rez. alan" ve "Not" sütunları
    // çizilmiyor (Gökhan, 2026-08-30).
    const mqDik = window.matchMedia("(max-width: 1023px)");
    const update = () => { setDarEkran(mq.matches); setGenisEkran(mqGenis.matches); setDikEkran(mqDik.matches); };
    update();
    mq.addEventListener("change", update);
    mqGenis.addEventListener("change", update);
    mqDik.addEventListener("change", update);
    return () => { mq.removeEventListener("change", update); mqGenis.removeEventListener("change", update); mqDik.removeEventListener("change", update); };
  }, []);
  // Telefon YAN ÇEVRİLDİĞİNDE ekran yüksekliği yarıya düşüyor; RZV rozeti + işletme adı +
  // çıkış satırı o yükseklikte lüks kalıyor. Yan çevirmenin tek amacı daha çok rezervasyon
  // satırı görmek (Gökhan, 2026-08-10: "yukarıdaki logo satırı dışarıda kalsın, beyaz
  // rezervasyon kutusu en üste dayansın"), o yüzden o satır gizleniyor. Dik tutunca geri gelir.
  //
  // Eşik GENİŞLİĞE değil YÜKSEKLİĞE bakar: telefon yan çevrilince genişlik 860'ı aşıyor
  // (büyük telefonlarda 900+), o yüzden "mobil mi" şartına bağlanınca kural hiç çalışmıyordu.
  // max-width: 1100 sadece masaüstünde kısa pencerede tetiklenmesin diye.
  const [yatayMobil, setYatayMobil] = useState(false);
  // Yatayda sayfa yüksekliği ÖLÇÜLEREK veriliyor. 100vh telefon tarayıcısında adres çubuğunu
  // da sayıyor, kutunun alt kenarı ekranın dışında kalıyordu (Gökhan, 2026-08-10: "kutunun
  // alt çizgisi ekranda görünsün"). window.innerHeight gerçekten görünen yüksekliği verir.
  const [ekranYuksekligi, setEkranYuksekligi] = useState(0);
  useEffect(() => {
    // Doğrudan pencere ölçüsü: medya sorgusu bazı telefon tarayıcılarında döndürmede
    // güvenilir tetiklenmiyordu. Kısa + yatık + dar ekran = telefon yan çevrilmiş.
    // Eşik 560 idi: telefonda adres çubuğu gizlenince ekran yükseliyor, sınırın üstüne çıkıyor
    // ve yatay düzen kendiliğinden kapanıp işletme adı satırı geri geliyordu (Gökhan,
    // 2026-08-10). Sınır 700'e çıkarıldı; masaüstünde kısa pencerede tetiklenmesin diye de
    // dokunmatik şartı eklendi (pointer: coarse) — fare varsa bu düzen hiç açılmaz.
    const dokunmatik = window.matchMedia("(pointer: coarse)").matches;
    const update = () => {
      const g = window.innerWidth, y = window.innerHeight;
      setYatayMobil(dokunmatik && g > y && y <= 700 && g <= 1100);
      setEkranYuksekligi(y);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  // Telefon yan çevrilince genişlik 860'ı aşıyor ve program masaüstü görünümüne geçiyordu;
  // üstte gün/arama/düğme çubuğu beliriyor, liste kutusu bir parmak aşağı iniyordu (Gökhan,
  // 2026-08-10: "kutu hâlâ yukarı yaslanmamış, neredeyse 1 cm aşağıda"). Yan çevrilmiş telefon
  // hâlâ telefondur — bu yüzden mobil görünüm orada da açık kalıyor.
  const isMobile = darEkran || yatayMobil;
  // Liste hangi görünümde: telefon kartı mı, webdeki satır listesi mi. Telefon yan
  // çevrildiğinde genişlik 768'i aşsa da kart kalıyor — orada ekran boyu yarıya iniyor.
  const satirListesi = !isMobile || (genisEkran && !yatayMobil);
  /** Dik tablet: satır listesi var ama yer dar — telefon ve not gibi sütunlar çizilmiyor. */
  const dikeyTablet = satirListesi && isMobile && dikEkran;
  /** Tablet düzeni: web satır listesi var ama sayfa telefon kabuğunda (sol menü yok). */
  const tabletDuzen = satirListesi && isMobile;

  // Kural dört rolde de aynı (Gökhan, 2026-08-17: "bu kurallar genel geçerli — şef, PR,
  // mutfak"). Serbest olanlar: işletme sahibi, karşılama, yönetici.
  // WEB VE MOBİL AYRI İŞLER (Gökhan, 2026-08-18): web ana sayfa, işletmenin kendi ekranı —
  // orada rol kısıtı yok. Personel zaten telefondan giriyor, kurallar orada geçerli.
  const kisitli = isMobile && (rolum === "garson" || rolum === "pr" || rolum === "salon_sefi" || rolum === "mutfak");
  /** Durum değiştirebilir mi — geldi, gelmedi, oturdu, tamamlandı, iptal. */
  const durumYetkisi = !kisitli;
  // REZERVASYON SİLME (Gökhan, 2026-08-29: "satıra sağ tıkladığımızda rezervasyon sil
  // çıksın"). Kimin silebileceği ayardan geliyor; yetkisi olmayanda menü hiç açılmıyor.
  // Silme, programın her yerindeki gibi kaydı gizlemek: veri duruyor, listede görünmüyor.
  // SADECE İŞLETME SİLER (Gökhan, 2026-08-29: "bu özellik sadece işletmede olacak").
  // Personelin rolü ne olursa olsun menü açılmaz; işletme sahibinin personel kaydı yoktur,
  // rolü boş gelir. Rol okunana kadar da açılmıyor.
  const silmeHakkim = rolYuklendi && rolum === null;
  const [silMenu, setSilMenu] = useState<{ rez: Rez; x: number; y: number } | null>(null);
  // MASA KUTUSUNA SAĞ TIK (Gökhan, 2026-08-30: "kilit açma yetkisi varsa sağ tıkla kilidi de
  // açabilsin"). Kilit düğmesi kimde görünüyorsa menü de onda çıkıyor.
  const [kilitMenu, setKilitMenu] = useState<{ rez: Rez; x: number; y: number } | null>(null);
  const rezSil = async (r: Rez) => {
    setSilMenu(null);
    const ok = await confirm(`${r.guest_name} adına alınan rezervasyon silinsin mi?`, { confirmLabel: "Sil" });
    if (!ok) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("reservations")
      .update({ deleted_at: new Date().toISOString() }).eq("id", r.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
  };
  // MUTFAK GÖRÜNÜMÜ (Gökhan, 2026-08-17: "masa numaraları ile işi yok, oralarda fix ya da
  // alakart yazsın") — mutfak şefinin listesinde masa sütunu yerine servis tipi çıkıyor.
  // Fix menü kapalıysa her satırda "Alakart" yazacaktı, sütun boşa dönüyordu; o zaman masa
  // yazıyor (Gökhan, 2026-09-01).
  const mutfakGorunumu = isMobile && rolum === "mutfak" && fixAcik;
  // Sütunda tek kelime yazar: Fix ya da Alakart (Gökhan, 2026-08-17) — menü adı ve fix kişi
  // sayısı yazılmıyor.
  // Yeni nesil meyhanede masanın altında fix/alakart da yazıyor (Gökhan, 2026-08-18).
  const ynMeyhane = isletmeTipi === "yn_meyhane";

  // Fare notun üzerindeyken notun tamamını gösteren balon (Gökhan, 2026-08-18) — tıklamaya
  // gerek yok, satırda sığmayan not böyle okunuyor.
  const [notBalon, setNotBalon] = useState<{ id: string; metin: string; kutu: DOMRect } | null>(null);
  // Fare masa kutusunun üzerindeyken rezervasyonun bütün masalarını alt alta gösteren balon;
  // esas masa en üstte. Aşağıda yer yoksa yukarı doğru açılıyor (Gökhan, 2026-08-18).
  const [masaBalon, setMasaBalon] = useState<{ id: string; masalar: string[]; kutu: DOMRect } | null>(null);

  const servisEtiketi = (r: Rez) => {
    if (r.servis_tipi === "fix") return "Fix";
    if (r.servis_tipi === "alakart") return "Alakart";
    return "—";
  };
  /** Kişi kartı açılabilir mi — kısıtlı roller sadece KENDİ personel kaydıyla girdiğinde. */
  // GARSON TELEFONDA HİÇBİR KART AÇAMAZ (Gökhan, 2026-08-18: "rezervasyonlarda da sadece kendi
  // eklediği de olsa hiçbir kartı açamasın, gerek yok, sadece görsün"). Garson bu programı
  // servis başlamadan önce kullanıyor; listeye bakması yetiyor. Diğer kısıtlı rollerde eski
  // kural sürüyor: kendi girdiği kayıtta kart açılır.
  const kartAcilir = (r: Rez) =>
    isMobile && rolum === "garson"
      ? false
      : !kisitli || (!!r.alan_hesap_id && r.alan_hesap_id === benimPersonelId);

  /**
   * "Benim" ölçütü role göre değişiyor (Gökhan, 2026-08-19: "PR'ın da kendi rezervasyon
   * listesini görebilsin, garson gibi"). Garsonda masa kendi postasında mı diye bakılıyor —
   * birleşen masalardan biri yetiyor; PR'da rezervasyonu kendisi mi girmiş diye.
   */
  const benimRezMi = (r: Rez) => {
    if (rolum === "pr") return !!r.alan_hesap_id && r.alan_hesap_id === benimPersonelId;
    const idler = rezMasalar[r.id] ?? (r.table_id ? [r.table_id] : []);
    return idler.some((id) => postamMasalar.has(id));
  };
  /** İşaretleme ve süzme sadece telefonda: postası dağıtılmış garson ve PR. */
  // Halkla ilişkilerde bu ayrı düğme yok; onun yerine üstteki RZV'ler / RZV'lerim ikilisi
  // var (Gökhan, 2026-08-31).
  const kendiSuzgeci = isMobile && rolum === "garson" && postamMasalar.size > 0;
  const kendiEtiketi = "Benim masalarım";
  /** Liste "kendi kayıtlarım"a inebilir mi: garsonun postası, PR'ın aldığı rezervasyonlar. */
  const kendiyeInilir = kendiSuzgeci || (isMobile && rolum === "pr" && !!benimPersonelId);
  useEffect(() => {
    setMenuKapali(window.localStorage.getItem("rzv_menu_kapali") === "1");
  }, []);
  useEffect(() => {
    const onFirstTouch = () => { unlockAudio(); document.removeEventListener("pointerdown", onFirstTouch); };
    document.addEventListener("pointerdown", onFirstTouch);
    return () => document.removeEventListener("pointerdown", onFirstTouch);
  }, []);
  // Liste kaydırılınca açık pencereler kapanır — konumları sabit olduğu için açık kalsalar
  // bağlı oldukları satırdan kopup ekranda asılı kalırlardı.
  const pencereAcik = !!assigningId || !!duzenle || !!paxFiltreKonum;
  useEffect(() => {
    if (!pencereAcik) return;
    const kapat = () => {
      setAssigningId(null); setMasaAtaKonum(null);
      setDuzenle(null); setPaxFiltreKonum(null);
    };
    const el = listeKaydirRef.current;
    el?.addEventListener("scroll", kapat);
    return () => el?.removeEventListener("scroll", kapat);
  }, [pencereAcik]);

  const yenile = async () => { if (restaurantId && gun) await load(restaurantId, gun); };

  // Kaydeden adları — kimlik yerine ad görünsün diye bir kez okunuyor (Gökhan, 2026-08-20).
  useEffect(() => {
    if (!restaurantId) return;
    let acik = true;
    (async () => {
      const [{ data: pers }, { data: isl }] = await Promise.all([
        supabase.from("personel_hesaplari").select("user_id, ad_soyad").eq("restaurant_id", restaurantId),
        supabase.from("restaurants").select("owner_user_id, contact_name").eq("id", restaurantId).maybeSingle(),
      ]);
      if (!acik) return;
      const harita: Record<string, string> = {};
      ((pers as { user_id: string | null; ad_soyad: string | null }[] | null) ?? []).forEach((p) => {
        if (p.user_id && p.ad_soyad) harita[p.user_id] = p.ad_soyad;
      });
      const sahip = isl as { owner_user_id: string | null; contact_name: string | null } | null;
      // Sahibin kendi kaydı personel listesinde yok; Ayarlar'daki yetkili adıyla görünüyor.
      if (sahip?.owner_user_id) harita[sahip.owner_user_id] = (sahip.contact_name ?? "").trim() || "İşletme";
      setKimAdlari(harita);
    })();
    return () => { acik = false; };
  }, [restaurantId]);
  const gunDegistir = (g: string) => setGun(g);

  // MİSAFİR MASASI TESPİTİ — form doldurulurken çalışır. Aynı numara + aynı isim + aynı güne
  // zaten bir rezervasyon varsa bu açılan ikinci masadır; "yakın olsun mu" kutusu o zaman
  // çıkar, başka zaman görünmez (Gökhan, 2026-08-15: "2. masayı fark ettiğinde").
  const fAdSade = fName.trim().toLocaleLowerCase("tr-TR");
  const fTelSade = fPhone.replace(/\D/g, "").slice(-10);
  useEffect(() => {
    const gecerli = newResOpen && !!restaurantId && !!fDate && fTelSade.length >= 10 && fAdSade.length >= 2;
    let iptal = false;
    // Sıfırlama da zamanlayıcının içinde: effect gövdesinde doğrudan setState yapılmıyor.
    const zamanlayici = setTimeout(() => {
      if (!gecerli) { if (!iptal) setFMisafirAday(false); return; }
      const { start, end } = gunSiniri(fDate);
      supabase.from("reservations").select("guest_name, guest_phone")
        .eq("restaurant_id", restaurantId).is("deleted_at", null)
        .neq("status", "iptal")
        .gte("reserved_at", start).lt("reserved_at", end)
        .then(({ data }) => {
          if (iptal) return;
          const kayitlar = (data as { guest_name: string; guest_phone: string | null }[]) ?? [];
          setFMisafirAday(kayitlar.some((r) =>
            (r.guest_phone ?? "").replace(/\D/g, "").slice(-10) === fTelSade
            && r.guest_name.trim().toLocaleLowerCase("tr-TR") === fAdSade));
        });
    }, 400);
    return () => { iptal = true; clearTimeout(zamanlayici); };
  }, [newResOpen, restaurantId, fDate, fTelSade, fAdSade]);

  // Yeni rezervasyonla AYNI GÜN masa tutan rezervasyonlar — günün tamamı TEK HAVUZ.
  //
  // OTURMA SÜRESİNE GÖRE MASA AÇMA KALDIRILDI (Gökhan, 2026-08-16): "oturma süresi kavramı
  // sadece istatistik için gerekli, başka şekilde kullanılamaz. Oturan müşteriye hiçbir yerde
  // kalk diyemezsin, anlık masaya rezervasyon da alamazsın. Masa kalkmadıkça masaya kimse
  // alınamasın — 'kalktı' ya da 'tamamlandı' demedikçe sistem masaya kimseyi almasın."
  //
  // Eskiden bir ayar vardı ("saate göre masa hesabı") ve açıkken masayı oturma süresi kadar
  // dolu sayıp sonra yeni rezervasyona açıyordu. Bu, oturan misafirin masasını önceden
  // başkasına söz vermek demekti. Süre artık sadece istatistikte kullanılıyor.
  //
  // Görüntülenen gün elimizde zaten var; başka güne yazılıyorsa o gün ayrıca çekilir
  // (Gökhan: "yarına, haftaya alınan rezervasyonlarda da kontrol çalışsın").
  // LOCA İSTEYENLER SALON HAVUZUNA GİRMEZ (Gökhan, 2026-08-24): onlar locadan yer bekliyor,
  // salonun masasını tutmuyorlar. Bu yüzden note de çekiliyor.
  const donemGruplariGetir = async (tarih: string): Promise<number[]> => {
    if (tarih === gun) return salonRows.map((r) => r.party_size);
    const { start, end } = gunSiniri(tarih);
    const { data } = await supabase.from("reservations").select("party_size, reserved_at, status, note, dilim")
      .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
      .gte("reserved_at", start).lt("reserved_at", end);
    return ((data as { party_size: number; reserved_at: string; status: string; note: string | null; dilim: string | null }[]) ?? [])
      .filter((x) => x.status === "bekleniyor" || x.status === "geldi" || x.status === "oturdu")
      .filter((x) => !locaIsteyen(x))
      // SADECE GECEYE GELEN SALON MASASI TUTMAZ (Gökhan, 2026-08-29). Görüntülenen gün için
      // bu ayıklama zaten yapılıyordu; ileri tarihli günde unutulmuştu, geceye gelenler de
      // yemek salonuna yazılıyordu. Salon dolduğunda program, gerçekte alabileceği
      // rezervasyonu geceye gelenlerin sayısı kadar erken geri çeviriyordu.
      .filter((x) => x.dilim !== "gece")
      .map((x) => x.party_size);
  };

  // Masa boyu kontrolü — program masayı seçmez, sadece yer var mı bakar; gerekiyorsa sorar.
  // Devam edilecekse true döner.
  // sessiz: true verilirse yer yokken uyarı kutusu AÇILMAZ, sadece false döner. Kapı
  // girişinde karar programın: yer yoksa misafir sessizce bekleme sırasına yazılıyor
  // (Gökhan, 2026-08-18).
  // locaIstendi: notunda loca geçiyorsa salon kapasitesi hiç sorulmuyor — loca elle satılıyor,
  // kararı işletme veriyor (Gökhan, 2026-08-24).
  const masaMusaitMi = async (tarih: string, kisi: number, sessiz = false, locaIstendi = false): Promise<boolean> => {
    if (yerlesimMasalari.length === 0 || locaIstendi) return true;
    const gruplar = await donemGruplariGetir(tarih);

    // ÖNCE planlayıcıya sor: salon dizilirse HERKES oturuyor mu? Sadece yeni gelene bakmak
    // yetmiyordu — yeni rezervasyon yerleşirken başkası açıkta kalıyor, program yine de
    // "olur" diyordu (Gökhan: "58 rezervasyon var, bana hayır diyemedi, sadece bir
    // rezervasyonun masasız kaldığını söyledi"). Kimse açıkta kalmıyorsa soru sorulmaz.
    // alanId ŞART: onsuz planlayıcı bütün salonları tek salon sanıp bir rezervasyona
    // Merkez + Teras + Bahçe'den masa topluyor (Gökhan, 2026-08-15).
    const planMasalar = yerlesimMasalari.map((t) => ({
      id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y,
      alanId: t.area_id,
    }));
    // MASA HESABINDA STOK VARSA sınırı aşan kişi salonun masasını değil stoğu bekler
    // (Gökhan, 2026-08-20). Planlayıcı salon masalarına bakıyor; stoktan karşılanacak kısım
    // ona sorulmuyor, yoksa "yer yok" der ve stok boşa durur.
    const enBuyukMasa2 = yerlesimMasalari.length > 0 ? Math.max(...yerlesimMasalari.map((t) => t.seat_count)) : kisi;
    const planKisi = masaHesabi && kalanStok > 0 ? Math.min(kisi, enBuyukMasa2) : kisi;
    // ÖNCE GERÇEKTEN BOŞ MASALAR (Gökhan, 2026-08-29: "4 kişilik boş bir masa var ama
    // alamıyorum"). Kontrol salonu sıfırdan diziyor ve herkesin oturmasını istiyor; sıfırdan
    // dizerken ek sandalye tanınmadığı için 5 kişilik bir misafire iki masa gerekiyor ve salon
    // kâğıt üstünde tam doluyor. Oysa gerçekte o misafir tek masada oturuyor ve ortada boş
    // masa var. Artık önce elde ne varsa ona bakılıyor: grup boş masalara sığıyorsa alınır.
    // Sığmıyorsa aşağıdaki sıfırdan dizme devreye giriyor — eski davranış aynen duruyor.
    if (tarih === gun) {
      const doluMasaIds = new Set(kapasiteliRows.flatMap((x) => rezMasalar[x.id] ?? []));
      const bosMasalar = planMasalar.filter((m) => !doluMasaIds.has(m.id));
      if (bosMasalar.length > 0
        && salonuPlanla(bosMasalar, [{ id: "yeni", kisi: planKisi }], []).yerlesemeyen.length === 0) return true;
    }
    const { yerlesemeyen: planDisi } = salonuPlanla(
      planMasalar,
      [...gruplar.map((k, i) => ({ id: `mevcut-${i}`, kisi: k })), { id: "yeni", kisi: planKisi }],
      [],
    );
    if (planDisi.length === 0) return true;

    // Sığmıyor — birleştirme ve masa taşıma dahil hiçbir dizilim herkesi oturtamıyor.
    // Artık "devam edelim mi" diye sorulmuyor: sorulacak bir şey yok, yer yok. Bunun yerine
    // en fazla kaç kişilik alınabileceği hesaplanıp söyleniyor.
    let sigan = 0;
    for (let n = kisi - 1; n >= 1; n--) {
      const deneme = salonuPlanla(
        planMasalar,
        [...gruplar.map((k, i) => ({ id: `mevcut-${i}`, kisi: k })), { id: "deneme", kisi: n }],
        [],
      );
      if (deneme.yerlesemeyen.length === 0) { sigan = n; break; }
    }
    // "Elde kalan masalar" da üstteki sayaçla aynı ölçüye çekildi (Gökhan, 2026-08-29).
    // Görüntülenen günde masalar dağıtılmışsa kimseye verilmemiş masalar sayılıyor; kâğıt
    // üstündeki yeniden dağıtım gerçekte harcanan masayı eksik gösterebiliyordu. Başka bir
    // güne bakılıyorsa elimizde o günün atamaları yok, eski hesap sürüyor.
    const gunundeDolu = tarih === gun
      ? new Set(rows.filter((r) => !r.yedek && !r.bekleme
          && (r.status === "bekleniyor" || r.status === "geldi" || r.status === "oturdu"))
        .flatMap((r) => rezMasalar[r.id] ?? []))
      : new Set<string>();
    const bosMasalar = yerlesimMasalari.filter((t) => !gunundeDolu.has(t.id));
    const havuz = bosMasalar.length < yerlesimMasalari.length
      ? bosMasalar.reduce((h, t) => h.set(t.seat_count, (h.get(t.seat_count) ?? 0) + 1), new Map<number, number>())
      : havuzuTuket(yerlesimMasalari, gruplar).havuz;
    const bosluk = havuzDokumu(havuz);
    // Her rezervasyon en az bir masa ister — koltuk kalmış olsa bile masa bitmişse yeni
    // rezervasyon alınamaz (Gökhan: "masa sayısı kadar rezervasyon alabilirsin, fazlasını
    // alamazsın"). Sebep buysa açıkça söylensin, "hiçbir boyda alınamaz" deyip geçmesin.
    // Birleşen masalar tek sayıldığı için ölçüt etkin masa sayısı (Gökhan, 2026-08-18).
    const masaBitti = gruplar.length >= etkinMasaSayisi;
    if (sessiz) return false;
    setUyari({
      baslik: `${kisi} kişilik rezervasyon alınamıyor`,
      satirlar: masaBitti
        ? [
            `Salonda ${etkinMasaSayisi} masa var ve ${gruplar.length} rezervasyon almışsın — masa kalmadı.`
              + (birlesmeFazlasi > 0 ? ` (${birlesmeFazlasi} masa birleştirmede kullanıldı, birleşenler tek masa sayılıyor.)` : ""),
            "Her rezervasyon kendi masasını ister; koltuk boş olsa bile iki ayrı rezervasyon aynı masaya oturmaz.",
            "Yeni rezervasyon için mevcut rezervasyonlardan biri iptal edilmeli.",
          ]
        : [
            `Salon baştan dizilse bile ${kisi} kişilik bu grubu oturtacak yer çıkmıyor — masaları birleştirmek ve taşımak dahil.`,
            bosluk ? `Elde kalan masalar: ${bosluk}.` : "Boş masa kalmadı.",
            sigan > 0
              ? `Şu an en fazla ${sigan} kişilik bir rezervasyon alabilirsin.`
              : "Şu an hiçbir boyda rezervasyon alınamaz.",
            `${kisi} kişiliği alabilmen için mevcut rezervasyonlardan biri iptal edilmeli ya da kişi sayısı küçültülmeli.`,
          ],
    });
    return false;
  };

  // Yeni rezervasyon penceresi Ayarlar'daki varsayılan saatle açılır. O saat bugün için
  // geçmişse bir sonraki TAM saate atlar (Gökhan: "19'u geçince bir sonraki saat dilimine
  // geçsin, yarım saat değil") — 21:32'de 22:00, 21:05'te de 22:00.
  const acilisSaati = () => {
    if (gun !== bugunIstanbul()) return varsayilanSaat;
    const s = new Date(new Date(now).toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const suAnDk = s.getHours() * 60 + s.getMinutes();
    const [vs, vd] = varsayilanSaat.split(":").map((x) => parseInt(x, 10));
    if (suAnDk < vs * 60 + (vd || 0)) return varsayilanSaat;
    return `${String((s.getHours() + 1) % 24).padStart(2, "0")}:00`;
  };

  // Geçmişten yedek limitini öğrenir: son 12 haftada AYNI HAFTA GÜNÜNDE alınan
  // rezervasyonların yüzde kaçı boşa düşmüş (gelmedi + iptal). O oran masa sayısına
  // uygulanınca "bu gün için kaç yedek alınabilir" çıkar. Yedek kayıtları hesaba katılmaz,
  // yoksa kendi kendini besler. Yeterli geçmiş yoksa (10 kayıttan az) öneri verilmez —
  // uydurma sayı göstermek yok.
  useEffect(() => {
    if (!restaurantId || !gun || tables.length === 0) { setYedekOneri(null); return; }
    let iptalEdildi = false;
    (async () => {
      const hedef = new Date(`${gun}T12:00:00+03:00`);
      const dow = hedef.getDay();
      const bas = new Date(hedef.getTime() - 84 * 86400000).toISOString();
      const { data } = await supabase.from("reservations")
        .select("reserved_at, status")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
        .gte("reserved_at", bas).lt("reserved_at", hedef.toISOString());
      if (iptalEdildi) return;
      const ayniGun = ((data as { reserved_at: string; status: string }[]) ?? [])
        .filter((r) => new Date(r.reserved_at).getDay() === dow);
      if (ayniGun.length < 10) { setYedekOneri(null); return; }
      const bosa = ayniGun.filter((r) => r.status === "gelmedi" || r.status === "iptal").length;
      const oran = bosa / ayniGun.length;
      setYedekOneri({ oran, limit: Math.max(1, Math.round(oran * tables.length)), ornek: ayniGun.length });
    })();
    return () => { iptalEdildi = true; };
  }, [restaurantId, gun, tables.length]);

  // O gün hâlâ sırada bekleyen yedek sayısı.
  const bekleyenYedek = rows.filter((r) => r.yedek && r.status === "bekleniyor").length;

  const openNewRes = () => {
    setFName(""); setFPhone(""); setFParty("2"); setFDate(gun);
    setFTime(acilisSaati());
    setFNote("");
    setFYedek(false);
    setFServis("alakart"); setFFixMenu(""); setFFixKisi("");
    setFMisafirAday(false); setFMisafirYakin(false);
    setFSecKartId(null);
    setFKadin(""); setFErkek(""); setFKanal("telefon");
    setFMasaSecimi([]); setFPlanAcik(false); setFPlanAlanId(null); setFPlanDolu({}); setFPlanDoluKisi({});
    setFDilim("yemek_gece"); setFDilimSecildi(false);
    setFKonsept(konseptler.length === 1 ? konseptler[0] : "");
    setErr(null);
    setNewResOpen(true);
  };

  // O günün masa doluluğu — gün değişirse yeniden okunur. Pencere AÇILDIĞI anda okunuyor,
  // sadece plan açılınca değil (Gökhan, 2026-08-28): not yazılırken "loca dolu mu, o salonda
  // yer var mı" bilgisini vermek için de bu tabloya bakılıyor.
  // Listedeki bir satırdan masa seçilirken de aynı tablo lazım — o zaman görüntülenen gün
  // için okunuyor (Gökhan, 2026-08-29).
  useEffect(() => {
    const dolulukGunu = newResOpen ? fDate : (assigningId ? gun : "");
    if (!dolulukGunu || !restaurantId) return;
    let iptal = false;
    (async () => {
      const { start, end } = gunSiniri(dolulukGunu);
      const { data } = await supabase.from("reservations")
        .select("guest_name, party_size, status, reservation_tables(table_id)")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
        .in("status", ["bekleniyor", "geldi", "oturdu"])
        .gte("reserved_at", start).lt("reserved_at", end);
      if (iptal) return;
      const harita: Record<string, string> = {};
      const kisiHarita: Record<string, number> = {};
      ((data as { guest_name: string; party_size: number; reservation_tables: { table_id: string }[] | null }[]) ?? []).forEach((r) => {
        (r.reservation_tables ?? []).forEach((x) => { harita[x.table_id] = r.guest_name; kisiHarita[x.table_id] = r.party_size; });
      });
      setFPlanDolu(harita);
      setFPlanDoluKisi(kisiHarita);
    })();
    return () => { iptal = true; };
  }, [newResOpen, assigningId, gun, restaurantId, fDate]);

  const submit = async () => {
    if (!restaurantId) return;
    const kisi = parseInt(fParty, 10);
    const eksik = eksikAlan([
      [!fName.trim(), "misafir adı"],
      [!fDate, "tarih"],
      [!fTime, "saat"],
      [!kisi || kisi <= 0, "kişi sayısı"],
    ]);
    if (eksik) { setErr(eksik); return; }
    // NUMARA GİRİLMEDİYSE SORULUR — kaydetmeden önce (Gökhan, 2026-08-29). Engellemiyor:
    // "Yine de kaydet" denince kayıt geçiyor, "Geri dön" denince pencere açık kalıyor.
    // Rezervasyon türü uyarısı kaldırıldı: kutu artık "Yemek + gece" ile açılıyor, dokunulmasa
    // da anlamlı bir değer giriliyor.
    const eksikSatirlar: string[] = [];
    if (!fPhone.trim()) eksikSatirlar.push("Telefon numarası girilmedi, teyit mesajı gönderilemez.");
    if (eksikSatirlar.length > 0) {
      const yineDe = await confirm(eksikSatirlar.join("\n"), {
        confirmLabel: "Yine de kaydet", cancelLabel: "Geri dön", danger: false,
      });
      if (!yineDe) return;
    }
    // Kadın/erkek toplamı kişi sayısını AŞAMAZ — "2 kişi ama 3 kadın 3 erkek" gibi çelişkili
    // bir girişi sessizce kabul etmemeli (Gökhan, 2026-08-07).
    const kadinSayi = fKadin.trim() ? parseInt(fKadin, 10) : 0;
    const erkekSayi = fErkek.trim() ? parseInt(fErkek, 10) : 0;
    if (kadinSayi + erkekSayi > kisi) {
      setErr(`Kadın + erkek toplamı (${kadinSayi + erkekSayi}) kişi sayısını (${kisi}) geçemez.`);
      return;
    }
    setErr(null);

    const iso = new Date(`${fDate}T${fTime}:00+03:00`).toISOString();
    // Geçmiş saate yazılabilir ama program uyarır — atlanmış bir rezervasyon sonradan
    // girilebiliyor ya da düzeltme yapılıyor olabilir (Gökhan).
    if (Date.parse(iso) < now) {
      const ok = await confirm(`Bu saat geçmiş (${fTime}). Yine de kaydedelim mi?`, { danger: false });
      if (!ok) return;
    }
    // LOCA İSTEYEN salonun masasını tutmuyor — salon kapasitesi ona sorulmuyor (Gökhan,
    // 2026-08-24). Masayı elle seçtiyse de kontrol gereksiz: masası zaten belli.
    const locaIstendi = locaMasalari.length > 0 && nottaLoca(ilkHarfBuyukTr(fNote) || null, locaMasalari);
    // RESTORAN + EĞLENCE dilimi — sadece eğlence gününde yazılır (Gökhan, 2026-08-27:
    // diğer günlerde kutu hiç çıkmaz, mekân normal restoran gibi çalışır).
    const fTurCoz = turuCoz(fDilim);
    const fDilimDegeri: Dilim | null = eglenceAktif && eglenceGunuMu(fDate, eglenceGunleri) ? fTurCoz.dilim : null;
    // Kutudan "Ayakta" seçildiyse misafir bistro tutmaz — gece turu ona masa dağıtmaz.
    const fAyaktaSecildi = !!fDilimDegeri && fTurCoz.ayakta;
    // GECE REZERVASYONU GEÇİŞ SAATİNDEN ÖNCEYE YAZILMAZ (Gökhan, 2026-08-27: "saat 21:00'dan
    // sonrası için ya da 22:00'dan sonrası için"). O saatten önce salon hâlâ yemek düzeninde,
    // bistro masası ortada yok. Yemek rezervasyonu ise geçiş saatinden sonraya yazılmaz.
    if (fDilimDegeri === "gece" && fTime < eglenceGecis) {
      setUyari({
        baslik: "Gece rezervasyonu bu saate yazılamaz",
        satirlar: [
          `Gece düzenine ${eglenceGecis}'de geçiliyor — o saate kadar salonda yemek masaları duruyor.`,
          `Saati ${eglenceGecis} ya da sonrası yap; misafir yemeğe de gelecekse dilimi "Yemek + gece" seç.`,
        ],
      });
      return;
    }
    if (fDilimDegeri === "yemek" && fTime >= eglenceGecis) {
      setUyari({
        baslik: "Yemek rezervasyonu bu saate yazılamaz",
        satirlar: [
          `${eglenceGecis}'den sonra yemek düzeni bitiyor, salon gece düzenine geçiyor.`,
          `Saati öne al ya da dilimi "Gece" seç.`,
        ],
      });
      return;
    }
    // YEMEK + GECE: BİR TARAF DOLUYSA SEÇENEK ÇIKAR (Gökhan, 2026-08-29). Önceden yemekte
    // yer yoksa rezervasyon hiç alınamıyor, gecede bistro boş dursa bile misafir kaybediliyordu.
    // Artık program duvara çarpınca soruyor. "Geceye al" iki kayıt açıyor: gece rezervasyonu
    // (bistrosunu alır, bekler) ve yemek için yedek. Yemekte yer açılıp yedek listeye alınınca
    // ikisi tek rezervasyonda birleşiyor.
    // Yedek düğmesine kendin bastıysan hiçbir şey sorulmaz — kararı sen vermişsin.
    // O GÜNÜN DOLULUĞU (Gökhan, 2026-08-29: "ileri bir güne rezervasyon alırken o günün gece
    // yoğunluğunu alınan rezervasyondan bilebilir"). Görüntülenen günde ekrandaki sayılar
    // kullanılıyor; başka bir güne yazılıyorsa o günün rezervasyonları çekilip aynı ölçütlerle
    // toplanıyor. Bistro ve ayakta kapasitesi güne göre değişmiyor. Bir kere hesaplanıp
    // saklanıyor — aynı kayıt için iki kez sorulmasın.
    // GECE MASAYLA SAYILIR (Gökhan, 2026-08-29: "bistro yok ama yine de geceye rezervasyon
    // alıyor"). Kişi hesabı yanıltıyordu: 6 kişilik grup iki bistro tutuyor ama kapasiteden
    // sadece 6 kişi düşüyordu; bistrolar bitse de "yer var" görünüyordu. Artık tutulmuş bistro
    // adedi de sayılıyor ve kontrol adete bakıyor.
    let doluCache: { yemek: number; gece: number; ayakta: number; bistro: number } | null = null;
    const doluluk = async () => {
      if (doluCache) return doluCache;
      if (fDate === gun) { doluCache = { yemek: gunPax, gece: gecePax, ayakta: ayaktaPax, bistro: geceTalep }; return doluCache; }
      const { start, end } = gunSiniri(fDate);
      const { data } = await supabase.from("reservations")
        .select("party_size, status, note, dilim, ayakta, bekleme, reservation_tables(table_id)")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
        .gte("reserved_at", start).lt("reserved_at", end);
      type GunKaydi = { party_size: number; status: string; note: string | null; dilim: string | null; ayakta: boolean | null; bekleme: boolean | null; reservation_tables: { table_id: string }[] | null };
      const sayilan = ((data as GunKaydi[]) ?? []).filter((x) => !x.bekleme
        && (x.status === "bekleniyor" || x.status === "geldi" || x.status === "oturdu"));
      doluCache = {
        yemek: sayilan.filter((x) => !locaIsteyen(x) && x.dilim !== "gece").reduce((t, x) => t + x.party_size, 0),
        gece: sayilan.filter((x) => (x.dilim === "gece" || x.dilim === "yemek_gece") && !x.ayakta).reduce((t, x) => t + x.party_size, 0),
        ayakta: sayilan.filter((x) => x.ayakta).reduce((t, x) => t + x.party_size, 0),
        // Gereken bistro toplamı — atanmış olup olmaması önemli değil (2026-08-29).
        bistro: sayilan
          .filter((x) => (x.dilim === "gece" || x.dilim === "yemek_gece") && !x.ayakta && !locaIsteyen(x))
          .reduce((t, x) => t + (bistroKisi ? Math.max(1, Math.ceil(x.party_size / bistroKisi)) : 1), 0),
      };
      return doluCache;
    };
    type Karar = "normal" | "geceyeAl" | "yemegeAl" | "yedegeYaz" | "ayaktaAl";
    let karar: Karar = "normal";
    if (!fYedek && !fAyaktaSecildi && eglenceAktif && fDilimDegeri === "yemek_gece") {
      const dolu = await doluluk();
      const masaSecili = locaIstendi || fMasaSecimi.length > 0;
      const yemekYer = (await masaMusaitMi(fDate, kisi, true, masaSecili))
        && (masaSecili || dolu.yemek + kisi <= toplamKapasite);
      // Gece adetle sayılıyor: ayarda kişi sınırı varsa kişi ÷ o sayı, yoksa bir bistro.
      const gerekenBistro = bistroGereken(kisi);
      const geceYer = gerekenBistro <= bistroSayisi - dolu.bistro;
      if (!yemekYer || !geceYer) {
        const ayaktaKalan = ayaktaKapasite - dolu.ayakta;
        const secenekler: { anahtar: string; etiket: string }[] = [];
        if (!yemekYer && geceYer) secenekler.push({ anahtar: "geceyeAl", etiket: "Geceye al" });
        if (yemekYer && !geceYer) {
          if (ayaktaKalan >= kisi) secenekler.push({ anahtar: "ayaktaAl", etiket: "Ayakta al" });
          secenekler.push({ anahtar: "yemegeAl", etiket: "Sadece yemeğe al" });
        }
        secenekler.push({ anahtar: "yedegeYaz", etiket: "Yedeğe yaz" });
        const mesaj = !yemekYer && !geceYer
          ? "Yemekte de gecede de yer yok."
          : !yemekYer
            ? "Yemek salonunda yer yok, gecede var."
            : `Gecede yer yok, yemekte var.${ayaktaKalan >= kisi ? ` (ayakta ${ayaktaKalan} kişilik yer var)` : ""}`;
        const secilen = await secim(`${mesaj}
Ne yapalım?`, secenekler);
        if (!secilen) return;
        karar = secilen as Karar;
      }
    }
    // Yedek masa tutmaz: ne masa müsaitlik kontrolünden geçer ne de kapasiteyi doldurur.
    // Zaten "yer yok ama sıraya yazdır" demek olduğu için dolu salonda da alınabilmeli.
    // Sadece geceye gelen de yemek masası kontrolünden geçmez — onun yeri bistro.
    if (!fYedek && karar === "normal" && !(await masaMusaitMi(fDate, kisi, false, locaIstendi || fMasaSecimi.length > 0 || fDilimDegeri === "gece"))) return;

    // Öğrenilen yedek limiti dolduysa uyarır ama yasaklamaz — son söz Gökhan'ın.
    if (fYedek && fDate === gun && yedekOneri && bekleyenYedek >= yedekOneri.limit) {
      const ok = await confirm(
        `Yedek limiti doldu. Bu günlerde geçmişte ortalama ${yedekOneri.limit} masa boşalıyor ve şu an ${bekleyenYedek} yedek bekliyor. Yine de alınsın mı?`,
        { danger: false },
      );
      if (!ok) return;
    }

    // Kapasite dolduğunda artık Yedek'e almıyoruz, doğrudan reddediyoruz (Gökhan: "yedek
    // rezervasyon almayı durdur, şu an alamazsın"). Kontrol sadece görüntülenen gün için
    // yapılabiliyor — başka günün pax toplamı elimizde yok, orada masa kontrolü iş görüyor.
    let mevcut = 0;
    // Loca isteyen ve masası elle seçilmiş rezervasyon salon kapasitesine girmiyor.
    if (fDate === gun && !fYedek && karar === "normal" && !locaIstendi && fMasaSecimi.length === 0 && fDilimDegeri !== "gece") {
      mevcut = gunPax;
      if (mevcut + kisi > toplamKapasite) {
        setUyari({
          baslik: "Kapasite dolu",
          satirlar: [
            `Bu günde ${toplamKapasite} koltuğun ${mevcut}'i tutulmuş, ${kisi} kişilik daha alınamıyor.`,
            `En fazla ${Math.max(0, toplamKapasite - mevcut)} kişilik bir rezervasyon sığar.`,
            // Dolu gün = yedeğin asıl işe yaradığı gün. Program burada öğrendiğini söyler.
            ...(yedekOneri
              ? [`Yedek alabilirsin: son ${yedekOneri.ornek} kayda göre bu günlerde rezervasyonların %${Math.round(yedekOneri.oran * 100)}'i boşa düşüyor, ortalama ${yedekOneri.limit} masa açılıyor. Şu an ${bekleyenYedek} yedek var.`]
              : ["Yedek olarak yazabilirsin — yer boşalırsa program onu yerleştirir."]),
            "Yer açmak için mevcut rezervasyonlardan biri iptal edilmeli ya da kişi sayısı küçültülmeli.",
          ],
        });
        return;
      }
    }

    // GECE (BİSTRO) KAPASİTESİ (Gökhan, 2026-08-27): geceye kalanlar bistro kapasitesinden
    // düşer; bistrolar bitince ayakta kapasitesi kadar masasız alınır, o da bitince alınmaz.
    // Kontrol her gün için çalışıyor: ileri tarihte o güne alınmış rezervasyonlardan
    // hesaplanıyor (Gökhan, 2026-08-29). Eskiden sadece görüntülenen güne bakabiliyordu.
    let fAyakta = karar === "ayaktaAl" || fAyaktaSecildi;
    // KUTUDAN AYAKTA SEÇİLDİYSE (Gökhan, 2026-08-29). Misafir bistro istemiyor; bistro
    // aranmaz, ayakta kapasitesine bakılır. Kapasite yetmiyorsa alınmaz.
    if (!fYedek && fAyaktaSecildi && fDate === gun) {
      const ayaktaKalan = ayaktaKapasite - ayaktaPax;
      if (ayaktaKalan < kisi) {
        setUyari({
          baslik: "Ayakta kapasitesi dolu",
          satirlar: [
            ayaktaKapasite > 0
              ? `Ayakta kapasitesi ${ayaktaKapasite} kişilik, ${ayaktaPax}'i tutulmuş.`
              : "Ayakta kapasite tanımlı değil — Ayarlar > Yemek ve gece bölümünden girilebilir.",
            `${kisi} kişi ayakta alınamıyor.`,
          ],
        });
        return;
      }
    }
    if (!fYedek && !fAyaktaSecildi && karar === "normal" && (fDilimDegeri === "gece" || fDilimDegeri === "yemek_gece")) {
      const gDolu = await doluluk();
      const gerekenBistro = bistroGereken(kisi);
      const bosBistro = bistroSayisi - gDolu.bistro;
      if (gerekenBistro > bosBistro) {
        const ayaktaKalan = ayaktaKapasite - gDolu.ayakta;
        if (ayaktaKalan >= kisi) {
          const ok = await confirm(
            bistroSayisi === 0
              ? `Gece salonu kurulmamış. ${kisi} kişi ayakta alınsın mı? (ayakta ${ayaktaKalan} kişilik yer var)`
              : `${kisi} kişi için ${gerekenBistro} bistro gerekiyor, ${bosBistro} bistro boş (${bistroSayisi} bistronun ${gDolu.bistro} tanesi tutulmuş). Ayakta alınsın mı? (ayakta ${ayaktaKalan} kişilik yer var)`,
            { confirmLabel: "Ayakta al" },
          );
          if (!ok) return;
          fAyakta = true;
        } else {
          setUyari({
            baslik: "Gece kapasitesi dolu",
            satirlar: [
              bistroSayisi > 0
                ? `${bistroSayisi} bistronun ${gDolu.bistro} tanesi tutulmuş, ${bosBistro} tanesi boş. ${kisi} kişi için ${gerekenBistro} bistro gerekiyor.`
                : "Gece salonu kurulmamış — Salon ekranından \"Gece salonu\" türüyle açılabilir.",
              ayaktaKapasite > 0
                ? `Ayakta kapasitesi de dolu (${ayaktaKapasite} kişinin ${gDolu.ayakta}'i tutulmuş).`
                : "Ayakta kapasite tanımlı değil — Ayarlar > Yemek ve gece bölümünden girilebilir.",
              `${kisi} kişilik gece rezervasyonu için yer kalmadı.`,
            ],
          });
          return;
        }
      }
    }
    setBusy(true);
    // Rezervasyonu kim aldıysa (oturum açan kişi) otomatik etiketlenir — elle seçim yok
    // (Gökhan, 2026-08-07: "kimin şifresiyle alındıysa o almıştır").
    const { data: { session } } = await supabase.auth.getSession();
    // AYNI NUMARAYLA İKİNCİ MÜŞTERİ KAYDI AÇILMAZ (Gökhan, 2026-08-13). Telefon girildiyse o
    // numaranın müşteri kartı aranır; varsa rezervasyon ONA bağlanır, yoksa bir kart açılıp
    // yine ona bağlanır. Eskiden kart yalnız isim aramasından biri seçilirse bağlanıyordu;
    // seçilmezse aynı kişi her seferinde yeni bir müşteri gibi düşüyor, geçmişi ve sadakati
    // bölünüyordu.
    let kartId = fSecKartId;
    const tel = fPhone.trim();
    if (!kartId && tel) {
      const { data: kart } = await supabase.from("kisi_kartlari")
        .upsert({ restaurant_id: restaurantId, phone: tel }, { onConflict: "restaurant_id,phone", ignoreDuplicates: false })
        .select("id").single();
      kartId = (kart as { id: string } | null)?.id ?? null;
    }
    // LOCA KURALLARI, MASA PENCEREDEN SEÇİLDİYSE (Gökhan, 2026-08-24). Locayı elle seçmek de
    // "loca satmak"tır: masayı satır üstünden verirken işleyen kurallar burada da işlemeli,
    // yoksa aynı iş iki kapıdan farklı davranır.
    let fKaporaAlindi = false;
    const secilenLocalar = fMasaSecimi
      .map((id) => tables.find((t) => t.id === id))
      .filter((t): t is TableRow => !!t && (t.shape === "loca" || (!!t.grup_id && locaGrupIds.has(t.grup_id))));
    if (secilenLocalar.length > 0) {
      const benimRol = rolum === null ? "yonetici" : rolum;
      const yeter = locaSatisYetkisi === "herkes"
        || (locaSatisYetkisi === "karsilama" && ["karsilama", "yonetici"].includes(benimRol))
        || (locaSatisYetkisi === "pr" && ["pr", "yonetici"].includes(benimRol))
        || (locaSatisYetkisi === "yonetici" && benimRol === "yonetici");
      if (!yeter) {
        const kimler = locaSatisYetkisi === "yonetici" ? "yönetici"
          : locaSatisYetkisi === "pr" ? "PR ve yönetici" : "karşılama ve yönetici";
        setErr(`Loca satma yetkin yok — bu işletmede locayı ${kimler} satabiliyor.`);
        return;
      }
      // Paket bu pencerede seçilmiyor; paketsiz loca yasaksa kayıt açılıp loca sonradan verilir.
      if (locaPaketZorunlu) {
        setErr("Loca paketsiz verilemiyor — önce rezervasyonu masasız kaydet, paketi seçtikten sonra locayı ver.");
        return;
      }
      if (locaKaporaAcik) {
        const tutarYazi = locaKaporaTutar ? ` (${locaKaporaTutar.toLocaleString("tr-TR")} ₺)` : "";
        fKaporaAlindi = await confirm(`Loca kaporası${tutarYazi} alındı mı?`, { confirmLabel: "Alındı" });
        if (!fKaporaAlindi && locaKaporaZorunlu) {
          setErr("Bu işletmede loca kaporasız verilemiyor.");
          return;
        }
      }
    }
    // SINIR AŞILINCA İKİNCİ MASA (Gökhan, 2026-08-20: "6 7 8 olduğunda iki masa birleşir").
    // Masa hesabında bir masanın aldığı kişi sınırlıdır; kişi sayısı bunu aşarsa ikinci masa
    // gerekir. O masa YANDAKİ masadan alınmaz — o masa başka misafirin — önce depodaki
    // stoktan verilir, kullanılan her masa stoktan düşer. Stok bittiğinde masa arka sıradan
    // gelir; bu durumda program masayı yerleşim sırasında kendisi seçer.
    // Masası elle seçilmiş ya da loca isteyen rezervasyona stoktan masa eklenmiyor — masası belli.
    let stokMasa = 0;
    if (masaHesabi && yerlesimMasalari.length > 0 && !locaIstendi && fMasaSecimi.length === 0) {
      const enBuyukMasa = Math.max(...yerlesimMasalari.map((t) => t.seat_count));
      if (kisi > enBuyukMasa) {
        // Planlayıcıyla AYNI formül — iki yer farklı sayı bulursa masa eksik/fazla çıkıyor.
        const gerekenEk = Math.max(0, Math.ceil(kisi / Math.max(masaEnFazlaKisi, 1)) - 1);
        if (sinirAsilinca === "ekleme") {
          // İşletme "eklemesin, ben seçeyim" demiş: kayıt açılır, masayı insan seçer.
        } else {
          const stoktanVerilebilir = Math.min(gerekenEk, kalanStok);
          const onay = sinirAsilinca === "otomatik" ? true : await confirm(
            stoktanVerilebilir > 0
              ? `${kisi} kişi tek masaya sığmıyor. Stoktan ${stoktanVerilebilir} masa eklensin mi? (stokta ${kalanStok} masa var)`
              : `${kisi} kişi tek masaya sığmıyor ve stok bitti. İkinci masa arka sıradaki masalardan verilsin mi?`,
            { confirmLabel: "Ekle" },
          );
          if (onay) stokMasa = stoktanVerilebilir;
        }
      }
    }
    // "Geceye al" / "Sadece yemeğe al" seçildiğinde ana kayıt tek dilime iner; öteki yarısı
    // hemen altta yedek olarak açılır (Gökhan, 2026-08-29).
    const anaDilim = karar === "geceyeAl" ? "gece" : karar === "yemegeAl" ? "yemek" : fDilimDegeri;
    const anaSaat = karar === "geceyeAl" ? eglenceGecis : fTime;
    const kayitAlanlari = {
      restaurant_id: restaurantId,
      guest_name: toTitleTr(fName),
      guest_phone: fPhone.trim() || null,
      party_size: kisi,
      duration_minutes: oturmaSuresi,
      note: ilkHarfBuyukTr(fNote) || null,
      consent_at: fPhone.trim() ? new Date().toISOString() : null,
      kisi_karti_id: kartId,
      kadin_sayisi: fKadin.trim() ? parseInt(fKadin, 10) : null,
      erkek_sayisi: fErkek.trim() ? parseInt(fErkek, 10) : null,
      iletisim_kanali: fKanal,
      // Aynı kişinin aynı güne ikinci masası — misafirleri için (Gökhan, 2026-08-15).
      misafir_masasi: fMisafirAday,
      misafir_yakin: fMisafirAday ? fMisafirYakin : null,
      created_by: session?.user.id ?? null,
      // Rezervasyonu giren PERSONEL kaydı (Ekip hesabı). Kişi kartı yetkisi buna bakıyor —
      // aynı hesapta birden fazla personel olabildiği için oturum kimliği yetmiyor
      // (Gökhan, 2026-08-17: "şef garsonunkini açabiliyor").
      alan_hesap_id: benimPersonelId,
      // Fix menü kapalıysa hiç sorulmuyor, o yüzden boş gidiyor.
      servis_tipi: fixAcik ? fServis : null,
      fix_menu_id: fixAcik && fServis === "fix" ? (fFixMenu || null) : null,
      fix_kisi: fixAcik && fServis === "fix" && karmaFix && fFixKisi.trim() ? parseInt(fFixKisi, 10) : null,
      // Stoktan verilen masa adedi — günün stoğu bundan düşüyor (masa hesabı).
      stok_masa: stokMasa,
      // MASA ELLE SEÇİLDİYSE KİLİTLİ AÇILIR (Gökhan, 2026-08-24: "rezervasyon alırken seçilmiş
      // masayı kimse değiştiremesin çünkü o artık müşteriye söylenmiştir"). Kilitliyken
      // otomatik yerleşim dokunmaz; kilidi sadece yönetici açabilir (bkz. kilitDegistir).
      masa_kilit: fMasaSecimi.length > 0,
      // Loca kaporası pencerede alındıysa kayda geçiyor — masa verilirken bir daha sorulmasın.
      kapora_alindi: fKaporaAlindi,
      kapora_tutar: fKaporaAlindi ? locaKaporaTutar : null,
      // Restoran + eğlence dilimi ve ayakta işareti (Gökhan, 2026-08-27).
    };
    // LOCADA KİŞİ LİMİTİ — masa rezervasyon alınırken elle seçilmişse kontrol burada
    // (Gökhan, 2026-08-30). Sonradan masa verilirken aynı kontrol masa atamanın içinde.
    if (locaKisi && fMasaSecimi.length > 0) {
      const secilenLoca = fMasaSecimi
        .map((id) => tables.find((t) => t.id === id))
        .filter((t) => !!t && (t.shape === "loca" || (!!t.grup_id && locaGrupIds.has(t.grup_id)))).length;
      if (secilenLoca > 0 && kisi > locaKisi * secilenLoca) {
        const ok = await confirm(
          `Loca ${locaKisi * secilenLoca} kişilik, ${kisi} kişi giriyor.`,
          { confirmLabel: "Yine de al", cancelLabel: "Vazgeç", danger: false },
        );
        if (!ok) return;
      }
    }
    const { data: yeniKayit, error } = await supabase.from("reservations").insert({
      ...kayitAlanlari,
      reserved_at: new Date(`${fDate}T${anaSaat}:00+03:00`).toISOString(),
      yedek: fYedek || karar === "yedegeYaz",
      dilim: anaDilim,
      ayakta: fAyakta,
      // Seçilen konseptin adı — işletme kendi konseptlerini kurduysa dolu (Gökhan, 2026-08-30).
      konsept: fKonsept || null,
    }).select("id").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    // ÖTEKİ YARISI YEDEĞE (Gökhan, 2026-08-29). Aynı misafirin aynı gününde iki kayıt olur:
    // biri normal rezervasyon, biri yedek. Yedek listeye alınınca ikisi tek kayıtta birleşiyor.
    if (karar === "geceyeAl" || karar === "yemegeAl") {
      await supabase.from("reservations").insert({
        ...kayitAlanlari,
        reserved_at: new Date(`${fDate}T${karar === "geceyeAl" ? fTime : eglenceGecis}:00+03:00`).toISOString(),
        yedek: true,
        dilim: karar === "geceyeAl" ? "yemek" : "gece",
        ayakta: false,
        // Yedek masa tutmaz: kilit, stok ve kapora ona işlemez.
        masa_kilit: false,
        stok_masa: 0,
        kapora_alindi: false,
        kapora_tutar: null,
        misafir_masasi: false,
        misafir_yakin: null,
      });
    }
    // Seçilen masalar kayıtla birlikte atanıyor — pencere kapanmadan önce, ki otomatik
    // yerleşim devreye girdiğinde masa zaten tutulmuş olsun.
    if (yeniKayit && fMasaSecimi.length > 0) {
      const { error: masaHata } = await supabase.rpc("assign_reservation_tables", { p_reservation_id: yeniKayit.id, p_table_ids: fMasaSecimi });
      if (masaHata) setErr(masaHata.message);
    }
    if (yeniKayit) bildirimGonder(yeniKayit.id, "onay");
    // ONAY MESAJI ANINDA (Gökhan, 2026-08-18) — sessiz saat kuralı buna işlemez, misafir
    // o an cevap bekliyor. Numara yoksa mesaj hazırlanmaz.
    if (yeniKayit && mesajAyar?.acik && mesajAyar.onayAcik && fPhone.trim()) {
      const taslak = {
        id: yeniKayit.id, guest_name: toTitleTr(fName), guest_phone: fPhone.trim(),
        party_size: kisi, reserved_at: new Date(`${fDate}T${fTime}:00+03:00`).toISOString(),
      } as Rez;
      await mesajKuyrugaYaz(taslak, "onay", mesajMetni(mesajAyar.onayMetni, taslak, "Sayın {isim}, {tarih} {saat} için {kisi} kişilik rezervasyonunuzu aldık."), true);
    }
    setNewResOpen(false);
    if (fDate === gun && mevcut < toplamKapasite && mevcut + kisi >= toplamKapasite) {
      bildirCapacityNotice(`Kapasite bu rezervasyonla doldu (${toplamKapasite}/${toplamKapasite} pax) — bu saate başka rezervasyon alınamaz.`);
    }
    // PROGRAM MASAYI KENDİSİ VERİR — ama SADECE otomatik yerleşme açıkken (Gökhan,
    // 2026-08-29: "otomatik masa ata kapalıysa sistem sadece rezervasyonu alır, kullanıcı
    // isterse masa atar"). Kapalıyken masa ancak elle seçilerek ya da "Yerleşim yap"a
    // basılarak verilir. Rezervasyon hangi güne yazıldıysa o günün planı kurulur, ekranda o
    // gün açık olmasa da. Yedek masa tutmadığı için dizilime girmez.
    if (otoYerlesme && !fYedek) await planiUygula(true, fDate);
    // PROGRAMIN VERDİĞİ MASA KİLİTLENMEZ (Gökhan, 2026-08-30: "kilit kalksın, otomatik
    // yerleşime müdahale edilebilsin"). Kilitleniyordu; kilitli satırda masa kutusu
    // tıklanmadığı için program bir masa verdikten sonra o masa değiştirilemiyordu. Kilit
    // artık sadece kullanıcı koyarsa var: elle masa seçilerek ya da satırdaki kilitle.
    // Yerleştiremediyse ve kapasitede bu kişi sayısına yer varsa işletmeye söylenir;
    // kapasite bu gruba yetmiyorsa zaten kapasite uyarısı çıkıyor.
    if (otoYerlesme && yeniKayit && !fYedek && fMasaSecimi.length === 0) {
      const { data: atanan } = await supabase.from("reservation_tables")
        .select("table_id").eq("reservation_id", yeniKayit.id);
      const atananSayisi = ((atanan as { table_id: string }[] | null) ?? []).length;
      if (atananSayisi === 0 && fDate === gun && mevcut + kisi <= toplamKapasite) {
        setUyari({
          baslik: "Masa verilemedi",
          satirlar: [
            `${toTitleTr(fName)} (${kisi} kişi) için uygun masa bulunamadı, rezervasyon masasız kaydedildi.`,
            "Kapasitede yer var — masaları elle düzenleyip bu misafire yer açabilirsin.",
          ],
        });
      }
    }
    if (fDate !== gun) { gunDegistir(fDate); return; }
    await yenile();
  };

  // BEKLEMEYE AL — kapıya gelen misafire o an yer yoksa geri çevrilmiyor, sıraya yazılıyor
  // (Gökhan, 2026-08-18). Bekleyen masa tutmaz, kapasiteye girmez; masa boşalınca sıradan
  // çağrılır. Kayıt kapı girişi olarak açılır, oturduğunda da kapı girişi olarak kalır.
  /** Eğlence günü değilse dilim yazılmaz — o gün mekân normal restoran gibi çalışıyor. */
  const wDilimDegeri = (): Dilim | null =>
    (eglenceAktif && eglenceGunuMu(bugunIstanbul(), eglenceGunleri) ? turuCoz(wDilim).dilim : null);
  /** Kutudan "Ayakta" seçildi mi — kapı girişinde de bistro tutmayan misafir olabiliyor. */
  const wAyaktaSecildi = () =>
    !!wDilimDegeri() && turuCoz(wDilim).ayakta;
  /**
   * Kapı girişi kaydı — varsayılan bekleme sırası. ayaktaAl=true verilirse misafir sıraya
   * değil doğrudan "geldi" olarak yazılır ve AYAKTA işaretlenir: masa/bistro tutmaz
   * (Gökhan, 2026-08-29).
   */
  const beklemeyeAl = async (ayaktaAl = false) => {
    if (!restaurantId || !wName.trim()) return;
    const kisi = Math.max(1, parseInt(wParty, 10) || 1);
    setErr(null);
    setBusy(true);
    const simdi = new Date().toISOString();
    const { data: { session } } = await supabase.auth.getSession();
    let wKartId = wSecKartId;
    const wTel = wPhone.trim();
    if (!wKartId && wTel) {
      const { data: kart } = await supabase.from("kisi_kartlari")
        .upsert({ restaurant_id: restaurantId, phone: wTel }, { onConflict: "restaurant_id,phone", ignoreDuplicates: false })
        .select("id").single();
      wKartId = (kart as { id: string } | null)?.id ?? null;
    }
    const { error } = await supabase.from("reservations").insert({
      restaurant_id: restaurantId,
      guest_name: toTitleTr(wName),
      guest_phone: wTel || null,
      party_size: kisi,
      reserved_at: simdi,
      note: ilkHarfBuyukTr(wNote) || null,
      kisi_karti_id: wKartId,
      source: "kapi",
      status: ayaktaAl ? "geldi" : "bekleniyor",
      dilim: wDilimDegeri(),
      ayakta: ayaktaAl || wAyaktaSecildi(),
      konsept: wKonsept || null,
      ...(ayaktaAl ? { arrived_at: simdi } : {}),
      bekleme: !ayaktaAl,
      bekleme_baslangic: ayaktaAl ? null : simdi,
      created_by: session?.user.id ?? null,
      alan_hesap_id: benimPersonelId,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setWKonsept(""); setWalkInOpen(false);
    await yenile();
  };

  const dogrudanGir = async () => {
    if (!restaurantId || !wName.trim()) return;
    const kisi = Math.max(1, parseInt(wParty, 10) || 1);
    setErr(null);

    // GECE DÜZENİNE GEÇİLMEDEN GECE MİSAFİRİ ALINMAZ (Gökhan, 2026-08-29: "22 olmamasına
    // rağmen geceye kapı girişi aldı — uyarı verecek, almayacak, beklemeye alacak onu ya da
    // ayakta alacak"). Rezervasyon alırken bu kural vardı, kapı girişinde yoktu: o saatte
    // salonda bistro yok, misafir yemek masasına oturuyordu.
    if (wDilimDegeri() === "gece" && !wAyaktaSecildi() && simdiSaat() < eglenceGecis) {
      const secilen = await secim(
        `Gece düzenine ${eglenceGecis}'de geçiliyor, salonda henüz bistro yok. Ne yapalım?`,
        [{ anahtar: "bekleme", etiket: "Beklemeye al" }, { anahtar: "ayakta", etiket: "Ayakta al" }],
      );
      if (!secilen) return;
      await beklemeyeAl(secilen === "ayakta");
      return;
    }
    const simdi = new Date().toISOString();
    // YER YOKSA PROGRAM KENDİ BEKLEMEYE ALIR (Gökhan, 2026-08-18: "beklemeye almayı işletme
    // seçmeyecek, program zaten kayıt yapıldığında masa yoksa beklemeye alacak"). Karşılamaya
    // soru sorulmuyor: misafir sıraya yazılır, masa boşalınca program haber verir.
    // YER KONTROLÜ DİLİME GÖRE (2026-08-29). Eskiden her kapı girişi yemek salonuna
    // bakıyordu: geceye gelen misafir, bistro boş olduğu hâlde yemek salonu doluysa bekleme
    // sırasına yazılıyordu. Artık geceye gelen bistroya, yemeğe gelen masaya, ikisine birden
    // gelen her ikisine bakılıyor.
    const wD = wDilimDegeri();
    const yemekBakilir = wD !== "gece";
    const geceBakilir = (wD === "gece" || wD === "yemek_gece") && !wAyaktaSecildi();
    const yerVar = !yemekBakilir || await masaMusaitMi(bugunIstanbul(), kisi, true);
    const bistroYeter = !geceBakilir
      || bistroGereken(kisi) <= bistroSayisi - geceTalep;
    const kapasiteYeter = !bugunMu || !yemekBakilir || gunPax + kisi <= toplamKapasite;
    if (!yerVar || !kapasiteYeter || !bistroYeter) {
      await beklemeyeAl();
      bildirCapacityNotice(!bistroYeter && yerVar && kapasiteYeter
        ? `Boş bistro yok — ${toTitleTr(wName)} bekleme sırasına alındı.`
        : `Boş masa yok — ${toTitleTr(wName)} bekleme sırasına alındı.`);
      return;
    }

    let mevcut = 0;
    if (bugunMu) mevcut = gunPax;

    setBusy(true);
    // Kapı girişinde de aynı kural: numara zaten bir müşteriye aitse ikinci kayıt açılmaz,
    // giriş o müşterinin kartına bağlanır (Gökhan, 2026-08-13).
    let wKartId = wSecKartId;
    const wTel = wPhone.trim();
    if (!wKartId && wTel) {
      const { data: kart } = await supabase.from("kisi_kartlari")
        .upsert({ restaurant_id: restaurantId, phone: wTel }, { onConflict: "restaurant_id,phone", ignoreDuplicates: false })
        .select("id").single();
      wKartId = (kart as { id: string } | null)?.id ?? null;
    }
    const { data: yeniId, error } = await supabase.rpc("check_in_arrival", {
      p_restaurant: restaurantId, p_guest_name: toTitleTr(wName), p_party_size: kisi,
      p_guest_phone: wTel || null, p_note: ilkHarfBuyukTr(wNote) || null,
      p_kisi_karti_id: wKartId,
    });
    // Dilim kayıt açıldıktan sonra yazılıyor — kapı girişi işlevi onu almıyor, veritabanını
    // değiştirmemek için ayrı bir güncelleme yapılıyor (Gökhan, 2026-08-29).
    if (!error && wD && typeof yeniId === "string") {
      await supabase.from("reservations").update({ dilim: wD, ayakta: wAyaktaSecildi() }).eq("id", yeniId);
    }
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setWKonsept(""); setWalkInOpen(false);
    if (bugunMu && mevcut < toplamKapasite && mevcut + kisi >= toplamKapasite) {
      bildirCapacityNotice(`Kapasite bu misafirle doldu (${toplamKapasite}/${toplamKapasite} pax) — başka misafir alınamaz.`);
    }
    if (gun !== bugunIstanbul()) gunDegistir(bugunIstanbul()); else await yenile();
  };

  // Bir rezervasyona atanmış masaların toplam koltuğu — kişi sayısı büyütülünce masa küçük
  // kalabiliyor (Gökhan: "6 kişiden 8'e çıkardım, seçili masa değişmedi") — bunu yakalar.
  const atananKoltuk = (r: Rez) => (rezMasalar[r.id] ?? []).reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
  // Ek sandalye payı MASA BAŞINA geçerli: iki masa birleştiyse iki sandalye eklenebilir.
  const masaYetersiz = (r: Rez) => {
    const masaAdedi = (rezMasalar[r.id] ?? []).length;
    // MASA HESABINDA "yetersiz" diye bir şey yok (Gökhan, 2026-08-24): sınırı aşan
    // rezervasyonun ikinci masası ayarlardaki kapasiteden geliyor ve salona çizilmiyor.
    // Tek masa görünmesi eksiklik değil, kuralın kendisi.
    if (masaHesabi) return false;
    // LOCADA KİŞİ SINIRI YOK (Gökhan, 2026-08-24: "locanın kişi paxı olmaz, 2 kişide de
    // alabiliyorsun 10 kişide de"). Loca için tutulan koltuk sayısı sadece çizim içindir;
    // onunla karşılaştırınca 15 kişilik loca misafiri "masası yetmiyor" görünüyordu
    // (Gökhan, 2026-08-29: Acun Ilıcalı'ya locayı verdik, geldi dediğimde kapasite uyarısı).
    const locasiVar = (rezMasalar[r.id] ?? []).some((id) => tables.find((t) => t.id === id)?.shape === "loca");
    if (locasiVar) return false;
    return masaAdedi > 0 && atananKoltuk(r) + masaAdedi * ekSandalye < r.party_size;
  };

  // Gelmedi/İptal olunca atanmış masa hâlâ rezerveyse otomatik boşa çıkar.
  const durumDegistir = async (r: Rez, next: string, cancelReason?: string) => {
    // Garson/PR/salon şefi durum değiştiremez — düğmeleri zaten görmüyor, buradaki fren
    // başka bir yoldan (kısayol, eski ekran) gelmeye karşı.
    if (!durumYetkisi) return;
    setErr(null);
    const { error } = await supabase.rpc("set_reservation_status", { p_reservation_id: r.id, p_status: next, p_cancel_reason: cancelReason ?? null });
    if (error) { setErr(error.message); return; }
    await yenile();
    // İptal/gelmedi yer açar — boşalan masa asıl yerine dönsün (Gökhan: "masaların
    // rezervasyonu iptal oldu, masa tekrar yerine geri dönsün"). Bu, otomatik yerleşim
    // kapalıyken de çalışmalı — o anahtar YENİ rezervasyonları otomatik masaya atamayı
    // kapatır, boşalan masanın kendi asıl yerine fiziksel dönüşünü değil.
    if (next === "iptal" || next === "gelmedi") {
      // Otomatik yerleşme kapalıyken program masa dağıtmaz (2026-08-29) — boşalan masayı
      // işletme veriyor. Yedek haberi her hâlükârda verilir, o sadece bilgi.
      if (otoYerlesme) await planiUygula(true);
      await yedekHaberVer();
    }
  };

  // YEDEK — telefonla alınır, saati yoktur, sadece güne yazılır. Misafir mekânda DEĞİL,
  // evindedir (Gökhan, 2026-08-12: "arar, yer yok, boşalırsa haber veririz dersin").
  // Bu yüzden yer açılınca program kimseyi oturtmaz: arada bir telefon görüşmesi var, o da
  // işletmenin işi. Program sadece haber verir; görüşme olumluysa yedek tek dokunuşla
  // rezervasyona çevrilir. Kapıda bekleyen ise yedek değil WALK-IN'dir, o ayrı bir liste.
  const yedekHaberVer = async () => {
    if (!restaurantId) return;
    const { start, end } = gunSiniri(gun);
    // SADECE BOŞALAN YERE SIĞANLAR (Gökhan, 2026-08-29). Liste eskiden sırf sıraya göre
    // çıkıyordu: 2 kişilik masa boşalınca ilk üç yedek 6 kişilikse boşuna onlar aranıyordu.
    // Artık elde kalan boş masalara (geceye gelen için boş bistroya) bakılıp sığanlar
    // gösteriliyor; sıra düzeni korunuyor. Kimi arayacağına yine işletme karar veriyor.
    const [{ data }, { data: doluData }] = await Promise.all([
      supabase.from("reservations")
        .select("guest_name, party_size, dilim")
        .eq("restaurant_id", restaurantId).is("deleted_at", null)
        .eq("yedek", true).eq("status", "bekleniyor")
        .gte("reserved_at", start).lt("reserved_at", end)
        .order("reserved_at", { ascending: true }),
      supabase.from("reservations")
        .select("reservation_tables(table_id)")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
        .in("status", ["bekleniyor", "geldi", "oturdu"])
        .gte("reserved_at", start).lt("reserved_at", end),
    ]);
    const yedekler = (data as { guest_name: string; party_size: number; dilim: string | null }[]) ?? [];
    if (yedekler.length === 0) return;
    const doluIds = new Set(((doluData as { reservation_tables: { table_id: string }[] | null }[]) ?? [])
      .flatMap((x) => (x.reservation_tables ?? []).map((m) => m.table_id)));
    const bosMasalar = yerlesimMasalari.filter((t) => !doluIds.has(t.id)).map((t) => ({
      id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y, alanId: t.area_id,
    }));
    const bosBistro = geceBistrolari.filter((t) => !doluIds.has(t.id)).length;
    const sigar = (y: { party_size: number; dilim: string | null }) => (y.dilim === "gece"
      ? bistroGereken(y.party_size) <= bosBistro
      : bosMasalar.length > 0
        && salonuPlanla(bosMasalar, [{ id: "yedek", kisi: y.party_size }], []).yerlesemeyen.length === 0);
    const sigan = yedekler.filter(sigar);
    if (sigan.length === 0) {
      setUyari({
        baslik: "Yer açıldı",
        satirlar: [
          `Yedekte ${yedekler.length} misafir bekliyor ama boşalan yere sığan yok.`,
          "Daha fazla yer açılırsa program yeniden haber verir.",
        ],
      });
      return;
    }
    setUyari({
      baslik: "Yer açıldı — yedekte bekleyen var",
      satirlar: [
        sigan.slice(0, 3).map((y) => `${y.guest_name} (${y.party_size} kişi)`).join(", ")
          + (sigan.length > 3 ? ` ve ${sigan.length - 3} kişi daha` : "") + ".",
        "Arayıp teklif edebilirsin; gelirse kartından yedek işaretini kaldır, rezervasyona döner.",
      ],
    });
  };

  // Yedek → rezervasyon. Yer açıldı, arandı, olumlu döndü: tek dokunuşla listeye geçer ve
  // masa dağıtımına girer (Gökhan, 2026-08-13). Yer yoksa uyarır ama yine de alır — karar
  // işletmenin; zaten telefonda konuşulmuş oluyor.
  const yedegiRezervasyonaAl = async (r: Rez) => {
    // YER KONTROLÜ (Gökhan, 2026-08-29: "yedeğe aldığın rezervasyonlar limite bakmıyor, masa
    // ya da bistro olmasa da giriyor"). Bu düğme şimdiye kadar hiçbir kontrol yapmıyordu; dolu
    // salonda üst üste basılınca rezervasyonlar masasız kalıyordu. Artık rezervasyon alırken
    // çalışan kontrolün aynısı burada da çalışıyor. Yasak değil: bu düğmeye basıldığında
    // misafirle telefonda konuşulmuş oluyor, son söz işletmenin.
    const rDilim = r.dilim ?? "yemek";
    const eksikler: string[] = [];
    if (rDilim !== "gece" && !(await masaMusaitMi(gun, r.party_size, true))) {
      eksikler.push("Yemek salonunda boş masa yok.");
    }
    if (eglenceAktif && (rDilim === "gece" || rDilim === "yemek_gece")) {
      const gerekenBistro = bistroGereken(r.party_size);
      const bosBistro = Math.max(0, bistroSayisi - geceTalep);
      if (gerekenBistro > bosBistro) {
        eksikler.push(`${r.party_size} kişi için ${gerekenBistro} bistro gerekiyor, ${bosBistro} bistro boş.`);
      }
    }
    if (eksikler.length > 0) {
      const ok = await confirm(`${eksikler.join(" ")} Yine de rezervasyona alınsın mı?`, {
        confirmLabel: "Yine de al", cancelLabel: "Yedekte kalsın", danger: false,
      });
      if (!ok) return;
    }
    setBusy(true); setErr(null);
    // İKİ YARIM TEK REZERVASYONDA BİRLEŞİR (Gökhan, 2026-08-29). Yemekte yer olmadığı için
    // "Geceye al" denmiş misafirin o gün iki kaydı var: biri gece rezervasyonu, biri yemek
    // yedeği. Yedek listeye alınırken öteki yarısı aranıyor; bulunursa dilimi "Yemek + gece"
    // yapılıp yedek kaydı siliniyor — misafir listede tek satır olarak duruyor.
    const otekiYarisi = rows.find((x) => x.id !== r.id && !x.yedek && x.guest_name === r.guest_name
      && (x.guest_phone ?? "") === (r.guest_phone ?? "")
      && ((r.dilim === "yemek" && x.dilim === "gece") || (r.dilim === "gece" && x.dilim === "yemek")));
    if (otekiYarisi) {
      const { error: birlestirHata } = await supabase.from("reservations")
        // Saat de yemek saatine döner: "Yemek + gece" rezervasyonunun saati akşam yemeği
        // saatidir, gece kaydının geçiş saati değil.
        .update({ dilim: "yemek_gece", yedekten: true, reserved_at: r.reserved_at }).eq("id", otekiYarisi.id);
      if (birlestirHata) { setBusy(false); setErr(birlestirHata.message); return; }
      // Yedek kaydı artık gereksiz — silme kuralı gereği deleted_at doldurulup kapatılıyor.
      await supabase.from("reservations").update({ deleted_at: new Date().toISOString() }).eq("id", r.id);
      setBusy(false);
      await yenile();
      await planiUygula(true);
      return;
    }
    const { error } = await supabase.from("reservations").update({ yedek: false, yedekten: true }).eq("id", r.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
    await planiUygula(true);
  };

  const iptalEt = (r: Rez) => { if (!durumYetkisi) return; setIptalReason(""); setIptalFor(r); };
  const iptalOnayla = async () => {
    if (!iptalFor) return;
    // Kutu ÖNCE kapanır. Eskiden iptal işi (yeniden dizilim, yedek uyarısı) bitene kadar açık
    // kalıyordu; işletme "olmadı" sanıp ikinci kez basıyordu (Gökhan, 2026-08-15: "evet diyorum
    // ama kutu orada kalıyor").
    const rez = iptalFor;
    const sebep = iptalReason;
    setIptalFor(null);
    setIptalReason("");
    await durumDegistir(rez, "iptal", sebep);
    // ARAMA UYARISI YOK (Gökhan, 2026-08-18): "operasyon sırasında iptal ediyorsam zaten
    // onlar aramıştır, ben neden arayayım". İptal sessizce işlenir; misafire mesaj da gitmez.
  };

  // Masa ata — sadece bugün için anlamlı: işletme masa planını aynı gün yapar.
  // Masa birleştirme (Gökhan: "on kişi kapasite dolana kadar masa seçecek, birden fazla
  // masa birleştirebilecek") — tek masa da olsa, birleştirilmiş birden fazla masa da olsa
  // aynı yoldan gider.
  const masaAta = async (r: Rez, tableIds: string[]) => {
    if (tableIds.length === 0) return;
    setErr(null);
    // Kilitli masa müşteriye söylenmiştir — sadece yönetici değiştirebilir (Gökhan, 2026-08-24).
    if (r.masa_kilit && !yoneticiyim) { setErr("Bu rezervasyonun masası kilitli — sadece yönetici değiştirebilir."); return; }

    // LOCA KURALLARI (Gökhan, 2026-08-20: "her gece kulübünde loca var ve kuralları var").
    // Kurallar masa verilirken işliyor: loca ancak o an belli oluyor.
    //
    // Loca ÖNCE MASANIN ŞEKLİ: Salon ekranında masa eklenirken seçiliyor (Gökhan, 2026-08-24).
    // Masa gruplarındaki "Loca" işareti de geçerli sayılmaya devam ediyor — o kutucuk 20
    // Ağustos'ta kurulmuştu, işaretlemiş işletmenin kuralları kaybolmasın.
    const verilenLocalar = tableIds
      .map((id) => tables.find((t) => t.id === id))
      .filter((t): t is TableRow => !!t && (t.shape === "loca" || (!!t.grup_id && locaGrupIds.has(t.grup_id))));
    if (verilenLocalar.length > 0) {
      // 1) Kim satabilir. İşletme sahibinde rol boş gelir, o her zaman yetkili.
      const rolSirasi: Record<string, number> = { yonetici: 3, pr: 2, karsilama: 1, herkes: 0 };
      const benimRol = rolum === null ? "yonetici" : rolum;
      const yeter = locaSatisYetkisi === "herkes"
        || (locaSatisYetkisi === "karsilama" && ["karsilama", "yonetici"].includes(benimRol))
        || (locaSatisYetkisi === "pr" && ["pr", "yonetici"].includes(benimRol))
        || (locaSatisYetkisi === "yonetici" && benimRol === "yonetici");
      if (!yeter) {
        const kimler = locaSatisYetkisi === "yonetici" ? "yönetici"
          : locaSatisYetkisi === "pr" ? "PR ve yönetici" : "karşılama ve yönetici";
        setErr(`Loca satma yetkin yok — bu işletmede locayı ${kimler} satabiliyor.`);
        return;
      }
      // 2) Kapıdan gelene loca kapalıysa verilmez.
      if (!locaWalkinAcik && r.source === "kapi") {
        setErr("Kapıdan gelen misafire loca verilemiyor — ayarlarda kapalı.");
        return;
      }
      // 3) Paketsiz loca satılamıyorsa uyar.
      if (locaPaketZorunlu && !r.masa_paketi_id) {
        setErr("Loca paketsiz verilemiyor — önce rezervasyona paket seç.");
        return;
      }
      // 4) KİŞİ LİMİTİ (Gökhan, 2026-08-30: "locaya limit girilirse üstü alınmasın... uyarsın,
      // yine de al butonu da olsun"). Ayarda sayı yoksa sınır da yok. İki loca veriliyorsa
      // sınır iki katı sayılır. Yasak değil — son söz işletmenin.
      if (locaKisi) {
        const sinir = locaKisi * verilenLocalar.length;
        if (r.party_size > sinir) {
          const ok = await confirm(
            `Loca ${sinir} kişilik, ${r.party_size} kişi giriyor.`,
            { confirmLabel: "Yine de al", cancelLabel: "Vazgeç", danger: false },
          );
          if (!ok) return;
        }
      }
      // 5) Kapora. Zorunluysa alınmadan masa verilmiyor; zorunlu değilse soruluyor, alındıysa
      // rezervasyona işleniyor.
      if (locaKaporaAcik && !r.kapora_alindi) {
        const tutarYazi = locaKaporaTutar ? ` (${locaKaporaTutar.toLocaleString("tr-TR")} ₺)` : "";
        const alindi = await confirm(
          `Loca kaporası${tutarYazi} alındı mı?`,
          { confirmLabel: "Alındı" },
        );
        if (!alindi && locaKaporaZorunlu) {
          setErr("Bu işletmede loca kaporasız verilemiyor.");
          return;
        }
        if (alindi) {
          await supabase.from("reservations")
            .update({ kapora_alindi: true, kapora_tutar: locaKaporaTutar })
            .eq("id", r.id);
        }
      }
    }
    // NOTTA BAŞKA SALON YAZIYORSA UYAR (Gökhan, 2026-08-14: "notunda teras isteniyor diyen
    // rezervasyona bahçeden masa verdim, buna engel olabilir miyiz"). Yasak değil — son söz
    // işletmenin; ama yanlışlıkla olmasın diye soruyor.
    const istenen = istenenSalon(r, salonlar);
    if (istenen) {
      const disarda = tableIds.filter((id) => tables.find((t) => t.id === id)?.area_id !== istenen);
      if (disarda.length > 0) {
        const salonAdi = salonlar.find((sa) => sa.id === istenen)?.name ?? "o salon";
        const secilenAdlari = disarda.map((id) => tables.find((t) => t.id === id)?.name).filter(Boolean).join(", ");
        const nereden = r.tercih_alan_id === istenen ? "Misafir online" : "Notunda";
        const devam = await confirm(
          `${nereden} ${salonAdi} ${r.tercih_alan_id === istenen ? "seçmiş" : "yazıyor"} ama ${secilenAdlari} başka salonda. Yine de bu masalar verilsin mi?`,
          { danger: false },
        );
        if (!devam) return;
      }
    }
    const { error } = await supabase.rpc("assign_reservation_tables", { p_reservation_id: r.id, p_table_ids: tableIds });
    setAssigningId(null);
    setMasaSecimi([]);
    if (error) { setErr(error.message); return; }
    await yenile();
    // Masaları ELLE seçtiğinde de salon düzeni toparlanır: aynı rezervasyonun masaları yan yana
    // gelir (Gökhan, 2026-08-13: "manuel masa yerleşimi yaptım, sistem masaları rezerve etti
    // ama birleştirmedi"). Yeni atama yapılmaz, sadece düzen tazelenir — otomatik yerleşim
    // kapalıyken de çalışması gereken şey bu.
    await planiUygula(true, gun, false, true);
  };

  // Masayı geri bırak — rezervasyon masasız kalır, masalar havuza döner (Gökhan: "masa seçte
  // boş seçeneği yok, onu koy"). Misafir oturmuşsa masa 'occupied'dır, ona dokunulmaz.
  const masaBosalt = async (r: Rez) => {
    setErr(null);
    if (r.masa_kilit && !yoneticiyim) { setErr("Bu rezervasyonun masası kilitli — sadece yönetici bırakabilir."); return; }
    const ids = rezMasalar[r.id] ?? [];
    if (ids.length > 0) {
      await supabase.from("restaurant_tables").update({ status: "empty", reservation_note: null }).in("id", ids).eq("status", "reserved");
      await supabase.from("reservation_tables").delete().eq("reservation_id", r.id);
    }
    const { error } = await supabase.from("reservations").update({ table_id: null }).eq("id", r.id);
    setAssigningId(null); setMasaSecimi([]); setMasaAtaKonum(null);
    if (error) { setErr(error.message); return; }
    await yenile();
    // Masa bırakılınca da düzen toparlanır — boşalan masa yerine döner.
    await planiUygula(true, gun, false, true);
  };

  // Oturtma artık hesap açmıyor — sadece masayı dolu işaretliyor (seat_reservation). Birden
  // fazla masa seçildiyse (Gökhan: "4 kişilik rezervasyonu 2 kişilik masaya oturttu" — tek
  // masa kişi sayısını karşılamıyordu ama program yine de izin vermişti) önce hepsi birleşik
  // atanır (assign_reservation_tables), sonra oturma tek çağrıyla onaylanır — seat_reservation
  // reservation_tables'taki TÜM masaları 'occupied' yapıyor, sadece verilen tekini değil.
  const oturt = async (tableIds: string[]) => {
    if (!seatingFor || tableIds.length === 0) return;
    // Kadın + erkek kişi sayısını tutmadan oturtma da kapanmaz — Geldi penceresindeki kural.
    if (gelenTutmuyor()) return;
    setBusy(true); setErr(null);
    if (tableIds.length > 1) {
      const { error: birlestirHata } = await supabase.rpc("assign_reservation_tables", { p_reservation_id: seatingFor.id, p_table_ids: tableIds });
      if (birlestirHata) { setBusy(false); setErr(birlestirHata.message); return; }
    }
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: seatingFor.id, p_table_id: tableIds[0] });
    if (error) { setBusy(false); setErr(error.message); return; }
    // KAPIDA GİRİLEN GELEN BİLGİSİ. Kişi sayısı rezervasyondakinden farklıysa kaydedilir;
    // aynıysa yazılmaz, boş kalması "kapıda ayrıca girilmedi" demek (Gökhan, 2026-08-12).
    // Kadın/erkek ise girildiyse her zaman yazılır — rezervasyondaki dağılıma bakılmıyor,
    // o söylenen, bu gerçekleşen (Gökhan, 2026-08-24).
    const gelen = parseInt(gelenKisi, 10);
    const gKadin = gelenKadin.trim() ? parseInt(gelenKadin, 10) : null;
    const gErkek = gelenErkek.trim() ? parseInt(gelenErkek, 10) : null;
    const gelenGuncelle: Record<string, number | null> = {};
    // Gelen sayı rezervasyona da işlenir — Geldi penceresindeki kuralın aynısı.
    if (Number.isFinite(gelen) && gelen > 0 && gelen !== seatingFor.party_size) {
      gelenGuncelle.gelen_kisi = gelen;
      gelenGuncelle.party_size = gelen;
    }
    if (gKadin !== null || gErkek !== null) {
      gelenGuncelle.gelen_kadin = gKadin; gelenGuncelle.gelen_erkek = gErkek;
      gelenGuncelle.kadin_sayisi = gKadin; gelenGuncelle.erkek_sayisi = gErkek;
    }
    if (Object.keys(gelenGuncelle).length > 0) {
      await supabase.from("reservations").update(gelenGuncelle).eq("id", seatingFor.id);
    }
    // Sıradan gelen misafirse bekleme kapanır, beklediği süre kayda geçer (Gökhan, 2026-08-18).
    if (beklemeBiten && beklemeBiten.id === seatingFor.id) {
      await supabase.from("reservations")
        .update({ bekleme: false, bekleme_dakika: beklemeBiten.dakika })
        .eq("id", seatingFor.id);
      setBeklemeBiten(null);
    }
    setBusy(false);
    setSeatingFor(null); setMasaSecimi([]);
    await yenile();
  };
  // Oturtma penceresi açılırken gelen kişi sayısı rezervasyondaki sayıyla dolu gelir.
  // Kadın/erkek BOŞ gelir: rezervasyonda söylenen dağılım kopyalanmıyor, kapıda gerçekten
  // ne geldiyse o giriliyor (Gökhan, 2026-08-24: "paxta yazan rezervasyonda söylenen, gelen
  // sütununda yazan realde gelen").
  const [gelenKisi, setGelenKisi] = useState("");
  const [gelenKadin, setGelenKadin] = useState("");
  const [gelenErkek, setGelenErkek] = useState("");
  // KUTULAR KAYITLI BİLGİYLE AÇILIR (Gökhan, 2026-08-29: "açılan kutularda kayıtlı bilgi olsun,
  // değişiklik olursa değiştirilsin"). Kişi sayısı zaten rezervasyondan geliyordu; kadın/erkek
  // boş açılıyor, rezervasyonda yazılı olsa bile her seferinde yeniden yazılıyordu.
  // Sıra: kapıda girilmiş değer varsa o, yoksa rezervasyondaki, o da yoksa boş.
  const gelenAlanlariKur = (r: Rez) => {
    const deger = (gelen: number | null, kayitli: number | null) => {
      const v = gelen ?? kayitli;
      return v === null || v === undefined ? "" : String(v);
    };
    setGelenKisi(String(r.gelen_kisi ?? r.party_size));
    setGelenKadin(deger(r.gelen_kadin, r.kadin_sayisi));
    setGelenErkek(deger(r.gelen_erkek, r.erkek_sayisi));
  };
  // GELDİ PENCERESİ (Gökhan, 2026-08-28: "geldi dediğimizde kaç kişi, kaç kadın, kaç erkek
  // geldi girilen ekran açılsın, sonra pencereden onaylansın, geldi olarak işlesin").
  // Eskiden "Geldi" doğrudan oturtma penceresini açıyordu; masası zaten belli olan misafirde
  // ona masa sormak gereksizdi. Masa sorusu "Oturdu" adımında kaldı.
  const [gelenFor, setGelenFor] = useState<Rez | null>(null);
  const gelenBaslat = (r: Rez) => {
    if (!durumYetkisi) return;
    gelenAlanlariKur(r);
    setGelenFor(r);
  };
  /**
   * Kadın + erkek, kişi sayısını tutmalı (Gökhan, 2026-08-29: "kadın erkek sayısını düzelttim
   * ama rezervasyon sayısını düzeltmedim, tamam dedim kapandı; iki sayı birbirini tutmadan
   * kapanmasın"). Kadın/erkek girmek zorunlu değil — ikisi de boşsa kontrol yok; biri bile
   * doluysa toplam kişi sayısına eşit olmalı. Aynı kutular oturtma penceresinde de var.
   */
  const gelenTutmuyor = (): string | null => {
    const k = gelenKadin.trim(), e = gelenErkek.trim();
    if (!k && !e) return null;
    const kisi = parseInt(gelenKisi, 10) || 0;
    const toplam = (parseInt(k, 10) || 0) + (parseInt(e, 10) || 0);
    return toplam === kisi ? null : `Kadın ve erkek toplamı ${toplam}, kişi sayısı ${kisi} — ikisi aynı olmalı.`;
  };
  const gelenOnayla = async () => {
    const r = gelenFor;
    if (!r) return;
    if (gelenTutmuyor()) return;
    const gelen = parseInt(gelenKisi, 10);
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("set_reservation_status", { p_reservation_id: r.id, p_status: "geldi", p_cancel_reason: null });
    if (error) { setBusy(false); setErr(error.message); return; }
    // GELEN SAYI REZERVASYONA DA İŞLENİR (Gökhan, 2026-08-29: "rezervasyonun kişi sayısı da
    // 5'e çekilsin, kapasite ve masa hesabı gerçeğe uysun"). Eskiden sadece "gelen" alanına
    // yazılıyordu; rezervasyon 4 kişilik kalıyor, kapasite ve masa hesabı gerçeği görmüyordu.
    // Kadın/erkek de birlikte güncelleniyor, yoksa kişi sayısıyla dağılım birbirini tutmuyor.
    const yeniKisi = Number.isFinite(gelen) && gelen > 0 ? gelen : r.party_size;
    const yeniKadin = gelenKadin.trim() ? parseInt(gelenKadin, 10) : null;
    const yeniErkek = gelenErkek.trim() ? parseInt(gelenErkek, 10) : null;
    await supabase.from("reservations").update({
      gelen_kisi: yeniKisi,
      gelen_kadin: yeniKadin,
      gelen_erkek: yeniErkek,
      party_size: yeniKisi,
      ...(yeniKadin !== null || yeniErkek !== null ? { kadin_sayisi: yeniKadin, erkek_sayisi: yeniErkek } : {}),
    }).eq("id", r.id);
    setBusy(false);
    setGelenFor(null);
    await yenile();
    // Masası artık yetmiyorsa söylenir — yasak değil, işletme ek sandalye koyar ya da masa
    // değiştirir; ama bilmeden kalmasın.
    if (masaYetersiz({ ...r, party_size: yeniKisi })) {
      setUyari({
        baslik: "Masa yetmiyor",
        satirlar: [
          `${r.guest_name} ${yeniKisi} kişi geldi ama masası bu kadar kişiyi almıyor.`,
          "Masayı değiştirebilir ya da yanına masa ekleyebilirsin.",
        ],
      });
    }
  };

  // BİSTROYA GEÇ (Gökhan, 2026-08-28). Yemek + gece olan misafir gerçekten bistro masasına
  // geçtiğinde basılır — saate göre kendiliğinden değişmiyor, olan şey işaretleniyor.
  // Yemek masası boşalır, misafirin masası bistro olur. Bistro masası daha önce verilmemişse
  // masa seçme penceresi açılır (orada zaten dilime göre sadece gece masaları çıkıyor).
  /**
   * AYAKTAKİNİ BİSTROYA AL (Gökhan, 2026-08-29: "ayaktakileri bistro boşalınca isterlerse
   * oraya alınsın"). Program kendiliğinden almıyor — misafire sormak gerekiyor, düğme
   * işletmede. Ayakta işareti kalkıyor, yerleşim de ona bistro veriyor.
   */
  const ayaktayiBistroyaAl = async (r: Rez) => {
    if (!durumYetkisi) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("reservations").update({ ayakta: false }).eq("id", r.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
    await planiUygula(true);
  };

  /**
   * YEMEK + AYAKTA MİSAFİRİ GECEYE GEÇERKEN MASASINI BIRAKIR (Gökhan, 2026-08-30: "bıraksın").
   * Bistrosu yok, ayakta duracak; yemek masası boşa tutulmasın, başkasına açılsın. Dilimi
   * "Gece" oluyor: yemek tarafı onu artık ne sayar ne de masa verir, gece tarafında ayakta
   * işareti duruyor.
   */
  const ayaktayaGec = async (r: Rez) => {
    if (!durumYetkisi) return;
    const ids = rezMasalar[r.id] ?? [];
    setBusy(true); setErr(null);
    if (ids.length > 0) {
      await supabase.from("restaurant_tables").update({ status: "empty", reservation_note: null }).in("id", ids).eq("status", "reserved");
      await supabase.from("reservation_tables").delete().eq("reservation_id", r.id);
    }
    const { error } = await supabase.from("reservations").update({ dilim: "gece", table_id: null }).eq("id", r.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
    if (otoYerlesme) await planiUygula(true);
  };

  /** Yemek masasını bırakıp ayakta devam edecek misafir — düğme ona çıkar. */
  const ayaktayaGecer = (r: Rez) => {
    if (!eglenceAktif || !r.ayakta || r.dilim !== "yemek_gece") return false;
    if (r.status !== "geldi" && r.status !== "oturdu") return false;
    return (rezMasalar[r.id] ?? []).some((id) => !geceMasaIds.has(id));
  };

  const bistroyaGec = async (r: Rez) => {
    if (!durumYetkisi) return;
    const masalari = rezMasalar[r.id] ?? (r.table_id ? [r.table_id] : []);
    const bistrolar = masalari.filter((id) => geceMasaIds.has(id));
    if (bistrolar.length === 0) {
      // Bistro masası yok — seçtiriyoruz.
      setMasaSecimi([]); setAssigningId(r.id);
      return;
    }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("assign_reservation_tables", { p_reservation_id: r.id, p_table_ids: bistrolar });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  const oturtBaslat = (r: Rez) => {
    if (!durumYetkisi) return;
    setMasaSecimi([]);
    gelenAlanlariKur(r);
    setSeatingFor(r);
  };

  // GELDİ ARTIK SORUYOR (Gökhan, 2026-08-24: "geldi düğmesine basınca program sormasını bi
  // deneyelim"). Masası atanmış olsa bile pencere açılıyor: kaç kişi geldi, kaçı kadın kaçı
  // erkek. Masası hazırsa pencerede o masa seçili duruyor, tek "Oturt" yetiyor.
  const oturtDirekt = async (r: Rez) => {
    if (!durumYetkisi || !r.table_id) return;
    setMasaSecimi(rezMasalar[r.id] ?? [r.table_id]);
    gelenAlanlariKur(r);
    setSeatingFor(r);
  };

  // BEKLEYENİ OTURT — sıradaki misafir masaya geçiyor. Bekleme işareti kalkar, kaç dakika
  // beklediği kayda geçer (Gökhan, 2026-08-18: akşam sonunda kimin ne kadar beklediği
  // görülsün). Kayıt kapı girişi olarak devam eder, ayrı bir kayıt açılmaz.
  const bekleyeniOturt = async (r: Rez) => {
    if (!durumYetkisi) return;
    const dk = r.bekleme_baslangic
      ? Math.max(0, Math.round((Date.now() - new Date(r.bekleme_baslangic).getTime()) / 60000))
      : null;
    // Masası zaten seçilmişse pencere açılmıyor, tek dokunuşla oturuyor (Gökhan, 2026-08-18).
    if (r.table_id && !masaYetersiz(r)) {
      setBusy(true); setErr(null);
      const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: r.id, p_table_id: r.table_id });
      if (error) { setBusy(false); setErr(error.message); return; }
      await supabase.from("reservations").update({ bekleme: false, bekleme_dakika: dk }).eq("id", r.id);
      setBusy(false);
      await yenile();
      return;
    }
    setBeklemeBiten({ id: r.id, dakika: dk });
    setMasaSecimi([]);
    gelenAlanlariKur(r);
    setSeatingFor(r);
  };

  // BEKLEYENE ÖNERİLEN MASA (Gökhan, 2026-08-18: "iki kişilik bir masa boşalırsa iki kişilik
  // bekleyenlerin ikisinde de görünsün, hostes hangisi uygunsa ona oturt desin"). Boş masa,
  // ona sığan bütün bekleyen satırlarında aynı anda görünüyor; ilk oturtulan masayı alır,
  // masa boş olmaktan çıktığı an diğer satırlardan kendiliğinden düşer. Sığan en küçük masa
  // öneriliyor ki büyük masa büyük gruba kalsın.
  const oneriMasa = (kisi: number, dilim: string | null = null): TableRow | null =>
    [...oturtBosMasalar(dilim)].filter((t) => t.seat_count >= kisi).sort((a, b) => a.seat_count - b.seat_count)[0] ?? null;

  // BOŞALAN MASAYA DOĞRUDAN OTURT (Gökhan, 2026-08-18). Masa boşalınca çıkan kutuda
  // karşılama sadece kimin geçeceğini söylüyor; masayı program veriyor, ayrıca masa seçmek
  // gerekmiyor. Boşalan birden fazla masaysa misafire yeteni verilir: tek masa yetiyorsa
  // en küçüğü, yetmiyorsa gereken kadarı birleştirilir.
  const bekleyeniBosalanMasayaOturt = async (r: Rez, masaIds: string[]) => {
    if (!durumYetkisi || masaIds.length === 0) return;
    const adaylar = masaIds
      .map((id) => tables.find((t) => t.id === id))
      .filter(Boolean)
      .sort((a, b) => a!.seat_count - b!.seat_count) as TableRow[];
    const tekBasina = adaylar.find((m) => m.seat_count >= r.party_size);
    const secilen: TableRow[] = [];
    if (tekBasina) {
      secilen.push(tekBasina);
    } else {
      // Büyükten başlayarak topla — en az masayla oturtmak için.
      for (const m of [...adaylar].reverse()) {
        secilen.push(m);
        if (secilen.reduce((t, x) => t + x.seat_count, 0) >= r.party_size) break;
      }
    }
    if (secilen.length === 0) return;
    const dk = r.bekleme_baslangic
      ? Math.max(0, Math.round((Date.now() - new Date(r.bekleme_baslangic).getTime()) / 60000))
      : null;
    setBusy(true); setErr(null);
    if (secilen.length > 1) {
      const { error: birlestirHata } = await supabase.rpc("assign_reservation_tables", {
        p_reservation_id: r.id, p_table_ids: secilen.map((m) => m.id),
      });
      if (birlestirHata) { setBusy(false); setErr(birlestirHata.message); return; }
    }
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: r.id, p_table_id: secilen[0].id });
    if (error) { setBusy(false); setErr(error.message); return; }
    await supabase.from("reservations").update({ bekleme: false, bekleme_dakika: dk }).eq("id", r.id);
    setBusy(false);
    setBosalanMasa(null);
    await yenile();
  };

  // Bekleyen vazgeçip gitti — sırada yer kaplamasın, kayıt "gelmedi" olarak kapanır.
  const bekleyenVazgecti = async (r: Rez) => {
    if (!durumYetkisi) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("reservations")
      .update({ bekleme: false, status: "gelmedi" }).eq("id", r.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // ─── MESAJLAR (Gökhan, 2026-08-18) ────────────────────────────────────────
  // WhatsApp bağlantısı işletme programı kullanmaya başlarken takılıyor. O güne kadar
  // mesajlar burada hazırlanıp KUYRUĞA yazılıyor; bağlantı gelince kuyruk gönderilecek.
  // Böylece bağlantıyı beklemeden akış çalışır ve hiçbir mesaj kaybolmaz.
  const mesajMetni = (kalip: string | null, r: Rez, varsayilan: string) => {
    const ham = (kalip ?? "").trim() || varsayilan;
    const t = new Date(r.reserved_at);
    return ham
      .replace(/\{isim\}/g, r.guest_name)
      .replace(/\{kisi\}/g, String(r.party_size))
      .replace(/\{saat\}/g, saat(r.reserved_at))
      .replace(/\{tarih\}/g, new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long" }).format(t))
      .replace(/\{isletme\}/g, restaurantName || "");
  };

  // Sessiz saat: bu aralığa denk gelen mesaj bekletilir, aralık bitince gönderilir.
  // Gece yarısını aşan aralık da doğru çalışır (23:00–09:00 gibi).
  const gonderimZamani = (): string => {
    if (!mesajAyar) return new Date().toISOString();
    const simdi = new Date();
    const dk = (hhmm: string) => { const [a, b] = hhmm.split(":").map(Number); return a * 60 + b; };
    const su = simdi.getHours() * 60 + simdi.getMinutes();
    const bas = dk(mesajAyar.sessizBas), bit = dk(mesajAyar.sessizBitis);
    const sessizde = bas < bit ? (su >= bas && su < bit) : (su >= bas || su < bit);
    if (!sessizde) return simdi.toISOString();
    const hedef = new Date(simdi);
    const [sa, sd] = mesajAyar.sessizBitis.split(":").map(Number);
    hedef.setHours(sa, sd, 0, 0);
    if (hedef <= simdi) hedef.setDate(hedef.getDate() + 1);
    return hedef.toISOString();
  };

  const mesajKuyrugaYaz = async (r: Rez, tur: "onay" | "teyit" | "ret", metin: string, hemen: boolean) => {
    if (!restaurantId || !r.guest_phone) return;
    await supabase.from("mesajlar").insert({
      restaurant_id: restaurantId,
      reservation_id: r.id,
      tur,
      telefon: r.guest_phone,
      metin,
      planlanan_zaman: hemen ? new Date().toISOString() : gonderimZamani(),
    });
  };

  // ————————————————————————————————————————————————————————————————
  // ONLINE BAŞVURULAR (Gökhan, 2026-08-30). Linkten gelen artık rezervasyon değil başvuru:
  // program kabul etmiyor, işletme masasını verip onaylıyor. Onaylanınca normal listeye
  // düşüyor ve onay mesajı gidiyor; reddedilince kayıt "reddedildi" olarak burada kalıyor ve
  // "rezervasyonlarımız dolu" mesajı gidiyor.
  // ————————————————————————————————————————————————————————————————
  const [onlinePanel, setOnlinePanel] = useState(false);
  const bekleyenBasvurular = basvurular.filter((r) => r.onay_durumu === "bekliyor");

  const basvuruOnayla = async (r: Rez) => {
    if (!durumYetkisi) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("reservations").update({ onay_durumu: "onaylandi" }).eq("id", r.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (mesajAyar?.acik && mesajAyar.onayAcik) {
      await mesajKuyrugaYaz(r, "onay", mesajMetni(mesajAyar.onayMetni, r, "Sayın {isim}, {tarih} {saat} için {kisi} kişilik rezervasyonunuz onaylandı."), true);
    }
    await yenile();
    // Masası elle seçilmediyse ve otomatik yerleşme açıksa program verir.
    if (otoYerlesme) await planiUygula(true);
  };

  const basvuruReddet = async (r: Rez) => {
    if (!durumYetkisi) return;
    const ok = await confirm(`${r.guest_name} başvurusu reddedilsin mi? Misafire olumsuz mesaj gidecek.`);
    if (!ok) return;
    setBusy(true); setErr(null);
    // Masası seçilmişse bırakılıyor — reddedilen kayıt masa tutmaz.
    const masalari = rezMasalar[r.id] ?? [];
    if (masalari.length > 0) {
      await supabase.from("restaurant_tables").update({ status: "empty", reservation_note: null }).in("id", masalari).eq("status", "reserved");
      await supabase.from("reservation_tables").delete().eq("reservation_id", r.id);
    }
    const { error } = await supabase.from("reservations").update({ onay_durumu: "reddedildi", table_id: null }).eq("id", r.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (mesajAyar?.acik) {
      await mesajKuyrugaYaz(r, "ret", mesajMetni(mesajAyar.retMetni, r, "Sayın {isim}, {tarih} {saat} için rezervasyonlarımız dolu. Başvurunuz için teşekkür ederiz."), true);
    }
    await yenile();
  };

  // GÜNLÜK TEYİT TURU — teyit saati gelince o günün bütün rezervasyonlarına tek seferde
  // gider (Gökhan: "teyit saati geldiğinde olan rezervasyonların hepsine gider"). O saatten
  // sonra alınanlar teyitli sayılır, onlara mesaj gitmez.
  const teyitTuruCalistir = useCallback(async () => {
    if (!restaurantId || !mesajAyar?.acik || !mesajAyar.teyitAcik) return;
    if (gun !== bugunIstanbul()) return;
    const simdi = new Date();
    const [ts, td] = mesajAyar.teyitSaat.split(":").map(Number);
    const teyitAn = new Date(simdi); teyitAn.setHours(ts, td, 0, 0);
    if (simdi < teyitAn) return;
    const bekleyenler = rows.filter((r) => !r.bekleme && !r.yedek && r.status === "bekleniyor" && r.teyit_durumu === "yok");
    if (bekleyenler.length === 0) return;
    for (const r of bekleyenler) {
      // Teyit saatinden SONRA alınan rezervasyon teyitli sayılır, mesaj gitmez.
      const sonradanMi = new Date(r.created_at) >= teyitAn;
      if (sonradanMi || !r.guest_phone) {
        await supabase.from("reservations").update({ teyit_durumu: "sayildi", teyit_zamani: new Date().toISOString() }).eq("id", r.id);
        continue;
      }
      await mesajKuyrugaYaz(r, "teyit", mesajMetni(mesajAyar.teyitMetni, r, "Sayın {isim}, bu akşam {saat} için {kisi} kişilik rezervasyonunuz var. Geliyor musunuz?"), false);
      await supabase.from("reservations").update({ teyit_durumu: "bekliyor", teyit_zamani: new Date().toISOString() }).eq("id", r.id);
    }
    await yenile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, mesajAyar, gun, rows]);

  // Teyit saati gelince kendiliğinden çalışır; ekran açık kaldıkça dakikada bir bakar.
  useEffect(() => {
    teyitTuruCalistir();
    const id = setInterval(() => { teyitTuruCalistir(); }, 60000);
    return () => clearInterval(id);
  }, [teyitTuruCalistir]);

  // Ziyaret tamamlandı — masa boşalır, akış kapanır. Bu programın son adımı.
  const tamamlandi = async (r: Rez) => {
    if (!durumYetkisi) return;
    // Hangi masa(lar) boşalıyor — kutuda "şu masa boşaldı" diyebilmek için önceden alınıyor.
    const bosalan = (rezMasalar[r.id] ?? (r.table_id ? [r.table_id] : []))
      .map((id) => tables.find((t) => t.id === id))
      .filter(Boolean) as TableRow[];
    setBusy(true); setErr(null);
    // ZİYARETİ KAPATMA İKİ YOLDAN (Gökhan, 2026-08-29: "tamam dedim, oturan bir masa
    // bulunamadı dedi"). end_reservation_visit yalnız "oturdu" durumundaki kaydı kapatıyor;
    // "geldi" durumundaki misafirde hata veriyor ve hiçbir şey olmuyordu. Oturmuşsa eski yol,
    // sadece gelmişse durum değiştirme işlevi kullanılıyor — o da masaları aynı şekilde
    // boşaltıyor.
    const { error } = r.status === "oturdu"
      ? await supabase.rpc("end_reservation_visit", { p_reservation_id: r.id })
      : await supabase.rpc("set_reservation_status", { p_reservation_id: r.id, p_status: "tamamlandi", p_cancel_reason: null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
    // MASA BOŞALDI, DİZİLİM TAZELENSİN (2026-08-29). İptal ve gelmedi yer açtığında yerleşim
    // yeniden çalışıyordu; misafir kalkınca çalışmıyordu, boşalan masa masasız bekleyen
    // rezervasyona gitmiyordu. Otomatik yerleşme kapalıysa karışılmıyor — orada masayı
    // işletme veriyor.
    if (otoYerlesme) await planiUygula(true);
    // BEKLEYEN VARSA HABER VER (Gökhan, 2026-08-18). Kutu sadece boşalan masaya sığan
    // bekleyenler varsa çıkıyor; kimse sığmıyorsa hiç görünmüyor.
    // BOŞALAN BİSTRO KAPI SIRASINA ÖNERİLMEZ (2026-08-29). Kalkan gece misafirinin bistrosu
    // da bu listeye giriyordu; kapıda yemeğe bekleyen misafire bistro teklif ediliyordu.
    // Geceye bekleyen misafirin bistrosu satırdaki kendi önerisinden geliyor.
    const bosalanYemek = bosalan.filter((m) => !geceMasaIds.has(m.id));
    const koltuk = bosalanYemek.reduce((t, m) => t + m.seat_count, 0);
    const sigan = bekleyenRows.filter((b) => b.id !== r.id && b.dilim !== "gece" && b.party_size <= koltuk);
    if (bosalanYemek.length > 0 && sigan.length > 0) {
      setBosalanMasa({ ad: bosalanYemek.map((m) => m.name).join(" + "), koltuk, masaIds: bosalanYemek.map((m) => m.id) });
    }
  };

  /**
   * ALINMIŞ REZERVASYONUN DİLİMİNİ DEĞİŞTİR (Gökhan, 2026-08-27) — misafir sonradan
   * "geceye de kalacağım" diyebiliyor. Geceye geçerken bistro kapasitesi kontrol ediliyor;
   * bistro doluysa ayakta soruluyor. Geceden çıkarken masası bistrodaysa masa da bırakılıyor,
   * yoksa bistro boş yere tutulu kalır.
   */
  const dilimDegistir = async (r: Rez, secim: TurSecimi) => {
    setDilimFor(null);
    // Kutuda "Ayakta" ve "Yemek + ayakta" da var (Gökhan, 2026-08-29); ikisi de dilim değil,
    // dilim + ayakta işareti demek. Burada çözülüp öyle kaydediliyor.
    const { dilim: yeni, ayakta: ayaktaSecildi } = turuCoz(secim);
    if ((r.dilim ?? "yemek") === yeni && !!r.ayakta === ayaktaSecildi) return;
    setErr(null);
    // Ayakta seçildiyse bistro aranmaz — misafir zaten masa istemiyor.
    const geceyeGiriyor = (yeni === "gece" || yeni === "yemek_gece") && !ayaktaSecildi
      && r.dilim !== "gece" && r.dilim !== "yemek_gece";
    let ayakta = ayaktaSecildi;
    if (geceyeGiriyor) {
      // Gece ADET sayar, kişi değil (2026-08-29) — rezervasyon alırken konan kuralın aynısı.
      const gerekenBistro = bistroGereken(r.party_size);
      const bosBistro = Math.max(0, bistroSayisi - geceTalep);
      if (gerekenBistro > bosBistro) {
        const ayaktaKalan = ayaktaKapasite - ayaktaPax;
        if (ayaktaKalan >= r.party_size) {
          const ok = await confirm(
            `${r.party_size} kişi için ${gerekenBistro} bistro gerekiyor, ${bosBistro} bistro boş. ${r.guest_name} ayakta alınsın mı? (ayakta ${ayaktaKalan} kişilik yer var)`,
            { confirmLabel: "Ayakta al" },
          );
          if (!ok) return;
          ayakta = true;
        } else {
          setUyari({
            baslik: "Gece kapasitesi dolu",
            satirlar: [
              bistroSayisi > 0
                ? `${bistroSayisi} bistronun ${geceTalep} tanesi istenmiş, ${bosBistro} tanesi boş. ${r.party_size} kişi için ${gerekenBistro} bistro gerekiyor.`
                : "Gece salonu kurulmamış.",
              ayaktaKapasite > 0 ? `Ayakta kapasitesi de dolu (${ayaktaKapasite} kişinin ${ayaktaPax}'i tutulmuş).` : "Ayakta kapasite tanımlı değil.",
              `${r.guest_name} geceye alınamıyor.`,
            ],
          });
          return;
        }
      }
    }
    if (yeni === "yemek") ayakta = false;
    // Gece tarafında masası olmayacak misafirin bistrosu bırakılıyor: yemeğe dönen de,
    // ayaktaya geçen de bistro tutmaz.
    if (yeni === "yemek" || ayakta) {
      const bistrolari = (rezMasalar[r.id] ?? []).filter((id) => geceMasaIds.has(id));
      if (bistrolari.length > 0) {
        const kalan = (rezMasalar[r.id] ?? []).filter((id) => !geceMasaIds.has(id));
        await supabase.rpc("assign_reservation_tables", { p_reservation_id: r.id, p_table_ids: kalan });
        await supabase.from("restaurant_tables").update({ status: "empty", reservation_note: null }).in("id", bistrolari).eq("status", "reserved");
      }
    }
    const { error } = await supabase.from("reservations").update({ dilim: yeni, ayakta }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await yenile();
    // Dilim değişince misafirin ihtiyacı da değişti: geceye giren bistro, yemeğe dönen masa
    // bekliyor. Yerleşim yeniden çalışıyor (2026-08-29) — eskiden kimse dağıtmıyordu.
    if (otoYerlesme && !ayakta) await planiUygula(true);
  };

  const updateField = async (r: Rez, patch: Partial<Pick<Rez, "guest_name" | "guest_phone" | "party_size" | "note" | "reserved_at">>) => {
    setErr(null);
    const tam: Record<string, unknown> = { ...patch };
    // NUMARA DEĞİŞİRSE KART DA DEĞİŞİR (Gökhan, 2026-08-15: "numara değişirse yeni kart
    // açılsın"). Misafir masasının ismini düzeltmek kartı değiştirmez — numara ev sahibinin
    // numarası olduğu sürece kayıt onun kartında kalır. Numara girildiği anda o numaranın
    // kartı bulunur/açılır ve kayıt oraya taşınır.
    if ("guest_phone" in patch && restaurantId) {
      const yeniTel = (patch.guest_phone ?? "").trim();
      if (yeniTel !== (r.guest_phone ?? "")) {
        if (yeniTel.replace(/\D/g, "").length >= 10) {
          const { data: kart } = await supabase.from("kisi_kartlari")
            .upsert({ restaurant_id: restaurantId, phone: yeniTel }, { onConflict: "restaurant_id,phone", ignoreDuplicates: false })
            .select("id").single();
          tam.kisi_karti_id = (kart as { id: string } | null)?.id ?? null;
        } else {
          tam.kisi_karti_id = null;
        }
      }
    }
    const { error } = await supabase.from("reservations").update(tam).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  const bosMasalar = tables.filter((t) => t.status === "empty");
  const tableName = (id: string | null) => tables.find((t) => t.id === id)?.name ?? null;
  // Açılır pencere kendi kutusundan AŞAĞI açılır (Gökhan: "hâlâ farklı yerlere açılıyor,
  // kendi kutusundan aşağı doğru açılacak") — tek istisna: aşağıda pencerenin sığacağı yer
  // kalmadıysa yukarı açılır (Gökhan, 2026-08-19: "listenin en altındaki satırın saatini
  // değiştiremedim, aşağı açıldığı için; aşağı açılınca görünmeyen her satırın bilgisi yukarı
  // açılsın"). Yön kararı ekranın altında kalan boşluğa bakıyor, satırın kaçıncı olduğuna
  // değil — liste kaydırıldığında da doğru çalışsın diye.
  // Ölçü tek kural (Gökhan: "masa seç kutusu masa butonlarından sağdan soldan 2 mm büyük
  // olacak, birini küçültüp birini büyültme"): kutu = tıklanan düğme + 3'er mm, iç masa
  // düğmeleri de kutudan 2'şer mm içeride. Konum/ölçü px cinsinden buradan, mm eklemesi
  // calc() ile CSS'te yapılıyor — mm'yi px'e elle çevirmeye gerek yok.
  const menuKonum = (rect: DOMRect, tahminiYukseklik = 150): Konum => {
    const asagidakiYer = window.innerHeight - rect.bottom - 8;
    // Yukarı sadece aşağısı yetmiyorsa VE yukarısı daha genişse dönülüyor; ikisi de darsa
    // aşağıda kalması daha az şaşırtıyor.
    const yukari = asagidakiYer < tahminiYukseklik && rect.top - 8 > asagidakiYer;
    return {
      left: rect.left, top: rect.bottom + 2, width: rect.width, height: rect.height,
      yukari, altSinir: Math.max(8, window.innerHeight - rect.top + 2),
    };
  };

  // Saat/telefon/kişi/not — hücreye tıklayınca değeri hazır gelen küçük pencere açılır.
  const duzenleAc = (rect: DOMRect, r: Rez, alan: DuzenleAlan) => {
    setDuzenleDeger(
      alan === "saat" ? saat(r.reserved_at)
      : alan === "telefon" ? (r.guest_phone ?? "")
      : alan === "pax" ? String(r.party_size)
      : (r.note ?? "")
    );
    setDuzenleKadin(alan === "pax" && r.kadin_sayisi !== null ? String(r.kadin_sayisi) : "");
    setDuzenleErkek(alan === "pax" && r.erkek_sayisi !== null ? String(r.erkek_sayisi) : "");
    setDuzenle({ rezId: r.id, alan, konum: menuKonum(rect) });
  };
  // SALONU YENİDEN PLANLA — dönemin bütün rezervasyonlarına birden bakıp en iyi dağılımı
  // kurar (bkz. masaPlan.ts). Oturmuş misafirlere ve kilitli rezervasyonlara dokunmaz.
  // Birleşen masaları salon planında yan yana yazar; masayı ilk oynatırken asıl yerini
  // normal_x/y'ye kaydeder ki gün kapanınca oraya dönebilsin.
  // hedefGun: hangi günün salonu dizilecek. Verilmezse görüntülenen gün. Yeni rezervasyon
  // başka bir güne yazıldığında o günün planı kurulsun diye ayrıca alınıyor — eskiden tetik
  // "görüntülenen gün bugün olmalı" şartına bağlıydı ve bu yüzden atlanabiliyordu (Gökhan:
  // "otomatik yerleşim işaretli ama aldığım rezervasyonu masaya atmadı").
  // tamDiz: "Yerleşim yap" düğmesine ELLE basıldığında mevcut atamalar hiç korunmaz, salon
  // sıfırdan değerlendirilir. Otomatik/sessiz çağrılarda (yeni rezervasyon, iptal, kişi sayısı
  // değişimi) mevcut atamalar korunuyor — küçük bir değişiklikte bütün salonu karıştırmasın
  // diye. Ama bu "koru" kuralı, eski/hatalı bir atama hâlâ kişi sayısını karşılıyorsa onu asla
  // yeniden değerlendirmiyordu — düğmeye basılsa bile "sonuç değişmiyor" gibi görünüyordu
  // (Gökhan: "hiçbir şey değişmedi... böyle durumlarda normal düzeni koruması gerekli").
  // Düğme açıkça "düzeni baştan kur" demek, o yüzden orada koruma tamamen kapatılır.
  // sadeceDuzen: hiç YENİ masa ataması yapılmaz. Sadece o günün MEVCUT atamalarına göre salon
  // düzeni tazelenir — birleşik olmayan masalar asıl yerine döner, kalanlar aradaki mesafeyle
  // yeniden dizilir. Gün değişiminde bunun için kullanılıyor (aşağıdaki effect).
  const planiUygula = async (sessiz = false, hedefGun?: string, tamDiz = false, sadeceDuzen = false) => {
    const planGunu = hedefGun ?? gun;
    if (!restaurantId || !planGunu) return;
    // Veriyi ekrandan DEĞİL, doğrudan veritabanından okuyoruz. Ekrandaki liste bir işlemin
    // hemen ardından henüz tazelenmemiş oluyordu; plan eski listeyle kurulunca iptal edilen
    // rezervasyon geri geliyor, otomatik mod da değişikliği anında yansıtmıyordu (Gökhan).
    const { start, end } = gunSiniri(planGunu);
    const [{ data: rData }, { data: tData }] = await Promise.all([
      // YEDEK HARİÇ: yedek masa tutmaz, sıra bekler. Filtre yoktu ve yerleşim yedeklere de
      // masa dağıtıyordu — gerçek rezervasyonlar masasız kalıyordu (Gökhan, 2026-08-12,
      // salon ekran görüntüsü: "masa bulunamayan rezervasyon" listesi doluyken yedekler
      // masalara oturmuştu).
      // note ve tercih_alan_id ŞART — istenen salon kuralı bunlardan okunuyor (aşağıda).
      supabase.from("reservations").select("id, guest_name, guest_phone, party_size, status, masa_kilit, misafir_masasi, misafir_yakin, created_at, note, tercih_alan_id, stok_masa, dilim, ayakta, onay_durumu, reservation_tables(table_id)")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
        .in("status", ["bekleniyor", "geldi", "oturdu"])
        .gte("reserved_at", start).lt("reserved_at", end),
      // area_id ŞART — bkz. aşağıdaki planMasa. name ŞART — notta loca adı geçebiliyor.
      // grup_id ŞART — notta masa grubunun adı geçebiliyor (Gökhan, 2026-08-28).
      supabase.from("restaurant_tables").select("id, name, seat_count, position_x, position_y, shape, rotated, normal_x, normal_y, normal_rotated, varsayilan_x, varsayilan_y, varsayilan_rotated, area_id, grup_id, stok, stok_gun, tasindi_gun")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).order("sort_order"),
    ]);
    type TazeRez = {
      id: string; guest_name: string; guest_phone: string | null; party_size: number; status: string;
      masa_kilit: boolean; misafir_masasi: boolean; misafir_yakin: boolean | null; created_at: string;
      note: string | null; tercih_alan_id: string | null; stok_masa: number | null;
      dilim: string | null; ayakta: boolean | null; onay_durumu: string | null;
      reservation_tables: { table_id: string }[] | null;
    };
    type TazeMasa = { id: string; name: string; seat_count: number; position_x: number | null; position_y: number | null; shape: MasaSekli; rotated: boolean; normal_x: number | null; normal_y: number | null; normal_rotated: boolean | null; varsayilan_x: number | null; varsayilan_y: number | null; varsayilan_rotated: boolean | null; area_id: string | null; grup_id: string | null; stok: boolean | null; stok_gun: string | null; tasindi_gun: string | null };
    // Onay bekleyen ve reddedilmiş online başvurular dağıtıma girmez (Gökhan, 2026-08-30).
    let rezler = ((rData as TazeRez[]) ?? []).filter((x) => x.onay_durumu !== "bekliyor" && x.onay_durumu !== "reddedildi");
    let masalar = (tData as TazeMasa[]) ?? [];
    // RESTORAN + EĞLENCE: gece (bistro) salonunun masaları otomatik yerleşime girmez, bistro
    // elle verilir. Sadece geceye gelen rezervasyona da yemek masası dağıtılmaz.
    // Gece turu için ayrı tutuluyor: yemek turu gece salonunu ve sadece geceye gelenleri
    // görmüyor, ikinci tur onları dağıtıyor (Gökhan, 2026-08-29).
    const geceMasalari = geceSalonIds.size > 0
      ? masalar.filter((m) => m.area_id && geceSalonIds.has(m.area_id))
      : [];
    const geceRezler = geceSalonIds.size > 0
      ? rezler.filter((rz) => rz.dilim === "gece" || rz.dilim === "yemek_gece")
      : [];
    if (geceSalonIds.size > 0) {
      masalar = masalar.filter((m) => !m.area_id || !geceSalonIds.has(m.area_id));
      // BİSTROYA GEÇEN YEMEK MASASI İSTEMEZ (Gökhan, 2026-08-29: "bistro diyorum, önce tamam
      // oluyorlar sonra geri bistro oluyorlar"). Misafir bistroya geçince yemek masasını
      // bırakıyor; sonraki dağıtım onu hâlâ yemek misafiri sayıp yeni bir masa veriyor, satır
      // da "Bistro"ya geri dönüyordu. Geçmiş sayılanlar yemek turuna hiç girmiyor.
      const geceIdSeti0 = new Set(geceMasalari.map((m) => m.id));
      const masalariOf = (rz: TazeRez) => (rz.reservation_tables ?? []).map((x) => x.table_id);
      const bistroyaGecmis = (rz: TazeRez) => rz.dilim === "yemek_gece"
        && (rz.status === "geldi" || rz.status === "oturdu")
        && masalariOf(rz).some((id) => geceIdSeti0.has(id))
        && !masalariOf(rz).some((id) => !geceIdSeti0.has(id));
      rezler = rezler.filter((rz) => rz.dilim !== "gece" && !bistroyaGecmis(rz));
    }
    if (masalar.length === 0) return;

    // ————— EK MASA ARTIK SALONA ÇİZİLMİYOR (Gökhan, 2026-08-24) —————
    // Eski yol: sınırı aşan rezervasyona depodan S1/S2 diye GERÇEK masa üretilip salona
    // konuyordu. Gökhan: "görünürde gelmesine gerek yok, kişi sayısı zaten yazıyor, işletme
    // orada iki masa olduğunu anlar." Artık ek masa ayarlardaki masa kapasitesinden düşüyor,
    // salona hiçbir şey çizilmiyor. Kapasite bitince ek masa arka sıradan alınıyor ve o masa
    // planından kayboluyor (aşağıdaki tasindi_gun).
    //
    // Eski yolun bıraktığı S1/S2 masaları temizleniyor — mekanizma kalktı, salonda durmasınlar.
    const eskiStok = masalar.filter((m) => m.stok);
    if (eskiStok.length > 0) {
      await supabase.from("restaurant_tables")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", eskiStok.map((m) => m.id));
      masalar = masalar.filter((m) => !m.stok);
    }
    // Başka güne ait "taşındı" işareti temizlenir — masa kendi yerine geri döner.
    const eskiTasinan = masalar.filter((m) => m.tasindi_gun && m.tasindi_gun !== planGunu);
    if (eskiTasinan.length > 0) {
      await supabase.from("restaurant_tables").update({ tasindi_gun: null }).in("id", eskiTasinan.map((m) => m.id));
      eskiTasinan.forEach((m) => { m.tasindi_gun = null; });
    }

    const masaOf = (r: TazeRez) => (r.reservation_tables ?? []).map((x) => x.table_id);
    // EK MASA SAYISI — "sınır aşılınca" ayarına göre kimin kararı olduğu değişir:
    //   otomatik → program hesaplar; sor / manuel → kayıtta ne yazdıysa o (0 = ek masa yok).
    const ekMasaSayisi = (r: TazeRez): number | undefined => {
      if (!masaHesabi || sinirAsilinca === "otomatik") return undefined;
      return r.stok_masa ?? 0;
    };
    // Masa hesabında masanın "koltuğu" değil KİŞİ SINIRI geçerli — ekranda gösterilen masalarda
    // bu sınır zaten uygulanmış (yüklemede masa → grup → genel sırasıyla). Plan da aynı sayıyı
    // görmeli, yoksa aynı masa iki yerde iki farklı kapasiteyle sayılır.
    const planKoltuk = (t: TazeMasa) => {
      if (!masaHesabi) return t.seat_count;
      return tables.find((x) => x.id === t.id)?.seat_count ?? masaEnFazlaKisi;
    };
    const planMasa = (t: TazeMasa): PlanMasa => ({
      id: t.id, seat_count: planKoltuk(t), position_x: t.position_x, position_y: t.position_y,
      genislik: govdeCizim(t.shape, t.seat_count, t.rotated).width,
      // Yerleşim hep ASIL konumdan hesaplanır, o an nerede durduğundan değil — yoksa tekrar
      // tekrar "Yerleşim yap" çağrıldıkça kaymalar birikip masalar üst üste biner (Gökhan).
      normalX: t.normal_x, normalY: t.normal_y,
      // SALON — bu satır yokken planlayıcı bütün salonları tek tuval sanıyordu: masaların
      // salonu bilinmediği için Merkez'deki bir masayla Teras'takini "yan yana" kabul edip
      // tek rezervasyona veriyordu (Gökhan, 2026-08-15: "12 kişi hem bahçeden hem terastan
      // masa seçilmiş"). Artık bir rezervasyonun bütün masaları TEK salondan gelir.
      alanId: t.area_id,
      // İşletmenin raptiye ile kaydettiği kalıcı düzen — yerleşim önce buna bakar.
      varsayilanX: t.varsayilan_x, varsayilanY: t.varsayilan_y,
      // Birleşirken duruşu çıpaya uydurulacak masa buradan anlaşılıyor (Gökhan, 2026-08-19).
      shape: t.shape, rotated: t.rotated,
    });

    // MİSAFİR MASASI EŞLEŞMESİ (Gökhan, 2026-08-15). Kayıtlar birbirine bağlı değil; ev
    // sahibi burada bulunuyor: aynı numara + aynı isim, misafir olmayan, daha önce açılmış
    // rezervasyon. Bulunamazsa tercih uygulanmaz, masa normal dağıtılır.
    const sade = (r: TazeRez) => `${(r.guest_phone ?? "").replace(/\D/g, "").slice(-10)}|${r.guest_name.trim().toLocaleLowerCase("tr-TR")}`;
    const misafirler: MisafirBagi = {};
    rezler.filter((r) => r.misafir_masasi).forEach((m) => {
      if ((m.guest_phone ?? "").replace(/\D/g, "").length < 10) return;
      const evSahibi = rezler
        .filter((r) => !r.misafir_masasi && r.id !== m.id && sade(r) === sade(m))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (evSahibi) misafirler[m.id] = { evSahibiId: evSahibi.id, yakin: m.misafir_yakin === true };
    });

    // Oturmuş ve kilitli rezervasyonlar sabit, gerisi yeniden dizilir.
    const sabit = rezler.filter((r) => (r.status === "oturdu" || r.masa_kilit) && masaOf(r).length > 0);
    const sabitIds = new Set(sabit.map((r) => r.id));
    const serbest = rezler.filter((r) => !sabitIds.has(r.id));
    // Mevcut yerleşim planlayıcıya veriliyor — yeten atamalar korunuyor, sadece gereken
    // oynuyor (Gökhan: "ufak bir değişiklikte 7 rezervasyonun masasını değiştiriyor"). Tam
    // yeniden dizimde (elle "Yerleşim yap") bu koruma tamamen kapalı.
    const mevcutAtamalar: Record<string, string[]> = {};
    if (!tamDiz) serbest.forEach((r) => { const ids = masaOf(r); if (ids.length > 0) mevcutAtamalar[r.id] = ids; });

    // İSTENEN SALON (Gökhan, 2026-08-19: "rezervasyon listesine bahçe istiyor yazdım, otomatik
    // yerleşim açıktı, yerleşimi yaptı ama müşteriyi bahçeye vermedi"). Kural notKurallari.ts'te
    // ve salon ekranındaki "Yerleşim yap"ta vardı; buradaki otomatik yerleşim ise notu hiç
    // okumuyordu — nota salon adı yazmak da misafirin online salon seçmesi de işe yaramıyordu.
    // İstenen salonun boş masalarından yer ayrılır; o salon doluysa program başka salona
    // ZORLAMAZ, rezervasyon normal dağıtıma kalır (salon ekranı bu durumda işletmeye sorar).
    // LOCA (Gökhan, 2026-08-24) — otomatik yerleşim locaya oturtmaz; tek istisna notunda loca
    // isteyen rezervasyon. Notta locanın kendi adı yazıyorsa (L1, VIP 2) doğrudan o masa tutulur.
    const locaAdlari = masalar.filter((m) => m.shape === "loca").map((m) => ({ id: m.id, name: m.name }));
    const locaIster = (r: TazeRez) => locaAdlari.length > 0 && nottaLoca(r.note, locaAdlari);

    const salonTercihi: Record<string, string[]> = {};
    if (salonlar.length > 0 && !sadeceDuzen) {
      const planMasalar = masalar.map(planMasa);
      const doluIds = new Set<string>(sabit.flatMap(masaOf));
      serbest.forEach((r) => {
        const alan = istenenSalon(r, salonlar);
        if (!alan) return;
        const alanMasalari = planMasalar.filter((m) => m.alanId === alan && !doluIds.has(m.id));
        // O salonun kendi içinde planlanır — tam ölçü → üst boy → birleştirme kuralları aynen.
        const { atamalar: a } = salonuPlanla(alanMasalari, [{ id: r.id, kisi: r.party_size, loca: locaIster(r) }], [], {});
        const secim = a[r.id];
        if (!secim || secim.length === 0) return;
        secim.forEach((id) => doluIds.add(id));
        salonTercihi[r.id] = secim;
      });
    }
    // NOTTA ADI GEÇEN MASA GRUBU (Gökhan, 2026-08-28: nota "sahne önü" yazılıyor). Salon
    // tercihinden daha dar bir istek: o gruptaki masalardan yer ayrılır. Grup masası yoksa
    // ya da doluysa zorlanmaz, rezervasyon normal dağıtıma kalır.
    const grupTercihi: Record<string, string[]> = {};
    const grupluMasa = new Map(masalar.map((m) => [m.id, m.grup_id]));
    if (masaGruplari.length > 0 && !sadeceDuzen) {
      const planMasalar = masalar.map(planMasa);
      const doluIds = new Set<string>([...sabit.flatMap(masaOf), ...Object.values(salonTercihi).flat()]);
      serbest.forEach((r) => {
        if (salonTercihi[r.id]) return;
        const grupId = nottakiGrup(r.note, masaGruplari);
        if (!grupId) return;
        const grupMasalari = planMasalar.filter((m) => grupluMasa.get(m.id) === grupId && !doluIds.has(m.id));
        const { atamalar: a } = salonuPlanla(grupMasalari, [{ id: r.id, kisi: r.party_size, loca: locaIster(r) }], [], {});
        const secim = a[r.id];
        if (!secim || secim.length === 0) return;
        secim.forEach((id) => doluIds.add(id));
        grupTercihi[r.id] = secim;
      });
    }
    // Notta adı geçen loca — salon tercihinden de güçlü, misafir o masayı istemiş.
    const locaTercihi: Record<string, string[]> = {};
    if (locaAdlari.length > 0 && !sadeceDuzen) {
      const doluIds = new Set<string>(sabit.flatMap(masaOf));
      serbest.forEach((r) => {
        const masaId = nottakiLocaMasasi(r.note, locaAdlari);
        if (!masaId || doluIds.has(masaId)) return;
        doluIds.add(masaId);
        locaTercihi[r.id] = [masaId];
      });
    }
    // Salon tercihi "mevcut atamayı koru" kuralını GEÇER: yanlış salonda duran rezervasyon
    // yerinde bırakılmaz. Tercihi olanlar önce planlanır, masa çakışırsa onlar kazanır.
    const korunanAtamalar = { ...mevcutAtamalar, ...salonTercihi, ...grupTercihi, ...locaTercihi };
    const planSirasi = [...serbest].sort(
      (a, b) => ((salonTercihi[b.id] || grupTercihi[b.id]) ? 1 : 0) - ((salonTercihi[a.id] || grupTercihi[a.id]) ? 1 : 0),
    );

    // EK MASA SAYISI ARTIK MASA ÜRETMİYOR (Gökhan, 2026-08-24). Depodan S1/S2 çıkarma yolu
    // kaldırıldı: ek masa ayarlardaki masa kapasitesinden düşüyor, salona çizilmiyor.
    // Kapasite bitince ek masa arka sıradan alınıyor ve o masa planından kayboluyor.
    // O gün kapasiteden kaç masa harcandığını planlayıcı kendisi sayıyor (bkz. MasaKurali).
    const { atamalar, yerlesemeyen } = sadeceDuzen
      // Sadece düzen tazeleme: masa dağıtımına hiç karışılmaz, o günün kendi atamaları aynen
      // alınır. Aşağıdaki "yeniAtamalar" karşılaştırması bu yüzden boş çıkar, veritabanında
      // atama değişmez; değişen sadece masaların salondaki yeri olur.
      ? {
          atamalar: Object.fromEntries(rezler.map((r) => [r.id, masaOf(r)]).filter(([, ids]) => (ids as string[]).length > 0)) as Record<string, string[]>,
          yerlesemeyen: [] as string[],
        }
      : salonuPlanla(
          masalar.map(planMasa),
          planSirasi.map((r) => ({ id: r.id, kisi: r.party_size, ekMasa: ekMasaSayisi(r), loca: locaIster(r) })),
          sabit.map((r) => ({ rez: { id: r.id, kisi: r.party_size, ekMasa: ekMasaSayisi(r), loca: locaIster(r) }, masaIds: masaOf(r) })),
          korunanAtamalar,
          misafirler,
          // Masa hesabında bitişik masa birleştirme hiç denenmez; ek masa önce ayarlardaki
          // masa kapasitesinden düşer (çizilmez), kapasite bitince arka sıradan gelir.
          masaHesabi ? { sinir: masaEnFazlaKisi, stokKalan: masaStoguAdet } : undefined,
        );
    // ————— GECE TURU (Gökhan, 2026-08-29) —————
    // Dilimi gece ya da yemek + gece olan, ayakta işaretlenmemiş her rezervasyona bistro
    // veriliyor. Ayarda kişi sınırı yoksa herkese bir bistro; sınır varsa kalabalık gruba
    // yan yana ikinci bistro gider. Oturmuş, kilitli ve elle seçilmiş bistrolara dokunulmuyor.
    const geceAtamalari: Record<string, string[]> = {};
    if (geceMasalari.length > 0 && geceRezler.length > 0 && !sadeceDuzen) {
      const geceSabit = geceRezler.filter((r) => r.status === "oturdu" || r.masa_kilit);
      const geceSabitIds = new Set(geceSabit.map((r) => r.id));
      const geceSerbest = geceRezler.filter((r) => !geceSabitIds.has(r.id) && !r.ayakta);
      const gecePlanMasalar = geceMasalari.map(planMasa);
      // Sabit olanların bistroları elde tutuluyor, dağıtıma girmiyor.
      const geceKorunan: Record<string, string[]> = {};
      geceSabit.forEach((r) => {
        const bistrolari = masaOf(r).filter((id) => gecePlanMasalar.some((m) => m.id === id));
        if (bistrolari.length > 0) geceKorunan[r.id] = bistrolari;
      });
      // ELİNDEKİ BİSTRO KORUNUR (2026-08-29). Gece turu her çalıştığında bistroları sıfırdan
      // dağıtıyordu; yemek tarafında "yeten atama korunur" kuralı varken gecede yoktu, bu
      // yüzden her yeni rezervasyonda oturmuş misafirlerin bistrosu da yer değiştirebiliyordu.
      // Elle "Yerleşim yap" (tamDiz) yine sıfırdan kurar.
      const geceMevcut: Record<string, string[]> = {};
      if (!tamDiz) {
        geceSerbest.forEach((r) => {
          const bistrolari = masaOf(r).filter((id) => gecePlanMasalar.some((m) => m.id === id));
          if (bistrolari.length > 0) geceMevcut[r.id] = bistrolari;
        });
      }
      // Kişi sınırı yoksa herkes tek bistro ister: planlayıcıya kişi olarak 1 veriliyor,
      // o da en küçük tek bistroyu seçiyor (Gökhan, 2026-08-30).
      const geceKisi = (kisi: number) => (bistroKisi ? kisi : 1);
      const { atamalar: gA } = salonuPlanla(
        gecePlanMasalar,
        geceSerbest.map((r) => ({ id: r.id, kisi: geceKisi(r.party_size) })),
        geceSabit.map((r) => ({ rez: { id: r.id, kisi: geceKisi(r.party_size) }, masaIds: geceKorunan[r.id] ?? [] })),
        geceMevcut,
      );
      geceSerbest.forEach((r) => { if (gA[r.id]?.length) geceAtamalari[r.id] = gA[r.id]; });
    }

    const yeniAtamalar: { id: string; masaIds: string[] }[] = [];
    // Yemek ve gece masaları TEK kayıtta birleşiyor — plan bir rezervasyonun bütün masalarını
    // birlikte yazıyor, ayrı yazılırsa ikincisi birincisini siliyor.
    const tumRezIds = new Set([...serbest.map((r) => r.id), ...Object.keys(geceAtamalari)]);
    tumRezIds.forEach((rezId) => {
      const r = [...serbest, ...geceRezler].find((x) => x.id === rezId);
      if (!r) return;
      const yemek = atamalar[rezId] ?? [];
      const gece = geceAtamalari[rezId] ?? [];
      const yeni = [...yemek, ...gece];
      if (yeni.length === 0) return;
      const eski = masaOf(r);
      if (eski.length !== yeni.length || yeni.some((id) => !eski.includes(id))) yeniAtamalar.push({ id: rezId, masaIds: yeni });
    });
    const kumeler: PlanMasa[][] = [];
    const birlesikMasaIds = new Set<string>();
    Object.values(atamalar).forEach((ids) => {
      if (ids.length > 1) {
        kumeler.push(ids.map((id) => planMasa(masalar.find((t) => t.id === id)!)));
        ids.forEach((id) => birlesikMasaIds.add(id));
      }
    });
    // GECE TURUNUN MASALARI DA BİRLEŞİR (Gökhan, 2026-08-29: "gecedeki beraber olan masalar
    // hâlâ birleşmiyor"). Küme listesi yalnız yemek turundan kuruluyordu; üstelik dizilime
    // verilen masa listesinde gece salonu hiç yoktu. İkisi birden düzeltiliyor: bistrolar
    // kendi başlarına bir grup oluyor ve dizilim gece salonunu da görüyor. Ayrı salonda
    // oldukları için yemek masalarıyla karışmıyorlar — birleştirme salon salon çalışıyor.
    const geceMasaIdSet = new Set(geceMasalari.map((m) => m.id));
    const tumRezler = [...rezler, ...geceRezler.filter((g) => !rezler.some((r) => r.id === g.id))];
    tumRezler.forEach((r) => {
      // Bu tur dağıtmadıysa (kilitli, oturmuş ya da elle seçilmiş) elindeki bistrolar alınır.
      const ids = geceAtamalari[r.id] ?? masaOf(r).filter((id) => geceMasaIdSet.has(id));
      if (ids.length < 2) return;
      const grup = ids.map((id) => geceMasalari.find((t) => t.id === id)).filter((t): t is TazeMasa => !!t);
      if (grup.length < 2) return;
      kumeler.push(grup.map(planMasa));
      grup.forEach((t) => birlesikMasaIds.add(t.id));
    });
    // Dizilim gece salonunu da görmeli; yoksa oradaki küme hiç yerleştirilmiyor ve birleşmesi
    // biten bir bistro asıl yerine de dönemiyor.
    const duzenMasalari = [...masalar, ...geceMasalari];
    const yerlesemeyenler = yerlesemeyen.map((id) => rezler.find((x) => x.id === id)).filter((r): r is TazeRez => !!r);

    setBusy(true); setErr(null);
    // Plan tek işlemde uygulanır — tek tek gönderilince masalar birbirinin atamasını
    // bozup "listede masası var ama masa boş görünüyor" durumuna düşüyordu (Gökhan).
    if (yeniAtamalar.length > 0) {
      const { error } = await supabase.rpc("apply_seating_plan", {
        p_restaurant: restaurantId,
        p_plan: yeniAtamalar.map((a) => ({ reservation_id: a.id, table_ids: a.masaIds })),
      });
      if (error) { setBusy(false); setErr(error.message); await yenile(); return; }
    }
    // Artık birleşik olmayan masalar asıl yerine döner (Gökhan: "masaların rezervasyonu iptal
    // oldu, masa tekrar yerine geri dönsün").
    //
    // ÖNEMLİ: eve dönüş veritabanına yazılırken elimizdeki `masalar` listesi de aynı anda
    // güncelleniyor. Eskiden yazılmıyordu; aşağıdaki yerleşim hesabı ve "değişti mi"
    // karşılaştırması eve dönüşten ÖNCEKİ eski konumlara bakıyordu. Masanın yeni yeri eski
    // kayda göre "zaten aynı" görünüp yazılmıyor, masa evine dönmüş hâlde kalıyor ve yanına
    // çekilen masanın üstüne biniyordu (Gökhan, 2026-08-10: "masalar üst üste çıkıyor" —
    // MERKEZ'de 2-1 ile 4-1 tam olarak böyle çakışmıştı).
    const kilitliMasaIds = new Set(
      rezler.filter((r) => r.masa_kilit).flatMap((r) => (r.reservation_tables ?? []).map((x) => x.table_id)),
    );
    for (const t of duzenMasalari) {
      if (kilitliMasaIds.has(t.id)) continue; // kilitli masa asıl yerine de dönmez
      // Eve dönüş: varsa işletmenin kayıtlı düzeni (raptiye), yoksa birleştirmeden önceki yer.
      const evX = t.varsayilan_x ?? t.normal_x, evY = t.varsayilan_y ?? t.normal_y;
      if (birlesikMasaIds.has(t.id) || evX === null || evY === null) continue;
      // Eve dönen masa eski YÖNÜNE de döner — birleşmek için çevrilmişse düzelir.
      const eskiYon = t.varsayilan_rotated ?? t.normal_rotated;
      await supabase.from("restaurant_tables")
        .update({
          position_x: evX, position_y: evY, normal_x: null, normal_y: null,
          ...(eskiYon !== null ? { rotated: eskiYon, normal_rotated: null } : {}),
        })
        .eq("id", t.id);
      t.position_x = evX; t.position_y = evY; t.normal_x = null; t.normal_y = null;
      if (eskiYon !== null) { t.rotated = eskiYon; t.normal_rotated = null; }
    }
    // TAŞINAN MASALAR (masa hesabı, Gökhan 2026-08-24). Masa hesabında bir rezervasyonun
    // İKİNCİ ve sonraki masaları arka sıradan alınıp öne taşınmıştır — o masalar salon
    // planından kaybolur. İşaret güne yazılıyor, ertesi gün temizleniyor.
    if (masaHesabi) {
      const tasinanlar = new Set<string>();
      Object.values(atamalar).forEach((ids) => ids.slice(1).forEach((id) => tasinanlar.add(id)));
      const isaretlenecek = masalar.filter((m) => tasinanlar.has(m.id) && m.tasindi_gun !== planGunu).map((m) => m.id);
      const silinecek = masalar.filter((m) => !tasinanlar.has(m.id) && m.tasindi_gun === planGunu).map((m) => m.id);
      if (isaretlenecek.length > 0) await supabase.from("restaurant_tables").update({ tasindi_gun: planGunu }).in("id", isaretlenecek);
      if (silinecek.length > 0) await supabase.from("restaurant_tables").update({ tasindi_gun: null }).in("id", silinecek);
    }
    // Kilitli rezervasyonların masaları sabit engel — yerleşim onları oynatmaz.
    const kilitliIds = new Set(
      rezler.filter((r) => r.masa_kilit).flatMap((r) => (r.reservation_tables ?? []).map((x) => x.table_id)),
    );
    for (const yer of birlesikYerlesim(kumeler, duzenMasalari.map(planMasa), kilitliIds)) {
      const t = duzenMasalari.find((x) => x.id === yer.id);
      if (!t) continue;
      const yerAyni = t.position_x === yer.x && t.position_y === yer.y;
      const yonAyni = yer.rotated === undefined || yer.rotated === t.rotated;
      if (yerAyni && yonAyni) continue;
      await supabase.from("restaurant_tables").update({
        position_x: yer.x, position_y: yer.y,
        normal_x: t.normal_x ?? t.position_x, normal_y: t.normal_y ?? t.position_y,
        // Çevrilen masanın asıl yönü saklanır; eve dönerken oraya döner (Gökhan, 2026-08-19).
        ...(yer.rotated !== undefined ? { rotated: yer.rotated, normal_rotated: t.normal_rotated ?? t.rotated } : {}),
      }).eq("id", yer.id);
    }
    setBusy(false);
    await yenile();
    if (sessiz) return;
    setUyari({
      baslik: yerlesemeyenler.length === 0 ? "Salon yeniden dizildi" : "Salon dizildi, bir kısmı açıkta kaldı",
      satirlar: [
        `${yeniAtamalar.length} rezervasyonun masası değişti.`,
        ...(yerlesemeyenler.length > 0
          ? [`${yerlesemeyenler.length} rezervasyona masa bulunamadı: ${yerlesemeyenler.map((r) => `${r.guest_name} (${r.party_size} kişi)`).join(", ")}.`]
          : []),
      ],
    });
  };

  // BUGÜNÜN DÜZENİ — salon açıldığında/güne dönüldüğünde bir kez tazelenir.
  //
  // Yerleşim şimdiye kadar SADECE rezervasyon eklenince, iptal/gelmedi olunca ve kişi sayısı
  // değişince çalışıyordu. Gün değiştiğinde hiç çalışmıyordu; bu yüzden masalar önceki günün
  // dizilişinde asılı kalıyordu — biten bir rezervasyonun birleştirdiği masalar dip dibe
  // duruyor, hatta bir sonraki dizilim onların üstüne yazınca masalar üst üste biniyordu
  // (Gökhan, 2026-08-10: "masalar üst üste çıkıyor ve sırada kalmıyor" — MERKEZ'in alt
  // sırasındaki beş masa 4 gün önceki 18 kişilik rezervasyondan kalmaydı).
  //
  // SADECE BUGÜN için çalışır: geçmiş bir güne bakmak, salondaki gerçek masa düzenini
  // oynatmamalı — bu ekran akşam garsonun masaları dizdiği plan.
  // Masa ataması YAPMAZ (sadeceDuzen), o yüzden otomatik yerleşim kapalıyken de güvenli.
  const duzeniTazelenenGun = useRef<string | null>(null);
  useEffect(() => {
    if (!restaurantId || !gun || tables.length === 0) return;
    if (gun !== bugunIstanbul()) return;
    if (duzeniTazelenenGun.current === gun) return;
    duzeniTazelenenGun.current = gun;
    planiUygula(true, gun, false, true);
    // planiUygula her renderda yeniden kuruluyor; bağımlılığa eklenirse effect sürekli tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, gun, tables.length]);

  // Masaları normal yerine döndürür — gün kapanınca salon eski hâline gelsin diye.
  const masalariNormaleAl = async () => {
    for (const t of tables) {
      // Eve dönüş: varsa işletmenin kayıtlı düzeni (raptiye), yoksa birleştirmeden önceki yer.
      const evX = t.varsayilan_x ?? t.normal_x, evY = t.varsayilan_y ?? t.normal_y;
      if (evX === null || evY === null) continue;
      // Birleşmek için çevrilen masa eski yönüne de döner (Gökhan, 2026-08-19).
      const eskiYon = t.varsayilan_rotated ?? t.normal_rotated;
      await supabase.from("restaurant_tables")
        .update({
          position_x: evX, position_y: evY, normal_x: null, normal_y: null,
          ...(eskiYon !== null && eskiYon !== undefined ? { rotated: eskiYon, normal_rotated: null } : {}),
        })
        .eq("id", t.id);
    }
  };

  // GEÇMİŞ GÜN AÇIK KALDIYSA (Gökhan, 2026-08-13). Programda zamanla kendiliğinden çalışan bir
  // iş yok; akşam kapatılmayan gün sabaha açık giriyor, dünkü misafirler "oturuyor" görünüyor ve
  // masaları bugün kullanılamıyordu. Sabah ilk açılışta dünden kalanlar kapatılır: ayarda
  // "otomatik" ise sessizce, "sor" ise sorulduktan sonra. Bugün ve ileri günlere dokunulmaz.
  //
  // TELEFONDA SADECE KARŞILAMA (Gökhan, 2026-08-18): soru, listeyi kim açtıysa ona
  // soruluyordu — mutfak şefine "kapatalım mı" diye sorulmuş. O rollerde geldi/gelmedi
  // yetkisi zaten yok, gün kapatmak da onların işi değil. Ayar "otomatik" ise sessiz
  // kapatma da aynı şekilde herkeste çalışıyordu; o da artık sadece karşılamada çalışıyor.
  // Masaüstünde davranış aynı — web ana sayfa, orada rol kısıtı yok.
  const gecmisKapatildi = useRef(false);
  useEffect(() => {
    if (!restaurantId || gecmisKapatildi.current || gunKapanis === "") return;
    // Rol sorgusu dönmeden karar verilmiyor: `rolum` null hem "yüklenmedi" hem "işletme
    // sahibi" demek. Bayrak gelmeden çıkılıyor ve gecmisKapatildi işaretlenmiyor ki rol
    // geldiğinde kontrol bir kez çalışabilsin.
    if (isMobile && !rolYuklendi) return;
    if (isMobile && rolum !== null && rolum !== "karsilama") return;
    gecmisKapatildi.current = true;
    (async () => {
      const bugun = bugunIstanbul();
      const { data } = await supabase.from("reservations")
        .select("id, guest_name, status, reserved_at")
        .eq("restaurant_id", restaurantId).is("deleted_at", null)
        .in("status", ["bekleniyor", "geldi", "oturdu"])
        .lt("reserved_at", `${bugun}T00:00:00+03:00`)
        .order("reserved_at", { ascending: false })
        .limit(200);
      const acik = (data as { id: string; guest_name: string; status: string }[]) ?? [];
      if (acik.length === 0) return;
      if (gunKapanis !== "otomatik") {
        const bekleyen = acik.filter((r) => r.status === "bekleniyor").length;
        const ok = await confirm(
          `Geçmiş günlerden ${acik.length} kayıt açık kalmış`
          + (bekleyen > 0 ? ` (${bekleyen} tanesi bekliyor)` : "")
          + `. Kapatıp masaları boşaltalım mı?`,
          { danger: false },
        );
        if (!ok) return;
      }
      for (const r of acik) {
        await supabase.rpc("set_reservation_status", {
          p_reservation_id: r.id,
          p_status: r.status === "bekleniyor" ? "gelmedi" : "tamamlandi",
          p_cancel_reason: null,
        });
      }
      await yenile();
    })();
  }, [restaurantId, gunKapanis, isMobile, rolYuklendi, rolum]); // eslint-disable-line react-hooks/exhaustive-deps

  // GÜNÜ KAPAT (Gökhan: "günü kapat dediğinde bekleyenler gelmedi olarak kapatılır") —
  // gün bitince kimse işaretlemediyse kayıtlar "bekleniyor"da asılı kalmasın. Elle basılınca
  // görüntülenen günü kapatır; geçmiş günler yukarıdaki kontrolde kendiliğinden ele alınır.
  // Kapatılmamış her kayıt: bekleyen "gelmedi"ye, gelen/oturan "tamamlandı"ya döner ve masalar
  // boşalır. Sadece bekleyenlere bakmak yetmiyordu — hepsi "geldi" işaretlenince düğme
  // kayboluyordu, oysa asıl o zaman lazım (Gökhan).
  const acikKayitlar = rows.filter((r) => r.status === "bekleniyor" || r.status === "geldi" || r.status === "oturdu");
  const gunuKapat = async () => {
    if (acikKayitlar.length === 0) {
      setUyari({ baslik: "Kapatılacak kayıt yok", satirlar: ["Bu günde açık kalmış rezervasyon yok."] });
      return;
    }
    const bekleyen = acikKayitlar.filter((r) => r.status === "bekleniyor").length;
    const oturan = acikKayitlar.length - bekleyen;
    const parcalar = [
      ...(bekleyen > 0 ? [`${bekleyen} bekleyen "gelmedi" olacak`] : []),
      ...(oturan > 0 ? [`${oturan} kayıt "tamamlandı" olacak`] : []),
    ];
    const ok = await confirm(`${parcalar.join(", ")} ve masaları boşalacak. Günü kapatalım mı?`, { danger: false });
    if (!ok) return;
    setBusy(true); setErr(null);
    for (const r of acikKayitlar) {
      const yeni = r.status === "bekleniyor" ? "gelmedi" : "tamamlandi";
      const { error } = await supabase.rpc("set_reservation_status", { p_reservation_id: r.id, p_status: yeni, p_cancel_reason: null });
      if (error) { setBusy(false); setErr(error.message); await yenile(); return; }
    }
    // Gün bitti — akşam için oynatılmış masalar normal yerine dönsün (Gökhan).
    await masalariNormaleAl();
    setBusy(false);
    await yenile();
  };

  // Masa kilidi — "müşteri o masayı istemiştir, söz verilmiştir" (Gökhan). Kilitliyken
  // otomatik yerleşme o rezervasyonun masasını ne oynatır ne de başkasına verir.
  //
  // KİLİDİ AÇMAK SADECE YÖNETİCİDE (Gökhan, 2026-08-24: "rezervasyon alırken seçilmiş masayı
  // kimse değiştiremesin çünkü o artık müşteriye söylenmiştir; yönetici değiştirebilir").
  // Kilitlemek herkeste — korumayı koymak serbest, kaldırmak değil.
  const kilitDegistir = async (r: Rez) => {
    setErr(null);
    if (r.masa_kilit && !yoneticiyim) { setErr("Bu masa kilitli — kilidi sadece yönetici açabilir."); return; }
    const { error } = await supabase.from("reservations").update({ masa_kilit: !r.masa_kilit }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // Bu rezervasyon n kişi olursa salon HERKESİ oturtabiliyor mu? Kişi sayısı büyütmek yeni
  // rezervasyon almak kadar yer istiyor; kontrol de aynı olmalı.
  const paxSigarMi = (r: Rez, n: number): boolean => {
    // Loca isteyen rezervasyon salon havuzuna girmiyor — kişi sayısı salonu ilgilendirmiyor.
    if (yerlesimMasalari.length === 0 || locaIsteyen(r)) return true;
    const planMasalar = yerlesimMasalari.map((t) => ({
      id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y,
      alanId: t.area_id,
    }));
    const gruplar = salonRows.map((x) => ({ id: x.id, kisi: x.id === r.id ? n : x.party_size }));
    return salonuPlanla(planMasalar, gruplar, []).yerlesemeyen.length === 0;
  };
  // Bu rezervasyon en fazla kaç kişi olabilir — reddederken sayıyı da söyleyebilmek için.
  const enBuyukPax = (r: Rez): number => {
    for (let n = r.party_size + 20; n > r.party_size; n--) if (paxSigarMi(r, n)) return n;
    return r.party_size;
  };

  // Kişi sayısı değişimi — kaydeder, sonra otomatik yerleşme açıksa masayı sessizce tamamlar.
  const paxDegistir = async (r: Rez, n: number, kadin: number | null = r.kadin_sayisi, erkek: number | null = r.erkek_sayisi) => {
    setErr(null);
    const { error } = await supabase.from("reservations").update({ party_size: n, kadin_sayisi: kadin, erkek_sayisi: erkek }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await yenile();
    // Otomatik modda kişi sayısı değişimi salonu bozabilir — program dizilimi kendi düzeltir.
    if (otoYerlesme) await planiUygula(true);
  };

  // Geçersiz değerde pencere açık kalır (kaydetmez) — yanlışlıkla veri bozulmasın.
  const duzenleKaydet = () => {
    if (!duzenle) return;
    const r = rows.find((x) => x.id === duzenle.rezId);
    if (!r) { setDuzenle(null); return; }
    const v = duzenleDeger.trim();
    if (duzenle.alan === "saat") {
      const m = v.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
      if (!m) return;
      updateField(r, { reserved_at: new Date(`${gunIstanbul(r.reserved_at)}T${m[1].padStart(2, "0")}:${m[2]}:00+03:00`).toISOString() });
    } else if (duzenle.alan === "telefon") {
      updateField(r, { guest_phone: v.replace(/[^\d+ ]/g, "").trim() || null });
    } else if (duzenle.alan === "pax") {
      const n = parseInt(v.replace(/\D/g, ""), 10);
      if (!(n > 0)) return;
      // Kadın + erkek toplamı kişi sayısını aşamaz (Gökhan: "2 kişi ama 3 kadın 3 erkek
      // yazdım aldı rezervasyonu" — çelişkili girişi sessizce kabul etmemeli).
      const kadinN = duzenleKadin.trim() ? parseInt(duzenleKadin, 10) : 0;
      const erkekN = duzenleErkek.trim() ? parseInt(duzenleErkek, 10) : 0;
      if (kadinN + erkekN > n) {
        setErr(`Kadın + erkek toplamı (${kadinN + erkekN}) kişi sayısını (${n}) geçemez.`);
        return;
      }
      // Kişi sayısını BÜYÜTMEK de yeni rezervasyon almak gibidir: salon o hâliyle herkesi
      // oturtamıyorsa izin verilmez (Gökhan: "kapasite ve oturtma imkânı yoksa rezervasyon
      // sayısının çoğaltılmasına da izin vermesin"). Küçültmek her zaman serbest.
      if (n > r.party_size && !paxSigarMi(r, n)) {
        setUyari({
          baslik: `${r.guest_name} ${n} kişi yapılamıyor`,
          satirlar: [
            `Salon baştan dizilse bile bu rezervasyon ${n} kişi olursa herkes oturamıyor.`,
            `Şu an en fazla ${enBuyukPax(r)} kişi yapabilirsin.`,
            "Daha fazlası için başka bir rezervasyon iptal edilmeli ya da küçültülmeli.",
          ],
        });
        return;
      }
      // Otomatik yerleşme açıksa masa yetmez hale geldiğinde program konuyu kendi kapatır —
      // pencere açıp beklemez (Gökhan: "uyarı sistemi değil, kendi aksiyon veren program").
      paxDegistir(r, n, duzenleKadin.trim() ? kadinN : null, duzenleErkek.trim() ? erkekN : null);
    } else {
      updateField(r, { note: ilkHarfBuyukTr(v) || null });
    }
    setDuzenle(null);
  };

  // REZERVASYON PENCERESİNDEN MASA SEÇME — plan katmanının hazır değerleri (Gökhan, 2026-08-24).
  const fPlanAlan = (fPlanAlanId ? salonlar.find((s) => s.id === fPlanAlanId) : null) ?? salonlar[0] ?? null;
  const fHedefKisi = parseInt(fParty, 10) || 0;
  // Tıklama seçer/çıkarır — atama YOK, pencere kapanmaz, sınır yok (Gökhan: "ondan ona
  // ondan ona gezebilsin, karar verme aşamasında tıklanma sınırı olmasın").
  const fMasaTikla = (id: string) => {
    if (fPlanDolu[id] !== undefined) return; // o gün başkasında
    setFMasaSecimi((eski) => (eski.includes(id) ? eski.filter((x) => x !== id) : [...eski, id]));
  };

  // Masa ata penceresinin içeriği — render sırasında IIFE ile hesaplamak yerine (react-hooks/refs
  // uyarısı tetikliyordu) diğer pencereler (kartFor/kartForKart) gibi düz üst-seviye değerler.
  // RESTORAN + EĞLENCE (Gökhan, 2026-08-27). Gece salonu ayrı bir salon: geçiş saatinden
  // sonraki bistro düzeni. Masaları yemek kapasitesine ve otomatik yerleşime GİRMEZ — gece
  // kapasitesi ayrı sayılır, bistro masası elle (plandan) verilir.
  //
  // BU ÜÇÜ EN ÜSTTE DURMALI (Gökhan, 2026-08-28: "masa kutusuna tıkladım boş ekrana gitti").
  // Aşağıdaki masa listesi bunları hesaplarken kullanıyor; tanımları sonra kalınca masa
  // penceresi açıldığı anda program çöküyor ve ekran bembeyaz kalıyordu.
  const eglenceAktif = isletmeTipi === RESTORAN_EGLENCE;
  const geceSalonIds = new Set(salonlar.filter((s) => s.tur === "gece").map((s) => s.id));
  const geceMasaIds = new Set(tables.filter((t) => t.area_id != null && geceSalonIds.has(t.area_id)).map((t) => t.id));

  // OTURTMADA GECE MASASI ÇIKMAZ (Gökhan, 2026-08-29: "bekleyen rezervasyon aldım direkt
  // geceye aldı — gecede boş masa olduğu için oraya alıyor"). Oturtma penceresi ve bekleyene
  // masa önerisi bütün boş masalara bakıyordu; gece salonunun bistroları da listeye giriyor,
  // 5 kişilik bistro en küçük uyan masa olduğu için kapıdan gelen misafir geceye oturuyordu.
  // Artık dilimi gece olan misafire bistrolar, diğerlerine yemek salonu masaları çıkıyor.
  const oturtBosMasalar = (dilim: string | null | undefined) => (dilim === "gece"
    ? bosMasalar.filter((t) => geceMasaIds.has(t.id))
    : bosMasalar.filter((t) => !geceMasaIds.has(t.id)));

  // Masa seçme paneli online başvurularda da çalışsın — onaylamadan önce masası seçiliyor.
  const assigningRez = assigningId
    ? rows.find((row) => row.id === assigningId) ?? basvurular.find((row) => row.id === assigningId) ?? null
    : null;

  // "Hangi masaya oturtuyorsun" penceresi de aynı çoklu-seçim mantığını kullanır (Gökhan:
  // "4 kişilik rezervasyonu 2 kişilik masaya oturttu" — tek tıkla hemen oturtan liste, kişi
  // sayısını hiç kontrol etmiyordu). Masa ata ile birebir aynı örüntü: kapasite dolana kadar
  // seçim biriktirir, dolunca ya da aynı masaya tekrar tıklanınca oturtur.
  const seatingUygun = seatingFor ? oturtBosMasalar(seatingFor.dilim).filter((t) => t.seat_count >= seatingFor.party_size).sort((a, b) => a.seat_count - b.seat_count) : [];
  const seatingDiger = seatingFor ? oturtBosMasalar(seatingFor.dilim).filter((t) => t.seat_count < seatingFor.party_size).sort((a, b) => b.seat_count - a.seat_count) : [];
  const seatingSeciliKisi = masaSecimi.reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
  const seatingToggle = (id: string) => {
    if (!seatingFor) return;
    if (masaSecimi.includes(id)) { oturt(masaSecimi); return; }
    const yeni = [...masaSecimi, id];
    setMasaSecimi(yeni);
    const yeniKisi = yeni.reduce((s, tid) => s + (tables.find((t) => t.id === tid)?.seat_count ?? 0), 0);
    if (yeniKisi >= seatingFor.party_size) oturt(yeni);
  };

  // Masa düğmeleri kutunun içinde sağdan soldan 2'şer mm içeride (kutunun kendi boşluğu),
  // hepsi EŞİT yükseklikte ve aralarında 1 mm (Gökhan: "yükseklikleri eşit olacak, 1 mm
  // arayla açılacak"). Yükseklik tıklanan düğmeden alınır — kutu onun devamı gibi dursun.
  const masaBtnYukseklik = Math.max(masaAtaKonum?.height ?? 26, 26);
  const masaBtnStil = (secili: boolean): React.CSSProperties => ({
    ...masaSecBtn,
    boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
    width: "100%", height: masaBtnYukseklik, marginBottom: "1mm", padding: "0 8px",
    border: `1px solid ${secili ? "var(--brand-strong)" : "var(--line-2)"}`, borderRadius: 10,
    background: secili ? "var(--brand-strong)" : "var(--card)", color: secili ? "#fff" : "var(--ink)",
    fontSize: 12, whiteSpace: "nowrap", overflow: "hidden",
  });

  const bugunMu = gun === bugunIstanbul();
  // Sıralama dört kademeli: aktif akış üstte (kayıt sırasında), sonra kalkanlar, sonra
  // gelmeyenler, en altta iptaller. Array.sort stable — her kademe kendi içinde sırasını korur.
  // LİSTE SIRASI (Gökhan, 2026-08-18): üstte işi bitmemişler durur — önce hiç işaretlenmemiş
  // (bekleniyor), sonra gelmiş ama oturmamışlar. Oturan, tamamlanan, gelmeyen ve iptal aşağı
  // düşer; her grup kendi içinde saat sırasını korur (sıralama kararlı).
  const siraKademe = (s: string) =>
    s === "bekleniyor" ? 0
    : s === "geldi" ? 1
    : s === "oturdu" ? 2
    : s === "tamamlandi" ? 3
    : s === "gelmedi" ? 4
    : 5; // iptal
  // BEKLEYENLER ayrı blokta duruyor (Gökhan, 2026-08-18: "rezervasyon listesinde en üstte")
  // — ana listeye karışmıyorlar, sıraya girdikleri saate göre diziliyorlar.
  const bekleyenRows = rows
    .filter((r) => r.bekleme && r.status === "bekleniyor")
    .sort((a, b) => (a.bekleme_baslangic ?? a.created_at).localeCompare(b.bekleme_baslangic ?? b.created_at));
  const bekleyenPax = bekleyenRows.reduce((s, r) => s + r.party_size, 0);
  const visibleRows = [...rows].filter((r) => !r.bekleme && !r.yedek).sort((a, b) => siraKademe(a.status) - siraKademe(b.status));

  // Kapasite — gün tek havuz (Gökhan: "bu programı öncelik olarak eğlence mekanlarına
  // yapıyoruz, sadece akşamı baz alacağız"). Sadece gerçekten yer kaplayan durumlar sayılır;
  // tamamlanan ziyaret masayı boşalttığı için artık saymaz.
  //
  // Yedek kaldırıldı: kapasite dolduğunda rezervasyon Yedek'e alınmıyor, doğrudan
  // reddediliyor (Gökhan: "yedek rezervasyon almayı durdur"). O yüzden yedek hesabı,
  // YEDEK rozeti ve "Bekleyenler (Yedek)" filtresi de ekrandan kaldırıldı — hiç
  // oluşmayacak bir durumu gösterip kafa karıştırmasınlar.
  // Kapasite: masa hesabı açıkken tables.seat_count zaten masanın KİŞİ SINIRI (yükleme
  // sırasında yazılıyor), kapalıyken koltuk sayısı. İki durumda da toplam aynı yerden çıkıyor.
  // Masa yoksa kapasite kurulumda yazılan sayıdan gelir — salonunu kurmamış işletme de
  // rezervasyon alabilsin diye (yerleşim ve masa ataması yine kapalı).
  // LOCA (Gökhan, 2026-08-24) — loca masanın ŞEKLİ ve otomatik dağıtımın tamamen dışında:
  // locayı insan satar. Bu yüzden kapasite, masa sayısı ve "yer var mı" hesaplarının hepsi
  // SALON masaları üzerinden yürüyor; localar ayrı sayılıp ekranda ayrı gösteriliyor.
  // Notunda loca isteyen rezervasyon da salon hesabına girmiyor — o locadan yer bekliyor.
  // BİSTRO SAYISI VE KAPASİTE (Gökhan, 2026-08-29: "kapasite bistro başına 5 hesaplanacak").
  // Gece salonunda loca da olabiliyor; loca bistro değildir, kendi sayacında duruyor ve elle
  // satılıyor. Bu yüzden sayım da kapasite de yalnız bistrolar üzerinden.
  const geceBistrolari = tables.filter((t) => geceMasaIds.has(t.id) && t.shape !== "loca");
  const bistroSayisi = geceBistrolari.length;
  // Kişi sınırı yoksa gecenin pax kapasitesi de yok — loca gibi sadece adet konuşuluyor.
  const geceKapasite = bistroKisi ? bistroSayisi * bistroKisi : 0;
  const bistroIdleri = new Set(geceBistrolari.map((t) => t.id));
  const doluBistro = new Set(
    Object.values(rezMasalar).flat().filter((id) => bistroIdleri.has(id)),
  ).size;
  const locaMasalari = tables.filter((t) => t.shape === "loca");
  // Fiilen tutulmuş loca sayısı — sayaçta kalan loca bundan çıkıyor.
  const locaIdleri = new Set(locaMasalari.map((t) => t.id));
  const doluLoca = new Set(Object.values(rezMasalar).flat().filter((id) => locaIdleri.has(id))).size;
  const yerlesimMasalari = tables.filter((t) => t.shape !== "loca" && !geceMasaIds.has(t.id));

  // NOT YAZARKEN İSTENEN ŞEY VAR MI (Gökhan, 2026-08-28: "nota loca yazarsa program algılasın
  // ve loca yok desin, ya da girişte 10 kişilik masa yok desin"). İşletme misafirle telefonda
  // konuşurken görsün diye not kutusunun altında tek satır çıkıyor. Kaydı DURDURMUYOR —
  // loca boşalabilir, masa birleştirilebilir; kararı işletme veriyor.
  //
  // Üç şey kontrol ediliyor, üçü de zaten notlardan tanınıyor: locanın kendi adı, "loca"
  // kelimesi, salon adı. Doluluk o güne göre okunuyor (fPlanDolu).
  const fNotUyarisi = ((): string | null => {
    if (!newResOpen || !fNote.trim() || tables.length === 0) return null;
    const doluMu = (id: string) => fPlanDolu[id] !== undefined;

    // 1) Notta belirli bir locanın adı — o loca bu rezervasyona ayrılır; doluysa söylenir.
    const istenenLoca = nottakiLocaMasasi(fNote, locaMasalari);
    if (istenenLoca) {
      const ad = tables.find((t) => t.id === istenenLoca)?.name ?? "Loca";
      return doluMu(istenenLoca) ? `${ad} bugün dolu.` : null;
    }
    // 2) Notta sadece "loca" geçiyor — o gün boş loca kalmış mı.
    if (locaMasalari.length > 0 && nottaLoca(fNote, locaMasalari)) {
      const bos = locaMasalari.filter((t) => !doluMu(t.id));
      if (bos.length === 0) return "Bugün boş loca yok — hepsi dolu.";
      return null;
    }
    const kisiSayisi = parseInt(fParty, 10) || 0;
    // 3) Notta masa grubunun adı — "sahne önü" gibi (Gökhan, 2026-08-28). O gruptan bu kişi
    // sayısına yer kalmış mı.
    const grupId = nottakiGrup(fNote, masaGruplari);
    if (grupId && kisiSayisi > 0) {
      const grupAdi = masaGruplari.find((g) => g.id === grupId)?.ad ?? "O grup";
      const grupMasalari = tables.filter((t) => t.grup_id === grupId);
      if (grupMasalari.length === 0) return `${grupAdi}: bu gruba masa işaretlenmemiş.`;
      const bosGrup = grupMasalari.filter((t) => !doluMu(t.id));
      const yeter = salonuPlanla(
        bosGrup.map((t) => ({ id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y, alanId: t.area_id })),
        [{ id: "yeni", kisi: kisiSayisi }],
        [],
      ).yerlesemeyen.length === 0;
      if (!yeter) return `${grupAdi}: ${kisiSayisi} kişilik yer kalmamış.`;
      return null;
    }
    // 4) Notta salon adı — o salonda bu kişi sayısına yer var mı.
    const salonId = istenenSalon({ note: fNote }, salonlar);
    if (!salonId) return null;
    const salonAdi = salonlar.find((sa) => sa.id === salonId)?.name ?? "O salon";
    const kisi = parseInt(fParty, 10) || 0;
    if (kisi <= 0) return null;
    // Salonun KENDİ masaları — gece salonunun bistroları yemek havuzunun dışında tutuluyor,
    // o havuzdan bakılınca gece salonu boş görünüp "masa tanımlı değil" diyordu
    // (Gökhan, 2026-08-28). Loca sayılmıyor: locayı program dağıtmıyor.
    const salonMasalari = tables.filter((t) => t.area_id === salonId && t.shape !== "loca");
    if (salonMasalari.length === 0) return `${salonAdi}: masa tanımlı değil.`;
    const planla = (liste: TableRow[]) => salonuPlanla(
      liste.map((t) => ({ id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y, alanId: t.area_id })),
      [{ id: "yeni", kisi }],
      [],
    ).yerlesemeyen.length === 0;
    // Şu an boş olan masalarla oluyor mu?
    if (planla(salonMasalari.filter((t) => !doluMu(t.id)))) return null;
    // Düzen değişirse — o salonda oturan ama salon isteği olmayan misafirler kaydırılabilir.
    const oynamaz = new Set(
      rows.filter((r) => r.status === "oturdu" || r.masa_kilit || istenenSalon(r, salonlar) === salonId)
        .flatMap((r) => rezMasalar[r.id] ?? (r.table_id ? [r.table_id] : [])),
    );
    if (planla(salonMasalari.filter((t) => !oynamaz.has(t.id)))) {
      return `${salonAdi}: doğrudan yer yok — düzeni değiştirerek açılabilir.`;
    }
    return `${salonAdi}: ${kisi} kişilik yer açılmıyor.`;
  })();


  // MASA SEÇERKEN İKİ SALON YAN YANA (Gökhan, 2026-08-28: "yemek ve gece salonunu yan yana
  // açsın ve iki salondan da masa seçilsin"). Misafir hem yemeğe hem geceye kalıyorsa iki
  // masası olacak; ikisini de aynı ekranda seçebilmeli.
  //
  // Solda yemek salonu — üstteki salon düğmeleri onu değiştiriyor; sağda gece salonu, sabit.
  // Telefonda yan yana sığmadığı için sırayla: önce yemek salonu, masası seçilince gece salonu.
  // PLAN İKİ YERDEN AÇILIYOR (Gökhan, 2026-08-29: "rezervasyon listesinde de masa seç
  // dediğinde salon ekranı açılsın"). Yeni rezervasyon formundan ve listedeki bir satırın
  // masa kutusundan; ekran aynı, sadece hangi rezervasyona masa seçildiği değişiyor.
  const planSatir = assigningRez;
  // DİLİMİ YAZILMAMIŞ KAYIT YEMEK SAYILIR (2026-08-29). Eski kapı girişlerinde dilim boş;
  // boş bırakılınca masa seçme panelinde gece salonu da açılıyor ve kapıdan gelen misafire
  // bistro verilebiliyordu. Yerleştirme tarafı boş dilimi zaten yemek sayıyor, panel de öyle.
  const fPlanDilim: Dilim | null = planSatir
    ? (eglenceAktif ? ((planSatir.dilim as Dilim | null) ?? "yemek") : null)
    : (eglenceAktif && eglenceGunuMu(fDate, eglenceGunleri) ? turuCoz(fDilim).dilim : null);
  const geceSalonu = salonlar.find((s) => geceSalonIds.has(s.id)) ?? null;
  const yemekSalonlari = salonlar.filter((s) => !geceSalonIds.has(s.id));
  const fYemekAlan = (fPlanAlanId ? yemekSalonlari.find((s) => s.id === fPlanAlanId) : null) ?? yemekSalonlari[0] ?? null;
  // Telefonda sıra: yemek masası seçilene kadar yemek salonu, sonra gece salonu.
  // Plan ekranındaki seçim: satırdan açıldıysa o satırın masaları, formdan açıldıysa formun.
  const planSecim = planSatir ? masaSecimi : fMasaSecimi;
  const planSecimYaz = planSatir ? setMasaSecimi : setFMasaSecimi;
  const planAcik = (newResOpen && fPlanAcik) || !!planSatir;
  const fYemekSecildi = planSecim.some((id) => !geceMasaIds.has(id));
  // Üstteki salon düğmeleri: dilim yokken bütün salonlar, dilim varken sadece yemek salonları
  // (gece salonu düğmeyle seçilmiyor, kendiliğinden geliyor).
  const fPlanPilleri = !fPlanDilim ? salonlar : fPlanDilim === "gece" ? [] : yemekSalonlari;
  const fPlanSeciliPil = fPlanDilim ? (fYemekAlan?.id ?? null) : (fPlanAlan?.id ?? null);
  // Ekranda çizilecek salonlar.
  const fPlanPaneller = (() => {
    if (!fPlanDilim) return fPlanAlan ? [fPlanAlan] : [];
    if (fPlanDilim === "gece") return geceSalonu ? [geceSalonu] : [];
    if (fPlanDilim === "yemek") return fYemekAlan ? [fYemekAlan] : [];
    const ikisi = [fYemekAlan, geceSalonu].filter((a): a is NonNullable<typeof a> => !!a);
    // Gece salonu işaretlenmemişse yan yana açılacak ikinci salon yok — tek salon çalışır.
    if (isMobile && ikisi.length === 2) return [fYemekSecildi ? ikisi[1] : ikisi[0]];
    return ikisi;
  })();
  const planSeciliKisi = planSecim.reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
  const planSecimdeLoca = planSecim.some((id) => tables.find((t) => t.id === id)?.shape === "loca");
  // SEÇİM ÖZETİ İÇİN AYRIŞTIRMA (Gökhan, 2026-08-30: "yemekten masa seçiyorum, geceden masa
  // seçiyorum, 6 kişi yazıyor karşısında seçtiğim masaların toplam kapasitesi — oradaki
  // yazılar açıklayıcı olmalı"). Sağdaki özet artık hangi salondan ne seçildiğini ve yetip
  // yetmediğini ayrı ayrı yazıyor.
  const planYemekSecim = planSecim.filter((id) => !geceMasaIds.has(id));
  const planGeceSecim = planSecim.filter((id) => geceMasaIds.has(id));
  const planYemekKoltuk = planYemekSecim.reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
  const planAdlari = (ids: string[]) => ids.map((id) => tableName(id)).filter(Boolean).join(" + ");
  /** Özet satırı: her masa kendi kapasitesiyle yan yana, aralarında + (Gökhan, 2026-08-30). */
  const planMasaPax = (ids: string[], kapasite: (id: string) => number) =>
    ids.map((id) => `${tableName(id)} ${kapasite(id)} pax`).join(" + ");
  const planKisi = planSatir ? planSatir.party_size : fHedefKisi;
  const planBaslik = planSatir ? planSatir.guest_name : (fName.trim() || "Yeni rezervasyon");
  const planSaat = planSatir ? saat(planSatir.reserved_at) : fTime;
  /** Plandan masaya tıklama — satır modunda kendi masası tıklanabilir, başkasınınki değil. */
  const planMasaTikla = (id: string) => {
    // Kilitli rezervasyonun masası plandan değiştirilemez — önce kilidi açmak gerekiyor
    // (Gökhan, 2026-08-30). Ekran yine açılıyor, sadece seçim kapalı.
    if (planSatir?.masa_kilit) return;
    if (!planSatir) { fMasaTikla(id); return; }
    const kendisinin = (rezMasalar[planSatir.id] ?? []).includes(id);
    if (fPlanDolu[id] !== undefined && !kendisinin) return;
    setMasaSecimi((eski) => (eski.includes(id) ? eski.filter((x) => x !== id) : [...eski, id]));
  };
  /** Tamam — satır modunda seçim doğrudan atanır; seçim boşsa masa bırakılır. */
  const planTamam = async () => {
    // Kilitli rezervasyonda Tamam sadece kapatır — masaya dokunulmaz (Gökhan, 2026-08-30).
    if (planSatir?.masa_kilit) { setAssigningId(null); setMasaSecimi([]); setMasaAtaKonum(null); return; }
    if (!planSatir) { setFPlanAcik(false); return; }
    const rez = planSatir;
    const secim = masaSecimi;
    setAssigningId(null); setMasaSecimi([]); setMasaAtaKonum(null);
    if (secim.length > 0) await masaAta(rez, secim);
    else await masaBosalt(rez);
  };
  const planKapat = () => {
    if (planSatir) { setAssigningId(null); setMasaSecimi([]); setMasaAtaKonum(null); }
    else setFPlanAcik(false);
  };
  // LOCA SAYIMI MASAYA GÖRE (Gökhan, 2026-08-28). Masa atanmışsa artık not değil MASA
  // geçerli: loca verildiyse loca sayılır, normal masa verildiyse salon doluluğuna girer.
  // Eskiden yalnızca nota bakılıyordu — nota "loca" yazılıp loca bulunamayan misafir salonda
  // otururken doluluk sayısında hiç görünmüyor, salon olduğundan boş sanılıyordu.
  /**
   * Bu misafir hâlâ yemek masasında mı — yani "Bistroya geç" düğmesi çıkacak mı
   * (Gökhan, 2026-08-28). Yemek + gece dilimindeki misafir bistroya geçene kadar doğru,
   * geçtikten sonra yanlış. Masa sütunu da aynı kurala bakıyor, ikisi ayrışmasın.
   */
  const bistroyaGecer = (r: Rez) => {
    // Ayakta alınan misafir bistro tutmaz — ona geçiş düğmesi de çıkmaz (2026-08-29).
    if (!eglenceAktif || r.dilim !== "yemek_gece" || r.ayakta) return false;
    const masalari = rezMasalar[r.id] ?? (r.table_id ? [r.table_id] : []);
    // Sadece bistro masası kaldıysa geçiş yapılmış demektir.
    return masalari.some((id) => !geceMasaIds.has(id));
  };

  const locaIsteyen = (r: { id?: string; note: string | null }) => {
    const masalari = r.id ? (rezMasalar[r.id] ?? []) : [];
    if (masalari.length > 0) return masalari.some((id) => tables.find((t) => t.id === id)?.shape === "loca");
    return locaMasalari.length > 0 && nottaLoca(r.note, locaMasalari);
  };
  const toplamKapasite = yerlesimMasalari.length > 0 ? yerlesimMasalari.reduce((s, t) => s + t.seat_count, 0) : kapasiteKisi;
  // LOCANIN SABİT PAX'I YOK (Gökhan, 2026-08-24: "locanın kişi paxı olmaz, 2 kişide
  // alabiliyorsun oraya 10 kişide"). Bu yüzden locada koltuk sayısı gösterilmiyor; sayı
  // rezervasyon alındıkça doluyor — o gün localara kaç kişi yazıldıysa o.
  // Yedek kapasiteyi doldurmaz — masa tutmuyor, sıra bekliyor (Gökhan, 2026-08-12).
  const kapasiteliRows = rows.filter((r) => !r.yedek && !r.bekleme && (r.status === "bekleniyor" || r.status === "geldi" || r.status === "oturdu"));
  // Salon hesabına giren rezervasyonlar — loca isteyenler ayrı.
  // Sadece geceye gelen misafir yemek kapasitesini tutmaz — bistro/ayakta hesabına girer.
  // LOCASI OLAN AMA YEMEK MASASI DA OLAN (Gökhan, 2026-08-29). Gece salonu geldikten sonra bir
  // misafirin hem yemekte masası hem gecede locası olabiliyor: Sergen Yalçın yemekte Giriş 20'de,
  // gecede locada. Loca kuralı onu salon hesabından tamamen düşürüyordu; Giriş 20 boş sanılıyor
  // ve o masaya ikinci rezervasyon alınabiliyordu — uyarı da çıkmıyordu.
  // Artık salon hesabından ancak YEMEK SALONUNDA HİÇ MASASI OLMAYAN düşülüyor. Loca sayacı
  // değişmiyor; locası olan orada görünmeye devam ediyor.
  const yemekMasasiVar = (r: { id?: string }) => {
    const masalari = r.id ? (rezMasalar[r.id] ?? []) : [];
    return masalari.some((id) => yerlesimMasalari.some((t) => t.id === id));
  };
  // BİSTROYA GEÇEN YEMEK SALONUNU BOŞALTIR (Gökhan, 2026-08-29: "yemek salonundan bistroya
  // geçiyorsa yemek salonu tamamlandı olarak görecek"). Misafir geçtikten sonra yemek masası
  // bırakılıyor ama doluluk sayısında durmaya devam ediyordu; geçiş saatinden sonra salon
  // fiilen boşalsa bile dolu görünüyor ve yeni rezervasyonun önünü tıkıyordu.
  // Geçmiş sayılmak için üçü birden: gelmiş olacak, elinde bistro olacak, yemek masası
  // kalmamış olacak. Masası henüz verilmemiş yeni rezervasyon bu tarife uymaz.
  const bistroyaGecti = (r: Rez) => {
    if (!eglenceAktif || r.dilim !== "yemek_gece") return false;
    if (r.status !== "geldi" && r.status !== "oturdu") return false;
    const masalari = rezMasalar[r.id] ?? [];
    return masalari.some((id) => geceMasaIds.has(id)) && !masalari.some((id) => !geceMasaIds.has(id));
  };
  const salonRows = kapasiteliRows.filter((r) => (yemekMasasiVar(r) || !locaIsteyen(r)) && r.dilim !== "gece" && !bistroyaGecti(r));
  // GECE HESABI: geceye kalanlar (gece + yemek_gece) bistro kapasitesinden, ayakta
  // işaretliler ayakta kapasitesinden düşer (Gökhan, 2026-08-27).
  const gecePax = kapasiteliRows.filter((r) => (r.dilim === "gece" || r.dilim === "yemek_gece") && !r.ayakta).reduce((s, r) => s + r.party_size, 0);
  // GECE TALEBİ — ATANMIŞ DEĞİL GEREKEN BİSTRO (2026-08-29). Kontrol "kaç bistro tutulmuş"a
  // bakıyordu; bistrosu henüz dağıtılmamış rezervasyon hiçbir şey tutmadığı için boş bistro
  // sayısı yüksek görünüyor ve program almaya devam ediyordu. Yerleşim çalışmadığı sürece bu
  // sonsuza kadar sürüyor. Artık o günün gece misafirlerinin İSTEDİĞİ bistro toplanıyor.
  // Gereken bistro: ayarda kişi sınırı yoksa her rezervasyon bir bistro (Gökhan, 2026-08-30).
  const bistroGereken = (kisi: number) => (bistroKisi ? Math.max(1, Math.ceil(kisi / bistroKisi)) : 1);
  // Locası olan misafir bistro istemiyor — gece tarafında yerini loca tutuyor.
  // Tutulan bistro: rezervasyona kaç bistro verilmişse o kadar, hiç verilmemişse gereken
  // kadar. İşletmeci kalabalık gruba ikinci bistroyu elle verdiğinde sayaç onu görüyor
  // (Gökhan, 2026-08-30).
  const geceTalep = kapasiteliRows
    .filter((r) => (r.dilim === "gece" || r.dilim === "yemek_gece") && !r.ayakta && !locaIsteyen(r))
    .reduce((s, r) => {
      const verilen = (rezMasalar[r.id] ?? []).filter((id) => bistroIdleri.has(id)).length;
      return s + Math.max(bistroGereken(r.party_size), verilen);
    }, 0);
  // Geceye kalan (ayakta olmayan) rezervasyon sayısı — salondaki RZV sayacının gece karşılığı.
  const geceRezSayisi = kapasiteliRows.filter((r) => (r.dilim === "gece" || r.dilim === "yemek_gece") && !r.ayakta).length;
  /** Ayakta alınan rezervasyon sayısı — ayakta sayacının RZV rakamı (Gökhan, 2026-08-30). */
  const ayaktaRezSayisi = kapasiteliRows.filter((r) => r.ayakta).length;
  const ayaktaPax = kapasiteliRows.filter((r) => r.ayakta).reduce((s, r) => s + r.party_size, 0);
  const locaRows = kapasiteliRows.filter((r) => locaIsteyen(r));
  const locaPax = locaRows.reduce((s, r) => s + r.party_size, 0);
  // MASA KAPASİTESİNDEN KAÇ MASA DÜŞTÜ (Gökhan, 2026-08-24). Artık gerçek masa üretilmiyor;
  // sınırı aşan her rezervasyonun istediği ek masa doğrudan ayarlardaki kapasiteden düşüyor.
  // Sayı o günün rezervasyonlarından çıkıyor — planlayıcıyla aynı formül.
  const gerekenEkToplam = !masaHesabi ? 0 : kapasiteliRows.reduce(
    (s, r) => s + (sinirAsilinca === "otomatik"
      ? Math.max(0, Math.ceil(r.party_size / Math.max(masaEnFazlaKisi, 1)) - 1)
      : (r.stok_masa ?? 0)),
    0,
  );
  const kullanilanStok = Math.min(gerekenEkToplam, masaStoguAdet);
  const kalanStok = Math.max(0, masaStoguAdet - kullanilanStok);
  const gunPax = salonRows.reduce((s, r) => s + r.party_size, 0);
  // YEDEK — o gün yer bulunamayan, yer açılırsa aranacak misafirler (Gökhan, 2026-08-18:
  // "yer açılınca arayalım listesi uzun, yedek olarak adlandırmak daha mantıklı"). Masa
  // tutmazlar, kapasiteye girmezler; rezervasyon listesinin ALTINDA kendi listelerinde
  // dururlar. Kapıda bekleyenle karıştırılmaz: bu telefonda bekleyen, o mekânda bekleyen.
  const yedekRows = rows
    .filter((r) => r.yedek && r.status === "bekleniyor")
    .sort((a, b) => a.reserved_at.localeCompare(b.reserved_at));
  const yedekPax = yedekRows.reduce((s, r) => s + r.party_size, 0);
  // BİRLEŞEN MASALAR TEK MASA SAYILIR (Gökhan, 2026-08-18: "kapasite konusunda sıkıntı
  // çıkmasın"). İki masa bir rezervasyon için birleştiğinde salonda fiilen tek masa vardır;
  // o gün için masa sayısı o kadar azalır.
  //
  // Sayı MASA ATAMASINI BEKLEMİYOR (Gökhan, 2026-08-19: "rezervasyonları yazıyorum, masa
  // adedi hâlâ 23; rezervasyon sayısına göre masa birleşecekse sistem bunu algılayıp masa
  // sayısını değiştirsin"). Eskiden sadece fiilen atanmış masalar sayılıyordu; ileri tarihli
  // günlerde hiçbir masa atanmadığı için sayı hep salondaki masa sayısında kalıyordu. Artık
  // o günün rezervasyonları masa havuzuna dağıtılıyor (masaPlan.ts — tam ölçü → üst boy →
  // birleştirme) ve "harcanan masa − yerleşen rezervasyon" farkı kadar düşülüyor: 4 kişilik
  // masalara 6 kişilik bir rezervasyon geldiğinde iki masa gideceği için masa sayısı bir
  // azalır. Masa dökümü de aynı hesabı kullanıyor, iki sayı birbirini tutuyor.
  const gunGruplari = salonRows.map((r) => r.party_size);
  const gunTuketim = havuzuTuket(yerlesimMasalari, gunGruplari);
  // GERÇEKTEN BOŞ MASA (Gökhan, 2026-08-29: "bütün masalar dolu olmasına rağmen 1 masa boş
  // görünüyor"). Sayaç boş masayı saymıyor, kâğıt üstünde yeniden dağıtım yapıyordu: 19 grup
  // kâğıtta 24 masaya sığdığı için "1 masa boş" diyordu, oysa gerçek yerleşim kilit ve salon
  // sınırı yüzünden 25 masanın hepsini harcamıştı. Masalar dağıtılmışsa artık kimseye
  // verilmemiş masalar sayılıyor. İleri tarihli günde hiçbir masa atanmamış olur; orada eski
  // kâğıt hesabı sürüyor, yoksa sayı hep salondaki masa sayısında kalırdı.
  const doluMasaIds = new Set(kapasiteliRows.flatMap((r) => rezMasalar[r.id] ?? []));
  const kalanHavuz = yerlesimMasalari.some((t) => doluMasaIds.has(t.id))
    ? yerlesimMasalari.filter((t) => !doluMasaIds.has(t.id))
      .reduce((h, t) => h.set(t.seat_count, (h.get(t.seat_count) ?? 0) + 1), new Map<number, number>())
    : gunTuketim.havuz;
  const kalanMasa = [...kalanHavuz.values()].reduce((s, n) => s + n, 0);
  const kullanilanMasa = yerlesimMasalari.length - kalanMasa;
  const yerlesenRez = gunGruplari.length - gunTuketim.yerlesemeyen.length;
  const birlesmeFazlasi = Math.max(0, kullanilanMasa - yerlesenRez);
  const etkinMasaSayisi = Math.max(0, yerlesimMasalari.length - birlesmeFazlasi);

  // FİX MENÜ — o gün fix alan rezervasyon ve kişi sayısı (Gökhan, 2026-08-18). İptal ve
  // gelmedi sayılmıyor; sayaçlarda kapasiteyi dolduran rezervasyonlarla aynı ölçü.
  // KAYDEDEN SÜTUNU sadece GENİŞ ekranda, yani sol menü kapalıyken görünüyor (Gökhan,
  // 2026-08-20: "sadece geniş ekranda görünsün yani sol menü kapalıyken").
  // Rezervasyonu kim aldı — geniş ekranda sol menü kapalıyken, tablette ise her zaman
  // görünüyor (Gökhan, 2026-08-30: "kaydeden yok burada, bu ekrana onu koy").
  const kaydedenGorunsun = satirListesi && (isMobile || menuKapali) && !dikeyTablet;
  // Kaydı kim aldı: personelse adı, işletme sahibiyse yetkili adı. Online formdan gelen
  // rezervasyonda kullanıcı yok — orada "Misafir" yazıyor.
  const kaydedenAdi = (r: Rez) => {
    if (!r.created_by) return r.source === "online" ? "Misafir" : "—";
    return kimAdlari[r.created_by] ?? "—";
  };

  const fixRows = kapasiteliRows.filter((r) => r.servis_tipi === "fix");
  const fixSayisi = fixRows.length;
  const fixPax = fixRows.reduce((s, r) => s + r.party_size, 0);
  // Masa dökümü — kaç kişilikten kaç tane, kaçı tutulmuş (Gökhan: "masaların karşısında da
  // şu kadarı dolu gösterilsin"). "Dolu" masanın anlık durumu değil, o günün rezervasyonları
  // dağıtıldığında harcanan masa sayısı — ileri tarihli günlerde masa henüz fiilen atanmamış
  // olsa da hesap doğru çıksın diye (bkz. masaPlan.ts).
  // DÖKÜM SADECE YEMEK SALONUNUN MASALARI (Gökhan, 2026-08-30: "5'te 28 kapasite 28 dolu
  // görünüyor, 6'da da biri benim rezervasyonum, diğer ikisi locadan"). Eskiden bütün masalar
  // sayılıyordu: gece salonundaki bistrolar 5 kişilik göründüğü için ayrı bir boy oluyor,
  // localar da 6 kişiliğe giriyordu. İkisi de kalan havuzunda olmadığı için hep "dolu"
  // çıkıyorlardı. Artık üstteki Masa ve Kapasite sayaçlarıyla aynı listeye bakıyor.
  const masaBoylari = [...new Set(yerlesimMasalari.map((t) => t.seat_count))].sort((a, b) => a - b);
  // Üstteki masa sayısıyla AYNI havuzdan okunuyor, iki sayı çelişmesin (masalar dağıtılmışsa
  // gerçekten boş masalar, dağıtılmamışsa kâğıt hesabı).
  const masaDagilim = masaBoylari.map((px) => {
    const adet = yerlesimMasalari.filter((t) => t.seat_count === px).length;
    return { px, adet, dolu: adet - (kalanHavuz.get(px) ?? 0) };
  });
  // Pax filtresinde çıkacak kişi sayıları — o gün gerçekten var olanlar, sabit liste değil.
  const paxSecenekleri = [...new Set(visibleRows.map((r) => r.party_size))].sort((a, b) => a - b);

  // SÜZGEÇ SEÇENEKLERİ (Gökhan, 2026-08-31: "açılan her kapasite filtreye düşmeli, bütün
  // ekranlarda"). Kaynağa göre süzenlerin altına o işletmede açık olan sınıflar ekleniyor:
  // yemek her zaman var, gece ve ayakta eğlence düzeni açıksa, loca ise loca masası varsa.
  // Tek yerde duruyor; bilgisayar, tablet ve telefon aynı listeyi kullanıyor.
  const suzgecSecenekleri = [
    { deger: "tumu", ad: "Tümü" },
    { deger: "rezervasyon", ad: "Rezervasyonlar" },
    { deger: "kapi", ad: "Kapı girişi" },
    { deger: "online", ad: "Online gelenler" },
    { deger: "gelmedi", ad: "Gelmediler" },
    { deger: "iptal", ad: "İptaller" },
    { deger: "s_yemek", ad: "Yemek" },
    ...(eglenceAktif ? [{ deger: "s_gece", ad: "Gece" }] : []),
    ...(eglenceAktif && ayaktaKapasite > 0 ? [{ deger: "s_ayakta", ad: "Ayakta" }] : []),
    ...(locaMasalari.length > 0 ? [{ deger: "s_loca", ad: "Loca" }] : []),
  ];

  // Arama — isim, telefon, masa adı, not — herhangi birine göre eşleşirse gösterilir
  // (Gökhan: "her kritere göre arama yapılabilsin").
  const aramaQ = arama.trim().toLocaleLowerCase("tr");
  const filtreliRows = visibleRows.filter((r) => {
    if (filtre === "tumu") { /* devam */ }
    else if (filtre === "gelmedi") { if (r.status !== "gelmedi") return false; }
    else if (filtre === "iptal") { if (r.status !== "iptal") return false; }
    else if (filtre === "rezervasyon" || filtre === "kapi" || filtre === "online") {
      if (!(r.source === filtre && r.status !== "iptal" && r.status !== "gelmedi")) return false;
    }
    // SINIF SÜZGEÇLERİ — "Yemek + gece" olan rezervasyon hem yemekte hem gecede görünüyor
    // (Gökhan, 2026-08-31: "geceyi seçtiğimde yemek artı gecedeki gece rezervasyonları da
    // görünsün"). Loca, masası locaysa ya da notunda loca yazıyorsa.
    else if (filtre === "s_yemek") { if (!(r.dilim === "yemek" || r.dilim === "yemek_gece")) return false; }
    else if (filtre === "s_gece") { if (!(r.dilim === "gece" || r.dilim === "yemek_gece")) return false; }
    else if (filtre === "s_ayakta") { if (!r.ayakta) return false; }
    else if (filtre === "s_loca") { if (!locaIsteyen(r)) return false; }
    if (paxFiltre !== null && r.party_size !== paxFiltre) return false;
    // Süzgeç sadece telefondaki garson ve PR'da açılabiliyor (bkz. kendiSuzgeci).
    if (sadeceBenim && kendiyeInilir && !benimRezMi(r)) return false;
    if (!aramaQ) return true;
    const masaAdi = tableName(r.table_id) ?? "";
    return (
      r.guest_name.toLocaleLowerCase("tr").includes(aramaQ)
      || (r.guest_phone ?? "").toLocaleLowerCase("tr").includes(aramaQ)
      || masaAdi.toLocaleLowerCase("tr").includes(aramaQ)
      || (r.note ?? "").toLocaleLowerCase("tr").includes(aramaQ)
    );
  });
  // Rezervasyon saati geldi ama masasında hâlâ önceki misafir oturuyorsa uyarı.
  // GEÇ KALAN MİSAFİR (Gökhan, 2026-08-13: "rezervasyon saati geldiğinde renk değiştirsin,
  // gerisine işletme karar versin, yanında geçen dakika yazsın"). Program kimseyi kendiliğinden
  // gelmedi yapmaz, masasını da almaz — sadece görünür kılar.
  const gecikmeDk = (r: Rez): number | null => {
    if (!bugunMu || r.status !== "bekleniyor" || r.yedek) return null;
    const dk = Math.floor((now - Date.parse(r.reserved_at)) / 60000);
    return dk >= 1 ? dk : null;
  };

  const masaHalaDolu = (r: Rez) =>
    bugunMu && Date.parse(r.reserved_at) <= now
    && !!r.table_id && (r.status === "bekleniyor" || r.status === "geldi")
    && tables.find((t) => t.id === r.table_id)?.status === "occupied";

  // Oturum çözülene kadar (ya da girişe yönlendirilene kadar) tek başına yükleniyor ekranı.
  if (!restaurantId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: "center", fontSize: 13.5, color: err ? "var(--danger)" : "var(--muted)", lineHeight: 1.6 }}>
          {err ?? "Yükleniyor…"}
        </div>
      </div>
    );
  }

  // İşletme adı + (varsa) şube değiştirici — masaüstünde sol menünün tepesinde, mobilde
  // üst satırda kullanılıyor. Tek yerde tanımlı, iki yere kopyalanmıyor.
  const isletmeBasligi = (boyut: number) => (
    subeler.length > 1 ? (
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setSubeSecimiAcik((v) => !v)}
          style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: boyut, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1.1 }}
        >
          {restaurantName}
          <ChevronDown size={boyut * 0.75} style={{ transform: subeSecimiAcik ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
        </button>
        {subeSecimiAcik && (
          <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, minWidth: 200, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)", overflow: "hidden", zIndex: 20, boxShadow: "0 4px 14px rgba(0,0,0,0.1)" }}>
            {subeler.map((s) => (
              <button
                key={s.id} onClick={() => subeDegistir(s.id)}
                style={{
                  all: "unset", cursor: "pointer", display: "block", width: "100%", padding: "8px 12px", boxSizing: "border-box",
                  fontSize: 13, color: s.id === restaurantId ? "var(--brand-strong)" : "var(--ink)",
                  background: s.id === restaurantId ? "var(--recede)" : "transparent",
                }}
              >
                {s.name}{(s.il || s.ilce) && <span style={{ color: "var(--muted-2)", fontSize: 11 }}> · {[s.il, s.ilce].filter(Boolean).join(" / ")}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    ) : (
      // İşletme adı kısalmaz, yer darsa sayfa adı kısalır (Gökhan, 2026-08-17).
      <div style={{ fontSize: boyut, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1.1, flexShrink: 0, whiteSpace: "nowrap" }}>
        {restaurantName}
      </div>
    )
  );

  // SAYAÇLAR TEK YERDE (Gökhan, 2026-08-30: "rezervasyon sayfasındaki üstteki
  // bilgileri buraya da getir"). Listenin üstünde yan yana, masa seçme ekranının sol
  // menüsünde alt alta çiziliyor — sayılar tek yerden geliyor, iki yerde ayrı hesap yok.
  // HER MASA KENDİ SAYACININ ALTINDA (Gökhan, 2026-08-30: "her masa kendi ait olduğu
  // başlığın altına alınsın; 2, 4, 6 yemeğe, 5 geceye, loca locaya"). Döküm tek satır halinde
  // en altta duruyordu, hangi masanın nereye ait olduğu görünmüyordu.
  const dokumSatiri = (parcalar: { ad: string; dolu: number; adet: number }[]) => (
    // Her masa türü kendi satırında, alt alta (Gökhan, 2026-08-30). Yan yana yazılıp
    // satır sonunda kırılıyordu, hangi boyun nerede bittiği okunmuyordu.
    <div style={{ fontSize: 11, paddingLeft: 39, display: "flex", flexDirection: "column", gap: 1 }}>
      {parcalar.map((m) => (
        <div key={m.ad}>
          {m.ad} <span className="tnum" style={{ fontWeight: 600, color: m.dolu >= m.adet ? "var(--gold-text)" : "var(--ink)" }}>{m.dolu}</span>
          <span className="tnum"> / {m.adet}</span>
        </div>
      ))}
    </div>
  );
  // adUstte: sayacın adı rakamların SOLUNDA değil ÜSTÜNDE durur — tablet başlığında dört
  // sayaç yan yana sığsın diye (Gökhan, 2026-08-30: "başlıklar RZV'lerin üstüne gelecek").
  const sayaclar = (dikey: boolean, adUstte = false) => (
    <div style={dikey
      ? { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, fontSize: 11.5, color: inkSoft, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }
      // Dar ekranda (yatay tablet) dört sayaç tek satıra sığmıyordu, üst üste biniyordu;
      // sığmayan alt satıra iniyor (Gökhan, 2026-08-30).
      // Adlar üstteyken sayaçlar dört sütun gibi yan yana duruyor; aralar dar olmazsa
      // tablet başlığına sığmıyorlar (ölçüldü: 594 piksel istiyor, 539 yer var).
      : { marginBottom: adUstte ? 0 : 10, flexShrink: 1, minWidth: 0, fontSize: adUstte ? 11.5 : 12.5, color: inkSoft, display: "flex", alignItems: adUstte ? "flex-start" : "center", gap: adUstte ? 10 : 28, flexWrap: "wrap", rowGap: 6 }}>
          {/* RZV/Masa ile Kapasite/Doluluk YAN YANA (Gökhan, 2026-08-30: "sol menüde rzv ve
              masanın karşısına kapasite ve doluluğu al") — gece sayacındaki düzenin aynısı.
              Üst barda görünüş değişmiyor: orada da aralarındaki boşluk 28. */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, width: dikey ? "100%" : undefined, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: adUstte ? "column" : "row", alignItems: adUstte ? "flex-start" : (dikey ? "center" : "baseline"), gap: adUstte ? 2 : (dikey ? 3 : 8), flexWrap: dikey ? "wrap" : "nowrap", maxWidth: "100%", minWidth: 0 }}>
          {/* Başında "Yemek" yazıyor (Gökhan, 2026-08-30: "oraya da gece ve locadaki gibi
              yemek yaz") — üç sayaç da aynı düzende: adı, RZV/masa, kapasite/doluluk. */}
          <span style={{ fontWeight: 600, color: "var(--ink)", minWidth: dikey ? 46 : undefined, textTransform: "uppercase" }} title="Yemek salonu. Geceye kalanlar buradan değil, gece sayacından düşer.">Yemek</span>
          <div style={{ display: "flex", alignItems: dikey ? "center" : "baseline", gap: dikey ? 3 : 12, flexWrap: dikey ? "wrap" : "nowrap", minWidth: 0 }}>
          {/* Rakamlar sağa yaslı ızgarada — son basamaklar tam alt alta (Gökhan, 2026-08-18).
              Başlık "RZV Masa" değil sadece "RZV".
              RZV = MASA TUTAN rezervasyon sayısı (Gökhan, 2026-08-18: "sadece geçerli
              rezervasyonlar görünecek, iptal görünemez, operasyon sırasında kafa karışır").
              Eskiden listedeki satır sayısıydı; iptal ve gelmediler de sayıldığı için masa
              sayısından fazla çıkıyordu. Artık iptal, gelmedi ve tamamlanan sayılmıyor;
              bekleyen ve yedek de masa tutmadığı için buraya girmiyor. */}
          <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(29px, auto) minmax(18px, auto)" : "auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
            <span>RZV</span>
            <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{kapasiteliRows.length}</span>
            {/* KALAN MASA (Gökhan, 2026-08-28: "alınan rezervasyon sayısına göre masa
                düşmeli, masa seçilmesi ayrı"). Program o günün rezervasyonlarını masalara
                dağıtıyormuş gibi hesaplıyor; masa henüz seçilmemiş olsa da tutacağı masa
                düşülüyor. Kişi sayısı bir masaya sığmıyorsa iki masa düşer. */}
            <span>Masa</span>
            <span
              className="tnum"
              title={`Kalan masa. ${yerlesimMasalari.length} masanın ${yerlesimMasalari.length - kalanMasa} tanesi o günün rezervasyonlarına gidiyor — masa seçilmemiş olsa da sayılıyor.`}
              style={{ fontWeight: 600, color: kalanMasa === 0 ? "var(--gold-text)" : "var(--ink)", textAlign: "right" }}
            >
              {kalanMasa}
            </span>
          </div>
          {/* Izgara: Kapasite ve Doluluk rakamları tam alt alta hizalı (Gökhan, 2026-08-15:
              "karşısındaki rakamlarda tam altlı üstlü olsun"). Etiket sütunu genişliğini
              uzun olan belirler, rakamlar sağa yaslı — basamaklar da üst üste gelir. */}
          <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(43px, auto) minmax(18px, auto) auto" : "auto auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
            <span {...(masaHesabi ? { title: "Masa hesabında kapasite koltuktan değil, masaların aldığı kişi sayısından çıkıyor." } : {})}>Kapasite</span>
            <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{toplamKapasite}</span>
            <span>pax</span>
            <span>Doluluk</span>
            <span className="tnum" style={{ fontWeight: 600, color: gunPax >= toplamKapasite ? "var(--gold-text)" : "var(--ink)", textAlign: "right" }}>{Math.min(gunPax, toplamKapasite)}</span>
            <span>
              pax
              {gunPax >= toplamKapasite && <span style={{ fontWeight: 600, color: "var(--gold-text)" }}> (dolu)</span>}
            </span>
          </div>
          </div>

          </div>
          {dikey && masaDagilim.length > 0 && dokumSatiri(masaDagilim.map((m) => ({ ad: `${m.px} pax`, dolu: m.dolu, adet: m.adet })))}
          </div>
          {/* GECE — bistro düzeninin kapasitesi (Gökhan, 2026-08-28: "gecenin kapasitesini
              göremiyorum"). Yemek kapasitesinden ayrı sayılıyor: geceye kalan misafirler
              buradan düşüyor. Bistrolar dolduğunda ayakta kapasitesi devreye giriyor, o da
              yanında yazıyor. Sadece restoran + eğlence işletmesinde çıkar. */}
          {eglenceAktif && (bistroSayisi > 0 || ayaktaKapasite > 0) && (
            // GECE SAYACI SALONUNKİYLE AYNI DÜZENDE (Gökhan, 2026-08-29: "aynı sistem olacak").
            // Solda RZV / bistro (salondaki RZV / Masa'nın karşılığı — bistro da kalanı
            // gösteriyor), yanında Kapasite / Doluluk. Kapasite bistro başına 5 kişi.
            <div style={{ display: "flex", flexDirection: "column", gap: 2, width: dikey ? "100%" : undefined, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: adUstte ? "column" : "row", alignItems: adUstte ? "flex-start" : (dikey ? "center" : "baseline"), gap: adUstte ? 2 : (dikey ? 3 : 8), flexWrap: dikey ? "wrap" : "nowrap", maxWidth: "100%", minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: "var(--ink)", minWidth: dikey ? 46 : undefined, textTransform: "uppercase" }} title="Gece salonundaki bistrolar. Geceye kalan misafirler buradan düşer; bir bistro en fazla beş kişi alır.">Gece</span>
            <div style={{ display: "flex", alignItems: dikey ? "center" : "baseline", gap: dikey ? 3 : 12, flexWrap: dikey ? "wrap" : "nowrap", minWidth: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(29px, auto) minmax(18px, auto)" : "auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
                <span>RZV</span>
                <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{geceRezSayisi}</span>
                <span>bistro</span>
                <span
                  className="tnum"
                  // Kalan bistro, ATANMIŞ değil İSTENEN üzerinden (2026-08-29): sayaçla
                  // rezervasyon alma kontrolü aynı sayıya baksın. Bistrosu henüz dağıtılmamış
                  // misafir de yerini tutuyor sayılır, yoksa sayaç "boş" derken program
                  // "yer yok" diyor.
                  title={`Kalan bistro. ${bistroSayisi} bistronun ${geceTalep} tanesi o gecenin misafirlerine gidiyor — bistro henüz dağıtılmamış olsa da sayılıyor.`}
                  style={{ fontWeight: 600, color: bistroSayisi - geceTalep <= 0 ? "var(--gold-text)" : "var(--ink)", textAlign: "right" }}
                >
                  {Math.max(0, bistroSayisi - geceTalep)}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(43px, auto) minmax(18px, auto) auto" : "auto auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
                {/* Kişi sınırı yoksa gecede kapasite diye bir şey yok — loca gibi (Gökhan,
                    2026-08-30). Üst satır boş ama satır yüksekliği kadar yer tutuyor ki
                    doluluk bistronun tam karşısına gelsin. */}
                {bistroKisi ? <span title={`Bistro başına ${bistroKisi} kişi.`}>Kapasite</span> : <span>{" "}</span>}
                {bistroKisi ? <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{geceKapasite}</span> : <span />}
                {bistroKisi ? <span>pax</span> : <span />}
                {/* "DOLU" İŞARETİ BİSTROYA BAKAR (Gökhan, 2026-08-29: "gecede pax doldu,
                    bistrolar hâlâ boş duruyor"). Kişi sayısı ile bistro adedi aynı şeyi
                    ölçmüyor: 2 kişilik grup koca bir bistroyu tutup sayaca 2 giriyor, 6
                    kişilik grup iki bistro tutup 6 giriyor. Yer bistroyla veriliyor, o yüzden
                    dolu olup olmadığına da bistro karar veriyor. Kişi sayısı bilgi olarak
                    yazılmaya devam ediyor. */}
                <span>Doluluk</span>
                <span className="tnum" style={{ fontWeight: 600, color: geceTalep >= bistroSayisi ? "var(--gold-text)" : "var(--ink)", textAlign: "right" }}>{gecePax}</span>
                <span>
                  pax
                  {bistroSayisi > 0 && geceTalep >= bistroSayisi && <span style={{ fontWeight: 600, color: "var(--gold-text)" }}> (dolu)</span>}
                </span>
              </div>
            </div>

            </div>
            {dikey && bistroSayisi > 0 && dokumSatiri([{ ad: bistroKisi ? `${bistroKisi} pax` : "bistro", dolu: Math.min(geceTalep, bistroSayisi), adet: bistroSayisi }])}
            </div>
          )}
          {/* AYAKTA KENDİ SINIFI (Gökhan, 2026-08-30: "ayaktada gece yemek gibi ayrı bir
              sınıf"). Gece sayacının içinde ufak bir ızgaraydı; artık Yemek/Gece/Loca ile
              aynı düzende kendi satırı var. Masası olmadığı için RZV'nin altında kalan
              masa değil KALAN KİŞİ yazıyor. Ayakta kapasitesi tanımlı değilse çıkmıyor. */}
          {eglenceAktif && ayaktaKapasite > 0 && (
            <div style={{ display: "flex", flexDirection: adUstte ? "column" : "row", alignItems: adUstte ? "flex-start" : (dikey ? "center" : "baseline"), gap: adUstte ? 2 : (dikey ? 3 : 8), flexWrap: dikey ? "wrap" : "nowrap", maxWidth: "100%", minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: "var(--ink)", minWidth: dikey ? 46 : undefined, textTransform: "uppercase" }} title="Bistrolar dolduğunda masasız alınan misafirler buradan düşer.">Ayakta</span>
            <div style={{ display: "flex", alignItems: dikey ? "center" : "baseline", gap: dikey ? 3 : 12, flexWrap: dikey ? "wrap" : "nowrap", minWidth: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(29px, auto) minmax(18px, auto)" : "auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
                <span>RZV</span>
                <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{ayaktaRezSayisi}</span>
                <span>pax</span>
                <span
                  className="tnum"
                  title={`Kalan ayakta yeri. ${ayaktaKapasite} kişilik yerin ${ayaktaPax} tanesi tutulmuş.`}
                  style={{ fontWeight: 600, color: ayaktaKapasite - ayaktaPax <= 0 ? "var(--gold-text)" : "var(--ink)", textAlign: "right" }}
                >
                  {Math.max(0, ayaktaKapasite - ayaktaPax)}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(43px, auto) minmax(18px, auto) auto" : "auto auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
                <span>Kapasite</span>
                <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{ayaktaKapasite}</span>
                <span>pax</span>
                <span>Doluluk</span>
                <span className="tnum" style={{ fontWeight: 600, color: ayaktaPax >= ayaktaKapasite ? "var(--gold-text)" : "var(--ink)", textAlign: "right" }}>{ayaktaPax}</span>
                <span>
                  pax
                  {ayaktaPax >= ayaktaKapasite && <span style={{ fontWeight: 600, color: "var(--gold-text)" }}> (dolu)</span>}
                </span>
              </div>
            </div>

            </div>
          )}
          {/* LOCA — kendi sayacında, kapasitenin yanında (Gökhan, 2026-08-24). Kapasite ve masa
              sayısına girmiyor: loca otomatik dağıtılmıyor, elle satılıyor. Locanın sabit kişi
              sayısı da yok, o yüzden burada koltuk yazmıyor — dolu ve pax ancak rezervasyon
              alındıkça görünüyor. Loca yoksa sayaç hiç çıkmaz. */}
          {locaMasalari.length > 0 && (
            // LOCA SAYACI DA AYNI DÜZENDE (Gökhan, 2026-08-29). Tek farkı kapasite satırı boş:
            // locanın sabit kişi sayısı yok, aynı locaya 2 kişi de girer 10 kişi de.
            <div style={{ display: "flex", flexDirection: "column", gap: 2, width: dikey ? "100%" : undefined, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: adUstte ? "column" : "row", alignItems: adUstte ? "flex-start" : (dikey ? "center" : "baseline"), gap: adUstte ? 2 : (dikey ? 3 : 8), flexWrap: dikey ? "wrap" : "nowrap", maxWidth: "100%", minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: "var(--ink)", minWidth: dikey ? 46 : undefined, textTransform: "uppercase" }} title="Locanın sabit kişi sayısı yok — aynı locaya 2 kişi de girer 10 kişi de. Bu yüzden kapasite yazılmıyor. Loca otomatik dağıtılmaz, elle verilir.">Loca</span>
            <div style={{ display: "flex", alignItems: dikey ? "center" : "baseline", gap: dikey ? 3 : 12, flexWrap: dikey ? "wrap" : "nowrap", minWidth: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(29px, auto) minmax(18px, auto)" : "auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
                <span>RZV</span>
                <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{locaRows.length}</span>
                <span>loca</span>
                <span
                  className="tnum"
                  title={`Kalan loca. ${locaMasalari.length} locanın ${doluLoca} tanesi tutulmuş.`}
                  style={{ fontWeight: 600, color: locaMasalari.length - doluLoca === 0 ? "var(--gold-text)" : "var(--ink)", textAlign: "right" }}
                >
                  {Math.max(0, locaMasalari.length - doluLoca)}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(43px, auto) minmax(18px, auto) auto" : "auto auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
                {/* Locada kapasite diye bir şey yok, üst satır boş kalıyor — ama satır
                    yüksekliği kadar yer tutuyor ki doluluk ikinci satırdaki locanın tam
                    karşısına gelsin (Gökhan, 2026-08-30). Boş span yer tutmuyordu. */}
                <span>{" "}</span>
                <span />
                <span />
                <span>Doluluk</span>
                <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{locaPax}</span>
                <span>pax</span>
              </div>
            </div>

            </div>
            {/* Locada kişi sayısı yazılmıyor — sadece kaç loca tutulmuş. */}
            {dikey && dokumSatiri([{ ad: "loca", dolu: doluLoca, adet: locaMasalari.length }])}
            </div>
          )}
          {/* MASA KAPASİTESİ — sınırı aşan rezervasyonun istediği ikinci masa buradan düşüyor;
              salona ayrıca masa çizilmiyor (Gökhan, 2026-08-24). Masa hesabı kapalıysa ya da
              kapasite girilmemişse satır hiç görünmez. */}
          {masaHesabi && masaStoguAdet > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(43px, auto) minmax(18px, auto) auto" : "auto auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
              <span title="Sınırı aşan rezervasyona verilen ikinci masa buradan düşer, salona ayrıca çizilmez. Bitince ikinci masa arka sıradan alınır ve o masa plandan kaybolur.">Kapasite</span>
              <span className="tnum" style={{ fontWeight: 600, color: kalanStok === 0 ? "var(--gold-text)" : "var(--ink)", textAlign: "right" }}>{kalanStok}</span>
              <span>masa{kullanilanStok > 0 ? ` (${kullanilanStok} kullanıldı)` : ""}</span>
            </div>
          )}
          {/* FİX MENÜ — o gün fix menü alan kaç rezervasyon, kaç kişi (Gökhan, 2026-08-18).
              Kimse almadıysa sıfır olarak duruyor, satır kaybolmuyor. Ayarlar'da fix menü
              KAPALIYSA satır hiç görünmüyor (Gökhan, 2026-08-19: "gece kulübü türündeyim,
              fix işaretli olmamasına rağmen yukarıda fix menü bilgisi var"). */}
          {fixAcik && (
            <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(43px, auto) minmax(18px, auto) auto" : "auto auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
              <span>Fix</span>
              <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{fixSayisi}</span>
              <span>rzv</span>
              <span />
              <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{fixPax}</span>
              <span>pax</span>
            </div>
          )}
          {/* BEKLEYEN — kapıda sıra bekleyenler (Gökhan, 2026-08-18). Masa tutmazlar,
              kapasiteye girmezler; buradaki sayı "kaç masa, kaç kişi bekliyor" demek. */}
          {bekleyenRows.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: dikey ? "minmax(43px, auto) minmax(18px, auto) auto" : "auto auto auto", columnGap: dikey ? 3 : 5, rowGap: 2, alignItems: "baseline", flexShrink: 0 }}>
              <span>Bekleyen</span>
              <span className="tnum" style={{ fontWeight: 600, color: "var(--gold-text)", textAlign: "right" }}>{bekleyenRows.length}</span>
              <span>masa</span>
              <span />
              <span className="tnum" style={{ fontWeight: 600, color: "var(--gold-text)", textAlign: "right" }}>{bekleyenPax}</span>
              <span>pax</span>
            </div>
          )}
          {/* Yedek sayacı buradan kaldırıldı (Gökhan, 2026-08-18): yedekler artık
              rezervasyon listesinin altında kendi listesinde duruyor, sayı orada görünüyor. */}
    </div>
  );

  // ÜST BÖLGE — kimlik, tarih, dört düğme ve (tablette) kapasiteler. Telefonda listenin
  // üst beyaz kutusuna giriyor, tablette olduğu yerde duruyor (Gökhan, 2026-08-31).
  const ustBolge = (
    <>
          {/* ÜST BÖLGE — solda kimlik, tarih, düğme ve arama; hemen yanında kapasite özeti
              (Gökhan, 2026-08-30: "ayrı bir kutu, satıra sığmaya çalışıp diğer satırların
              arasını açmayacak"). Özet satırların yanında duruyor, aralarına girmiyor ve
              sola yaslı — sağa itilmiyor. */}
          {/* Tablette üstteki kimlik ve düğmeler, alttaki satır kutusunun iç kenarıyla aynı
              hizada başlıyor (Gökhan, 2026-08-31): kutunun 10 piksel dolgusu + 1 piksel
              çizgisi kadar sol boşluk. */}
          <div ref={ustBolgeRef} style={{ display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginBottom: tabletDuzen ? 12 : 0, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <IsletmeRozeti restaurantId={restaurantId} />
            <div style={{ minWidth: 0 }}>
              {isletmeBasligi(17)}
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted)", lineHeight: 1.2, marginTop: 2 }}>Rezervasyon</div>
            </div>
            </div>
            {/* Tarih rozetin satırında (Gökhan, 2026-08-30). */}
            {satirListesi && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, width: "max-content" }}>
                <button onClick={() => gun && gunDegistir(gunKaydir(gun, -1))} aria-label="Önceki gün" style={{ ...navBtn, padding: 2 }}><ChevronLeft size={17} /></button>
                <DatePicker value={gun} onChange={gunDegistir} style={{ padding: "8px 10px" }} />
                <button onClick={() => gun && gunDegistir(gunKaydir(gun, 1))} aria-label="Sonraki gün" style={{ ...navBtn, padding: 2 }}><ChevronRight size={17} /></button>
                {!bugunMu && <button onClick={() => gunDegistir(bugunIstanbul())} style={btnGhost}>Bugün</button>}
              </div>
            )}
          </div>
          {/* Telefonda tarih, logonun hemen ALTINDA — sağdaki kapasiteler daha kalın
              olduğu için tarih onun yanındaki boşluğa giriyor (Gökhan, 2026-08-31). */}
          {/* Tarih kutusu kimlik satırının eni kadar; düğmeler yerinden oynamıyor
              (Gökhan, 2026-09-01). */}
          {!satirListesi && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, width: "100%" }}>
              <DatePicker value={gun} onChange={gunDegistir} style={{ padding: "8px 10px", flex: 1, minWidth: 0, justifyContent: "center" }} />
              {!bugunMu && <button onClick={() => gunDegistir(bugunIstanbul())} style={btnGhost}>Bugün</button>}
            </div>
          )}
          {/* Kayıt açan düğmeler rozetin altında yan yana: yeni rezervasyon, kapı girişi,
              online rezervasyon (Gökhan, 2026-08-30). Üçü de aynı boyda — en uzun yazı eni
              belirliyor, ötekiler ona yayılıyor. */}
          {satirListesi && (
            <div style={{ display: "flex", gap: TABLET_DUGME_ARA, flexShrink: 0, marginTop: 12, marginBottom: "calc(12px - 2mm)", alignItems: "stretch" }}>
              <button onClick={openNewRes} style={{ ...btnPrimary, minWidth: TABLET_DUGME_EN, padding: "0 12px", height: 41, justifyContent: "center", whiteSpace: "nowrap" }}><Plus size={14} /> Yeni rezervasyon</button>
              <button onClick={() => { setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setErr(null); setWDilim(simdiSaat() >= eglenceGecis ? "gece" : "yemek"); setWalkInOpen(true); }} style={{ ...btnPrimary, minWidth: TABLET_DUGME_EN, padding: "0 12px", height: 41, justifyContent: "center", whiteSpace: "nowrap" }}><Plus size={14} /> Kapı girişi</button>
              {durumYetkisi && (
                <button onClick={() => setOnlinePanel(true)} style={{ ...btnPrimary, minWidth: TABLET_DUGME_EN, padding: "0 12px", height: 41, justifyContent: "center", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  Online rezervasyon
                  {bekleyenBasvurular.length > 0 && (
                    <span className="tnum" style={{ fontWeight: 700 }}>{bekleyenBasvurular.length}</span>
                  )}
                </button>
              )}
            </div>
          )}
          {/* Arama kutusu düğmelerin altında; eni dikeyde üst bölgenin yarısı, yatayda
              onun da yarısı (Gökhan, 2026-08-30). */}
          {satirListesi && (
            <div style={{ display: "flex", gap: TABLET_DUGME_ARA, alignItems: "center", flexShrink: 0 }}>
              <AramaKutusu arama={arama} onArama={setArama} eni={TABLET_DUGME_EN * 2 + TABLET_DUGME_ARA} boy={41} />
              {/* Süzgeç online rezervasyonun altında (Gökhan, 2026-08-31). */}
              <SecimKutusu
                deger={filtre} onDegis={setFiltre} dar
                style={{ minWidth: TABLET_DUGME_EN, height: 41, fontSize: 13 }}
                secenekler={suzgecSecenekleri}
              />
            </div>
          )}
          </div>
          {/* Kapasiteler sağa yaslı; sağ kenarla arasında 1,5 cm kalıyor (Gökhan,
              2026-08-30). */}
          {/* TELEFONDA DÖRT DÜĞME (Gökhan, 2026-08-31: "logo satırına iki buton, altına da
              iki buton") — kapasitelerden boşalan yere ikişerli iki satır. Yazılar kısa,
              yoksa dar ekrana sığmıyorlar. */}
          {!satirListesi && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flex: 1, minWidth: 0 }}>
              <button onClick={openNewRes} style={{ ...btnPrimary, ...telDugme }}><Plus size={13} /> Yeni</button>
              {/* Kapı girişi durum yetkisi olanda ve halkla ilişkilerde (Gökhan, 2026-08-31:
                  "PR'de yeninin yanına kapı koy"). Öteki personelde çizilmiyor. */}
              {(durumYetkisi || rolum === "pr") && (
                <button
                  onClick={() => { setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setErr(null); setWDilim(simdiSaat() >= eglenceGecis ? "gece" : "yemek"); setWalkInOpen(true); }}
                  style={{ ...btnPrimary, ...telDugme }}
                >
                  <Plus size={13} /> Kapı
                </button>
              )}
              {/* Online yalnızca durum yetkisi olanda — personelde hiç çizilmiyor, yeri de
                  boş kalmıyor. */}
              {durumYetkisi ? (
                <button onClick={() => setOnlinePanel(true)} style={{ ...btnPrimary, ...telDugme, gap: 4 }}>
                  Online
                  {bekleyenBasvurular.length > 0 && (
                    <span className="tnum" style={{ fontWeight: 700 }}>{bekleyenBasvurular.length}</span>
                  )}
                </button>
              ) : null}
              {/* HALKLA İLİŞKİLERDE SÜZGEÇ YOK (Gökhan, 2026-08-31: "süzgeci kaldır, PR'de
                  altlarında RZV'ler ve RZV'lerim diye iki düğme olsun"). İki düğme listeyi
                  kendi aldığı rezervasyonlarla sınırlıyor. */}
              {rolum === "pr" ? (<>
                <button
                  onClick={() => setSadeceBenim(false)}
                  style={{
                    ...btnGhost, ...telDugme,
                    borderColor: sadeceBenim ? "var(--line-2)" : "var(--brand)",
                    color: sadeceBenim ? "var(--muted)" : "var(--brand)",
                    background: sadeceBenim ? "var(--card)" : "var(--recede)",
                    fontWeight: 600,
                  }}
                >
                  RZV&apos;ler
                </button>
                <button
                  onClick={() => setSadeceBenim(true)}
                  style={{
                    ...btnGhost, ...telDugme,
                    borderColor: sadeceBenim ? "var(--brand)" : "var(--line-2)",
                    color: sadeceBenim ? "var(--brand)" : "var(--muted)",
                    background: sadeceBenim ? "var(--recede)" : "var(--card)",
                    fontWeight: 600,
                  }}
                >
                  RZV&apos;lerim
                </button>
              </>) : (
                <SecimKutusu
                  deger={filtre} onDegis={setFiltre} dar
                  style={{ height: 38, fontSize: 12, minWidth: 0 }}
                  secenekler={suzgecSecenekleri}
                />
              )}
            </div>
          )}
          {/* Kapasiteler sağ üstte — şimdilik sadece tablette (Gökhan, 2026-08-31:
              "sağdaki kapasiteleri telefonda şimdilik kaldır"). */}
          {tabletDuzen && <div style={{ flex: 1 }} />}
          {tabletDuzen && (
          <div style={{ flexShrink: 0, boxSizing: "border-box", marginRight: "1.5cm" }}>
              <KisaOzet
                toplamMasa={kalanMasa} toplamKapasite={toplamKapasite} doluluk={Math.min(gunPax, toplamKapasite)}
                yemekRez={kapasiteliRows.length} geceRez={geceRezSayisi} ayaktaRez={ayaktaRezSayisi}
                masaAdet={etkinMasaSayisi} masaDolu={kullanilanMasa}
                yedekMasa={yedekRows.length} yedekPax={yedekPax}
                locaMasa={locaMasalari.length} locaPax={locaPax} locaIstendi={locaRows.length}
                eglenceAktif={eglenceAktif} geceKapasite={geceKapasite} gecePax={gecePax} bistroSayisi={bistroSayisi} geceTalep={geceTalep}
                ayaktaKapasite={ayaktaKapasite} ayaktaPax={ayaktaPax}
                bekleyenMasa={bekleyenRows.length} bekleyenPax={bekleyenPax}
                fixAcik={fixAcik} fixSayisi={fixSayisi} fixPax={fixPax}
              />
          </div>
          )}
          </div>
    </>
  );

  return (
    // Yan çevrilmişken nav yok — altta ona ayrılan yer de kalkıyor, kenar boşlukları da
    // kısılıyor ki liste kutusu ekranı sonuna kadar kullansın (Gökhan, 2026-08-10).
    // Yatayda alt menü çizilmiyor (bkz. RezervasyonAltNav) — altta ona yer ayırmak boş bir
    // şerit bırakıyordu. Sadece o pay kalkıyor, geri kalan düzen aynı.
    // TELEFONDA KENAR BOŞLUĞU YOK (Gökhan, 2026-08-18: "beyaz kutu telefon ekranında sağa
    // sola yaslansın, zaten yerimiz dar"). Sayfanın yan boşluğu kalkıyor, liste kutusu
    // ekranın iki kenarına dayanıyor; satırlar da o kadar genişliyor. Üstteki kimlik satırı
    // kenara yapışmasın diye kendi boşluğunu kendi veriyor.
    <div style={{ background: "var(--canvas)", padding: isMobile ? "20px 0" : "20px 24px", paddingBottom: yatayMobil ? 12 : (isMobile ? ALT_NAV_YUKSEKLIK + 16 : 24), height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}

      {/* REZERVASYON ALINAMIYOR PENCERESİ — sebebi ve ne yapılması gerektiğini birlikte
          söyler (Gökhan: "pencerede şunu şöyle yaparsan şu masa uygun olur uyarıları"). */}
      {uyari && (
        <>
          <div onClick={() => setUyari(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 90 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 91, width: "min(420px, 90vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 22, boxShadow: "0 18px 50px rgba(30,57,50,.18)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--danger)", marginBottom: 10 }}>{uyari.baslik}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 20 }}>
              {uyari.satirlar.map((s, i) => (
                <div key={i} style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.45 }}>{s}</div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setUyari(null)} style={{ border: "none", borderRadius: 10, padding: "9px 18px", background: "var(--brand-strong)", color: "#fff", fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}>Tamam</button>
            </div>
          </div>
        </>
      )}

      {/* Kendi başlığı — AIOS kabuğu (sol menü) bu programda yok. RZV rozeti + işletme adı
          aynı satırda (Gökhan, 2026-08-04: "rzv yaz yanında da işletme adı yazsın") —
          eskiden işletme adı "Rezervasyon" başlığının altında 13px soluk gri bir ek gibi
          duruyordu ("küçük ve soluk olması normal mi" — değildi). */}
      {/* Mobilde sarma kapalı — "· Rezervasyon" başlığı eklenince satır taşıp Çıkış düğmesi
          alta düşüyordu (Gökhan, 2026-08-08). Taşma olursa işletme adı kısalır (ellipsis),
          satır bölünmez. */}
      {/* Telefon yan çevrildiğinde bu satır hiç çizilmez — liste kutusu yukarı çıkar, ekrana
          daha çok rezervasyon satırı sığar (Gökhan, 2026-08-10). */}
      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0, padding: isMobile ? "0 14px" : undefined }}>{err}</div>}
      {capacityNotice && (
        <div style={{ fontSize: 12.5, color: "var(--gold-text)", background: "var(--recede)", border: "1px solid var(--gold)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, flexShrink: 0, marginLeft: isMobile ? 14 : undefined, marginRight: isMobile ? 14 : undefined }}>
          {capacityNotice}
        </div>
      )}

      {/* SOL MENÜ + LİSTE yan yana (Gökhan, 2026-08-15). Menü sabit — gizlenmiyor.
          Liste sağa sıkışıyor, daralma Not sütunundan oluyor (bkz. HeaderCell flex). */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: isMobile ? 0 : 12 }}>
      {/* MENÜ KAPALIYKEN — ince şerit: aç düğmesi, yeni rezervasyon ve kapı girişi
          (Gökhan, 2026-08-18: "kapalıyken de rezervasyon ekle görünür olmalı"). Listeye
          yaklaşık 180 piksel yer açılıyor. */}
      {!isMobile && menuKapali && (
        <aside style={{
          width: 46, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)",
          padding: "12px 6px", boxSizing: "border-box",
        }}>
          <button onClick={() => menuKapaliYaz(false)} aria-label="Menüyü aç" title="Menüyü aç" style={navBtn}>
            <ChevronRight size={19} />
          </button>
          <div style={{ height: 1, background: "var(--line)", alignSelf: "stretch" }} />
          {/* Yazısız, sadece simge — düğmelerin en az 2 cm kuralı buna işlemiyor, yoksa
              ince şeritte kutu gibi genişliyor (Gökhan, 2026-08-29). */}
          <button onClick={openNewRes} aria-label="Yeni rezervasyon" title="Yeni rezervasyon" style={{ ...btnPrimary, minWidth: 0, padding: 8, borderRadius: 12 }}>
            <Plus size={16} />
          </button>
          <button
            onClick={() => { setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setErr(null); setWDilim(simdiSaat() >= eglenceGecis ? "gece" : "yemek"); setWalkInOpen(true); }}
            aria-label="Kapı girişi" title="Kapı girişi"
            style={{ ...btnGhost, padding: 8, borderRadius: 12, display: "flex", justifyContent: "center" }}
          >
            <DoorOpen size={16} />
          </button>
          <div style={{ flex: 1 }} />
          <Link href="/rezervasyon/istatistikler" aria-label="İstatistikler" title="İstatistikler" style={{ ...navBtn, textDecoration: "none" }}><BarChart3 size={18} /></Link>
          <Link href="/rezervasyon/salon" aria-label="Salon" title="Salon" style={{ ...navBtn, textDecoration: "none" }}><LayoutGrid size={18} /></Link>
          <Link href="/rezervasyon/ayarlar" aria-label="Ayarlar" title="Ayarlar" style={{ ...navBtn, textDecoration: "none" }}><Settings size={18} /></Link>
        </aside>
      )}
      {!isMobile && !menuKapali && (
        <aside style={{
          width: 226, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
          border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)",
          padding: 12, boxSizing: "border-box", overflowY: "auto", overflowX: "hidden",
        }}>
          {/* En üstte RZV rozeti + işletme adı, hemen altında sayfa adı. Rozet aşağıdaki
              geçiş satırında da var — ikisi de duruyor (Gökhan, 2026-08-15). */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IsletmeRozeti restaurantId={restaurantId} />
            <div style={{ minWidth: 0, flex: 1 }}>
              {isletmeBasligi(17)}
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted)", lineHeight: 1.2, marginTop: 2 }}>Rezervasyon</div>
            </div>
            {/* Menüyü daralt — listeye yer açar, seçim hatırlanır (Gökhan, 2026-08-18). */}
            <button onClick={() => menuKapaliYaz(true)} aria-label="Menüyü daralt" title="Menüyü daralt" style={{ ...navBtn, padding: 4, flexShrink: 0 }}>
              <ChevronLeft size={18} />
            </button>
          </div>

          <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />

          {/* Diğer ekranlar — sayfa adının altındaki çizginin hemen altında (Gökhan,
              2026-08-15: "yan yana 4 butonumuzu sayfa adının altındaki çizginin altına al"). */}
          {/* Simge satırının ilk rozeti, üstteki isim satırının rozetiyle aynı hizada
              başlıyor (Gökhan, 2026-08-31). */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <RzvRozet />
            {/* Sıra: RZV, Salon, İstatistik, Ayarlar, Profil (Gökhan, 2026-08-30). */}
            <Link href="/rezervasyon/salon" aria-label="Salon" title="Salon" style={{ ...navBtn, textDecoration: "none" }}>
              <LayoutGrid size={19} />
            </Link>
            <Link href="/rezervasyon/istatistikler" aria-label="İstatistikler" title="İstatistikler" style={{ ...navBtn, textDecoration: "none" }}>
              <BarChart3 size={19} />
            </Link>
            <Link href="/rezervasyon/ayarlar" aria-label="Ayarlar" title="Ayarlar" style={{ ...navBtn, textDecoration: "none" }}>
              <Settings size={19} />
            </Link>
            {/* Çıkış simgesi kalktı, yerine Profilim geldi (Gökhan, 2026-08-30: "çıkış
                simgelerini kaldır, profilin içinde de var; rezervasyon ekranında profil
                simgesi yok"). Çıkış profil sayfasının içinde. */}
            <ProfilSimgesi />
          </div>
          <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />

          {/* Gün seçimi */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, -1))} aria-label="Önceki gün" style={{ ...navBtn, padding: 2 }}><ChevronLeft size={17} /></button>
            <DatePicker value={gun} onChange={gunDegistir} style={{ flex: 1, padding: "8px 8px", textAlign: "center" }} />
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, 1))} aria-label="Sonraki gün" style={{ ...navBtn, padding: 2 }}><ChevronRight size={17} /></button>
          </div>
          {!bugunMu && <button onClick={() => gunDegistir(bugunIstanbul())} style={{ ...btnGhost, width: "100%", boxSizing: "border-box", justifyContent: "center", display: "flex" }}>Bugün</button>}

          {/* SAYAÇLAR (Gökhan, 2026-08-31) — kayıt düğmeleri listenin üstüne çıktı, günün
              sayaçları onların yerine indi; masa seçme ekranındaki dikey düzenin aynısı. */}
          <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />
          {/* Başlıklar RZV satırlarının üstünde (Gökhan, 2026-08-31). */}
          {sayaclar(true, true)}
          <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />

          {/* Gün bitince açıkta kalan her kaydı toplu kapatır — ileri tarihli günde anlamsız. */}
          {gun <= bugunIstanbul() && acikKayitlar.length > 0 && (
            <button onClick={gunuKapat} disabled={busy} style={{ ...btnGhost, width: "100%", boxSizing: "border-box", justifyContent: "center", display: "flex", opacity: busy ? 0.5 : 1 }}>Günü kapat</button>
          )}
        </aside>
      )}

      {/* Yatayda kutunun iç boşluğu da kısılıyor — ekran yüksekliği yarıya inince 18px'lik
          dolgu iki rezervasyon satırı kadar yer yiyor (Gökhan, 2026-08-10). */}
      {/* TABLETTE BEYAZ KUTU SADECE SATIRLARI KAPSIYOR (Gökhan, 2026-08-31): üstteki
          kimlik, düğmeler, sayaçlar, arama ve sütun başlıkları kutunun dışında kalıyor;
          liste büyüdükçe kayma kutunun içinde oluyor. Telefon ve web değişmiyor. */}
      {/* WEBDE İKİ BEYAZ KUTU (Gökhan, 2026-08-31): üstte düğmeler ve sütun başlıkları,
          altta sadece rezervasyon satırları. Dış kap şeffaf. */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* KİMLİK SATIRI KUTUNUN İÇİNDE (Gökhan, 2026-08-30: "beyaz kutunun içine girecek
            hem mobilde hem tablette"). Görünüşü webdeki sol menünün tepesiyle aynı: rozet,
            yanında işletme adı, altında sayfa adı. Sağdaki profil simgesi kalktı — profile
            alt şeritten gidiliyor. Tarih tablette adın yanında, telefonda altında. */}
        {isMobile && (
          <MobilRezervasyonListesi
            sadeceBaslik={satirListesi}
            tarihiGizle={satirListesi || !yatayMobil}
            aramayiGizle={satirListesi}
            ozetiGizle
            ustIcerik={!tabletDuzen ? ustBolge : null}
            rows={filtreliRows}
            // Sayaçlar webdekiyle aynı değerlerden besleniyor (Gökhan, 2026-08-19) — hesap
            // tek yerde, iki görünüm de aynı rakamı gösteriyor.
            toplamMasa={kalanMasa}
            yemekRez={kapasiteliRows.length}
            geceRez={geceRezSayisi}
            ayaktaRez={ayaktaRezSayisi}
            masaAdet={etkinMasaSayisi}
            masaDolu={kullanilanMasa}
            toplamKapasite={toplamKapasite}
            doluluk={Math.min(gunPax, toplamKapasite)}
            yedekMasa={yedekRows.length}
            yedekPax={yedekPax}
            eglenceAktif={eglenceAktif}
            geceKapasite={geceKapasite}
            gecePax={gecePax}
            bistroSayisi={bistroSayisi}
            geceTalep={geceTalep}
            ayaktaKapasite={ayaktaKapasite}
            ayaktaPax={ayaktaPax}
            locaMasa={locaMasalari.length}
            locaPax={locaPax}
            locaIstendi={locaRows.length}
            bekleyenMasa={bekleyenRows.length}
            bekleyenPax={bekleyenPax}
            fixAcik={fixAcik}
            fixSayisi={fixSayisi}
            fixPax={fixPax}
            // Mutfak şefinde masa yerine fix/alakart (Gökhan, 2026-08-17). Masanın yanına
            // eklenen "· Fix" kaldırıldı (Gökhan, 2026-08-18): webde fix bilgisi ismin
            // altında duruyor, telefon düzeni ayrıca ele alınacak.
            // Masa kutusu webdekiyle aynı hesaptan besleniyor (Gökhan, 2026-08-19): esas
            // masa önce, birleşenler "+N" olarak, yetersizse uyarı. Mutfak şefinde masa
            // yerine fix/alakart yazıyor (Gökhan, 2026-08-17).
            masaBilgi={(r) => {
              if (mutfakGorunumu) return { ad: servisEtiketi(r), ekstra: 0, yetersiz: false };
              const buRez = rezMasalar[r.id] ?? [];
              let sirali = [r.table_id, ...buRez.filter((id) => id !== r.table_id)].filter(Boolean) as string[];
              // Web ile aynı kural (Gökhan, 2026-08-27): o anki düzenin masası yazar, geldi
              // denmesinden yarım saat sonra sıradaki masaya döner.
              if (eglenceAktif && r.dilim) {
                const geceler = sirali.filter((id) => geceMasaIds.has(id));
                const yemekler = sirali.filter((id) => !geceMasaIds.has(id));
                if (r.dilim === "gece") sirali = geceler;
                else if (r.dilim === "yemek") sirali = yemekler;
                else {
                  // Yemek + gece: yemek masası duruyorsa o yazar; "Bistroya geç"e basılıp
                  // yemek masası bırakılınca bistro yazar (Gökhan, 2026-08-28). Saate göre
                  // kendiliğinden değişen eski kural kalktı — yazan, gerçekten olan olsun.
                  sirali = yemekler.length > 0 ? yemekler : geceler;
                }
              }
              const adlar = sirali.map((id) => tableName(id)).filter(Boolean) as string[];
              if (adlar.length === 0) return eglenceAktif && r.ayakta ? { ad: "Ayakta", ekstra: 0, yetersiz: false } : null;
              return { ad: adlar[0], ekstra: adlar.length - 1, yetersiz: masaYetersiz(r) };
            }}
            gun={gun}
            bugunMu={bugunMu}
            onGunDegistir={gunDegistir}
            onYeniRezervasyon={openNewRes}
            onKartAc={(r) => setKartFor(r)}
            acilir={kartAcilir}
            onKilit={kilitDegistir}
            arama={arama}
            onArama={setArama}
            yatay={yatayMobil}
            kendiSuzgeci={kendiSuzgeci}
            kendiEtiketi={kendiEtiketi}
            // Hesabı PR kendi masası kalktıktan sonra yazıyor (Gökhan, 2026-08-19).
            tutarGirilir={(r) => rolum === "pr" && r.status === "tamamlandi" && benimRezMi(r)}
            onTutar={tutarKaydet}
            benimMi={benimRezMi}
            sadeceBenim={sadeceBenim}
            onSadeceBenim={setSadeceBenim}
          />
        )}
        {satirListesi && (
        <>
        {/* Kontroller sol menüye taşındı (Gökhan, 2026-08-15) — listenin üstü sadece
            sayaçlara kaldı. Tablette bu sayaçlar üst barda zaten var, burada tekrar
            yazılmıyor (Gökhan, 2026-08-30). */}

        {/* Gün tek havuz — öğle/akşam ayrımı yok, tek satır (Gökhan: "sadece akşamı baz
            alacağız"). Kapasite + hangi boydan kaç masa tutulmuş. */}
        {/* Mobildeki düzenin aynısı (Gökhan, 2026-08-08: "mobilde uyguladıklarımızın
            aynılarını webe de uyarlıyorsun değil mi"): tek satırlık eski gösterim yerine
            RZV Masa / Masa ve Kapasite / Doluluk altlı üstlü iki blok, yanında masa dökümü. */}
        {/* LİSTENİN ÜSTÜ (Gökhan, 2026-08-31: "sıralama arama - yeni rez - kapı - online").
            Sayaçlar sol menüye indi; bu satırda arama kalan yeri dolduruyor, kayıt düğmeleri
            sağda yan yana. */}
        {/* ÜST BEYAZ KUTU — bilgisayarda düğmeler ve başlıklar, tablette bunlara ek olarak
            kimlik, tarih, düğmeler ve kapasiteler (Gökhan, 2026-08-31: "üstte kutu yok"). */}
        <div style={!isMobile || tabletDuzen
          // Başlıkların altı ile kutunun alt çizgisi arasında 1 mm (Gökhan, 2026-08-31);
          // başlık satırının kendi 8 piksellik alt boşluğu bu ölçüden düşülüyor.
          ? { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: tabletDuzen ? "12px 12px 0" : "12px 18px", paddingBottom: 0, marginBottom: "1mm", flexShrink: 0, display: "flex", flexDirection: "column", boxSizing: "border-box" }
          : { display: "contents" }}>
        {tabletDuzen && ustBolge}
        {/* Kutu küçülmesin, başlıklar aşağı insin (Gökhan, 2026-08-31): alttan kısılan
            boşluk düğme satırının altına eklendi. */}
        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5cm", flexShrink: 0, marginBottom: 26 }}>
            {/* Düğmeler sola yaslı; arama kalan boşluğun tamamını alıyor (Gökhan,
                2026-08-31). */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <AramaKutusu arama={arama} onArama={setArama} />
            </div>
            {/* Üçü de aynı ende, araları yarım cm (Gökhan, 2026-08-31). */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5cm", flexShrink: 0 }}>
            <button onClick={openNewRes} style={{ ...btnPrimary, ...ustSatirDugme, ...ustSatirYesil }}><Plus size={14} /> Yeni rezervasyon</button>
            <button onClick={() => { setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setErr(null); setWDilim(simdiSaat() >= eglenceGecis ? "gece" : "yemek"); setWalkInOpen(true); }} style={{ ...btnPrimary, ...ustSatirDugme, ...ustSatirYesil }}><Plus size={14} /> Kapı girişi</button>
            {durumYetkisi && (
              <button onClick={() => setOnlinePanel(true)} style={{ ...btnPrimary, ...ustSatirDugme, ...ustSatirYesil, gap: 6 }}>
                Online rezervasyon
                {bekleyenBasvurular.length > 0 && (
                  <span className="tnum" style={{ fontWeight: 700 }}>{bekleyenBasvurular.length}</span>
                )}
              </button>
            )}
            {/* Süzgeç de aynı sırada (Gökhan, 2026-08-31). */}
            <SecimKutusu
              deger={filtre} onDegis={setFiltre} dar style={{ ...ustSatirDugme, fontSize: 13 }}
              secenekler={suzgecSecenekleri}
            />
            </div>
          </div>
        )}

        {/* BAŞLIK SATIRI — sütun genişlikleri SUTUN tablosundan geliyor, satırlarla birebir
            aynı. Aralardaki çizgi de aynı tablodaki AYRAC yuvasında, iki kolonun tam
            ortasında duruyor (Gökhan, 2026-08-18). */}
        {/* Tablette arama kutusu ile sütun başlıkları birbirine yapışıyordu; arayı 2 mm
            açan boşluk (Gökhan, 2026-08-30). */}
        {isMobile && <div style={{ height: "2mm", flexShrink: 0 }} />}
        {/* Başlık satırının kendi 8 piksellik alt boşluğu 1 mm'ye çekiliyor (Gökhan,
            2026-08-31: "1 mm kalsın") — mobilde eskisi gibi. */}
        <div style={
          !isMobile ? { marginBottom: "calc(1mm - 8px)" }
          // Tablette başlıklar kutunun dışında; satırlarla aynı hizada dursunlar diye
          // kutunun dolgusu kadar içeriden başlıyorlar (Gökhan, 2026-08-31).
          : tabletDuzen ? { marginBottom: "calc(1mm - 8px)" }
          : { display: "contents" }
        }>
        <ListHeader gap={0}>
          <HeaderCell width={SUTUN.sn} align="center">SN</HeaderCell>
          <RowSep genislik={AYRAC} />
          {/* Başlık "Saat" — telefondakiyle aynı (Gökhan, 2026-08-31). */}
          <HeaderCell width={SUTUN.zaman} align="center">Saat</HeaderCell>
          <RowSep genislik={AYRAC} />
          <HeaderCell width={SUTUN.misafir}>Misafir</HeaderCell>
          <RowSep genislik={AYRAC} />
          <HeaderCell width={SUTUN.telefon} align="center">Telefon</HeaderCell>
          <RowSep genislik={AYRAC} />
          <HeaderCell width={SUTUN.pax} align="center">
            {/* Kişi sayısına göre süzme — başlığın kendisi düğme (Gökhan: "paxa filtre koyalım"). */}
            <button
              onClick={(e) => setPaxFiltreKonum(menuKonum(e.currentTarget.getBoundingClientRect()))}
              title="Kişi sayısına göre filtrele"
              style={{ all: "unset", cursor: "pointer", fontSize: 12.5, fontWeight: 700, letterSpacing: 0.4, color: paxFiltre !== null ? "var(--brand-strong)" : "var(--ink)" }}
            >
              PAX{paxFiltre !== null ? ` ${paxFiltre}` : ""}
            </button>
          </HeaderCell>
          <RowSep genislik={AYRAC} />
          {/* GELEN — pax'ın yanında, aynı biçimde (Gökhan, 2026-08-24). PAX rezervasyonda
              SÖYLENEN sayı, GELEN kapıda gerçekleşen. */}
          <HeaderCell width={SUTUN.gelen} align="center">GELEN</HeaderCell>
          <RowSep genislik={AYRAC} />
          {/* Başlık, masa kutusunun ortasında: satırda kutunun yanında kilit için ayrılan
              yer kadar boşluk burada da bırakılıyor, hiza kendiliğinden tutuyor. */}
          <HeaderCell width={SUTUN.masa} align="center" paddingRight={KILIT_YERI}>
            {mutfakGorunumu ? "Servis" : "Masa"}
          </HeaderCell>
          <RowSep genislik={AYRAC} />
          {/* KAYDEDEN — rezervasyonu kim aldı (Gökhan, 2026-08-20: "sadece rezervasyon satırına
              kimin aldığını koyalım, nottan önce bir satır yap"). Yalnızca GENİŞ ekranda, yani
              sol menü kapalıyken görünüyor; menü açıkken yer dar, sütun gizleniyor. */}
          {kaydedenGorunsun && (
            <>
              <HeaderCell width={SUTUN.kaydeden} align="center">Rez. alan</HeaderCell>
              <RowSep genislik={AYRAC} />
            </>
          )}
          {/* NOT sütunu ESNEK — yer daraldığında daralma buradan olur (Gökhan, 2026-08-15:
              "daraltmayı not alanından yap"). Diğer sütunlar sabit kalır. */}
          {!dikeyTablet && <HeaderCell flex enFazla={SUTUN.notEnFazla}>Not</HeaderCell>}
          <Spacer />
          <RowSep genislik={AYRAC} />
          {/* Başlık, düğmelerin kapladığı alanın (DURUM_ALANI) tam ortasında: düğmeler de
              başlık da sağa yaslı ve kenarda aynı boşluğu bırakıyor. */}
          <HeaderCell width={SUTUN.durum} align="right" paddingRight={DURUM_KENAR}>
            <span style={{ display: "inline-block", width: DURUM_ALANI, textAlign: "center" }}>RZV durumu</span>
          </HeaderCell>
        </ListHeader>
        </div>
        </div>

        {/* Kaydırma çubuğu gizli — göründüğünde satırlardan ~15px yer çalıyor, başlıklar
            (çubuğun dışında kaldıkları için) alttaki düğmelere göre sağa kaymış görünüyordu
            (Gökhan: "rezervasyon durumu yazısı ortalanmamış"). Fare tekerleği/parmakla kayar. */}
        <div style={tabletDuzen || !isMobile
          ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: isMobile ? 10 : 18, boxSizing: "border-box" }
          : { display: "contents" }}>
        <div ref={listeKaydirRef} style={{ flex: 1, overflowY: "auto", overflowX: isMobile ? "auto" : "hidden", minHeight: 0, scrollbarWidth: "none" }}>
          {/* BEKLEYENLER — listenin en üstünde ayrı blok (Gökhan, 2026-08-18). Sıraya giriş
              saatine göre dizili: en uzun bekleyen en üstte. Rezervasyon satırlarına
              karışmıyorlar; masa tutmadıkları için masa sütunları da yok. */}
          {bekleyenRows.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--gold-text)", padding: "0 0 4px" }}>
                Bekleyenler
              </div>
              {bekleyenRows.map((r, i) => {
                const bekledi = r.bekleme_baslangic
                  ? Math.max(0, Math.round((now - new Date(r.bekleme_baslangic).getTime()) / 60000))
                  : null;
                // Masası elle seçilmişse o, değilse sığan en küçük boş masa önerilir.
                const secilenMasa = (rezMasalar[r.id] ?? []).map((id) => tableName(id)).filter(Boolean).join(" + ");
                const onerilen = secilenMasa ? null : oneriMasa(r.party_size, r.dilim);
                return (
                  <ListRow
                    key={r.id} yukseklik={41} gap={0} bg="var(--tan-300)"
                    // Bekleyenler listesinde de sağ tıkla silme (Gökhan, 2026-08-29) —
                    // rezervasyon ve yedek satırlarında vardı, burada yoktu.
                    onContextMenu={silmeHakkim ? (e) => { e.preventDefault(); setSilMenu({ rez: r, x: e.clientX, y: e.clientY }); } : undefined}
                  >
                    <Cell width={SUTUN.sn} align="center">
                      <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{i + 1}</span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    {/* Sıraya giriş saati, altında ne kadar beklediği (Gökhan, 2026-08-18) —
                        masa sütunu masa seçmeye ayrıldı. 30 dakikayı geçen bekleme kırmızı. */}
                    <Cell width={SUTUN.zaman} align="center">
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 }}>
                        <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                          {r.bekleme_baslangic ? saat(r.bekleme_baslangic) : "—"}
                        </span>
                        {bekledi !== null && (
                          <span className="tnum" style={{ fontSize: 9.5, fontWeight: 600, color: bekledi >= 30 ? "var(--danger)" : inkSoft }}>
                            {bekledi < 60 ? `${bekledi} dk` : `${Math.floor(bekledi / 60)}s ${bekledi % 60}dk`}
                          </span>
                        )}
                      </div>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    <Cell width={SUTUN.misafir}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{r.guest_name}</span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    <Cell width={SUTUN.telefon} align="center">
                      <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.guest_phone || "—"}</span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    <Cell width={SUTUN.pax} align="center">
                      <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.party_size}</span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    {/* Bekleyen henüz gelmiş sayılmıyor — Gelen sütunu boş, hizayı bozmasın
                        diye hücre yine de çiziliyor. */}
                    <Cell width={SUTUN.gelen} align="center">
                      <span style={{ fontSize: 12.5, color: inkSoft }}>—</span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    {/* MASA SEÇME — bekleyene buradan masa seçilip oturtuluyor (Gökhan,
                        2026-08-18: "oradan masa seçip oturt dememiz gerekiyor"). Kutu normal
                        satırlarla aynı ölçüde; masa seçilince adı yazıyor. */}
                    <Cell width={SUTUN.masa} align="center">
                      <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                        {assigningId === r.id ? (
                          <span style={{ ...hucreKutu, flex: 1, minWidth: 0 }}>Masa seç…</span>
                        ) : (
                          <button
                            onClick={() => { setMasaSecimi(rezMasalar[r.id] ?? []); setAssigningId(r.id); }}
                            title={secilenMasa ? undefined : onerilen ? `${onerilen.name} boşaldı — Oturt deyince bu masaya geçer. Başka masa seçmek için tıkla.` : "Sığan boş masa yok"}
                            style={{
                              ...hucreKutuBtn, flex: 1, minWidth: 0,
                              // Önerilen masa soluk yazılıyor: henüz atanmadı, sadece uygun olan bu.
                              ...(secilenMasa ? {} : onerilen ? { color: "var(--brand-strong)", borderStyle: "dashed" } : {}),
                            }}
                          >
                            {secilenMasa || (onerilen ? onerilen.name : "Masa seç")}
                          </button>
                        )}
                        <span style={{ width: KILIT_YERI - 4, flexShrink: 0 }} />
                      </div>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    {kaydedenGorunsun && (
                      <>
                        <Cell width={SUTUN.kaydeden} align="center">
                          <span style={{ fontSize: 12, color: inkSoft, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {kaydedenAdi(r)}
                          </span>
                        </Cell>
                        <RowSep genislik={AYRAC} />
                      </>
                    )}
                    {!dikeyTablet && (
                    <Cell flex enFazla={SUTUN.notEnFazla}>
                      <span style={{ fontSize: 12, color: inkSoft, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.note || "—"}
                      </span>
                    </Cell>
                    )}
                    <Spacer />
                    <RowSep genislik={AYRAC} />
                    <ActionsCell width={SUTUN.durum} align="right" gap={0} paddingRight={DURUM_KENAR}>
                      {durumYetkisi && (
                        <>
                          <button
                            onClick={() => (onerilen ? bekleyeniBosalanMasayaOturt(r, [onerilen.id]) : bekleyeniOturt(r))}
                            disabled={busy || (!onerilen && !r.table_id)}
                            title={!onerilen && !r.table_id ? "Sığan boş masa yok" : onerilen ? `${onerilen.name} masasına oturt` : "Masaya oturt"}
                            style={{ ...btnSmallRow, opacity: busy || (!onerilen && !r.table_id) ? 0.5 : 1 }}
                          >
                            Oturt
                          </button>
                          <button onClick={() => bekleyenVazgecti(r)} style={btnGhostRow}>Vazgeçti</button>
                        </>
                      )}
                    </ActionsCell>
                  </ListRow>
                );
              })}
            </div>
          )}
          {filtreliRows.length === 0 && (
            <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>
              {visibleRows.length === 0 ? "Bu gün için kayıt yok." : "Bu filtreye uyan kayıt yok."}
            </div>
          )}
          {filtreliRows.map((r, i) => {
            const info = DURUM_INFO[r.status] ?? DURUM_INFO.bekleniyor;
            const canli = r.status === "geldi";
            const aktif = r.status === "bekleniyor" || r.status === "geldi";
            const doluUyari = masaHalaDolu(r);
            const gecikti = gecikmeDk(r);
            // BU rezervasyona bağlı masa adları (masa birleştirme) — hücrede gösterilir.
            const buRezMasalari = rezMasalar[r.id] ?? [];
            const masaAdi = buRezMasalari.map((id) => tableName(id)).filter(Boolean).join(" + ") || tableName(r.table_id);
            // ESAS MASA ÖNCE — yerinde sabit duran masa (r.table_id) listenin başında, kutuda
            // yazan da o; diğerleri fare kutunun üzerine gelince alt alta (Gökhan, 2026-08-18).
            let masaSirasi = [r.table_id, ...buRezMasalari.filter((id) => id !== r.table_id)].filter(Boolean) as string[];
            // RESTORAN + EĞLENCE: iki masalı misafirde sütun o anki düzenin masasını yazar.
            // Geldi denmesinden yarım saat sonra sıradaki masaya döner (Gökhan, 2026-08-27:
            // "geldi dedikten sonra yarım saat aynı masa kalsın, sonra bir sonraki masası").
            if (eglenceAktif && r.dilim) {
              const geceler = masaSirasi.filter((id) => geceMasaIds.has(id));
              const yemekler = masaSirasi.filter((id) => !geceMasaIds.has(id));
              if (r.dilim === "gece") masaSirasi = geceler;
              else if (r.dilim === "yemek") masaSirasi = yemekler;
              else {
                // Yemek + gece: yemek masası duruyorsa o yazar; "Bistroya geç"e basılıp yemek
                // masası bırakılınca bistro yazar (Gökhan, 2026-08-28).
                masaSirasi = yemekler.length > 0 ? yemekler : geceler;
              }
            }
            const masaAdlari = masaSirasi.map((id) => tableName(id)).filter(Boolean) as string[];
            // Ayakta misafirin masası yok ve olmayacak — kutuda "Ayakta" yazar.
            if (eglenceAktif && r.ayakta && masaAdlari.length === 0) masaAdlari.push("Ayakta");
            const anaMasaAdi = masaAdlari[0] ?? "";
            // Atanmış masa kişiyi karşılamıyorsa tekrar tıklamak EKLEMEK içindir (10 kişiye
            // 4 kişilik masa seçilmiş, üstüne masa eklenecek); karşılıyorsa DEĞİŞTİRMEK
            // içindir (Gökhan: "4 kişilik rezervasyona 4 kişilik masa seçtin, tekrar
            // tıklarsan bu değiştirmek içindir") — o yüzden seçim sıfırdan başlar.
            const buRezKisi = buRezMasalari.reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
            const masaEksik = buRezKisi < r.party_size;
            return (
              // Satır 3 mm alçalmıştı, ismin altına Fix yazısı girince alttan 2 mm
              // genişledi (Gökhan, 2026-08-18): 33 + 2mm ≈ 41 px.
              <ListRow
                key={r.id} yukseklik={41} gap={0}
                bg={gecikti !== null ? "var(--tan-300)" : info.bg}
                muted={r.status === "gelmedi" || r.status === "iptal"}
                // Sağ tık: rezervasyonu silme menüsü (Gökhan, 2026-08-29). Yetkisi yoksa
                // tarayıcının kendi menüsü açılsın diye hiç karışmıyoruz.
                onContextMenu={silmeHakkim ? (e) => { e.preventDefault(); setSilMenu({ rez: r, x: e.clientX, y: e.clientY }); } : undefined}
              >
                <Cell width={SUTUN.sn} align="center">
                  <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{i + 1}</span>
                </Cell>
                <RowSep genislik={AYRAC} />
                {/* OTURANDA SAATİN YERİNE SÜRE (Gökhan, 2026-08-18: "rezervasyon saatinin
                    yerine koyalım"). Misafir masaya geçtiği an bu sütun ne kadardır oturduğunu
                    gösteriyor; rezervasyon saati üzerine gelince yazıyor. Diğer durumlarda
                    saat eskisi gibi, tıklayınca değiştirilebiliyor. */}
                <Cell width={SUTUN.zaman} align="center">
                  <button
                    onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "saat")}
                    title={r.status === "oturdu" && r.seated_at ? `Rezervasyon saati ${saat(r.reserved_at)} — ${saat(r.seated_at)}'de oturdu` : undefined}
                    style={{ ...hucreYaziBtn, fontSize: 13, fontWeight: 600, color: "var(--ink-green)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {r.status === "oturdu" && r.seated_at ? bekleyenSure(r.seated_at, now) : saat(r.reserved_at)}
                  </button>
                </Cell>
                <RowSep genislik={AYRAC} />
                <Cell width={SUTUN.misafir}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {/* İnsan işareti ismin BAŞINDA (Gökhan: "isimlerin sonundaki insan
                        işaretini başına alalım"). Telefon olmasa da kişi kartı açılır
                        (Gökhan: "rezervasyon alınan herkese kişi kartı açılacak") — telefon
                        varsa numarayla, yoksa isimle geçmiş gösterilir. */}
                    {/* Garson, PR ve salon şefi sadece kendi girdiği rezervasyonda kartı
                        açabilir (Gökhan, 2026-08-17) — başkasınınkinde işaret hiç çıkmaz. */}
                    {kartAcilir(r) && (
                      <button onClick={() => setKartFor(r)} title="Kişi kartı" aria-label="Kişi kartı" style={{ all: "unset", cursor: "pointer", display: "inline-flex", color: inkSoft, flexShrink: 0 }}>
                        <User size={12} />
                      </button>
                    )}
                    <EditableText
                      value={r.guest_name}
                      onSave={(next) => updateField(r, { guest_name: toTitleTr(next) })}
                      style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    />
                    {/* TEYİT — misafir "Geliyorum" dediyse ismin yanında küçük yeşil işaret
                        (Gökhan, 2026-08-18). Teyit soruldu ama cevap yoksa soluk saat işareti. */}
                    {r.teyit_durumu === "geliyor" && (
                      <span
                        title={r.teyit_zamani ? `Misafir teyit etti — ${saat(r.teyit_zamani)}` : "Misafir teyit etti"}
                        style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-strong)", flexShrink: 0 }}
                      >
                        ✓
                      </span>
                    )}
                    {r.teyit_durumu === "bekliyor" && (
                      <span
                        title={r.teyit_zamani ? `Teyit soruldu, cevap bekleniyor — ${saat(r.teyit_zamani)}` : "Teyit soruldu, cevap bekleniyor"}
                        style={{ fontSize: 10.5, color: inkSoft, flexShrink: 0 }}
                      >
                        ⧗
                      </span>
                    )}
                    {/* MİSAFİR — bu masa aynı kişinin ikinci masası, misafirleri için
                        (Gökhan, 2026-08-15). Rozet masayı anlatır: ismi düzeltilse bile
                        masanın misafir masası olduğu değişmez, o yüzden yazı kalır. */}
                    {r.misafir_masasi && (
                      <span
                        title={`Misafir masası — bu kişinin ikinci masası.${r.misafir_yakin ? " Diğer masasına yakın istendi." : " Diğer masasından uzak istendi."}`}
                        style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0, padding: "2px 7px", borderRadius: 10, background: "var(--recede)", color: "var(--gold-text)", border: "1px solid var(--gold)" }}
                      >
                        MİSAFİR
                      </span>
                    )}
                    {/* DİLİM ROZETİ BURADAN KALDIRILDI (Gökhan, 2026-08-28: "isim kapanamaz,
                        çünkü gelen müşteri içeri ismiyle giriyor"). Rozet isim sütununda yer
                        kaplıyor, uzun isimleri kesiyordu. Nereye konacağına Gökhan karar
                        verecek; dilim değiştirme penceresi aşağıda hazır duruyor. */}
                    {/* Sadece süre yazar, ismin sonunda (Gökhan, 2026-08-29: "oturma süreleri
                        isimleri kapatıyor, sadece süreler yazsın"). Eskiden "· 25 dk önce
                        geldi" diye uzun yazıyor, uzun isimleri kesiyordu. */}
                    {canli && r.arrived_at && (
                      <span title="Geleli ne kadar oldu" style={{ fontSize: 11, color: inkSoft, flexShrink: 0 }}>{bekleyenSure(r.arrived_at, now)}</span>
                    )}
                  </div>
                  {/* FİX — ismin altında küçük yazı, paxın altındaki "2K 1E" gibi (Gökhan,
                      2026-08-18). Alakart ayrıca yazılmıyor: yazmıyorsa alakart demek. */}
                  {fixAcik && r.servis_tipi === "fix" && (
                    <div style={{ fontSize: 9.5, lineHeight: 1, color: "var(--brand-strong)", fontWeight: 600 }}>Fix</div>
                  )}
                  {doluUyari && (
                    <div style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600 }}>⚠ Masa hâlâ dolu</div>
                  )}
                </Cell>
                <RowSep genislik={AYRAC} />
                <Cell width={SUTUN.telefon} align="center">
                  <button onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "telefon")} style={{ ...hucreYaziBtn, fontSize: 12.5, color: "var(--ink)" }}>
                    {r.guest_phone || "—"}
                  </button>
                </Cell>
                <RowSep genislik={AYRAC} />
                <Cell width={SUTUN.pax} align="center">
                  <button
                    onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "pax")}
                    style={{ ...hucreYaziBtn, fontSize: 12.5, color: "var(--ink)", display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15, gap: 0 }}
                  >
                    <span className="tnum">{r.party_size}</span>
                    {(r.kadin_sayisi !== null || r.erkek_sayisi !== null) && (
                      <span className="tnum" style={{ fontSize: 9.5, color: inkSoft, fontWeight: 400 }}>{r.kadin_sayisi ?? 0}K {r.erkek_sayisi ?? 0}E</span>
                    )}
                  </button>
                </Cell>
                <RowSep genislik={AYRAC} />
                {/* GELEN — kapıda "Geldi"ye basılınca girilen gerçek sayı. Girilmediyse "—"
                    duruyor; pax'taki sayı buraya kopyalanmıyor (Gökhan, 2026-08-24). */}
                <Cell width={SUTUN.gelen} align="center">
                  {r.gelen_kisi !== null || r.gelen_kadin !== null || r.gelen_erkek !== null ? (
                    <span style={{ fontSize: 12.5, color: "var(--ink)", display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 }}>
                      <span className="tnum">{r.gelen_kisi ?? r.party_size}</span>
                      {(r.gelen_kadin !== null || r.gelen_erkek !== null) && (
                        <span className="tnum" style={{ fontSize: 9.5, color: inkSoft, fontWeight: 400 }}>{r.gelen_kadin ?? 0}K {r.gelen_erkek ?? 0}E</span>
                      )}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12.5, color: inkSoft }}>—</span>
                  )}
                </Cell>
                <RowSep genislik={AYRAC} />
                <Cell width={SUTUN.masa} align="center">
                  {/* MUTFAK ŞEFİ — masa numarasıyla işi yok, orada fix/alakart yazıyor
                      (Gökhan, 2026-08-17). */}
                  {mutfakGorunumu ? (
                    <span style={{ fontSize: 12.5, color: r.servis_tipi === "fix" ? "var(--brand-strong)" : "var(--ink)", fontWeight: r.servis_tipi === "fix" ? 600 : 400 }}>
                      {servisEtiketi(r)}
                    </span>
                  ) : (
                    // MASA KUTUSU HER SATIRDA AYNI BOYDA (Gökhan, 2026-08-18: "masa seçilmemiş
                    // rezervasyonlarda kutu büyüyor, hep sabit ölçüde kalsın"). Kutunun yanında
                    // kilit için KILIT_YERI kadar yer ayrılıyor; kilit çizilmese de yer duruyor,
                    // başlık da aynı boşluğu bıraktığı için "MASA" yazısı kutunun tam üstünde.
                    <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                      {assigningId === r.id ? (
                        <span style={{ ...hucreKutu, flex: 1, minWidth: 0 }}>Masa seç…</span>
                      ) : masaAdlari.length > 0 ? (
                        // KİLİTLİYKEN MASA SEÇİMİ AÇILMAZ (Gökhan, 2026-08-28) — kilit
                        // "müşteriye söz verildi" demek. Değiştirmek için önce yanındaki
                        // kilit açılır, sonra kutu tıklanabilir hale gelir.
                        bugunMu && aktif ? (
                          <button
                            // Salon planı rezervasyonun KENDİ MASALARI seçili açılır (Gökhan,
                            // 2026-08-29). Boş açılıyordu; masası yeten rezervasyonda ekranda
                            // hiçbir şey seçili olmadığı için çıkarılacak masa görünmüyordu.
                            // Kural zaten şuydu: masa değişecek ya da boşalacaksa masanın
                            // üstüne tekrar tıklanır, boşalır.
                            // Balon da kapanır — plana geçince ekranda asılı kalıyordu.
                            // KİLİTLİYKEN DE AÇILIYOR (Gökhan, 2026-08-30: "kilitli olsa da
                            // sayfaya gidilsin, ama kilit açılmadan müdahale edilmesin").
                            // Eskiden kutu hiç tıklanmıyordu; masaya bakmak için bile kilidi
                            // açmak gerekiyordu.
                            onClick={() => { setMasaBalon(null); setMasaSecimi(buRezMasalari); setAssigningId(r.id); }}
                            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMasaBalon(null); setKilitMenu({ rez: r, x: e.clientX, y: e.clientY }); }}
                            // Birden fazla masa varsa hepsi fare kutunun üzerine gelince alt
                            // alta çıkıyor; kutuda sadece esas masa yazıyor (Gökhan, 2026-08-18).
                            onMouseEnter={(e) => { if (masaAdlari.length > 1) setMasaBalon({ id: r.id, masalar: masaAdlari, kutu: e.currentTarget.getBoundingClientRect() }); }}
                            onMouseLeave={() => setMasaBalon(null)}
                            title={masaYetersiz(r) ? `Masa ${r.party_size} kişiye yetmiyor` : r.masa_kilit ? "Masa kilitli — bakmak için tıkla, değiştirmek için kilidi aç" : undefined}
                            style={{
                              ...(masaYetersiz(r) ? { ...hucreKutuBtn, border: "1px solid var(--danger)", color: "var(--danger)", fontWeight: 600 } : hucreKutuBtn),
                              flex: 1, minWidth: 0, gap: 4,
                            }}
                          >
                            {masaYetersiz(r) ? `⚠ ${anaMasaAdi}` : anaMasaAdi}
                            {masaAdlari.length > 1 && (
                              <span style={{ fontSize: 9.5, color: inkSoft, fontWeight: 400 }}>+{masaAdlari.length - 1}</span>
                            )}
                          </button>
                        ) : (
                          <span
                            onMouseEnter={(e) => { if (masaAdlari.length > 1) setMasaBalon({ id: r.id, masalar: masaAdlari, kutu: e.currentTarget.getBoundingClientRect() }); }}
                            onMouseLeave={() => setMasaBalon(null)}
                            title={r.masa_kilit ? "Masa kilitli — değiştirmek için önce yanındaki kilidi aç" : undefined}
                            style={{ ...hucreKutu, flex: 1, minWidth: 0, gap: 4 }}
                          >
                            {anaMasaAdi}
                            {masaAdlari.length > 1 && (
                              <span style={{ fontSize: 9.5, color: inkSoft, fontWeight: 400 }}>+{masaAdlari.length - 1}</span>
                            )}
                          </span>
                        )
                      ) : bugunMu && aktif ? (
                        <button
                          onClick={() => { setMasaSecimi([]); setAssigningId(r.id); }}
                          style={{ ...hucreKutuBtn, flex: 1, minWidth: 0 }}
                        >
                          Masa seç
                        </button>
                      ) : (
                        <span style={{ ...hucreKutu, flex: 1, minWidth: 0, color: inkSoft, border: "1px solid transparent", background: "transparent" }}>—</span>
                      )}
                      {/* Kilit "müşteriye söz verildi" demek — kilitliyken otomatik yerleşme bu
                          masayı oynatmaz (Gökhan). Kilit yoksa yeri boş duruyor ki kutu kaymasın. */}
                      <span style={{ width: KILIT_YERI - 4, flexShrink: 0, display: "inline-flex", justifyContent: "center" }}>
                        {masaAdlari.length > 0 && bugunMu && aktif && (
                          <button
                            onClick={() => kilitDegistir(r)}
                            title={r.masa_kilit ? "Masa kilitli — program oynatmaz. Açmak için tıkla." : "Masayı kilitle — program bu masayı oynatmasın"}
                            aria-label={r.masa_kilit ? "Masa kilidini aç" : "Masayı kilitle"}
                            // Açık kilit soluk griydi, kapalıdan ayırt edilmiyordu; artık
                            // altın sarısı (Gökhan, 2026-08-30: "açık kilidin rengi değişsin").
                            style={{ all: "unset", cursor: "pointer", display: "inline-flex", color: r.masa_kilit ? "var(--brand-strong)" : "var(--gold-text)" }}
                          >
                            {r.masa_kilit ? <Lock size={13} /> : <Unlock size={13} />}
                          </button>
                        )}
                      </span>
                    </div>
                  )}
                </Cell>
                <RowSep genislik={AYRAC} />
                {kaydedenGorunsun && (
                  <>
                    <Cell width={SUTUN.kaydeden} align="center">
                      <span style={{ fontSize: 12, color: inkSoft, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {kaydedenAdi(r)}
                      </span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                  </>
                )}
                {!dikeyTablet && (
                <Cell flex enFazla={SUTUN.notEnFazla}>
                  <button
                    onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "not")}
                    // Fare notun üzerine gelince notun tamamı balonda çıkıyor, tıklamaya gerek
                    // yok (Gökhan, 2026-08-18).
                    onMouseEnter={(e) => { if (r.note) setNotBalon({ id: r.id, metin: r.note, kutu: e.currentTarget.getBoundingClientRect() }); }}
                    onMouseLeave={() => setNotBalon(null)}
                    // Not yazısı sola yaslı (Gökhan) — cümle olduğu için soldan okunur.
                    style={{ ...hucreYaziBtn, fontSize: 12, display: "block", width: "100%", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {r.note || "—"}
                  </button>
                </Cell>
                )}
                <Spacer />
                <RowSep genislik={AYRAC} />
                {/* Düğmeler DURUM_ALANI genişliğinde bir yuvada, sağa yaslı — başlık da aynı
                    yuvaya göre ortalandığı için ikisi hep aynı hizada (Gökhan, 2026-08-18). */}
                <ActionsCell width={SUTUN.durum} align="right" gap={0} paddingRight={DURUM_KENAR}>
                  {/* Düğmeler gün geçse de yerinde durur (Gökhan: "belki akşam işaretleyemediler,
                      sabah işaretleyecekler"). Geçmiş günde "Geldi" masayı fiilen doldurmaz —
                      dünkü misafir bugünkü salonu tutmasın diye sadece kayda işlenir. */}
                  {/* DURUM DÜĞMELERİ — garson, PR ve salon şefinde hiç çizilmiyor
                      (Gökhan, 2026-08-17): geldi/gelmedi/iptal karşılamanın işi. */}
                  {durumYetkisi && r.status === "bekleniyor" && (
                    <>
                      <button onClick={() => (bugunMu ? gelenBaslat(r) : durumDegistir(r, "geldi"))} style={btnSmallRow}>
                        Geldi
                      </button>
                      <button onClick={() => durumDegistir(r, "gelmedi")} style={btnGhostRow}>Gelmedi</button>
                    </>
                  )}
                  {/* GELDİ SONRASI (Gökhan, 2026-08-28): yemek + gece olan misafirde önce
                      "Bistroya geç", geçtikten sonra "Tamamlandı". Diğerlerinde doğrudan
                      "Tamamlandı" — bu akışta ayrı bir "Oturdu" adımı yok. */}
                  {/* Ayaktaki misafire bistro boşaldıysa geçiş teklif edilir — hem fiilen
                      boş bistro olacak hem de o bistro başka misafire söz verilmemiş olacak. */}
                  {durumYetkisi && r.ayakta && (r.status === "bekleniyor" || r.status === "geldi")
                    && bistroSayisi - geceTalep > 0 && bistroSayisi - doluBistro > 0 && (
                    <button onClick={() => ayaktayiBistroyaAl(r)} disabled={busy} style={btnBistroRow}>Bistroya al</button>
                  )}
                  {durumYetkisi && r.status === "geldi" && (
                    bistroyaGecer(r)
                      ? <button onClick={() => bistroyaGec(r)} disabled={busy} style={btnBistroRow}>Bistro</button>
                      : ayaktayaGecer(r)
                        ? <button onClick={() => ayaktayaGec(r)} disabled={busy} style={btnBistroRow} title="Yemek masasını bırakır, gece ayakta devam eder">Ayakta</button>
                        : <button onClick={() => tamamlandi(r)} disabled={busy} style={btnSmallRow}>Tamam</button>
                  )}
                  {/* Oturan misafirin masasını boşaltan tek adım — bu programın akışını kapatır. */}
                  {durumYetkisi && r.status === "oturdu" && (
                    <button onClick={() => tamamlandi(r)} disabled={busy} style={btnSmallRow}>Tamam</button>
                  )}
                  {/* İş bitti — hesap tutarı buradan giriliyor, zorunlu değil. */}
                  {r.status === "tamamlandi" && (
                    <TutarKutusu tutar={r.hesap_tutari} onKaydet={(metin) => tutarKaydet(r, metin)} />
                  )}
                  {aktif && durumYetkisi ? (
                    // GECEYE KALMAYAN MİSAFİR (Gökhan, 2026-08-29: "misafir geldi denirse
                    // bistroya geçin yanındaki iptal tamamlandıya döner"). Yemek + gece
                    // misafiri gelmiş ve yemek masasında oturuyorken tek çıkış yolu İptal'di;
                    // oysa misafir gelip yemeğini yemiş, iptal onu gelmemiş gibi gösteriyordu.
                    // Artık orada Tamamlandı duruyor: ziyaret kapanır, bistrosu da boşalır.
                    r.status === "geldi" && bistroyaGecer(r)
                      ? <button onClick={() => tamamlandi(r)} disabled={busy} style={btnSmallRow}>Tamam</button>
                      : <button onClick={() => iptalEt(r)} style={btnGhostRow}>İptal</button>
                  ) : r.status !== "oturdu" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span title={r.status === "iptal" ? r.cancel_reason ?? undefined : undefined} style={{ fontSize: 11, fontWeight: 700, color: info.color }}>{info.label}</span>
                      {gecikti !== null && (
                        <span className="tnum" title="Rezervasyon saati geçti" style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", marginLeft: 6, whiteSpace: "nowrap" }}>
                          {gecikti < 60 ? `${gecikti} dk` : `${Math.floor(gecikti / 60)}s ${gecikti % 60}dk`} gecikti
                        </span>
                      )}
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: SOURCE_INFO[r.source]?.color ?? inkSoft }}>
                        ({SOURCE_INFO[r.source]?.label ?? r.source})
                      </span>
                    </span>
                  ) : null}
                </ActionsCell>
              </ListRow>
            );
          })}

          {/* YEDEK — rezervasyon listesinin ALTINDA ayrı liste (Gökhan, 2026-08-18). Bunlar
              o güne yer bulunamamış, yer açılırsa aranacak misafirler; masa tutmazlar,
              kapasiteye girmezler. Kapıda bekleyenle karıştırılmasın diye ayrı: bu telefonda
              bekleyen, o mekânda bekleyen. Görüşme olumluysa "Rezervasyona al" tek dokunuş. */}
          {yedekRows.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--brand)", padding: "0 0 4px" }}>
                Yedek — yer açılırsa aranacak
              </div>
              {yedekRows.map((r, i) => (
                <ListRow
                  key={r.id} yukseklik={41} gap={0} bg="var(--recede)"
                  // Yedek satırında da sağ tıkla silme (Gökhan, 2026-08-29) — listedeki
                  // rezervasyon satırlarında vardı, burada yoktu.
                  onContextMenu={silmeHakkim ? (e) => { e.preventDefault(); setSilMenu({ rez: r, x: e.clientX, y: e.clientY }); } : undefined}
                >
                  <Cell width={SUTUN.sn} align="center">
                    <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{i + 1}</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  <Cell width={SUTUN.zaman} align="center">
                    <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{saat(r.reserved_at)}</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  <Cell width={SUTUN.misafir}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{r.guest_name}</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  <Cell width={SUTUN.telefon} align="center">
                    <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.guest_phone || "—"}</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  <Cell width={SUTUN.pax} align="center">
                    <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.party_size}</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  {/* Yedek henüz gelmiş sayılmıyor — Gelen sütunu boş. */}
                  <Cell width={SUTUN.gelen} align="center">
                    <span style={{ fontSize: 12.5, color: inkSoft }}>—</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  {/* Yedeğin masası yok — masa sütunu boş kalıyor, hiza bozulmasın diye çizgi. */}
                  <Cell width={SUTUN.masa} align="center">
                    <span style={{ fontSize: 12.5, color: inkSoft }}>—</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  {kaydedenGorunsun && (
                    <>
                      <Cell width={SUTUN.kaydeden} align="center">
                        <span style={{ fontSize: 12, color: inkSoft, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {kaydedenAdi(r)}
                        </span>
                      </Cell>
                      <RowSep genislik={AYRAC} />
                    </>
                  )}
                  {!dikeyTablet && (
                  <Cell flex enFazla={SUTUN.notEnFazla}>
                    <span style={{ fontSize: 12, color: inkSoft, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.note || "—"}
                    </span>
                  </Cell>
                  )}
                  <Spacer />
                  <RowSep genislik={AYRAC} />
                  <ActionsCell width={SUTUN.durum} align="right" gap={0} paddingRight={DURUM_KENAR}>
                    {durumYetkisi && (
                      <>
                        <button onClick={() => yedegiRezervasyonaAl(r)} disabled={busy} style={{ ...btnSmallRow, opacity: busy ? 0.5 : 1 }}>
                          Rezervasyona al
                        </button>
                        <button onClick={() => iptalEt(r)} style={btnGhostRow}>İptal</button>
                      </>
                    )}
                  </ActionsCell>
                </ListRow>
              ))}
            </div>
          )}
        </div>
        </div>
        </>
        )}
      </div>
      </div>

      {/* YENİ REZERVASYON KATMANI */}
      {/* Mobilde klavye açılınca 100vh küçülüyor, ortalanmış pencere her alan
          değişiminde zıplıyordu (Gökhan, 2026-08-08: "pencere yer değiştiriyor tek
          yerde sabit kalsın") — üstten sabit dursun diye mobilde flex-start. */}
      {/* Salon planı açıkken pencere GİZLENİYOR ama sökülmüyor — yazılanlar duruyor, plandan
          dönünce form olduğu gibi devam ediyor (Gökhan, 2026-08-24: "ekran kapanmasın"). */}
      {newResOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: fPlanAcik ? "none" : "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? "24px 0" : 0, boxSizing: "border-box", zIndex: 50 }} onClick={() => setNewResOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, width: "min(560px, 94vw)", maxHeight: isMobile ? "calc(100svh - 48px)" : "calc(100vh - 48px)", overflowY: "auto", overflowX: "hidden", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {/* Başlık bloğu daralabilir, düğme bloğu daralamaz (Gökhan, 2026-08-28: "ekle
                  butonu kutunun dışına çıkmış"). Eskiden ikisi de daralabiliyordu; düğmelerin
                  KENDİSİ daralmadığı için blok küçülüyor, Ekle pencerenin sağından taşıyordu. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)" }}>Yeni rezervasyon</div>
                {!isMobile && <DatePicker value={fDate} onChange={setFDate} style={{ width: 106, flexShrink: 0, whiteSpace: "nowrap" }} />}
                {fSecKartId && <span style={{ fontSize: 11.5, color: "var(--brand)", whiteSpace: "nowrap" }}>Kart bağlandı ✓</span>}
              </div>
              {/* Mobilde tarih sağa yaslı (Gökhan, 2026-08-08), Vazgeç/Ekle aşağıya sağ
                  alta alındı — masaüstünde değişmedi. */}
              {isMobile && <DatePicker value={fDate} onChange={setFDate} style={{ width: 106, flexShrink: 0, whiteSpace: "nowrap", marginLeft: "auto" }} />}
              {!isMobile && (
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setNewResOpen(false)} style={btnSecondary}>Vazgeç</button>
                  <button onClick={submit} disabled={busy || !fName.trim()} style={{ ...btnPrimary, opacity: !fName.trim() ? 0.5 : 1 }}>Ekle</button>
                </div>
              )}
            </div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {isMobile ? (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input autoFocus value={fName} onChange={(e) => { setFName(e.target.value); setFSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="İsim soyisim" style={{ ...inp, flex: 1, minWidth: 160 }} />
                    <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} onFocus={(e) => e.target.select()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 56, flexShrink: 0, textAlign: "center" }} />
                    <input value={fKadin} onChange={(e) => setFKadin(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="K" title="Kadın sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center", padding: "8px 2px" }} />
                    <input value={fErkek} onChange={(e) => setFErkek(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="E" title="Erkek sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center", padding: "8px 2px" }} />
                  </div>
                  {!fSecKartId && <MusteriAdaylariListesi adaylar={fAdaylar} onSec={fAdaySec} />}
                  {/* Saat/telefon/kanal aynı satırda (Gökhan: "telefonu saat penceresinin
                      yanına alalım, nereden ulaştı da telefonun yanına saatin satırına"). */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {/* Telefon kutusu 3 cm kısaldı; saat kutusu da okunacak kadar geniş
                        (Gökhan, 2026-08-30: "telefon satırını 3 cm küçült, saat satırı
                        görünür olsun"). */}
                    <input value={fPhone} onChange={(e) => { setFPhone(e.target.value); setFSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Telefon" inputMode="tel" style={{ ...inp, flex: 1, minWidth: 110, maxWidth: "calc(100% - 3cm)" }} />
                    <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, width: 96, padding: "8px 6px", textAlign: "center", flexShrink: 0 }} />
                    <SecimKutusu
                      deger={fKanal} onDegis={setFKanal} baslik="Nereden geldi" genislik={108} dar
                      secenekler={ILETISIM_KANALI_SECENEKLERI.map((k) => ({ deger: k, ad: ILETISIM_KANALI_ADI[k] }))}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={fNote} onChange={(e) => setFNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Özel not" style={{ ...inp, flex: 1 }} />
                    <YedekDugmesi acik={fYedek} onTikla={() => setFYedek((v) => !v)} ipucu={yedekOneri ? `Bu günlerde ortalama ${yedekOneri.limit} masa boşalıyor, şu an ${bekleyenYedek} yedek bekliyor.` : undefined} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input autoFocus value={fName} onChange={(e) => { setFName(e.target.value); setFSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="İsim soyisim" style={{ ...inp, flex: 1, minWidth: 160 }} />
                    <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} onFocus={(e) => e.target.select()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 56, flexShrink: 0, textAlign: "center" }} />
                    <input value={fKadin} onChange={(e) => setFKadin(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="K" title="Kadın sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center", padding: "8px 2px" }} />
                    <input value={fErkek} onChange={(e) => setFErkek(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="E" title="Erkek sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center", padding: "8px 2px" }} />
                    <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, width: 96, flexShrink: 0 }} />
                  </div>
                  {!fSecKartId && <MusteriAdaylariListesi adaylar={fAdaylar} onSec={fAdaySec} />}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={fPhone} onChange={(e) => { setFPhone(e.target.value); setFSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Telefon" inputMode="tel" style={{ ...inp, width: 150, flexShrink: 0 }} />
                    <SecimKutusu
                      deger={fKanal} onDegis={setFKanal} baslik="Nereden geldi" genislik={108} dar
                      secenekler={ILETISIM_KANALI_SECENEKLERI.map((k) => ({ deger: k, ad: ILETISIM_KANALI_ADI[k] }))}
                    />
                    <input value={fNote} onChange={(e) => setFNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Özel not" style={{ ...inp, flex: 1 }} />
                    <YedekDugmesi acik={fYedek} onTikla={() => setFYedek((v) => !v)} ipucu={yedekOneri ? `Bu günlerde ortalama ${yedekOneri.limit} masa boşalıyor, şu an ${bekleyenYedek} yedek bekliyor.` : undefined} />
                  </div>
                </>
              )}
              {/* NOTTAKİ İSTEK KARŞILANIYOR MU (Gökhan, 2026-08-28). Sen yazarken çıkar,
                  kaydı durdurmaz — misafirle konuşurken bilmen için. */}
              {fNotUyarisi && (
                <div style={{ fontSize: 12, color: "var(--gold-text)", background: "var(--recede)", border: "1px solid var(--gold)", borderRadius: 10, padding: "7px 10px" }}>
                  {fNotUyarisi}
                </div>
              )}
              {/* MASA SEÇME (Gökhan, 2026-08-24) — salonunu kurmuş işletmede çıkar. Basınca
                  pencere kenara çekilir, salon planı açılır; seçim orada yapılır. Seçilen
                  masa burada yazar, "Ekle" ile birlikte atanır ve kilitlenir. */}
              {((tables.length > 0 && !fYedek) || (eglenceAktif && eglenceGunuMu(fDate, eglenceGunleri))) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* DİLİM (Gökhan, 2026-08-27: "masa seçin yanına bi kutu daha koy, oradan
                      seçilsin yemek, gece, yemek gece diye"). Sadece eğlence günlerinde
                      çıkar; diğer günler mekân normal restoran gibi çalışır. */}
                  {/* Tür kutusu ile masa seç kutusu aynı boyda — satırı eşit paylaşıyorlar
                      (Gökhan, 2026-08-29). */}
                  {/* KONSEPTLER (Gökhan, 2026-08-30). İşletme ayarlarda kendi konseptlerini
                      kurduysa kutuda onlar çıkıyor ve her gün görünüyor; kurmadıysa programın
                      kendi seçenekleri, eskisi gibi sadece eğlence günlerinde. */}
                  {konseptler.length > 0 ? (
                    <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
                    <SecimKutusu
                      deger={fKonsept} dar yerTutucu="Rezervasyon türü"
                      onDegis={(v) => {
                        setFKonsept(v);
                        const yeni = konseptiCoz(v);
                        setFDilim(yeni); setFDilimSecildi(true);
                        if (yeni === "gece" || yeni === "ayakta") setFTime(eglenceGecis);
                      }}
                      baslik="Rezervasyon türü"
                      secenekler={konseptler.map((k) => ({ deger: k, ad: k }))}
                    />
                    </div>
                  ) : eglenceAktif && eglenceGunuMu(fDate, eglenceGunleri) && (
                    <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
                    <SecimKutusu
                      deger={fDilim} dar
                      onDegis={(v) => {
                        const yeni = v as TurSecimi;
                        setFDilim(yeni); setFDilimSecildi(true);
                        // Sadece geceye gelen misafirin saati geçiş saatiyle başlar
                        // (Gökhan, 2026-08-28) — yemek saati onun için anlamsız.
                        if (yeni === "gece" || yeni === "ayakta") setFTime(eglenceGecis);
                      }}
                      baslik="Yemeğe mi geliyor, geceye mi, ikisine birden mi"
                      // AYAKTA SEÇENEKLERİ SADECE BİSTRO BİTİNCE (Gökhan, 2026-08-29).
                      // Bistro varken misafir zaten oturur, kutuyu kalabalık etmeye gerek yok.
                      secenekler={[...DILIMLER, ...(bistroSayisi - geceTalep <= 0 ? AYAKTA_SECENEKLERI : [])]
                        .map((d) => ({ deger: d.anahtar, ad: d.ad }))}
                    />
                    </div>
                  )}
                  {tables.length > 0 && !fYedek && (<>
                  <button
                    type="button"
                    onClick={() => {
                      // NOTTAKİ SALON AÇILIR (Gökhan, 2026-08-28: "notlara bahçe yazdım,
                      // masa seçme ekranını açarsam bahçeyi açsın"). Program notlardaki
                      // salon adını zaten tanıyordu; masa seçme ekranına bağlı değildi.
                      const nottakiSalon = istenenSalon({ note: fNote }, salonlar);
                      setFPlanAlanId(nottakiSalon ?? fPlanAlanId ?? salonlar[0]?.id ?? null);
                      setFPlanAcik(true);
                    }}
                    style={{ ...inp, flex: 1, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                    title="Salon planından masa seç"
                  >
                    <span style={{ color: fMasaSecimi.length > 0 ? "var(--ink)" : "var(--muted-2)" }}>
                      {fMasaSecimi.length > 0
                        ? fMasaSecimi.map((id) => tableName(id)).filter(Boolean).join(" + ")
                        : "Masa seç"}
                    </span>
                    <LayoutGrid size={14} style={{ color: "var(--brand)", flexShrink: 0 }} />
                  </button>
                  {fMasaSecimi.length > 0 && (
                    <button type="button" onClick={() => setFMasaSecimi([])} style={{ ...btnGhostRow, color: "var(--danger)" }}>Masayı bırak</button>
                  )}
                  </>)}
                  {/* MASA YAKIN — program aynı kişiye ikinci masa açıldığını fark ettiğinde
                      çıkar. İşaretlenirse iki masa olabildiğince yakına konur (birleşmezler),
                      işaretlenmezse olabildiğince uzağa: önce başka salon, o olmazsa salonun
                      öbür ucu (Gökhan, 2026-08-15). Masa seçme satırına alındı ve kısaltıldı
                      (Gökhan, 2026-08-28) — kendi satırını kaplamasın. */}
                  {fMisafirAday && (
                    <button
                      type="button"
                      onClick={() => setFMisafirYakin((v) => !v)}
                      title="Bu kişinin bugün ikinci masası — iki masa yan yana olsun mu"
                      style={{
                        all: "unset", cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: "4px 10px",
                        borderRadius: 10, flexShrink: 0, whiteSpace: "nowrap",
                        border: `1px solid ${fMisafirYakin ? "var(--brand-strong)" : "var(--line-2)"}`,
                        background: fMisafirYakin ? "var(--brand-strong)" : "transparent",
                        color: fMisafirYakin ? "#fff" : "var(--ink)",
                      }}
                    >
                      Masa yakın
                    </button>
                  )}
                </div>
              )}
              {/* FIX / ALAKART — sadece ayarlarda fix menü açıkken çıkar (Gökhan,
                  2026-08-17). Mutfak şefi listede masa yerine bunu görüyor. */}
              {fixAcik && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {(["alakart", "fix"] as const).map((tip) => (
                    <button
                      key={tip} type="button" onClick={() => setFServis(tip)}
                      style={{
                        all: "unset", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                        padding: "6px 14px", borderRadius: 10,
                        border: `1px solid ${fServis === tip ? "var(--brand-strong)" : "var(--line-2)"}`,
                        background: fServis === tip ? "var(--brand-strong)" : "transparent",
                        color: fServis === tip ? "#fff" : "var(--ink)",
                      }}
                    >
                      {tip === "fix" ? "Fix menü" : "Alakart"}
                    </button>
                  ))}
                  {fServis === "fix" && fixMenuler.length > 0 && (
                    <SecimKutusu
                      deger={fFixMenu} onDegis={setFFixMenu} genislik={150} dar yerTutucu="Menü seç"
                      secenekler={[{ deger: "", ad: "Menü seç" }, ...fixMenuler.map((m) => ({ deger: m.id, ad: m.ad }))]}
                    />
                  )}
                  {fServis === "fix" && karmaFix && (
                    <input
                      value={fFixKisi} onChange={(e) => setFFixKisi(e.target.value.replace(/\D/g, ""))}
                      onFocus={(e) => e.target.select()} placeholder="Fix kişi" inputMode="numeric"
                      title="Kaç kişi fix menü yiyecek"
                      style={{ ...inp, width: 84, textAlign: "center" }}
                    />
                  )}
                </div>
              )}
              <KisiKartiOzet kart={fKart} phone={fPhone} restaurantId={restaurantId} simdi={now} onChanged={() => setFKartRefresh((v) => v + 1)} esikMudavim={esikMudavim} esikNoShow={esikNoShow} isMobile={isMobile} sadeceGecmisVarsaGoster />
            </div>

            {isMobile && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
                <button onClick={() => setNewResOpen(false)} style={btnSecondary}>Vazgeç</button>
                <button onClick={submit} disabled={busy || !fName.trim()} style={{ ...btnPrimary, opacity: !fName.trim() ? 0.5 : 1 }}>Ekle</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REZERVASYON ALIRKEN SALON PLANI (Gökhan, 2026-08-24)
          "pencere küçülüp kenara çekilsin, arkadaki bütün ekran salon planı olsun."
          Masaya tıklamak SEÇER, atamaz. Gezinmede sınır yok, ekran kapanmaz. "Tamam" seçimi
          forma geri götürür; masa ancak "Ekle"de atanır ve kilitlenir. */}
      {planAcik && (
        // Özet SOLDA (Gökhan, 2026-08-30: "bu menü neden sağda, sola taşı") — programın geri
        // kalanında sol menü solda duruyor, plan ekranı tek başına ters çalışıyordu.
        // Telefonda düzen değişmiyor: orada alt şerit olarak kalıyor.
        <div style={{ position: "fixed", inset: 0, background: "var(--canvas)", zIndex: 60, display: "flex", flexDirection: isMobile ? "column" : "row-reverse", boxSizing: "border-box" }}>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", padding: isMobile ? 10 : 16, gap: 10, boxSizing: "border-box" }}>
            {/* Salon pilleri — salon ekranındaki düzenin aynısı. Tek salon varsa çizilmez.
                Dilim seçiliyken bu düğmeler sadece YEMEK salonunu değiştirir; gece salonu
                yanında kendiliğinden durur (Gökhan, 2026-08-28). */}
            {/* Dilim "Yemek + gece" ise iki salon yan yana çizilir; telefonda sırayla tek tek.
                Salon adı, hangi düzende olduğun belli olsun diye planın üstünde yazar. */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 10 }}>
              {fPlanPaneller.map((alan) => {
                const alanMasalari = tables.filter((t) => (t.area_id ?? null) === alan.id && t.tasindi_gun !== gun);
                return (
                  <div key={alan.id} style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {fPlanDilim && (
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-green)", flexShrink: 0 }}>
                        {alan.name}
                        <span style={{ fontWeight: 400, color: inkSoft }}> · {geceSalonIds.has(alan.id) ? "gece" : "yemek"}</span>
                      </div>
                    )}
                    {/* Kutu esnek: plan kutunun boyunu tam doldursun, aşağı taşmasın
                        (Gökhan, 2026-08-28: "solda açılan ekran aşağı taşmış"). Kutu esnek
                        olmayınca plan kendi boyuna göre büyüyüp alttan çıkıyordu. */}
                    <div style={{ flex: 1, minHeight: 0, display: "flex", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
                      <SalonPlani
                        masalar={alanMasalari.map((t) => ({
                          id: t.id, name: t.name, seat_count: t.seat_count, shape: t.shape, rotated: t.rotated,
                          position_x: t.position_x, position_y: t.position_y,
                        }))}
                        genislikCm={alan.genislik_cm}
                        derinlikCm={alan.derinlik_cm}
                        // Seçili masa markanın rengi, o gün başkasında olan masa soluk, boş loca altın.
                        renkOf={(id) => {
                          if (planSecim.includes(id)) return "var(--brand-strong)";
                          if (fPlanDolu[id] !== undefined) return "var(--line-2)";
                          return tables.find((t) => t.id === id)?.shape === "loca" ? "var(--gold)" : null;
                        }}
                        benimPostam={new Set(planSecim)}
                        // Locada koltuk yazılmıyor — sabit kişi sayısı yok (Gökhan, 2026-08-24).
                        altYazi={(id) => {
                          const dolu = fPlanDolu[id];
                          if (dolu !== undefined) return dolu;
                          const t = tables.find((x) => x.id === id);
                          return t?.shape === "loca" ? "Loca" : `${t?.seat_count ?? 0} kişi`;
                        }}
                        // Masa tutulmuşsa misafirin kişi sayısı ismin altında ayrı satırda
                        // (Gökhan, 2026-08-29). Boş masada kapasite yazmaya devam ediyor.
                        kisiYazi={(id) => (fPlanDoluKisi[id] ? `${fPlanDoluKisi[id]} kişi` : null)}
                        onMasaTikla={planMasaTikla}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* SOL MENÜ — diğer ekranlardakiyle aynı kutu (Gökhan, 2026-08-30: "diğer
              ekranlardaki sol menümüz gibi yap"): aynı genişlik, çerçeve, köşe ve boşluk.
              Telefonda eskisi gibi alt şerit. */}
          <div style={{
            flexShrink: 0, background: "var(--card)", boxSizing: "border-box",
            ...(isMobile
              ? { borderTop: "1px solid var(--line)", padding: "10px 12px" }
              : {
                width: 226, margin: 16, marginRight: 0, border: "1px solid var(--line)", borderRadius: 16,
                padding: 12, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", overflowX: "hidden",
                // Kaydırma çubuğu belirip kaybolunca menünün içi daralıp genişliyordu; yeri
                // hep ayrılıyor ki sayaç satırları oynamasın (Gökhan, 2026-08-30).
                scrollbarGutter: "stable",
              }),
          }}>
            {!isMobile && (
              <>
                {/* Rozet + sayfa adı — sol menünün başlığı. Rozet burada bağlantı değil:
                    rezervasyon sayfasına döndürüyor ve seçilmiş masa varsa Tamam sayılıyor
                    (Gökhan, 2026-08-30). Seçim boşken sadece kapanıyor — boş seçimle Tamam
                    demek masayı bırakmak olurdu. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => (planSecim.length > 0 ? planTamam() : planKapat())}
                    disabled={busy}
                    aria-label="Rezervasyonlar" title="Rezervasyon sayfasına dön"
                    style={{
                      all: "unset", cursor: "pointer", width: 30, height: 30, borderRadius: "50%",
                      background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center",
                      justifyContent: "center", fontWeight: 700, fontSize: 9.5, letterSpacing: 0.3, flexShrink: 0,
                    }}
                  >
                    RZV
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {planBaslik}
                    </div>
                    <div className="tnum" style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted)", lineHeight: 1.2, marginTop: 2 }}>
                      {planKisi} kişi · {planSaat}
                    </div>
                  </div>
                </div>
                <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />
              </>
            )}
            {/* SALON SEÇİMİ SOL MENÜDE (Gökhan, 2026-08-30: "salon seçimlerini de sol menüye
                al"). Planın üstünde duruyordu; menüde alt alta duruyor, plan alanı da
                tamamen salona kalıyor. */}
            {fPlanPilleri.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                {fPlanPilleri.map((s) => {
                  const secili = fPlanSeciliPil === s.id;
                  return (
                    <button
                      key={s.id} type="button" onClick={() => setFPlanAlanId(s.id)}
                      style={{
                        all: "unset", cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: "5px 14px", borderRadius: 10,
                        border: `1px solid ${secili ? "var(--brand-strong)" : "var(--line-2)"}`,
                        background: secili ? "var(--brand-strong)" : "transparent",
                        color: secili ? "#fff" : "var(--ink)",
                      }}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}
            {isMobile && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-green)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {planBaslik}
                  </div>
                  <div className="tnum" style={{ fontSize: 12, color: inkSoft }}>{planKisi} kişi · {planSaat}</div>
                </div>
                {/* Tek düğme: seçim zaten anında atanmıyor, "Tamam" sadece pencereye döndürüyor. */}
                <button type="button" onClick={planTamam} disabled={busy} style={btnPrimary}>Tamam</button>
              </div>
            )}
            {/* Locada koltuk sayacı gösterilmiyor: kaç kişi girdiğini loca değil rezervasyon
                belirliyor (Gökhan, 2026-08-24). */}
            {/* YEMEK SALONU ÖZETİ — hangi masalar, kaç koltuk, yetiyor mu. */}
            {fPlanDilim !== "gece" && (
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, color: "var(--ink)" }}>Yemek salonu</div>
                {planYemekSecim.length === 0 ? (
                  <div style={{ color: inkSoft }}>Masa seçilmedi</div>
                ) : planSecimdeLoca ? (
                  <div style={{ color: "var(--gold-text)" }}>{planAdlari(planYemekSecim)} — loca, kişi sınırı yok</div>
                ) : (
                  // Masa adı - kapasite - rezervasyonun kişi sayısı; "yetiyor/yetmiyor"
                  // uzantısı kalktı (Gökhan, 2026-08-30). Yetip yetmediğini renk söylüyor.
                  <div style={{ color: planYemekKoltuk >= planKisi ? "var(--brand-strong)" : "var(--danger)" }}>
                    {planMasaPax(planYemekSecim, (id) => tables.find((t) => t.id === id)?.seat_count ?? 0)} - <span style={{ color: "var(--gold-text)", fontWeight: 600 }}><span className="tnum">{planKisi}</span> pax</span>
                  </div>
                )}
              </div>
            )}
            {/* GECE ÖZETİ — kaç bistro seçildi, kaç gerekiyor. */}
            {eglenceAktif && (fPlanDilim === "gece" || fPlanDilim === "yemek_gece") && (
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, color: "var(--ink)" }}>Gece</div>
                {planGeceSecim.length === 0 ? (
                  <div style={{ color: inkSoft }}>Bistro seçilmedi — {planKisi} kişi için {bistroGereken(planKisi)} bistro gerekiyor</div>
                ) : (
                  <div style={{ color: planGeceSecim.length >= bistroGereken(planKisi) ? "var(--brand-strong)" : "var(--danger)" }}>
                    {bistroKisi ? planMasaPax(planGeceSecim, () => bistroKisi) : planAdlari(planGeceSecim)} - <span style={{ color: "var(--gold-text)", fontWeight: 600 }}><span className="tnum">{planKisi}</span> pax</span>
                  </div>
                )}
              </div>
            )}
            {/* KOLTUK YETMİYORSA SÖYLENİR (Gökhan, 2026-08-29: "5 kişilik rezervasyona 4
                kişilik masa seçtim, uyarıda bulunmadı"). Ayardaki ek sandalye kuralı duruyor —
                masa yine seçilebiliyor — ama kaç sandalye ekleneceği ekranda yazıyor.
                Locada koltuk sayısı olmadığı için hiç çıkmıyor. */}
            {/* Ek sandalye ile kapanan fark ayrıca yazılıyor — masa yine seçilebiliyor. */}
            {planYemekSecim.length > 0 && !planSecimdeLoca && planYemekKoltuk < planKisi
              && planYemekKoltuk + planYemekSecim.length * ekSandalye >= planKisi && (
              <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--gold-text)" }}>
                {planKisi - planYemekKoltuk} sandalye eklenerek oturulabilir.
              </div>
            )}
            {!isMobile && (
              <>
                <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />
                {/* GÜNÜN SAYAÇLARI (Gökhan, 2026-08-30: "rezervasyon sayfasındaki üstteki
                    bilgileri buraya da getir") — masa seçerken elde ne kaldığı görünüyor. */}
                {sayaclar(true)}
                <div style={{ flex: 1 }} />
                {/* Vazgeç ile Tamam yan yana; "Seçimi temizle" kaldırıldı — masaya tekrar
                    tıklayınca seçim zaten kalkıyor (Gökhan, 2026-08-30). */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button type="button" onClick={planKapat} style={{ ...btnSecondary, flex: 1, justifyContent: "center" }}>Vazgeç</button>
                  <button type="button" onClick={planTamam} disabled={busy} style={{ ...btnPrimary, flex: 1, justifyContent: "center" }}>Tamam</button>
                </div>
              </>
            )}
          </div>
          {/* Masa seçerken de alt şerit duruyor (Gökhan, 2026-08-31) — katman tam ekran
              olduğu için kendi kopyası çiziliyor. */}
          <RezervasyonAltNav mobil={isMobile} />
        </div>
      )}

      {/* REZERVASYONSUZ GİR KATMANI */}
      {walkInOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? "24px 0" : 0, boxSizing: "border-box", zIndex: 50 }} onClick={() => setWalkInOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, width: "min(560px, 94vw)", maxHeight: isMobile ? "calc(100svh - 48px)" : "calc(100vh - 48px)", overflowY: "auto", overflowX: "hidden", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>Kapı girişi</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Kayıt zorunlu değil — hiç kaydetmeden de bir masaya doğrudan oturtabilirsin. Buradan
              girersen bugünün listesinde &quot;Geldi&quot; olarak görünür. Boş masa yoksa misafir
              kendiliğinden bekleme sırasına yazılır.
            </div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input autoFocus value={wName} onChange={(e) => { setWName(e.target.value); setWSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="İsim soyisim" style={{ ...inp, flex: 1 }} />
                <input value={wParty} onChange={(e) => setWParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} onFocus={(e) => e.target.select()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 70 }} />
              </div>
              {!wSecKartId && <MusteriAdaylariListesi adaylar={wAdaylar} onSec={wAdaySec} />}
              <input value={wPhone} onChange={(e) => { setWPhone(e.target.value); setWSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="Telefon" inputMode="tel" style={inp} />
              {wSecKartId && <div style={{ fontSize: 11.5, color: "var(--brand)" }}>Müşteri kartı bağlandı ✓</div>}
              <KisiKartiOzet kart={wKart} phone={wPhone} restaurantId={restaurantId} simdi={now} onChanged={() => setWKartRefresh((v) => v + 1)} esikMudavim={esikMudavim} esikNoShow={esikNoShow} isMobile={isMobile} sadeceGecmisVarsaGoster />
              <input value={wNote} onChange={(e) => setWNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="Özel not" style={inp} />
              {/* REZERVASYON TÜRÜ (Gökhan, 2026-08-29: "kapı girişine de rezervasyon türü
                  koymamız gerekli"). Sadece eğlence günlerinde çıkar; diğer günler mekân
                  normal restoran gibi çalışıyor. */}
              {konseptler.length > 0 ? (
                <SecimKutusu
                  deger={wKonsept} yerTutucu="Rezervasyon türü"
                  onDegis={(v) => { setWKonsept(v); setWDilim(konseptiCoz(v)); }}
                  baslik="Rezervasyon türü"
                  secenekler={konseptler.map((k) => ({ deger: k, ad: k }))}
                />
              ) : eglenceAktif && eglenceGunuMu(bugunIstanbul(), eglenceGunleri) && (
                <SecimKutusu
                  deger={wDilim}
                  onDegis={(v) => setWDilim(v as TurSecimi)}
                  baslik="Yemeğe mi geldi, geceye mi, ikisine birden mi"
                  secenekler={[...DILIMLER, ...(bistroSayisi - geceTalep <= 0 ? AYAKTA_SECENEKLERI : [])]
                    .map((d) => ({ deger: d.anahtar, ad: d.ad }))}
                />
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              {kvkkNotice.trim() && (
                <button onClick={() => setKvkkAcik((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)" }}>
                  {kvkkAcik ? "KVKK aydınlatma metnini gizle" : "KVKK aydınlatma metni"}
                </button>
              )}
              {kvkkAcik && kvkkNotice.trim() && (
                <div style={{ marginTop: 8, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--recede)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto", overflowX: "hidden" }}>
                  {kvkkNotice}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setWalkInOpen(false)} style={btnSecondary}>Vazgeç</button>
              <button onClick={dogrudanGir} disabled={busy || !wName.trim()} style={{ ...btnPrimary, opacity: !wName.trim() ? 0.5 : 1 }}>Ekle</button>
            </div>
          </div>
        </div>
      )}

      {/* ONLINE REZERVASYON BAŞVURULARI (Gökhan, 2026-08-30). Linkten gelenler burada satır
          satır duruyor: masası seçilir, onaylanır ya da reddedilir. Onaylanan normal listeye
          düşer; reddedilen "Reddedildi" olarak burada kalır. */}
      {onlinePanel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? "24px 0" : 0, boxSizing: "border-box", zIndex: 50 }} onClick={() => setOnlinePanel(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, width: "min(880px, 96vw)", maxHeight: "calc(100vh - 48px)", overflowY: "auto", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)" }}>Online rezervasyon</span>
              <button onClick={() => setOnlinePanel(false)} style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>Kapat</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Linkten gelen başvurular. Masasını verip onayladığında rezervasyon listesine düşer
              ve misafire onay mesajı gider; reddedersen &quot;rezervasyonlarımız dolu&quot; mesajı gider.
            </div>
            {basvurular.length === 0 && (
              <div style={{ fontSize: 13, color: inkSoft, padding: "8px 0" }}>Bu günde online başvuru yok.</div>
            )}
            {basvurular.map((r) => {
              const reddedildi = r.onay_durumu === "reddedildi";
              const masalari = (rezMasalar[r.id] ?? []).map((id) => tableName(id)).filter(Boolean) as string[];
              return (
                <ListRow key={r.id} yukseklik={41} gap={8} bg={reddedildi ? "var(--recede)" : "var(--info-bg)"} muted={reddedildi}>
                  <Cell width={54} align="center">
                    <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{saat(r.reserved_at)}</span>
                  </Cell>
                  <Cell width={150}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{r.guest_name}</span>
                  </Cell>
                  <Cell width={110} align="center">
                    <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.guest_phone || "—"}</span>
                  </Cell>
                  <Cell width={46} align="center">
                    <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.party_size}</span>
                  </Cell>
                  <Cell width={92} align="center">
                    <span style={{ fontSize: 11.5, color: inkSoft }}>{dilimAdi(r.dilim) || "—"}</span>
                  </Cell>
                  {!dikeyTablet && (
                  <Cell flex enFazla={SUTUN.notEnFazla}>
                    <span style={{ fontSize: 12, color: inkSoft, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note || "—"}</span>
                  </Cell>
                  )}
                  <Cell width={SUTUN.masa} align="center">
                    {reddedildi ? (
                      <span style={{ fontSize: 12.5, color: inkSoft }}>—</span>
                    ) : (
                      <button
                        onClick={() => { setMasaSecimi(rezMasalar[r.id] ?? []); setAssigningId(r.id); setOnlinePanel(false); }}
                        style={{ ...hucreKutuBtn, width: "100%" }}
                      >
                        {masalari.length > 0 ? masalari.join(" + ") : "Masa seç"}
                      </button>
                    )}
                  </Cell>
                  <ActionsCell width={190} align="right" gap={6}>
                    {reddedildi ? (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--danger)" }}>Reddedildi</span>
                    ) : (
                      <>
                        <button onClick={() => basvuruOnayla(r)} disabled={busy} style={btnSmallRow}>Onayla</button>
                        <button onClick={() => basvuruReddet(r)} disabled={busy} style={btnGhostRow}>Reddet</button>
                      </>
                    )}
                  </ActionsCell>
                </ListRow>
              );
            })}
          </div>
        </div>
      )}

      {/* KİŞİ KARTI PENCERESİ — mevcut bir rezervasyondaki misafir ikonuna tıklayınca açılır. */}
      {kartFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? "24px 0" : 0, boxSizing: "border-box", zIndex: 55 }} onClick={() => setKartFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, width: "min(560px, 94vw)", maxHeight: isMobile ? "calc(100svh - 48px)" : "calc(100vh - 48px)", overflowY: "auto", overflowX: "hidden", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            {/* İsim ve numara YAN YANA, numara alt satırda değil (Gökhan, 2026-08-15).
                Numaranın üstüne dokununca telefon arama ekranı açılır. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)" }}>{kartFor.guest_name}</span>
                {kartFor.guest_phone ? (
                  <a
                    href={isMobile ? telLinki(kartFor.guest_phone) : waLinki(kartFor.guest_phone)}
                    target={isMobile ? undefined : "_blank"}
                    rel={isMobile ? undefined : "noreferrer"}
                    title={isMobile ? "Ara" : "WhatsApp'ta aç"}
                    className="tnum"
                    style={{ fontSize: 12.5, color: "var(--brand)", textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    Tel : {kartFor.guest_phone}
                  </a>
                ) : (
                  <span style={{ fontSize: 12, color: inkSoft }}>Telefon yok</span>
                )}
              </div>
              <button onClick={() => setKartFor(null)} style={btnSecondary}>Kapat</button>
            </div>
            {/* Mobilde işlem satırda değil kartta (Gökhan: "mobilde işlem yapmak için ismi
                tıklayacak ve kartta halledecek her işi") — masaüstünde bu düğmeler zaten
                listede olduğu için burada tekrar gösterilmiyor. */}
            {isMobile && durumYetkisi && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {/* TELEFON DA WEBLE AYNI AKIŞI KULLANIR (2026-08-29). 28 Ağustos'ta "Geldi"
                    kendi penceresini açtı ve ayrı bir "Oturdu" adımı kalktı; telefon kartı eski
                    akışta kalmıştı. Ayrıca "Geldi" boş masa yokken kapalı geliyordu, oysa artık
                    masa sormuyor. */}
                {kartFor.status === "bekleniyor" && (
                  <>
                    <button
                      onClick={() => (bugunMu ? gelenBaslat(kartFor) : durumDegistir(kartFor, "geldi"))}
                      style={btnSmallRow}
                    >
                      Geldi
                    </button>
                    <button onClick={() => durumDegistir(kartFor, "gelmedi")} style={btnGhostRow}>Gelmedi</button>
                  </>
                )}
                {kartFor.status === "geldi" && (
                  bistroyaGecer(kartFor)
                    ? <button onClick={() => bistroyaGec(kartFor)} disabled={busy} style={btnBistroRow}>Bistro</button>
                    : ayaktayaGecer(kartFor)
                      ? <button onClick={() => ayaktayaGec(kartFor)} disabled={busy} style={btnBistroRow}>Ayakta</button>
                      : <button onClick={() => tamamlandi(kartFor)} disabled={busy} style={btnSmallRow}>Tamam</button>
                )}
                {kartFor.ayakta && (kartFor.status === "bekleniyor" || kartFor.status === "geldi")
                  && bistroSayisi - geceTalep > 0 && bistroSayisi - doluBistro > 0 && (
                  <button onClick={() => ayaktayiBistroyaAl(kartFor)} disabled={busy} style={btnBistroRow}>Bistroya al</button>
                )}
                {kartFor.status === "oturdu" && (
                  <button onClick={() => tamamlandi(kartFor)} disabled={busy} style={btnSmallRow}>Tamam</button>
                )}
                {(kartFor.status === "bekleniyor" || kartFor.status === "geldi") && (
                  <button onClick={() => iptalEt(kartFor)} style={btnGhostRow}>İptal</button>
                )}
              </div>
            )}
            {/* Hesap tutarı buradan kaldırıldı (Gökhan, 2026-08-15: "rezervasyona tamamlandı
                dedikten sonra rezervasyon satırından girilsin") — kartı açar açmaz karşıya
                çıkmasın diye. Girilen tutar aşağıdaki rezervasyon geçmişinde görünüyor. */}
            {/* Kart kısıtlı rollerde başkasının rezervasyonunda zaten hiç açılmıyor — ne
                satırdaki işaret çıkıyor ne de telefonda satır tıklanıyor (Gökhan,
                2026-08-17: "hiçbir şey açılmasın, tıklanamasın"). */}
            {kartFor.guest_phone ? (
              <KisiKartiOzet kart={kartForKart} phone={kartFor.guest_phone} restaurantId={restaurantId} simdi={now} onChanged={() => setKartRefresh((v) => v + 1)} esikMudavim={esikMudavim} esikNoShow={esikNoShow} isMobile={isMobile} />
            ) : kartForGecmis ? (
              <IsimGecmisiOzet gecmis={kartForGecmis} />
            ) : (
              <div style={{ fontSize: 12.5, color: inkSoft }}>Bu isimde başka kayıt yok.</div>
            )}
          </div>
        </div>
      )}

      {/* MASA ATA PENCERESİ — sayfanın en üst seviyesinde, satır/liste kutularının (overflow:
          hidden) İÇİNDE değil. Önceki halde position:fixed olsa da bir satırın (ListRow,
          overflow:hidden) içine yerleştirilmişti, bu yüzden kırpılıp yanlış yerde görünüyordu
          (Gökhan: "yine dışarıda açılıyor, kendi kutusundan açılsın"). Düğmeyle aynı kenarlık
          rengi + hafif gölge + sıfıra yakın boşlukla düğmenin altına yapışık duruyor, ayrı bir
          kutu değil de düğmenin kendisi aşağı açılıyormuş gibi (Gökhan: "farklı bir kutu gibi,
          tıkladığım kutu aşağı açılsın"). */}
      {/* SAĞ TIK MENÜSÜ — şimdilik tek satır: rezervasyonu sil (Gökhan, 2026-08-29). */}
      {silMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setSilMenu(null)} onContextMenu={(e) => { e.preventDefault(); setSilMenu(null); }} />
          <div style={{
            position: "fixed", left: Math.min(silMenu.x, window.innerWidth - 190), top: Math.min(silMenu.y, window.innerHeight - 60),
            zIndex: 91, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(30,25,15,0.16)", padding: 4, minWidth: 176,
          }}>
            <button
              onClick={() => rezSil(silMenu.rez)}
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 13.5, color: "var(--danger)" }}
            >
              <Trash2 size={14} /> Rezervasyonu sil
            </button>
          </div>
        </>
      )}

      {/* MASA KUTUSUNUN SAĞ TIK MENÜSÜ — kilidi aç / kilitle (Gökhan, 2026-08-30). */}
      {kilitMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setKilitMenu(null)} onContextMenu={(e) => { e.preventDefault(); setKilitMenu(null); }} />
          <div style={{
            position: "fixed", left: Math.min(kilitMenu.x, window.innerWidth - 190), top: Math.min(kilitMenu.y, window.innerHeight - 60),
            zIndex: 91, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(30,25,15,0.16)", padding: 4, minWidth: 176,
          }}>
            <button
              onClick={() => { const r = kilitMenu.rez; setKilitMenu(null); kilitDegistir(r); }}
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 13.5, color: "var(--ink)" }}
            >
              {kilitMenu.rez.masa_kilit ? <><Unlock size={14} /> Kilidi aç</> : <><Lock size={14} /> Masayı kilitle</>}
            </button>
          </div>
        </>
      )}

      {/* GELDİ KATMANI — sadece kaç kişi geldiği sorulur, masa sorulmaz (Gökhan, 2026-08-28). */}
      {gelenFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setGelenFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 300, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>{gelenFor.guest_name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Kaç kişi geldi?</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <input
                autoFocus value={gelenKisi}
                onChange={(e) => setGelenKisi(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && gelenOnayla()}
                onFocus={(e) => e.target.select()} inputMode="numeric"
                style={{ ...inp, width: 56, textAlign: "center" }}
              />
              <span style={{ fontSize: 13 }}>kişi</span>
              {/* Kadın/erkek dağılımı isteğe bağlı — kapıda gerçekten ne geldiyse o girilir. */}
              <input
                value={gelenKadin}
                onChange={(e) => setGelenKadin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && gelenOnayla()}
                onFocus={(e) => e.target.select()}
                placeholder="K" title="Gelen kadın sayısı (opsiyonel)" inputMode="numeric"
                style={{ ...inp, width: 40, textAlign: "center", padding: "0 2px" }}
              />
              <input
                value={gelenErkek}
                onChange={(e) => setGelenErkek(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && gelenOnayla()}
                onFocus={(e) => e.target.select()}
                placeholder="E" title="Gelen erkek sayısı (opsiyonel)" inputMode="numeric"
                style={{ ...inp, width: 40, textAlign: "center", padding: "0 2px" }}
              />
            </div>
            {Number(gelenKisi || 0) !== gelenFor.party_size && (
              <div style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600, marginTop: 8 }}>
                Rezervasyon {gelenFor.party_size} kişilikti.
              </div>
            )}
            {gelenTutmuyor() && (
              <div style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600, marginTop: 8 }}>
                {gelenTutmuyor()}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setGelenFor(null)} style={btnSecondary}>Vazgeç</button>
              <button onClick={gelenOnayla} disabled={busy || !!gelenTutmuyor()} style={{ ...btnPrimary, opacity: gelenTutmuyor() ? 0.5 : 1 }}>Geldi</button>
            </div>
          </div>
        </div>
      )}

      {/* OTURT KATMANI */}
      {seatingFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setSeatingFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>{seatingFor.guest_name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>Hangi masaya oturtuyorsun?</span>
              {/* Kapıda gerçekten kaç kişi geldi — rezervasyondaki sayı hazır gelir, farklıysa
                  burada düzeltilir (Gökhan, 2026-08-12: "kapıda hemen girilmesi gerekli"). */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span>Gelen</span>
                <input
                  value={gelenKisi}
                  onChange={(e) => setGelenKisi(e.target.value.replace(/\D/g, ""))}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  style={{ ...inp, width: 52, padding: "5px 6px", textAlign: "center" }}
                />
                <span>kişi</span>
                {/* Gelenin kadın/erkek dağılımı — rezervasyondaki dağılım kopyalanmıyor, kapıda
                    gerçekten ne geldiyse o giriliyor (Gökhan, 2026-08-24). İsteğe bağlı. */}
                <input
                  value={gelenKadin}
                  onChange={(e) => setGelenKadin(e.target.value.replace(/\D/g, ""))}
                  onFocus={(e) => e.target.select()}
                  placeholder="K" title="Gelen kadın sayısı (opsiyonel)" inputMode="numeric"
                  style={{ ...inp, width: 34, padding: "5px 2px", textAlign: "center" }}
                />
                <input
                  value={gelenErkek}
                  onChange={(e) => setGelenErkek(e.target.value.replace(/\D/g, ""))}
                  onFocus={(e) => e.target.select()}
                  placeholder="E" title="Gelen erkek sayısı (opsiyonel)" inputMode="numeric"
                  style={{ ...inp, width: 34, padding: "5px 2px", textAlign: "center" }}
                />
                {Number(gelenKisi || 0) !== seatingFor.party_size && (
                  <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                    (rezervasyon {seatingFor.party_size})
                  </span>
                )}
              </span>
            </div>
            {gelenTutmuyor() && (
              <div style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600, marginBottom: 8 }}>
                {gelenTutmuyor()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto", overflowX: "hidden" }}>
              {seatingUygun.length === 0 && seatingDiger.length === 0 && <div style={{ fontSize: 11.5, color: inkSoft, padding: "4px 0" }}>Boş masa yok.</div>}
              {seatingUygun.map((t) => {
                const secili = masaSecimi.includes(t.id);
                return (
                  <button
                    key={t.id} onClick={() => seatingToggle(t.id)} disabled={busy}
                    style={{ ...btnSecondary, justifyContent: "space-between", display: "flex", border: secili ? "1px solid var(--brand-strong)" : undefined, background: secili ? "var(--brand-strong)" : undefined, color: secili ? "#fff" : undefined }}
                  >
                    <span>{t.name}</span>
                    <span className="tnum" style={{ color: secili ? "#fff" : "var(--muted)" }}>{t.seat_count} pax</span>
                  </button>
                );
              })}
              {seatingDiger.length > 0 && (
                <>
                  {seatingUygun.length > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: "uppercase", padding: "4px 0 2px" }}>Birleştirmek için</div>}
                  {seatingDiger.map((t) => {
                    const secili = masaSecimi.includes(t.id);
                    return (
                      <button
                        key={t.id} onClick={() => seatingToggle(t.id)} disabled={busy}
                        style={{ ...btnSecondary, justifyContent: "space-between", display: "flex", border: secili ? "1px solid var(--brand-strong)" : undefined, background: secili ? "var(--brand-strong)" : undefined, color: secili ? "#fff" : undefined }}
                      >
                        <span>{t.name}</span>
                        <span className="tnum" style={{ color: secili ? "#fff" : "var(--muted)" }}>{t.seat_count} pax</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            {masaSecimi.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="tnum" style={{ fontSize: 11, color: seatingSeciliKisi >= seatingFor.party_size ? "var(--brand-strong)" : inkSoft }}>
                  {masaSecimi.length} masa · {seatingSeciliKisi}/{seatingFor.party_size} kişi{seatingSeciliKisi >= seatingFor.party_size ? " ✓" : ""}
                </span>
                {seatingSeciliKisi < seatingFor.party_size && (
                  <button onClick={() => oturt(masaSecimi)} disabled={busy} style={{ ...btnGhostRow, color: "var(--gold-text)" }}>Yine de oturt</button>
                )}
              </div>
            )}
            <button onClick={() => { setSeatingFor(null); setMasaSecimi([]); }} style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--muted)", marginTop: 14, display: "block" }}>Vazgeç</button>
          </div>
        </div>
      )}

      {/* SAAT / TELEFON / KİŞİ / NOT PENCERESİ — masa seç penceresiyle aynı yerleşim. */}
      {duzenle && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setDuzenle(null)} />
          <div style={{ position: "fixed", left: duzenle.konum.left + duzenle.konum.width / 2, transform: "translateX(-50%)", ...(duzenle.konum.yukari ? { bottom: duzenle.konum.altSinir } : { top: duzenle.konum.top }), zIndex: 61, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10, boxShadow: "0 2px 8px rgba(30,25,15,0.1)", padding: "2mm", boxSizing: "border-box", width: "max-content", minWidth: 170, maxWidth: 260 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: "uppercase", paddingBottom: 4 }}>{DUZENLE_BASLIK[duzenle.alan]}</div>
            <input
              autoFocus
              value={duzenleDeger}
              onChange={(e) => setDuzenleDeger(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); duzenleKaydet(); } if (e.key === "Escape") setDuzenle(null); }}
              onFocus={duzenle.alan === "pax" ? (e) => e.target.select() : undefined}
              placeholder={DUZENLE_IPUCU[duzenle.alan]}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              inputMode={duzenle.alan === "not" ? "text" : "numeric"}
              style={{ ...inp, width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: 12.5 }}
            />
            {duzenle.alan === "pax" && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  value={duzenleKadin} onChange={(e) => setDuzenleKadin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); duzenleKaydet(); } if (e.key === "Escape") setDuzenle(null); }}
                  onFocus={(e) => e.target.select()}
                  placeholder="K" title="Kadın sayısı (opsiyonel)" inputMode="numeric"
                  style={{ ...inp, width: 36, flexShrink: 0, boxSizing: "border-box", padding: "6px 4px", fontSize: 12.5, textAlign: "center" }}
                />
                <input
                  value={duzenleErkek} onChange={(e) => setDuzenleErkek(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); duzenleKaydet(); } if (e.key === "Escape") setDuzenle(null); }}
                  onFocus={(e) => e.target.select()}
                  placeholder="E" title="Erkek sayısı (opsiyonel)" inputMode="numeric"
                  style={{ ...inp, width: 36, flexShrink: 0, boxSizing: "border-box", padding: "6px 4px", fontSize: 12.5, textAlign: "center" }}
                />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
              <button onClick={() => setDuzenle(null)} style={{ ...btnGhostRow, fontSize: 11.5 }}>Vazgeç</button>
              <button onClick={duzenleKaydet} style={{ ...btnSmallRow, fontSize: 11.5 }}>Kaydet</button>
            </div>
          </div>
        </>
      )}

      {/* NOT BALONU — fare notun üzerine gelince notun tamamı okunuyor, tıklamaya gerek yok
          (Gökhan, 2026-08-18). Fare balonu kapatmasın diye tıklamayı geçirmiyor. */}
      {notBalon && (
        <div style={{
          position: "fixed", left: notBalon.kutu.left, top: notBalon.kutu.bottom + 4, zIndex: 62,
          maxWidth: 420, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10,
          boxShadow: "0 2px 8px rgba(30,25,15,0.1)", padding: "2mm 3mm", boxSizing: "border-box",
          fontSize: 12, lineHeight: 1.35, color: "var(--ink)", whiteSpace: "pre-wrap", pointerEvents: "none",
        }}>
          {notBalon.metin}
        </div>
      )}


      {/* MASA BOŞALDI — BEKLEYENLER (Gökhan, 2026-08-18). Karşılamanın önüne çıkar, sadece
          boşalan masaya sığan bekleyenleri gösterir, en uzun bekleyen en üstte. Sığan kimse
          kalmadıysa kutu kendiliğinden kapanır. "Sonra" denince kapanır, sıra durur. */}
      {bosalanMasa && bekleyenRows.some((b) => b.party_size <= bosalanMasa.koltuk) && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 70 }} onClick={() => setBosalanMasa(null)} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 71, width: "min(460px, 92vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, boxShadow: "0 18px 50px rgba(30,57,50,.18)", boxSizing: "border-box" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 2 }}>
              {bosalanMasa.ad} boşaldı
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
              {bosalanMasa.koltuk} kişilik. Kimi oturtacağını seç — masayı program veriyor,
              ayrıca masa seçmen gerekmiyor.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto", overflowX: "hidden" }}>
              {bekleyenRows.filter((b) => b.party_size <= bosalanMasa.koltuk).map((b) => {
                const bekledi = b.bekleme_baslangic
                  ? Math.max(0, Math.round((now - new Date(b.bekleme_baslangic).getTime()) / 60000))
                  : null;
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.guest_name}</span>
                    <span className="tnum" style={{ fontSize: 12.5, color: inkSoft, flexShrink: 0 }}>{b.party_size} pax</span>
                    <span className="tnum" style={{ fontSize: 12.5, color: bekledi !== null && bekledi >= 30 ? "var(--danger)" : inkSoft, flexShrink: 0 }}>
                      {bekledi === null ? "" : bekledi < 60 ? `${bekledi} dk` : `${Math.floor(bekledi / 60)}s ${bekledi % 60}dk`}
                    </span>
                    <button
                      onClick={() => bekleyeniBosalanMasayaOturt(b, bosalanMasa.masaIds)}
                      disabled={busy}
                      title={`${bosalanMasa.ad} masasına oturt`}
                      style={{ ...btnSmall, opacity: busy ? 0.5 : 1 }}
                    >
                      Oturt
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setBosalanMasa(null)} style={btnSecondary}>Sonra</button>
            </div>
          </div>
        </>
      )}

      {/* MASA BALONU — birden fazla masa varsa hepsi alt alta, esas masa en üstte. Aşağıda
          yer kalmadıysa kutunun üstüne açılıyor (Gökhan, 2026-08-18). */}
      {masaBalon && (
        <div style={{
          position: "fixed", left: masaBalon.kutu.left + masaBalon.kutu.width / 2, transform: "translateX(-50%)",
          ...(masaBalon.kutu.bottom + 8 + masaBalon.masalar.length * 20 > window.innerHeight
            ? { bottom: window.innerHeight - masaBalon.kutu.top + 4 }
            : { top: masaBalon.kutu.bottom + 4 }),
          zIndex: 62, minWidth: masaBalon.kutu.width, background: "var(--card)", border: "1px solid var(--line-2)",
          borderRadius: 10, boxShadow: "0 2px 8px rgba(30,25,15,0.1)", padding: "1.5mm 2mm", boxSizing: "border-box",
          pointerEvents: "none", display: "flex", flexDirection: "column", gap: 2,
        }}>
          {masaBalon.masalar.map((ad, i) => (
            <span key={ad} style={{ fontSize: 12, lineHeight: 1.2, textAlign: "center", color: "var(--ink)", fontWeight: i === 0 ? 600 : 400 }}>
              {ad}
            </span>
          ))}
        </div>
      )}

      {/* PAX FİLTRESİ — başlıktan açılır, o gün var olan kişi sayıları listelenir. */}
      {paxFiltreKonum && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setPaxFiltreKonum(null)} />
          <div style={{ position: "fixed", left: paxFiltreKonum.left + paxFiltreKonum.width / 2, transform: "translateX(-50%)", ...(paxFiltreKonum.yukari ? { bottom: paxFiltreKonum.altSinir } : { top: paxFiltreKonum.top }), zIndex: 61, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10, boxShadow: "0 2px 8px rgba(30,25,15,0.1)", padding: "2mm", boxSizing: "border-box", width: "max-content", minWidth: 120, maxHeight: 280, overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none" }}>
            <button onClick={() => { setPaxFiltre(null); setPaxFiltreKonum(null); }} style={masaBtnStil(paxFiltre === null)}>Tümü</button>
            {paxSecenekleri.map((p) => (
              <button key={p} onClick={() => { setPaxFiltre(p); setPaxFiltreKonum(null); }} style={masaBtnStil(paxFiltre === p)}>
                <span className="tnum">{p}</span> kişi
              </button>
            ))}
            {paxSecenekleri.length === 0 && <div style={{ fontSize: 11.5, color: inkSoft, padding: "4px 0" }}>Kayıt yok.</div>}
          </div>
        </>
      )}

      {/* İPTAL KATMANI — sebep opsiyonel, boş bırakılabilir. */}
      {/* DİLİM DEĞİŞTİRME (Gökhan, 2026-08-27) — satırdaki rozete basınca açılır. Masa ata
          penceresiyle aynı konumlandırma ve aynı görünüm. */}
      {dilimFor && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setDilimFor(null)} />
          <div style={{ position: "fixed", left: dilimFor.konum.left + dilimFor.konum.width / 2, transform: "translateX(-50%)", ...(dilimFor.konum.yukari ? { bottom: dilimFor.konum.altSinir } : { top: dilimFor.konum.top }), zIndex: 61, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10, boxShadow: "0 2px 8px rgba(30,25,15,0.1)", padding: "2mm", boxSizing: "border-box", width: "max-content", minWidth: 150 }}>
            {[...DILIMLER, ...(bistroSayisi - geceTalep <= 0 ? AYAKTA_SECENEKLERI : [])].map((d) => (
              <button key={d.anahtar} onClick={() => dilimDegistir(dilimFor.rez, d.anahtar)} style={masaBtnStil(turSecimi(dilimFor.rez.dilim, dilimFor.rez.ayakta) === d.anahtar)}>
                {d.ad}
              </button>
            ))}
          </div>
        </>
      )}

      {iptalFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setIptalFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>{iptalFor.guest_name} rezervasyonu iptal edilsin mi?</div>
            <input
              autoFocus value={iptalReason} onChange={(e) => setIptalReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && iptalOnayla()}
              placeholder="İptal sebebi (opsiyonel)" style={{ ...inp, width: "100%", marginTop: 12 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setIptalFor(null)} style={btnSecondary}>Hayır</button>
              <button onClick={iptalOnayla} style={btnPrimary}>Evet</button>
            </div>
          </div>
        </div>
      )}

      <RezervasyonAltNav mobil={isMobile} />
    </div>
  );
}

// fontSize 16 — iOS Safari, 16px altındaki bir input'a dokununca sayfayı otomatik
// yakınlaştırıyor (Gökhan, 2026-08-08: "özele tıkladığında ekran büyüyor"). 16 ve üzeri
// bu yakınlaştırmayı hiç tetiklemiyor, tarayıcının kendi kuralı.
// Kutu ölçüsü aynı kalsın diye K/E alanlarında yan boşluk 10 → 2 düşürülüyor (Gökhan,
// 2026-08-15: "11 yazdım rakamın sadece 1 tanesi göründü"). Kutu 34px, yan dolgu 10'ken
// yazıya kalan yer 12px'ti, tek hane sığıyordu; 2'ye inince 28px kalıyor, çift hane sığar.
// Yazı boyu 16'da bırakıldı — telefonda daha küçüğü kutuya odaklanınca ekranı yakınlaştırır.
const inp = kutuDar;
const btnPrimary = dugmeAnaSatir;
const btnSecondary = dugmeIkincil;
const btnSmall = dugmeKucuk;
const btnGhost = dugmeSilik;
const btnSmallRow: React.CSSProperties = { ...btnSmall, padding: "4px calc(14px - 1.5mm)" };
// "BİSTROYA GEÇ" AYRI RENKTE (Gökhan, 2026-08-29: "tamamlandı ile bistroya geç aynı renk,
// farklı ve belirgin bir renk olsun ama renk çizgimize uysun"). Altın, programın gece
// tarafının rengi — sayaçlarda dolu bistro da altın yanıyor. Zemin açık olduğu için yazı koyu.
const btnBistroRow: React.CSSProperties = { ...btnSmallRow, background: "var(--gold)", color: "var(--ink)", fontWeight: 600 };
const btnGhostRow: React.CSSProperties = { ...btnGhost, padding: "4px calc(12px - 1.5mm)" };
const inkSoft = "#5c5c58";
const masaSecBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 8, fontSize: 12.5, color: "var(--ink)" };
// Kutu SADECE masa sütununda kaldı — "Masa seç" ve seçili masa (Gökhan: "eklediğimiz
// kutuları masa seç ve seçili masalar dışında hepsini kaldır"). Sıra no, saat, telefon,
// kişi ve not yeniden düz yazı — alt çizgi yok (Gökhan: "yazıların altındaki çizgileri kaldır").
const hucreYaziBtn: React.CSSProperties = { all: "unset", cursor: "pointer", whiteSpace: "nowrap" };

// ─────────────────────────────────────────────────────────────────────────────
// LİSTE SÜTUNLARI — TEK KAYNAK (Gökhan, 2026-08-18: "yamalı halden kurtar,
// baştan yap"). Başlık satırı da rezervasyon satırları da BU tablodan çiziliyor;
// eskiden ikisi ayrı ayrı elle kaydırılıyordu (eksi milimetreler) ve sürekli
// birbirinden kayıyordu. Artık bir sütunu daraltmak = aşağıdaki tek sayıyı
// değiştirmek; başlık, satır ve aradaki çizgi kendiliğinden yerini bulur.
//
// Sütunlar arasındaki boşluğu AYRAC yuvası veriyor; yuva hem başlıkta hem satırda
// görünmez (Gökhan, 2026-08-18: "başlıklar arasındaki çizgileri kaldır") — o yüzden
// satırların kendi kolon aralığı 0.
const AYRAC = 10;
// Masa kutusunun yanında kilide ayrılan yer — kutu her satırda aynı boyda kalsın
// diye kilit çizilmese de duruyor (Gökhan, 2026-08-18).
const KILIT_YERI = 17;
// Geldi + Gelmedi + İptal düğmelerinin kapladığı alan. Başlık da satırdaki düğmeler
// de bu genişliğe göre yerleşiyor, o yüzden başlık düğmelerin tam ortasında çıkıyor.
const DURUM_ALANI = 142;
// Sabit sütunların toplamı ekranın tamamını yemesin — geri kalan yeri NOT sütunu alıyor,
// pencere daraldığında da daralan hep o oluyor (Gökhan, 2026-08-15).
const SUTUN = {
  sn: 26,
  zaman: 50,
  misafir: 140,
  telefon: 88,
  pax: 40,
  // GELEN — kapıda gerçekleşen sayı (Gökhan, 2026-08-24). Pax ile aynı biçim, aynı genişlik:
  // üstte sayı, altında küçük "2K 3E".
  gelen: 40,
  masa: 106,
  // Rezervasyonu kimin aldığı — sadece sol menü kapalıyken açılan sütun (Gökhan, 2026-08-20).
  kaydeden: 96,
  // NOT sütunu esnek ama sınırsız değil: geniş ekranda satırın yarısını kaplıyordu
  // (Gökhan, 2026-08-30: "notun kapladığı alanı küçült").
  notEnFazla: 150,
  durum: DURUM_ALANI + 18, // düğme alanı + kenar boşluğu (4 mm)
} as const;
// Durum düğmelerinin satır kenarına bıraktığı boşluk (Gökhan: "kutunun sonu ile
// aralarında 4 mm olsun").
const DURUM_KENAR = "4mm";
// Masa adının yazdığı kutu — genişliğini artık sütun belirliyor (SUTUN.masa eksi kilit
// yeri), o yüzden burada elle daraltma yok (Gökhan, 2026-08-18).
const hucreKutu: React.CSSProperties = {
  boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
  width: "100%", height: 28, padding: "0 8px",
  border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)",
  fontSize: 12.5, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const hucreKutuBtn: React.CSSProperties = { all: "unset", ...hucreKutu, cursor: "pointer" };
const navBtn = dugmeSimge;
