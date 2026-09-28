// The purchasable tiers, in one place.
//
// The Business Plans section and the per-match plan chooser both render from
// this, so the two can never end up claiming different things. The copy is
// lifted verbatim from the Business Plans section as it stood. Nothing has
// been added or reworded.

export type PlanName = "Starter" | "Growth";

export interface Plan {
  name: PlanName;
  price: string;
  tagline: string;
  features: string[];
}

// Order matters: this array is the running order everywhere the tiers are
// shown, in the chooser and in the Business Plans section. Growth leads.
export const PLANS: Plan[] = [
  {
    name: "Growth",
    price: "$50",
    tagline: "For entrepreneurs who want market validation and smarter positioning.",
    features: [
      "Everything in Starter",
      "Competitor research and landscape analysis",
      "SWOT analysis",
      "Viability verdict with go/no-go assessment",
      "Reviewed by a real person, never auto-sent",
      "Email follow-up to answer your questions",
    ],
  },
  {
    name: "Starter",
    price: "$25",
    tagline: "For founders who want a polished business plan without overpaying.",
    features: [
      "Actionable business plan built around your idea",
      "Revenue model and pricing strategy",
      "90-day roadmap with clear milestones",
      "Professional PDF delivered in 72 hours",
      "Reviewed by a real person, never auto-sent",
      "Email follow-up to answer your questions",
    ],
  },
];

export function getPlan(name: PlanName): Plan {
  const plan = PLANS.find((p) => p.name === name);
  if (!plan) throw new Error(`Unknown plan: ${name}`);
  return plan;
}
