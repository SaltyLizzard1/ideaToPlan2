import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "../../../lib/supabase";
import { notify } from "../../../lib/notify";
import { checkRateLimit, clientIp } from "../../../lib/rateLimit";

export const maxDuration = 180;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PLAN_BY_AMOUNT: Record<number, string> = {
  2500: "Starter",
  5000: "Growth",
};

const ALLOWED_FIELDS = [
  "fullName",
  "email",
  "businessIdea",
  "targetAudience",
  "problem",
  "industry",
  "location",
  "revenueModel",
  "differentiation",
  "budget",
  "planGoal",
  "planType",
  "expedited24h",
  "founderBackground",
  "fundingAsk",
  "useOfFunds",
  "currentTraction",
  "exitVision",
  "loanAmount",
  "loanUse",
  "creditStanding",
  "existingDebt",
  "assetsCollateral",
  "currentRevenue",
  "yearsInBusiness",
  "stripeSessionId",
] as const;

const MAX_FIELD_LENGTH = 5000;
const MAX_BODY_LENGTH = 50000;

export async function POST(req: NextRequest) {
  try {
    // 0. Rate limit — checked before body is consumed
    const allowed = await checkRateLimit(`submit-idea:${clientIp(req)}`, 10, 3600);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();

    // 1. Size caps
    if (JSON.stringify(body).length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    for (const key of Object.keys(body)) {
      if (typeof body[key] === "string" && (body[key] as string).length > MAX_FIELD_LENGTH) {
        return NextResponse.json(
          { error: `Field "${key}" exceeds maximum length` },
          { status: 413 }
        );
      }
    }

    const sessionId = body.stripeSessionId;

    if (!sessionId || typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      notify(
        "FAILED submission - payment verification",
        `Reason: missing or invalid session ID\nEmail: ${body?.email ?? "unknown"}`
      );
      return NextResponse.json({ error: "Missing payment reference" }, { status: 402 });
    }

    // 2. Verify the session is genuinely paid, server-side
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      notify(
        "FAILED submission - payment verification",
        `Reason: Stripe session retrieval failed\nEmail: ${body?.email ?? "unknown"}`
      );
      return NextResponse.json({ error: "Invalid payment reference" }, { status: 402 });
    }

    if (session.payment_status !== "paid") {
      notify(
        "FAILED submission - payment verification",
        `Reason: payment_status is "${session.payment_status}"\nEmail: ${session.customer_details?.email ?? body?.email ?? "unknown"}`
      );
      return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    }

    // 3. Atomically mark the session as redeemed — primary key rejects reuse
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

    // 4. Only now forward to the plan pipeline — allowlisted fields only
    const verifiedPlanType = PLAN_BY_AMOUNT[session.amount_total ?? 0] ?? null;

    const allowlisted: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        allowlisted[field] = body[field];
      }
    }

    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!secret) {
      console.warn("N8N_WEBHOOK_SECRET is not set — submit-idea webhook call will be unauthenticated");
    }
    const webhookHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) webhookHeaders["X-Webhook-Secret"] = secret;

    const res = await fetch(process.env.N8N_I2P_WEBHOOK_URL!, {
      method: "POST",
      headers: webhookHeaders,
      body: JSON.stringify({
        ...allowlisted,
        verifiedPlanType,
        verifiedEmail: session.customer_details?.email ?? null,
      }),
      signal: AbortSignal.timeout(175_000),
    });

    if (!res.ok) {
      throw new Error(`n8n responded ${res.status}`);
    }

    notify(
      `New plan submission: ${verifiedPlanType ?? "unknown"}`,
      `Name: ${body.fullName ?? "unknown"}\nEmail: ${session.customer_details?.email ?? body.email ?? "unknown"}\nIdea: ${String(body.businessIdea ?? "").slice(0, 400)}`
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("IdeaToPlan submission error:", err);
    notify(
      "FAILED submission - server error",
      `Error: ${err instanceof Error ? err.message : String(err)}`
    );
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
