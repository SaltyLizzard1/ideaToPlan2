'use client';

import { useState } from 'react';
import ShareButtons from './ShareButtons';

interface Match {
  title: string;
  category: string;
  description: string;
  whyYou: string;
  saturation: 'Low' | 'Medium' | 'High';
  saturationNote: string;
  uniqueAngle: string;
  incomeRange: string;
  firstSteps: string[];
}

const SATURATION_COLORS: Record<string, string> = {
  Low: 'bg-emerald-100 text-emerald-800',
  Medium: 'bg-yellow-100 text-yellow-800',
  High: 'bg-red-100 text-red-800',
};

const GOLD_BUTTON_STYLE = {
  color: '#2D1A00',
  border: '1.5px solid #7A5C0A',
} as const;

function MatchCard({ match, index }: { match: Match; index: number }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--i2p-cream)',
        border: '1px solid var(--i2p-cream-border)',
        boxShadow: '0 14px 34px rgba(30,20,5,0.09)',
      }}
    >
      <div className="gold-gradient" style={{ height: '4px' }} />

      <div className="p-6">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1 block">
              {match.category}
            </span>
            <h3 className="text-xl font-bold" style={{ color: 'var(--i2p-ink)' }}>
              {index + 1}. {match.title}
            </h3>
          </div>
          {match.saturation && (
            <span className={`text-xs font-semibold px-3 py-1 rounded-full mt-1 shrink-0 ${SATURATION_COLORS[match.saturation] ?? 'bg-gray-100 text-gray-700'}`}>
              {match.saturation} saturation
            </span>
          )}
        </div>

        <p className="mb-3 leading-relaxed" style={{ color: 'var(--i2p-ink-body)' }}>{match.description}</p>

        {match.whyYou && (
          <p className="text-sm italic border-l-2 pl-4 mb-4" style={{ borderColor: 'var(--i2p-gold)', color: 'var(--i2p-ink)' }}>
            {match.whyYou}
          </p>
        )}

        {match.incomeRange && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--i2p-ink-dim)' }}>Income range:</span>
            <span className="text-sm font-bold" style={{ color: 'var(--i2p-ink)' }}>{match.incomeRange}</span>
          </div>
        )}

        {match.uniqueAngle && (
          <div className="rounded-lg px-4 py-3 mb-4" style={{ background: 'var(--i2p-cream-card)', border: '1px solid var(--i2p-cream-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--i2p-gold-deep)' }}>Your unique angle</p>
            <p className="text-sm" style={{ color: 'var(--i2p-ink-body)' }}>{match.uniqueAngle}</p>
          </div>
        )}

        {Array.isArray(match.firstSteps) && match.firstSteps.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--i2p-ink-dim)' }}>First steps</p>
            <ol className="space-y-1">
              {match.firstSteps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm" style={{ color: 'var(--i2p-ink-body)' }}>
                  <span className="font-bold shrink-0" style={{ color: 'var(--i2p-gold-deep)' }}>{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {match.saturationNote && (
          <p className="text-xs mt-3" style={{ color: 'var(--i2p-ink-dim)' }}>{match.saturationNote}</p>
        )}
      </div>
    </div>
  );
}

export default function ResultsGate({ matches, canonicalUrl }: { matches: Match[]; canonicalUrl: string }) {
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailLoading(true);
    setEmailError('');

    try {
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setUnlocked(true);
    } catch (err) {
      console.error('Email error:', err);
      setEmailError('Something went wrong. Try again.');
    } finally {
      setEmailLoading(false);
    }
  }

  const top3 = matches.slice(0, 3).map((m, i) => `${i + 1}. ${m.title}`).join('\n');
  const more = matches.length > 3 ? `…and ${matches.length - 3} more.` : '';
  const shareText = `${'✨'} I took the IdeaToPlan business assessment. My top matches:\n${top3}\n${more}\n${'\u{1F4AB}'} Find yours:`;

  return (
    <>
      <div className="mb-4">
        <MatchCard match={matches[0]} index={0} />
      </div>

      <div className="relative">
        <div className={unlocked ? '' : 'blur-sm select-none pointer-events-none'}>
          <div className="space-y-4">
            {matches.slice(1).map((match, i) => (
              <MatchCard key={i} match={match} index={i + 1} />
            ))}
          </div>
        </div>

        {!unlocked && (
          <div className="absolute inset-0 flex items-start justify-center pt-8">
            <div className="rounded-2xl shadow-xl p-8 mx-4 w-full max-w-md text-center" style={{ background: 'var(--i2p-cream)', border: '1px solid var(--i2p-cream-border)' }}>
              <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--i2p-ink)' }}>
                Someone shared their matches with you
              </h3>
              <p className="text-sm mb-5" style={{ color: 'var(--i2p-ink-dim)' }}>
                Their #1 match is above. Curious what you&apos;re built to do?
              </p>
              <a
                href="/assessment"
                className="gold-gradient block w-full py-3 font-semibold rounded-lg transition-all hover:brightness-105 mb-4"
                style={GOLD_BUTTON_STYLE}
              >
                Take the Free Assessment →
              </a>
              <p className="text-xs mb-3" style={{ color: 'var(--i2p-ink-dim)' }}>
                Or enter your email to see the rest of their matches:
              </p>
              <form onSubmit={submitEmail} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A030]"
                />
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="gold-gradient w-full py-3 font-semibold rounded-lg disabled:opacity-60"
                  style={GOLD_BUTTON_STYLE}
                >
                  {emailLoading ? 'Revealing...' : 'Reveal my matches'}
                </button>
              </form>
              {emailError && (
                <p className="mt-3 text-sm text-red-600">{emailError}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {unlocked && (
        <div className="mt-8 flex justify-center">
          <ShareButtons url={canonicalUrl} title="My Business Matches" text={shareText} />
        </div>
      )}

      <div className="mt-10 rounded-2xl p-8 text-center" style={{ background: 'var(--i2p-cream-card)', border: '1px solid var(--i2p-cream-border)' }}>
        <p className="text-lg font-bold mb-2" style={{ color: 'var(--i2p-ink)' }}>
          Want your own matches?
        </p>
        <p className="text-sm mb-5" style={{ color: 'var(--i2p-ink-body)' }}>
          Answer a few simple questions and discover the paths that best match your skills, values, and goals.
        </p>
        <a
          href="/assessment"
          className="gold-gradient inline-block px-8 py-3 font-semibold rounded-lg transition-all hover:brightness-105"
          style={GOLD_BUTTON_STYLE}
        >
          Start My Assessment →
        </a>
      </div>
    </>
  );
}
