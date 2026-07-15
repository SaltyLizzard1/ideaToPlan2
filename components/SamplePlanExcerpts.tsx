"use client";

import { useState, useEffect, CSSProperties } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type Line =
  | { k: "p"; text: string }
  | { k: "labeled"; label: string; text: string }
  | { k: "stats"; text: string }
  | { k: "verdict"; prefix: string; emphasis: string };

interface SamplePage {
  id: string;
  title: string;
  lines: Line[];
}

// ── Content data ───────────────────────────────────────────────────────────

const SAMPLE_PAGES: SamplePage[] = [
  {
    id: "exec",
    title: "Executive Summary",
    lines: [
      {
        k: "p",
        text: "What this business sells is clarity and momentum. QYLAT earns trust with honest content and free tools - a Runway Calculator and Skills Assessment. IdeaToPlan converts that trust into action: roadmaps, loan requests, investor pitches.",
      },
      {
        k: "stats",
        text: "Stage: pre-revenue · Budget: under $5,000 · First sale target: Day 60",
      },
    ],
  },
  {
    id: "market",
    title: "Market Fit",
    lines: [
      {
        k: "labeled",
        label: "The gap:",
        text: "the market is crowded at the inspiration level but thin at the execution level. Most content stops at \"you can do it.\"",
      },
      {
        k: "labeled",
        label: "Saturation score: 6/10.",
        text: "179 competitors in life coaching, but no named competitor occupies the execution lane - tools that produce real documents.",
      },
      {
        k: "labeled",
        label: "The lead content competitor",
        text: "tops out at 12,300 monthly visits. Not insurmountable.",
      },
    ],
  },
  {
    id: "swot",
    title: "SWOT Analysis",
    lines: [
      {
        k: "labeled",
        label: "S:",
        text: "Lived credibility; a two-site funnel where each site has one clear job",
      },
      { k: "labeled", label: "W:", text: "Zero audience at launch; solo operator bandwidth" },
      { k: "labeled", label: "O:", text: "The execution gap is unoccupied; early SEO compounds over 6-12 months" },
      { k: "labeled", label: "T:", text: "Funded platforms ($27.7M raised) could pivot in; new entrants already in market" },
      { k: "verdict", prefix: "Viability verdict: ", emphasis: "VIABLE" },
    ],
  },
  {
    id: "action",
    title: "90-Day Action Plan",
    lines: [
      {
        k: "labeled",
        label: "Days 1-30:",
        text: "Publish the honest posts · Runway Calculator live · email list from Day 1",
      },
      {
        k: "labeled",
        label: "Days 31-60:",
        text: "Build the roadmap tool · launch to the waitlist · goal: first sale",
      },
      {
        k: "labeled",
        label: "Days 61-90:",
        text: "Interview first buyers · 100 subscribers · publish an honest 90-day retrospective",
      },
      {
        k: "stats",
        text: "The tool is what you sell. The list is the business.",
      },
    ],
  },
];

// ── Fan geometry ───────────────────────────────────────────────────────────

// SWOT (index 2) is given the highest resting z so it layers above both neighbors.
const RESTING_Z = [4, 7, 13, 10] as const;

const DESKTOP = {
  cardW: 215,
  cardH: 287,           // ≈ 3:4
  xOffsets: [-237, -79, 79, 237] as const,   // 158px between centers — matches 3-card spacing
  rotations: [-8, -3, 3, 8] as const,
  containerH: 370,
};

const MOBILE = {
  cardW: 118,
  cardH: 157,           // ≈ 3:4
  xOffsets: [-87, -29, 29, 87] as const,     // 58px between centers
  rotations: [-4, -1.5, 1.5, 4] as const,
  containerH: 210,
};

// ── Line renderer ──────────────────────────────────────────────────────────

