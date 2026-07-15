import { checkRateLimit, clientIp } from '../../../lib/rateLimit';

export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const allowed = await checkRateLimit(`quiz:${clientIp(req)}`, 5, 3600);
    if (!allowed) {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }
    const webhookUrl = process.env.N8N_QUIZ_WEBHOOK_URL;
    if (!webhookUrl) {
      return Response.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(175_000),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('n8n quiz webhook error:', res.status, text);
      return Response.json({ error: `Upstream error: ${res.status}`, detail: text }, { status: 502 });
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('n8n response was not JSON:', text);
      return Response.json({ error: 'Invalid response from workflow', detail: text }, { status: 502 });
    }

    const matches = Array.isArray(data) ? data : (data as Record<string, unknown>).matches ?? (data as Record<string, unknown>).result ?? [];

    // Validate shape and size before persisting: array of ≤10 objects, string fields, capped length
    const isValidMatch = (m: unknown): boolean => {
      if (typeof m !== 'object' || m === null) return false;
      const obj = m as Record<string, unknown>;
      if (typeof obj.title !== 'string' || obj.title.length === 0 || obj.title.length > 300) return false;
      const stringFields = ['category', 'description', 'whyYou', 'saturation', 'saturationNote', 'uniqueAngle', 'incomeRange'];
      for (const f of stringFields) {
        if (obj[f] !== undefined && (typeof obj[f] !== 'string' || (obj[f] as string).length > 5000)) return false;
      }
      if (obj.firstSteps !== undefined) {
        if (!Array.isArray(obj.firstSteps) || obj.firstSteps.length > 20) return false;
        if (!obj.firstSteps.every((s) => typeof s === 'string' && s.length <= 2000)) return false;
      }
      return true;
    };

    const safeToStore =
      Array.isArray(matches) &&
      matches.length > 0 &&
      matches.length <= 10 &&
      matches.every(isValidMatch);

    let resultId: string | undefined;
    try {
      if (!safeToStore) throw new Error('Matches failed validation — skipping persistence');
      const { supabase } = await import('../../../lib/supabase');
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const { error } = await supabase.from('quiz_results').insert({ id, matches, site: 'i2p' });
      if (error) {
        console.error('Supabase insert error:', error);
      } else {
        resultId = id;
      }
    } catch (err) {
      console.error('Supabase persistence error:', err);
    }

    const responsePayload = Array.isArray(data)
      ? { matches, ...(resultId ? { resultId } : {}) }
      : { ...(data as object), ...(resultId ? { resultId } : {}) };

    return Response.json(responsePayload);
  } catch (err) {
    console.error('Quiz API error:', err);
    return Response.json({ error: 'Internal error', detail: String(err) }, { status: 500 });
  }
}
