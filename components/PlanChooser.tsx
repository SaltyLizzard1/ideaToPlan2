"use client";

import { useCallback, useEffect } from "react";
import { Loader, X } from "lucide-react";
import Portal from "@/components/Portal";
import { PLANS, type PlanName } from "@/lib/plans";
import { getStripeLink, createClientReferenceId, appendPaymentParams } from "@/lib/stripe";
import { useCheckoutRedirect } from "@/components/useCheckoutRedirect";

interface PlanChooserProps {
  open: boolean;
  matchTitle: string;
  resultId: string;
  matchIndex: number;
  userEmail?: string;
  onClose: () => void;
}

function track(event: string, params: Record<string, unknown>) {
  try {
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag === "function") gtag("event", event, params);
  } catch (err) {
    console.error(`[GA4] ${event} failed:`, err);
  }
}

export default function PlanChooser({
  open,
  matchTitle,
  resultId,
  matchIndex,
  userEmail,
  onClose,
}: PlanChooserProps) {
  const { redirecting, startRedirect } = useCheckoutRedirect();

  useEffect(() => {
    if (!open) return;
    track("plan_cta_click", { match_title: matchTitle, match_index: matchIndex });
  }, [open, matchTitle, matchIndex]);

  // The overlay owns the screen while it is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const choose = useCallback(
    (plan: PlanName) => {
      const clientRefId = createClientReferenceId(resultId, matchIndex);
      if (!clientRefId) {
        console.error("Failed to create client_reference_id");
        return;
      }
      track("begin_checkout", {
        tier: plan,
        match_title: matchTitle,
        match_index: matchIndex,
        value: plan === "Growth" ? 50 : 25,
        currency: "USD",
      });
      const link = appendPaymentParams(getStripeLink(plan), clientRefId, userEmail);
      startRedirect(link);
    },
    [resultId, matchIndex, matchTitle, userEmail, startRedirect]
  );

  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-s4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a plan for ${matchTitle}`}
      >
        <div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
          style={{ maxHeight: "calc(100dvh - 2 * var(--spacing-s4))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-start justify-between gap-s4 px-s5 py-s4 border-b shrink-0"
            style={{ borderColor: "#E8E4DB" }}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8A8270" }}>
                Your plan for
              </p>
              <h3 className="text-lg font-bold" style={{ color: "#0D1117" }}>
                {matchTitle}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-s2 rounded-full hover:bg-gray-100 transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 card-pad" style={{ overflowAnchor: "none" }}>
            <div className="grid md:grid-cols-2 grid-gap">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className="rounded-2xl card-pad flex flex-col border border-[#E8E4DB] bg-white shadow-sm"
                >
                  <h4 className="text-xl font-bold text-gray-900 mb-s1">{plan.name}</h4>
                  <p className="font-bold text-2xl mb-s1" style={{ color: "#0D1117" }}>
                    {plan.price}
                  </p>
                  <p className="text-sm text-gray-500 mb-s4">{plan.tagline}</p>

                  <ul className="space-y-s2 text-sm text-gray-700 flex-1 mb-s4">
                    {plan.features.map((item, i) => (
                      <li key={i} className="flex items-start gap-s2">
                        <span className="font-bold mt-0.5" style={{ color: "#0D1117" }}>
                          ✓
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>

                  {/* Below 768 the buttons live in the footer instead, so both
                      tiers can be chosen without scrolling. */}
                  <button
                    onClick={() => choose(plan.name)}
                    disabled={redirecting}
                    className="w-full py-s3 text-sm font-semibold rounded-lg hidden md:flex items-center justify-center gap-s2 disabled:opacity-60"
                    style={{ color: "#2D1A00", border: "1.5px solid #7A5C0A", backgroundColor: "#F5E070" }}
                  >
                    {redirecting ? (
                      <>
                        <Loader className="w-3 h-3 animate-spin" />
                        Redirecting...
                      </>
                    ) : (
                      <>
                        Choose {plan.name} · {plan.price}
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Both tiers reachable without scrolling on a phone */}
          <div
            className="md:hidden shrink-0 border-t px-s4 py-s3 flex flex-col gap-s2"
            style={{ borderColor: "#E8E4DB", background: "#FFFFFF" }}
          >
            {PLANS.map((plan) => (
              <button
                key={plan.name}
                onClick={() => choose(plan.name)}
                disabled={redirecting}
                className="w-full py-s3 text-sm font-semibold rounded-lg flex items-center justify-center gap-s2 disabled:opacity-60"
                style={{ color: "#2D1A00", border: "1.5px solid #7A5C0A", backgroundColor: "#F5E070" }}
              >
                {redirecting ? (
                  <>
                    <Loader className="w-3 h-3 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    Choose {plan.name} · {plan.price}
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}
