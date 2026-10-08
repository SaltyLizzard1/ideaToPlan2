// Current-state intake answers: the business stage and the "already in place" checklist.
// Shared by the form (toggle logic and the value it submits) and the submit-idea route (validation).
//
// The checklist has three states, and they must never be collapsed:
//   skipped            { answered: false, items: [] }   every item is unknown
//   "None of these"    { answered: true,  items: [] }   the founder states none is in place
//   some ticked        { answered: true,  items: [...] } ticked = in place, unticked = not in place

export const STAGE_OPTIONS = [
  { value: "idea", label: "Just an idea" },
  { value: "testing", label: "Testing it (talking to potential customers, no sales yet)" },
  { value: "built", label: "Built, not launched" },
  { value: "launched", label: "Launched, no revenue yet" },
  { value: "revenue", label: "Earning revenue" },
  { value: "existing_new_offer", label: "Existing business adding a new offer" },
] as const;

export const ASSET_OPTIONS = [
  { value: "website", label: "Website or landing page" },
  { value: "social_audience", label: "Social audience" },
  { value: "email_list", label: "Email list" },
  { value: "content", label: "Published content" },
  { value: "customers", label: "Paying customers, past or current" },
  { value: "offer_ready", label: "Product or service ready to deliver" },
  { value: "booking_payment", label: "Booking or payment system" },
  { value: "paid_tools", label: "Tools or subscriptions you already pay for" },
] as const;

export type AssetsSelection = { items: string[]; none: boolean };
export type AssetsInPlace = { answered: boolean; items: string[] };

const STAGE_VALUES: readonly string[] = STAGE_OPTIONS.map((o) => o.value);
const ASSET_VALUES: readonly string[] = ASSET_OPTIONS.map((o) => o.value);

// Ticking an item clears "None of these yet".
export function toggleAsset(sel: AssetsSelection, key: string): AssetsSelection {
  const items = sel.items.includes(key) ? sel.items.filter((k) => k !== key) : [...sel.items, key];
  return { items, none: false };
}

// Ticking "None of these yet" clears every item.
export function toggleNone(sel: AssetsSelection): AssetsSelection {
  return { items: [], none: !sel.none };
}

// The value the form submits. Nothing ticked means the question was skipped.
export function toAssetsInPlace(sel: AssetsSelection): AssetsInPlace {
  if (sel.none) return { answered: true, items: [] };
  return { answered: sel.items.length > 0, items: [...sel.items] };
}

// Server side. Anything that is not a known stage is passed on as blank, which the pipeline reads as unknown.
export function normalizeStage(v: unknown): string {
  return typeof v === "string" && STAGE_VALUES.includes(v) ? v : "";
}

// Server side. Anything malformed is passed on as skipped, never as "none in place".
export function normalizeAssetsInPlace(v: unknown): AssetsInPlace {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { answered: false, items: [] };
  const o = v as { answered?: unknown; items?: unknown };
  if (o.answered !== true) return { answered: false, items: [] };
  const raw = Array.isArray(o.items) ? o.items : [];
  const items = ASSET_VALUES.filter((k) => raw.includes(k));
  return { answered: true, items: [...items] };
}
