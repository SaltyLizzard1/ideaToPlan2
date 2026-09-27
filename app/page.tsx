"use client";

import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import SamplePlanExcerpts from "@/components/SamplePlanExcerpts";
import IdeaToPlan from "@/components/IdeaToPlan";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";

export default function Home() {
  return (
    <main>
      <Hero />

      <div id="how-it-works" style={{ scrollMarginTop: "80px" }}>
        <ScrollReveal><HowItWorks /></ScrollReveal>
      </div>

      <ScrollReveal><SamplePlanExcerpts /></ScrollReveal>

      <ScrollReveal>
        <section
          id="assessment"
          className="section-y"
          style={{ background: "#FDFCF9", scrollMarginTop: "80px" }}
        >
          <div className="page-container">
            <div className="measure text-center">
            <p className="font-sans text-xs uppercase tracking-[0.2em] mb-md" style={{ color: "#C9A030" }}>
              Why This Exists
            </p>
            <h2
              className="font-serif text-4xl sm:text-5xl font-bold mb-xl"
              style={{ color: "#0D1117" }}
            >
              What Are You Built to Do?
            </h2>

            <p
              className="font-serif font-semibold mb-xl"
              style={{ color: "#0D1117", fontSize: "clamp(1.15rem, 2.2vw, 1.5rem)", lineHeight: 1.3 }}
            >
              Most people know what they want. I talk to people who don&apos;t.
            </p>

            <p
              className="font-sans text-base leading-relaxed max-w-copy mx-auto mb-xl"
              style={{ color: "#4A4A45" }}
            >
              If you&apos;re still figuring out whether change is even possible for you,
              you&apos;re exactly who this was built for. No business background required,
              no idea required. That is what the assessment is for.
            </p>

            <div className="font-sans text-sm mb-2xl" style={{ color: "#6B6B66" }}>
              <p>I built Quit Your Life and Travel using IdeaToPlan. The plan above is its actual pages.</p>
              <p className="font-serif italic mt-xs" style={{ color: "#0D1117", fontSize: "0.95rem" }}>
                Elizabeth, Founder
              </p>
            </div>

            <a
              href="/assessment"
              className="cta-shimmer gold-border inline-flex items-center gap-sm px-2xl py-lg rounded-full font-sans font-semibold text-base cursor-pointer"
              style={{ color: "#2D1A00" }}
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
              </a>
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal><IdeaToPlan /></ScrollReveal>

      <ScrollReveal><Footer /></ScrollReveal>
    </main>
  );
}
