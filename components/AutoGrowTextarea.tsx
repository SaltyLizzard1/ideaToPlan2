"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * A textarea that is always exactly as tall as its content.
 *
 * The intake form is mostly pre-filled with prose written for the buyer, and
 * they cannot judge or edit what they cannot see. There is deliberately no
 * maximum height: a cap would put a scrollbar inside a field that already sits
 * inside the overlay's scroller, and a scroll region inside a scroll region is
 * what made the old fixed-height boxes feel broken. The panel scrolls, the
 * fields do not.
 *
 * The rows attribute still sets the floor, so an empty field keeps the height
 * it had before.
 */
export default function AutoGrowTextarea({ className, style, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // measure the content height, then the rows-based height, and take the
    // larger of the two so a short value never shrinks the field below its
    // original size
    el.style.height = "auto";
    const contentHeight = el.scrollHeight;
    el.style.height = "";
    const rowsHeight = el.clientHeight;
    el.style.height = `${Math.max(contentHeight, rowsHeight)}px`;
  }, []);

  // The pre-filled value arrives after mount, and a rotate or resize changes
  // how many lines the same text needs.
  useLayoutEffect(grow, [grow, rest.value]);

  useEffect(() => {
    window.addEventListener("resize", grow);
    return () => window.removeEventListener("resize", grow);
  }, [grow]);

  return (
    <textarea
      {...rest}
      ref={ref}
      className={className}
      style={{ overflow: "hidden", ...style }}
      onInput={grow}
    />
  );
}
