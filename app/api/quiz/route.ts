export const maxDuration = 180;

export async function POST(req: Request) {
  const body = await req.json();
  const res = await fetch(process.env.N8N_QUIZ_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(175_000),
  });
  const data = await res.json();
  return Response.json(data);
}
