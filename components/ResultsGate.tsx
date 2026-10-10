'use client';

import { useState } from 'react';
import ShareButtons from './ShareButtons';
import MatchCard from './MatchCard';
import { useMatchDetails } from './useMatchDetails';
import type { MergedMatch } from '../lib/quiz';

const GOLD_BUTTON_STYLE = {
  color: '#2D1A00',
  border: '1.5px solid #7A5C0A',
} as const;

interface ResultsGateProps {
  matches: MergedMatch[];
  canonicalUrl: string;
  resultId: string;
}

export default function ResultsGate({ matches: initial, canonicalUrl, resultId }: ResultsGateProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  // A shared link can be opened before every detail has been written, so this
  // page finishes the job rather than showing empty cards.
  const { matches, statusFor, errors, retry } = useMatchDetails(resultId, initial);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailLoading(true);
    setEmailError('');

    try {
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), resultId }),
      });
      setEmail(email.trim());
      setUnlocked(true);
    } catch (err) {
      console.error('Email error:', err);
      setEmailError('Something went wrong. Try again.');
    } finally {
      setEmailLoading(false);
    }
  }

  if (!matches.length) return null;

  const top3 = matches.slice(0, 3).map((m, i) => `${i + 1}. ${m.title}`).join('\n');
  const more = matches.length > 3 ? `…and ${matches.length - 3} more.` : '';
  const shareText = `${'✨'} I took the IdeaToPlan business assessment. My top matches:\n${top3}\n${more}\n${'\u{1F4AB}'} Find yours:`;

  return (
    <>
      <div className="mb-s4">
        <MatchCard
          match={matches[0]}
          index={0}
          status={statusFor(0)}
          variant="cream"
          resultId={resultId}
          userEmail={email}
          errorMessage={errors[0]?.message}
          onRetry={errors[0]?.canRetry ? () => retry(0) : undefined}
        />
      </div>

      {unlocked && (
        <div className="mb-s5 flex justify-center">
          <ShareButtons url={canonicalUrl} title="My Business Matches" text={shareText} />
        </div>
      )}

      <div className="relative">
        <div className={unlocked ? '' : 'blur-sm select-none pointer-events-none'}>
          <div className="space-y-s4">
            {matches.slice(1).map((match, i) => {
              const index = i + 1;
              return (
                <MatchCard
                  key={index}
                  match={match}
                  index={index}
                  status={statusFor(index)}
                  variant="cream"
                  resultId={resultId}
                  userEmail={email}
                  errorMessage={errors[index]?.message}
                  onRetry={errors[index]?.canRetry ? () => retry(index) : undefined}
                />
              );
            })}
          </div>
        </div>

        {!unlocked && (
          <div className="absolute inset-0 flex items-start justify-center pt-s6">
            <div className="rounded-2xl shadow-xl card-pad w-full max-w-copy text-center" style={{ background: 'var(--i2p-cream)', border: '1px solid var(--i2p-cream-border)' }}>
              <h3 className="text-xl font-bold mb-s2" style={{ color: 'var(--i2p-ink)' }}>
                Someone shared their matches with you
              </h3>
              <p className="text-sm mb-s5" style={{ color: 'var(--i2p-ink-dim)' }}>
                Their #1 match is above. Curious what you&apos;re built to do?
              </p>
              <a
                href="/assessment"
                className="gold-gradient block w-full py-s3 font-semibold rounded-lg transition-all hover:brightness-105 mb-s4"
                style={GOLD_BUTTON_STYLE}
              >
                Take the Free Assessment →
              </a>
              <p className="text-xs mb-s3" style={{ color: 'var(--i2p-ink-dim)' }}>
                Or enter your email to see the rest of their matches:
              </p>
              <form onSubmit={submitEmail} className="space-y-s3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-s4 py-s3 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A030]"
                />
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="gold-gradient w-full py-s3 font-semibold rounded-lg disabled:opacity-60"
                  style={GOLD_BUTTON_STYLE}
                >
                  {emailLoading ? 'Revealing...' : 'Reveal my matches'}
                </button>
              </form>
              {emailError && (
                <p className="mt-s3 text-sm text-red-600">{emailError}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {unlocked && (
        <div className="mt-s6 flex justify-center">
          <ShareButtons url={canonicalUrl} title="My Business Matches" text={shareText} />
        </div>
      )}

      <div className="mt-s6 rounded-2xl card-pad text-center" style={{ background: 'var(--i2p-cream-card)', border: '1px solid var(--i2p-cream-border)' }}>
        <p className="text-lg font-bold mb-s2" style={{ color: 'var(--i2p-ink)' }}>
          Want your own matches?
        </p>
        <p className="text-sm mb-s5" style={{ color: 'var(--i2p-ink-body)' }}>
          Answer a few simple questions and discover the paths that best match your skills, values, and goals.
        </p>
        <a
          href="/assessment"
          className="gold-gradient inline-block px-s6 py-s3 font-semibold rounded-lg transition-all hover:brightness-105"
          style={GOLD_BUTTON_STYLE}
        >
          Start My Assessment →
        </a>
      </div>
    </>
  );
}
