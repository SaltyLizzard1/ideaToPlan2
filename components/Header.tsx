"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AnimatedLogo from "@/components/AnimatedLogo";

const NAV_LINKS = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Sample Plans", href: "/sample-plan" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

// The two entry paths: free assessment, or straight to the paid plan section.
const ASSESSMENT_HREF = "/assessment";
const PLAN_HREF = "/#pricing";

const OUTLINE_CTA_STYLE = {
  color: "#E8C84A",
  border: "1.5px solid #C9A030",
} as const;

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "#0D1117",
        height: "80px",
      }}
    >
      {/* The bar is full bleed, its contents sit in the shared container so the
          logo lines up with every section below it. */}
      <div className="page-container flex items-center justify-between h-full">
        {/* Logo, icon-only on homepage, wordmark on subpages */}
        <Link href="/" className="shrink-0">
          <span style={{ display: "block", width: "clamp(130px, 13vw, 170px)" }}>
            <AnimatedLogo key={pathname} showTagline={false} animate={true} className="w-full h-auto" />
          </span>
        </Link>

        {/* Desktop nav, from lg up: below that the links and both CTAs do not fit on one line */}
        <nav className="hidden lg:flex items-center gap-s6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-sans text-sm transition-colors whitespace-nowrap"
              style={{ color: "#cfc9b8" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E8C84A")}
              onMouseLeave={e => (e.currentTarget.style.color = "#cfc9b8")}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden lg:flex items-center gap-s3 shrink-0">
          <Link
            href={ASSESSMENT_HREF}
            className="inline-flex items-center rounded-full font-sans font-semibold text-sm cursor-pointer cta-shimmer gold-border whitespace-nowrap"
            style={{
              color: "#2D1A00",
              padding: "0.5rem 1.4rem",
              boxShadow: "0 8px 32px rgba(139,105,20,0.35)",
            }}
          >
            Find Business Ideas
          </Link>
          <Link
            href={PLAN_HREF}
            className="inline-flex items-center rounded-full font-sans font-semibold text-sm cursor-pointer whitespace-nowrap transition-colors hover:bg-[rgba(201,160,48,0.12)]"
            style={{ ...OUTLINE_CTA_STYLE, padding: "0.5rem 1.4rem" }}
          >
            Build a Plan
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden flex flex-col justify-center gap-1.5 p-s2 cursor-pointer"
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
      </div>

      {/* Gold rule under the bar, full bleed */}
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

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="absolute top-[80px] left-0 right-0 flex flex-col items-center gap-5 py-s5 lg:hidden"
          style={{
            background: "#0D1117",
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
          <Link
            href={ASSESSMENT_HREF}
            onClick={() => setMenuOpen(false)}
            className="cta-shimmer gold-border rounded-full font-sans font-semibold text-sm cursor-pointer"
            style={{
              color: "#2D1A00",
              padding: "0.6rem 1.75rem",
              boxShadow: "0 8px 32px rgba(139,105,20,0.35)",
            }}
          >
            Find Business Ideas
          </Link>
          <Link
            href={PLAN_HREF}
            onClick={() => setMenuOpen(false)}
            className="rounded-full font-sans font-semibold text-sm cursor-pointer"
            style={{ ...OUTLINE_CTA_STYLE, padding: "0.6rem 1.75rem" }}
          >
            Build a Plan
          </Link>
        </div>
      )}
    </header>
  );
}
