"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * A camera-first photo picker. On phones it opens the rear camera; elsewhere
 * it's a normal file picker. Hands back the Blob; the caller uploads it.
 */
export function PhotoInput({
  value,
  onChange,
  label = "Add a photo",
}: {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
  label?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  if (url) {
    return (
      <div className="photo-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Selected photo" />
        <button type="button" className="btn small ghost icon-only" onClick={() => onChange(null)} aria-label="Remove photo">
          <X size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <label className="photo-input">
      <Camera size={18} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

/** One-shot GPS read, resolving to null when unavailable or refused. */
export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
