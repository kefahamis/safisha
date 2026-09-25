"use client";

import { Radio, RadioTower } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import type { Truck } from "@/lib/types";
import { useActions } from "@/store/StoreProvider";

/** Drivers can pause GPS sharing; the office and clients see the status change. */
export function ShareToggle({ truck }: { truck: Truck }) {
  const actions = useActions();
  const toast = useToast();

  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={truck.sharing && truck.status !== "offline"}
        onChange={(e) => {
          actions.setSharing(truck.id, e.target.checked);
          toast(e.target.checked ? "Location sharing on" : "Location sharing paused");
        }}
      />
      <span className="with-ico">
        {truck.sharing && truck.status !== "offline" ? (
          <Radio size={16} strokeWidth={2.2} className="live" aria-hidden="true" />
        ) : (
          <RadioTower size={16} strokeWidth={2.2} aria-hidden="true" />
        )}
        Share my location
      </span>
    </label>
  );
}
