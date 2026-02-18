import { IBM_Plex_Mono, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata = {
  title: "Stat Funnel",
  description: "Growth dashboard for subscription iOS apps",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  );
}
