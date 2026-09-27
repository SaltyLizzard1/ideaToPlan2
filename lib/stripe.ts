// Environment-conditional Stripe Payment Link URLs
const STRIPE_LINKS_TEST = {
  Starter: 'https://buy.stripe.com/test_14A8wI5GDgf6ekc1oa4Ja03',
  Growth: 'https://buy.stripe.com/test_5kQ3co2ur4wogsk3wi4Ja02',
};

const STRIPE_LINKS_LIVE = {
  Starter: 'https://buy.stripe.com/7sY00kb2Hf7ugmb6J4b7y02',
  Growth: 'https://buy.stripe.com/7sY28s8UzaRe9XN3wSb7y03',
};

export function getStripeLink(planType: 'Starter' | 'Growth'): string {
  const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';
  const links = isProduction ? STRIPE_LINKS_LIVE : STRIPE_LINKS_TEST;
  return links[planType] || links.Starter;
}

/**
 * Format match selection as client_reference_id for Stripe Payment Link
 * Format: {resultId}_{matchIndex}
 * Validates alphanumeric, dashes, underscores, max 200 chars (Stripe constraint)
 */
export function createClientReferenceId(resultId: string, matchIndex: number): string | null {
  const id = `${resultId}_${matchIndex}`;
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) {
    console.error(`Invalid client_reference_id format: ${id}`);
    return null;
  }
  return id;
}

/**
 * Append client_reference_id and optional email to Payment Link URL
 */
export function appendPaymentParams(
  baseUrl: string,
  clientReferenceId: string,
  email?: string
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('client_reference_id', clientReferenceId);
  if (email) {
    url.searchParams.set('prefilled_email', email);
  }
  return url.toString();
}

/**
 * Parse client_reference_id (format: {resultId}_{matchIndex})
 * Returns {resultId, matchIndex} or null if invalid
 */
export function parseClientReferenceId(
  clientReferenceId: string
): { resultId: string; matchIndex: number } | null {
  const parts = clientReferenceId.split('_');
  if (parts.length !== 2) {
    console.error(`Malformed client_reference_id: ${clientReferenceId}`);
    return null;
  }
  const [resultId, matchIndexStr] = parts;
  const matchIndex = parseInt(matchIndexStr, 10);
  if (isNaN(matchIndex) || matchIndex < 0 || matchIndex > 6) {
    console.error(`Invalid match index in client_reference_id: ${clientReferenceId}`);
    return null;
  }
  return { resultId, matchIndex };
}
