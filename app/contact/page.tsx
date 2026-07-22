export default function ContactPage() {
  return (
    <main style={{ background: "#0D1117", minHeight: "100vh" }}>
      <section
        className="mx-auto flex flex-col items-center text-center"
        style={{ maxWidth: "600px", padding: "3rem 2rem 4rem" }}
      >
        <p
          className="font-sans uppercase tracking-widest text-xs mb-4"
          style={{ color: "#C9A030", letterSpacing: "0.22em" }}
        >
          Contact
        </p>
        <h1
          className="font-serif font-bold leading-tight mb-4"
          style={{ color: "#F5F0E8", fontSize: "clamp(2rem, 4vw, 3rem)" }}
        >
          Get in Touch
        </h1>
        <p
          className="font-sans leading-relaxed mb-8"
          style={{ color: "#D0D0D0", fontSize: "1.05rem", lineHeight: 1.75 }}
        >
          Have a question about your business plan, the assessment, or visa-ready options?
          We&apos;re here to help.
        </p>
        <a
          href="mailto:ideatoplanincome@gmail.com"
          className="cta-shimmer gold-border inline-flex items-center gap-2 rounded-full font-sans font-semibold"
          style={{
            color: "#2D1A00",
            fontSize: "1.05rem",
            padding: "0.9rem 2.5rem",
            textDecoration: "none",
          }}
        >
          ideatoplanincome@gmail.com
        </a>
      </section>
    </main>
  );
}
