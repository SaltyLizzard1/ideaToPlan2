// app/api/verify-payment/route.ts
// Verifies a completed Stripe Checkout session (from a Payment Link) server-side.
// Fetches the selected match from client_reference_id if available.
// The intake form only unlocks when this returns paid: true.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { checkRateLimit, clientIp } from "../../../lib/rateLimit";
import { parseClientReferenceId } from "../../../lib/stripe";
import { supabase } from "../../../lib/supabase";
import { mergeMatches, type MergedMatch } from "../../../lib/quiz";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Payment-link sessions carry no custom metadata, so the plan is
// identified by the charge amount (in cents).
const PLAN_BY_AMOUNT: Record<number, string> = {
  2500: "Starter",
  5000: "Growth",
};

export async function POST(req: NextRequest) {
  try {
    const allowed = await checkRateLimit(`verify-payment:${clientIp(req)}`, 20, 3600);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const { sessionId } = await req.json();

    if (!sessionId || typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      return NextResponse.json({ error: "Missing or invalid session id" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid = session.payment_status === "paid";
    const planType = PLAN_BY_AMOUNT[session.amount_total ?? 0] ?? null;

    // Attempt to fetch sourceMatch from client_reference_id
    let sourceMatch: MergedMatch | null = null;
    const clientRefId = session.client_reference_id;

    if (clientRefId) {
      const parsed = parseClientReferenceId(clientRefId);
      if (parsed) {
        const { resultId, matchIndex } = parsed;
        try {
          const { data, error } = await supabase
            .from('quiz_results')
            .select('matches, details')
            .eq('id', resultId)
            .eq('site', 'i2p')
            .single();

          if (error) {
            console.error(`[verify-payment] Result not found: resultId=${resultId}, matchIndex=${matchIndex}, error=${error.message}`);
          } else if (data) {
            const merged = mergeMatches(data.matches, data.details);
            if (matchIndex >= 0 && matchIndex < merged.length) {
              sourceMatch = merged[matchIndex];
            } else {
              console.error(`[verify-payment] Match index out of range: resultId=${resultId}, matchIndex=${matchIndex}, total_matches=${merged.length}`);
            }
          }
        } catch (err) {
          console.error(`[verify-payment] Failed to fetch sourceMatch: resultId=${resultId}, matchIndex=${matchIndex}, error=${err}`);
        }
      } else {
        console.error(`[verify-payment] Malformed client_reference_id: ${clientRefId}`);
      }
    } else {
      console.error('[verify-payment] No client_reference_id in Stripe session');
    }

    const responsePayload: Record<string, unknown> = {
      paid,
      planType,
      email: session.customer_details?.email ?? null,
      customerName: session.customer_details?.name ?? null,
      sessionId: session.id,
    };

    if (sourceMatch) {
      responsePayload.sourceMatch = sourceMatch;
    }

    return NextResponse.json(responsePayload);
  } catch (err) {
    console.error("Payment verification failed:", err);
    return NextResponse.json(
      { paid: false, error: "Verification failed" },
      { status: 500 }
    );
  }
}
