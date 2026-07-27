"use client";

import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const GOLD_BUTTON_STYLE = {
  color: "#2D1A00",
  border: "1.5px solid #7A5C0A",
} as const;

export default function VisaWaitlistModal({ isOpen, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          formId: "visa",
          ...(country.trim() ? { country: country.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error("Subscribe failed");
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative rounded-2xl shadow-xl p-8 w-full max-w-md"
        style={{ background: "var(--i2p-cream)", border: "1px solid var(--i2p-cream-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 font-sans text-lg leading-none"
          style={{ color: "var(--i2p-ink-dim)" }}
        >
          &#x2715;
        </button>

        {submitted ? (
          <div className="text-center py-4">
            <p className="text-xl font-bold mb-3" style={{ color: "var(--i2p-ink)" }}>
              You are on the list.
            </p>
            <p className="text-sm" style={{ color: "var(--i2p-ink-body)" }}>
              You will be the first to know when the Visa plan is ready.
            </p>
          </div>
        ) : (
          <>
            <h2 className="font-serif text-2xl font-bold mb-2" style={{ color: "var(--i2p-ink)" }}>
              Visa / Immigration Plan
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--i2p-ink-body)" }}>
              Join the waitlist and be first to know when this plan is available.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: "var(--i2p-ink)" }}
                >
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A030]"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  style={{ color: "var(--i2p-ink)" }}
                >
                  Which country are you targeting?{" "}
                  <span className="font-normal" style={{ color: "var(--i2p-ink-dim)" }}>
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. USA, Canada, UK"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A030]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="gold-gradient w-full py-3 font-semibold rounded-lg disabled:opacity-60"
                style={GOLD_BUTTON_STYLE}
              >
                {loading ? "Adding..." : "Notify Me When Available"}
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
            <p className="text-xs mt-4" style={{ color: "var(--i2p-ink-dim)" }}>
              We will only email you about the Visa plan.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
