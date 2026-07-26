import { after } from "next/server";

export function notify(subject: string, body: string): void {
  const url = process.env.N8N_ALERT_WEBHOOK_URL;
  if (!url) {
    console.error("NOTIFY: env var N8N_ALERT_WEBHOOK_URL is not set");
    return;
  }
  console.log("NOTIFY: attempting POST to", url);
  after(async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
        signal: AbortSignal.timeout(5_000),
      });
      console.log("NOTIFY: response status", res.status);
    } catch (err) {
      console.error("NOTIFY: fetch failed", err);
    }
  });
}
