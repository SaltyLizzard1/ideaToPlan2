"use client";

import { useRef, useEffect, useState, CSSProperties } from "react";
import Link from "next/link";

// The two entry paths. The plan path goes to the pricing section, which is
// where a plan is chosen and paid for before the intake form opens.
const PATHS = [
  {
    title: "I’m exploring what to do next",
    description:
      "Find business opportunities that match your skills, each with an income range, competition level, and first steps. See your top match free, then unlock six more with your email.",
    cta: "Find My Business Matches",
    href: "/assessment",
  },
  {
    title: "I know what I want to build",
    description:
      "Bring your business idea, choose and pay for a plan, then answer the intake questions. I personally review every plan before delivery.",
    cta: "Build My Business Plan",
    href: "/#pricing",
  },
];

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
      transition: "transform 150ms ease-out, box-shadow 150ms ease-out",
    };
    if (prefersReduced || !isHovered) return base;
    return {
      ...base,
      transform: "translateY(-4px) scale(1.02)",
      boxShadow: "0 12px 24px rgba(0,0,0,0.08)",
    };
  }

  return (
    <section ref={sectionRef} className="section-y bg-[#FDFCF9]">
      <div className="page-container">

        {/* Section heading */}
        <div className="text-center mb-s6">
          <p
            className="text-xs font-sans tracking-[0.2em] uppercase mb-s3"
            style={{ color: "#C9A030" }}
          >
            How It Works
          </p>
          {/* Each sentence is inline-block so the line break falls between them */}
          <h2
            className="font-serif text-4xl sm:text-5xl font-bold mb-s4"
            style={{ color: "#0D1117" }}
          >
            <span className="inline-block">Find your idea.</span>{" "}
            <span className="inline-block">Or build the one you already have.</span>
          </h2>
          <p
            className="font-sans text-base leading-relaxed max-w-copy mx-auto"
            style={{ color: "#4A4A45" }}
          >
            Discover business opportunities that fit your skills, or bring your own idea and turn it into a practical plan.
          </p>
        </div>

        {/* The two paths, side by side from md up */}
        <div className="grid grid-cols-1 md:grid-cols-2 grid-gap items-stretch">
          {PATHS.map((path, i) => (
            <div
              key={path.href}
              className="flex flex-col rounded-2xl"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={getWrapperStyle(i)}
            >
              {/* Card — flex-1 so both cards stretch to the taller one */}
              <div
                className="flex flex-col items-start card-pad rounded-2xl border w-full flex-1"
                style={{
                  borderColor: "#E8E4DB",
                  background: "white",
                  ...getRevealStyle(i),
                }}
              >
                <h3
                  className="font-serif text-2xl font-semibold mb-s3"
                  style={{ color: "#0D1117" }}
                >
                  {path.title}
                </h3>
                <p
                  className="font-sans text-sm leading-relaxed mb-s5"
                  style={{ color: "#4B5563" }}
                >
                  {path.description}
                </p>
                <Link
                  href={path.href}
                  className="cta-shimmer gold-border inline-flex items-center justify-center gap-s2 rounded-full font-sans font-semibold text-sm sm:text-base cursor-pointer mt-auto w-full sm:w-auto px-s4 sm:px-s5 py-s3 whitespace-nowrap"
                  style={{ color: "#2D1A00" }}
                >
                  {path.cta}
                  {/* Arrow drops out on the narrowest phones so the label stays on one line */}
                  <svg
                    className="hidden min-[360px]:block"
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
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
