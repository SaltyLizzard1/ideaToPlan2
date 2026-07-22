export default function AboutPage() {
  return (
    <main style={{ background: "#FDFCF9", minHeight: "100vh" }}>
      <section
        className="mx-auto flex flex-col items-center text-center"
        style={{ maxWidth: "800px", padding: "5rem 2rem 4rem" }}
      >
        <p
          className="font-sans uppercase tracking-widest text-xs mb-4"
          style={{ color: "#C9A030", letterSpacing: "0.22em" }}
        >
          About
        </p>
        <h1
          className="font-serif font-bold leading-tight mb-6"
          style={{ color: "#0D1117", fontSize: "clamp(2rem, 4vw, 3rem)" }}
        >
          We Help You Discover the Business You&apos;re Built For
        </h1>
        <p
          className="font-sans leading-relaxed mb-5"
          style={{ color: "#4A4A45", fontSize: "1.05rem", lineHeight: 1.75 }}
        >
          IdeaToPlan was built for people who know they want something different: a career change,
          a side hustle, a new chapter, but aren&apos;t sure where to start. We combine a
          proven skills assessment methodology with professional business plan writing to give
          you both clarity and momentum.
        </p>
        <p
          className="font-sans leading-relaxed"
          style={{ color: "#4A4A45", fontSize: "1.05rem", lineHeight: 1.75 }}
        >
          Our plans are used by first-time founders, corporate escapees, digital nomads, and
          visa applicants who need investor-ready documentation. Every plan is AI-assisted and
          human-reviewed and delivered in 72 hours.
        </p>
      </section>
    </main>
  );
}
