import { checkRateLimit } from '../../../lib/rateLimit';
import { notify } from '../../../lib/notify';
import { MATCH_COUNT, isDetailed, mergeMatches, readDetail } from '../../../lib/quiz';

// Stage 2 of two. Generates and stores the full detail for one match.
// The contract both ends hold to is in N8N_WORKFLOWS_STAGE2.md.

export const maxDuration = 60;

const SITE = 'i2p';
const WEBHOOK_TIMEOUT_MS = 55_000;

// Attempts are capped per match, not per result and not per IP: a match can be
// attempted DETAIL_ATTEMPT_LIMIT times an hour, which leaves room for a retry
// after a failure without letting anyone hammer the workflow. The ceiling on
// stored details is inherent, there are only MATCH_COUNT of them. A detail
// already stored is served from the row and spends no attempt.
const DETAIL_ATTEMPT_LIMIT = 3;
const DETAIL_ATTEMPT_WINDOW_SECONDS = 3600;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const resultId = searchParams.get('resultId');
    const index = searchParams.get('index');

    if (!resultId || index === null) {
      return Response.json({ error: 'Missing resultId or index' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9]{1,32}$/.test(resultId)) {
      return Response.json({ error: 'Invalid resultId' }, { status: 400 });
    }

    const indexNum = Number(index);
    if (!Number.isInteger(indexNum) || indexNum < 0 || indexNum > MATCH_COUNT - 1) {
      return Response.json({ error: 'Invalid index' }, { status: 400 });
    }

    const { supabase } = await import('../../../lib/supabase');
    const { data, error } = await supabase
      .from('quiz_results')
      .select('matches, answers, details')
      .eq('id', resultId)
      .eq('site', SITE)
      .single();

    if (error || !data) {
      console.error(`[quiz-detail] result not found: resultId=${resultId} error=${error?.message ?? 'no row'}`);
      return Response.json({ error: 'Result not found' }, { status: 404 });
    }

    const merged = mergeMatches(data.matches, data.details);
    if (indexNum >= merged.length) {
      return Response.json({ error: 'Match not found' }, { status: 404 });
    }

    // Already detailed, either stored by an earlier call or because this is a
    // row from before the two stage split. Costs nothing and spends no budget.
    if (isDetailed(merged[indexNum])) {
      return Response.json({ match: merged[indexNum], cached: true });
    }

    const ranking = merged[indexNum];
    if (!ranking.title || !ranking.category || !ranking.saturation) {
      console.error(
        `[quiz-detail] stored ranking is incomplete: resultId=${resultId} index=${indexNum} ` +
          `title=${JSON.stringify(ranking.title)} category=${JSON.stringify(ranking.category)} ` +
          `saturation=${JSON.stringify(ranking.saturation)}`
      );
      return Response.json({ error: 'Stored ranking is incomplete' }, { status: 500 });
    }

    // Rows written before the two stage split have no answers, but they are
    // already detailed and returned above, so reaching here without answers
    // means the row was written wrong.
    if (!data.answers) {
      console.error(`[quiz-detail] row has no answers: resultId=${resultId}`);
      notify('quiz_results row has no answers', `resultId=${resultId} index=${indexNum}`);
      return Response.json({ error: 'Result is missing its assessment answers' }, { status: 500 });
    }

    const withinAttempts = await checkRateLimit(
      `quiz-detail:${resultId}:${indexNum}`,
      DETAIL_ATTEMPT_LIMIT,
      DETAIL_ATTEMPT_WINDOW_SECONDS
    );
    if (!withinAttempts) {
      console.warn(`[quiz-detail] attempt limit reached: resultId=${resultId} index=${indexNum}`);
      return Response.json(
        {
          error: `This match has been attempted ${DETAIL_ATTEMPT_LIMIT} times in the last hour`,
          retryable: false,
        },
        { status: 429 }
      );
    }

    const webhookUrl = process.env.N8N_QUIZ_DETAIL_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error('[quiz-detail] N8N_QUIZ_DETAIL_WEBHOOK_URL is not set');
      return Response.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('[quiz-detail] N8N_WEBHOOK_SECRET is not set, detail webhook call will be unauthenticated');
    }
    const webhookHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) webhookHeaders['X-Webhook-Secret'] = secret;

    let res: Response;
    try {
      res = await fetch(webhookUrl, {
        method: 'POST',
        headers: webhookHeaders,
        body: JSON.stringify({
          resultId,
          matchIndex: indexNum,
          title: ranking.title,
          // The ranking decided the category and the saturation, and the
          // saturation is part of how it ordered the list, so the detail is
          // told both and has to return them unchanged. oneLiner goes with
          // them as the promise the write-up has to keep.
          category: ranking.category,
          saturation: ranking.saturation,
          oneLiner: ranking.oneLiner,
          // Every title, so the detail can be written to avoid overlapping
          // the other six.
          allTitles: merged.map((m) => m.title),
          answers: data.answers,
        }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[quiz-detail] webhook unreachable: resultId=${resultId} index=${indexNum} ${reason}`);
      return Response.json({ error: 'Detail workflow did not respond', reason, retryable: true }, { status: 502 });
    }

    const text = await res.text();
    if (!res.ok) {
      console.error(`[quiz-detail] webhook returned ${res.status} for index=${indexNum}:`, text.slice(0, 1000));
      return Response.json({ error: `Detail workflow error ${res.status}`, retryable: true }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error(`[quiz-detail] response was not JSON for index=${indexNum}:`, text.slice(0, 1000));
      return Response.json({ error: 'Detail workflow did not return JSON', retryable: true }, { status: 502 });
    }

    // A detail that fails validation is logged with the reason and not saved.
    // The card shows a retry rather than a set of empty fields.
    const detail = readDetail(parsed, {
      title: ranking.title,
      category: ranking.category,
      saturation: ranking.saturation,
    });
    if (!detail.ok) {
      console.error(
        `[quiz-detail] contract violation: resultId=${resultId} index=${indexNum} ${detail.reason} | body:`,
        text.slice(0, 1000)
      );
      notify(
        'quiz-detail contract violation',
        `resultId=${resultId} index=${indexNum}\n${detail.reason}\n\n${text.slice(0, 1000)}`
      );
      return Response.json(
        { error: 'Detail workflow returned an incomplete match', reason: detail.reason, retryable: true },
        { status: 502 }
      );
    }

    const { data: updated, error: writeError } = await supabase.rpc('set_quiz_detail', {
      p_id: resultId,
      p_site: SITE,
      p_index: indexNum,
      p_detail: detail.value,
    });

    if (writeError) {
      console.error(`[quiz-detail] set_quiz_detail failed: resultId=${resultId} index=${indexNum}`, writeError.message);
      notify('set_quiz_detail failed', `resultId=${resultId} index=${indexNum}\n${writeError.message}`);
      return Response.json({ error: 'Could not save the detail', reason: writeError.message }, { status: 500 });
    }
    if (updated !== 1) {
      console.error(`[quiz-detail] set_quiz_detail updated ${updated} rows: resultId=${resultId} index=${indexNum}`);
      notify('set_quiz_detail updated no rows', `resultId=${resultId} index=${indexNum} rows=${updated}`);
      return Response.json({ error: 'Could not save the detail', reason: `updated ${updated} rows` }, { status: 500 });
    }

    return Response.json({ match: { ...ranking, ...detail.value }, cached: false });
  } catch (err) {
    console.error('[quiz-detail] unhandled error:', err);
    return Response.json({ error: 'Internal error', reason: String(err), retryable: true }, { status: 500 });
  }
}
