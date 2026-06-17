"use client";

export default function Hero() {
  const scrollToQuiz = () => {
    document.getElementById("quiz")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      className="relative flex flex-col items-center h-screen text-center overflow-hidden"
      style={{ background: "#0D1117", padding: "18px 40px 0" }}
    >
      {/* Deep radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 30%, rgba(197,152,28,0.13) 0%, rgba(139,105,20,0.07) 45%, transparent 72%)",
        }}
      />

      {/* 1. Logo */}
      <div className="relative shrink-0">
        <img
          src="/logo.svg"
          alt="IdeaToPlan"
          style={{
            width: "clamp(280px, 28vw, 360px)",
            height: "auto",
            marginTop: "-3%",
            marginBottom: "-5%",
          }}
        />
      </div>

      {/* 2. Tagline */}
      <p
        className="relative shrink-0 font-sans uppercase"
        style={{
          color: "#C9A030",
          letterSpacing: "0.26em",
          fontSize: "clamp(0.65rem, 0.9vw, 0.85rem)",
          marginBottom: "18px",
        }}
      >
        Skills Assessment&nbsp;&nbsp;•&nbsp;&nbsp;Business Matching&nbsp;&nbsp;•&nbsp;&nbsp;Professional Plans
      </p>

      {/* Body */}
      <div className="relative flex-1 flex flex-col items-center w-full" style={{ maxWidth: "1200px" }}>

        {/* 3. Headline */}
        <h1
          className="font-serif font-bold leading-tight"
          style={{
            color: "#F5F0E8",
            fontSize: "clamp(2.4rem, 4.2vw, 4rem)",
            marginBottom: "4px",
          }}
        >
          Stop Guessing. Discover the Business You&apos;re{" "}
          <span className="gold-gradient-text">Built For</span>
        </h1>

        <p
          className="font-serif font-bold"
          style={{
            color: "#A0A8B4",
            fontSize: "clamp(2.4rem, 4.2vw, 4rem)",
            lineHeight: 1.15,
            marginBottom: "18px",
          }}
        >
          Then Get the Professional Plan to Launch It
        </p>

        {/* 4. Subheadline */}
        <p
          className="font-sans"
          style={{
            color: "#D0D0D0",
            fontSize: "clamp(1rem, 1.4vw, 1.15rem)",
            lineHeight: 1.6,
            marginBottom: "22px",
          }}
        >
          Take the free 5-minute skills assessment inspired by{" "}
          <em>What Color Is Your Parachute?</em> and get personalized business
          matches based on your strengths. Turn your top preference into a
          polished, investor-ready business plan in 72 hours.
        </p>

        {/* 5. Value section */}
        <div className="flex flex-col items-center font-sans" style={{ marginBottom: "16px" }}>
          {/* Checkmarks — same line */}
          <div className="flex flex-row flex-wrap justify-center" style={{ gap: "6px 40px", marginBottom: "10px", fontSize: "0.9rem", color: "#D1D5DB" }}>
            <span className="flex items-center gap-2">
              <span style={{ color: "#C9A030" }}>✓</span>Personalized matches that actually fit you
            </span>
            <span className="flex items-center gap-2">
              <span style={{ color: "#C9A030" }}>✓</span>Full business plan with strategy, financials &amp; next steps
            </span>
          </div>
          {/* Delivery — directly below */}
          <div className="flex flex-row flex-wrap justify-center" style={{ gap: "4px 28px", fontSize: "0.85rem", color: "#C9A030", letterSpacing: "0.02em" }}>
            <span>Fast 72-hour delivery</span>
            <span>Real human review</span>
            <span>Standard plans from $25</span>
          </div>
        </div>

        {/* 7. CTA — pinned to bottom */}
        <div
          style={{
            marginTop: "auto",
            paddingBottom: "2rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <button
            onClick={scrollToQuiz}
            className="gold-gradient gold-border inline-flex items-center gap-2 rounded-full font-sans font-semibold cursor-pointer shadow-lg"
            style={{
              color: "#2D1A00",
              fontSize: "1.15rem",
              padding: "1rem 3.25rem",
              transition: "transform 0.18s ease, filter 0.18s ease",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.04)";
              (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
              (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1)";
            }}
          >
            Discover Your Match
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>

          <p className="font-sans font-medium" style={{ color: "#8A9099", fontSize: "0.8rem" }}>
            Free&nbsp;&nbsp;•&nbsp;&nbsp;5 minutes&nbsp;&nbsp;•&nbsp;&nbsp;No sign-up required
          </p>
        </div>

      </div>
    </section>
  );
}
