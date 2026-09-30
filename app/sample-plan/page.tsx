import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import { SAMPLE_PAGES, type Line } from "@/lib/samplePlan";
import { BASE_URL } from "@/lib/seo";

// A readable, indexable version of the sample plan. The homepage shows the same
// content as a fanned stack of cards, which looks good and indexes as nothing.
// This page is the one search can actually read.

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
        <p key={i} className="mb-s4 leading-relaxed" style={{ color: "var(--i2p-ink-body)" }}>
          {line.text}
        </p>
      );
    case "labeled":
      return (
        <p key={i} className="mb-s3 leading-relaxed" style={{ color: "var(--i2p-ink-body)" }}>
          <strong style={{ color: "var(--i2p-ink)", fontWeight: 700 }}>{line.label}</strong> {line.text}
        </p>
      );
    case "stats":
      return (
        <p key={i} className="mb-s4 font-semibold leading-relaxed" style={{ color: "var(--i2p-ink)" }}>
          {line.text}
        </p>
      );
    case "verdict":
      return (
        <p key={i} className="mb-s4 leading-relaxed" style={{ color: "var(--i2p-ink-body)" }}>
          <strong style={{ color: "var(--i2p-ink)", fontWeight: 700 }}>{line.prefix}</strong> {line.emphasis}
        </p>
      );
  }
}

export default function SamplePlanPage() {
  return (
    <>
      <main style={{ background: "var(--i2p-cream)" }}>
        <section
          className="section-y"
          style={{ background: "linear-gradient(180deg, var(--i2p-dark) 0%, #17140c 100%)" }}
        >
          <div className="page-container">
            <div className="measure-text text-center mx-auto">
              <p
                className="font-sans uppercase tracking-widest text-xs mb-s3"
                style={{ color: "#C9A030", letterSpacing: "0.22em" }}
              >
                The Proof
              </p>
              <h1
                className="font-serif font-bold leading-tight mb-s5"
                style={{ color: "var(--i2p-text-on-dark)", fontSize: "clamp(2rem, 4vw, 3rem)" }}
              >
                A Real Business Plan, Unedited
              </h1>
              <p
                className="font-sans leading-relaxed"
                style={{ color: "var(--i2p-text-on-dark-body)", fontSize: "1.05rem", lineHeight: 1.75 }}
              >
                Every business plan tool shows you samples written to be samples. This is an actual
                plan IdeaToPlan produced, published exactly as it came out, with the real numbers and
                the uncomfortable parts left in. Read the whole thing before you decide whether to buy
                one.
              </p>
            </div>
          </div>
        </section>

        <section className="section-y">
          <div className="page-container">
            <div className="measure-text">
              {SAMPLE_PAGES.map((page) => (
                <article key={page.id} className="mb-s6">
                  <h2
                    className="font-serif font-bold mb-s4"
                    style={{ color: "var(--i2p-ink)", fontSize: "clamp(1.5rem, 3vw, 2rem)" }}
                  >
                    {page.title}
                  </h2>
                  <div
                    className="rounded-2xl card-pad"
                    style={{ background: "#FFFFFF", border: "1px solid var(--i2p-cream-border)" }}
                  >
                    {page.lines.map((line, i) => renderLine(line, i))}
                  </div>
                </article>
              ))}

              <div
                className="rounded-2xl card-pad text-center mt-s6"
                style={{ background: "var(--i2p-cream-card)", border: "1px solid var(--i2p-cream-border)" }}
              >
                <p className="text-lg font-bold mb-s2" style={{ color: "var(--i2p-ink)" }}>
                  Want one of these for your own idea?
                </p>
                <p className="text-sm mb-s5" style={{ color: "var(--i2p-ink-body)" }}>
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
                    style={{ borderColor: "#C9A030", color: "#5C4206", backgroundColor: "#FBF6E4" }}
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
