import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(process.env.N8N_I2P_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
