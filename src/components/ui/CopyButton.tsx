"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "./ToastProvider";

export function CopyButton({
  value,
  label = "Copy",
  className = "btn small",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        toast(`Copied ${value}`);
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => toast(value));
  };

  const Icon = copied ? Check : Copy;

  return (
    <button type="button" className={className} onClick={copy}>
      <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
      {label}
    </button>
  );
}
