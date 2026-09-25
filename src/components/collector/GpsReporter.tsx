"use client";

import { Satellite } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Truck } from "@/lib/types";
import { useActions } from "@/store/StoreProvider";

const KEY = "zoa.gps";
const EVERY_MS = 15_000;

/**
 * Opt-in: report this phone's real position for the truck. Off by default so a
 * laptop opening the collector screen doesn't move the truck to an office.
 * While it's off (or the phone stops reporting), the map uses the route simulation.
 */
export function GpsReporter({ truck }: { truck: Truck }) {
  const actions = useActions();
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState("");
  const last = useRef(0);

  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(KEY) === "1");
    } catch {
      /* storage unavailable: stays off */
    }
  }, []);

  useEffect(() => {
    if (!on || !truck.sharing) return;
    if (!("geolocation" in navigator)) {
      setStatus("This device has no GPS.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        if (now - last.current < EVERY_MS) return;
        last.current = now;
        void actions.gpsPing(truck.id, p.coords.latitude, p.coords.longitude);
        setStatus(`Last fix ±${Math.round(p.coords.accuracy)} m at ${new Date().toLocaleTimeString()}`);
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "Location permission was refused." : "Waiting for a GPS fix…"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on, truck.sharing, truck.id, actions]);

  const toggle = (next: boolean) => {
    setOn(next);
    setStatus(next ? "Waiting for a GPS fix…" : "");
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* not persisted; fine for this visit */
    }
  };

  return (
    <div className="gps">
      <label className="switch">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
        <span className="with-ico">
          <Satellite size={16} strokeWidth={2.2} aria-hidden="true" />
          Use this phone’s GPS
        </span>
      </label>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        {on
          ? truck.sharing
            ? status
            : "Turn on location sharing to send your position."
          : "Off: the map shows your truck moving along its planned route."}
      </p>
    </div>
  );
}
