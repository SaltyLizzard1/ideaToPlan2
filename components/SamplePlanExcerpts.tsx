"use client";

import { useState, useEffect, CSSProperties } from "react";
import Link from "next/link";
import { SAMPLE_PAGES, type Line, type SamplePage } from "@/lib/samplePlan";

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

// The face of one excerpt card. Identical in the fan and in the narrow row, so
// the two layouts can never drift apart.
function CardFace({ page, showFade }: { page: SamplePage; showFade: boolean }) {
  return (
    <>
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

      {/* Bottom fade where the full page can never fit */}
      {showFade && (
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
    </>
  );
}

export default function SamplePlanExcerpts() {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const rmq = window.matchMedia("(prefers-reduced-motion: reduce)");

    setIsNarrow(mq.matches);
    setPrefersReduced(rmq.matches);

    const onResize = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener("change", onResize);
    return () => mq.removeEventListener("change", onResize);
  }, []);

  const geo = DESKTOP;
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
      className="section-y"
      style={{
        background: "#0D1117",
        backgroundImage:
          "radial-gradient(circle, rgba(201,160,48,0.06) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        scrollMarginTop: "80px",
      }}
    >
      <div className="page-container">

        {/* Section heading */}
        <div className="text-center mb-s2">
          <p
            className="font-sans text-xs uppercase tracking-[0.2em] mb-s3"
            style={{ color: "#C9A030" }}
          >
            The Proof
          </p>
          <h3
            className="font-serif font-bold text-3xl sm:text-4xl mb-s3"
            style={{ color: "#FBF6E3" }}
          >
            Inside Every Plan
          </h3>
          <p className="font-sans text-base mt-s5 mx-auto max-w-text" style={{ color: "#cfc9b8" }}>
            Every tool in this category shows you samples written to be samples. This is an
            actual plan IdeaToPlan produced, published exactly as it came out, with the real
            numbers and the uncomfortable parts left in.
          </p>
        </div>

        {/* Excerpts. A fan at 768 and up. Below that a swipeable row, because
            four overlapping 118px cards left every title unreadable. */}
        {isNarrow ? (
          <div
            className="bleed-row flex gap-s4 overflow-x-auto snap-x snap-mandatory"
            style={{ scrollbarWidth: "none" }}
          >
            {SAMPLE_PAGES.map((page) => (
              <Link
                key={page.id}
                href={`/sample-plan#${page.id}`}
                aria-label={`Read ${page.title} in full`}
                className="snap-center shrink-0 relative p-s4 block"
                style={{
                  width: "min(78vw, 260px)",
                  aspectRatio: "3 / 4",
                  borderRadius: "12px",
                  background: "white",
                  border: "1px solid var(--i2p-cream-border)",
                  overflow: "hidden",
                  boxSizing: "border-box",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                }}
              >
                <CardFace page={page} showFade />
              </Link>
            ))}
          </div>
        ) : (
          <div
            className="relative mx-auto"
            style={{ height: `${geo.containerH}px`, overflow: "visible" }}
            onMouseLeave={() => setFocusedId(null)}
          >
            {SAMPLE_PAGES.map((page, index) => {
              const isFocused = focusedId === page.id;
              const topPx = Math.round((geo.containerH - geo.cardH) / 2);

              return (
                <Link
                  key={page.id}
                  href={`/sample-plan#${page.id}`}
                  aria-label={`Read ${page.title} in full`}
                  onMouseEnter={() => setFocusedId(page.id)}
                  className="p-s4 block"
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
                    overflow: "hidden",
                    boxSizing: "border-box",
                    userSelect: "none",
                    ...getCardStyle(index, isFocused),
                  }}
                >
                  <CardFace page={page} showFade={false} />
                </Link>
              );
            })}
          </div>
        )}

        {/* Caption */}
        <p className="text-center font-sans text-xs mt-s5" style={{ color: "#a89f8a" }}>
          Hover to preview, click to read in full
        </p>

        <p className="text-center font-sans text-sm mt-s3">
          <a
            href="/sample-plan"
            style={{ color: "#C9A030", textDecoration: "underline", textUnderlineOffset: "3px" }}
          >
            Read the whole plan
          </a>
        </p>

      </div>
    </section>
  );
}
