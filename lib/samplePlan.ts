// The sample plan, in one place.
//
// It is a real plan, unedited, produced by IdeaToPlan. The homepage shows it as
// a fanned stack of excerpt cards and /sample-plan renders the same content as a
// readable page that search engines can index. Both read from here so the two
// can never drift.

export type Line =
  | { k: "p"; text: string }
  | { k: "labeled"; label: string; text: string }
  | { k: "stats"; text: string }
  | { k: "verdict"; prefix: string; emphasis: string };

export interface SamplePage {
  id: string;
  title: string;
  lines: Line[];
}

export const SAMPLE_PAGES: SamplePage[] = [
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
