"use client";

import { useEffect } from "react";

// The sticky header's height is set by --header-h in globals.css, so it is measured, not assumed.
const headerHeight = () => document.querySelector("header")?.getBoundingClientRect().height ?? 80;

// Where the element sits in the page layout, ignoring transforms. A section that has not been
// scrolled to yet is still shifted down by its fade-in (.scroll-reveal translates it 20px), and
// getBoundingClientRect reports that shifted position, so a scroll aimed at it lands 20px high
// once the fade finishes. offsetTop is the layout position and is not affected by the transform.
function layoutTop(el: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    top += node.offsetTop;
  }
  return top;
}

function scrollToId(id: string) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const top = layoutTop(el) - headerHeight();
      window.scrollTo({ top, behavior: "smooth" });
    });
  });
}

export default function ScrollManager() {
  useEffect(() => {
    function getInPageId(href: string): string | null {
      if (href.startsWith("#")) return href.slice(1) || null;
      try {
        const url = new URL(href, location.origin);
        if (url.pathname === location.pathname && url.hash) {
          return url.hash.slice(1) || null;
        }
      } catch {}
      return null;
    }

    function handleClick(e: MouseEvent) {
      const anchor = (e.target as Element).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      const id = getInPageId(href);
      if (!id) return;
      e.preventDefault();
      history.pushState(null, "", "#" + id);
      scrollToId(id);
    }

    function handleHashChange() {
      const id = location.hash.slice(1);
      if (id) scrollToId(id);
    }

    document.addEventListener("click", handleClick, { capture: true });
    window.addEventListener("hashchange", handleHashChange);

    if (location.hash) {
      const id = location.hash.slice(1);
      if (document.readyState === "complete") {
        scrollToId(id);
      } else {
        window.addEventListener("load", () => scrollToId(id), { once: true });
      }
    }

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return null;
}
