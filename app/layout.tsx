import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import Header from "@/components/Header";
import ScrollManager from "@/components/ScrollManager";
import { BASE_URL } from "@/lib/seo";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "IdeaToPlan: Start Your Business Today",
  description:
    "Take the free skills assessment inspired by What Color Is Your Parachute? and discover the business you're built to run. Turn your top match into a real business plan.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  openGraph: {
    title: "IdeaToPlan: It's Never Been Easier to Start Your Own Business",
    description:
      "Discover the business you're built to run. Free skills assessment + done-for-you business plans.",
    url: "https://ideatoplan.to",
    siteName: "IdeaToPlan",
    images: [{ url: "/og-ideatoplan-dark.png", width: 1200, height: 630, alt: "IdeaToPlan: Shape your future. Start today." }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${cormorant.variable} ${inter.variable}`}>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        <Header />
        <ScrollManager />
        {children}
        {/* Tawk.to chat — disabled; re-enable by restoring the Script block */}
        <GoogleAnalytics gaId="G-VZSW0DM03F" />
      </body>
    </html>
  );
}
