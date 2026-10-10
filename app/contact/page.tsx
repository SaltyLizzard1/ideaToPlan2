import Footer from "@/components/Footer";

export default function ContactPage() {
  return (
    <>
      <main style={{ background: "#0D1117" }}>
        {/* Less space above the intro than the shared section rhythm gives: 28px on phones, up to 48px on wide screens. Same as About. */}
        <section className="section-y" style={{ paddingTop: "clamp(28px, 4vw, 48px)" }}>
          <div className="page-container">
            <div className="measure flex flex-col items-center text-center">
              <p
                className="font-sans uppercase tracking-widest text-xs mb-s3"
                style={{ color: "#C9A030", letterSpacing: "0.22em" }}
              >
                Contact
              </p>
              <h1
                className="font-serif font-bold leading-tight mb-s5"
                style={{ color: "#F5F0E8", fontSize: "clamp(2rem, 4vw, 3rem)" }}
              >
                Get in Touch
              </h1>
              <p
                className="font-sans leading-relaxed mb-s6"
                style={{ color: "#D0D0D0", fontSize: "1.05rem", lineHeight: 1.75 }}
              >
                Have a question about your business plan, the assessment, or visa-ready options?
                We&apos;re here to help.
              </p>
              <a
                href="mailto:ideatoplanincome@gmail.com"
                className="cta-shimmer gold-border inline-flex items-center gap-s2 rounded-full font-sans font-semibold"
                style={{
                  color: "#2D1A00",
                  fontSize: "1.05rem",
                  padding: "0.9rem 2.5rem",
                  textDecoration: "none",
                }}
              >
                ideatoplanincome@gmail.com
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
