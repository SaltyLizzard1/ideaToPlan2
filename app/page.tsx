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
            <p className="font-sans text-xs uppercase tracking-[0.2em] mb-s3" style={{ color: "#C9A030" }}>
              Why This Exists
            </p>
            <h2
              className="font-serif text-4xl sm:text-5xl font-bold mb-s5"
              style={{ color: "#0D1117" }}
            >
              What Are You Built to Do?
            </h2>

            <p
              className="font-serif font-semibold mb-s5"
              style={{ color: "#0D1117", fontSize: "clamp(1.15rem, 2.2vw, 1.5rem)", lineHeight: 1.3 }}
            >
              Most people know what they want. I talk to people who don&apos;t.
            </p>

            <p
              className="font-sans text-base leading-relaxed max-w-copy mx-auto mb-s5"
              style={{ color: "#4A4A45" }}
            >
              If you&apos;re still figuring out whether change is even possible for you,
              you&apos;re exactly who this was built for. No business background required,
              no idea required. That is what the assessment is for.
            </p>

            <div className="font-sans text-sm mb-s6" style={{ color: "#6B6B66" }}>
              <p>I personally review every plan before delivery.</p>
              <p className="font-serif italic mt-s1" style={{ color: "#0D1117", fontSize: "0.95rem" }}>
                Elizabeth, Founder
              </p>
            </div>

            <a
              href="/assessment"
              className="cta-shimmer gold-border inline-flex items-center gap-s2 px-s6 py-s4 rounded-full font-sans font-semibold text-base cursor-pointer"
              style={{ color: "#2D1A00" }}
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
