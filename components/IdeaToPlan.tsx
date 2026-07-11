"use client";

import {
  Lightbulb,
  FileText,
  Rocket,
  X,
  CheckCircle,
  AlertCircle,
  Loader,
} from "lucide-react";
import { useState, useEffect } from "react";

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
  planType: "Starter",
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
      "Everything in Starter plus deeper competitor and positioning analysis — who else is solving this, how you stand out, and clearer differentiation for pitches or strategy.",
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

const GOLD_GRADIENT =
  "linear-gradient(135deg, #6B4C08 0%, #C9A030 35%, #F5D020 60%, #E8C84A 80%, #6B4C08 100%)";

const GOLD_BUTTON_STYLE = {
  background: GOLD_GRADIENT,
  color: "#2D1A00",
  border: "1.5px solid #7A5C0A",
} as const;

const INPUT_CLASS =
  "w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C9A030] transition";

export default function IdeaToPlan({
  prefillIdea,
}: {
  prefillIdea?: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(initialForm);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (prefillIdea) {
      setForm((prev) => ({ ...prev, businessIdea: prefillIdea }));
      setShowForm(true);
    }
  }, [prefillIdea]);

  const processSteps = [
    {
      icon: Lightbulb,
      title: "Share Your Idea",
      description: "Tell us your idea and goals in a quick, straightforward form",
    },
    {
      icon: FileText,
      title: "AI-Assisted Planning",
      description:
        "We guide the AI to craft a tailored, actionable plan that fits your vision",
    },
    {
      icon: Rocket,
      title: "Get Your Plan",
      description:
        "Get your polished, ready-to-use PDF plan in 72 hours — or faster if you're on a deadline",
    },
  ];

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
        body: JSON.stringify(form),
      });
      setStatus("success");
      setForm(initialForm);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg("Something went wrong. Please try again or email us directly.");
      setStatus("error");
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setStatus("idle");
    setErrorMsg("");
  };

  return (
    <section
      id="idea-to-plan"
      className="pt-16 pb-14 md:pt-20 md:pb-20"
      style={{ background: "#FEFCF5" }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span
            className="inline-block text-xs sm:text-sm font-bold px-5 py-2 rounded-full uppercase tracking-widest shadow-md mb-4"
            style={GOLD_BUTTON_STYLE}
          >
            IdeaToPlan
          </span>
          <h2
            className="text-4xl md:text-5xl font-serif font-bold mb-4"
            style={{ color: "#0D1117" }}
          >
            Turn Your Business Idea Into an Actionable Plan in 72 Hours
          </h2>
          <p
            className="text-base font-medium mb-4 max-w-2xl mx-auto"
            style={{ color: "#8B6914" }}
          >
            A done-for-you business planning service built for founders who are ready to
            move. Fast turnaround. Real plans. No fluff.
          </p>
          <p className="text-xl text-gray-700 mb-6 max-w-3xl mx-auto leading-relaxed">
            You already know what you want to build. Now let&apos;s make sure you land right.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {processSteps.map((step, index) => (
            <div key={index} className="text-center">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
                style={{ background: "#FBF6E4", color: "#8B6914" }}
              >
                <step.icon className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
              <p className="text-gray-600">{step.description}</p>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {/* Starter */}
            <div className="border-2 border-gray-200 rounded-2xl p-6 bg-white shadow-sm flex flex-col">
              <h3 className="text-xl font-bold text-gray-900 mb-1">Starter</h3>
              <p className="font-bold text-2xl mb-1" style={{ color: "#8B6914" }}>
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
                    <span className="font-bold mt-0.5" style={{ color: "#8B6914" }}>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Growth — Most Popular */}
            <div
              className="border-2 rounded-2xl p-6 shadow-lg flex flex-col relative"
              style={{ borderColor: "#C9A030", background: "#FBF6E4" }}
            >
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full"
                style={GOLD_BUTTON_STYLE}
              >
                Most Popular
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Growth</h3>
              <p className="font-bold text-2xl mb-1" style={{ color: "#8B6914" }}>
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
                    <span className="font-bold mt-0.5" style={{ color: "#8B6914" }}>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Visa / Immigration */}
            <div className="border-2 border-dashed border-gray-300 rounded-2xl p-6 bg-gray-50/80 shadow-sm flex flex-col relative opacity-95">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-100 text-amber-900 text-xs font-bold px-4 py-1 rounded-full border border-amber-200">
                Coming soon
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Visa / Immigration</h3>
              <p className="text-gray-500 font-bold text-2xl mb-1">$599</p>
              <p className="text-sm text-gray-500 mb-4">
                For founders who need USCIS- and investor-ready structure and compliance
                language.
              </p>
              <ul className="space-y-2 text-sm text-gray-600 flex-1">
                {[
                  "Everything in Growth",
                  "Visa-ready formatting and structure",
                  "5-year financial projections",
                  "Job creation and non-marginality language",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-gray-400 font-bold mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="text-center mb-6">
            <div className="inline-block bg-amber-50 border border-amber-300 rounded-xl px-6 py-3">
              <p className="text-amber-800 font-semibold text-sm">
                Special introductory offer — plans start at $25. Delivered within
                72 hours, and we walk you through it together.
              </p>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  planType:
                    prev.planType === "Visa / Immigration" ? "Starter" : prev.planType,
                  planGoal: prev.planGoal === "visa" ? "" : prev.planGoal,
                }));
                setShowForm(true);
              }}
              className="px-10 py-4 text-lg font-semibold rounded-lg transition-all transform hover:scale-105 shadow-lg hover:brightness-105"
              style={GOLD_BUTTON_STYLE}
            >
              Share Your Idea
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "#EBD9A0" }}
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
                    We&apos;ve got your idea!
                  </h3>
                  <p className="text-gray-600 mb-2">
                    Expect a message within 48 hours. We&apos;ll build your plan, walk you
                    through it, and go from there.
                  </p>
                  <p className="text-gray-500 text-sm">
                    Check your inbox — and spam, just in case.
                  </p>
                  <button
                    onClick={closeForm}
                    className="mt-6 px-8 py-3 font-semibold rounded-lg transition-all hover:brightness-105"
                    style={GOLD_BUTTON_STYLE}
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
                          placeholder="City, State — or Online/Location-independent"
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
                          placeholder="e.g. $150,000 — leave blank if pre-revenue"
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
                          placeholder="e.g. 5 years — leave blank if new"
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
                          <option value="visa" disabled>Visa application</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>

                    {form.planGoal === "bank-loan" && (
                      <div
                        className="space-y-4 rounded-xl p-4"
                        style={{
                          border: "1px solid #EBD9A0",
                          background: "#FBF6E4",
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
                          border: "1px solid #EBD9A0",
                          background: "#FBF6E4",
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

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Plan type <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-gray-500 mb-3">
                        Delivered within 72 hours. Expedited 48-hour delivery is available.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {PLAN_OPTIONS.map((opt) =>
                          opt.comingSoon ? (
                            <div
                              key={opt.value}
                              className="flex flex-col border-2 border-dashed border-gray-300 rounded-xl p-4 text-left h-full bg-gray-50 cursor-not-allowed opacity-90"
                              aria-disabled="true"
                            >
                              <span className="self-start text-[10px] font-bold uppercase tracking-wide text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200 mb-2">
                                Coming soon
                              </span>
                              <span className="font-bold text-gray-800 text-sm leading-tight">
                                {opt.title}
                              </span>
                              <span className="text-gray-500 font-bold text-lg mt-1">
                                {opt.price}
                              </span>
                              <p className="text-xs text-gray-500 mt-2 leading-relaxed flex-1">
                                {opt.description}
                              </p>
                            </div>
                          ) : (
                            <label
                              key={opt.value}
                              className={`flex flex-col cursor-pointer border-2 rounded-xl p-4 text-left transition-all h-full ${
                                form.planType === opt.value
                                  ? "ring-1"
                                  : "border-gray-200 bg-white"
                              }`}
                              style={
                                form.planType === opt.value
                                  ? {
                                      borderColor: "#C9A030",
                                      background: "#FBF6E4",
                                      boxShadow: "0 0 0 1px rgba(201,160,48,0.3)",
                                    }
                                  : undefined
                              }
                            >
                              <input
                                type="radio"
                                name="planType"
                                value={opt.value}
                                checked={form.planType === opt.value}
                                onChange={handleChange}
                                className="sr-only"
                              />
                              <span className="font-bold text-gray-900 text-sm leading-tight">
                                {opt.title}
                              </span>
                              <span
                                className="font-bold text-lg mt-1"
                                style={{ color: "#8B6914" }}
                              >
                                {opt.price}
                              </span>
                              <p className="text-xs text-gray-600 mt-2 leading-relaxed flex-1">
                                {opt.description}
                              </p>
                            </label>
                          )
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="w-full py-4 text-lg font-semibold rounded-lg transition-all shadow-md flex items-center justify-center gap-2 hover:brightness-105 disabled:opacity-50"
                      style={GOLD_BUTTON_STYLE}
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
                      We&apos;ll be in touch within 48 hours to review your
                      plan together.
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
