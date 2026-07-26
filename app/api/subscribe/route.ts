import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from '../../../lib/rateLimit';
import { notify } from '../../../lib/notify';

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
      ? process.env.KIT_VISA_WAITLIST_FORM_ID
      : process.env.KIT_QUIZ_FORM_ID;

    if (!apiKey) console.error("KIT: KIT_API_KEY is not set");
    if (!targetFormId) console.error("KIT: form ID env var is not set for formId:", formIdParam ?? "quiz");

    if (targetFormId && apiKey) {
      const res = await fetch(`https://api.kit.com/v4/forms/${targetFormId}/subscribers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Kit-Api-Key": apiKey,
        },
        body: JSON.stringify({ email_address: email }),
      });
      if (!res.ok) console.error("KIT: subscribe failed", res.status, await res.text());
    }

    if (formIdParam === "visa") {
      notify(
        "New Visa waitlist signup",
        `Email: ${email}\nCountry: ${country?.trim() || "not provided"}`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Kit subscribe error:", err);
    return NextResponse.json({ error: "Subscribe failed" }, { status: 500 });
  }
}
