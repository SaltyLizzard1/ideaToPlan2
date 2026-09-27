import { checkRateLimit, clientIp } from '../../../lib/rateLimit';
import { notify } from '../../../lib/notify';
import { MATCH_COUNT, readAnswers, readRankings } from '../../../lib/quiz';

// Stage 1 of two. Ranks MATCH_COUNT ideas as titles and one liners only, and
// stores the answers with them so /api/quiz-detail can fill each one in.
// The contract both ends hold to is in N8N_WORKFLOWS_STAGE2.md.

export const maxDuration = 20;

const SITE = 'i2p';
const WEBHOOK_TIMEOUT_MS = 15_000;

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Body is not valid JSON' }, { status: 400 });
    }

    const allowed = await checkRateLimit(`quiz:${clientIp(req)}`, 5, 3600);
    if (!allowed) {
      return Response.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Allowlist the six fields. Only these are sent onward and only these are
    // stored, never the raw request body.
    const answers = readAnswers(body);
    if (!answers.ok) {
      console.error('[quiz] rejected request:', answers.reason);
      return Response.json({ error: 'Invalid assessment answers', reason: answers.reason }, { status: 400 });
    }

    const webhookUrl = process.env.N8N_QUIZ_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error('[quiz] N8N_QUIZ_WEBHOOK_URL is not set');
      return Response.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('[quiz] N8N_WEBHOOK_SECRET is not set, ranking webhook call will be unauthenticated');
    }
    const webhookHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) webhookHeaders['X-Webhook-Secret'] = secret;

    let res: Response;
    try {
      res = await fetch(webhookUrl, {
        method: 'POST',
        headers: webhookHeaders,
        body: JSON.stringify(answers.value),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[quiz] ranking webhook unreachable:', reason);
      return Response.json({ error: 'Ranking workflow did not respond', reason }, { status: 502 });
    }

    const text = await res.text();
    if (!res.ok) {
      console.error('[quiz] ranking webhook returned', res.status, text.slice(0, 1000));
      return Response.json({ error: `Ranking workflow error ${res.status}` }, { status: 502 });
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[quiz] ranking response was not JSON:', text.slice(0, 1000));
      return Response.json({ error: 'Ranking workflow did not return JSON' }, { status: 502 });
    }

    const rankings = readRankings(data);
    if (!rankings.ok) {
      console.error('[quiz] ranking contract violation:', rankings.reason, '| body:', text.slice(0, 1000));
      notify('quiz-ranking contract violation', `${rankings.reason}\n\n${text.slice(0, 1000)}`);
      return Response.json(
        { error: `Ranking workflow must return exactly ${MATCH_COUNT} rankings`, reason: rankings.reason },
        { status: 502 }
      );
    }

    // The client cannot fetch a single detail without a resultId, so a failed
    // insert is fatal here rather than a half working results page.
    const { supabase } = await import('../../../lib/supabase');
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const { error } = await supabase.from('quiz_results').insert({
      id,
      site: SITE,
      matches: rankings.value,
      answers: answers.value,
    });

    if (error) {
      console.error('[quiz] insert failed:', error.message, error.details ?? '');
      notify('quiz_results insert failed', `${error.message}\n${error.details ?? ''}`);
      return Response.json({ error: 'Could not save your results', reason: error.message }, { status: 500 });
    }

    return Response.json({ resultId: id, rankings: rankings.value });
  } catch (err) {
    console.error('[quiz] unhandled error:', err);
    return Response.json({ error: 'Internal error', reason: String(err) }, { status: 500 });
  }
}
