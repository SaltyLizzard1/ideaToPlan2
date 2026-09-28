"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into document.body.
 *
 * position: fixed is only relative to the viewport when no ancestor has a
 * transform, filter, backdrop-filter, perspective, contain or will-change.
 * Any of those makes that ancestor the containing block instead. ScrollReveal
 * sets transform: translateY(...) on the wrapper around whole sections, so an
 * overlay rendered inside one lands inside that section rather than over the
 * screen. Portalling to body takes the overlay out of reach of that entirely,
 * whatever gets wrapped in future.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
