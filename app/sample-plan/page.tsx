import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import { SAMPLE_PAGES, type Line } from "@/lib/samplePlan";
import { BASE_URL } from "@/lib/seo";

// The homepage shows these four sections as a fanned stack of pages. This is
// those pages at full size, so it is set as one continuous sheet rather than a
// run of cards. It reads as the document it is, and search can read it too.

export const metadata: Metadata = {
  title: "A Real Business Plan, Unedited | IdeaToPlan",
  description:
    "An actual business plan produced by IdeaToPlan, published unedited: executive summary, market fit with named competitors, SWOT, and a 90-day action plan.",
  alternates: { canonical: `${BASE_URL}/sample-plan` },
  openGraph: {
    title: "A Real Business Plan, Unedited",
    description:
      "An actual business plan produced by IdeaToPlan, published unedited. Read the whole thing before you buy one.",
    url: `${BASE_URL}/sample-plan`,
    siteName: "IdeaToPlan",
    images: [{ url: "/og-ideatoplan-dark.png", width: 1200, height: 630, alt: "IdeaToPlan" }],
  },
};

function renderLine(line: Line, i: number) {
  switch (line.k) {
    case "p":
      return (
        <p key={i} className="mb-s4" style={{ color: "#3F3A2E", lineHeight: 1.8 }}>
          {line.text}
        </p>
      );
    case "labeled":
      return (
        <p key={i} className="mb-s3" style={{ color: "#3F3A2E", lineHeight: 1.8 }}>
          <strong style={{ color: "#0D1117", fontWeight: 700 }}>{line.label}</strong> {line.text}
        </p>
      );
    case "stats":
      return (
        <p
          key={i}
          className="mb-s4 pl-s4"
          style={{ color: "#0D1117", fontWeight: 600, lineHeight: 1.8, borderLeft: "2px solid #C9A030" }}
        >
          {line.text}
        </p>
      );
    case "verdict":
      return (
        <p key={i} className="mb-s4" style={{ color: "#3F3A2E", lineHeight: 1.8 }}>
          <strong style={{ color: "#0D1117", fontWeight: 700 }}>{line.prefix}</strong> {line.emphasis}
        </p>
      );
  }
}

export default function SamplePlanPage() {
  return (
    <>
      <main style={{ background: "var(--i2p-dark)" }}>
        <section className="section-y">
          <div className="page-container">
            {/* The sheet. One page, the way the plan actually arrives. */}
            <div
              className="mx-auto"
              style={{
                maxWidth: "820px",
                background: "#FFFFFF",
                boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
                borderTop: "4px solid transparent",
                borderImage: "linear-gradient(90deg, #8B6914 0%, #C9A030 30%, #F5D020 50%, #C9A030 70%, #8B6914 100%) 1",
              }}
            >
              <div className="px-s5 sm:px-s6 py-s6 sm:py-s7">
                {/* Document header */}
                <header
                  className="pb-s5 mb-s6"
                  style={{ borderBottom: "1px solid #E8E4DB" }}
                >
                  <p
                    className="font-sans uppercase text-xs mb-s2"
                    style={{ color: "#8B6914", letterSpacing: "0.22em" }}
                  >
                    Business Plan
                  </p>
                  <h1
                    className="font-serif font-bold leading-tight mb-s3"
                    style={{ color: "#0D1117", fontSize: "clamp(1.9rem, 4vw, 2.75rem)" }}
                  >
                    A Real Business Plan, Unedited
                  </h1>
                  <p className="font-sans text-sm" style={{ color: "#6B6B66", lineHeight: 1.7 }}>
                    Produced by IdeaToPlan and published exactly as it came out, with the real
                    numbers and the uncomfortable parts left in. Every other tool shows you samples
                    written to be samples. This is the actual document.
                  </p>
                </header>

                {/* The plan itself */}
                {SAMPLE_PAGES.map((page, index) => (
                  <section
                    key={page.id}
                    id={page.id}
                    className={`plan-section ${index === SAMPLE_PAGES.length - 1 ? "" : "mb-s6"}`}
                  >
                    <h2 className="font-serif font-bold mb-s4 flex items-baseline gap-s3">
                      <span
                        className="font-sans"
                        style={{ color: "#C9A030", fontSize: "0.85rem", fontWeight: 700 }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span style={{ color: "#0D1117", fontSize: "clamp(1.3rem, 2.6vw, 1.65rem)" }}>
                        {page.title}
                      </span>
                    </h2>
                    <div className="font-sans" style={{ fontSize: "1rem" }}>
                      {page.lines.map((line, i) => renderLine(line, i))}
                    </div>
                  </section>
                ))}
              </div>

              {/* Footer of the sheet */}
              <div
                className="px-s5 sm:px-s6 py-s5 text-center"
                style={{ background: "#FBF6E4", borderTop: "1px solid #E8E4DB" }}
              >
                <p className="font-serif font-bold mb-s2" style={{ color: "#0D1117", fontSize: "1.1rem" }}>
                  Want one of these for your own idea?
                </p>
                <p className="font-sans text-sm mb-s4" style={{ color: "#57503F", lineHeight: 1.7 }}>
                  If you already know what you want to build, start from the plan. If you do not, the
                  free assessment matches you to seven paths first.
                </p>
                <div className="flex flex-col sm:flex-row gap-s3 justify-center">
                  <Link
                    href="/assessment"
                    className="gold-gradient inline-block px-s6 py-s3 font-semibold rounded-lg transition-all hover:brightness-105"
                    style={{ color: "#2D1A00", border: "1.5px solid #7A5C0A" }}
                  >
                    Find what fits me
                  </Link>
                  <Link
                    href="/#pricing"
                    className="inline-block px-s6 py-s3 font-semibold rounded-lg border transition-colors"
                    style={{ borderColor: "#C9A030", color: "#5C4206", backgroundColor: "#FFFFFF" }}
                  >
                    I know my idea, build the plan
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
