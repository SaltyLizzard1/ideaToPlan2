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
          className="py-16 px-6"
          style={{ background: "var(--i2p-cream)", scrollMarginTop: "80px" }}
        >
          <div className="max-w-2xl mx-auto text-center">
            <p
              className="text-xs font-sans tracking-[0.2em] uppercase mb-3"
              style={{ color: "#C9A030" }}
            >
              Skills Assessment
            </p>
            <h2
              className="font-serif text-4xl sm:text-5xl font-bold mb-4"
              style={{ color: "#0D1117" }}
            >
              What Are You Built to Do?
            </h2>
            <p className="font-sans text-gray-500 text-lg mb-8">
              Answer five quick questions and discover 7 business ideas matched to your
              unique skills, values, and lifestyle.
            </p>
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
