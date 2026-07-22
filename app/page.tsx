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
          className="pt-6 pb-8 px-6"
          style={{ background: "#FDFCF9", scrollMarginTop: "80px" }}
        >
          <div className="max-w-2xl mx-auto text-center">
            <h2
              className="font-serif text-4xl sm:text-5xl font-bold mb-8"
              style={{ color: "#0D1117" }}
            >
              What Are You Built to Do?
            </h2>

            <div className="font-sans text-sm mb-8" style={{ color: "#6B6B66" }}>
              <p className="font-serif text-lg mb-2" style={{ color: "#0D1117" }}>
                Most people know what they want. I talk to people who don&apos;t.
              </p>
              <p>I built QYLAT using IdeaToPlan.</p>
              <p className="font-serif italic mt-1" style={{ color: "#0D1117", fontSize: "0.95rem" }}>
                — Elizabeth, Founder
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

      <div id="pricing" style={{ scrollMarginTop: "80px" }}>
        <ScrollReveal><IdeaToPlan /></ScrollReveal>
      </div>

      <ScrollReveal><Footer /></ScrollReveal>
    </main>
  );
}
