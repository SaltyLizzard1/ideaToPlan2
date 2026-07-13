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
        text: "A location-independent food media business with three revenue streams: paid newsletter, live virtual cooking workshops, and digital cookbooks. Runs on a laptop, a camera, and a rentable kitchen.",
      },
      {
        k: "stats",
        text: "Startup: $3,200 · Break-even: Month 5 · Year 1 target: $48,000",
      },
    ],
  },
  {
    id: "roadmap",
    title: "90-Day Roadmap",
    lines: [
      {
        k: "labeled",
        label: "Days 1–30:",
        text: "LLC via registered agent · Substack + Stripe live · 8 free recipe stories published",
      },
      {
        k: "labeled",
        label: "Days 31–60:",
        text: "Paid tier at $8/mo · First workshop — 12 seats, $35 · 400 free subscribers",
      },
      {
        k: "labeled",
        label: "Days 61–90:",
        text: "$19 digital mini-cookbook · Decision point: double down on highest-margin stream",
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
        text: "Zero inventory, zero location costs — travel generates the content",
      },
      { k: "labeled", label: "W:", text: "No audience at launch" },
      { k: "labeled", label: "O:", text: "Every destination is a new content season" },
      { k: "labeled", label: "T:", text: "Platform dependency, crowded niche" },
      { k: "verdict", prefix: "Viability verdict: ", emphasis: "GO" },
    ],
  },
  {
    id: "implementation",
    title: "Implementation Suggestions",
    lines: [
      {
        k: "labeled",
        label: "Start here:",
        text: "Register the LLC and open a business bank account before anything else — one afternoon, done remotely",
      },
      {
        k: "labeled",
        label: "Tools:",
        text: "Substack (newsletter) · Stripe (payments) · Zoom (workshops) — all free to start",
      },
      {
        k: "labeled",
        label: "First win:",
        text: "Publish before you're ready. Story #1 builds the audience that buys everything after",
      },
      {
        k: "labeled",
        label: "Avoid:",
        text: "Building a custom website first — validate with the newsletter, upgrade later",
      },
    ],
  },
];

// ── Fan geometry ───────────────────────────────────────────────────────────

// Ascending z-index left→right so each card layers on top of its left neighbor.
// This naturally keeps SWOT (index 2) above Roadmap (index 1) in resting state.
const RESTING_Z = [4, 7, 10, 13] as const;

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
    const defaultZ = index === 1 ? 10 : 5;
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
        boxShadow: "0 20px 40px rgba(0,0,0,0.14)",
        opacity: 1,
        zIndex: 50,
        transition,
      };
    }

    return {
      transform: `rotate(${rot}deg)`,
      boxShadow: "0 4px 16px rgba(0,0,0,0.07)",
      opacity: anyFocused ? 0.7 : 1,
      zIndex: defaultZ,
      transition,
    };
  }

  return (
    <section className="py-16 px-6" style={{ background: "#FEFCF5" }}>
      <div className="max-w-4xl mx-auto">

        {/* Section heading */}
        <div className="text-center mb-14">
          <p
            className="font-sans text-xs uppercase tracking-[0.2em] mb-3"
            style={{ color: "#C9A030" }}
          >
            Sample Output
          </p>
          <h2
            className="font-serif font-bold text-4xl sm:text-5xl mb-3"
            style={{ color: "#0D1117" }}
          >
            See What You&apos;ll Get
          </h2>
          <p className="font-sans text-base" style={{ color: "#8B6914" }}>
            A real excerpt from one of our Growth plans — structured, specific, and ready to act on.
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

                {/* Bottom fade — masks overflow content */}
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
              </div>
            );
          })}
        </div>

        {/* Caption */}
        <p
          className="text-center font-sans text-xs mt-10"
          style={{ color: "var(--i2p-ink-dim)" }}
        >
          Excerpt from a sample Growth plan&nbsp;&nbsp;·&nbsp;&nbsp;Hover or tap to explore
        </p>

      </div>
    </section>
  );
}
