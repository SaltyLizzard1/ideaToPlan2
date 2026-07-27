"use client";

import { useEffect } from "react";

const HEADER_HEIGHT = 80;

function scrollToId(id: string) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT;
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
