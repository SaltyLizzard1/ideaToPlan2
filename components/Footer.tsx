import Link from "next/link";

const NAV_LINKS = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function Footer() {
  return (
    <footer style={{ background: "#0D1117", borderTop: "1px solid rgba(201,160,48,0.12)" }}>
      <div
        className="mx-auto flex flex-col md:flex-row items-center md:items-start justify-between gap-8"
        style={{ maxWidth: "1200px", padding: "3rem 2rem 2rem" }}
      >
        {/* Brand */}
        <div className="flex flex-col items-center md:items-start gap-2">
          <img src="/logo.svg" alt="IdeaToPlan" style={{ width: "140px", height: "auto" }} />
          <p className="font-sans text-sm" style={{ color: "#6B7280" }}>
            It&apos;s never been easier to start your own business.
          </p>
        </div>

        {/* Nav */}
        <nav className="flex flex-col items-center md:items-start gap-3">
          <p className="font-sans text-xs uppercase tracking-widest" style={{ color: "#C9A030", letterSpacing: "0.18em" }}>
            Navigate
          </p>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-sans text-sm transition-colors"
              style={{ color: "#6B7280" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#C9A030")}
              onMouseLeave={e => (e.currentTarget.style.color = "#6B7280")}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Services */}
        <div className="flex flex-col items-center md:items-start gap-3">
          <p className="font-sans text-xs uppercase tracking-widest" style={{ color: "#C9A030", letterSpacing: "0.18em" }}>
            Services
          </p>
          {["Skills Assessment", "Business Matching", "Business Plans", "Visa-Ready Plans"].map((item) => (
            <span key={item} className="font-sans text-sm" style={{ color: "#6B7280" }}>
              {item}
            </span>
          ))}
        </div>

        {/* Contact */}
        <div className="flex flex-col items-center md:items-start gap-3">
          <p className="font-sans text-xs uppercase tracking-widest" style={{ color: "#C9A030", letterSpacing: "0.18em" }}>
            Contact
          </p>
          <Link
            href="/contact"
            className="font-sans text-sm"
            style={{ color: "#6B7280" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#C9A030")}
            onMouseLeave={e => (e.currentTarget.style.color = "#6B7280")}
          >
            Get in touch
          </Link>
          <a
            href="mailto:ideatoplanincome@gmail.com"
            className="font-sans text-sm"
            style={{ color: "#6B7280" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#C9A030")}
            onMouseLeave={e => (e.currentTarget.style.color = "#6B7280")}
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
          padding: "1rem 2rem",
          borderTop: "1px solid rgba(201,160,48,0.08)",
        }}
      >
        <p className="font-sans text-xs" style={{ color: "#374151" }}>
          © {new Date().getFullYear()} IdeaToPlan. All rights reserved.
        </p>
        <div className="flex gap-5">
          {["Privacy Policy", "Terms of Service"].map((item) => (
            <Link
              key={item}
              href="#"
              className="font-sans text-xs"
              style={{ color: "#374151" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#6B7280")}
              onMouseLeave={e => (e.currentTarget.style.color = "#374151")}
            >
              {item}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
