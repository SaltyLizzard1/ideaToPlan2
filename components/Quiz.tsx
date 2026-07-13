"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface FormData {
  hardSkills: string[];
  softSkills: string[];
  workStyle: string[];
  values: string[];
  hoursPerWeek: string;
  incomeTarget: string;
}

interface Match {
  title: string;
  category: string;
  description: string;
  whyYou: string;
  saturation: "Low" | "Medium" | "High";
  saturationNote: string;
  uniqueAngle: string;
  incomeRange: string;
  firstSteps: string[];
}

type Stage = "form" | "loading" | "results" | "unlocked";

// ── Constants ──────────────────────────────────────────────────────────────

const HARD_SKILLS = [
  "Writing & copywriting",
  "Graphic design",
  "Web / UI design",
  "Video editing & production",
  "Photography",
  "Audio & podcast production",
  "Animation & motion graphics",
  "Software development",
  "AI & automation tools",
  "Technical support & IT",
  "Data analysis & spreadsheets",
  "SEO & content strategy",
  "Email marketing",
  "Paid advertising (Google / Meta)",
  "Social media management",
  "Community management",
  "Sales & business development",
  "Customer success",
  "Teaching & course creation",
  "Public speaking & presenting",
  "Project management",
  "Virtual assistance & admin",
  "Bookkeeping & accounting",
  "Legal & compliance",
  "HR & recruiting",
  "Research & fact-checking",
  "Translation & localization",
  "Other",
];

const SOFT_SKILLS = [
  "Communicating clearly",
  "Organizing & systemizing",
  "Problem-solving",
  "Empathy & listening",
  "Persuading & influencing",
  "Attention to detail",
  "Leading & mentoring",
  "Researching & synthesizing",
  "Adapting to change",
  "Creative thinking",
  "Teaching & explaining",
  "Negotiating",
  "Strategic thinking",
  "Networking & relationship-building",
];

const VALUES = [
  "Freedom & location independence",
  "Helping people directly",
  "Creative expression",
  "Building something of my own",
  "Financial stability",
  "Learning & growing constantly",
  "Making a big impact",
  "Autonomy — no boss",
  "Recognition & status",
  "Community & belonging",
];

const WORK_STYLE_PAIRS = [
  { a: "People-facing", b: "Behind the scenes" },
  { a: "Structured schedule", b: "Flexible hours" },
  { a: "Solo deep work", b: "Collaborative & team-based" },
  { a: "Creating new things", b: "Improving existing things" },
];

const HOURS_OPTIONS = ["<5", "5–10", "10–20", "20–30", "30+"];
const INCOME_OPTIONS = [
  "$500–$1,000",
  "$1,000–$2,500",
  "$2,500–$5,000",
  "$5,000–$10,000",
  "$10,000+",
];

const LOADING_MESSAGES = [
  "Reading your skills and strengths...",
  "Mapping them to online work that fits your life...",
  "Checking which markets are crowded and which are open...",
  "Finding your unique angle in each one...",
  "Writing your personalised first steps...",
  "Almost there — putting it all together...",
];

const LOADING_DURATION_MS = 75000;

const GOLD_GRADIENT =
  "linear-gradient(135deg, #6B4C08 0%, #C9A030 35%, #F5D020 60%, #E8C84A 80%, #6B4C08 100%)";

const SATURATION_COLORS: Record<Match["saturation"], string> = {
  Low: "bg-[#EFF3EA] text-[var(--i2p-success)]",
  Medium: "bg-white text-[var(--i2p-gold-deep)] border border-[var(--i2p-cream-border)]",
  High: "bg-[#F9ECEB] text-[var(--i2p-error)]",
};

// ── Sub-components ─────────────────────────────────────────────────────────

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
        "px-4 py-2 rounded-full border text-sm font-medium transition-all duration-150",
        selected
          ? "gold-gradient border-[#B8922A] text-[#2D1A00] font-semibold"
          : disabled
          ? "bg-[var(--i2p-cream-border)] border-[var(--i2p-cream-border)] text-[var(--i2p-ink-dim)] cursor-not-allowed"
          : "bg-[#FFFEF9] border-[#D9CFAF] text-[var(--i2p-ink-body)] hover:border-[var(--i2p-gold)] hover:shadow-sm",
      ].join(" ")}
    >
      {selected ? "✓ " : ""}{label}
    </button>
  );
}

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
          "flex-1 py-5 px-4 rounded-xl border-2 text-sm font-semibold transition-all text-center card-hover-lift",
          active
            ? "border-[#C9A030] bg-[#FBF6E4] text-[#5C4206] shadow"
            : "border-[#D9CFAF] bg-white text-[var(--i2p-ink-body)] hover:border-[var(--i2p-gold)] hover:shadow-sm",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex gap-3 items-center">
      {card(optionA)}
      <span className="text-[var(--i2p-ink-dim)] text-xs font-bold shrink-0">OR</span>
      {card(optionB)}
    </div>
  );
}

