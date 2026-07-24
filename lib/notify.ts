import { after } from "next/server";

export function notify(subject: string, body: string): void {
  const url = process.env.N8N_ALERT_WEBHOOK_URL;
  if (!url) return;
  after(async () => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {}
  });
}
