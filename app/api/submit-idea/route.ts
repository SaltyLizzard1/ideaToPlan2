import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "../../../lib/supabase";

export const maxDuration = 180;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PLAN_BY_AMOUNT: Record<number, string> = {
  2500: "Starter",
  5000: "Growth",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = body.stripeSessionId;

    if (!sessionId || typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      return NextResponse.json({ error: "Missing payment reference" }, { status: 402 });
    }

    // 1. Verify the session is genuinely paid, server-side
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      return NextResponse.json({ error: "Invalid payment reference" }, { status: 402 });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    }

    // 2. Atomically mark the session as redeemed — primary key rejects reuse
    const { error: redemptionError } = await supabase
      .from("stripe_redemptions")
      .insert({
        session_id: session.id,
        site: "i2p",
        email: session.customer_details?.email ?? null,
      });

    if (redemptionError) {
      // 23505 = unique violation: this session was already used
      if (redemptionError.code === "23505") {
        return NextResponse.json(
          { error: "This payment has already been used for a submission" },
          { status: 409 }
        );
      }
      console.error("Redemption insert error:", redemptionError);
      return NextResponse.json({ error: "Submission failed" }, { status: 500 });
    }

    // 3. Only now forward to the plan pipeline
    const res = await fetch(process.env.N8N_I2P_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        verifiedPlanType: PLAN_BY_AMOUNT[session.amount_total ?? 0] ?? null,
        verifiedEmail: session.customer_details?.email ?? null,
      }),
      signal: AbortSignal.timeout(175_000),
    });

    if (!res.ok) {
      throw new Error(`n8n responded ${res.status}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("IdeaToPlan submission error:", err);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
