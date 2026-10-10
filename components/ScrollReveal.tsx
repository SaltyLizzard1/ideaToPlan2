"use client";

import { useRef, useEffect, ReactNode } from "react";

export default function ScrollReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip animation when the user has requested reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // A section that already starts inside the first screen is left as it is. Hiding it would
    // leave an empty band under the content above until the visitor scrolls, because the fade
    // only starts once 15% of the section is in view and a tall section can show less than that.
    // Sections that start below the screen still fade in as they arrive.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    // Apply hidden state only on the client, after hydration, to avoid SSR FOUC.
    //
    // Careful: .scroll-reveal sets a transform, and a transformed element is
    // the containing block for any position: fixed descendant. Anything inside
    // a wrapped section that needs to cover the screen has to be portalled out
    // to document.body, or it will be positioned against the section instead.
    // See components/Portal.tsx.
    el.classList.add("scroll-reveal");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref}>{children}</div>;
}
