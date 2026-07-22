"use client";

import {
  X,
  CheckCircle,
  AlertCircle,
  Loader,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

type FormData = {
  fullName: string;
  email: string;
  businessIdea: string;
  targetAudience: string;
  problem: string;
  industry: string;
  location: string;
  revenueModel: string;
  differentiation: string;
  budget: string;
  planGoal: string;
  planType: string;
  expedited24h: string;
  founderBackground: string;
  fundingAsk: string;
  useOfFunds: string;
  currentTraction: string;
  exitVision: string;
  loanAmount: string;
  loanUse: string;
  creditStanding: string;
  existingDebt: string;
  assetsCollateral: string;
  currentRevenue: string;
  yearsInBusiness: string;
};

type SubmitStatus = "idle" | "loading" | "success" | "error";

const initialForm: FormData = {
  fullName: "",
  email: "",
  businessIdea: "",
  targetAudience: "",
  problem: "",
  industry: "",
  location: "",
  revenueModel: "",
  differentiation: "",
  budget: "",
  planGoal: "",
  planType: "",
  expedited24h: "no",
  founderBackground: "",
  fundingAsk: "",
  useOfFunds: "",
  currentTraction: "",
  exitVision: "",
  loanAmount: "",
  loanUse: "",
  creditStanding: "",
  existingDebt: "",
  assetsCollateral: "",
  currentRevenue: "",
  yearsInBusiness: "",
};

type PlanOption = {
  value: string;
  title: string;
  price: string;
  description: string;
  comingSoon?: boolean;
};

const PLAN_OPTIONS: PlanOption[] = [
  {
    value: "Starter",
    title: "Starter",
    price: "$25",
    description:
      "Full business plan PDF: market fit, revenue model, 90-day actions, and marketing basics. Ideal when you need a solid roadmap without extra research layers.",
  },
  {
    value: "Growth",
    title: "Growth",
    price: "$50",
    description:
      "Everything in Starter plus deeper competitor and positioning analysis: who else is solving this, how you stand out, and clearer differentiation for pitches or strategy.",
  },
  {
    value: "Visa / Immigration",
    title: "Visa / Immigration",
    price: "$599",
    description:
      "Plan structured for visa and immigration contexts: business narrative, viability framing, and language aligned with what officers and advisors typically expect.",
    comingSoon: true,
  },
];

// LIVE links - uncomment for production launch
// const STRIPE_LINKS: Record<string, string> = {
//   Starter: 'https://buy.stripe.com/7sY00kb2Hf7ugmb6J4b7y02',
//   Growth: 'https://buy.stripe.com/7sY28s8UzaRe9XN3wSb7y03',
// };

// TEST links - active for local rehearsal
const STRIPE_LINKS: Record<string, string> = {
  Starter: 'https://buy.stripe.com/test_14A8wI5GDgf6ekc1oa4Ja03',
  Growth: 'https://buy.stripe.com/test_5kQ3co2ur4wogsk3wi4Ja02',
};

const GOLD_GRADIENT =
  "linear-gradient(135deg, #6B4C08 0%, #C9A030 35%, #F5D020 60%, #E8C84A 80%, #6B4C08 100%)";

const GOLD_BUTTON_STYLE = {
  background: GOLD_GRADIENT,
  color: "#2D1A00",
  border: "1.5px solid #7A5C0A",
} as const;

const GOLD_BUTTON_TEXT_STYLE = {
  color: "#2D1A00",
  border: "1.5px solid #7A5C0A",
} as const;

const INPUT_CLASS =
  "w-full border border-[#E8E4DB] rounded-lg px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C9A030] transition";

export default function IdeaToPlan() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(initialForm);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [stripeSessionId, setStripeSessionId] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
const [paymentError, setPaymentError] = useState("");
  const [planSelected, setPlanSelected] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [showPrefillNote, setShowPrefillNote] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyError, setNotifyError] = useState("");
  const [notifySubmitted, setNotifySubmitted] = useState(false);
  const cardsRef = useRef<HTMLDivElement>(null);

  // On return from Stripe, verify the session and open the modal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;

    fetch("/api/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.paid) {
          setStripeSessionId(sessionId);

          let prefillIdea = "";
          try {
            const raw = sessionStorage.getItem("i2p_prefill_idea");
            if (raw) {
              const p = JSON.parse(raw);
              const parts: string[] = [];
              if (p.title) parts.push(p.title + ".");
              if (p.description) parts.push(p.description);
              if (p.uniqueAngle) parts.push("My angle: " + p.uniqueAngle);
              prefillIdea = parts.join(" ");
            }
          } catch {}

          setForm((prev) => ({
            ...prev,
            planType: data.planType ?? prev.planType,
            email: prev.email || data.email || "",
            ...(prefillIdea && !prev.businessIdea ? { businessIdea: prefillIdea } : {}),
          }));

          if (prefillIdea) setShowPrefillNote(true);
          setShowForm(true);
          window.scrollTo({ top: 0 });
          history.replaceState(null, "", window.location.pathname);
        } else {
          setPaymentError(
            "Payment could not be verified. Please try again or contact support."
          );
        }
      })
      .catch(() => {
        setPaymentError("Payment verification failed. Please try again.");
      });
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const t = e.target;
    if (t.type === "checkbox" && "checked" in t) {
      setForm((prev) => ({
        ...prev,
        [t.name]: (t as HTMLInputElement).checked ? "yes" : "no",
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [t.name]: t.value }));
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      await fetch("/api/submit-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, stripeSessionId }),
      });
      setStatus("success");
      sessionStorage.removeItem("i2p_prefill_idea");
      setForm(initialForm);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg("Something went wrong. Please try again or email us directly.");
      setStatus("error");
    }
  };

  const handlePaymentCTA = () => {
    const link = STRIPE_LINKS[form.planType] ?? STRIPE_LINKS["Starter"];
    setRedirecting(true);
    window.location.href = link;
  };

  const handleGetStarted = () => {
    cardsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setPulsing(true);
    setTimeout(() => setPulsing(false), 900);
  };

  const submitNotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyEmail.trim()) return;
    setNotifyLoading(true);
    setNotifyError("");
    try {
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: notifyEmail.trim() }),
      });
      setNotifySubmitted(true);
    } catch (err) {
      console.error("Notify subscribe error:", err);
      setNotifyError("Something went wrong. Try again.");
    } finally {
      setNotifyLoading(false);
    }
  };

  const isDirty = () =>
    JSON.stringify(form) !== JSON.stringify(initialForm) &&
    status !== "success";

  const closeForm = () => {
    if (isDirty() && !window.confirm("Discard your answers? Your progress will be lost.")) {
      return;
    }
    setShowForm(false);
    setStatus("idle");
    setErrorMsg("");
  };

  return (
    <section
      id="idea-to-plan"
      className="pt-2 pb-10 md:pt-3 md:pb-14"
      style={{
        background: "#0D1117",
        backgroundImage:
          "radial-gradient(circle, rgba(201,160,48,0.06) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-5">
          <span
            className="inline-block text-xs sm:text-sm font-bold px-5 py-2 rounded-full uppercase tracking-widest shadow-md mb-3"
            style={GOLD_BUTTON_STYLE}
          >
            IdeaToPlan
          </span>
          <h2
            className="text-3xl md:text-4xl font-serif font-bold mb-3"
            style={{ color: "#F5E9C9" }}
          >
            Your business plan in 72 hours.
          </h2>
          <p
            className="text-base font-medium max-w-2xl mx-auto"
            style={{ color: "#E8E4DB" }}
          >
            A done-for-you business planning service built for founders who are ready to
            move.
          </p>
        </div>

        <div>
          <div
            ref={cardsRef}
            className="grid md:grid-cols-3 gap-6 mb-4 rounded-2xl transition-all duration-300"
            style={pulsing ? { outline: "2px solid #C9A030", outlineOffset: "6px" } : undefined}
          >
            {/* Starter */}
            <div
              className={`rounded-2xl p-6 flex flex-col card-hover-lift cursor-pointer transition-all ${
                form.planType === "Starter"
                  ? "border-2 border-[#C9A030] scale-[1.02]"
                  : "border border-[#E8E4DB] bg-white shadow-sm"
              }`}
              style={
                form.planType === "Starter"
                  ? { background: "#FDFBF4", boxShadow: "0 8px 24px rgba(201, 160, 48, 0.18)" }
                  : undefined
              }
              onClick={() => { setForm((prev) => ({ ...prev, planType: "Starter" })); setPlanSelected(true); }}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-1">Starter</h3>
              <p className="font-bold text-2xl mb-1" style={{ color: "#0D1117" }}>
                $25
              </p>
              <p className="text-sm text-gray-500 mb-4">
                For founders who want a polished business plan without overpaying.
              </p>
              <ul className="space-y-2 text-sm text-gray-700 flex-1">
                {[
                  "Actionable business plan built around your idea",
                  "Revenue model and pricing strategy",
                  "90-day roadmap with clear milestones",
                  "Professional PDF delivered in 72 hours",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-bold mt-0.5" style={{ color: "#0D1117" }}>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Growth — Most Popular */}
            <div
              className="border-2 rounded-2xl p-6 shadow-lg flex flex-col relative card-hover-lift cursor-pointer transition-all scale-[1.02]"
              style={{
                borderColor: "#C9A030",
                background: "#FDFBF4",
                boxShadow: "0 8px 24px rgba(201, 160, 48, 0.18)",
              }}
              onClick={() => { setForm((prev) => ({ ...prev, planType: "Growth" })); setPlanSelected(true); }}
            >
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full"
                style={GOLD_BUTTON_STYLE}
              >
                Most Popular
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Growth</h3>
              <p className="font-bold text-2xl mb-1" style={{ color: "#0D1117" }}>
                $50
              </p>
              <p className="text-sm text-gray-500 mb-4">
                For entrepreneurs who want market validation and smarter positioning.
              </p>
              <ul className="space-y-2 text-sm text-gray-700 flex-1">
                {[
                  "Everything in Starter",
                  "Competitor research and landscape analysis",
                  "SWOT analysis",
                  "Viability verdict with go/no-go assessment",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-bold mt-0.5" style={{ color: "#0D1117" }}>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Visa / Immigration — Notify-me capture (not purchasable yet) */}
            <div className="border border-dashed border-[#E8E4DB] rounded-2xl p-6 bg-white shadow-sm flex flex-col relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-100 text-gray-500 text-xs font-bold px-4 py-1 rounded-full border border-gray-200">
                Coming soon
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Visa / Immigration</h3>
              <p className="text-gray-500 font-bold text-2xl mb-1">$599</p>
              <p className="text-sm text-gray-500 mb-4">
                Plan structured for visa and immigration contexts: business narrative, viability framing, and language aligned with what officers and advisors typically expect.
              </p>

              <div className="flex-1 flex flex-col justify-end">
                {notifySubmitted ? (
                  <div className="text-center py-2">
                    <CheckCircle className="w-6 h-6 mx-auto mb-2" style={{ color: "#3D6B35" }} />
                    <p className="text-sm font-semibold text-gray-800">You&apos;re on the list</p>
                    <p className="text-xs text-gray-500 mt-1">
                      We&apos;ll email you when this tier is available.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={submitNotify} className="space-y-2">
                    <input
                      type="email"
                      required
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A030]"
                    />
                    <button
                      type="submit"
                      disabled={notifyLoading}
                      className="w-full py-2 text-sm font-semibold rounded-lg border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-60 transition-colors"
                    >
                      {notifyLoading ? "Adding..." : "Notify Me When Available"}
                    </button>
                    {notifyError && (
                      <p className="text-xs text-red-600 text-center">{notifyError}</p>
                    )}
                  </form>
                )}
              </div>
            </div>

          </div>

          <p className="text-center text-sm font-medium mb-4" style={{ color: "#B0AA9E" }}>
            Special introductory offer: plans start at $25. Delivered within
            72 hours, and we walk you through it together.
          </p>

          {/* Payment error from failed verification */}
          {paymentError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 mb-4 max-w-lg mx-auto">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{paymentError}</p>
            </div>
          )}

          <div className="text-center">
            <button
              onClick={planSelected ? handlePaymentCTA : handleGetStarted}
              disabled={redirecting}
              className="px-10 py-4 text-lg font-semibold rounded-lg cta-shimmer shadow-lg flex items-center gap-2 mx-auto disabled:opacity-60"
              style={GOLD_BUTTON_TEXT_STYLE}
            >
              {redirecting ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Redirecting to payment...
                </>
              ) : planSelected ? (
                <>
                  Build My Plan
                  <span className="font-normal opacity-75">
                    · {form.planType === "Growth" ? "$50" : "$25"}
                  </span>
                </>
              ) : (
                "Build My Plan"
              )}
            </button>
            <p
              className="text-center mt-3 mx-auto"
              style={{ color: "#B0AA9E", fontSize: "13px", maxWidth: "560px" }}
            >
              After payment: a 3&ndash;5 minute form about your idea (bank loan and investor plans ask for financials), then your plan is delivered within 72 hours, and we schedule your walkthrough call.
            </p>
          </div>
        </div>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "#E8E4DB" }}
            >
              <div>
                <h3 className="text-lg font-bold" style={{ color: "#0D1117" }}>
                  Tell Us About Your Idea
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Takes about 3 minutes.</p>
              </div>
              <button
                onClick={closeForm}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              {status === "success" ? (
                <div className="text-center py-8">
                  <CheckCircle
                    className="w-16 h-16 mx-auto mb-4"
                    style={{ color: "#C9A030" }}
                  />
                  <h3 className="text-2xl font-bold mb-3" style={{ color: "#0D1117" }}>
                    You&apos;re in the queue!
                  </h3>
                  <p className="text-gray-600 mb-2">
                    Payment received and idea submitted — your plan is in the queue.
                    Delivery within 72 hours.
                  </p>
                  <p className="text-gray-500 text-sm">
                    Check your inbox and spam, just in case.
                  </p>
                  <button
                    onClick={closeForm}
                    className="mt-6 px-8 py-3 font-semibold rounded-lg cta-shimmer"
                    style={GOLD_BUTTON_TEXT_STYLE}
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  {status === "error" && (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-red-700 text-sm">{errorMsg}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          name="fullName"
                          value={form.fullName}
                          onChange={handleChange}
                          required
                          placeholder="Jane Smith"
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          name="email"
                          type="email"
                          value={form.email}
                          onChange={handleChange}
                          required
                          placeholder="jane@example.com"
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Describe your business idea <span className="text-red-500">*</span>
                      </label>
                      {showPrefillNote && (
                        <div className="flex items-center justify-between mb-2 px-1">
                          <span className="text-xs" style={{ color: "#6B6B66" }}>
                            Pre-filled from your assessment match — edit freely.
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowPrefillNote(false)}
                            className="text-xs ml-3 opacity-50 hover:opacity-100 transition-opacity"
                            style={{ color: "#6B6B66" }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      <textarea
                        name="businessIdea"
                        value={form.businessIdea}
                        onChange={handleChange}
                        required
                        rows={3}
                        placeholder="What's the idea? Give us the overview."
                        className={`${INPUT_CLASS} resize-none`}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        What problem does it solve? <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        name="problem"
                        value={form.problem}
                        onChange={handleChange}
                        required
                        rows={2}
                        placeholder="What pain point are you solving?"
                        className={`${INPUT_CLASS} resize-none`}
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Industry / type of business <span className="text-red-500">*</span>
                        </label>
                        <input
                          name="industry"
                          value={form.industry}
                          onChange={handleChange}
                          required
                          placeholder="e.g. E-commerce, Consulting, SaaS"
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Where will you operate?
                        </label>
                        <input
                          name="location"
                          value={form.location}
                          onChange={handleChange}
                          placeholder="City, State or Online/Location-independent"
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Current annual revenue
                        </label>
                        <input
                          name="currentRevenue"
                          value={form.currentRevenue}
                          onChange={handleChange}
                          placeholder="e.g. $150,000, leave blank if pre-revenue"
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Years in business
                        </label>
                        <input
                          name="yearsInBusiness"
                          value={form.yearsInBusiness}
                          onChange={handleChange}
                          placeholder="e.g. 5 years, leave blank if new"
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Who is your target customer? <span className="text-red-500">*</span>
                      </label>
                      <input
                        name="targetAudience"
                        value={form.targetAudience}
                        onChange={handleChange}
                        required
                        placeholder="e.g. Freelance designers aged 30–45 who want to go full-time"
                        className={INPUT_CLASS}
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          How will you make money?
                        </label>
                        <input
                          name="revenueModel"
                          value={form.revenueModel}
                          onChange={handleChange}
                          placeholder="e.g. Subscriptions, one-time sales, services"
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          What makes you different?
                        </label>
                        <input
                          name="differentiation"
                          value={form.differentiation}
                          onChange={handleChange}
                          placeholder="Your edge over competitors"
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Approximate startup budget
                        </label>
                        <select
                          name="budget"
                          value={form.budget}
                          onChange={handleChange}
                          className={`${INPUT_CLASS} bg-white`}
                        >
                          <option value="">Select range...</option>
                          <option value="under5k">Under $5,000</option>
                          <option value="5k-25k">$5,000 – $25,000</option>
                          <option value="25k-50k">$25,000 – $50,000</option>
                          <option value="50k-100k">$50,000 – $100,000</option>
                          <option value="notsure">Not sure yet</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Goal for this plan
                        </label>
                        <select
                          name="planGoal"
                          value={form.planGoal}
                          onChange={handleChange}
                          className={`${INPUT_CLASS} bg-white`}
                        >
                          <option value="">Select goal...</option>
                          <option value="bank-loan">Bank loan</option>
                          <option value="investor">Investor pitch</option>
                          <option value="personal-roadmap">Personal roadmap</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>

                    {form.planGoal === "bank-loan" && (
                      <div
                        className="space-y-4 rounded-xl p-4"
                        style={{
                          border: "1px solid #E8E4DB",
                          background: "white",
                        }}
                      >
                        <p className="text-sm font-semibold" style={{ color: "#5C4206" }}>
                          Bank Loan Details
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Loan amount requested
                            </label>
                            <input
                              name="loanAmount"
                              value={form.loanAmount}
                              onChange={handleChange}
                              placeholder="e.g. $50,000 SBA loan"
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Intended use of loan
                            </label>
                            <input
                              name="loanUse"
                              value={form.loanUse}
                              onChange={handleChange}
                              placeholder="e.g. Equipment, working capital, inventory"
                              className={INPUT_CLASS}
                            />
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Credit &amp; financial standing
                            </label>
                            <input
                              name="creditStanding"
                              value={form.creditStanding}
                              onChange={handleChange}
                              placeholder="e.g. Good credit, no bankruptcies"
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Existing debt or obligations
                            </label>
                            <input
                              name="existingDebt"
                              value={form.existingDebt}
                              onChange={handleChange}
                              placeholder="e.g. Car loan, no other business debt"
                              className={INPUT_CLASS}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Collateral and assets
                          </label>
                          <textarea
                            name="assetsCollateral"
                            value={form.assetsCollateral}
                            onChange={handleChange}
                            rows={3}
                            placeholder="e.g. Vehicle or property as collateral, savings, equipment"
                            className={`${INPUT_CLASS} resize-none`}
                          />
                        </div>
                      </div>
                    )}

                    {form.planGoal === "investor" && (
                      <div
                        className="space-y-4 rounded-xl p-4"
                        style={{
                          border: "1px solid #E8E4DB",
                          background: "white",
                        }}
                      >
                        <p className="text-sm font-semibold" style={{ color: "#5C4206" }}>
                          Investor Pitch Details
                        </p>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Your background
                          </label>
                          <textarea
                            name="founderBackground"
                            value={form.founderBackground}
                            onChange={handleChange}
                            rows={3}
                            placeholder="Relevant experience and why you're the right person to build this."
                            className={`${INPUT_CLASS} resize-none`}
                          />
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Funding ask
                            </label>
                            <input
                              name="fundingAsk"
                              value={form.fundingAsk}
                              onChange={handleChange}
                              placeholder="e.g. $500K seed round"
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                              Current traction
                            </label>
                            <input
                              name="currentTraction"
                              value={form.currentTraction}
                              onChange={handleChange}
                              placeholder="Revenue, users, pilots, waitlist, etc."
                              className={INPUT_CLASS}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Use of funds
                          </label>
                          <textarea
                            name="useOfFunds"
                            value={form.useOfFunds}
                            onChange={handleChange}
                            rows={2}
                            placeholder="What will the investment capital be used for?"
                            className={`${INPUT_CLASS} resize-none`}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Exit vision
                          </label>
                          <textarea
                            name="exitVision"
                            value={form.exitVision}
                            onChange={handleChange}
                            rows={2}
                            placeholder="Acquisition, IPO, lifestyle business? What does success look like in 5–7 years?"
                            className={`${INPUT_CLASS} resize-none`}
                          />
                        </div>
                      </div>
                    )}

                    {/* Plan locked to paid tier */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Plan type
                      </label>
                      <div
                        className="flex items-center gap-3 px-4 py-3 rounded-lg border"
                        style={{ borderColor: "#C9A030", background: "white" }}
                      >
                        <span
                          className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                          style={{ background: GOLD_GRADIENT, color: "#2D1A00" }}
                        >
                          Paid
                        </span>
                        <span className="font-semibold text-sm text-gray-800">
                          {form.planType}
                        </span>
                        <span className="text-xs text-gray-500 ml-auto">
                          {PLAN_OPTIONS.find((p) => p.value === form.planType)?.price}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Locked to your payment. Contact us to change plans.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="w-full py-4 text-lg font-semibold rounded-lg cta-shimmer shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                      style={GOLD_BUTTON_TEXT_STYLE}
                    >
                      {status === "loading" ? (
                        <>
                          <Loader className="w-5 h-5 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        "Submit Your Idea"
                      )}
                    </button>

                    <p className="text-center text-xs text-gray-400">
                      Your plan will be delivered within 72 hours. We&apos;ll reach out to schedule your walkthrough call.
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
