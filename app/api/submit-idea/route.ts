import { NextRequest, NextResponse } from "next/server";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyzBzryiCwJ8gDkVY4AumOEtQExzVRQWMWeHSnyWIoBj_3PD8cyWBga7MXZ7rSHnY2D/exec";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const params = new URLSearchParams();
    Object.entries(body as Record<string, string>).forEach(([key, value]) => {
      params.append(key, value ?? "");
    });

    await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Apps Script error:", err);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
