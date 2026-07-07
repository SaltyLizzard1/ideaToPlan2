import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Header from "@/components/Header";

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
  title: "IdeaToPlan — Start Your Business Today",
  description:
    "Take the free skills assessment inspired by What Color Is Your Parachute? and discover the business you're actually built to run. Turn your top match into a real business plan.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  openGraph: {
    title: "IdeaToPlan — It's Never Been Easier to Start Your Own Business",
    description:
      "Discover the business you're built to run. Free skills assessment + done-for-you business plans.",
    url: "https://ideatoplan.to",
    siteName: "IdeaToPlan",
    images: [{ url: "/og-image.png", width: 400, height: 400, alt: "IdeaToPlan" }],
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
        <div style={{ paddingTop: "64px" }}>{children}</div>
        {/* Tawk.to chat — disabled; re-enable by restoring the Script block */}
      </body>
    </html>
  );
}
