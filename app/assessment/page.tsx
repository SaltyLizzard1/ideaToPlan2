'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import ShareButtons from '../../components/ShareButtons';
import PlanLoader from '../../components/PlanLoader';
import Footer from '../../components/Footer';
import MatchCard from '../../components/MatchCard';
import { useMatchDetails } from '../../components/useMatchDetails';
import { MATCH_COUNT, type MergedMatch } from '../../lib/quiz';

// ── Types ──────────────────────────────────────────────────────────────────

interface FormData {
  hardSkills: string[];
  softSkills: string[];
  workStyle: string[];
  values: string[];
  hoursPerWeek: string;
  incomeTarget: string;
}

type Stage = 'form' | 'loading' | 'results' | 'unlocked';

// Carries the line the visitor should read. The Error message itself stays
// technical and goes to the console.
class AssessmentError extends Error {
  userMessage: string;
  constructor(userMessage: string, detail: string) {
    super(detail);
    this.name = 'AssessmentError';
    this.userMessage = userMessage;
  }
}

const GENERIC_ASSESSMENT_ERROR = 'Something went wrong fetching your results. Please try again.';

// ── Constants ──────────────────────────────────────────────────────────────

const HARD_SKILLS = [
  'Writing & copywriting',
  'Graphic design',
  'Web / UI design',
  'Video editing & production',
  'Photography',
  'Audio & podcast production',
  'Animation & motion graphics',
  'Software development',
  'AI & automation tools',
  'Technical support & IT',
  'Data analysis & spreadsheets',
  'SEO & content strategy',
  'Email marketing',
  'Paid advertising (Google / Meta)',
  'Social media management',
  'Community management',
  'Sales & business development',
  'Customer success',
  'Teaching & course creation',
  'Public speaking & presenting',
  'Project management',
  'Virtual assistance & admin',
  'Bookkeeping & accounting',
  'Legal & compliance',
  'HR & recruiting',
  'Research & fact-checking',
  'Translation & localization',
  'Other',
];

const SOFT_SKILLS = [
  'Communicating clearly',
  'Organizing & systemizing',
  'Problem-solving',
  'Empathy & listening',
  'Persuading & influencing',
  'Attention to detail',
  'Leading & mentoring',
  'Researching & synthesizing',
  'Adapting to change',
  'Creative thinking',
  'Teaching & explaining',
  'Negotiating',
  'Strategic thinking',
  'Networking & relationship-building',
];

const VALUES = [
  'Freedom & location independence',
  'Helping people directly',
  'Creative expression',
  'Building something of my own',
  'Financial stability',
  'Learning & growing constantly',
  'Making a big impact',
  'Autonomy (no boss)',
  'Recognition & status',
  'Community & belonging',
];

const WORK_STYLE_PAIRS = [
  { a: 'People-facing', b: 'Behind the scenes' },
  { a: 'Structured schedule', b: 'Flexible hours' },
  { a: 'Solo deep work', b: 'Collaborative & team-based' },
  { a: 'Creating new things', b: 'Improving existing things' },
];

const HOURS_OPTIONS = ['<5', '5–10', '10–20', '20–30', '30+'];
const INCOME_OPTIONS = ['$500–$1,000', '$1,000–$2,500', '$2,500–$5,000', '$5,000–$10,000', '$10,000+'];

const LOADING_MESSAGES = [
  'Reading your skills and strengths...',
  'Mapping them to online work that fits your life...',
  'Ranking your best fits...',
];

// Stage 1 only. The ranking call returns titles in a few seconds, then each
// match writes itself out on the results page.
const LOADING_DURATION_MS = 4000;

const GOLD_GRADIENT =
  'linear-gradient(135deg, #8B6914 0%, #E8C84A 35%, #F5E070 55%, #C9A030 75%, #8B6914 100%)';

const GOLD_BUTTON_STYLE = {
  color: '#2D1A00',
  border: '1.5px solid #7A5C0A',
} as const;

