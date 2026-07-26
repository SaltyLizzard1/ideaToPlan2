import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from '../../../lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const { email, formId: formIdParam, country } = await req.json();
    const allowed = await checkRateLimit(`subscribe:${clientIp(req)}`, 10, 3600);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const apiKey = process.env.KIT_API_KEY;
    const targetFormId = formIdParam === "visa"
      ? process.env.KIT_VISA_FORM_ID
      : process.env.KIT_QUIZ_FORM_ID;

    if (targetFormId && apiKey) {
      const payload: Record<string, unknown> = { email_address: email };
      if (country) payload.fields = { target_country: country };
      await fetch(`https://api.kit.com/v4/forms/${targetFormId}/subscribers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Kit-Api-Key": apiKey,
        },
        body: JSON.stringify(payload),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Kit subscribe error:", err);
    return NextResponse.json({ error: "Subscribe failed" }, { status: 500 });
  }
}
