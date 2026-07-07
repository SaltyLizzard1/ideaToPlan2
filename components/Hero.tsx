"use client";

export default function Hero() {
  const scrollToQuiz = () => {
    document.getElementById("quiz")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      className="relative flex flex-col items-center text-center overflow-x-hidden"
      style={{
        background: "#0D1117",
        height: "calc(100svh - 64px)",
        padding: "40px 24px 28px",
        /* subtle dot grid for depth */
        backgroundImage:
          "radial-gradient(circle, rgba(201,160,48,0.06) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    >
      {/* Layered glow — ambient + tight spot behind headline */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 20%, rgba(197,152,28,0.11) 0%, transparent 65%)",
      }} />
      <div className="absolute pointer-events-none" style={{
        top: "30%", left: "50%", transform: "translateX(-50%)",
        width: "600px", height: "300px",
        background: "radial-gradient(ellipse, rgba(245,208,32,0.07) 0%, transparent 70%)",
        filter: "blur(40px)",
      }} />

      {/* Tagline */}
      <p
        className="relative shrink-0 font-sans uppercase font-semibold"
        style={{
          color: "#C9A030",
          letterSpacing: "0.28em",
          fontSize: "clamp(0.65rem, 1vw, 0.85rem)",
          marginBottom: "18px",
          textShadow: "0 0 20px rgba(201,160,48,0.4)",
        }}
      >
        Skills Assessment&nbsp;&nbsp;<span style={{ color: "#F5D020" }}>•</span>&nbsp;&nbsp;Business Matching&nbsp;&nbsp;<span style={{ color: "#F5D020" }}>•</span>&nbsp;&nbsp;Professional Plans
      </p>

      {/* Body */}
      <div className="relative flex flex-col items-center w-full" style={{ maxWidth: "1100px", flex: 1 }}>

        {/* Headline */}
        <h1
          className="font-serif font-bold"
          style={{ color: "#F5F0E8", fontSize: "clamp(1.9rem, 4vw, 3.8rem)", lineHeight: 1.15, marginBottom: "20px" }}
        >
          Stop Guessing. Discover the Business<br className="hidden sm:block" />{" "}
          You&apos;re <span className="gold-gradient-text">Built For</span>
        </h1>

        {/* Subheadline — split into two punchy lines */}
        <p
          className="font-sans"
          style={{ color: "#9CA3AF", fontSize: "clamp(0.9rem, 1.3vw, 1.05rem)", lineHeight: 1.6, marginBottom: "28px", maxWidth: "640px" }}
        >
          Answer 5 questions. Get 7 business matches tailored to your strengths.
          <br />
          Turn your top pick into a professional, investor-ready plan — in 72 hours.
        </p>

        {/* Bullets — card style */}
        <div
          className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 font-sans"
          style={{ marginBottom: "16px", fontSize: "clamp(0.8rem, 1.1vw, 0.875rem)" }}
        >
          {[
            "Personalized matches that actually fit you",
            "Full business plan with strategy, financials & next steps",
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{
                background: "rgba(201,160,48,0.06)",
                border: "1px solid rgba(201,160,48,0.18)",
                borderRadius: "8px",
                padding: "8px 14px",
                color: "#E5E7EB",
              }}
            >
              <span style={{ color: "#C9A030", fontSize: "0.8rem" }}>✓</span>
              {item}
            </div>
          ))}
        </div>

        {/* Delivery line */}
        <div
          className="flex flex-row flex-wrap justify-center gap-x-4 gap-y-1 font-sans"
          style={{ fontSize: "clamp(0.7rem, 1vw, 0.8rem)", color: "#C9A030", marginBottom: "0", letterSpacing: "0.02em" }}
        >
          <span>⚡ 72-hour delivery guarantee</span>
          <span style={{ color: "#374151" }}>·</span>
          <span>✦ Human-reviewed Plans</span>
          <span style={{ color: "#374151" }}>·</span>
          <span>Plans from $25</span>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center" style={{ marginTop: "auto", gap: "10px", paddingBottom: "4px" }}>
          <button
            onClick={scrollToQuiz}
            className="gold-gradient gold-border inline-flex items-center gap-2 rounded-full font-sans font-semibold cursor-pointer"
            style={{
              color: "#2D1A00",
              fontSize: "clamp(1rem, 1.4vw, 1.1rem)",
              padding: "0.9rem 2.75rem",
              boxShadow: "0 0 28px rgba(197,152,28,0.25)",
              transition: "transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease",
            }}
            onMouseEnter={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.transform = "scale(1.04)";
              b.style.filter = "brightness(1.1)";
              b.style.boxShadow = "0 0 40px rgba(197,152,28,0.4)";
            }}
            onMouseLeave={e => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.transform = "scale(1)";
              b.style.filter = "brightness(1)";
              b.style.boxShadow = "0 0 28px rgba(197,152,28,0.25)";
            }}
          >
            Discover Your Match
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>

          <p className="font-sans" style={{ color: "#6B7280", fontSize: "0.78rem" }}>
            Free&nbsp;&nbsp;•&nbsp;&nbsp;5 minutes&nbsp;&nbsp;•&nbsp;&nbsp;No sign-up required
          </p>
        </div>

      </div>
    </section>
  );
}
