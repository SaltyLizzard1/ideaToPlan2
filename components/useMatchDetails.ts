'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isDetailed, type MergedMatch } from '../lib/quiz';
import type { DetailStatus } from './MatchCard';

export interface DetailError {
  message: string;
  canRetry: boolean;
}

/**
 * Fills in the matches that arrived as ranking stubs.
 *
 * Every stub is dispatched in one tick, index 0 first so it is at the head of
 * the queue, and each card re-renders on its own as its detail lands. A match
 * that is already detailed is never fetched, which is what keeps a row from
 * before the two stage split, and a second visit to a shared link, free.
 */
export function useMatchDetails(resultId: string | undefined, initial: MergedMatch[]) {
  const [matches, setMatches] = useState<MergedMatch[]>(initial);
  const [status, setStatus] = useState<Record<number, DetailStatus>>({});
  const [errors, setErrors] = useState<Record<number, DetailError>>({});

  // Keyed by result and index so a mount, a re-render or React's development
  // double effect cannot spend the same generation twice.
  const dispatched = useRef<Set<string>>(new Set());

  // The assessment page has no matches until the ranking call returns, so the
  // list can arrive after this hook has mounted. Adopting it during the render
  // rather than in an effect means the first render that shows the cards
  // already has them, so nothing downstream has to handle an empty list.
  const adopted = useRef(initial);
  if (adopted.current !== initial) {
    adopted.current = initial;
    setMatches(initial);
  }

  const fetchDetail = useCallback(
    async (index: number) => {
      if (!resultId) return;

      setStatus((prev) => ({ ...prev, [index]: 'loading' }));
      setErrors((prev) => {
        if (!(index in prev)) return prev;
        const next = { ...prev };
        delete next[index];
        return next;
      });

      const fail = (message: string, canRetry: boolean) => {
        setStatus((prev) => ({ ...prev, [index]: 'error' }));
        setErrors((prev) => ({ ...prev, [index]: { message, canRetry } }));
      };

      try {
        const res = await fetch(
          `/api/quiz-detail?resultId=${encodeURIComponent(resultId)}&index=${index}`
        );
        const payload = await res.json().catch(() => null);

        if (!res.ok || !payload || !payload.match) {
          const reason = payload?.reason ? ` (${payload.reason})` : '';
          console.error(
            `[match ${index}] detail failed: ${payload?.error ?? `status ${res.status}`}${reason}`
          );
          if (res.status === 429) {
            fail('This match has been tried several times in the last hour. Try again later.', false);
          } else if (res.status === 404) {
            fail('This match could not be found.', false);
          } else {
            fail('Something went wrong writing this match.', payload?.retryable !== false);
          }
          return;
        }

        setMatches((prev) =>
          prev.map((m, i) => (i === index ? { ...m, ...payload.match, index: i } : m))
        );
        setStatus((prev) => ({ ...prev, [index]: 'ready' }));
      } catch (err) {
        console.error(`[match ${index}] detail request threw:`, err);
        fail('Something went wrong writing this match.', true);
      }
    },
    [resultId]
  );

  useEffect(() => {
    if (!resultId) return;
    matches.forEach((match, index) => {
      const key = `${resultId}:${index}`;
      if (dispatched.current.has(key)) return;
      if (isDetailed(match)) return;
      dispatched.current.add(key);
      void fetchDetail(index);
    });
  }, [resultId, matches, fetchDetail]);

  const statusFor = useCallback(
    (index: number): DetailStatus => {
      if (isDetailed(matches[index])) return 'ready';
      return status[index] ?? 'loading';
    },
    [matches, status]
  );

  const retry = useCallback(
    (index: number) => {
      if (!resultId) return;
      dispatched.current.add(`${resultId}:${index}`);
      void fetchDetail(index);
    },
    [fetchDetail, resultId]
  );

  return { matches, statusFor, errors, retry };
}