// ── Pill component ─────────────────────────────────────────────────────────

function Pill({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !selected}
      className={[
        'px-s4 py-s2 rounded-full border text-sm font-medium transition-all',
        selected
          ? 'border-[#7A5C0A] shadow-sm bg-[#E8C84A] text-[#2D1A00]'
          : disabled
          ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
          : 'bg-white border-gray-300 text-gray-700 hover:border-[#C9A030] hover:text-[#0D1117] pill-hover-lift',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ── Either-or card pair ────────────────────────────────────────────────────

function EitherOrPair({
  optionA,
  optionB,
  value,
  onChange,
}: {
  optionA: string;
  optionB: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const card = (label: string) => {
    const active = value === label;
    return (
      <button
        type="button"
        onClick={() => onChange(label)}
        className={[
          'flex-1 py-5 px-s4 rounded-xl border-2 text-sm font-semibold transition-all text-center card-hover-lift',
          active
            ? 'border-[#C9A030] bg-[#FBF6E4] text-[#5C4206] shadow'
            : 'border-gray-200 bg-white text-gray-600 hover:border-[#E8C84A]',
        ].join(' ')}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex gap-s3 items-center">
      {card(optionA)}
      <span className="text-gray-400 text-xs font-bold shrink-0">OR</span>
      {card(optionB)}
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-s6">
      <div
        className="h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${(step / total) * 100}%`, backgroundImage: GOLD_GRADIENT }}
      />
    </div>
  );
}

// ── Main Assessment component ──────────────────────────────────────────────

export default function AssessmentPage() {
  const [stage, setStage] = useState<Stage>('form');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({
    hardSkills: [],
    softSkills: [],
    workStyle: WORK_STYLE_PAIRS.map(() => ''),
    values: [],
    hoursPerWeek: '',
    incomeTarget: '',
  });

  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [rankings, setRankings] = useState<MergedMatch[]>([]);
  const [resultId, setResultId] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');

  // Stage 1 returns titles. Every match then writes itself out in the
  // background and its card fills in as it lands.
  const { matches, statusFor, errors, retry } = useMatchDetails(resultId, rankings);

  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stage !== 'loading') {
      setLoadingMsgIndex(0);
      setProgress(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(95, (elapsed / LOADING_DURATION_MS) * 95);
      setProgress(pct);
      const msgStep = LOADING_MESSAGES.length - 1;
      const idx = Math.min(
        msgStep,
        Math.floor((elapsed / LOADING_DURATION_MS) * msgStep)
      );
      setLoadingMsgIndex(idx);
    }, 200);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [stage, step]);

  function togglePill(
    field: 'hardSkills' | 'softSkills' | 'values',
    value: string,
    max?: number
  ) {
    setForm((prev) => {
      const current = prev[field];
      if (current.includes(value)) {
        return { ...prev, [field]: current.filter((v) => v !== value) };
      }
      if (max && current.length >= max) return prev;
      return { ...prev, [field]: [...current, value] };
    });
  }

  function canAdvance(): boolean {
    if (step === 1) return form.hardSkills.length > 0;
    if (step === 2) return form.softSkills.length > 0;
    if (step === 3) return form.workStyle.every((v) => v !== '');
    if (step === 4) return form.values.length > 0;
    if (step === 5) return form.hoursPerWeek !== '' && form.incomeTarget !== '';
    return false;
  }

  async function submitAssessment() {
    setStage('loading');
    setError('');

    try {
      // Route path kept as /api/quiz — this is an external-facing API contract used by the backend pipeline
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardSkills: form.hardSkills,
          softSkills: form.softSkills,
          workStyle: WORK_STYLE_PAIRS.map((pair, i) => form.workStyle[i] || pair.a),
          values: form.values,
          hoursPerWeek: form.hoursPerWeek,
          incomeTarget: form.incomeTarget,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const reason = payload?.reason ? `: ${payload.reason}` : '';
        throw new AssessmentError(
          payload?.error ? `${payload.error}. Please try again.` : GENERIC_ASSESSMENT_ERROR,
          `/api/quiz returned ${res.status}${payload?.error ? ` ${payload.error}` : ''}${reason}`
        );
      }

      const data = await res.json();
      const list: unknown = data?.rankings;

      if (!Array.isArray(list) || list.length !== MATCH_COUNT) {
        throw new AssessmentError(
          'Your matches did not come back complete. Please try again.',
          `Expected ${MATCH_COUNT} rankings, got ${Array.isArray(list) ? list.length : typeof list}`
        );
      }
      if (typeof data.resultId !== 'string' || data.resultId.length === 0) {
        throw new AssessmentError(
          'Your results could not be saved, so they cannot be opened. Please try again.',
          'No resultId returned, the details cannot be fetched without one'
        );
      }

      // Ranking stubs. The hook fills each one in.
      const stubs: MergedMatch[] = (list as Array<Record<string, unknown>>).map((r, i) => ({
        index: i,
        title: typeof r.title === 'string' ? r.title : '',
        category: typeof r.category === 'string' ? r.category : undefined,
        oneLiner: typeof r.oneLiner === 'string' ? r.oneLiner : undefined,
        // The ranking decided this, so the badge shows straight away rather
        // than waiting on the detail.
        saturation: typeof r.saturation === 'string' ? r.saturation : undefined,
      }));

      setRankings(stubs);
      setResultId(data.resultId);
      setStage('results');
    } catch (err) {
      console.error('Assessment error:', err);
      setError(err instanceof AssessmentError ? err.userMessage : GENERIC_ASSESSMENT_ERROR);
      setStage('form');
      setStep(5);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailLoading(true);
    setEmailError('');

    try {
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), ...(resultId ? { resultId } : {}) }),
      });

      setStage('unlocked');
    } catch (err) {
      console.error('Email error:', err);
      setEmailError('Something went wrong. Try again.');
    } finally {
      setEmailLoading(false);
    }
  }

  function renderStep() {
    if (step === 1) {
      return (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-s1">Your hard skills</h2>
          <p className="text-gray-500 mb-s5 text-sm">Select everything that applies. Be generous.</p>
          <div className="flex flex-wrap gap-s2">
            {HARD_SKILLS.map((s) => (
              <Pill
                key={s}
                label={s}
                selected={form.hardSkills.includes(s)}
                disabled={false}
                onClick={() => togglePill('hardSkills', s)}
              />
            ))}
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-s1">Your soft skills</h2>
          <p className="text-gray-500 mb-s5 text-sm">
            Pick your top 5.{' '}
            <span className="font-semibold" style={{ color: '#6B6B66' }}>{form.softSkills.length}/5 selected</span>
          </p>
          <div className="flex flex-wrap gap-s2">
            {SOFT_SKILLS.map((s) => (
              <Pill
                key={s}
                label={s}
                selected={form.softSkills.includes(s)}
                disabled={form.softSkills.length >= 5}
                onClick={() => togglePill('softSkills', s, 5)}
              />
            ))}
          </div>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-s1">How you like to work</h2>
          <p className="text-gray-500 mb-s5 text-sm">Pick one from each pair.</p>
          <div className="space-y-s4">
            {WORK_STYLE_PAIRS.map((pair, i) => (
              <EitherOrPair
                key={i}
                optionA={pair.a}
                optionB={pair.b}
                value={form.workStyle[i]}
                onChange={(v) =>
                  setForm((prev) => {
                    const updated = [...prev.workStyle];
                    updated[i] = v;
                    return { ...prev, workStyle: updated };
                  })
                }
              />
            ))}
          </div>
        </div>
      );
    }

    if (step === 4) {
      return (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-s1">What matters most</h2>
          <p className="text-gray-500 mb-s5 text-sm">
            Pick your top 3.{' '}
            <span className="font-semibold" style={{ color: '#6B6B66' }}>{form.values.length}/3 selected</span>
          </p>
          <div className="flex flex-wrap gap-s2">
            {VALUES.map((v) => (
              <Pill
                key={v}
                label={v}
                selected={form.values.includes(v)}
                disabled={form.values.length >= 3}
                onClick={() => togglePill('values', v, 3)}
              />
            ))}
          </div>
        </div>
      );
    }

    if (step === 5) {
      return (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-s1">The practical part</h2>
          <p className="text-gray-500 mb-s5 text-sm">Realistic expectations make better matches.</p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-s2">
                Hours available per week
              </label>
              <div className="flex flex-wrap gap-s2">
                {HOURS_OPTIONS.map((opt) => (
                  <Pill
                    key={opt}
                    label={opt}
                    selected={form.hoursPerWeek === opt}
                    disabled={false}
                    onClick={() => setForm((prev) => ({ ...prev, hoursPerWeek: opt }))}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-s2">
                Monthly income target
              </label>
              <div className="flex flex-wrap gap-s2">
                {INCOME_OPTIONS.map((opt) => (
                  <Pill
                    key={opt}
                    label={opt}
                    selected={form.incomeTarget === opt}
                    disabled={false}
                    onClick={() => setForm((prev) => ({ ...prev, incomeTarget: opt }))}
                  />
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-s4 text-sm text-red-600 bg-red-50 px-s4 py-s2 rounded-lg">{error}</p>
          )}
        </div>
      );
    }

    return null;
  }

  // matches is empty only in an impossible state, but the cards index into it,
  // so hold the loader rather than render undefined.
  if (stage === 'loading' || ((stage === 'results' || stage === 'unlocked') && matches.length === 0)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-s4">
        <div className="text-center max-w-sm w-full">
          <PlanLoader className="mb-s6" />
          <p className="text-lg font-semibold text-gray-800 transition-all duration-500 min-h-[3.5rem] flex items-center justify-center">
            {LOADING_MESSAGES[loadingMsgIndex]}
          </p>
          <div className="w-full h-2 bg-gray-200 rounded-full mt-s4 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%`, backgroundImage: GOLD_GRADIENT }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-s3">
            This takes a few seconds.
          </p>
        </div>
      </div>
    );
  }

  if (stage === 'results' || stage === 'unlocked') {
    const locked = stage === 'results';
    const top3 = matches.slice(0, 3).map((m, i) => `${i + 1}. ${m.title}`).join('\n');
    const more = matches.length > 3 ? `…and ${matches.length - 3} more.` : '';
    const shareText = `${String.fromCodePoint(0x2728)} I took the 5-minute IdeaToPlan business assessment. My top matches:\n${top3}\n${more}\n${String.fromCodePoint(0x1F4AB)} Find yours:`;

    return (
      <div className="min-h-screen" style={{ background: 'var(--i2p-cream)' }}>
        <div
          className="relative overflow-hidden section-y"
          style={{
            background: 'linear-gradient(180deg, var(--i2p-dark) 0%, #17140c 65%, #17140c 100%)',
          }}
        >
          <div
            className="pointer-events-none absolute"
            style={{
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '640px',
              height: '400px',
              background: 'radial-gradient(ellipse, rgba(232,200,74,0.16) 0%, transparent 70%)',
            }}
          />
          <div ref={topRef} className="page-container relative scroll-mt-24">
            <div className="measure">
            <a
              href="/"
              className="inline-flex items-center gap-s1 text-sm mb-s6 transition-opacity hover:opacity-80"
              style={{ color: 'var(--i2p-text-on-dark-dim)' }}
            >
              <ArrowLeft className="w-4 h-4" /> Back to IdeaToPlan
            </a>
            <div className="text-center">
              <p
                className="mb-s4 font-bold uppercase"
                style={{ color: 'var(--i2p-gold)', fontSize: '0.78rem', letterSpacing: '0.15em' }}
              >
                YOUR ASSESSMENT · RESULTS
              </p>
              <h1
                className="font-serif mb-s3"
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(2rem, 5vw, 3rem)',
                  color: 'var(--i2p-text-on-dark)',
                  lineHeight: 1.15,
                }}
              >
                What You&apos;re Built to Do
              </h1>
              <p className="text-sm" style={{ color: 'var(--i2p-text-on-dark-body)' }}>
                Based on your skills, values, and lifestyle goals: here are your top 7 paths.
              </p>
              </div>
            </div>
          </div>
        </div>

        <div className="page-container relative z-10 pb-section" style={{ marginTop: '-2.75rem' }}>
          <div className="measure">

          {!locked && resultId && (
            <div className="mb-s6">
              <ShareButtons
                url={`https://ideatoplan.to/results/${resultId}`}
                title="My Business Matches"
                text={shareText}
              />
            </div>
          )}

          <div className="mb-s4">
            <MatchCard
              match={matches[0]}
              index={0}
              status={statusFor(0)}
              resultId={resultId}
              userEmail={email}
              errorMessage={errors[0]?.message}
              onRetry={errors[0]?.canRetry ? () => retry(0) : undefined}
            />
          </div>

          <div className="relative">
            <div className={locked ? 'blur-sm select-none pointer-events-none' : ''}>
              <div className="space-y-s4">
                {matches.slice(1).map((match, i) => {
                  const index = i + 1;
                  return (
                    <MatchCard
                      key={index}
                      match={match}
                      index={index}
                      status={statusFor(index)}
                      resultId={resultId}
                      userEmail={email}
                      errorMessage={errors[index]?.message}
                      onRetry={errors[index]?.canRetry ? () => retry(index) : undefined}
                    />
                  );
                })}
              </div>
            </div>

            {locked && (
              <div className="absolute inset-0 flex items-start justify-center pt-s6">
                <div className="bg-white rounded-2xl shadow-xl p-s6 mx-s4 w-full max-w-md text-center border border-gray-100">
                  <h3 className="text-xl font-bold text-gray-900 mb-s2">Unlock your full results</h3>
                  <p className="text-gray-500 text-sm mb-s5">
                    Enter your email to reveal all 7 matches. No spam, unsubscribe any time.
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
                      className="w-full py-s3 font-semibold rounded-lg cta-shimmer disabled:opacity-60"
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

          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const TOTAL_STEPS = 5;

  return (
    <div className="min-h-screen bg-gray-50">
      <div ref={topRef} className="page-container section-y">
        <div className="measure">
        <a
          href="/"
          className="inline-flex items-center gap-s1 text-sm text-gray-500 hover:text-gray-700 mb-s5"
        >
          <ArrowLeft className="w-4 h-4" /> Back to IdeaToPlan
        </a>

        <h1 className="text-3xl font-bold text-gray-900 mb-s1">What You&apos;re Built to Do</h1>
        <p className="text-gray-500 mb-s5 text-sm">
          Answer 5 quick questions. Get 7 businesses matched to your skills, values, and lifestyle.
        </p>

        <ProgressBar step={step} total={TOTAL_STEPS} />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-s5 md:p-s6 mb-s5">
          {renderStep()}
        </div>

        <div className="flex justify-between items-center">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-s2 text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <span />
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              disabled={!canAdvance()}
              onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-s2 px-s5 py-2.5 text-sm font-semibold rounded-lg cta-shimmer disabled:opacity-40 disabled:cursor-not-allowed"
              style={GOLD_BUTTON_STYLE}
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="text-right">
              <button
                type="button"
                disabled={!canAdvance()}
                onClick={submitAssessment}
                className="px-s6 py-s3 font-semibold rounded-lg cta-shimmer disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                style={GOLD_BUTTON_STYLE}
              >
                Show me my matches
              </button>
              <p className="text-xs text-gray-400 mt-s2">
                Then turn your top match into a full business plan
              </p>
            </div>
          )}
        </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
