"use client";

import { Check, LoaderCircle, X } from "lucide-react";

/**
 * An on/off switch: a pill track and a raised thumb that springs across, with
 * a check or a cross inside so the state reads without colour. A real
 * `role="switch"` button, so Space and Enter work and screen readers say
 * "on" or "off".
 */
export function Toggle({
  checked,
  onChange,
  label,
  busy = false,
  disabled = false,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Read out by screen readers; not shown. */
  label: string;
  /** Saving: the thumb shows a spinner and clicks are ignored. */
  busy?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled}
      className={`toggle ${size}${checked ? " on" : ""}${busy ? " busy" : ""}`}
      onClick={() => !busy && onChange(!checked)}
    >
      <span className="toggle-thumb" aria-hidden="true">
        {busy ? (
          <LoaderCircle className="spin" strokeWidth={2.6} />
        ) : checked ? (
          <Check strokeWidth={3} />
        ) : (
          <X strokeWidth={3} />
        )}
      </span>
    </button>
  );
}
