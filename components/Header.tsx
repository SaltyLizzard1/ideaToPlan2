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

  const handleAssessment = () => {
    if (pathname === "/") {
      document.getElementById("assessment")?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = "/#assessment";
    }
    setMenuOpen(true);
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between"
      style={{
        background: "linear-gradient(90deg, #0d0d0f 0%, #1d1707 35%, #241c08 50%, #1d1707 65%, #0d0d0f 100%)",
        padding: "0 2rem",
        height: "80px",
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: "linear-gradient(90deg, transparent 0%, #8B6914 20%, #E8C84A 50%, #8B6914 80%, transparent 100%)",
        }}
      />
      {/* Logo — icon-only on homepage, wordmark on subpages */}
      <Link href="/" className="shrink-0">
        <span style={{ display: "block", width: "clamp(130px, 13vw, 170px)" }}>
          <AnimatedLogo key={pathname} showTagline={false} animate={true} className="w-full h-auto" />
        </span>
      </Link>

      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-8">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="font-sans text-sm transition-colors"
            style={{ color: "#cfc9b8" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#E8C84A")}
            onMouseLeave={e => (e.currentTarget.style.color = "#cfc9b8")}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Desktop CTA */}
      <button
        onClick={handleAssessment}
        className="hidden md:inline-flex items-center gap-2 rounded-full font-sans font-semibold text-sm cursor-pointer gold-gradient gold-border shrink-0"
        style={{
          color: "#2D1A00",
          padding: "0.5rem 1.4rem",
          boxShadow: "0 8px 32px rgba(139,105,20,0.35)",
          transition: "filter 0.15s ease",
        }}
        onMouseEnter={e => (e.currentTarget.style.filter = "brightness(1.1)")}
        onMouseLeave={e => (e.currentTarget.style.filter = "brightness(1)")}
      >
        Take the Assessment
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
              background: "#E8C84A",
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
          className="absolute top-[80px] left-0 right-0 flex flex-col items-center gap-5 py-6 md:hidden"
          style={{
            background: "#14100a",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "2px",
              background: "linear-gradient(90deg, transparent 0%, #8B6914 20%, #E8C84A 50%, #8B6914 80%, transparent 100%)",
            }}
          />
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-sans text-base"
              style={{ color: "#FBF6E3" }}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleAssessment}
            className="gold-gradient gold-border rounded-full font-sans font-semibold text-sm cursor-pointer"
            style={{
              color: "#2D1A00",
              padding: "0.6rem 1.75rem",
              boxShadow: "0 8px 32px rgba(139,105,20,0.35)",
            }}
          >
            Take the Assessment
          </button>
        </div>
      )}
    </header>
  );
}
