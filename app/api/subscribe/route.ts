import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from '../../../lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    const allowed = await checkRateLimit(`subscribe:${clientIp(req)}`, 10, 3600);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const formId = process.env.KIT_QUIZ_FORM_ID;
    const apiKey = process.env.KIT_API_KEY;

    if (formId && apiKey) {
      await fetch(`https://api.kit.com/v4/forms/${formId}/subscribers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Kit-Api-Key": apiKey,
        },
        body: JSON.stringify({ email_address: email }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Kit subscribe error:", err);
    return NextResponse.json({ error: "Subscribe failed" }, { status: 500 });
  }
}
