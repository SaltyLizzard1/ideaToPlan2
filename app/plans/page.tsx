"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";
import ScrollReveal from "@/components/ScrollReveal";

const PLAN_TYPES = [
  {
    name: "Personal Roadmap",
    description: "For founders who want a clear path forward without external pressure.",
    use: [
      "You're testing an idea and need a solid foundation",
      "You want a 90-day action plan to get started",
      "You're ready to take control of your direction",
    ],
  },
  {
    name: "Bank Loan",
    description: "For small business owners seeking financing from traditional lenders.",
    use: [
      "You need to present a plan to banks or SBA lenders",
      "Your plan must demonstrate viability and repayment capacity",
      "You have (or can gather) financial statements and collateral",
    ],
  },
  {
    name: "Investor Pitch",
    description: "For entrepreneurs raising capital from angel investors or venture firms.",
    use: [
      "You're seeking equity funding or angel investment",
      "Your plan must articulate market opportunity and exit potential",
      "You need a compelling narrative around traction and vision",
    ],
  },
];

const TIER_COMPARISON = [
  {
    feature: "Business plan PDF",
    starter: true,
    growth: true,
  },
  {
    feature: "Reviewed by real person",
    starter: true,
    growth: true,
  },
  {
    feature: "Market fit analysis",
    starter: false,
    growth: true,
  },
  {
    feature: "Competitor research & SWOT",
    starter: false,
    growth: true,
  },
  {
    feature: "Viability verdict",
    starter: false,
    growth: true,
  },
  {
    feature: "Email follow-up support",
    starter: true,
    growth: true,
  },
  {
    feature: "Revised until you're happy",
    starter: true,
    growth: true,
  },
];

export default function PlansPage() {
  return (
    <main className="min-h-screen" style={{ background: "#0D1117" }}>
      {/* Hero */}
      <section
        className="pt-24 pb-16 px-4 md:px-8"
        style={{ scrollMarginTop: "80px" }}
      >
        <div className="max-w-4xl mx-auto">
          <h1
            className="text-4xl md:text-5xl font-serif font-bold mb-6 text-center"
            style={{ color: "#F5E9C9" }}
          >
            Business Plans Built for Your Goal
          </h1>
          <p
            className="text-lg text-center mb-8"
            style={{ color: "#E8E4DB", maxWidth: "600px", margin: "0 auto 2rem" }}
          >
            Whether you're plotting your own path, securing a loan, or pitching investors, your plan should reflect your specific goal—and reality.
          </p>
        </div>
      </section>

      {/* Plan types */}
      <section className="px-4 md:px-8 py-12 md:py-16">
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-3xl font-serif font-bold mb-12 text-center"
            style={{ color: "#F5E9C9" }}
          >
            What's Your Plan For?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {PLAN_TYPES.map((type, i) => (
              <ScrollReveal key={i}>
                <div
                  className="rounded-2xl p-8 h-full"
                  style={{
                    background: "#1a1a1f",
                    border: "1px solid #E8E4DB",
                  }}
                >
                  <h3
                    className="text-xl font-bold mb-3"
                    style={{ color: "#E8C84A" }}
                  >
                    {type.name}
                  </h3>
                  <p
                    className="mb-5 text-sm leading-relaxed"
                    style={{ color: "#E8E4DB" }}
                  >
                    {type.description}
                  </p>
                  <div className="space-y-2">
                    {type.use.map((point, j) => (
                      <div key={j} className="flex gap-2">
                        <CheckCircle
                          className="w-4 h-4 flex-shrink-0 mt-0.5"
                          style={{ color: "#C9A030" }}
                        />
                        <span className="text-sm" style={{ color: "#B0AA9E" }}>
                          {point}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Tier comparison */}
      <section className="px-4 md:px-8 py-12 md:py-16">
        <div className="max-w-4xl mx-auto">
          <h2
            className="text-3xl font-serif font-bold mb-12 text-center"
            style={{ color: "#F5E9C9" }}
          >
            Starter vs. Growth Tier
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ borderBottom: "2px solid #E8C84A" }}>
                  <th
                    className="text-left py-3 px-4 font-semibold"
                    style={{ color: "#F5E9C9" }}
                  >
                    Feature
                  </th>
                  <th
                    className="text-center py-3 px-4 font-semibold"
                    style={{ color: "#F5E9C9" }}
                  >
                    Starter ($25)
                  </th>
                  <th
                    className="text-center py-3 px-4 font-semibold"
                    style={{ color: "#F5E9C9" }}
                  >
                    Growth ($50)
                  </th>
                </tr>
              </thead>
              <tbody>
                {TIER_COMPARISON.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "1px solid #2a2a2f",
                    }}
                  >
                    <td
                      className="py-3 px-4"
                      style={{ color: "#E8E4DB" }}
                    >
                      {row.feature}
                    </td>
                    <td className="text-center py-3 px-4">
                      {row.starter ? (
                        <CheckCircle
                          className="w-5 h-5 inline"
                          style={{ color: "#C9A030" }}
                        />
                      ) : (
                        <span style={{ color: "#6B6B66" }}>—</span>
                      )}
                    </td>
                    <td className="text-center py-3 px-4">
                      {row.growth ? (
                        <CheckCircle
                          className="w-5 h-5 inline"
                          style={{ color: "#C9A030" }}
                        />
                      ) : (
                        <span style={{ color: "#6B6B66" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 md:px-8 py-12 md:py-16 text-center">
        <ScrollReveal>
          <div>
            <h2
              className="text-3xl font-serif font-bold mb-4"
              style={{ color: "#F5E9C9" }}
            >
              Ready to Build?
            </h2>
            <p
              className="mb-8 text-lg"
              style={{ color: "#B0AA9E", maxWidth: "500px", margin: "0 auto 2rem" }}
            >
              Start with the free assessment to discover which business fits you best.
            </p>
            <Link
              href="/assessment"
              className="cta-shimmer gold-border inline-flex items-center gap-2 px-8 py-4 rounded-full font-sans font-semibold text-base"
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
            </Link>
          </div>
        </ScrollReveal>
      </section>
    </main>
  );
}
