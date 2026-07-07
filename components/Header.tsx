"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AnimatedLogo from "@/components/AnimatedLogo";

const NAV_LINKS = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const handleQuiz = () => {
    if (pathname === "/") {
      document.getElementById("quiz")?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = "/#quiz";
    }
    setMenuOpen(false);
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between"
      style={{
        background: "rgba(13,17,23,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(201,160,48,0.12)",
        padding: "0 2rem",
        height: "64px",
      }}
    >
      {/* Logo */}
      <Link href="/" className="shrink-0">
        <span style={{ display: "block", width: "clamp(110px, 12vw, 150px)" }}>
            <AnimatedLogo showTagline={false} className="w-full h-auto" />
          </span>
      </Link>

      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-8">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="font-sans text-sm transition-colors"
            style={{ color: "#9CA3AF" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#C9A030")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Desktop CTA */}
      <button
        onClick={handleQuiz}
        className="hidden md:inline-flex items-center gap-2 rounded-full font-sans font-semibold text-sm cursor-pointer gold-gradient gold-border shrink-0"
        style={{
          color: "#2D1A00",
          padding: "0.5rem 1.4rem",
          transition: "filter 0.15s ease",
        }}
        onMouseEnter={e => (e.currentTarget.style.filter = "brightness(1.1)")}
        onMouseLeave={e => (e.currentTarget.style.filter = "brightness(1)")}
      >
        Take the Quiz
      </button>

      {/* Mobile hamburger */}
      <button
        className="md:hidden flex flex-col justify-center gap-1.5 p-2 cursor-pointer"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block rounded-full transition-all"
            style={{
              width: "22px",
              height: "2px",
              background: "#C9A030",
              transformOrigin: "center",
              transform:
                menuOpen
                  ? i === 0 ? "rotate(45deg) translate(3px, 3px)"
                  : i === 1 ? "scaleX(0)"
                  : "rotate(-45deg) translate(3px, -3px)"
                  : "none",
              opacity: menuOpen && i === 1 ? 0 : 1,
            }}
          />
        ))}
      </button>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="absolute top-[64px] left-0 right-0 flex flex-col items-center gap-5 py-6 md:hidden"
          style={{
            background: "rgba(13,17,23,0.97)",
            borderBottom: "1px solid rgba(201,160,48,0.12)",
          }}
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-sans text-base"
              style={{ color: "#D1D5DB" }}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleQuiz}
            className="gold-gradient gold-border rounded-full font-sans font-semibold text-sm cursor-pointer"
            style={{ color: "#2D1A00", padding: "0.6rem 1.75rem" }}
          >
            Take the Quiz
          </button>
        </div>
      )}
    </header>
  );
}
