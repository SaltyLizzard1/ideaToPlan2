"use client";

import Link from "next/link";

export default function Hero() {
  return (
    // The hero is as tall as its content. It used to be stretched to fill the screen with the
    // content centred in it, which left a wide band above the eyebrow on tall screens and pushed
    // the second button below the fold on short ones. Padding and gaps follow the screen height
    // (svh) so both buttons stay on the first screen of a short laptop window.
    <section
      className="relative flex flex-col items-center text-center overflow-x-hidden"
      style={{
        paddingTop: "clamp(20px, 5svh, 56px)",
        paddingBottom: "clamp(28px, 7svh, 72px)",
        background: "#0D1117",
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
      <div className="page-container relative flex flex-col items-center">
        <div
          className="flex flex-col items-center w-full max-w-hero"
          style={{ gap: "clamp(14px, 2.6svh, 24px)" }}
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
          Free 5-minute skills assessment
        </p>

        {/* Headline: each sentence is inline-block so the line break falls between them */}
        <h1
          className="font-serif font-bold"
          style={{
            color: "#FBF6E3",
            fontSize: "clamp(2.2rem, 4.5vw, 4rem)",
            lineHeight: 1.15,
          }}
        >
          <span className="inline-block">The Job Search Isn&rsquo;t Working.</span>{" "}
          <span className="inline-block gold-gradient-text--animated">Your Skills Are.</span>
        </h1>

        {/* Subheadline */}
        <p
          className="font-sans -mt-s2"
          style={{
            color: "#cfc9b8",
            fontSize: "clamp(0.95rem, 1.35vw, 1.1rem)",
            lineHeight: 1.65,
            maxWidth: "620px",
          }}
        >
          Discover business ideas that fit your skills, even if you have no idea where to start. Inspired by What Color Is Your Parachute?, this assessment matches what you already know to seven business opportunities.
        </p>

        {/* Assessment CTA. The free-offer text stays in this block so it reads as
            belonging to the assessment button, not to the paid plan below. */}
        <div className="flex flex-col items-center gap-s3">
          {/* Horizontal padding shrinks below ~380px so the label stays on one line at 320px */}
          <Link
            href="/assessment"
            className="cta-shimmer gold-border inline-flex items-center gap-s2 rounded-full font-sans font-semibold cursor-pointer"
            style={{
              color: "#2D1A00",
              fontSize: "clamp(1rem, 1.4vw, 1.1rem)",
              padding: "0.9rem clamp(1rem, calc((100vw - 290px) / 2), 2.75rem)",
              boxShadow: "0 0 28px rgba(197,152,28,0.25)",
            }}
          >
            Find My Business Matches
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
          </Link>

          {/* Three lines on mobile, two from sm up */}
          <p className="font-sans" style={{ color: "#a89f8a", fontSize: "0.85rem" }}>
            Free&nbsp;&nbsp;•&nbsp;&nbsp;About 5 minutes
            <span className="hidden sm:inline">&nbsp;&nbsp;•&nbsp;&nbsp;</span>
            <br className="sm:hidden" />
            See your top match without signing up
            <br />
            Enter your email to unlock six more.
          </p>
        </div>

        {/* Second entry path: straight to the paid plan section. Each phrase is
            inline-block so a narrow screen breaks between them. */}
        <Link
          href="/#pricing"
          className="inline-block rounded-full font-sans font-semibold cursor-pointer transition-colors hover:bg-[rgba(201,160,48,0.12)]"
          style={{
            color: "#E8C84A",
            border: "1.5px solid #C9A030",
            fontSize: "0.95rem",
            lineHeight: 1.35,
            padding: "0.7rem 1.5rem",
          }}
        >
          <span className="inline-block">Already Have an Idea?</span>{" "}
          <span className="inline-block">Build My Plan</span>
        </Link>
        </div>
      </div>
    </section>
  );
}
