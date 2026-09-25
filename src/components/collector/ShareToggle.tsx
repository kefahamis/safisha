"use client";

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
      Share my location
    </label>
  );
}
