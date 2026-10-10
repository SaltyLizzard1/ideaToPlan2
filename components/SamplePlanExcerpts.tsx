"use client";

import { useState, useEffect, CSSProperties } from "react";
import { type Line, type SamplePage } from "@/lib/samplePlan";
import { PLAN_CONTENTS } from "@/lib/planContents";

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

// The fan's cards are small pages, so their text is small. The stacked cards on phones are
// full width and are read, not glanced at, so they take a larger size.
function renderLine(line: Line, i: number, fontSize: string, last: boolean) {
  const base: CSSProperties = {
    fontSize,
    lineHeight: "1.6",
    color: "var(--i2p-ink-body)",
    // no gap under the last line, so a card sized to its text ends at its padding
    marginBottom: last ? 0 : "7px",
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
            fontSize,
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

// The face of one card. The fan and the stacked cards share it, so the two layouts can never
// drift apart in content. Only the text size differs.
function CardFace({ page, stacked }: { page: SamplePage; stacked: boolean }) {
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
          fontSize: stacked ? "17px" : "14px",
          lineHeight: 1.3,
          color: "var(--i2p-ink)",
          marginBottom: stacked ? "8px" : "10px",
        }}
      >
        {page.title}
      </h3>

      {/* Content lines */}
      <div>
        {page.lines.map((line, i) =>
          renderLine(line, i, stacked ? "14px" : "11px", i === page.lines.length - 1),
        )}
      </div>
    </>
  );
}

export default function SamplePlanExcerpts() {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    setPrefersReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
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
        scrollMarginTop: "var(--header-h)",
      }}
    >
      <div className="page-container">

        {/* Section heading */}
        <div className="text-center mb-s2">
          <p
            className="font-sans text-xs uppercase tracking-[0.2em] mb-s3"
            style={{ color: "#C9A030" }}
          >
            What You Get
          </p>
          <h3
            className="font-serif font-bold text-3xl sm:text-4xl mb-s3"
            style={{ color: "#FBF6E3" }}
          >
            Inside Your Business Plan
          </h3>
          <p className="font-sans text-base mt-s5 mx-auto max-w-text" style={{ color: "#cfc9b8" }}>
            Explore the thinking behind your business plan, from the idea and its market to the
            numbers and next steps.
          </p>
        </div>

        {/* The cards. They describe what a plan contains and link nowhere. A fan at 768 and up.
            Below that, four cards stacked in a column, each as tall as its text. A swipeable row
            of page-shaped cards was tried first: it was taller than its content, hid three of
            the four cards off screen and cut the text off at the bottom.

            Both layouts are rendered and CSS picks one. Choosing in an effect
            meant a phone first painted the 551px-wide fan, which widened the
            mobile viewport for a moment and made a hash scroll that ran in
            that moment (a link to /#pricing from another page) land short. */}
        <div className="flex flex-col gap-s3 mt-s5 md:hidden">
          {PLAN_CONTENTS.map((page) => (
            <div
              key={page.id}
              className="p-s4"
              style={{
                borderRadius: "12px",
                background: "white",
                border: "1px solid var(--i2p-cream-border)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
              }}
            >
              <CardFace page={page} stacked />
            </div>
          ))}
        </div>

        <div
          className="relative mx-auto hidden md:block"
          style={{ height: `${geo.containerH}px`, overflow: "visible" }}
          onMouseLeave={() => setFocusedId(null)}
        >
            {PLAN_CONTENTS.map((page, index) => {
              const isFocused = focusedId === page.id;
              const topPx = Math.round((geo.containerH - geo.cardH) / 2);

              return (
                <div
                  key={page.id}
                  onMouseEnter={() => setFocusedId(page.id)}
                  className="p-s4 block"
                  style={{
                    position: "absolute",
                    width: `${geo.cardW}px`,
                    height: `${geo.cardH}px`,
                    left: `calc(50% + ${geo.xOffsets[index]}px - ${geo.cardW / 2}px)`,
                    top: `${topPx}px`,
                    cursor: "default",
                    borderRadius: "12px",
                    background: "white",
                    border: "1px solid var(--i2p-cream-border)",
                    overflow: "hidden",
                    boxSizing: "border-box",
                    userSelect: "none",
                    ...getCardStyle(index, isFocused),
                  }}
                >
                  <CardFace page={page} stacked={false} />
                </div>
              );
            })}
        </div>

      </div>
    </section>
  );
}
