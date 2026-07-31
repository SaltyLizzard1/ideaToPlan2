import { after } from "next/server";

export function notify(subject: string, body: string): void {
  const url = process.env.N8N_ALERT_WEBHOOK_URL;
  if (!url) {
    console.error("NOTIFY: env var N8N_ALERT_WEBHOOK_URL is not set");
    return;
  }
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("NOTIFY: N8N_WEBHOOK_SECRET is not set — webhook call will be unauthenticated");
  }
  console.log("NOTIFY: attempting POST to", url);
  after(async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) headers["X-Webhook-Secret"] = secret;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ subject, body }),
        signal: AbortSignal.timeout(5_000),
      });
      console.log("NOTIFY: response status", res.status);
    } catch (err) {
      console.error("NOTIFY: fetch failed", err);
    }
  });
}
