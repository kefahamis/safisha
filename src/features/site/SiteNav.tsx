"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PlatformIdentity } from "@/components/layout/PlatformBrand";

const LINKS = [
  { href: "#services", label: "Services" },
  { href: "#how", label: "How it works" },
  { href: "#coverage", label: "Coverage" },
  { href: "#companies", label: "Companies" },
  { href: "#contact", label: "Contact" },
];

/**
 * The floating pill bar over the hero. It tucks into a solid bar once the page
 * scrolls, and folds its links behind a menu button on phones.
 */
export function SiteNav({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={`s-nav-wrap${scrolled ? " scrolled" : ""}`}>
      <nav className={`s-nav${open ? " open" : ""}`} aria-label="Main">
        <Link href="/" className="s-brand" aria-label="Home">
          <PlatformIdentity markSize={36} />
        </Link>
        <ul className="s-links" id="s-links">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            </li>
          ))}
          <li className="s-links-cta">
            <Link href={signedIn ? "/start" : "/login"} className="s-btn">
              {signedIn ? "Open dashboard" : "Sign in"}
              <span className="s-btn-chip" aria-hidden="true">
                <ArrowUpRight size={15} strokeWidth={2.4} />
              </span>
            </Link>
          </li>
        </ul>
        <Link href={signedIn ? "/start" : "/login"} className="s-btn s-nav-cta">
          {signedIn ? "Open dashboard" : "Sign in"}
          <span className="s-btn-chip" aria-hidden="true">
            <ArrowUpRight size={15} strokeWidth={2.4} />
          </span>
        </Link>
        <button
          type="button"
          className="s-menu"
          aria-expanded={open}
          aria-controls="s-links"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={20} strokeWidth={2.2} /> : <Menu size={20} strokeWidth={2.2} />}
        </button>
      </nav>
    </header>
  );
}
