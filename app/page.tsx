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
          className="pt-10 pb-14 px-6"
          style={{ background: "#FDFCF9", scrollMarginTop: "80px" }}
        >
          <div className="max-w-2xl mx-auto text-center">
            <p className="font-sans text-xs uppercase tracking-[0.2em] mb-3" style={{ color: "#C9A030" }}>
              Why This Exists
            </p>
            <h2
              className="font-serif text-4xl sm:text-5xl font-bold mb-6"
              style={{ color: "#0D1117" }}
            >
              What Are You Built to Do?
            </h2>

            <p
              className="font-serif font-semibold mb-5"
              style={{ color: "#0D1117", fontSize: "clamp(1.15rem, 2.2vw, 1.5rem)", lineHeight: 1.3 }}
            >
              Most people know what they want. I talk to people who don&apos;t.
            </p>

            <p
              className="font-sans text-base leading-relaxed"
              style={{ color: "#4A4A45", maxWidth: "540px", margin: "0 auto 1.25rem" }}
            >
              If you&apos;re still figuring out whether change is even possible for you,
              you&apos;re exactly who this was built for. No business background required,
              no idea required. That is what the assessment is for.
            </p>

            <div className="font-sans text-sm mb-8" style={{ color: "#6B6B66" }}>
              <p>I built Quit Your Life and Travel using IdeaToPlan. The plan above is its actual pages.</p>
              <p className="font-serif italic mt-1" style={{ color: "#0D1117", fontSize: "0.95rem" }}>
                Elizabeth, Founder
              </p>
            </div>

            <a
              href="/assessment"
              className="cta-shimmer gold-border inline-flex items-center gap-2 px-8 py-4 rounded-full font-sans font-semibold text-base cursor-pointer"
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
        </section>
      </ScrollReveal>

      <ScrollReveal><IdeaToPlan /></ScrollReveal>

      <ScrollReveal><Footer /></ScrollReveal>
    </main>
  );
}
