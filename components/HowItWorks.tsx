"use client";

import { useRef, useEffect, useState, CSSProperties } from "react";

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [prefersReduced, setPrefersReduced] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPrefersReduced(reduced);
    setInitialized(true);

    if (reduced) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  function getRevealStyle(i: number): CSSProperties {
    if (!initialized || prefersReduced) return {};
    return {
      opacity: revealed ? 1 : 0,
      transform: revealed ? "translateY(0)" : "translateY(20px)",
      transition: "opacity 500ms ease-out, transform 500ms ease-out",
      transitionDelay: revealed ? `${i * 150}ms` : "0ms",
    };
  }

  function getWrapperStyle(i: number): CSSProperties {
    const isHovered = hoveredIndex === i && revealed;
    const base: CSSProperties = {
      cursor: "pointer",
      transition: "transform 150ms ease-out, box-shadow 150ms ease-out",
    };
    if (prefersReduced || !isHovered) return base;
    return {
      ...base,
      transform: "translateY(-4px) scale(1.02)",
      boxShadow: "0 12px 24px rgba(0,0,0,0.08)",
    };
  }

  const steps = [
    {
      icon: (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a7 7 0 0 1 7 7c0 3.5-2.5 6-4 7.5V18a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1.5C7.5 15 5 12.5 5 9a7 7 0 0 1 7-7z" />
          <path d="M9 21h6M10 17h4" />
        </svg>
      ),
      step: "01",
      title: "Take the Free Skills Assessment",
      description:
        "Answer five quick sections about your hard skills, soft skills, work style, values, and time availability. Takes about 5 minutes.",
    },
    {
      icon: (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <path d="M11 8v6M8 11h6" />
        </svg>
      ),
      step: "02",
      title: "Receive 7 Personalized Matches",
      description:
        "Our AI analyzes your profile and returns seven business ideas matched to your unique combination of skills, values, and lifestyle, with income ranges and first steps.",
    },
    {
      icon: (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      ),
      step: "03",
      title: "Build Your Business Plan",
      description:
        "Love your top match? Submit it to IdeaToPlan and we'll deliver a done-for-you professional business plan, ready for investors, lenders, or your own roadmap.",
    },
  ];

  return (
    <section ref={sectionRef} className="pt-6 pb-14 px-6 bg-[#FDFCF9]">
      <div className="max-w-5xl mx-auto">

        {/* Section heading — unchanged */}
        <div className="text-center mb-8">
          <p
            className="text-xs font-sans tracking-[0.2em] uppercase mb-3"
            style={{ color: "#C9A030" }}
          >
            How It Works
          </p>
          <h2
            className="font-serif text-4xl sm:text-5xl font-bold"
            style={{ color: "#0D1117" }}
          >
            From Idea to Income
          </h2>
        </div>

        {/* Relative wrapper: contains grid (with connectors) + button */}
        <div className="relative">

          {/* ── Cards grid — also the positioning context for connector lines ── */}
          {/*
            Connector lines live inside the grid so percentage-based top values
            are relative to the grid height (number area + card area), not the
            outer wrapper (which includes the button below).

            H-line: top = 50% of grid + half of number-label height (≈20px)
                        = card vertical midpoint
            V-line: same top, height = remaining 50% of grid + drop to button center
                        = calc(50% + 52px) where 52px ≈ mt-12(48px) + half-button(~24px) - line_start_offset(~20px)

            z-index: -1 keeps lines behind grid items (normal-flow flex children
            paint above z:-1 positioned siblings within the same stacking context).
          */}
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch"
            style={{ position: "relative", zIndex: 1 }}
          >

            {/* ── Horizontal connector line (desktop only) ── */}
            <div
              aria-hidden="true"
              className="hidden md:block absolute"
              style={{
                top: "calc(50% + 20px)",
                left: 0,
                right: 0,
                height: "1px",
                background: "#C9A030",
                zIndex: -1,
                transformOrigin: "left center",
                transform: revealed ? "scaleX(1)" : "scaleX(0)",
                transition: prefersReduced ? "none" : "transform 800ms ease-out",
              }}
            />


            {steps.map((s, i) => (
              <div
                key={i}
                className="flex flex-col"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={getWrapperStyle(i)}
              >
                {/* Step number — above the card, outside the border */}
                <p
                  className="font-serif font-bold"
                  style={{
                    fontSize: "clamp(24px, 2.5vw, 30px)",
                    color: "#0D1117",
                    marginBottom: "10px",
                    lineHeight: 1,
                  }}
                >
                  {s.step}
                </p>

                {/* Card — flex-1 so all cards stretch to the tallest */}
                <div
                  className="flex flex-col items-start p-6 rounded-2xl border w-full flex-1"
                  style={{
                    borderColor: "#E8E4DB",
                    background: "white",
                    ...getRevealStyle(i),
                  }}
                >
                  {/* icon version — kept for possible revert */}
                  {/*
                  <div
                    className="mb-5 p-3 rounded-xl"
                    style={{ background: "#FBF6E4", color: "#8B6914" }}
                  >
                    {s.icon}
                  </div>
                  */}

                  <h3
                    className="font-serif text-xl font-semibold mb-3"
                    style={{ color: "#0D1117" }}
                  >
                    {s.title}
                  </h3>
                  <p
                    className="font-sans text-sm leading-relaxed"
                    style={{ color: "#4B5563" }}
                  >
                    {s.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
