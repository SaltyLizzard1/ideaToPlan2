'use client';

import { useState } from 'react';
import { Loader, RotateCcw } from 'lucide-react';
import { getStripeLink, createClientReferenceId, appendPaymentParams } from '../lib/stripe';
import type { MergedMatch } from '../lib/quiz';

// One card, used by the assessment results and by a shared /results/[id] page.
// The two pages sit on different backgrounds, so the colours come from a
// variant while the markup stays single source.

export type DetailStatus = 'ready' | 'loading' | 'error';

const SATURATION_COLORS: Record<string, string> = {
  Low: 'bg-emerald-100 text-emerald-800',
  Medium: 'bg-yellow-100 text-yellow-800',
  High: 'bg-red-100 text-red-800',
};

interface CardTheme {
  card: React.CSSProperties;
  goldBar: boolean;
  eyebrow: string;
  heading: string;
  body: string;
  dim: string;
  note: string;
  incomeValue: string;
  angleBox: React.CSSProperties;
  angleLabel: string;
  angleBody: string;
  stepNumber: string;
  skeleton: string;
}

// plain reproduces the white card the assessment page has always used,
// cream the gold topped card on /results/[id]. Hexes are the Tailwind grays
// those classes resolved to, so neither page changes appearance.
const THEMES: Record<'plain' | 'cream', CardTheme> = {
  plain: {
    card: { background: '#FFFFFF', border: '1px solid #F3F4F6', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' },
    goldBar: false,
    eyebrow: '#9CA3AF',
    heading: '#111827',
    body: '#374151',
    dim: '#6B7280',
    note: '#9CA3AF',
    incomeValue: '#1F2937',
    angleBox: { background: '#FBF6E4', border: '1px solid #EBD9A0' },
    angleLabel: '#0D1117',
    angleBody: '#5C4206',
    stepNumber: '#0D1117',
    skeleton: '#F3F4F6',
  },
  cream: {
    card: {
      background: 'var(--i2p-cream)',
      border: '1px solid var(--i2p-cream-border)',
      boxShadow: '0 14px 34px rgba(30,20,5,0.09)',
    },
    goldBar: true,
    eyebrow: '#9CA3AF',
    heading: 'var(--i2p-ink)',
    body: 'var(--i2p-ink-body)',
    dim: 'var(--i2p-ink-dim)',
    note: 'var(--i2p-ink-dim)',
    incomeValue: 'var(--i2p-ink)',
    angleBox: { background: 'var(--i2p-cream-card)', border: '1px solid var(--i2p-cream-border)' },
    angleLabel: 'var(--i2p-gold-deep)',
    angleBody: 'var(--i2p-ink-body)',
    stepNumber: 'var(--i2p-gold-deep)',
    skeleton: 'var(--i2p-cream-card)',
  },
};

interface MatchCardProps {
  match: MergedMatch;
  index: number;
  status: DetailStatus;
  variant?: 'plain' | 'cream';
  resultId?: string;
  userEmail?: string;
  errorMessage?: string;
  onRetry?: () => void;
}

export default function MatchCard({
  match,
  index,
  status,
  variant = 'plain',
  resultId,
  userEmail,
  errorMessage,
  onRetry,
}: MatchCardProps) {
  const [redirecting, setRedirecting] = useState(false);
  const t = THEMES[variant];

  const handleBuildPlan = (planType: 'Starter' | 'Growth' = 'Starter') => {
    if (!resultId) {
      console.error('Result ID not available');
      return;
    }
    const clientRefId = createClientReferenceId(resultId, index);
    if (!clientRefId) {
      console.error('Failed to create client_reference_id');
      return;
    }
    const link = getStripeLink(planType);
    const linkWithParams = appendPaymentParams(link, clientRefId, userEmail);
    setRedirecting(true);
    window.location.href = linkWithParams;
  };

  // A plan is built from the stored match, so the buttons stay out until the
  // detail exists. Buying against a stub would pre-fill an empty form.
  const canBuy = status === 'ready' && !!resultId;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          {match.category && (
            <span
              className="text-xs font-semibold uppercase tracking-wide mb-1 block"
              style={{ color: t.eyebrow }}
            >
              {match.category}
            </span>
          )}
          <h3 className="text-xl font-bold" style={{ color: t.heading }}>
            {index + 1}. {match.title}
          </h3>
        </div>
        {match.saturation && (
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full mt-1 shrink-0 ${
              SATURATION_COLORS[match.saturation] ?? 'bg-gray-100 text-gray-700'
            }`}
          >
            {match.saturation} saturation
          </span>
        )}
      </div>

      {status !== 'ready' ? (
        <>
          {match.oneLiner && (
            <p className="mb-4 leading-relaxed" style={{ color: t.body }}>
              {match.oneLiner}
            </p>
          )}

          {status === 'loading' && (
            <div aria-busy="true" aria-label="Writing your full match">
              <div className="animate-pulse space-y-2" aria-hidden="true">
                <div className="h-3 rounded w-full" style={{ background: t.skeleton }} />
                <div className="h-3 rounded w-11/12" style={{ background: t.skeleton }} />
                <div className="h-3 rounded w-4/5" style={{ background: t.skeleton }} />
                <div className="h-16 rounded mt-4" style={{ background: t.skeleton }} />
                <div className="h-3 rounded w-3/5 mt-4" style={{ background: t.skeleton }} />
                <div className="h-3 rounded w-2/3" style={{ background: t.skeleton }} />
              </div>
              <p className="flex items-center gap-2 text-xs mt-4" style={{ color: t.dim }}>
                <Loader className="w-3 h-3 animate-spin" />
                Writing this one out in full...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-lg px-4 py-3" style={t.angleBox}>
              <p className="text-sm mb-3" style={{ color: t.body }}>
                {errorMessage || 'This match did not finish writing.'}
              </p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg"
                  style={{ color: '#2D1A00', border: '1.5px solid #7A5C0A', backgroundColor: '#F5E070' }}
                >
                  <RotateCcw className="w-3 h-3" />
                  Try again
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {match.description && (
            <p className="mb-3 leading-relaxed" style={{ color: t.body }}>
              {match.description}
            </p>
          )}

          {/* Quick buy button, compact, right under the description */}
          {canBuy && (
            <button
              onClick={() => handleBuildPlan('Starter')}
              disabled={redirecting}
              className="w-full py-2 mb-4 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ color: '#2D1A00', border: '1.5px solid #7A5C0A', backgroundColor: '#F5E070' }}
            >
              {redirecting ? (
                <>
                  <Loader className="w-3 h-3 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>Build my plan for this idea · $25</>
              )}
            </button>
          )}

          {match.whyYou && (
            <p
              className="text-sm italic border-l-2 pl-4 mb-4"
              style={{ borderColor: 'var(--i2p-gold)', color: 'var(--i2p-ink)' }}
            >
              {match.whyYou}
            </p>
          )}

          {match.incomeRange && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: t.dim }}>
                Income range:
              </span>
              <span className="text-sm font-bold" style={{ color: t.incomeValue }}>
                {match.incomeRange}
              </span>
            </div>
          )}

          {match.uniqueAngle && (
            <div className="rounded-lg px-4 py-3 mb-4" style={t.angleBox}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: t.angleLabel }}>
                Your unique angle
              </p>
              <p className="text-sm" style={{ color: t.angleBody }}>
                {match.uniqueAngle}
              </p>
            </div>
          )}

          {Array.isArray(match.firstSteps) && match.firstSteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: t.dim }}>
                First steps
              </p>
              <ol className="space-y-1">
                {match.firstSteps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-sm" style={{ color: t.body }}>
                    <span className="font-bold shrink-0" style={{ color: t.stepNumber }}>
                      {i + 1}.
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {match.saturationNote && (
            <p className="text-xs mt-3" style={{ color: t.note }}>
              {match.saturationNote}
            </p>
          )}

          {canBuy && (
            <div className="mt-6">
              <button
                onClick={() => handleBuildPlan('Growth')}
                disabled={redirecting}
                className="w-full py-2 text-sm font-semibold rounded-lg border transition-colors disabled:opacity-60"
                style={{ borderColor: '#C9A030', color: '#5C4206', backgroundColor: '#FBF6E4' }}
              >
                Growth tier · $50
              </button>
            </div>
          )}
        </>
      )}
    </>
  );

  if (t.goldBar) {
    return (
      <div className="rounded-2xl overflow-hidden" style={t.card}>
        <div className="gold-gradient" style={{ height: '4px' }} />
        <div className="p-6">{body}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6" style={t.card}>
      {body}
    </div>
  );
}
