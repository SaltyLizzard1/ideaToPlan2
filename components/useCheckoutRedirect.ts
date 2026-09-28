"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SAFETY_MS = 8000;

/**
 * Sends the buyer to a Stripe Payment Link and keeps the button honest if they
 * come back.
 *
 * Pressing Back from Stripe restores this page from the back/forward cache,
 * which means React state is restored exactly as it was, so a button left on
 * "Redirecting..." stays stuck there forever. bfcache restores fire pageshow
 * with persisted true and do not re-run effects, so pageshow is the event that
 * matters. visibilitychange covers the case where the tab is returned to
 * without a bfcache restore, and the timeout covers a navigation that never
 * happens at all.
 */
export function useCheckoutRedirect() {
  const [redirecting, setRedirecting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    setRedirecting(false);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    const onPageShow = () => stop();
    const onVisibility = () => {
      if (document.visibilityState === "visible") stop();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [stop]);

  const startRedirect = useCallback((url: string) => {
    setRedirecting(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRedirecting(false), SAFETY_MS);
    window.location.href = url;
  }, []);

  return { redirecting, startRedirect };
}