function renderLine(line: Line, i: number) {
  const base: CSSProperties = {
    fontSize: "11px",
    lineHeight: "1.6",
    color: "var(--i2p-ink-body)",
    marginBottom: "7px",
  };

  switch (line.k) {
    case "p":
      return <p key={i} style={base}>{line.text}</p>;

    case "labeled":
      return (
        <p key={i} style={base}>
          <strong style={{ color: "var(--i2p-ink)", fontWeight: 700 }}>{line.label}</strong>
          {" "}{line.text}
        </p>
      );

    case "stats":
      return (
        <p
          key={i}
          style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--i2p-ink)",
            marginTop: "10px",
            paddingTop: "10px",
            borderTop: "1px solid var(--i2p-cream-border)",
          }}
        >
          {line.text}
        </p>
      );

    case "verdict":
      return (
        <p key={i} style={{ ...base, marginTop: "8px", fontWeight: 600 }}>
          {line.prefix}
          <strong style={{ color: "#8B6914", fontWeight: 700 }}>{line.emphasis}</strong>
        </p>
      );
  }
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SamplePlanExcerpts() {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const rmq = window.matchMedia("(prefers-reduced-motion: reduce)");

    setIsMobile(mq.matches);
    setPrefersReduced(rmq.matches);

    const onResize = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onResize);
    return () => mq.removeEventListener("change", onResize);
  }, []);

  const geo = isMobile ? MOBILE : DESKTOP;
  const anyFocused = focusedId !== null;

  function getCardStyle(index: number, isFocused: boolean): CSSProperties {
    const defaultZ = RESTING_Z[index];
    const rot = geo.rotations[index];

    if (prefersReduced) {
      return {
        zIndex: isFocused ? 50 : defaultZ,
        opacity: anyFocused && !isFocused ? 0.55 : 1,
        outline: isFocused ? "2px solid #C9A030" : "2px solid transparent",
        outlineOffset: "3px",
      };
    }

    const transition =
      "transform 250ms ease-out, box-shadow 250ms ease-out, opacity 200ms ease-out";

    if (isFocused) {
      return {
        transform: "rotate(0deg) scale(1.15) translateY(-12px)",
        boxShadow: "0 20px 48px rgba(0,0,0,0.55)",
        opacity: 1,
        zIndex: 50,
        transition,
      };
    }

    return {
      transform: `rotate(${rot}deg)`,
      boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
      opacity: anyFocused ? 0.7 : 1,
      zIndex: defaultZ,
      transition,
    };
  }

  return (
    <section
      id="sample-plan"
      className="py-16 px-6"
      style={{
        background: "#0D1117",
        backgroundImage:
          "radial-gradient(circle, rgba(201,160,48,0.06) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    >
      <div className="max-w-4xl mx-auto">

        {/* Section heading */}
        <div className="text-center mb-14">
          <p
            className="font-sans text-xs uppercase tracking-[0.2em] mb-3"
            style={{ color: "#C9A030" }}
          >
            The Proof
          </p>
          <h3
            className="font-serif font-bold text-3xl sm:text-4xl mb-3"
            style={{ color: "#FBF6E3" }}
          >
            Inside Every Plan
          </h3>
          <p className="font-sans text-base" style={{ color: "#cfc9b8" }}>
            Real pages from a real plan: structured, specific, and ready to act on.
          </p>
        </div>

        {/* Fan */}
        <div
          className="relative mx-auto"
          style={{ height: `${geo.containerH}px`, overflow: "visible" }}
          onMouseLeave={() => setFocusedId(null)}
        >
          {SAMPLE_PAGES.map((page, index) => {
            const isFocused = focusedId === page.id;
            const topPx = Math.round((geo.containerH - geo.cardH) / 2);

            return (
              <div
                key={page.id}
                onMouseEnter={() => setFocusedId(page.id)}
                onClick={() => setFocusedId(isFocused ? null : page.id)}
                style={{
                  position: "absolute",
                  width: `${geo.cardW}px`,
                  height: `${geo.cardH}px`,
                  left: `calc(50% + ${geo.xOffsets[index]}px - ${geo.cardW / 2}px)`,
                  top: `${topPx}px`,
                  cursor: "pointer",
                  borderRadius: "12px",
                  background: "white",
                  border: "1px solid var(--i2p-cream-border)",
                  padding: "16px",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  userSelect: "none",
                  ...getCardStyle(index, isFocused),
                }}
              >
                {/* Gold top rule */}
                <div
                  style={{
                    height: "3px",
                    borderRadius: "2px",
                    marginBottom: "11px",
                    background:
                      "linear-gradient(90deg, #8B6914 0%, #C9A030 30%, #F5D020 50%, #C9A030 70%, #8B6914 100%)",
                  }}
                />

                {/* Page title */}
                <h3
                  className="font-serif font-bold"
                  style={{
                    fontSize: "14px",
                    lineHeight: 1.3,
                    color: "var(--i2p-ink)",
                    marginBottom: "10px",
                  }}
                >
                  {page.title}
                </h3>

                {/* Content lines */}
                <div>{page.lines.map((line, i) => renderLine(line, i))}</div>

                {/* Bottom fade — mobile only, where full text can never fit */}
                {isMobile && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: "36px",
                      background: "linear-gradient(to bottom, transparent, white)",
                      borderRadius: "0 0 12px 12px",
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Caption */}
        <p
          className="text-center font-sans text-xs mt-10 mb-16"
          style={{ color: "#a89f8a" }}
        >
          Excerpts from the founder&apos;s own Growth plan&nbsp;&nbsp;·&nbsp;&nbsp;Hover or tap to explore
        </p>

      </div>
    </section>
  );
}