function MatchCard({ match, index }: { match: Match; index: number }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--i2p-cream-border)] shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--i2p-ink-dim)] mb-1 block">
            {match.category}
          </span>
          <h3 className="text-xl font-bold text-[var(--i2p-ink)]">
            {index + 1}. {match.title}
          </h3>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full mt-1 shrink-0 ${
            SATURATION_COLORS[match.saturation]
          }`}
        >
          {match.saturation} saturation
        </span>
      </div>

      <p className="text-[var(--i2p-ink-body)] mb-3 leading-relaxed">{match.description}</p>

      <p className="text-sm italic text-[var(--i2p-success)] mb-4 bg-[#EFF3EA] rounded-lg px-4 py-2">
        {match.whyYou}
      </p>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-[var(--i2p-ink-dim)] uppercase tracking-wide">
          Income range:
        </span>
        <span className="text-sm font-bold text-[var(--i2p-ink)]">{match.incomeRange}</span>
      </div>

      {match.uniqueAngle && (
        <div className="bg-[#FBF6E4] border border-[#EBD9A0] rounded-lg px-4 py-3 mb-4">
          <p className="text-xs font-semibold text-[var(--i2p-gold-deep)] uppercase tracking-wide mb-1">
            Your unique angle
          </p>
          <p className="text-sm text-[#5C4206]">{match.uniqueAngle}</p>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-[var(--i2p-ink-dim)] uppercase tracking-wide mb-2">
          First steps
        </p>
        <ol className="space-y-1">
          {match.firstSteps.map((step, i) => (
            <li key={i} className="flex gap-2 text-sm text-[var(--i2p-ink-body)]">
              <span className="font-bold shrink-0" style={{ color: "var(--i2p-gold-deep)" }}>
                {i + 1}.
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-[var(--i2p-ink-dim)] mt-3">{match.saturationNote}</p>
    </div>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="w-full bg-[var(--i2p-cream-border)] rounded-full h-1.5 mb-8">
      <div
        className="h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${(step / total) * 100}%`, backgroundImage: GOLD_GRADIENT }}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Quiz({
  onMatchSelected,
}: {
  onMatchSelected?: (idea: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("form");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({
    hardSkills: [],
    softSkills: [],
    workStyle: WORK_STYLE_PAIRS.map(() => ""),
    values: [],
    hoursPerWeek: "",
    incomeTarget: "",
  });

  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  const topRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (stage !== "loading") {
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
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stage, step]);

  function togglePill(
    field: "hardSkills" | "softSkills" | "values",
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
    if (step === 3) return form.workStyle.every((v) => v !== "");
    if (step === 4) return form.values.length > 0;
    if (step === 5) return form.hoursPerWeek !== "" && form.incomeTarget !== "";
    return false;
  }

  async function submitQuiz() {
    setStage("loading");
    setError("");

    const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

    if (!webhookUrl) {
      setError("Quiz service is not configured yet. Check back soon!");
      setStage("form");
      return;
    }

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hardSkills: form.hardSkills,
          softSkills: form.softSkills,
          workStyle: WORK_STYLE_PAIRS.map((pair, i) => form.workStyle[i] || pair.a),
          values: form.values,
          hoursPerWeek: form.hoursPerWeek,
          incomeTarget: form.incomeTarget,
        }),
      });

      if (!res.ok) throw new Error(`Status ${res.status}`);

      const data = await res.json();
      const parsed: Match[] = Array.isArray(data)
        ? data
        : data.matches ?? data.result ?? [];

      if (!parsed.length) throw new Error("No matches returned");

      setMatches(parsed);
      setStage("results");
    } catch (err) {
      console.error("Quiz error:", err);
      setError("Something went wrong fetching your results. Please try again.");
      setStage("form");
      setStep(5);
    }
  }

  async function submitEmail(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailLoading(true);
    setEmailError("");

    try {
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setStage("unlocked");
    } catch (err) {
      console.error("Email error:", err);
      setEmailError("Something went wrong. Try again.");
    } finally {
      setEmailLoading(false);
    }
  }

  function renderStep() {
    if (step === 1) {
      return (
        <div>
          <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.24em] text-[var(--i2p-gold-deep)] mb-1">
            Step 1 of 5
          </p>
          <h2 className="font-serif font-bold text-[28px] text-[var(--i2p-ink)] mb-1">Your hard skills</h2>
          <p className="text-[var(--i2p-ink-dim)] mb-6 text-sm">
            Select everything that applies — be generous.
          </p>
          <div className="flex flex-wrap gap-2">
            {HARD_SKILLS.map((s) => (
              <Pill
                key={s}
                label={s}
                selected={form.hardSkills.includes(s)}
                disabled={false}
                onClick={() => togglePill("hardSkills", s)}
              />
            ))}
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div>
          <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.24em] text-[var(--i2p-gold-deep)] mb-1">
            Step 2 of 5
          </p>
          <h2 className="font-serif font-bold text-[28px] text-[var(--i2p-ink)] mb-1">Your soft skills</h2>
          <p className="text-[var(--i2p-ink-dim)] mb-6 text-sm">
            Pick your top 5.{" "}
            <span className="font-semibold" style={{ color: "var(--i2p-gold-deep)" }}>
              {form.softSkills.length}/5 selected
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {SOFT_SKILLS.map((s) => (
              <Pill
                key={s}
                label={s}
                selected={form.softSkills.includes(s)}
                disabled={form.softSkills.length >= 5}
                onClick={() => togglePill("softSkills", s, 5)}
              />
            ))}
          </div>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div>
          <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.24em] text-[var(--i2p-gold-deep)] mb-1">
            Step 3 of 5
          </p>
          <h2 className="font-serif font-bold text-[28px] text-[var(--i2p-ink)] mb-1">How you like to work</h2>
          <p className="text-[var(--i2p-ink-dim)] mb-6 text-sm">Pick one from each pair.</p>
          <div className="space-y-4">
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
          <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.24em] text-[var(--i2p-gold-deep)] mb-1">
            Step 4 of 5
          </p>
          <h2 className="font-serif font-bold text-[28px] text-[var(--i2p-ink)] mb-1">What matters most</h2>
          <p className="text-[var(--i2p-ink-dim)] mb-6 text-sm">
            Pick your top 3.{" "}
            <span className="font-semibold" style={{ color: "var(--i2p-gold-deep)" }}>
              {form.values.length}/3 selected
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {VALUES.map((v) => (
              <Pill
                key={v}
                label={v}
                selected={form.values.includes(v)}
                disabled={form.values.length >= 3}
                onClick={() => togglePill("values", v, 3)}
              />
            ))}
          </div>
        </div>
      );
    }

    if (step === 5) {
      return (
        <div>
          <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.24em] text-[var(--i2p-gold-deep)] mb-1">
            Step 5 of 5
          </p>
          <h2 className="font-serif font-bold text-[28px] text-[var(--i2p-ink)] mb-1">The practical part</h2>
          <p className="text-[var(--i2p-ink-dim)] mb-6 text-sm">
            Realistic expectations make better matches.
          </p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[var(--i2p-ink-body)] mb-2">
                Hours available per week
              </label>
              <div className="flex flex-wrap gap-2">
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
              <label className="block text-sm font-semibold text-[var(--i2p-ink-body)] mb-2">
                Monthly income target
              </label>
              <div className="flex flex-wrap gap-2">
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
            <p className="mt-4 text-sm text-[var(--i2p-error)] bg-[#F9ECEB] px-4 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>
      );
    }

    return null;
  }

  // ── Loading stage ──────────────────────────────────────────────────────────

  if (stage === "loading") {
    return (
      <div className="py-24 flex items-center justify-center px-4">
        <div className="text-center max-w-sm w-full">
          <Loader2
            className="w-10 h-10 animate-spin mx-auto mb-6"
            style={{ color: "var(--i2p-gold-deep)" }}
          />
          <p className="text-lg font-semibold text-[var(--i2p-ink)] transition-all duration-500 min-h-[3.5rem] flex items-center justify-center">
            {LOADING_MESSAGES[loadingMsgIndex]}
          </p>
          <div className="w-full h-2 bg-[var(--i2p-cream-border)] rounded-full mt-4 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%`, backgroundImage: GOLD_GRADIENT }}
            />
          </div>
          <p className="text-sm text-[var(--i2p-ink-dim)] mt-3">
            This takes about 60–90 seconds — we&apos;re building something tailored to you
          </p>
        </div>
      </div>
    );
  }

  // ── Results stage ──────────────────────────────────────────────────────────

  if (stage === "results" || stage === "unlocked") {
    const locked = stage === "results";

    return (
      <div ref={topRef} className="max-w-2xl mx-auto px-4 py-10">
        <h2 className="font-serif font-bold text-[28px] text-[var(--i2p-ink)] mb-1">
          Your business matches
        </h2>
        <p className="text-[var(--i2p-ink-dim)] mb-8 text-sm">
          Based on your skills, values, and lifestyle goals — here are your top 7 paths.
        </p>

        <div className="mb-4">
          <MatchCard match={matches[0]} index={0} />
        </div>

        <div className="relative">
          <div className={locked ? "blur-sm select-none pointer-events-none" : ""}>
            <div className="space-y-4">
              {matches.slice(1).map((match, i) => (
                <MatchCard key={i} match={match} index={i + 1} />
              ))}
            </div>
          </div>

          {locked && (
            <div className="absolute inset-0 flex items-start justify-center pt-8">
              <div className="bg-white rounded-2xl shadow-xl p-8 mx-4 w-full max-w-md text-center border border-[var(--i2p-cream-border)]">
                <h3 className="text-xl font-bold text-[var(--i2p-ink)] mb-2">
                  Unlock your full results
                </h3>
                <p className="text-[var(--i2p-ink-dim)] text-sm mb-6">
                  Enter your email to reveal all 7 matches — no spam, unsubscribe any time.
                </p>
                <form onSubmit={submitEmail} className="space-y-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 border border-[var(--i2p-cream-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--i2p-gold)]"
                  />
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="w-full py-3 cta-shimmer gold-border font-semibold rounded-lg disabled:opacity-60"
                    style={{ color: "#2D1A00" }}
                  >
                    {emailLoading ? "Revealing..." : "Reveal my matches"}
                  </button>
                </form>
                {emailError && (
                  <p className="mt-3 text-sm text-[var(--i2p-error)]">{emailError}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* IdeaToPlan upsell — visible after email unlock */}
        {!locked && matches.length > 0 && (
          <div className="mt-10 rounded-2xl p-8 text-center border border-[#D8E2D0] bg-[#EFF3EA]">
            <p className="text-lg font-bold text-[var(--i2p-success)] mb-2">
              Ready to turn <em>{matches[0].title}</em> into a real business?
            </p>
            <p className="text-sm text-[var(--i2p-ink-body)] mb-5">
              Get a done-for-you professional business plan — ready for investors,
              lenders, or your own roadmap.
            </p>
            <button
              onClick={() => onMatchSelected?.(matches[0].title)}
              className="inline-block px-8 py-3 cta-shimmer gold-border font-semibold rounded-lg cursor-pointer"
              style={{ color: "#2D1A00" }}
            >
              Build my business plan →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Form stage ─────────────────────────────────────────────────────────────

  const TOTAL_STEPS = 5;

  return (
    <div ref={topRef} className="max-w-xl mx-auto px-4 pt-2 pb-10">
      <h2 className="font-serif font-bold text-3xl text-[var(--i2p-ink)] mb-5">
        Your Skills Assessment
      </h2>

      <ProgressBar step={step} total={TOTAL_STEPS} />

      <div className="bg-white rounded-2xl shadow-md border border-[var(--i2p-cream-border)] border-t-2 border-t-[var(--i2p-gold)] p-6 md:p-8 mb-6">
        {renderStep()}
      </div>

      <div className="flex justify-between items-center">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="inline-flex items-center gap-2 text-sm text-[var(--i2p-ink-dim)] hover:text-[var(--i2p-ink)] font-medium"
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
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg cta-shimmer gold-border disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: "#2D1A00" }}
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="text-right">
            <button
              type="button"
              disabled={!canAdvance()}
              onClick={submitQuiz}
              className="px-8 py-3 font-semibold rounded-lg cta-shimmer gold-border disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              style={{ color: "#2D1A00" }}
            >
              Show me my matches
            </button>
            <p className="text-xs text-[var(--i2p-ink-dim)] mt-2">
              Then turn your top match into a full business plan
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
