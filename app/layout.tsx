import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

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
  openGraph: {
    title: "IdeaToPlan — It's Never Been Easier to Start Your Own Business",
    description:
      "Discover the business you're built to run. Free skills assessment + done-for-you business plans.",
    url: "https://ideatoplan.to",
    siteName: "IdeaToPlan",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${cormorant.variable} ${inter.variable}`}>
      <body className="min-h-full antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
