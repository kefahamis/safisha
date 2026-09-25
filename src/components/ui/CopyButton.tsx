"use client";

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

  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => toast(`Copied ${value}`))
      .catch(() => toast(value));
  };

  return (
    <button type="button" className={className} onClick={copy}>
      {label}
    </button>
  );
}
