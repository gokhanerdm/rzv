import { redirect } from "next/navigation";

// Kök adres doğrudan RZV'ye açılır (Gökhan, 2026-08-07: "bizim linkimizin direkt rzv yi
// açması gerek"). Oturum yoksa rezervasyonun kendi giriş ekranına düşer.
export default function Home() {
  redirect("/rezervasyon");
}
