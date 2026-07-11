"use client";

import Link from "next/link";
import AnimatedLogo from "@/components/AnimatedLogo";

const NAV_LINKS = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function Footer() {
  return (
    <footer style={{ background: "#0d0d0f", borderTop: "1px solid rgba(201,160,48,0.18)" }}>
      <div
        className="mx-auto flex flex-col md:flex-row items-center md:items-start justify-between gap-6"
        style={{ maxWidth: "1200px", padding: "2rem 2rem 1.25rem" }}
      >
        {/* Brand */}
        <div className="flex flex-col items-center md:items-start gap-2">
          <span style={{ display: "block", width: "150px" }}>
            <AnimatedLogo showTagline={false} animate={false} className="w-full h-auto" />
          </span>
          <p className="font-sans text-sm" style={{ color: "#cfc9b8" }}>
            It&apos;s never been easier to start your own business.
          </p>
        </div>

        {/* Nav */}
        <nav className="flex flex-col items-center md:items-start gap-2">
          <p
            className="font-sans text-xs uppercase tracking-widest"
            style={{ color: "#E8C84A", letterSpacing: "0.18em" }}
          >
            Navigate
          </p>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-sans text-sm transition-colors"
              style={{ color: "#cfc9b8" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#FBF6E3")}
              onMouseLeave={e => (e.currentTarget.style.color = "#cfc9b8")}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Services */}
        <div className="flex flex-col items-center md:items-start gap-2">
          <p
            className="font-sans text-xs uppercase tracking-widest"
            style={{ color: "#E8C84A", letterSpacing: "0.18em" }}
          >
            Services
          </p>
          {["Skills Assessment", "Business Matching", "Business Plans", "Visa-Ready Plans"].map(
            (item) => (
              <span key={item} className="font-sans text-sm" style={{ color: "#cfc9b8" }}>
                {item}
              </span>
            )
          )}
        </div>

        {/* Contact */}
        <div className="flex flex-col items-center md:items-start gap-2">
          <p
            className="font-sans text-xs uppercase tracking-widest"
            style={{ color: "#E8C84A", letterSpacing: "0.18em" }}
          >
            Contact
          </p>
          <Link
            href="/contact"
            className="font-sans text-sm"
            style={{ color: "#cfc9b8" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#FBF6E3")}
            onMouseLeave={e => (e.currentTarget.style.color = "#cfc9b8")}
          >
            Get in touch
          </Link>
          <a
            href="mailto:ideatoplanincome@gmail.com"
            className="font-sans text-sm"
            style={{ color: "#cfc9b8" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#FBF6E3")}
            onMouseLeave={e => (e.currentTarget.style.color = "#cfc9b8")}
          >
            ideatoplanincome@gmail.com
          </a>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-2"
        style={{
          maxWidth: "1200px",
          padding: "0.75rem 2rem",
          borderTop: "1px solid rgba(201,160,48,0.08)",
        }}
      >
        <p className="font-sans text-xs" style={{ color: "#a89f8a" }}>
          © {new Date().getFullYear()} IdeaToPlan. All rights reserved.
        </p>
        <div className="flex gap-5">
          {[
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="font-sans text-xs"
              style={{ color: "#a89f8a" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#FBF6E3")}
              onMouseLeave={e => (e.currentTarget.style.color = "#a89f8a")}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
