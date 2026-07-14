// app/api/verify-payment/route.ts
// Verifies a completed Stripe Checkout session (from a Payment Link) server-side.
// The intake form only unlocks when this returns paid: true.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Payment-link sessions carry no custom metadata, so the plan is
// identified by the charge amount (in cents).
const PLAN_BY_AMOUNT: Record<number, string> = {
  2500: "Starter",
  5000: "Growth",
};

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId || typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      return NextResponse.json({ error: "Missing or invalid session id" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid = session.payment_status === "paid";
    const planType = PLAN_BY_AMOUNT[session.amount_total ?? 0] ?? null;

    return NextResponse.json({
      paid,
      planType,
      email: session.customer_details?.email ?? null,
      // Passed through so the submission can carry the payment reference to n8n.
      sessionId: session.id,
    });
  } catch (err) {
    console.error("Payment verification failed:", err);
    return NextResponse.json(
      { paid: false, error: "Verification failed" },
      { status: 500 }
    );
  }
}
