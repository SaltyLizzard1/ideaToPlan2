// What a business plan contains: the four cards of the homepage fan.
//
// These describe sections of a plan in general terms. They are not taken from
// any generated plan and must not be presented as a sample of one.
//
// Tiers: the Executive Summary, the market section, the financial model and
// budget are written for both Starter and Growth. Research on competing offers,
// with its sources, is Growth only, and the second card says so. The 90-day
// action plan is part of roadmap and bank-loan plans; an investor pitch has a
// go-to-market section in its place.

import type { SamplePage } from "@/lib/samplePlan";

export const PLAN_CONTENTS: SamplePage[] = [
  {
    id: "executive-summary",
    title: "Executive Summary",
    lines: [
      {
        k: "p",
        text: "A clear explanation of your business idea, who it serves, and the problem it solves. This section brings the plan together so you can explain what you’re building and what needs to happen next.",
      },
    ],
  },
  {
    id: "market-competition",
    title: "Market & Competition",
    lines: [
      {
        k: "p",
        text: "Understand your potential customers and the alternatives they already use. In the Growth plan, research on competing offers is cited to its sources. Gaps and judgments are identified so you can see what still needs validation.",
      },
    ],
  },
  {
    id: "revenue-financial-assumptions",
    title: "Revenue & Financial Assumptions",
    lines: [
      {
        k: "p",
        text: "See how your business could earn money, what it may cost to operate, and the assumptions behind the numbers. Estimates are distinguished from known figures so you can assess the scenario and test it.",
      },
    ],
  },
  {
    id: "action-plan",
    title: "Action Plan",
    lines: [
      {
        k: "p",
        text: "Turn the idea into practical next steps. Identify what to validate first, what you need to put in place, and which actions deserve attention before spending more time or money.",
      },
    ],
  },
];
