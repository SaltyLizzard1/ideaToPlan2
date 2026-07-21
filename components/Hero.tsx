"use client";

export default function Hero() {
  const scrollToAssessment = () => {
    window.location.href = "/assessment";
  };

  return (
    <section
      className="relative flex flex-col items-center justify-center text-center overflow-x-hidden"
      style={{
        background: "#0D1117",
        minHeight: "calc(100svh - 80px)",
        padding: "28px 24px 24px",
        backgroundImage:
          "radial-gradient(circle, rgba(201,160,48,0.06) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    >
      {/* Layered glow — ambient + tight spot behind headline */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(197,152,28,0.04) 0%, transparent 65%)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: "28%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "300px",
          background: "radial-gradient(ellipse, rgba(245,208,32,0.02) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* Content stack */}
      <div
        className="relative flex flex-col items-center"
        style={{
          maxWidth: "900px",
          width: "100%",
          gap: "clamp(14px, 2vw, 22px)",
        }}
      >
        {/* Eyebrow */}
        <p
          className="font-sans uppercase font-semibold"
          style={{
            color: "#C9A030",
            letterSpacing: "0.28em",
            fontSize: "clamp(0.65rem, 1vw, 0.85rem)",
            textShadow: "0 0 20px rgba(201,160,48,0.4)",
          }}
        >
          Free Skills Assessment
        </p>

        {/* Headline */}
        <h1
          className="font-serif font-bold"
          style={{
            color: "#FBF6E3",
            fontSize: "clamp(2.2rem, 4.5vw, 4rem)",
            lineHeight: 1.15,
          }}
        >
          Turn What You&apos;re Good At Into<br className="hidden sm:block" />{" "}
          a Business You <span className="gold-gradient-text--animated">Love</span>
        </h1>

        {/* Subheadline */}
        <p
          className="font-sans"
          style={{
            color: "#cfc9b8",
            fontSize: "clamp(0.95rem, 1.35vw, 1.1rem)",
            lineHeight: 1.65,
            maxWidth: "620px",
            marginTop: "-8px",
          }}
        >
          A 5-minute assessment shows you seven businesses you&apos;re actually built to run.
        </p>

        {/* CTA block */}
        <div className="flex flex-col items-center" style={{ gap: "12px" }}>
          <button
            onClick={scrollToAssessment}
            className="cta-shimmer gold-border inline-flex items-center gap-2 rounded-full font-sans font-semibold cursor-pointer"
            style={{
              color: "#2D1A00",
              fontSize: "clamp(1rem, 1.4vw, 1.1rem)",
              padding: "0.9rem 2.75rem",
              boxShadow: "0 0 28px rgba(197,152,28,0.25)",
            }}
          >
            Start My Assessment
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>

          <p className="font-sans" style={{ color: "#a89f8a", fontSize: "0.85rem" }}>
            Free&nbsp;&nbsp;•&nbsp;&nbsp;5 minutes&nbsp;&nbsp;•&nbsp;&nbsp;No sign-up required
          </p>
        </div>
      </div>
    </section>
  );
}
