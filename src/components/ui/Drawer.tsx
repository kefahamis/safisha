"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * A panel that slides in from the right over a dimmed page; full width on
 * phones. Escape or a tap on the dimmed page closes it. The body scrolls, the
 * header and footer stay put.
 */
export function Drawer({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // The page behind shouldn't scroll along with the drawer.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>(".drawer-body :is(input, select, textarea, button)")?.focus();
  }, []);

  return (
    <div className="drawer-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <header className="drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="hint">{subtitle}</p> : null}
          </div>
          <button type="button" className="btn small ghost icon-only" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
